# Handoff: Wi-Fi Sync feature (`feature/wifi-sync` branch)

**Author:** Claude (working on the companion iPhone app, MusicApp)
**Date:** 2026-07-03
**For:** Antigravity — review and merge when you're back in quota.

## Why

The iPhone companion app (MusicApp, github.com/jaimalleshk/MusicApp) mirrors
SonicStream's playlists and plays the downloaded MP3s. To get playlists + files
onto the phone without a USB cable, the phone pulls them from SonicStream's
FastAPI server over the local Wi-Fi network. SonicStream previously bound to
`127.0.0.1:<random>`, which is unreachable from other devices — this branch
adds an **opt-in** Wi-Fi Sync mode.

## Design constraints honored

- **Nothing existing was modified.** `main.py` changes are a single appended
  section (marked `Wi-Fi Sync module`) — `git diff master main.py` shows
  additions only, before the `if __name__` block. No frontend files touched
  (your uncommitted player/playlists work was snapshot-committed as-is on
  `master` before branching — commit "Snapshot: current working state").
- **Off by default.** Without `sync_config.json` saying `"enabled": true`,
  `gui.py` behaves byte-for-byte like before: loopback host, random port.
- **Token-protected.** All sync endpoints except `/api/sync/info` require a
  pairing token (`X-Sync-Token` header or `?token=`). Tokenless requests are
  only honored from 127.0.0.1 (the desktop UI itself). Token comparison uses
  `secrets.compare_digest`. `sync_config.json` is gitignored (holds the secret).

## What was added

| File | Change |
|---|---|
| `main.py` | Appended Wi-Fi Sync module: config loader + 4 endpoints (below) |
| `gui.py` | Reads sync config at launch; binds `0.0.0.0:<fixed port>` only when enabled and the port is free, else falls back to old behavior. WebView URL unchanged (`127.0.0.1`) |
| `wifi_sync_setup.py` | New CLI helper: `on` / `off` / `new-token` / status+pairing info |
| `.gitignore` | + `sync_config.json` |
| `HANDOFF-WIFI-SYNC.md` | this file |

### Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/sync/info` | none | Discovery ping: app name, sync version, enabled flag |
| `GET /api/sync/manifest` | token | All non-deleted **audio** playlists (video jobs excluded), each track with `file` = exact local filename or `null` if not downloaded. Uses the same fuzzy title→filename rule as `check_local_duplicate` (one `listdir` per folder, indexed) |
| `GET /api/sync/file/{playlist_id}/{filename}` | token | Serves one MP3 from that playlist's `download_dir`. Basename + `commonpath` containment checks against traversal |
| `POST /api/sync/export-manifest` | token | Writes `playlists_manifest.json` into the downloads folder so playlist structure travels with the files on USB/OneDrive transfers too |

### Manifest schema (v1) — the iPhone app is built against this

```json
{
  "version": 1, "app": "SonicStream", "exported_at": "ISO-8601",
  "playlists": [{
    "id": "job_1783080277", "title": "All Songs", "pinned": true,
    "track_count": 833, "available_count": 531,
    "tracks": [{ "file": "Manasa Palakave.mp3", "size": 13251658,
                 "title": "Manasa Palakave",
                 "artist": "S.P.Balasubramanyam - Topic", "duration": 311,
                 "youtube_id": "efv3iHUarxY" }]
  }]
}
```

Please treat this schema as a contract: add fields freely, but don't rename or
remove existing ones without bumping `version`.

## Verified (2026-07-03, real data: 833-track history, 407-file folder)

- `import main` clean; all 4 routes registered; existing `/api/history` unaffected
- Wrong token → 401; good token → manifest (All Songs: 531/833 files resolved)
- File download: 200, 13.2 MB MP3 streamed; `..%5C` traversal → 400
- Export writes `playlists_manifest.json` (3 playlists) into the downloads folder
- Default launch path (sync disabled): unchanged behavior confirmed by code path

## User-facing flow (current, no UI)

1. `python wifi_sync_setup.py on` → prints server URL + token
2. Restart SonicStream (allow the one-time Windows Firewall prompt)
3. In the iPhone app: enter `http://<pc-ip>:8765` + token → pulls manifest, downloads tracks

## Later additions (2026-07-03)

- Manifest tracks now include `size` (bytes, nullable) — the phone skips large
  files before downloading (user setting, default: skip > 30 MB).
- Bug fix: `import_playlist` now records `download_dir = folder_path`; before
  this, folder-imported playlists resolved to `file: null` for every track in
  the sync manifest (found while building the phone-side sync).
- A small "Sync Test" playlist (4 generated tones from
  `C:\Users\jaima\Music\MusicAppTest`) exists in history — it's the standing
  sample for end-to-end sync tests; please leave it in place.

## Suggested follow-ups for you (not done, by design)

- Settings UI section: Wi-Fi Sync toggle, show IP/port/token, QR code for pairing
  *(done — see 05013a4 and the Settings modal)*
- Call `POST /api/sync/export-manifest` automatically after each completed download job
- Optional: mDNS/Bonjour advertisement so the phone can discover the PC without typing an IP

## Session 2026-07-03 (later): Antigravity WIP completed + UI requirements

Antigravity ran out of quota mid-task; its uncommitted work was preserved as
snapshot commit `bc140cf`. That WIP plus this session together implement the
user's requirements list. Status:

**Already in Antigravity's WIP (`bc140cf`), verified working:**
- Active Job HUD moved above the playlist grid, outside the playlist card,
  with a distinct cyan-tinted background (`.active-job-hud` in `style.css`)
- HUD shows playlist title first, then `↳ <current file>` (new
  `playlist_title` field in `download_state` and the SSE payload)
- Persistent **Individual Downloads** playlist (`id: individual_downloads`):
  single-link downloads route into it in `/api/download`; legacy single-track
  jobs are migrated into it on first `/api/history` call
- Pause counter / player status font doubled (0.65rem → 1.3rem)
- Playlist sidebar stretches to match the grid panel height
  (removed min/max-height constraints; verified bottoms align)

**Added this session (uncommitted on `feature/wifi-sync`):**
- `--text-muted` redefined from gray `#64748b` to `var(--neon-blue)` in
  `style.css` — fixes low-contrast text app-wide via the one variable
- Sidebar track-count line (and % badge) 0.65rem → 0.8rem (`app.js`)
- **Error Details** column after Status in the items grid, populated from
  `error_detail` and updated live from the SSE stream (colspans bumped 8 → 9,
  table min-width 900 → 1080px)
- **All Downloads** virtual playlist now aggregates **audio jobs only**
  (`get_history` skips `format == "video"`); it remains computed-on-request,
  hence permanent and non-deletable by construction
- Individual Downloads records `download_dir` on each queue so the sync
  manifest can resolve its files (same class of bug as the folder-import fix)
- Removed the dead History modal from `index.html` (its open button was
  already gone in the WIP; it held the obsolete Playlists/Single-Files split)
- `.claude/launch.json` added for browser preview via
  `uvicorn main:app --port 8971`

**Note for next session:** the requirement "remove the playlist and individual
download tabs" had no literal match in the UI (sidebar tabs are
Pinned/All/Trash and were left alone); the History modal removal was the
closest fit. Re-check with the user if they meant something else.

**MusicApp direction (documented in memory, not implemented here):** docs will
position the phone app as paired-with-server but standalone-capable — point it
at a folder and import `playlists_manifest.json` (schema v1, same contract as
Wi-Fi Sync). Pipeline: direct YouTube sync with ~2-track lookahead (no full
pre-download), then OneDrive/Google Drive via their APIs.

## Session 2026-07-04: history.json data-loss postmortem + fixes

**Incident:** user lost all playlists (incl. pins) overnight; re-added ones
kept vanishing while new downloads ran.

**Root cause:** `save_history()` wrote history.json non-atomically (truncate
then dump, ~600 KB, once per progress tick during downloads) and
`load_history()` silently returned `[]` on any parse error. Killing the
process mid-write (app close during a download; also the preview-server stop
in the previous session) left a truncated file → next load returned `[]` →
the next save persisted the empty list. Repeated wipes while re-adding were
the same cycle. OneDrive locking the file is an aggravating factor.

**Fixes in `main.py` (history helpers):**
- Atomic saves: dump to `history.json.tmp` + fsync, then `os.replace` swap
  (with a short retry for OneDrive/AV locks). Truncation now impossible.
- `history.json.bak` keeps the previous good version on every save;
  `load_history()` falls back to it and preserves the corrupt main file as
  `history.json.corrupt-<ts>` for forensics.
- `save_history([])` is refused unless `allow_empty=True` (only
  `/api/history/clear` passes it) — a failed load can no longer wipe the file.
- All unit-tested (roundtrip, .bak rotation, corrupt fallback, empty-save
  guard, explicit clear).

**New: playlists backup/restore (Settings → Playlists Backup):**
- `POST /api/playlists/export` → writes
  `sonicstream_playlists_backup_<ts>.json` into the downloads folder
  (all playlists incl. pins, download_dir, track states).
- `POST /api/playlists/import-all` → merges a backup: new playlists appended,
  existing matched by id **or URL** (tracks deduped by track id, pins
  restored), and every incoming track re-verified against files on disk —
  found → `skipped` (playable), missing → `queued` (re-downloadable).
- Recovery executed: imported the git-HEAD history.json via this endpoint —
  restored "English songs" (14/15 on disk), "Sync Test" (4/4) and Bhakthi's
  pin. Manual backup kept as `history-manual-backup-*.json` (gitignored).

**Other fixes this session:**
- HUD "Overall" now shows job-wide progress (baseline of already-done tracks
  + this run, over the job's full track count) via new SSE fields
  `job_done_baseline`/`job_total_tracks` — it previously showed
  session-queue-only numbers (user saw 145/779 vs sidebar 591/833).
  Sidebar also refreshes (throttled 10s) during downloads, and the page
  reattaches to an in-flight download's progress stream on load.
- Skipped tracks: `get_history` annotates `file_missing` (fuzzy filename
  index per download_dir, same rule as the sync manifest); UI shows
  "Skipped" instead of "Downloaded" when the file is not actually on disk,
  and the player treats such tracks as not downloaded.
- Pause counter stuck at "Pause (1s)": `isTrackDownloaded()` only consulted
  `localItemStates` (rebuilt for whichever playlist is open in the grid), so
  auto-advance found "no downloaded tracks" after browsing another playlist
  and silently gave up. It now falls back to the track's own `status`, and
  all no-next-track paths reset the player status text ("Ready").
- `.gitignore`: history backup/tmp/corrupt artifacts excluded.

**Schema note:** track dicts in `/api/history` responses may now carry a
transient `file_missing` bool (not persisted). Backup files use
`{app, type: "playlists_backup", version: 1, exported_at, playlists: [...]}`
— treat as a contract like the sync manifest.

## Session 2026-07-04 (later): GitHub issues #4–#13, restore hang + UI batch

All work tracked as GitHub issues (jaimalleshk/SonicStream-YouTube-Downloader
#4–#13). Fixed and verified this session:

- **#4 restore hang (the "stuck 3 hours" report):** not a hang — a retry
  storm. Every auto-resume re-queued permanently dead YouTube videos
  (unavailable/private/terminated), each burning 3 retry attempts, serialized
  before other playlists' jobs. Now: `is_permanent_download_error()` detects
  those, they get terminal status **`unavailable`** (new), retries are
  skipped, and resume excludes them (Force All still retries). A one-time
  migration in `get_history` converted existing permanent errors — live
  result: 120 tracks became `unavailable`, All Songs resume queue dropped
  from 184 to ~74 real candidates. `unavailable` counts as failure in job
  counts; new option in the grid status filter.
- **#5 import delta-only:** playlist matching by id → URL → title (URL-less
  manual playlists); verified double re-import = 0 imported / 0 tracks added.
- **#6 playlist ordering:** display order == list position in history.json.
  `POST /api/history/{id}/move` {direction: up|down} swaps with the
  neighboring visible playlist; up/down arrows on sidebar rows; new/imported
  playlists now **append at the end** (was insert-at-top); export/import
  preserve order.
- **#7 smooth seek ball:** range input had default step=1 (1% jumps) →
  `step="any"` + requestAnimationFrame loop while playing.
- **#8 checkbox alignment:** grid `td` had no padding rule (browser default)
  vs `th` 0.5rem → uniform cell padding + normalized checkbox boxes.
- **#9 pager buttons:** `.pager-btn` class — neon blue enabled, literal grey
  `#64748b` when disabled (note: `--text-muted` is now blue, so disabled
  states need the literal grey).
- **#10 Active Job HUD:** cyan → purple theme (bg/border/pulse-ring/accents).
- **#11 sortable grid columns:** #, Title, Channel, Duration, Status, Error
  Details; click cycles asc ▲ / desc ▼ / reset-to-playlist-order.
- **#12 Analyze bar moved into the header** (logo | analyze | Settings);
  hero is now player (left) + reserved `#utilityPanel` placeholder (right).
- **#13 (OPEN, awaiting owner):** what goes into the reserved panel —
  weather via Open-Meteo vs Up-Next/stats/visualizer alternatives.

**Notes for next session:**
- "Sync Test" playlist is in Trash (`deleted: true`) — the user trashed it
  during their overnight session; restore from Trash tab if needed for sync
  testing.
- The user's stale duplicate report of the HUD-count / skipped-status /
  pause-counter items was re-confirmed as already fixed (previous session).
- Verified live on a real All Songs resume: HUD shows job-wide 621/833
  matching the sidebar.

## Session 2026-08-13: Auto Play Schedule module (#36) + history regression (#37)

Scope note: desktop app only. `web-pwa/` was explicitly out of scope this
session (Antigravity owns that area and has taken it a long way).

### #37 — regression found in HEAD, fixed first (was blocking)

`is_permanent_download_error()` referenced `PERMANENT_DL_ERROR_PATTERNS`, but
the tuple itself was missing from the branch — the function survived a later
merge while its constant did not. Effect: **GET /api/history returned 500**
for any history containing a track with status `error`, which breaks the
desktop playlist sidebar and everything that loads history. Constant restored
next to the function. Worth a glance at whether the PWA side inherited the
same gap.

### #36 — Auto Play Schedule

Terminology per the owner: the module is **Auto Play Schedule**, items are
**playback entries** (not "appointments").

**Nothing about playback was rewritten.** The engine drives the existing
components: `selectPlaylist()`, `playTrack()`, `generateShuffleOrder()`,
`isTrackDownloaded()` and the same `#playerVideo` element/controls.

- **Storage:** `schedules.json`, atomic write + `.bak` fallback, same pattern
  as history.json. Backup/tmp files gitignored.
- **API:** `GET/POST /api/schedules`, `PUT/DELETE /api/schedules/{id}`,
  `PATCH /api/schedules/{id}/fired` (records the consumed occurrence).
  Server-side validation of times, repeat, weekday range and targets.
- **Entry model:** playlist *or* single file; `mode` order|shuffle (ignored
  for single files); repeat once(date) | daily | weekly(days[]); start/end
  time; `enabled`; `last_fired` occurrence key.
- **Engine (`scheduleTick`, 1 s):** starts an entry when now falls inside its
  window, stops playback at end time, and writes `last_fired` so an
  occurrence never double-fires or restarts after a manual stop. Guarded so
  it cannot fire before `historyJobs` has loaded (startup race would have
  burned the occurrence on a bogus "playlist not found").
- **Overnight windows** (end <= start) roll into the next day; the current
  occurrence check also looks at yesterday for exactly this case.
- **Single-file entries stop after the track ends** — without the guard in the
  `ended` handler a one-track queue wraps around and loops forever.
- **Manual pause cancels the run** (hands control back to the user).
- **UI:** "Auto Play" header button + modal (entry list with enable/edit/
  delete, and an editor with playlist/single-file, order/shuffle, repeat with
  weekday chips, start/end times, overnight hint). The reserved
  `#utilityPanel` from #13 is now the schedule panel: active entry with
  minutes remaining, plus the next three upcoming entries.
- **Autoplay policy:** if the browser/webview blocks automatic playback, the
  console line says so explicitly instead of failing silently.

**Verified live** (real audio, real playlist): auto-start inside an open
window with shuffle applied; auto-stop at end time with the player returned
to "Ready"; no restart while the window stayed open; single-file entry played
once and stopped without advancing; `last_fired` persisted and `.bak`
rotated; recurrence math — overnight showed "Today 23:00", weekly landed on
the right weekday two days out, a past-dated once-entry never fired.

Issue #13 is now effectively answered for the panel space (schedule status);
weather/stats can still be revisited separately.

### Post-merge correction: hero layout regression (fixed in 4293e9d)

`1d425db` shipped a broken hero layout for a short window. The edit that
swapped the `#utilityPanel` placeholder for the Auto Play panel replaced only
the panel's **opening** tag, leaving the old placeholder text and its `</div>`
behind. That extra `</div>` closed the hero `<section>` early, so
`.dashboard-layout` (playlist sidebar + items grid) was absorbed into the
player's grid row instead of rendering below it. Owner spotted it immediately.

Fixed by deleting the two leftover lines. Verified afterwards by geometry, not
just by behaviour:
- `.hero-section` contains exactly `#playerControlsContainer` and
  `#utilityPanel`; `hero.contains(.dashboard-layout)` is false
- playlist sidebar top (311) >= player bottom (266), i.e. playlists sit below
- whole document passes an `HTMLParser` tag-balance check: no unclosed tags,
  no mismatched closers

**Lesson for whoever works here next (it bit this session):** behavioural
checks through `javascript_tool` are not sufficient for markup edits. When a
partial-tag replacement is involved, assert DOM containment/geometry and run
the tag-balance check. Screenshots were unavailable (Browser pane not
displayed) and that was treated as an inconvenience rather than as the missing
check — it was the one thing that would have caught this straight away.

State at handover: `schedules.json` holds the owner's first real entry
(Instruments, shuffle, daily 21:00-22:00), confirmed working on their side.
