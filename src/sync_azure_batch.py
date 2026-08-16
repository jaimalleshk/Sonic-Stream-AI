import os
import sys
import json
import traceback
import subprocess
from azure.storage.blob import BlobServiceClient

# 1. Permanently patch subprocess.Popen to prevent any console window popup on Windows
if os.name == 'nt':
    _original_popen = subprocess.Popen
    def _patched_popen(*args, **kwargs):
        if 'creationflags' not in kwargs:
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        return _original_popen(*args, **kwargs)
    subprocess.Popen = _patched_popen

# 2. Force stdout & stderr encoding to UTF-8 on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def safe_print(*args, **kwargs):
    """Prints output safely without throwing Windows cp1252 charmap encoding errors."""
    try:
        print(*args, **kwargs)
    except Exception:
        try:
            cleaned = [str(a).encode("ascii", errors="replace").decode("ascii") for a in args]
            print(*cleaned, **kwargs)
        except Exception:
            pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_PATH = os.path.join(BASE_DIR, "history.json")
KEYS_PATH = os.path.join(BASE_DIR, "keys.json")
AI_WORKSPACE_DIR = os.path.join(BASE_DIR, "ai_workspace")

MAX_BLOB_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB max rule

def is_gita_file(filename: str) -> bool:
    """Returns True if the file is a Gita audio file (exempt from 200MB limit)."""
    return "gita" in filename.lower()

def get_audio_duration_seconds(local_path: str) -> float:
    """Gets exact duration of media file using ffprobe with no console window."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprintwrappers=1:nokey=1",
        local_path
    ]
    kwargs = {"stdout": subprocess.PIPE, "stderr": subprocess.PIPE}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    try:
        res = subprocess.run(cmd, text=True, **kwargs)
        if res.returncode == 0 and res.stdout.strip():
            return float(res.stdout.strip())
    except Exception:
        pass
    return 0.0

def trim_audio_if_exceeds_max(local_path: str, workspace_dir: str = AI_WORKSPACE_DIR, max_bytes: int = MAX_BLOB_SIZE_BYTES) -> tuple[str, bool]:
    """
    If local_path file size exceeds max_bytes (200MB), clips the audio/video file to fit strictly under max_bytes
    using ultra-fast FFmpeg stream copy with zero console window popups.
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

    # 1. Try fast FFmpeg stream copy based on calculated duration ratio
    duration = get_audio_duration_seconds(local_path)
    if duration > 0:
        ratio = float(max_bytes) / float(file_size)
        target_duration = duration * ratio * 0.96  # 4% safety margin
        
        cmd = [
            "ffmpeg", "-y", "-i", local_path,
            "-ss", "0", "-t", f"{target_duration:.2f}",
            "-c", "copy",
            trimmed_path
        ]
        kwargs = {"stdout": subprocess.PIPE, "stderr": subprocess.PIPE}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
            
        try:
            subprocess.run(cmd, check=True, **kwargs)
            if os.path.exists(trimmed_path) and 0 < os.path.getsize(trimmed_path) <= max_bytes:
                safe_print(f"[Azure Sync] ✂️ FFmpeg stream-copied '{filename}' ({file_size/(1024*1024):.1f}MB -> {os.path.getsize(trimmed_path)/(1024*1024):.1f}MB)")
                return trimmed_path, True
        except Exception as fe:
            safe_print(f"[Azure Sync] Warning: FFmpeg stream copy clip failed: {fe}")

        # 1b. Try FFmpeg re-encode fallback
        cmd_reencode = [
            "ffmpeg", "-y", "-i", local_path,
            "-ss", "0", "-t", f"{target_duration:.2f}",
            "-b:a", "192k",
            trimmed_path
        ]
        try:
            subprocess.run(cmd_reencode, check=True, **kwargs)
            if os.path.exists(trimmed_path) and 0 < os.path.getsize(trimmed_path) <= max_bytes:
                safe_print(f"[Azure Sync] ✂️ FFmpeg re-encoded '{filename}' ({file_size/(1024*1024):.1f}MB -> {os.path.getsize(trimmed_path)/(1024*1024):.1f}MB)")
                return trimmed_path, True
        except Exception as fe2:
            safe_print(f"[Azure Sync] Warning: FFmpeg re-encode clip failed: {fe2}")

    # 2. Fallback to pydub if stream copy failed or exceeded
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(local_path)
        ratio = float(max_bytes) / float(file_size)
        target_duration_ms = int(len(audio) * ratio * 0.95)
        trimmed_audio = audio[:target_duration_ms]

        ext = os.path.splitext(filename)[1].lower().replace(".", "")
        fmt = "ipod" if ext in ["m4a", "aac"] else (ext if ext in ["mp3", "wav", "ogg", "flac", "webm"] else "mp3")

        trimmed_audio.export(trimmed_path, format=fmt)

        if os.path.exists(trimmed_path) and os.path.getsize(trimmed_path) > max_bytes:
            ratio2 = float(max_bytes) / float(os.path.getsize(trimmed_path))
            trimmed_audio = trimmed_audio[:int(len(trimmed_audio) * ratio2 * 0.94)]
            trimmed_audio.export(trimmed_path, format=fmt)

        if os.path.exists(trimmed_path) and os.path.getsize(trimmed_path) > 0:
            safe_print(f"[Azure Sync] ✂️ Pydub trimmed '{filename}' ({file_size/(1024*1024):.1f}MB -> {os.path.getsize(trimmed_path)/(1024*1024):.1f}MB)")
            return trimmed_path, True
    except Exception as e:
        safe_print(f"[Azure Sync] Pydub fallback error: {e}")

    return local_path, False

def load_keys():
    if not os.path.exists(KEYS_PATH):
        return None
    with open(KEYS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def run_sync(download_dir, progress_callback=None, keep_full=False):
    keys = load_keys()
    if not keys:
        safe_print("[Azure Sync] keys.json not found. Cannot sync.")
        if progress_callback: progress_callback(0, 0, "", True, "keys.json not found")
        return

    account_name = keys.get("azure_storage_account")
    sas_token = keys.get("azure_sas_token", "")
    account_key = keys.get("azure_account_key")
    container_name = keys.get("azure_container")

    if not account_name or not container_name:
        safe_print("[Azure Sync] Missing azure credentials in keys.json.")
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
            safe_print(f"[Azure Sync] Created container: {container_name}")

        # List all existing blobs and store their sizes
        existing_blobs = {}  # blob_name -> size in bytes
        if progress_callback: progress_callback(0, 0, "Checking remote files...", False)
        for b in container_client.list_blobs():
            existing_blobs[b.name] = b.size or 0

        # Collect local media files from download_dir AND all history.json playlist directories
        dirs_to_check = set()
        if download_dir and os.path.exists(download_dir):
            dirs_to_check.add(os.path.abspath(download_dir))
        if os.path.exists(HISTORY_PATH):
            try:
                with open(HISTORY_PATH, "r", encoding="utf-8") as hf:
                    history_data = json.load(hf)
                    for job in history_data:
                        job_dir = job.get("download_dir") or job.get("folder_path")
                        if job_dir and os.path.exists(job_dir):
                            dirs_to_check.add(os.path.abspath(job_dir))
            except Exception:
                pass

        local_files = {}  # filename -> full_local_path
        for d in dirs_to_check:
            for root, _, names in os.walk(d):
                for f in names:
                    if f.lower().endswith(('.mp3', '.mp4', '.mkv', '.webm', '.m4a')):
                        if f not in local_files:
                            local_files[f] = os.path.join(root, f)

        # Build list of files needing upload (or re-upload due to trimming)
        files_to_upload = []  # list of filenames
        for fname, lpath in local_files.items():
            exempt = is_gita_file(fname)
            rem_size = existing_blobs.get(fname)
            
            if rem_size is None:
                # File not in Azure yet
                files_to_upload.append(fname)
            elif (rem_size > MAX_BLOB_SIZE_BYTES) and (not keep_full) and (not exempt):
                # File is in Azure but > 200MB -> needs trimming & replacing
                safe_print(f"[Azure Sync] Blob '{fname}' in Azure is {rem_size/(1024*1024):.1f}MB > 200MB. Re-uploading trimmed version...")
                files_to_upload.append(fname)

        total_files = len(files_to_upload)
        failed = []
        for idx, f in enumerate(files_to_upload):
            local_path = local_files[f]
            blob_client = container_client.get_blob_client(f)
            
            exempt = is_gita_file(f)
            upload_path = local_path
            was_trimmed = False
            
            if not keep_full and not exempt:
                upload_path, was_trimmed = trim_audio_if_exceeds_max(local_path, AI_WORKSPACE_DIR, MAX_BLOB_SIZE_BYTES)
            
            status_msg = f"Uploading {f} (trimmed to <200MB)" if was_trimmed else f"Uploading {f}"
            if progress_callback: progress_callback(idx, total_files, status_msg, False)
            safe_print(f"[Azure Sync] Uploading media file: {f} ({os.path.getsize(upload_path)/(1024*1024):.1f} MB)")
            
            try:
                with open(upload_path, "rb") as data:
                    blob_client.upload_blob(data, overwrite=True)
                if was_trimmed and upload_path != local_path and os.path.exists(upload_path):
                    try: os.remove(upload_path)
                    except Exception: pass
            except Exception as fe:
                # Handle InvalidBlockList or existing blob state issues by deleting blob first and retrying upload
                safe_print(f"[Azure Sync] Initial upload failed ({fe}), attempting delete & re-upload for '{f}'...")
                try:
                    container_client.delete_blob(f)
                except Exception:
                    pass
                try:
                    with open(upload_path, "rb") as data:
                        blob_client.upload_blob(data, overwrite=True)
                    if was_trimmed and upload_path != local_path and os.path.exists(upload_path):
                        try: os.remove(upload_path)
                        except Exception: pass
                except Exception as fe2:
                    safe_print(f"[Azure Sync] FAILED {f}: {fe2}")
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
            safe_print(f"[Azure Sync] Manifest generation failed: {me}")

        if os.path.exists(manifest_path):
            if progress_callback:
                progress_callback(total_files, total_files, "Uploading playlists_manifest.json...", False)
            safe_print("[Azure Sync] Uploading playlists_manifest.json...")
            with open(manifest_path, "rb") as data:
                container_client.get_blob_client("playlists_manifest.json").upload_blob(data, overwrite=True)
        else:
            safe_print("[Azure Sync] WARNING: manifest not found; PWA library not updated.")

        if failed:
            msg = f"{len(failed)} file(s) failed to upload (first: {failed[0]})"
            safe_print(f"[Azure Sync] Completed with errors: {msg}")
            if progress_callback: progress_callback(total_files, total_files, "Done", True, msg)
            return

        safe_print("[Azure Sync] Batch sync completed successfully.")
        if progress_callback: progress_callback(total_files, total_files, "Done", True)

    except Exception as e:
        safe_print(f"[Azure Sync Error] {e}")
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
        safe_print("[Azure Sync Error] Download directory not provided.")
