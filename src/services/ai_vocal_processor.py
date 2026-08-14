import os
import subprocess
import logging
from pydub import AudioSegment

# Patch subprocess.Popen to prevent pydub from spawning console windows on Windows for ffmpeg
if os.name == 'nt':
    _original_popen = subprocess.Popen
    def _patched_popen(*args, **kwargs):
        if 'creationflags' not in kwargs:
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        return _original_popen(*args, **kwargs)
    subprocess.Popen = _patched_popen

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AIVocalProcessor:
    def __init__(self, workspace_dir="ai_workspace"):
        """
        Initializes the AI Vocal Processor.
        workspace_dir: Directory where temporary files (stems, midi) will be stored.
        """
        self.workspace_dir = workspace_dir
        os.makedirs(self.workspace_dir, exist_ok=True)

    def separate_vocals(self, input_path):
        """
        Uses Demucs to separate the audio into vocals and accompaniment.
        Returns paths to the separated stems.
        """
        logger.info(f"Separating vocals using Demucs for {input_path}...")
        # '-n htdemucs_ft' uses the fine-tuned high-quality model
        # '--two-stems vocals' explicitly only separates into vocals and non-vocals
        cmd = [
            "demucs", 
            "-n", "htdemucs_ft", 
            "--two-stems", "vocals",
            "-o", self.workspace_dir,
            input_path
        ]
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        kwargs = {
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'env': env
        }
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        
        try:
            subprocess.run(cmd, check=True, **kwargs)
        except subprocess.CalledProcessError as e:
            logger.error(f"Demucs failed: {e.stderr.decode('utf-8', errors='ignore')}")
            raise RuntimeError(f"Demucs processing failed: {e.stderr.decode('utf-8', errors='ignore')}")
        
        # Demucs output structure: {workspace_dir}/htdemucs_ft/{basename}/vocals.wav and no_vocals.wav
        basename = os.path.splitext(os.path.basename(input_path))[0]
        stems_dir = os.path.join(self.workspace_dir, "htdemucs_ft", basename)
        
        vocals_path = os.path.join(stems_dir, "vocals.wav")
        accompaniment_path = os.path.join(stems_dir, "no_vocals.wav")
        
        if not os.path.exists(vocals_path) or not os.path.exists(accompaniment_path):
            raise FileNotFoundError("Demucs did not output the expected stems.")
            
        return vocals_path, accompaniment_path

    def extract_pitch(self, vocal_path):
        """
        Uses Basic Pitch to extract MIDI notes from the vocal track.
        """
        logger.info(f"Extracting pitch from {vocal_path} using Basic Pitch...")
        cmd = [
            "basic-pitch",
            self.workspace_dir,  # output directory
            vocal_path
        ]
        
        # Set PYTHONIOENCODING to fix UnicodeEncodeError when basic-pitch prints emoji
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        kwargs = {
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'env': env
        }
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        
        try:
            subprocess.run(cmd, check=True, **kwargs)
        except subprocess.CalledProcessError as e:
            logger.error(f"Basic Pitch failed: {e.stderr.decode('utf-8', errors='ignore')}")
            raise RuntimeError(f"Basic Pitch failed: {e.stderr.decode('utf-8', errors='ignore')}")
        
        # Basic pitch appends _basic_pitch.mid to the output
        basename = os.path.splitext(os.path.basename(vocal_path))[0]
        midi_path = os.path.join(self.workspace_dir, f"{basename}_basic_pitch.mid")
        
        if not os.path.exists(midi_path):
            raise FileNotFoundError("Basic Pitch did not output the expected MIDI file.")
            
        return midi_path

    def synthesize_instrument(self, midi_path, soundfont_path, output_path, midi_program=None):
        """
        Uses FluidSynth to render the MIDI file into a WAV file using the provided SoundFont.
        Requires 'fluidsynth' to be installed on the system and available in PATH.
        If midi_program is provided, inserts a program change message.
        """
        logger.info(f"Synthesizing instrument to {output_path}...")
        
        if midi_program is not None:
            try:
                import mido
                mid = mido.MidiFile(midi_path)
                for track in mid.tracks:
                    track.insert(0, mido.Message('program_change', program=int(midi_program), time=0))
                mid.save(midi_path)
            except Exception as e:
                logger.error(f"Failed to set MIDI program: {e}")

        # Use local fluidsynth binary if available
        fluidsynth_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fluidsynth_bin", "bin", "fluidsynth.exe"))
        if not os.path.exists(fluidsynth_exe):
            fluidsynth_exe = "fluidsynth" # fallback to PATH

        # -F outputs to a file, -ni runs in non-interactive mode (no gui)
        cmd = [
            fluidsynth_exe,
            "-ni",
            soundfont_path,
            midi_path,
            "-F", output_path
        ]
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        kwargs = {
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'env': env
        }
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
        try:
            subprocess.run(cmd, check=True, **kwargs)
        except subprocess.CalledProcessError as e:
            logger.error(f"FluidSynth failed: {e.stderr.decode('utf-8', errors='ignore')}")
            raise RuntimeError(f"FluidSynth failed: {e.stderr.decode('utf-8', errors='ignore')}")
        
        if not os.path.exists(output_path):
            raise FileNotFoundError("FluidSynth did not output the synthesized audio file.")
            
        return output_path

    def export_audio(self, input_path, output_path):
        """
        Exports a WAV file as an MP3.
        """
        logger.info(f"Exporting {input_path} to {output_path}...")
        audio = AudioSegment.from_file(input_path)
        audio.export(output_path, format="mp3", bitrate="320k")
        return output_path

    def mix_audio(self, accompaniment_path, instrument_path, output_path):
        """
        Mixes the accompaniment and the new instrument together.
        """
        logger.info(f"Mixing {accompaniment_path} and {instrument_path}...")
        acc_audio = AudioSegment.from_file(accompaniment_path)
        inst_audio = AudioSegment.from_file(instrument_path)
        
        # Mix them (overlay)
        mixed = acc_audio.overlay(inst_audio)
        
        # Export as mp3 (requires ffmpeg)
        logger.info(f"Exporting final mix to {output_path}...")
        mixed.export(output_path, format="mp3", bitrate="320k")
        return output_path

    def replace_vocals_with_instrument(self, input_path, midi_program=53):
        """
        Replaces the vocals in a track with a synthesized MIDI instrument.
        Uses TimGM6mb.sf2 soundfont by default.
        midi_program 53 is 'Voice Oohs' which mimics human vocal chords.
        """
        basename = os.path.splitext(os.path.basename(input_path))[0]
        stems_dir = os.path.join(self.workspace_dir, "htdemucs_ft", basename)
        
        # 1. Separate vocals
        vocals_path, accompaniment_path = self.separate_vocals(input_path)
        
        # 2. Extract pitch
        midi_path = self.extract_pitch(vocals_path)
        
        # 3. Synthesize instrument
        soundfont_path = os.path.join(os.path.dirname(__file__), "..", "..", "TimGM6mb.sf2")
        synth_output = os.path.join(self.workspace_dir, f"{basename}_synth.wav")
        self.synthesize_instrument(midi_path, soundfont_path, synth_output, midi_program=midi_program)
        
        # 4. Mix
        final_output = os.path.join(self.workspace_dir, f"{basename}_instrument_replace.mp3")
        self.mix_audio(accompaniment_path, synth_output, final_output)
        
        return final_output

    def process_chunked_stream(self, input_path, mode='mute', midi_program=73, chunk_length_ms=30000):
        """
        Splits the audio into chunks, processes them with AI, and yields MP3 bytes 
        as they are ready for continuous chunked streaming.
        """
        import tempfile
        import shutil
        from pydub.utils import make_chunks

        logger.info(f"Chunking {input_path} into {chunk_length_ms}ms segments...")
        audio = AudioSegment.from_file(input_path)
        chunks = make_chunks(audio, chunk_length_ms)
        
        basename = os.path.splitext(os.path.basename(input_path))[0]
        
        for i, chunk in enumerate(chunks):
            temp_chunk_path = os.path.join(self.workspace_dir, f"{basename}_chunk_{i}.mp3")
            chunk.export(temp_chunk_path, format="mp3", bitrate="320k")
            
            final_chunk_path = os.path.join(self.workspace_dir, f"{basename}_chunk_{i}_final.mp3")
            
            try:
                # Process the chunk
                logger.info(f"Processing chunk {i+1}/{len(chunks)}...")
                vocals_path, accompaniment_path = self.separate_vocals(temp_chunk_path)
                
                if mode == 'instrument':
                    midi_path = self.extract_pitch(vocals_path)
                    soundfont_path = os.path.join(os.path.dirname(__file__), "..", "..", "TimGM6mb.sf2")
                    synth_output = os.path.join(self.workspace_dir, f"{basename}_chunk_{i}_synth.wav")
                    self.synthesize_instrument(midi_path, soundfont_path, synth_output, midi_program=midi_program)
                    self.mix_audio(accompaniment_path, synth_output, final_chunk_path)
                    os.remove(synth_output)
                    os.remove(midi_path)
                else:
                    self.export_audio(accompaniment_path, final_chunk_path)
                
                # Yield bytes
                with open(final_chunk_path, 'rb') as f:
                    yield f.read()
                    
                # Cleanup
                if os.path.exists(final_chunk_path): os.remove(final_chunk_path)
                if os.path.exists(temp_chunk_path): os.remove(temp_chunk_path)
                shutil.rmtree(os.path.dirname(vocals_path), ignore_errors=True)
                
            except Exception as e:
                logger.error(f"Error processing chunk {i}: {e}")
                # Fallback to original chunk if AI fails
                with open(temp_chunk_path, 'rb') as f:
                    yield f.read()
                if os.path.exists(temp_chunk_path): os.remove(temp_chunk_path)
