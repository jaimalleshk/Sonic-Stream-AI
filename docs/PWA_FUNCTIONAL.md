# SonicStream Web PWA — Functional Documentation

What the SonicStream Web PWA does, and how to use it. This is the cloud music
player companion to the SonicStream Windows desktop downloader.

> Companion docs: [PWA_TECHNICAL.md](PWA_TECHNICAL.md) (internals) and
> [DEPLOYMENT.md](DEPLOYMENT.md) (build + deploy).

---

## 1. What it is

A Progressive Web App that plays your music library — the audio you downloaded
with the SonicStream desktop app and pushed to Azure Blob Storage. It runs in any
modern browser and can be installed to your phone's home screen to behave like a
native app, with lockscreen and car-Bluetooth controls.

- **Desktop view** (`desktop.html`) — a full dashboard: playlist sidebar, a
  sortable/searchable track grid, and a large media player.
- **Mobile view** (`mobile.html`) — a touch-first experience: tap a playlist
  card to see its tracks, tap a track to play, with a docked bottom player.

Opening the app's root URL auto-routes you to the right view for your device.
Each view has a link to switch to the other (**📱 Mobile View** / **🖥️ Desktop**).

---

## 2. Getting started

1. Open the app URL (e.g. your Azure Static Web App address).
2. Open **Settings** (gear icon) and paste your **Azure SAS token** (and, if you
   use your own, the Azure client id / OneDrive link). This is stored on your
   device (IndexedDB) and enables audio streaming from cloud storage. *(Only
   needed once per device; skip if the deployment already includes it.)*
3. Click **Sync** (desktop) / **🔄 Refresh** (mobile) to pull the latest
   playlists. They load into local storage and appear immediately.
4. Pick a playlist and play.

---

## 3. Features

### Playlists & tracks
- Browse all synced playlists; each shows a **cover from one of its songs** and a
  track count.
- Open a playlist to see its tracks with cover art, artist/channel, and duration.
- **Search** by track title, **sort** by #, title, artist, duration, or status,
  and **filter** by status (Cached / Queued / Error). *(Desktop grid.)*
- Pagination for large playlists (50 tracks per page).

### Playback
- **Play / Pause / Next / Previous**, a seek bar, and (desktop) shuffle, repeat,
  and a volume slider with a loudness boost.
- **Play**, **Shuffle Play**, and **Resume** a whole playlist. Resume returns to
  the last track and position you were at.
- **Auto-advance** with a configurable pause between songs (Settings → *Next Song
  Pause Delay*).
- **Lockscreen & car controls** — once installed, Play/Pause/Next/Prev and seek
  work from your phone lockscreen and car steering-wheel Bluetooth buttons.

### Download-in-advance (offline)
- **Download All** / **Cache Offline** stores a playlist's audio in the browser
  (IndexedDB) so it plays with no network — ideal for flights or dead zones.
- **Pre-download 3 Songs** caches the next few upcoming tracks for gap-free
  playback.
- Files larger than **20 MB are not cached** (a deliberate storage rule); they
  still stream normally.
- **Offline Cached** tab (desktop) shows what's available offline.
- Manage storage in **Settings → Offline Storage Management** (usage + **Clear
  Offline Cache**). The cache is capped at 10 GB.

### Import local files (desktop)
- **Import Local Files** adds audio from your device (e.g. iPhone Files app) into
  a "Local" playlist that plays without any cloud connection.

### Keeping the app up to date (mobile)
- The **Update** button in the mobile header forces the app to fetch the latest
  version (clears the cached app + service worker and reloads). Use this after a
  new deployment if you've pinned the app to your home screen and it looks stale.

---

## 4. Install on a phone (pin as an app)

**iPhone / iPad (Safari):** open the URL → Share → **Add to Home Screen**. Launch
from the icon to run full-screen with media controls.

**Android (Chrome):** open the URL → menu → **Install app** / **Add to Home
Screen**.

After installing, if you ever see an old version, tap **Update** in the header.

---

## 5. Settings reference

| Setting | Purpose |
|---|---|
| Microsoft Entra ID (Client ID) | Azure AD app id for OneDrive sign-in (a default is provided) |
| Azure Storage SAS Token | Read-only token that lets the app stream audio from cloud storage — **required for streaming** |
| OneDrive Share Link / Folder | Optional OneDrive source for streaming/importing |
| Next Song Pause Delay | Seconds to wait before auto-playing the next track |
| Offline Storage Management | Shows cache usage; **Clear Offline Cache** |

---

## 6. Troubleshooting

- **No playlists show up** → open Settings, confirm the SAS token, then
  **Sync / Refresh**.
- **A track says "error playing track"** → it may not be uploaded to cloud
  storage yet (download it in the desktop app and re-sync). Most title-based
  playback mismatches are resolved automatically by the manifest.
- **App looks out of date after an update** → tap **Update** (mobile) or hard-
  refresh the browser.
- **Inspect what's stored offline** → open `IndexDBbrowser.html` (the built-in
  IndexedDB browser) to see cached files, playlists, and settings.
