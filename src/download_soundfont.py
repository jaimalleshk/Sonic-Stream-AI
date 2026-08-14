import urllib.request
import os

def download_soundfont():
    # URL for a small, free General MIDI SoundFont (TimGM6mb)
    url = "https://freepats.zenvoid.org/SoundSets/general-midi/TimGM6mb.sf2"
    output_path = "TimGM6mb.sf2"
    
    if os.path.exists(output_path):
        print(f"{output_path} already exists. Skipping download.")
        return

    print(f"Downloading SoundFont from {url}...")
    try:
        urllib.request.urlretrieve(url, output_path)
        print(f"Successfully downloaded to {output_path}")
    except Exception as e:
        print(f"Failed to download SoundFont: {e}")
        print("Please manually download a .sf2 file (e.g. FluidR3_GM.sf2) and provide its path to the PoC script.")

if __name__ == "__main__":
    download_soundfont()
