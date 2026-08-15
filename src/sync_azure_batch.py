import os
import sys
import json
import traceback
from azure.storage.blob import BlobServiceClient

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_PATH = os.path.join(BASE_DIR, "history.json")
KEYS_PATH = os.path.join(BASE_DIR, "keys.json")

def load_keys():
    if not os.path.exists(KEYS_PATH):
        return None
    with open(KEYS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def run_sync(download_dir, progress_callback=None):
    keys = load_keys()
    if not keys:
        print("[Azure Sync] keys.json not found. Cannot sync.")
        if progress_callback: progress_callback(0, 0, "", True, "keys.json not found")
        return

    account_name = keys.get("azure_storage_account")
    sas_token = keys.get("azure_sas_token", "")
    account_key = keys.get("azure_account_key")
    container_name = keys.get("azure_container")

    if not account_name or not container_name:
        print("[Azure Sync] Missing azure credentials in keys.json.")
        if progress_callback: progress_callback(0, 0, "", True, "Missing credentials")
        return

    account_url = f"https://{account_name}.blob.core.windows.net"

    try:
        if account_key:
            conn_str = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
            blob_service_client = BlobServiceClient.from_connection_string(conn_str)
        else:
            if sas_token.startswith("?"):
                sas_token = sas_token[1:]
            blob_service_client = BlobServiceClient(account_url=account_url, credential=sas_token)
            
        container_client = blob_service_client.get_container_client(container_name)
        if not container_client.exists():
            container_client.create_container()
            print(f"[Azure Sync] Created container: {container_name}")

        # List all existing blobs for fast check
        existing_blobs = set()
        if progress_callback: progress_callback(0, 0, "Checking remote files...", False)
        for b in container_client.list_blobs():
            existing_blobs.add(b.name)

        # 1. Sync Media Files
        files_to_upload = []
        if os.path.exists(download_dir):
            for f in os.listdir(download_dir):
                if f.lower().endswith(('.mp3', '.mp4', '.mkv', '.webm', '.m4a')):
                    if f not in existing_blobs:
                        files_to_upload.append(f)

        total_files = len(files_to_upload)
        failed = []
        for idx, f in enumerate(files_to_upload):
            local_path = os.path.join(download_dir, f)
            blob_client = container_client.get_blob_client(f)
            if progress_callback: progress_callback(idx, total_files, f, False)
            print(f"[Azure Sync] Uploading media file: {f}")
            try:
                # overwrite=True: without it, a blob that exists remotely but was
                # missed by the skip set raises ResourceExistsError and aborted the
                # ENTIRE run. Per-file errors must not kill the whole sync.
                with open(local_path, "rb") as data:
                    blob_client.upload_blob(data, overwrite=True)
            except Exception as fe:
                print(f"[Azure Sync] FAILED {f}: {fe}")
                failed.append(f)

        # 2. Regenerate and upload the PWA manifest.
        #
        # This must be the manifest produced by deploy_pwa.generate_pwa_manifest(),
        # NOT raw history.json. They are different schemas: history.json is a list of
        # download jobs, while the PWA needs {playlists:[{tracks:[{file,...}]}]} with
        # the REAL on-disk/blob filenames resolved (yt-dlp rewrites illegal chars,
        # e.g. "|" -> fullwidth "｜", and truncates long names). Uploading raw history
        # here previously would have corrupted the PWA library rather than updating it.
        if progress_callback:
            progress_callback(total_files, total_files, "Building playlist manifest...", False)
        manifest_path = os.path.join(BASE_DIR, "web-pwa", "playlists_manifest.json")
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import deploy_pwa
            deploy_pwa.generate_pwa_manifest()
        except Exception as me:
            print(f"[Azure Sync] Manifest generation failed: {me}")

        if os.path.exists(manifest_path):
            if progress_callback:
                progress_callback(total_files, total_files, "Uploading playlists_manifest.json...", False)
            print("[Azure Sync] Uploading playlists_manifest.json...")
            with open(manifest_path, "rb") as data:
                container_client.get_blob_client("playlists_manifest.json").upload_blob(data, overwrite=True)
        else:
            print("[Azure Sync] WARNING: manifest not found; PWA library not updated.")

        if failed:
            msg = f"{len(failed)} file(s) failed to upload (first: {failed[0]})"
            print(f"[Azure Sync] Completed with errors: {msg}")
            if progress_callback: progress_callback(total_files, total_files, "Done", True, msg)
            return

        print("[Azure Sync] Batch sync completed successfully.")
        if progress_callback: progress_callback(total_files, total_files, "Done", True)

    except Exception as e:
        print(f"[Azure Sync Error] {e}")
        traceback.print_exc()
        if progress_callback: progress_callback(0, 0, "", True, str(e))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_sync(sys.argv[1])
    else:
        print("[Azure Sync Error] Download directory not provided.")
