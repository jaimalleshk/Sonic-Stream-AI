# SonicStream Desktop App — User Guide

A friendly, step-by-step guide for everyday use. No technical knowledge needed.

**SonicStream is two things in one app:**
1. **A downloader** — save songs and full playlists from YouTube to your computer.
2. **A music player** — play what you've downloaded, right inside the app.

---

## 1. Getting the app (first time only)

You need a copy of the app on your PC. Pick whichever fits you.

### Option A — The ready-made app (easiest, nothing to install) ✅

This is the packaged version: **no Python, no ffmpeg, no setup.** Just download,
unzip, and run.

1. Get **`SonicStream.zip`** (from whoever shared the app with you, or from the
   project's **Releases** page on GitHub).
2. **Right-click the ZIP → Extract All** to a folder you like, e.g.
   `Documents\SonicStream`.
3. Open that folder and **double-click `SonicStream.exe`**.
   - The first launch takes a few seconds while it starts up.
   - Windows may show a blue *"Windows protected your PC"* box (because the app
     isn't code-signed). Click **More info → Run anyway**. This is normal for
     free, open-source apps.

That's it — the app window opens. Your music downloads to your
**`Music\SonicStream`** folder by default (you can change this later — see §3E).

### Option B — Run from the source code (for tinkerers)

1. Download the code: open
   **https://github.com/jaimalleshk/SonicStream-YouTube-Downloader**, click the
   green **Code** button → **Download ZIP**, and extract it. *(Or, with Git:
   `git clone https://github.com/jaimalleshk/SonicStream-YouTube-Downloader.git`.)*
2. Install **Python 3.11+** from https://python.org (tick *"Add Python to PATH"*).
3. Install **ffmpeg** and make sure it's on your PATH (https://ffmpeg.org).
4. In the project folder, run once: `pip install -r requirements.txt`
5. Start it with `python gui.py` (or double-click `SonicStream.bat`).

> Not sure which to pick? Choose **Option A**. It just works.

---

## 2. Opening the app

Double-click **`SonicStream.exe`** (Option A) or run `python gui.py` (Option B).
A window opens on your desktop — you don't need a web browser, and you don't
need to sign in to anything.

You'll see:
- A box at the top to paste a YouTube link.
- A **player** on the left (album art, play/pause, etc.).
- Your **playlists** on the side, and a **song list** in the middle.

---

## 3. Downloading music from YouTube

### A) Download a whole playlist or a single song

1. On YouTube, copy the link (the web address) of a **playlist** or a **video**.
   - Playlist link looks like: `youtube.com/playlist?list=...`
   - Single song link looks like: `youtube.com/watch?v=...`
2. In SonicStream, **paste** the link into the top box.
3. Click **Analyze Link**.
4. The app lists every song it found — with titles, channel, and length.

### B) Pick what you want

- Each song has a **checkbox**. Tick the ones you want (or use **Select All**).
- Use the **search box** to filter the list by title.

### C) Choose Audio or Video, and quality

- **Format:**
  - **MP3 (audio)** — just the music/sound. Best for a music library. *(Recommended)*
  - **MP4 (video)** — the full video with picture.
- **Quality:**
  - Audio: Low (64), Medium (128), High (192), **Highest (320)** — higher = better sound, bigger file.
  - Video: 360p, 480p, 720p, **1080p+** — higher = sharper picture, bigger file.

### D) Download

1. Click **Download** (or **Download Selected**).
2. Watch the **progress** — you'll see percentage, speed, and time remaining, plus
   a live activity log.
3. When it's done, click **Open Downloads** to see the files in Windows Explorer.

**Good to know**
- **No duplicates:** if you already downloaded a song, SonicStream skips it
  automatically — safe to re-run a playlist to grab only the new additions.
- **Resume:** if a download is interrupted, run it again — it picks up where it
  left off instead of starting over.
- **Songs that can't be downloaded** (deleted/private/blocked) are marked and
  skipped, so one bad song won't stop the rest.

### E) Where your files are saved (and changing it)

- By default, downloads go to your downloads folder for SonicStream.
- To choose a different folder, use **Browse** next to the download location and
  pick any folder you like. The app remembers your choice.

---

## 4. Playing your music in the app

SonicStream isn't just a downloader — it's a player too.

- **Play a playlist:** click a playlist on the side, then press **Play**.
- **Play one song:** click the song in the list (or its ▶ button).
- **Controls:** Play/Pause, **Next/Previous**, **Shuffle** (random order), and
  **Repeat**.
- **Resume:** **Resume** continues a playlist from the exact song and spot where
  you last stopped.
- **Volume & progress:** drag the volume slider; drag the progress bar to jump to
  any point in a song.

---

## 5. Organizing playlists

- **Pin** playlists you use often so they stay at the top.
- **Re-order** playlists with the up/down arrows.
- Deleted items go to a **Trash/Deleted** area rather than vanishing.
- The app keeps a **history** of what you've downloaded, so you can re-open a
  playlist later and fetch any newly added songs.

---

## 6. Simple troubleshooting

| Problem | What to do |
|---|---|
| "Analyze Link" does nothing | Make sure you pasted a real YouTube link and you're online. |
| A song didn't download | It may be private/deleted/region-blocked; the app marks these and moves on. |
| Download seems stuck | Let it finish or close and reopen — it resumes; unavailable songs are skipped. |
| Can't find my files | Click **Open Downloads**, or check the folder you set with **Browse**. |
| Want better sound/picture | Re-download with a higher **Quality** setting. |

---

## 7. Frequently asked

**Do I need an account or subscription?** No. It runs entirely on your PC.

**Can I download just the audio from a music video?** Yes — choose **MP3 (audio)**.

**Will it re-download songs I already have?** No — it detects and skips duplicates.

**Can I listen without internet?** Yes — anything you've downloaded plays from your
computer, no connection needed.

**How is this different from the phone/web player?** The **desktop app** is where you
**download and play** on your PC. The separate **web/mobile player** streams the same
library from the cloud on your phone — see the PWA guide for that.

---

## Appendix — Building the `.exe` (for maintainers only)

End users never need this; it's how the ready-made `SonicStream.exe` in
**Option A** is produced. The build bundles Python, all dependencies, and
**ffmpeg/ffprobe** into one self-contained folder, so the person who runs it
needs nothing installed.

**One-time setup on the build machine:**
```bash
pip install -r requirements.txt
pip install pyinstaller
```

**Build:**
```bash
build_exe.bat
```
(or, equivalently, `python -m PyInstaller sonicstream.spec --noconfirm`)

- ffmpeg is pulled from the folder in the `FFMPEG_BIN` environment variable
  (defaults to the original dev machine's path). If your ffmpeg lives elsewhere:
  ```bash
  set FFMPEG_BIN=C:\path\to\ffmpeg\bin
  build_exe.bat
  ```
  That folder must contain both `ffmpeg.exe` and `ffprobe.exe`.
- Output lands in **`dist\SonicStream\`**. The whole folder is the app; the
  entry point is `dist\SonicStream\SonicStream.exe`.
- **To share:** zip the entire `dist\SonicStream` folder as `SonicStream.zip`
  and attach it to a GitHub Release (it's too large for the git repo, so
  `build/` and `dist/` are git-ignored).
- The build is **onedir** (a folder, not a single loose `.exe`) on purpose —
  it starts faster and is far more reliable with pywebview + the bundled ffmpeg
  than a one-file build.

**Notes**
- The packaged app stores its data (downloads default to `Music\SonicStream`,
  plus `history.json` / `keys.json`) next to the `.exe`, not inside the
  temporary unpack folder — so your library and history persist between runs.
- The app isn't code-signed, so Windows SmartScreen shows a warning on first
  run (**More info → Run anyway**). Code signing needs a paid certificate.
