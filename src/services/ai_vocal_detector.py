import os
import sys
import logging
import random
import numpy as np
from pydub import AudioSegment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AIVocalDetector:
    """
    Pre-Validation Stage: Multi-point random & distributed audio sampling to detect
    whether a track contains human vocals BEFORE performing AI separation / synthesis operations.
    """

    INSTRUMENTAL_KEYWORDS = {
        "instrumental", "nadaswaram", "shehnai", "sitar", "flute", "violin",
        "veena", "mandolin", "bgm", "theme music", "raga", "harmonium",
        "saxophone", "carnatic instrumental", "orchestra", "instrumental version",
        "karaoke", "piano", "tabla", "shenai", "jalatharangam", "nadhaswaram"
    }

    NUM_SAMPLE_POINTS = 10      # Sample 10 distributed intervals across the track
    SAMPLE_DURATION_MS = 5000   # 5 seconds per sample interval
    VOCAL_FORMANT_THRESHOLD = 0.15

    @classmethod
    def has_vocals(cls, title: str, file_path: str) -> dict:
        """
        Pre-validates whether an audio track contains human vocals via multi-point sampling.
        Returns dict: {"has_vocals": bool, "confidence": float, "reason": str}
        """
        title_lower = (title or "").lower()

        # 1. Metadata & Keyword Pre-Filter Stage
        for kw in cls.INSTRUMENTAL_KEYWORDS:
            if kw in title_lower:
                logger.info(f"[Pre-Validation] Title keyword '{kw}' detected in '{title}'. Identified as Pure Instrumental.")
                return {
                    "has_vocals": False,
                    "confidence": 0.99,
                    "reason": f"Title keyword '{kw}' indicates pure instrumental track."
                }

        if not file_path or not os.path.exists(file_path):
            return {"has_vocals": True, "confidence": 0.50, "reason": "File missing for audio signal check."}

        # 2. Multi-Point Distributed Audio Sampling Stage
        try:
            audio = AudioSegment.from_file(file_path)
            dur_ms = len(audio)

            if dur_ms < 6000:
                return {"has_vocals": True, "confidence": 0.50, "reason": "Track too short for multi-point sampling."}

            # Generate 10 evenly spaced sample start positions across 10% to 90% of track length
            step_ms = (dur_ms - cls.SAMPLE_DURATION_MS) / (cls.NUM_SAMPLE_POINTS + 1)
            sample_starts = [int(step_ms * i) for i in range(1, cls.NUM_SAMPLE_POINTS + 1)]

            max_formant_ratio = 0.0
            vocal_detected_sample = None

            for s_idx, start_ms in enumerate(sample_starts, 1):
                end_ms = min(start_ms + cls.SAMPLE_DURATION_MS, dur_ms)
                seg = audio[start_ms:end_ms]

                # Filter to Vocal Formant Band (300 Hz - 3400 Hz)
                vocal_band = seg.high_pass_filter(300).low_pass_filter(3400)
                
                # Filter to Sub-bass (<150 Hz) and Treble (>6000 Hz)
                sub_bass = seg.low_pass_filter(150)
                high_treble = seg.high_pass_filter(6000)

                v_samples = np.array(vocal_band.get_array_of_samples(), dtype=np.float32)
                b_samples = np.array(sub_bass.get_array_of_samples(), dtype=np.float32)
                t_samples = np.array(high_treble.get_array_of_samples(), dtype=np.float32)

                rms_vocal = float(np.sqrt(np.mean(v_samples**2))) if len(v_samples) > 0 else 0.0
                rms_bass = float(np.sqrt(np.mean(b_samples**2))) if len(b_samples) > 0 else 1.0
                rms_treble = float(np.sqrt(np.mean(t_samples**2))) if len(t_samples) > 0 else 1.0

                formant_ratio = rms_vocal / (rms_bass + rms_treble + 1e-6)
                if formant_ratio > max_formant_ratio:
                    max_formant_ratio = formant_ratio

                # Early Exit: If human vocal formant energy is detected in ANY sample, track HAS vocals!
                if formant_ratio >= cls.VOCAL_FORMANT_THRESHOLD:
                    vocal_detected_sample = s_idx
                    logger.info(f"[Pre-Validation] Vocal formant detected in sample #{s_idx}/{cls.NUM_SAMPLE_POINTS} (Ratio: {formant_ratio:.3f}) for '{title}'.")
                    return {
                        "has_vocals": True,
                        "confidence": 0.95,
                        "reason": f"Human vocal presence detected in sample #{s_idx} (Formant ratio: {formant_ratio:.3f})."
                    }

            # If ALL 10 sample intervals across the track show low vocal formant ratio -> Pure Instrumental!
            logger.info(f"[Pre-Validation] No vocal formants detected across all {cls.NUM_SAMPLE_POINTS} sample intervals for '{title}' (Max Ratio: {max_formant_ratio:.3f}). Identified as Pure Instrumental.")
            return {
                "has_vocals": False,
                "confidence": 0.95,
                "reason": f"No human vocal formant detected across all {cls.NUM_SAMPLE_POINTS} sampled intervals (Max Formant Ratio: {max_formant_ratio:.3f})."
            }

        except Exception as e:
            logger.error(f"[Pre-Validation Auditor] Signal check error: {e}")
            return {"has_vocals": True, "confidence": 0.50, "reason": f"Detector fallback notice: {e}"}
