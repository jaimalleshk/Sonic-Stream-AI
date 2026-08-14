# SonicStream - YouTube Downloader & Cloud Sync (Windows Desktop & Mobile PWA)

SonicStream is a modern, high-speed media downloader and cloud audio streamer designed to extract playlists and videos from YouTube. It features a glassmorphism dark-mode desktop app (Windows WebView2) paired with a responsive Mobile & Web PWA.

---

## 🌟 Key Features

- **Native Windows Desktop App**: Runs in a dedicated window using Microsoft Edge WebView2, with full local filesystem integration and single-click access to downloaded media.
- **YouTube Audio & Video Downloading**:
  - Convert YouTube videos and playlists to high-fidelity MP3 audio (up to 320 kbps) or MP4 video (up to 1080p+).
  - Batch select/deselect tracks, filter by title, and track progress with real-time download speed and ETA indicators.
- **Automatic Cloud Sync to Azure Storage**:
  - When new audio tracks are downloaded or new playlists are created in the Desktop App, they are automatically synced to Azure Storage Blob (`stsonicstream/media`).
  - Automatically builds and exports `playlists_manifest.json` so the Web PWA can stream all desktop playlists instantly.
- **Mobile & Web PWA Companion**:
  - Responsive Web PWA accessible on iPhone, Android, and desktop web browsers.
  - Installable as a Home Screen App shortcut with offline caching (IndexedDB), resume playback memory, and AVRCP lock screen controls.
  - Storage quota management with 20MB file size guards and automatic cache cleanup.

---

## 🚀 Desktop & Azure Sync Architecture

```
┌───────────────────────────┐         ┌───────────────────────────┐
│   SonicStream Desktop     │ ──────> │   Azure Storage Blob      │
│ (YouTube Downloader / CLI)│         │   (stsonicstream/media)   │
└─────────────┬─────────────┘         └─────────────┬─────────────┘
              │                                     │
              │ Exports playlists_manifest.json     │ Streams Audio
              ▼                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SonicStream Web PWA                          │
│        (https://salmon-hill-08be7d60f.7.azurestaticapps.net)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Usage & Deployment Guide

### 1. Launching Desktop App Locally
```bash
python main.py
```

### 2. Deploying PWA to Azure Static Web Apps
```bash
# Inject keys from local keys.json into web-pwa/settings.json
python deploy_pwa.py inject

# Deploy web-pwa folder to Azure
npx @azure/static-web-apps-cli deploy ./web-pwa --env production --deployment-token <TOKEN>

# Clean local settings.json back to blank values for clean git check-in
python deploy_pwa.py clean
```

---

## 📄 Configuration Files

- `keys.json`: Local storage keys and credentials (ignored in Git).
- `keys.example.json`: Example template for setting up credentials.
- `history.json`: Master history and playlist catalog for desktop and cloud sync.
