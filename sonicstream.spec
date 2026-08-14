# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the SonicStream desktop app (a single, self-contained build
for non-technical users). Build it with:  python -m PyInstaller sonicstream.spec

Output: dist/SonicStream/SonicStream.exe  (a folder — zip the whole folder to share).

ffmpeg/ffprobe are bundled so the user does NOT need ffmpeg installed. The build
machine must have them; point FFMPEG_BIN at the folder that contains ffmpeg.exe
and ffprobe.exe (defaults to the path used on the original dev machine).
"""

import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files
from PyInstaller.building.datastruct import Tree

# --- ffmpeg / ffprobe (bundled so end users need nothing installed) -----------
FFMPEG_BIN = os.environ.get(
    "FFMPEG_BIN",
    r"D:\OneDrive\Shilpi\AI\Samples\Libraries\ffmpeg\bin",
)

binaries = []
for _name in ("ffmpeg.exe", "ffprobe.exe"):
    _p = os.path.join(FFMPEG_BIN, _name)
    if os.path.exists(_p):
        binaries.append((_p, "."))
    else:
        print(f"[sonicstream.spec] WARNING: {_name} not found at {FFMPEG_BIN} - "
              f"the built app will not be able to convert audio. "
              f"Set FFMPEG_BIN to the folder holding ffmpeg.exe/ffprobe.exe.")

# --- data + hidden imports ----------------------------------------------------
datas = []
if os.path.exists("keys.example.json"):
    datas += [("keys.example.json", ".")]
datas += collect_data_files("yt_dlp")
datas += collect_data_files("webview")

hiddenimports = []
hiddenimports += collect_submodules("yt_dlp")      # yt-dlp's many extractors
hiddenimports += collect_submodules("uvicorn")     # ASGI server internals
hiddenimports += collect_submodules("webview")     # pywebview Windows backend

a = Analysis(
    [os.path.join("src", "gui.py")],
    pathex=["src"],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["typing"],  # obsolete backport that breaks PyInstaller if present
    noarchive=False,
)

# Bundle read-only web assets. web-pwa/media is excluded (46 MB of audio that the
# desktop app never serves locally - the phone player streams it from Azure).
a.datas += Tree("static", prefix="static")
a.datas += Tree("web-pwa", prefix="web-pwa", excludes=["media", "media/*"])

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="SonicStream",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,          # GUI app - no console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="SonicStream",
)
