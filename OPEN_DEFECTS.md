# Open Defects

## Active Issues

### AI Voice-to-Instrument Quality
- **Status:** Open
- **Feature:** AI Voice-to-Instrument (Flute Replacement)
- **Description:** The synthesized instrument replacement (MIDI synthesis) does not currently sound good. The raw pitch extraction captures artifacts, breath, and vibrato from the vocal track, causing the `FluidSynth` generation to sound chaotic or disjointed rather than a clean melody.
- **Proposed Solution:** Needs a more advanced or specialized pitch smoothing algorithm, or an alternative end-to-end voice-to-MIDI model instead of basic algorithmic extraction.

