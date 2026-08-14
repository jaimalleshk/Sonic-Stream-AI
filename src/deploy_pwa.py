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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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
    """fuzzy-title -> actual filename for every .mp3 in a folder (one listdir per folder).

    The uploaded Azure blob name == the on-disk basename (see sync_azure_batch.py),
    so resolving the real filename here keeps the manifest 'file' field matching the
    blob and stops the 'some tracks won't play' 404s.
    """
    index = {}
    try:
        if download_dir and os.path.exists(download_dir):
            for f in os.listdir(download_dir):
                name, ext = os.path.splitext(f)
                if ext.lower() == ".mp3":
                    index[_clean_fuzzy(name)] = f
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
                if job.get("deleted") or job.get("id") in ("all_downloads", "deleted_tracks"):
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

                    # Resolve the real on-disk / blob filename. Prefer an explicit
                    # 'file' already recorded on the item; else fuzzy-match the
                    # download folder; else fall back to "{title}.mp3".
                    existing = item.get("file")
                    if existing:
                        fileName = existing if str(existing).lower().endswith(
                            (".mp3", ".mp4", ".m4a", ".webm", ".mkv")) else f"{existing}.mp3"
                    else:
                        fileName = index.get(_clean_fuzzy(title)) or (
                            f"{title}.mp3" if title else f"{track_id}.mp3")

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

    manifest_data = {
        "version": 1,
        "app": "SonicStream",
        "playlists": playlists
    }

    target_manifest = os.path.join(BASE_DIR, "web-pwa", "playlists_manifest.json")
    target_fallback = os.path.join(BASE_DIR, "web-pwa", "manifest_fallback.js")

    with open(target_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    fallback_js = f"// Auto-generated fallback playlist manifest from history.json\nwindow.SONICSTREAM_MANIFEST_FALLBACK = {json.dumps(manifest_data, indent=2)};\n"
    with open(target_fallback, "w", encoding="utf-8") as f:
        f.write(fallback_js)

    print(f"[PWA Deploy] SUCCESS: Generated playlists_manifest.json and manifest_fallback.js ({len(playlists)} playlists, {sum(len(p['tracks']) for p in playlists)} tracks)")

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
    os.makedirs(os.path.dirname(TARGET_SETTINGS_FILE), exist_ok=True)
    with open(TARGET_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(BLANK_SETTINGS, f, indent=2)

    js_content = f"// Blank configuration for GitHub check-in\nwindow.SONICSTREAM_CONFIG = {json.dumps(BLANK_SETTINGS, indent=2)};\n"
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
