"""
Wi-Fi Sync setup helper for SonicStream.

Usage (run with the project's venv python, or any python 3.11+):
    python wifi_sync_setup.py            -> show current status + pairing info
    python wifi_sync_setup.py on         -> enable Wi-Fi Sync (takes effect on next app launch)
    python wifi_sync_setup.py off        -> disable Wi-Fi Sync
    python wifi_sync_setup.py new-token  -> rotate the pairing token

This only edits sync_config.json — it never touches the app's code or data.
The desktop UI has no settings panel for this yet (see HANDOFF-WIFI-SYNC.md).
"""
import json
import os
import secrets
import socket
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYNC_CONFIG_FILE = os.path.join(BASE_DIR, "sync_config.json")


def load_config():
    cfg = {"enabled": False, "port": 8765}
    if os.path.exists(SYNC_CONFIG_FILE):
        with open(SYNC_CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg.update(json.load(f))
    if not cfg.get("token"):
        cfg["token"] = f"{secrets.randbelow(1000000):06d}"
    return cfg


def save_config(cfg):
    with open(SYNC_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return ips or ["<no network detected>"]


def show(cfg):
    state = "ENABLED" if cfg.get("enabled") else "DISABLED"
    print(f"\nWi-Fi Sync is {state}")
    print(f"  Port : {cfg.get('port', 8765)}")
    print(f"  Token: {cfg.get('token')}")
    if cfg.get("enabled"):
        print("\nPair the iPhone app with:")
        for ip in lan_ips():
            print(f"  Server : http://{ip}:{cfg.get('port', 8765)}")
        print(f"  Token  : {cfg.get('token')}")
        print("\nNotes:")
        print("  - Restart SonicStream after changing this setting.")
        print("  - Windows Firewall will ask once to allow Python on private networks — allow it.")
        print("  - Both devices must be on the same Wi-Fi network.")
    else:
        print("\nRun 'python wifi_sync_setup.py on' to enable, then restart SonicStream.")


if __name__ == "__main__":
    cfg = load_config()
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "status"
    if action == "on":
        cfg["enabled"] = True
        save_config(cfg)
    elif action == "off":
        cfg["enabled"] = False
        save_config(cfg)
    elif action == "new-token":
        cfg["token"] = f"{secrets.randbelow(1000000):06d}"
        save_config(cfg)
        print("Pairing token rotated — re-pair the iPhone app.")
    elif action != "status":
        print(__doc__)
        sys.exit(1)
    else:
        save_config(cfg)  # persist a token on first run
    show(cfg)
