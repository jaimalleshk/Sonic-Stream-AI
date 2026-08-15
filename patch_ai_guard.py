def patch_guards():
    with open('src/main.py', 'r', encoding='utf-8') as f:
        content = f.read()

    guard_code = """
        track_title = target_track.get("title", "")
        if " - AI Muted Vocals" in track_title or " - AI Instrumental" in track_title or " - AI Vocals Only" in track_title:
            raise HTTPException(status_code=400, detail="Track is already AI processed.")
"""

    import re

    # Replace in process_ai_mute_stream
    mute_stream_pattern = re.compile(r'(async def process_ai_mute_stream.*?track_title = target_track\.get\("title", ""\))', re.DOTALL)
    content = mute_stream_pattern.sub(r'\1\n        if " - AI Muted Vocals" in track_title or " - AI Instrumental" in track_title or " - AI Vocals Only" in track_title:\n            raise HTTPException(status_code=400, detail="Track is already AI processed.")', content)

    # Replace in process_ai_instrument_stream
    inst_stream_pattern = re.compile(r'(async def process_ai_instrument_stream.*?track_title = target_track\.get\("title", ""\))', re.DOTALL)
    content = inst_stream_pattern.sub(r'\1\n        if " - AI Muted Vocals" in track_title or " - AI Instrumental" in track_title or " - AI Vocals Only" in track_title:\n            raise HTTPException(status_code=400, detail="Track is already AI processed.")', content)

    # Replace in generate_ai_karaoke
    karaoke_pattern = re.compile(r'(async def generate_ai_karaoke.*?target_job, target_track = _get_target_track\(job_id, track_id\)\n\s+if not target_track or not target_job:\n\s+raise HTTPException.*?)\n', re.DOTALL)
    
    karaoke_guard = """
    track_title = target_track.get("title", "")
    if " - AI Muted Vocals" in track_title or " - AI Instrumental" in track_title or " - AI Vocals Only" in track_title:
        raise HTTPException(status_code=400, detail="Track is already AI processed.")
"""
    content = karaoke_pattern.sub(r'\1' + karaoke_guard, content)

    # Replace in generate_ai_instrumental
    instrumental_pattern = re.compile(r'(async def generate_ai_instrumental.*?target_job, target_track = _get_target_track\(job_id, track_id\)\n\s+if not target_track or not target_job:\n\s+raise HTTPException.*?)\n', re.DOTALL)
    content = instrumental_pattern.sub(r'\1' + karaoke_guard, content)

    with open('src/main.py', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    patch_guards()
