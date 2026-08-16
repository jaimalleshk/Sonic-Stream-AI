import os
import sys
import json
import traceback
from azure.storage.blob import BlobServiceClient

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_PATH = os.path.join(BASE_DIR, "history.json")
KEYS_PATH = os.path.join(BASE_DIR, "keys.json")
AI_WORKSPACE_DIR = os.path.join(BASE_DIR, "ai_workspace")

MAX_BLOB_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB max rule

def is_gita_file(filename: str) -> bool:
    """Returns True if the file is a Gita audio file (exempt from 200MB limit)."""
    return "gita" in filename.lower()

def trim_audio_if_exceeds_max(local_path: str, workspace_dir: str = AI_WORKSPACE_DIR, max_bytes: int = MAX_BLOB_SIZE_BYTES) -> tuple[str, bool]:
    """
    If local_path file size exceeds max_bytes (200MB), clips the audio file to fit under max_bytes.
    Returns (path_to_upload, was_trimmed).
    """
    if not os.path.exists(local_path):
        return local_path, False
    file_size = os.path.getsize(local_path)
    if file_size <= max_bytes:
        return local_path, False

    filename = os.path.basename(local_path)
    trimmed_dir = os.path.join(workspace_dir, "trimmed_uploads")
    os.makedirs(trimmed_dir, exist_ok=True)
    trimmed_path = os.path.join(trimmed_dir, filename)

    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(local_path)
        ratio = float(max_bytes) / float(file_size)
        target_duration_ms = int(len(audio) * ratio * 0.97)  # 3% safety margin
        trimmed_audio = audio[:target_duration_ms]

        ext = os.path.splitext(filename)[1].lower().replace(".", "")
        if ext in ["m4a", "aac"]:
            fmt = "ipod"
        elif ext in ["mp3", "wav", "ogg", "flac", "webm"]:
            fmt = ext
        else:
            fmt = "mp3"

        trimmed_audio.export(trimmed_path, format=fmt)

        if os.path.exists(trimmed_path) and os.path.getsize(trimmed_path) > max_bytes:
            ratio2 = float(max_bytes) / float(os.path.getsize(trimmed_path))
            trimmed_audio = trimmed_audio[:int(len(trimmed_audio) * ratio2 * 0.95)]
            trimmed_audio.export(trimmed_path, format=fmt)

        if os.path.exists(trimmed_path) and os.path.getsize(trimmed_path) > 0:
            print(f"[Azure Sync] ✂️ Trimmed '{filename}' ({file_size/(1024*1024):.1f}MB -> {os.path.getsize(trimmed_path)/(1024*1024):.1f}MB)")
            return trimmed_path, True
    except Exception as e:
        print(f"[Azure Sync] Warning: pydub trim failed ({e}), attempting ffmpeg stream clip...")
        try:
            import subprocess
            cmd = ["ffmpeg", "-y", "-i", local_path, "-fs", str(max_bytes - 1000000), "-c", "copy", trimmed_path]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            if os.path.exists(trimmed_path) and os.path.getsize(trimmed_path) > 0:
                print(f"[Azure Sync] ✂️ FFmpeg trimmed '{filename}' to {os.path.getsize(trimmed_path)/(1024*1024):.1f}MB")
                return trimmed_path, True
        except Exception as fe:
            print(f"[Azure Sync] FFmpeg trim failed: {fe}")

    return local_path, False

def load_keys():
    if not os.path.exists(KEYS_PATH):
        return None
    with open(KEYS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def run_sync(download_dir, progress_callback=None, keep_full=False):
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

        # List all existing blobs and store their sizes
        existing_blobs = {}  # blob_name -> size in bytes
        if progress_callback: progress_callback(0, 0, "Checking remote files...", False)
        for b in container_client.list_blobs():
            existing_blobs[b.name] = b.size or 0

        # 1. Sync Media Files (trimming non-Gita files > 200MB unless keep_full is True)
        files_to_upload = []
        if os.path.exists(download_dir):
            for f in os.listdir(download_dir):
                if f.lower().endswith(('.mp3', '.mp4', '.mkv', '.webm', '.m4a')):
                    local_p = os.path.join(download_dir, f)
                    exempt = is_gita_file(f)
                    
                    if f not in existing_blobs:
                        files_to_upload.append(f)
                    elif (existing_blobs[f] > MAX_BLOB_SIZE_BYTES) and (not keep_full) and (not exempt):
                        print(f"[Azure Sync] Blob '{f}' in Azure is {existing_blobs[f]/(1024*1024):.1f}MB > 200MB. Re-uploading trimmed version...")
                        files_to_upload.append(f)

        total_files = len(files_to_upload)
        failed = []
        for idx, f in enumerate(files_to_upload):
            local_path = os.path.join(download_dir, f)
            blob_client = container_client.get_blob_client(f)
            
            exempt = is_gita_file(f)
            upload_path = local_path
            was_trimmed = False
            
            if not keep_full and not exempt:
                upload_path, was_trimmed = trim_audio_if_exceeds_max(local_path, AI_WORKSPACE_DIR, MAX_BLOB_SIZE_BYTES)
            
            status_msg = f"Uploading {f} (trimmed to <200MB)" if was_trimmed else f"Uploading {f}"
            if progress_callback: progress_callback(idx, total_files, status_msg, False)
            print(f"[Azure Sync] Uploading media file: {f} ({os.path.getsize(upload_path)/(1024*1024):.1f} MB)")
            
            try:
                with open(upload_path, "rb") as data:
                    blob_client.upload_blob(data, overwrite=True)
                if was_trimmed and upload_path != local_path and os.path.exists(upload_path):
                    try: os.remove(upload_path)
                    except Exception: pass
            except Exception as fe:
                print(f"[Azure Sync] FAILED {f}: {fe}")
                failed.append(f)

        # 2. Regenerate and upload the PWA manifest.
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
    import argparse
    parser = argparse.ArgumentParser(description="Sync media files to Azure Blob Storage")
    parser.add_argument("download_dir", nargs="?", default="", help="Directory containing media files")
    parser.add_argument("--keep-full", action="store_true", help="Keep full files > 200MB without trimming")
    args = parser.parse_args()
    
    if args.download_dir:
        run_sync(args.download_dir, keep_full=args.keep_full)
    else:
        print("[Azure Sync Error] Download directory not provided.")
