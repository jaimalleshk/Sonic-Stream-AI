# Fix Playlist Issues and Restore Azure Sync

## User Review Required
No critical breaking changes. Please review the missing sync_azure_batch.py details.

## Open Questions
None.

## Proposed Changes

### 1. Azure Blob Sync (Backend)
- Add sync_azure_batch.py to read credentials from keys.json and upload files from DOWNLOAD_DIR to Azure Storage Blob (media container).
- Use zure.storage.blob via subprocess so it runs safely in the background.

#### [NEW] [sync_azure_batch.py](file:///D:/OneDrive/OneDrive-Projects/Sonic Stream AI/sync_azure_batch.py)
- Read keys.json.
- Iterate through DOWNLOAD_DIR and upload .mp3, .mp4 etc. skipping existing ones if possible.

### 2. Track Reordering (Frontend & Backend)
- The user reported "playlist up and down movement of items not working". Currently, there are no up/down buttons for tracks *inside* a playlist (only for the playlists themselves in the sidebar).
- Add up/down arrows to ctionButtons in static/app.js for tracks.
- Add backend endpoint /api/history/{job_id}/items/{track_id}/move.

#### [MODIFY] [main.py](file:///D:/OneDrive/OneDrive-Projects/Sonic Stream AI/src/main.py)
- Add move_track endpoint.
- Modify /api/media/stream to accept job_id so we can look up the correct download_dir if it differs from the current global input.

#### [MODIFY] [app.js](file:///D:/OneDrive/OneDrive-Projects/Sonic Stream AI/static/app.js)
- Add track up/down buttons.
- Update playTrack to pass job_id= to /api/media/stream so it correctly locates the Bhagavad Gita files in the OneDrive folder.

## Verification Plan
### Automated Tests
- N/A
### Manual Verification
- Verify the track up/down buttons reorder the UI.
- Verify Gita playlist plays locally.
- Verify Azure Blob Sync executes.
