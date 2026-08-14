import os
import subprocess
import logging
from pydub import AudioSegment

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
        # '-n htdemucs' uses the default high-quality model
        # '--two-stems vocals' explicitly only separates into vocals and non-vocals
        cmd = [
            "demucs", 
            "-n", "htdemucs", 
            "--two-stems", "vocals",
            "-o", self.workspace_dir,
            input_path
        ]
        subprocess.run(cmd, check=True)
        
        # Demucs output structure: {workspace_dir}/htdemucs/{basename}/vocals.wav and no_vocals.wav
        basename = os.path.splitext(os.path.basename(input_path))[0]
        stems_dir = os.path.join(self.workspace_dir, "htdemucs", basename)
        
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
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        subprocess.run(cmd, check=True, env=env)
        
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
        subprocess.run(cmd, check=True)
        
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
