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

    def separate_vocals(self, input_path, shifts=2):
        """
        Uses Demucs to separate the audio into vocals and accompaniment.
        shifts=2 enables multi-shift inference averaging to eliminate phase artifacts & background bleed.
        """
        logger.info(f"Separating vocals using Demucs (htdemucs_ft, shifts={shifts}) for {input_path}...")
        cmd = [
            "demucs", 
            "-n", "htdemucs_ft", 
            "--two-stems", "vocals",
            "-o", self.workspace_dir
        ]
        if shifts > 1:
            cmd.extend(["--shifts", str(shifts)])
        cmd.append(input_path)

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
        Uses Basic Pitch to extract MIDI notes from the vocal track with high-fidelity continuous pitch bends.
        """
        logger.info(f"Extracting high-precision pitch from {vocal_path} using Basic Pitch...")
        cmd = [
            "basic-pitch",
            "--onset-threshold", "0.55",
            "--frame-threshold", "0.35",
            "--minimum-note-length", "100",
            "--multiple-pitch-bends",
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

    def synthesize_instrument(self, midi_path, soundfont_path, output_path, midi_program=73):
        """
        Uses FluidSynth studio DSP rendering engine (48kHz, Reverb, Chorus, Legato Expression)
        to render the MIDI file into a high-fidelity WAV file using the provided SoundFont.
        """
        logger.info(f"Synthesizing high-fidelity instrument (Program {midi_program}) to {output_path}...")
        
        # Default to General MIDI Program 73 (Flute)
        if midi_program is None:
            midi_program = 73

        try:
            import mido
            mid = mido.MidiFile(midi_path)
            for track in mid.tracks:
                # Insert MIDI Expression & Legato Control Messages at timestamp 0
                track.insert(0, mido.Message('program_change', program=int(midi_program), time=0))
                track.insert(1, mido.Message('control_change', control=7, value=115, time=0))   # Main Volume
                track.insert(2, mido.Message('control_change', control=11, value=110, time=0))  # Expression / Breath
                track.insert(3, mido.Message('control_change', control=91, value=95, time=0))   # Reverb Send
                track.insert(4, mido.Message('control_change', control=93, value=40, time=0))   # Chorus Send
                track.insert(5, mido.Message('control_change', control=64, value=64, time=0))   # Legato Sustain

                # Humanize velocities for natural acoustic woodwind response
                for msg in track:
                    if msg.type == 'note_on' and msg.velocity > 0:
                        msg.velocity = min(105, max(65, int(msg.velocity * 0.85)))
            mid.save(midi_path)
        except Exception as e:
            logger.error(f"Failed to set MIDI expression controllers: {e}")

        # Use local fluidsynth binary if available
        fluidsynth_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fluidsynth_bin", "bin", "fluidsynth.exe"))
        if not os.path.exists(fluidsynth_exe):
            fluidsynth_exe = "fluidsynth" # fallback to PATH

        # High-definition studio rendering flags: 48kHz, spatial reverb, chorus, polyphony
        cmd = [
            fluidsynth_exe,
            "-ni",
            "-r", "48000",
            "-g", "1.1",
            "-R", "1",
            "-C", "1",
            "-o", "synth.polyphony=256",
            "-o", "synth.reverb.room-size=0.7",
            "-o", "synth.reverb.damp=0.3",
            "-o", "synth.reverb.width=1.8",
            "-o", "synth.reverb.level=0.55",
            "-o", "synth.chorus.level=0.35",
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

    def export_audio(self, input_path, output_path, is_vocal_stem=False):
        """
        Exports a WAV file as a 320k high bitrate MP3 with master acoustic polishing.
        """
        logger.info(f"Exporting {input_path} to {output_path}...")
        audio = AudioSegment.from_file(input_path)
        
        if is_vocal_stem:
            # High-pass filter at 85Hz to cut low-end mic thumps and sub-bass rumble
            try:
                audio = audio.high_pass_filter(85)
            except Exception:
                pass
            # Normalize peak dynamics for studio vocal presence
            try:
                audio = audio.normalize()
            except Exception:
                pass

        audio.export(output_path, format="mp3", bitrate="320k")
        return output_path

    def mix_audio(self, accompaniment_path, instrument_path, output_path):
        """
        Mixes the accompaniment and the synthesized flute together with warm EQ & master balance.
        """
        logger.info(f"Mixing {accompaniment_path} and {instrument_path}...")
        acc_audio = AudioSegment.from_file(accompaniment_path)
        inst_audio = AudioSegment.from_file(instrument_path)
        
        # Soften harsh high frequencies > 7.5kHz for natural woodwind acoustics
        try:
            inst_audio = inst_audio.low_pass_filter(7500)
        except Exception:
            pass
            
        # Balance flute volume smoothly (-1.5dB relative adjustment)
        inst_audio = inst_audio - 1.5
        
        # Mix them (overlay)
        mixed = acc_audio.overlay(inst_audio)
        
        # Export as 320k high bitrate mp3
        logger.info(f"Exporting final master mix to {output_path}...")
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
        import uuid
        from pydub.utils import make_chunks

        logger.info(f"Chunking {input_path} into {chunk_length_ms}ms segments...")
        audio = AudioSegment.from_file(input_path)
        chunks = make_chunks(audio, chunk_length_ms)
        
        basename = os.path.splitext(os.path.basename(input_path))[0]
        req_id = str(uuid.uuid4())[:8]
        
        for i, chunk in enumerate(chunks):
            temp_chunk_path = os.path.join(self.workspace_dir, f"{basename}_{mode}_{req_id}_chunk_{i}.mp3")
            chunk.export(temp_chunk_path, format="mp3", bitrate="320k")
            
            final_chunk_path = os.path.join(self.workspace_dir, f"{basename}_{mode}_{req_id}_chunk_{i}_final.mp3")
            
            try:
                # Process the chunk
                logger.info(f"Processing chunk {i+1}/{len(chunks)}...")
                vocals_path, accompaniment_path = self.separate_vocals(temp_chunk_path)
                
                if mode == 'instrument':
                    midi_path = self.extract_pitch(vocals_path)
                    soundfont_path = os.path.join(os.path.dirname(__file__), "..", "..", "TimGM6mb.sf2")
                    synth_output = os.path.join(self.workspace_dir, f"{basename}_{mode}_{req_id}_chunk_{i}_synth.wav")
                    self.synthesize_instrument(midi_path, soundfont_path, synth_output, midi_program=midi_program)
                    self.mix_audio(accompaniment_path, synth_output, final_chunk_path)
                    os.remove(synth_output)
                    os.remove(midi_path)
                elif mode == 'vocals':
                    voc_audio = AudioSegment.from_file(vocals_path)
                    voc_audio.export(final_chunk_path, format="mp3", bitrate="320k")
                else:
                    acc_audio = AudioSegment.from_file(accompaniment_path)
                    acc_audio.export(final_chunk_path, format="mp3", bitrate="320k")
                
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
