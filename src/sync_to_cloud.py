#!/usr/bin/env python3
"""
SonicStream — sync your local library + playlists to Azure Blob (the cloud PWA source).

Keys stay LOCAL and are never committed:
  * storage account + container are read from keys.json (gitignored)
  * the storage ACCOUNT KEY is read from keys.json ("azure_account_key") if present,
    else from sync_azure_batch.py (also gitignored)
  * the audio source folders come from sync_azure_batch.py (DIRS_TO_SYNC)

What it does (playlist CRUD flows through the desktop app's history.json, which this
tool turns into the cloud manifest):
  * regenerate playlists_manifest.json from history.json (via deploy_pwa)
  * upload any NEW audio files to the blob container (skips ones already there)
  * upload the fresh playlists_manifest.json to the blob
  * optional: prune cloud blobs no longer referenced by any playlist

Usage:
  python sync_to_cloud.py                 # regenerate manifest + upload new audio + upload manifest
  python sync_to_cloud.py --dry-run       # show what WOULD happen, change nothing
  python sync_to_cloud.py --files-only    # only upload new audio files
  python sync_to_cloud.py --manifest-only # only regenerate + upload the manifest
  python sync_to_cloud.py --prune         # ALSO delete cloud blobs not referenced by any playlist (asks first)
  python sync_to_cloud.py status          # show local vs cloud counts, change nothing
"""

import os
import sys
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEYS_FILE = os.path.join(BASE_DIR, "keys.json")
MANIFEST_FILE = os.path.join(BASE_DIR, "web-pwa", "playlists_manifest.json")
AUDIO_EXTS = (".mp3", ".mp4", ".m4a", ".webm", ".mkv")
AZ = "az.cmd" if os.name == "nt" else "az"
SHELL = (os.name == "nt")


# ---------- configuration (all local / gitignored) ----------

def load_config():
    """account, account_key, container, source_dirs — from keys.json + sync_azure_batch.py."""
    account = key = container = None
    dirs = []

    if os.path.exists(KEYS_FILE):
        try:
            k = json.load(open(KEYS_FILE, encoding="utf-8"))
            account = k.get("azure_storage_account") or None
            container = k.get("azure_container") or None
            key = k.get("azure_account_key") or None  # optional; not the SAS token
        except Exception as e:
            print(f"[config] Could not read keys.json: {e}")

    # Fall back to the (gitignored) batch uploader for the account key + source folders.
    try:
        import sync_azure_batch as sab  # noqa
        account = account or getattr(sab, "AZURE_STORAGE_ACCOUNT", None)
        key = key or getattr(sab, "AZURE_STORAGE_KEY", None)
        container = container or getattr(sab, "AZURE_CONTAINER", None)
        dirs = list(getattr(sab, "DIRS_TO_SYNC", []) or [])
    except Exception:
        pass

    container = container or "media"
    missing = [n for n, v in (("account", account), ("account_key", key)) if not v]
    if missing:
        print("ERROR: missing " + ", ".join(missing) + ".")
        print("Put them in keys.json (azure_storage_account, azure_account_key) or in sync_azure_batch.py.")
        sys.exit(1)
    if not dirs:
        print("WARNING: no source folders found (sync_azure_batch.DIRS_TO_SYNC empty) — file upload will be skipped.")
    return {"account": account, "key": key, "container": container, "dirs": dirs}


# ---------- azure blob helpers (az CLI, account-key auth) ----------

def _az(cfg, args, capture=True):
    cmd = [AZ, "storage", "blob"] + args + [
        "--account-name", cfg["account"], "--account-key", cfg["key"],
        "--container-name", cfg["container"], "--only-show-errors",
    ]
    if capture:
        return subprocess.run(cmd, capture_output=True, text=True, shell=SHELL)
    return subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=SHELL)


def list_blobs(cfg):
    res = _az(cfg, ["list", "--num-results", "100000", "--query", "[].name"])
    if res.returncode != 0:
        print("[cloud] Could not list blobs:", (res.stderr or "").strip()[:300])
        return None
    try:
        return set(json.loads(res.stdout or "[]"))
    except Exception:
        return set()


def upload_file(cfg, path, name):
    res = _az(cfg, ["upload", "--file", path, "--name", name, "--overwrite"], capture=False)
    return name, res.returncode == 0


def delete_blob(cfg, name):
    res = _az(cfg, ["delete", "--name", name], capture=False)
    return name, res.returncode == 0


# ---------- local library ----------

def collect_local_files(cfg):
    files = {}  # blob-name (basename) -> full path
    for d in cfg["dirs"]:
        if not os.path.isdir(d):
            continue
        for root, _, names in os.walk(d):
            for f in names:
                if f.lower().endswith(AUDIO_EXTS):
                    files.setdefault(f, os.path.join(root, f))  # first wins on dup basenames
    return files


def referenced_files():
    """Every track `file` referenced by the current manifest."""
    refs = set()
    if os.path.exists(MANIFEST_FILE):
        try:
            m = json.load(open(MANIFEST_FILE, encoding="utf-8"))
            for p in m.get("playlists", []):
                for t in p.get("tracks", []):
                    if t.get("file"):
                        refs.add(t["file"])
        except Exception as e:
            print("[manifest] parse error:", e)
    return refs


# ---------- actions ----------

def regenerate_manifest(dry):
    print("[manifest] Regenerating playlists_manifest.json from history.json ...")
    if dry:
        print("  (dry-run) would run deploy_pwa.generate_pwa_manifest()")
        return
    import deploy_pwa
    deploy_pwa.generate_pwa_manifest()


def upload_manifest(cfg, dry):
    if not os.path.exists(MANIFEST_FILE):
        print("[manifest] playlists_manifest.json not found — run without --files-only first.")
        return
    print("[manifest] Uploading playlists_manifest.json to the blob ...")
    if dry:
        print("  (dry-run) would upload playlists_manifest.json")
        return
    _n, ok = upload_file(cfg, MANIFEST_FILE, "playlists_manifest.json")
    print("  " + ("done." if ok else "FAILED."))


def sync_files(cfg, dry):
    local = collect_local_files(cfg)
    print(f"[files] {len(local)} local audio files across {len(cfg['dirs'])} folder(s).")
    cloud = list_blobs(cfg)
    if cloud is None:
        return
    new = {name: path for name, path in local.items() if name not in cloud}
    print(f"[files] {len(local) - len(new)} already in cloud, {len(new)} new to upload.")
    if not new:
        return
    if dry:
        for name in list(new)[:20]:
            print("  (dry-run) would upload:", name)
        if len(new) > 20:
            print(f"  ... and {len(new) - 20} more")
        return
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(upload_file, cfg, path, name): name for name, path in new.items()}
        for i, fut in enumerate(as_completed(futs), 1):
            _n, good = fut.result()
            ok += good; fail += (not good)
            if i % 25 == 0 or i == len(new):
                print(f"  uploaded {i}/{len(new)} ({ok} ok, {fail} failed)")
    print(f"[files] done: {ok} uploaded, {fail} failed.")


def prune(cfg, dry):
    cloud = list_blobs(cfg)
    if cloud is None:
        return
    refs = referenced_files()
    keep = set(refs) | {"playlists_manifest.json"}
    orphans = sorted(b for b in cloud if b not in keep and b.lower().endswith(AUDIO_EXTS))
    print(f"[prune] {len(orphans)} cloud audio blobs are not referenced by any playlist.")
    if not orphans:
        return
    for name in orphans[:30]:
        print("  orphan:", name)
    if len(orphans) > 30:
        print(f"  ... and {len(orphans) - 30} more")
    if dry:
        print("  (dry-run) would DELETE the above.")
        return
    ans = input(f"Delete {len(orphans)} orphan blob(s) from the cloud? Type 'DELETE' to confirm: ").strip()
    if ans != "DELETE":
        print("[prune] aborted.")
        return
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(delete_blob, cfg, n) for n in orphans]
        for fut in as_completed(futs):
            _n, good = fut.result()
            ok += good; fail += (not good)
    print(f"[prune] deleted {ok}, failed {fail}.")


def status(cfg):
    local = collect_local_files(cfg)
    cloud = list_blobs(cfg) or set()
    refs = referenced_files()
    cloud_audio = {b for b in cloud if b.lower().endswith(AUDIO_EXTS)}
    print("── SonicStream cloud status ──")
    print(f"  account/container : {cfg['account']}/{cfg['container']}")
    print(f"  local audio files : {len(local)}")
    print(f"  cloud audio blobs : {len(cloud_audio)}")
    print(f"  not yet uploaded  : {len([n for n in local if n not in cloud])}")
    print(f"  playlists in manifest refs : {len(refs)} tracks")
    print(f"  cloud blobs not referenced : {len([b for b in cloud_audio if b not in refs])}")
    print(f"  manifest uploaded : {'yes' if 'playlists_manifest.json' in cloud else 'NO'}")


def main():
    args = sys.argv[1:]
    if "status" in args:
        status(load_config()); return
    dry = "--dry-run" in args
    files_only = "--files-only" in args
    manifest_only = "--manifest-only" in args
    do_prune = "--prune" in args

    cfg = load_config()
    if dry:
        print("=== DRY RUN — no changes will be made ===")

    if not manifest_only:
        sync_files(cfg, dry)
    if not files_only:
        regenerate_manifest(dry)
        upload_manifest(cfg, dry)
    if do_prune:
        prune(cfg, dry)
    print("Done." + ("  (dry-run)" if dry else ""))


if __name__ == "__main__":
    main()
