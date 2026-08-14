# Sonic Stream AI - AI Features Documentation

Sonic Stream AI leverages state-of-the-art machine learning models to manipulate and isolate audio stems directly on your machine. The architecture utilizes Meta's **Demucs** engine (specifically the `htdemucs_ft` model) combined with a real-time chunked streaming pipeline to provide zero-wait-time audio processing.

There are three primary AI features integrated into the platform:

---

## 1. Live Voice Mute (Real-time Instrumental Streaming)
**Purpose:** Instantly strips vocals from a playing track, allowing you to listen to a pristine instrumental version without waiting for the entire song to process.

**How it works under the hood:**
1. **Chunking Engine:** When you activate Live Voice Mute, the Python backend intercepts the raw downloaded MP3 and slices it into 30-second segments (`chunks`) using `pydub`.
2. **Sequential Separation:** The backend feeds the first 30-second chunk into the `htdemucs_ft` PyTorch model. The model isolates the vocals and discards them, keeping only the accompaniment (drums, bass, melodies).
3. **Continuous Streaming:** Once the first chunk is processed (which takes only a few seconds), the raw MP3 bytes are immediately yielded to the frontend via a FastAPI `StreamingResponse`. 
4. **Playback:** The browser receives the `audio/mpeg` stream and begins playing it instantly like an internet radio station. While Chunk 1 plays, Chunk 2 is processed and seamlessly appended to the ongoing stream.

---

## 2. Voice-to-Instrument AI (Synthesized Replacement)
**Purpose:** Instead of just muting the vocals, this feature completely replaces the human singer's voice with a synthesized MIDI instrument (defaulting to a Flute, MIDI program 73, for maximum harmony and versatility).

**How it works under the hood:**
1. **Vocal Isolation:** Like Live Voice Mute, the track is chunked into 30-second segments, and the vocals are isolated from the accompaniment.
2. **Pitch Extraction:** The isolated vocal waveform is passed through an algorithmic pitch detector (e.g., Basic Pitch or an internal fundamental frequency extractor). This converts the human voice's pitch, vibrato, and timing into a raw MIDI sequence.
3. **FluidSynth Synthesis:** The backend utilizes FluidSynth and the `TimGM6mb.sf2` soundfont to synthesize the extracted MIDI notes into a pristine flute track.
4. **Re-Mixing & Streaming:** The newly synthesized flute track is merged back onto the original accompaniment track using `pydub`, and the resulting MP3 bytes are streamed continuously to the frontend player.

---

## 3. AI Offline Karaoke (Download)
**Purpose:** For offline usage, this feature generates a permanent, high-quality MP3 of the track with all vocals completely removed, perfect for singing along or DJing.

**How it works under the hood:**
1. **Full-Track Processing:** Unlike the live streaming features, the Offline Karaoke generator processes the entire track sequentially in the background.
2. **Model Execution:** The system runs the `htdemucs_ft` model to pull out the accompaniment stems.
3. **Playlist Integration:** Once the `[KARAOKE]` MP3 is finalized, the backend automatically intercepts the file and injects it into a dedicated **"Instruments"** playlist within the `history.json` database.
4. **Availability:** The track becomes immediately available for playback across all your devices via the "Instruments" playlist in the UI sidebar.
