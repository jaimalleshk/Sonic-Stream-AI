# Open Defects

## Active Issues

### AI Voice-to-Instrument Quality
- **Status:** Open
- **Feature:** AI Voice-to-Instrument (Flute Replacement)
- **Description:** The synthesized instrument replacement (MIDI synthesis) does not currently sound good. The raw pitch extraction captures artifacts, breath, and vibrato from the vocal track, causing the `FluidSynth` generation to sound chaotic or disjointed rather than a clean melody.
- **Proposed Solution:** Needs a more advanced or specialized pitch smoothing algorithm, or an alternative end-to-end voice-to-MIDI model instead of basic algorithmic extraction.

### Batch AI Process Hot-Reloading Disconnect
- **Status:** Open
- **Feature:** Batch AI Operations
- **Description:** `uvicorn` hot-reloading is intentionally disabled when running via `gui.py` to prevent background tasks from being abruptly killed mid-generation whenever a file is saved. However, this means any logic crashes (e.g. `NameError` in `main.py`) silently kill the background thread without shutting down the GUI, requiring a hard manual restart of the desktop app to reload Python code and fix frozen batch progress bars.
- **Proposed Solution:** Implement an internal robust crash-handling mechanism in `_run_batch_worker` that propagates unhandled exceptions to `ai_batch_progress.json` so the UI can explicitly report Python-level crashes instead of just freezing.

