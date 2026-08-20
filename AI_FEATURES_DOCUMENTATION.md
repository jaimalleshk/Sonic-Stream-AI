# Sonic Stream AI - AI Features Documentation

Sonic Stream AI leverages state-of-the-art machine learning models to manipulate and isolate audio stems directly on your machine. The architecture utilizes Meta's **Demucs** engine (specifically the `htdemucs_ft` model) combined with a real-time chunked streaming pipeline, independent signal quality auditing, and automated Azure cloud synchronization.

---

## 1. Live Voice Mute (Real-time Instrumental Streaming)
**Purpose:** Instantly strips vocals from a playing track, allowing you to listen to a pristine instrumental version without waiting for the entire song to process.
**Quality:** **Good to Excellent**. Demucs `no_vocals.wav` stem is exported directly as a 320k high-bitrate MP3 instrumental.

**How it works under the hood:**
1. **Chunking Engine:** When you activate Live Voice Mute, the Python backend intercepts the raw downloaded MP3 and slices it into 30-second segments (`chunks`) using `pydub`.
2. **Sequential Separation:** The backend feeds the first 30-second chunk into the `htdemucs_ft` PyTorch model. The model isolates the vocals and discards them, keeping only the accompaniment (drums, bass, melodies).
3. **Continuous Streaming:** Once the first chunk is processed (which takes only a few seconds), the raw MP3 bytes are immediately yielded to the frontend via a FastAPI `StreamingResponse`. 
4. **Playback:** The browser receives the `audio/mpeg` stream and begins playing it instantly like an internet radio station. While Chunk 1 plays, Chunk 2 is processed and seamlessly appended to the ongoing stream.

---

## 2. Pre-Validation Gatekeeper (`AIVocalDetector`)
**Purpose:** An intelligent pre-filter ([`src/services/ai_vocal_detector.py`](file:///D:/OneDrive/OneDrive-Projects/Sonic%20Stream%20AI/src/services/ai_vocal_detector.py)) that scans songs to determine if they actually contain human vocals *before* spinning up the heavy Demucs model.

**How it works under the hood:**
1. **Title Heuristics:** Instantly skips tracks with titles containing "Instrumental", "Karaoke", "BGM", or "Beat".
2. **Spectral Audio Analysis:** Analyzes the first 60 seconds of the track using `librosa`.
3. **MFCC Feature Extraction:** Extracts Mel-frequency cepstral coefficients (MFCCs) and checks the variance and mean. If the variance is very low, the track is deemed to lack human vocals.
4. **Time Savings:** Skips purely instrumental tracks (like Classical or EDM beats) instantly during Batch AI Operations, saving ~3-5 minutes of processing time per track.

---

## 3. Independent AI Quality Auditor Module (`AIQualityAuditor`)
**Purpose:** An independent signal-level quality gatekeeper ([`src/services/ai_quality_auditor.py`](file:///D:/OneDrive/OneDrive-Projects/Sonic%20Stream%20AI/src/services/ai_quality_auditor.py)) that audits every generated stem in real-time before accepting it into playlists or syncing to Azure Blob Storage.

**How it works under the hood:**
1. **Vocal Band Energy Reduction Test:** Measures RMS energy reduction in human vocal frequencies ($300\text{ Hz} - 3400\text{ Hz}$). Requires a minimum $\ge 6.0\text{ dB}$ reduction drop.
2. **Spectral Cross-Correlation Fingerprint:** Computes amplitude similarity between the generated stem and original song. Rejects stems with correlation $> 0.80$ to prevent unseparated or fake tracks.
3. **Real-Time Gatekeeper Interception:** Intercepts each track immediately after export. If the quality audit **FAILS**, the file is deleted on the spot before it can enter the playlist or Azure Blob Storage.
4. **On-Demand Audit API (`POST /api/ai/audit-quality`):** Allows running an on-demand audit across any AI playlist to produce an itemized pass/fail report.

---

## 3. Batch AI Operations & 4-Layer Deduplication Safety
**Purpose:** Allows batch processing an entire playlist into AI Muted Vocals with 100% guarantee against duplicate AI processing or duplicate playlist entries.

**The 4 Deduplication Guards:**
1. **Existing File Skip:** Checks if `... - Karaoke.mp3` exists on disk ($>100\text{ KB}$). If present, AI separation is skipped instantly.
2. **Playlist ID Deduplication:** Checks `new_track_id` in `_add_ai_track_to_playlist()` to ensure no track is ever added to a playlist twice.
3. **AI Suffix Filter:** Skips any track whose title already contains `- Karaoke`, `- AI Muted Vocals`, or `- AI Vocals Only`.
4. **Quality Auditor Gatekeeper:** Evaluates newly generated stems immediately upon export. Corrupt or unseparated stems are rejected and removed on the spot.

---

## 4. Voice-to-Instrument AI (Synthesized Replacement)
**Purpose:** Replaces the human singer's voice with a synthesized MIDI instrument (defaulting to a Flute, MIDI program 73).
**Quality:** **Experimental / Open Defect**. Raw pitch extraction captures vocal breath and vibrato, which can translate to choppy MIDI synthesis.

---

## 5. Intelligent Caching, PWA Manifest & Cloud Sync Rules
**Purpose:** Ensure AI processing is done once per track, and byproducts are cataloged according to strict cloud/PWA privacy rules.

**Sync Rules:**
1. **`AI Muted Vocals` Playlist:** Cataloged in `history.json`, exported to `playlists_manifest.json`, and synced directly to Azure Blob Storage container `media`.
2. **`AI Vocals Only` Playlist:** Strictly local to the desktop application. Excluded from `playlists_manifest.json` generation and skipped during Azure Blob Sync.
