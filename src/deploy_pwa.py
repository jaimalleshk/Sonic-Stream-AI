#!/usr/bin/env python3
"""
SonicStream PWA Deployment & Settings Injector

Usage:
  python deploy_pwa.py inject  - Injects values from local `keys.json` into `web-pwa/settings.json` and `web-pwa/config.js` for deployment.
  python deploy_pwa.py clean   - Resets `web-pwa/settings.json` to blank key values ("") for clean GitHub check-in.
"""

import sys
import os
import json

# Repo ROOT, not src/. This module lives in src/, but history.json, keys.json and
# web-pwa/ all live one level up. After the src/ restructure, dirname(__file__)
# pointed every path at a non-existent src/... location, so generate_pwa_manifest()
# read no history and silently produced a manifest with ZERO playlists — which is
# why new playlists (e.g. Bhagavad Gita) never reached the PWA.
# Matches how sync_azure_batch.py resolves BASE_DIR.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYS_FILE = os.path.join(BASE_DIR, "keys.json")
KEYS_EXAMPLE_FILE = os.path.join(BASE_DIR, "keys.example.json")
TARGET_SETTINGS_FILE = os.path.join(BASE_DIR, "web-pwa", "settings.json")
TARGET_CONFIG_JS = os.path.join(BASE_DIR, "web-pwa", "config.js")

BLANK_SETTINGS = {
  "azure_storage_account": "",
  "azure_container": "",
  "azure_sas_token": "",
  "azure_client_id": "",
  "onedrive_share_link": ""
}

def load_keys():
    keys_path = KEYS_FILE if os.path.exists(KEYS_FILE) else KEYS_EXAMPLE_FILE
    print(f"[PWA Deploy] Loading keys from: {os.path.basename(keys_path)}")
    try:
        with open(keys_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[PWA Deploy Warning] Failed to read {keys_path}: {e}")
        return {}

def _clean_fuzzy(s):
    # Same normalization rule as main.py check_local_duplicate / _clean_fuzzy_sync
    # so title->filename resolution matches the desktop app and the uploaded blob names.
    return "".join(c.lower() for c in str(s) if c.isalnum())

def _build_file_index(download_dir):
    """fuzzy-title -> actual filename for media files in a folder."""
    index = {}
    target_dirs = set()
    if download_dir and os.path.exists(download_dir):
        target_dirs.add(os.path.abspath(download_dir))
    default_dir = r"D:\OneDrive - Triamber\YoutubeDownloads"
    if os.path.exists(default_dir):
        target_dirs.add(os.path.abspath(default_dir))

    try:
        for d in target_dirs:
            for f in os.listdir(d):
                name, ext = os.path.splitext(f)
                if ext.lower() in (".mp3", ".m4a", ".wav", ".flac", ".ogg"):
                    clean = _clean_fuzzy(name)
                    if clean not in index:
                        index[clean] = f
    except Exception:
        pass
    return index

def _track_thumbnail(item, is_gita_ctx):
    title = item.get("title", "") or ""
    if is_gita_ctx or "gita" in title.lower():
        return "gita_cover_logo.png"
    thumb = item.get("thumbnail") or ""
    if isinstance(thumb, str) and thumb.startswith("http"):
        return thumb
    tid = item.get("id", "") or ""
    if isinstance(tid, str) and len(tid) == 11:
        return f"https://i.ytimg.com/vi/{tid}/hqdefault.jpg"
    return "gita_cover_logo.png"

def generate_pwa_manifest():
    history_file = os.path.join(BASE_DIR, "history.json")
    playlists = []
    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)

            dir_indexes = {}
            for job in history:
                if job.get("deleted") or job.get("id") in ("all_downloads", "deleted_tracks", "ai_vocals_only", "ai_instrumental"):
                    continue
                tracks = []
                items = job.get("items", [])

                pl_title = job.get("title") or job.get("playlist_title") or "Untitled Playlist"
                is_gita = "gita" in pl_title.lower() or "bhagavad" in pl_title.lower()

                download_dir = job.get("download_dir")
                if download_dir not in dir_indexes:
                    dir_indexes[download_dir] = _build_file_index(download_dir)
                index = dir_indexes[download_dir]

                pl_thumb = None
                for item in items:
                    title = item.get("title", "")
                    track_id = item.get("id", "")

                    is_karaoke_item = "karaoke" in str(title).lower() or "karaoke" in str(pl_title).lower()
                    existing = item.get("file")
                    if existing:
                        fileName = existing if str(existing).lower().endswith(
                            (".mp3", ".mp4", ".m4a", ".webm", ".mkv", ".wav", ".flac")) else f"{existing}.mp3"
                    else:
                        clean_t = _clean_fuzzy(title)
                        fileName = index.get(clean_t)
                        if not fileName:
                            for cf, rf in index.items():
                                rf_is_karaoke = "karaoke" in str(rf).lower()
                                if is_karaoke_item != rf_is_karaoke:
                                    continue  # Never map Karaoke track to original file or vice versa
                                if (cf in clean_t or clean_t in cf) and len(cf) >= 4:
                                    fileName = rf
                                    break
                        if not fileName:
                            fileName = f"{title}.mp3" if title else f"{track_id}.mp3"

                    t_thumb = _track_thumbnail(item, is_gita)
                    if pl_thumb is None and t_thumb and t_thumb != "gita_cover_logo.png":
                        pl_thumb = t_thumb

                    tracks.append({
                        "id": track_id,
                        "title": title,
                        "artist": item.get("uploader") or item.get("artist") or "SonicStream",
                        "duration": item.get("duration") or 0,
                        "thumbnail": t_thumb,
                        "thumbnail_file": t_thumb,
                        "url": item.get("url") or (
                            f"https://www.youtube.com/watch?v={track_id}"
                            if isinstance(track_id, str) and len(track_id) == 11 else ""),
                        "file": fileName
                    })

                if is_gita or not pl_thumb:
                    pl_thumb = "gita_cover_logo.png" if is_gita else (
                        tracks[0]["thumbnail"] if tracks else "gita_cover_logo.png")

                playlists.append({
                    "id": job.get("id", ""),
                    "title": pl_title,
                    "playlist_title": pl_title,
                    "thumbnail": pl_thumb,
                    "thumbnail_file": pl_thumb,
                    "track_count": len(tracks),
                    "tracks": tracks
                })
        except Exception as e:
            print(f"[PWA Deploy Warning] History parse error: {e}")

    # Note: Preserve all valid tracks present in history.json so local & pending tracks
    # show up in the manifest and can be synced to Azure Blob Storage.

    # Drop empty playlists. They cannot be played, and they actively caused a
    # support issue: history.json contains a SECOND, zero-track "All Songs" job
    # (plus "Diagnostic Job" / "Grid Diagnostic Run" / "Individual Downloads"),
    # and the empty "All Songs" sorted ABOVE the real 833-track one — so opening
    # it looked exactly like "the All Songs collection disappeared".
    dropped = [p["title"] for p in playlists if not p.get("tracks")]
    playlists = [p for p in playlists if p.get("tracks")]
    if dropped:
        print(f"[PWA Deploy] Skipped {len(dropped)} empty playlist(s): {', '.join(dropped)}")

    manifest_data = {
        "version": 1,
        "app": "SonicStream",
        "playlists": playlists
    }

    # Inject Write SAS Token for PWA Sync
    try:
        from datetime import datetime, timedelta, timezone
        from azure.storage.blob import generate_container_sas, ContainerSasPermissions
        with open(KEYS_FILE, 'r') as kf:
            keys = json.load(kf)
        acc_name = keys.get("azure_storage_account")
        acc_key = keys.get("azure_account_key")
        container = keys.get("azure_container")
        if acc_name and acc_key and container:
            sas_token = generate_container_sas(
                account_name=acc_name,
                container_name=container,
                account_key=acc_key,
                permission=ContainerSasPermissions(read=True, write=True, create=True, add=True, delete=True, list=True),
                expiry=datetime.now(timezone.utc) + timedelta(days=365)
            )
            manifest_data["write_sas_token"] = sas_token
    except Exception as e:
        print(f"[PWA Deploy Warning] Failed to generate write_sas_token: {e}")

    target_manifest = os.path.join(BASE_DIR, "web-pwa", "playlists_manifest.json")
    target_fallback = os.path.join(BASE_DIR, "web-pwa", "manifest_fallback.js")

    with open(target_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    fallback_js = f"// Auto-generated fallback playlist manifest from history.json\nwindow.SONICSTREAM_MANIFEST_FALLBACK = {json.dumps(manifest_data, indent=2)};\n"
    with open(target_fallback, "w", encoding="utf-8") as f:
        f.write(fallback_js)

    print(f"[PWA Deploy] SUCCESS: Generated playlists_manifest.json and manifest_fallback.js ({len(playlists)} playlists, {sum(len(p['tracks']) for p in playlists)} tracks)")

    # Sync updated manifest to Azure Blob Storage
    try:
        keys = load_keys()
        acc = keys.get("azure_storage_account")
        k = keys.get("azure_account_key")
        c = keys.get("azure_container")
        if acc and k and c:
            from azure.storage.blob import BlobServiceClient
            conn_str = f"DefaultEndpointsProtocol=https;AccountName={acc};AccountKey={k};EndpointSuffix=core.windows.net"
            bs = BlobServiceClient.from_connection_string(conn_str)
            cc = bs.get_container_client(c)
            with open(target_manifest, "rb") as mf:
                cc.upload_blob(name="playlists_manifest.json", data=mf, overwrite=True)
            print("[PWA Deploy] Synced clean playlists_manifest.json to Azure Blob Storage.")
    except Exception as ze:
        pass

def inject_public_config():
    """Write ONLY the non-secret deployment config into the PWA before deploying.

    The storage account and container are not secrets (they are just addresses),
    but they must reach the app somehow: the PWA has no Settings field for them,
    so previously the account name was HARDCODED as a fallback in app.js. That
    kept a personal deployment identifier in the repo. Injecting it at deploy time
    from keys.json removes it from source control while keeping playback working.

    Secrets (SAS token, client id) are deliberately left BLANK - the user still
    pastes the read-only SAS into the app's Settings on each device.
    """
    keys = load_keys()
    settings_data = dict(BLANK_SETTINGS)
    settings_data["azure_storage_account"] = keys.get("azure_storage_account", "")
    settings_data["azure_container"] = keys.get("azure_container", "media")

    os.makedirs(os.path.dirname(TARGET_SETTINGS_FILE), exist_ok=True)
    with open(TARGET_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings_data, f, indent=2)
    js_content = ("// Auto-generated PUBLIC config (no secrets) for SonicStream Web PWA\n"
                  f"window.SONICSTREAM_CONFIG = {json.dumps(settings_data, indent=2)};\n")
    with open(TARGET_CONFIG_JS, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"[PWA Deploy] Injected public config (account='{settings_data['azure_storage_account']}', "
          f"container='{settings_data['azure_container']}'); secrets left blank.")


def inject_keys():
    keys = load_keys()
    settings_data = {
        "azure_storage_account": keys.get("azure_storage_account", ""),
        "azure_container": keys.get("azure_container", "media"),
        "azure_sas_token": keys.get("azure_sas_token", ""),
        "azure_client_id": keys.get("azure_client_id", "51f81489-12ee-4a9e-aaae-a2591f45987d"),
        "onedrive_share_link": keys.get("onedrive_share_link", "")
    }

    # 1. Update web-pwa/settings.json
    os.makedirs(os.path.dirname(TARGET_SETTINGS_FILE), exist_ok=True)
    with open(TARGET_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings_data, f, indent=2)

    # 2. Update web-pwa/config.js
    js_content = f"// Auto-generated configuration for SonicStream Web PWA\nwindow.SONICSTREAM_CONFIG = {json.dumps(settings_data, indent=2)};\n"
    with open(TARGET_CONFIG_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    # 3. Generate playlists_manifest.json and manifest_fallback.js
    generate_pwa_manifest()

def clean_keys():
    """Strip SECRETS before check-in — but keep the non-secret address.

    This used to blank the storage account/container too, which is what made
    playback depend on remembering to re-inject before every deploy: ship a blank
    settings.json and the app has no account, so NOTHING plays. The account and
    container are addresses, not credentials (and are already visible on the
    deployed site), so they stay. Only the SAS token / client id are cleared.
    """
    keys = load_keys()
    settings_data = dict(BLANK_SETTINGS)
    settings_data["azure_storage_account"] = keys.get("azure_storage_account", "")
    settings_data["azure_container"] = keys.get("azure_container", "media")

    os.makedirs(os.path.dirname(TARGET_SETTINGS_FILE), exist_ok=True)
    with open(TARGET_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings_data, f, indent=2)

    js_content = f"// Public config (no secrets) for check-in\nwindow.SONICSTREAM_CONFIG = {json.dumps(settings_data, indent=2)};\n"
    with open(TARGET_CONFIG_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    generate_pwa_manifest()
    print(f"[PWA Deploy] SUCCESS: Cleaned '{os.path.relpath(TARGET_SETTINGS_FILE, BASE_DIR)}' back to blank values for GitHub check-in.")

def main():
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "inject"
    if action == "clean":
        clean_keys()
    elif action in ("inject", "build"):
        inject_keys()
    else:
        print(f"Unknown command '{action}'. Usage: python deploy_pwa.py [inject|clean]")

if __name__ == "__main__":
    main()
