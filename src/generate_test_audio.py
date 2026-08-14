import math
import wave
import struct

def generate_test_audio(filename="test_audio.wav", duration=5, sample_rate=44100):
    print(f"Generating {duration}s test audio: {filename}")
    num_samples = duration * sample_rate
    
    # 440 Hz (A4) and 880 Hz mixed
    freq1 = 440.0
    freq2 = 880.0
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1) # Mono
        wav_file.setsampwidth(2) # 2 bytes per sample (16-bit)
        wav_file.setframerate(sample_rate)
        
        for i in range(num_samples):
            # Generate sine waves
            t = float(i) / sample_rate
            value1 = math.sin(2.0 * math.pi * freq1 * t)
            value2 = math.sin(2.0 * math.pi * freq2 * t)
            
            # Mix and scale to 16-bit integer
            mixed = (value1 + value2) / 2.0
            int_val = int(mixed * 32767.0)
            
            # Pack as little-endian short
            data = struct.pack('<h', int_val)
            wav_file.writeframesraw(data)
            
    print("Done!")

if __name__ == "__main__":
    generate_test_audio()
