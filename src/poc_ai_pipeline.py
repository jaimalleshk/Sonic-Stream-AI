import argparse
import os
import sys
import logging
from services.ai_vocal_processor import AIVocalProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="AI Vocal-to-Instrument Replacement Proof of Concept")
    parser.add_argument("--input", required=True, help="Path to the input audio file (.mp3, .wav, etc.)")
    parser.add_argument("--soundfont", required=True, help="Path to the .sf2 SoundFont file")
    parser.add_argument("--output", help="Optional output path. Defaults to [Title] - Instrument.mp3")
    
    args = parser.parse_args()
    
    input_path = os.path.abspath(args.input)
    soundfont_path = os.path.abspath(args.soundfont)
    
    if not os.path.exists(input_path):
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)
        
    if not os.path.exists(soundfont_path):
        logger.error(f"SoundFont file not found: {soundfont_path}")
        sys.exit(1)
        
    basename = os.path.splitext(os.path.basename(input_path))[0]
    output_path = args.output if args.output else os.path.join(os.path.dirname(input_path), f"{basename} - AI Instrumental.mp3")
    
    processor = AIVocalProcessor(workspace_dir="ai_workspace")
    
    try:
        # Step 1: Separate vocals
        vocals_path, accompaniment_path = processor.separate_vocals(input_path)
        
        # Step 2: Extract Pitch to MIDI
        midi_path = processor.extract_pitch(vocals_path)
        
        # Step 3: Synthesize new instrument
        instrument_path = os.path.join(processor.workspace_dir, f"{basename}_instrument.wav")
        processor.synthesize_instrument(midi_path, soundfont_path, instrument_path)
        
        # Step 4: Mix back together
        processor.mix_audio(accompaniment_path, instrument_path, output_path)
        
        logger.info(f"Successfully processed! Final output saved to: {output_path}")
        
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
