# Sonic Stream AI - AI Features Documentation

Sonic Stream AI leverages state-of-the-art machine learning models to manipulate and isolate audio stems directly on your machine. The architecture utilizes Meta's **Demucs** engine (specifically the `htdemucs_ft` model) combined with a real-time chunked streaming pipeline to provide zero-wait-time audio processing.

There are three primary AI features integrated into the platform:

---

## 1. Live Voice Mute (Real-time Instrumental Streaming)
**Purpose:** Instantly strips vocals from a playing track, allowing you to listen to a pristine instrumental version without waiting for the entire song to process.
**Quality:** **Average to Good**. The separation removes the vast majority of vocals cleanly, though slight artifacts or backing vocal bleeds may occasionally be present depending on the song.

**How it works under the hood:**
1. **Chunking Engine:** When you activate Live Voice Mute, the Python backend intercepts the raw downloaded MP3 and slices it into 30-second segments (`chunks`) using `pydub`.
2. **Sequential Separation:** The backend feeds the first 30-second chunk into the `htdemucs_ft` PyTorch model. The model isolates the vocals and discards them, keeping only the accompaniment (drums, bass, melodies).
3. **Continuous Streaming:** Once the first chunk is processed (which takes only a few seconds), the raw MP3 bytes are immediately yielded to the frontend via a FastAPI `StreamingResponse`. 
4. **Playback:** The browser receives the `audio/mpeg` stream and begins playing it instantly like an internet radio station. While Chunk 1 plays, Chunk 2 is processed and seamlessly appended to the ongoing stream.

---

## 2. Voice-to-Instrument AI (Synthesized Replacement)
**Purpose:** Instead of just muting the vocals, this feature completely replaces the human singer's voice with a synthesized MIDI instrument (defaulting to a Flute, MIDI program 73, for maximum harmony and versatility).
**Quality:** **Not Good** *(Tracked as an open defect)*. The raw pitch extraction captures unwanted vocal artifacts (like breath and excessive vibrato), which translates poorly to MIDI, making the synthesized instrument sound choppy or disjointed.

**How it works under the hood:**
1. **Vocal Isolation:** Like Live Voice Mute, the track is chunked into 30-second segments, and the vocals are isolated from the accompaniment.
2. **Pitch Extraction:** The isolated vocal waveform is passed through an algorithmic pitch detector (e.g., Basic Pitch or an internal fundamental frequency extractor). This converts the human voice's pitch, vibrato, and timing into a raw MIDI sequence.
3. **FluidSynth Synthesis:** The backend utilizes FluidSynth and the `TimGM6mb.sf2` soundfont to synthesize the extracted MIDI notes into a pristine flute track.
4. **Re-Mixing & Streaming:** The newly synthesized flute track is merged back onto the original accompaniment track using `pydub`, and the resulting MP3 bytes are streamed continuously to the frontend player.

---

## 3. Intelligent Caching & Dedicated Playlists
**Purpose:** Ensure that AI processing is only ever done once per track, and that the resulting byproduct is permanently saved and cataloged for immediate playback in the future.

**How it works under the hood:**
1. **Background Caching:** When you stream an AI-manipulated track (e.g. using Live Voice Mute), the backend not only streams the chunked response to you, but also triggers a `BackgroundTasks` thread.
2. **Permanent Storage:** This background thread sequentially processes the entire track and saves the byproduct (e.g., `[Title] - AI Muted Vocals.mp3`) to your local storage.
3. **Dedicated Playlists:** Once the background process finishes, the new track is appended to a dedicated, un-deletable AI playlist in `history.json` (such as `ai_muted_vocals`, `ai_instruments`, or `ai_vocals_only`).
4. **Cache Lookup:** The next time you attempt to play or manipulate that same track, the system performs a `_check_ai_cache_exists` lookup. If the byproduct already exists, it instantly streams the cached file instead of spinning up the AI engine, providing zero latency and preventing duplicate work.
