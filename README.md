# Sonic Stream AI - Media Downloader & Real-time Audio Separation Engine

Sonic Stream AI is a modern, high-speed media downloader equipped with state-of-the-art on-device AI for real-time audio manipulation. It features a glassmorphism dark-mode desktop app (Windows WebView2) paired with advanced audio demixing pipelines, plus a responsive Mobile & Web PWA.

---

## 🌟 Key Features

### 🧠 Next-Gen AI Audio Processing
Sonic Stream AI leverages Meta's **Demucs** architecture (`htdemucs_ft`) combined with real-time chunking to offer zero-wait-time audio manipulation:
- **Live Voice Mute**: Instantly strip vocals from a playing track to listen to pristine instrumentals.
- **Independent AI Quality Auditor**: Automated signal gatekeeper ([`src/services/ai_quality_auditor.py`](file:///D:/OneDrive/OneDrive-Projects/Sonic%20Stream%20AI/src/services/ai_quality_auditor.py)) evaluating vocal band suppression ($\ge 6\text{dB}$ drop) and spectral correlation ($<0.80$) in real-time before accepting stems.
- **4-Layer Deduplication Safety**: Ensures batch AI operations never re-process existing stems or create duplicate playlist items.
- **Voice-to-Instrument**: Synthesizes the human singer's pitch and vibrato into a MIDI instrument (e.g., Flute) in real-time.
- **Intelligent Caching & Dedicated Playlists**: Whenever you stream an AI-manipulated track, the system seamlessly saves the byproduct in the background. The track is permanently added to a dedicated AI playlist (`AI Muted Vocals`, `AI Instruments`, or `AI Vocals Only`), ensuring instant playback on all future listens without re-processing.

### ⚡ Native Windows Desktop App
- Runs in a dedicated window using Microsoft Edge WebView2, with full local filesystem integration and single-click access to downloaded media.
- Convert YouTube videos and playlists to high-fidelity MP3 audio (up to 320 kbps) or MP4 video (up to 1080p+).
- Batch select/deselect tracks, filter by title, and track progress with real-time download speed and ETA indicators.

### ☁️ Automatic Cloud Sync to Azure Storage
- When new audio tracks are downloaded or new playlists are created in the Desktop App, they are automatically synced to Azure Storage Blob (`<your-storage-account>/media`).
- Automatically builds and exports `playlists_manifest.json` so the Web PWA can stream all desktop playlists instantly.

### 📱 Mobile & Web PWA Companion
- Responsive Web PWA accessible on iPhone, Android, and desktop web browsers.
- Installable as a Home Screen App shortcut with offline caching (IndexedDB), resume playback memory, and AVRCP lock screen controls.
- Storage quota management with 20MB file size guards and automatic cache cleanup.

---

## 🚀 Desktop & Azure Sync Architecture

```
┌───────────────────────────┐         ┌───────────────────────────┐
│   Sonic Stream AI Desktop │ ──────> │   Azure Storage Blob      │
│ (Downloader / AI Engine)  │         │  <your-storage>/<media>   │
└─────────────┬─────────────┘         └─────────────┬─────────────┘
              │                                     │
              │ Exports playlists_manifest.json     │ Streams Audio
              ▼                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Sonic Stream AI Web PWA                      │
│              <your azure static site>                           │
└─────────────────────────────────────────────────────────────────┘
```

> Your own deployment details — static site URL, storage account and container —
> live in **`keys.json`**, which is gitignored and never published. See
> `keys.example.json` for the shape.

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
