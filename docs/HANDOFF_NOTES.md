# 🚀 Sonic Stream AI - Hand-Off Notes & Project Specification

## 📌 Project Overview
**Sonic Stream AI** is a specialized fork of the SonicStream audio & video downloader/PWA application (`D:\OneDrive\OneDrive-Projects\Sonic Stream AI`). 

This project extends SonicStream with **100% Free, Local, Offline AI Capabilities** for:
1. **Vocal Muting & Suppression**: Silencing or dampening lead/backing vocals in any audio or video track to create clean karaoke / instrumental backing tracks.
2. **AI Vocal-to-Instrument Replacement**: Tracking vocal melody pitches and synthesizing the vocal line into another musical instrument (Flute, Violin, Saxophone, Piano, Veena, Nadaswaram, etc.) matching the exact tone, key, and timing of the song.
3. **Audio Export & File Creation**: Saving rendered audio outputs as new `.mp3`, `.wav`, or `.m4a` files on local disk.

---

## 🔒 Fundamental Principles & Requirements
1. **100% Local & Offline**: All processing must run locally on user hardware (CPU / local GPU). **NO paid cloud APIs, NO external API subscriptions, NO third-party web dependencies.**
2. **Zero Breaking Changes**: Existing SonicStream functionality (YouTube downloader, PWA frontend, IndexedDB offline caching, OneDrive sync, WiFi sync) must remain 100% functional and untouched.
3. **Modular Architecture**: AI processing features must be built as decoupled modules in `services/vocal_processor.py` (or similar) with dedicated opt-in API endpoints.

---

## 🛠️ Technical Architecture & AI Pipeline

```
┌────────────────────────┐      ┌─────────────────────────────┐      ┌───────────────────────────────┐
│ Input Song (.mp3/.mp4) │ ────>│ 1. AI Vocal Separation      │ ────>│ Stems:                        │
└────────────────────────┘      │ (Meta Demucs / BS-RoFormer) │      │ - accompaniment.wav           │
                                └─────────────────────────────┘      │ - vocals.wav                  │
                                                                     └──────────────┬────────────────┘
                                                                                    │
                                ┌─────────────────────────────┐                     │
                                │ 2. Audio-to-Melody Pitch    │ <───────────────────┘
                                │ Tracking (Basic Pitch /     │
                                │ TorchCREPE)                 │
                                └──────────────┬──────────────┘
                                               │
                                               ▼
                                ┌─────────────────────────────┐
                                │ 3. Instrument Synthesizer   │
                                │ (FluidSynth + SoundFont .sf2│
                                └──────────────┬──────────────┘
                                               │
                                               ▼
                                ┌─────────────────────────────┐
                                │ 4. Audio Mixer & FFmpeg     │
                                │ Encoder                     │
                                └──────────────┬──────────────┘
                                               │
                                               ▼
                                ┌─────────────────────────────┐
                                │ Final Rendered Output File  │
                                └─────────────────────────────┘
```

### Key Libraries & Tools for Sonic Stream AI:
- **Separation Engine**: `demucs` or `onnxruntime` (BS-RoFormer / MDX-Net).
- **Pitch Tracking Engine**: `basic-pitch` (Spotify Open-Source Audio-to-MIDI ML) or `torchcrepe`.
- **Synthesizer Engine**: `pyfluidsynth` / `FluidSynth` with open-source SoundFont (`.sf2` / `.sf3`) libraries.
- **Audio Processing & Encoding**: `pydub`, `soundfile`, `ffmpeg-python`.

---

## 📋 Feature Breakdown

### Requirement 1: Vocal Muting & Reduction
- **Pure Instrumental Mode**: Mute `vocals.wav` completely (`vocal_volume = 0.0`), keeping 100% clean instrumental backing track.
- **Variable Vocal Suppression**: Adjust vocal gain slider (e.g. -6dB, -12dB) to lower singer volume for karaoke play.

### Requirement 2: Vocal-to-Instrument Replacement
- **Pitch Contour Extraction**: Extracts exact notes, vibrato, and pitch bends from singer's voice.
- **Instrument Selector**: Replaces voice melody with selected SoundFont instrument:
  - 🪈 Flute / Pan Flute
  - 🎻 Violin / Cello
  - 🎷 Saxophone / Brass
  - 🎹 Grand Piano / Electric Piano
  - 🪕 Veena / Sitar / Traditional Instrument
- **Key & Tone Match**: Because MIDI notes are extracted directly from the singer, the replacement instrument naturally matches the song's key, scale, and tempo 100% perfectly.

### Requirement 3: File Export
- Renders the resulting track to disk with descriptive filenames:
  - `[Song_Title] - Instrumental.mp3`
  - `[Song_Title] - Flute Version.mp3`
  - `[Song_Title] - Muted Vocal.mp3`

---

## 📁 Repository Location
- **Path**: `D:\OneDrive\OneDrive-Projects\Sonic Stream AI`
- **Baseline**: Primary development branch.
- **Status**: 
  - **IMPLEMENTED (2026-08-13)**: Backend offline AI extraction via Demucs for Instrumental/Karaoke variants.
  - **IMPLEMENTED (2026-08-13)**: Basic Pitch MIDI extraction and FluidSynth replacement for AI Instrumental.
  - **IMPLEMENTED (2026-08-13)**: Real-time Web Audio API Live Mute (pure L-R phase cancellation) added to the player controls.
  - **IMPLEMENTED (2026-08-13)**: Updated frontend UI with dedicated AI action buttons (Speech + Download Arrow for Offline, Speech + Waves for Live Mute).

---

*Hand-off documentation updated on 2026-08-13.*
