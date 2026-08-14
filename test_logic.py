import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = r"D:\OneDrive - Triamber\YoutubeDownloads"

def check_local_duplicate(title: str, format_type: str, download_dir: str):
    target_exts = [".mp3"] if format_type == "audio" else [".mp4", ".mkv", ".webm"]
    
    def clean_fuzzy(s: str) -> str:
        return "".join(c.lower() for c in s if c.isalnum())
        
    fuzzy_title = clean_fuzzy(title)
    if not fuzzy_title:
        return None
        
    try:
        if os.path.exists(download_dir):
            files = os.listdir(download_dir)
            for f in files:
                name, ext = os.path.splitext(f)
                if ext.lower() in target_exts:
                    if clean_fuzzy(name) == fuzzy_title:
                        return os.path.join(download_dir, f)
    except Exception:
        pass
    return None

try:
    from src.services.ai_vocal_processor import AIVocalProcessor
    local_path = check_local_duplicate("test", "audio", DOWNLOAD_DIR)
    print("Local path:", local_path)
    # We won't run demucs here to save time, but we just check if it instantiates
    processor = AIVocalProcessor(workspace_dir=os.path.join(BASE_DIR, "ai_workspace"))
    print("Instantiated AIVocalProcessor")
except Exception as e:
    print("Error:", repr(e))
