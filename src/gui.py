import os
import sys
import socket
import threading
import time
import uvicorn
import webview
from main import app, load_sync_config

# Helper to find a free local port
def find_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port

# Wi-Fi Sync: check whether the fixed sync port is available for LAN binding
def is_port_free(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()

# Runner for the FastAPI backend
def start_server(host, port):
    uvicorn.run(app, host=host, port=port, log_level="warning")

if __name__ == "__main__":
    # Ensure correct base path for compiled execution (.exe)
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
        # Set working directory to static folder's parent
        os.chdir(os.path.dirname(sys.executable))
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    # Wi-Fi Sync mode (sync_config.json, managed by wifi_sync_setup.py):
    # when enabled, bind the server to the LAN on a fixed port so the iPhone
    # app can reach it. Default behavior (disabled) is unchanged: loopback
    # only, random port.
    sync_cfg = load_sync_config()
    host = "127.0.0.1"
    if sync_cfg.get("enabled") and is_port_free("0.0.0.0", int(sync_cfg.get("port", 8765))):
        host = "0.0.0.0"
        port = int(sync_cfg.get("port", 8765))
    else:
        port = find_free_port()

    # Start FastAPI in a background daemon thread
    t = threading.Thread(target=start_server, args=(host, port), daemon=True)
    t.start()

    # Wait for the server to spin up
    time.sleep(1.2)

    # Start native desktop window
    webview.create_window(
        title="SonicStream - YouTube Downloader",
        url=f"http://127.0.0.1:{port}",
        width=1120,
        height=820,
        min_size=(800, 600),
        resizable=True
    )
    webview.start()
