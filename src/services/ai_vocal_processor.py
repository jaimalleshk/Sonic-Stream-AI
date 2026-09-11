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

    def separate_vocals(self, input_path, shifts=1):
        """
        Uses Demucs to separate the audio into vocals and accompaniment.
        shifts=1 runs ultra-fast single-pass separation for real-time live streaming.
        """
        logger.info(f"Separating vocals using Demucs (htdemucs_ft, shifts={shifts}) for {input_path}...")
        cmd = [
            "demucs", 
            "-n", "htdemucs_ft", 
            "--two-stems", "vocals",
            "-j", "1",
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
            'env': env,
            'cwd': self.workspace_dir
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

    def suppress_residual_vocals(self, accompaniment_path, vocals_path, output_path):
        """
        Eliminates low-volume residual vocal bleed and vocal reverb tails from accompaniment stem
        using fast vectorized NumPy array math.
        """
        try:
            import numpy as np
            logger.info("Applying Zero-Bleed Residual Vocal Suppression Filter...")
            acc = AudioSegment.from_file(accompaniment_path)
            voc = AudioSegment.from_file(vocals_path)
            
            acc_samples = np.array(acc.get_array_of_samples())
            voc_samples = np.array(voc.get_array_of_samples())
            
            channels = acc.channels
            sample_rate = acc.frame_rate
            chunk_len = int(sample_rate * 0.05) * channels  # 50ms frames
            
            n_chunks = len(acc_samples) // chunk_len
            if n_chunks > 0 and len(voc_samples) >= n_chunks * chunk_len:
                acc_trunc = acc_samples[:n_chunks * chunk_len].reshape(n_chunks, chunk_len)
                voc_trunc = voc_samples[:n_chunks * chunk_len].reshape(n_chunks, chunk_len)
                
                # Compute RMS per chunk vectorized
                voc_rms = np.sqrt(np.mean(voc_trunc.astype(np.float32)**2, axis=1))
                
                # Active vocal frames (voc_rms > 40.0 catches low-volume residual vocal bleed & reverb)
                active_mask = voc_rms > 40.0
                
                # Build zero-bleed gain array (0.06 multiplier = -24.4dB suppression during active vocals)
                gains = np.ones(n_chunks, dtype=np.float32)
                gains[active_mask] = 0.06
                
                gain_expanded = np.repeat(gains, chunk_len)
                cleaned_samples = (acc_trunc.reshape(-1) * gain_expanded).astype(acc_samples.dtype)
                
                cleaned_acc = AudioSegment(
                    cleaned_samples.tobytes(),
                    frame_rate=sample_rate,
                    sample_width=acc.sample_width,
                    channels=channels
                )
                cleaned_acc.export(output_path, format="mp3", bitrate="320k")
                logger.info(f"Successfully exported zero-bleed Karaoke track to {output_path}")
                return output_path
        except Exception as e:
            logger.error(f"Residual vocal suppression fallback: {e}")
            
        audio = AudioSegment.from_file(accompaniment_path)
        audio.export(output_path, format="mp3", bitrate="320k")
        return output_path

    def stabilize_volume(self, audio: AudioSegment, target_dbfs: float = -1.0) -> AudioSegment:
        """
        Normalizes peak amplitude and stabilizes loudness across the entire audio stem
        to ensure full, rich, non-fluctuating volume.
        """
        try:
            change_in_db = target_dbfs - audio.max_dBFS
            return audio.apply_gain(change_in_db)
        except Exception as e:
            logger.warning(f"Volume stabilization fallback: {e}")
            return audio

    def trim_silence_gaps(self, audio: AudioSegment, max_silence_ms: int = 2000, silence_thresh_db: float = -45.0) -> AudioSegment:
        """
        Detects long gaps of silence (> max_silence_ms) across the track and trims/removes them
        with smooth crossfades for seamless musical continuity.
        """
        try:
            from pydub.silence import split_on_silence
            chunks = split_on_silence(
                audio,
                min_silence_len=max_silence_ms,
                silence_thresh=silence_thresh_db,
                keep_silence=300
            )
            if not chunks:
                return audio
                
            combined = chunks[0]
            for chunk in chunks[1:]:
                combined = combined.append(chunk, crossfade=100)
            logger.info(f"Trimmed long silence gaps: original {len(audio)/1000:.1f}s -> trimmed {len(combined)/1000:.1f}s")
            return combined
        except Exception as e:
            logger.warning(f"Silence gap trimming fallback: {e}")
            return audio

    def export_audio(self, input_path, output_path, is_vocal_stem=False, is_karaoke_stem=False, vocal_path=None, trim_silence=True):
        """
        Exports a WAV file as a 320k high bitrate MP3 with master volume stabilization and optional silence gap trimming.
        """
        logger.info(f"Exporting {input_path} to {output_path} (trim_silence={trim_silence})...")
        audio = AudioSegment.from_file(input_path)
        
        if is_karaoke_stem:
            # 1. Stable Volume across the track (Peak RMS Normalization)
            audio = self.stabilize_volume(audio, target_dbfs=-1.0)
            # 2. Trim long gaps of silence if enabled
            if trim_silence:
                audio = self.trim_silence_gaps(audio, max_silence_ms=2000, silence_thresh_db=-45.0)

        if is_vocal_stem:
            try:
                audio = audio.high_pass_filter(85)
            except Exception:
                pass
            audio = self.stabilize_volume(audio, target_dbfs=-1.0)

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
                vocals_path, accompaniment_path = self.separate_vocals(temp_chunk_path, shifts=1)
                
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
