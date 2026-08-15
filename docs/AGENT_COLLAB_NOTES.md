# Agent Collaboration Notes — SonicStream Web PWA

Shared working notes between **Claude Code** and **Antigravity** (and any future
agent) on `web-pwa/`. The user (Jai) drives both of us. Please keep this file
current: append to the Change Log and update Open Items as you go.

> Deeper reference: `docs/PWA_TECHNICAL.md`, `docs/PWA_FUNCTIONAL.md`,
> `docs/DEPLOYMENT.md`, and the memory notes.

---

## 1. Ground rules for partnering

- **Read the recent git log before editing** — we both touch `web-pwa/app.js`.
  Check `git log --oneline -10` and `git diff` for uncommitted work so we don't
  clobber each other. (I found an uncommitted in-progress `app.js` from you and
  built on it rather than reverting.)
- **`master` is the deploy branch** and the only branch in this repo. There is
  **no GitHub Actions workflow**, so `git push` does NOT auto-deploy — deploy is a
  manual SWA CLI step (§4), and it needs `inject_public_config()` first (§5b #4).
- **This repo (`Sonic-Stream-AI`, private) is now the active one**, replacing
  `SonicStream-YouTube-Downloader`. Python lives under `src/`; `web-pwa/` is
  byte-identical to the old repo's, so PWA knowledge and defects carry over.
- **Verify against reality, not the UI.** Read the live blob container with the
  azure SDK and `curl` HEAD real track URLs. Several bugs here looked like one
  layer failing while the actual fault was elsewhere.
- Commit messages should explain the *why* (root cause), not just the *what* —
  the audio bugs are subtle and the reasoning matters.

---

## 2. Architecture in one paragraph

Desktop app (`main.py`) downloads audio → `sync_azure_batch.py` uploads mp3s +
`playlists_manifest.json` to Azure Blob `<your-storage-account>/media`. The PWA
(`desktop.html` / `mobile.html` over one shared `app.js`) reads the manifest,
streams from the blob via a read-only SAS token, and caches blobs in IndexedDB
(`SonicStreamPWA_DB`: stores `settings`, `playlists`, `files`). **Join is by
filename** (`track.file` === `files.file_id`); **no URLs are persisted** — URLs
are rebuilt at runtime from config, so the manifest `file` MUST equal the real
blob name (yt-dlp sanitizes names, e.g. `|` → fullwidth `｜` U+FF5C).

---

## 3. The audio / background subsystem (READ BEFORE TOUCHING)

This is the fragile, high-value area. Key invariants and hard-won lessons:

- **No Web Audio graph on phones.** `initWebAudioEngine()` returns early when
  `isPhoneDevice()`. iOS suspends the `AudioContext` on screen-lock/background —
  that stopped playback, made the lock-screen Play button do nothing, and its
  compressor caused an echo on pause. Plain `<audio>` keeps playing in the
  background and obeys lock-screen / car Bluetooth controls. **Consequence:**
  the volume *boost* (>100% gain) only works on desktop. A mobile volume slider
  (0–100% via `audioElement.volume`) is the background-safe option.

- **Screen-off auto-advance = `playNextTrackBackground()`.** Fired from the
  `ended` handler when `document.hidden`. Design (do not regress):
  - IndexedDB-FIRST: a cached blob plays instantly (`setAudioBlobSrc`, which
    revokes the previous object URL).
  - If NOT cached: stream the Azure URL **directly**. **Never** do a second
    concurrent `fetch()` of the same file to "auto-cache" it — that doubles
    bandwidth, starves the audio buffer, and stalls playback mid-song (this was
    the "3rd song stopped in the middle" bug). Caching is done PROACTIVELY by
    `prefetchUpcomingTracks` (foreground window = 5), plus a top-up of the next
    2 tracks only when the current track is playing from cache (no stream to
    contend with).

- **MediaSession (lock screen / car):** register only `play`, `pause`,
  `previoustrack`, `nexttrack`; explicitly set `seekto`/`seekbackward`/
  `seekforward` to `null`. On iOS, any seek handler replaces Next/Previous with a
  scrubber / 15s-skip. Metadata artwork uses the track thumbnail (there is no
  `icon-512.png`).

- **Recovery:** the in-app Play button reloads the current track via `playTrack`
  if `audioElement.error` is set (a stalled background stream can't be resumed).

---

## 4. Deploy (manual — no CI)

```bash
# Azure management plane needs MFA each session:
az login --tenant <your-tenant-id> --use-device-code
# Static Web App: <your-swa-name> / <your-resource-group>
TOKEN=$(az staticwebapp secrets list -n <your-swa-name> -g <your-resource-group> --query "properties.apiKey" -o tsv)
# Exclude the 46 MB media/ (audio streams from Azure Blob), deploy, restore:
mv web-pwa/media ./_media_tmp
npx --yes @azure/static-web-apps-cli deploy ./web-pwa --deployment-token "$TOKEN" --env production
mv ./_media_tmp web-pwa/media
```

- Live URL: **`<your azure static site>`** — the real value lives in `keys.json`
  under `pwa_site_url` (gitignored, never published). The
  `*.azurestaticapps.net` name is auto-generated and can't be renamed; a branded
  URL needs a custom domain.
- Deployment identifiers (tenant id, resource group, Static Web App name, storage
  account) are deliberately NOT written into tracked docs — keep them in
  `keys.json`.
- **SAS/secrets model:** `web-pwa/settings.json` and `config.js` stay BLANK in
  git and in the deploy. The user pastes the read-only SAS token in the app
  Settings on each device (saved to IndexedDB). Do NOT inject secrets into the
  deployed files.
- Uploading audio to the blob (data plane) uses the account key in
  `sync_azure_batch.py` (gitignored). Example: the 18 Gita `audio_chapter_*.mp3`
  were uploaded with `az storage blob upload-batch ... --destination media`.

---

## 5. Testing constraints

- The Claude in-app browser is MSIX-Electron and **cannot decode MP3** (bare
  `<audio>`, blobs, and the app all fail with `MEDIA_ERR_SRC_NOT_SUPPORTED`; a
  synthesized WAV plays). So audible MP3 playback can only be verified in a real
  browser / on the phone. Verify control flow + DOM structurally here; the user
  does the real audible/car test.
- A combined static+media test server pattern (serve `/api/media/file/<name>`
  from `web-pwa/media`) was used for local audio-path testing.

---

## 5b. HARD-WON INVARIANTS — read before touching cloud/sync/audio

Each of these cost real debugging. Breaking one silently breaks the product.

1. **`BASE_DIR` must be the repo root, not `src/`.** Modules live in `src/` but
   `history.json`, `keys.json` and `web-pwa/` are one level up. The src/ restructure
   left `deploy_pwa.py` computing `dirname(__file__)`, so it read **no history** and
   silently generated a manifest with **ZERO playlists** — that alone is why new
   playlists (Gita) never reached the PWA. Use `dirname(dirname(abspath(__file__)))`.

2. **Never upload raw `history.json` as `playlists_manifest.json`.** Different
   schemas: history is a list of download jobs; the PWA needs
   `{playlists:[{tracks:[{file,…}]}]}` with **resolved** blob filenames (yt-dlp
   rewrites `|` → fullwidth `｜` U+FF5C and truncates long titles). Always publish
   `deploy_pwa.generate_pwa_manifest()` output. We no longer publish `history.json`
   to the blob at all (it exposed the whole local catalogue).

3. **The PWA reads `./playlists_manifest.json` (its own deployed copy) BEFORE the
   blob copy.** Publishing to the blob alone will NEVER update the phone — the
   static site must be redeployed. This wasted a full debugging cycle.

4. **Run `deploy_pwa.inject_public_config()` before every SWA deploy.** The PWA has
   no Settings field for the storage account and the committed `settings.json` is
   blank, so without injection the app has no account and **nothing plays**. It
   writes account+container only; secrets stay blank (SAS is still pasted
   per-device). Run `clean_keys()` before committing.

5. **Never blind-`put` into the IndexedDB `files` store.** `put()` replaces the
   whole record; playlist sync writes metadata-only rows and previously destroyed
   every cached audio blob — i.e. every "Refresh" wiped the offline cache. Merge.

6. **Sync must prune.** `syncPlaylists()` only added/updated, so playlists removed
   upstream lingered in IndexedDB and rendered beside their replacements (two
   "Bhagavad Gita" entries). Desktop-sourced playlists absent from the manifest are
   now deleted; locally created ones are left alone.

7. **Empty playlists are filtered out of the manifest.** A zero-track duplicate
   "All Songs" sorted above the real 833-track one, so opening it looked exactly
   like "the collection disappeared".

8. **Never gate audio behaviour on viewport width.** `isPhoneDevice()` is
   `innerWidth <= 768`; in landscape an iPhone reports ~850–930px, which let the
   Web Audio graph be built on the phone. `createMediaElementSource()` reroutes the
   element's output permanently and iOS suspends the context on lock → the playback
   clock advances with **no sound**. Use `isMobileAudioDevice()` for anything audio.

9. **Diagnosing "no sound": ask FIRST whether the progress bar moves.** Moving =
   audio running into a dead output (routing/session). Frozen = playback blocked.
   Not asking this cost ~4 wrong fixes on the lock-screen resume bug.

10. **`node --check` does NOT catch temporal-dead-zone errors.** `web-pwa/app.js`
    calls `populateSettingsUI()` long before `let db` is initialised; any helper
    touching `db` there throws (and `typeof` throws too in a TDZ — use try/catch).
    Always load the page after editing `app.js`.

11. **Desktop app changes need a restart.** `src/main.py` and `static/` do not
    hot-reload; several "your fix didn't work" reports were stale processes.

---

## 6. Change Log (most recent first)

### Sonic Stream AI repo (2026-08-15, Claude Code) — cloud/sync session

- **fbb6d33** — removed deployment identifiers from the repo (site URL, tenant id,
  resource group, SWA name, storage account); real values now in gitignored
  `keys.json`. Added `deploy_pwa.inject_public_config()` because the storage
  account was NOT just docs — it was a hardcoded fallback in `app.js` and the only
  thing making playback work (see invariant #4).
- **4d53856** — filter empty playlists out of the manifest (blank duplicate
  "All Songs" was masking the real one). Live manifest 14 → 10 playlists.
- **cb10de3** — `showToast()` was **called in 4 places but never defined**, so the
  Azure Sync button threw on its success path, threw again in the catch, and left
  itself permanently disabled: "clicking Sync does nothing". Implemented it and
  made polling own the button state. Also prune stale PWA playlists.
- **ccd5b01** — `sync_azure_batch.py` un-ignored (verified secret-free; it reads
  everything from `keys.json`) so the sync fix actually ships. Sync now regenerates
  and publishes a real manifest instead of raw history.json.
- **819d80e** — fixed `deploy_pwa` BASE_DIR (manifest 0 → 14 playlists); Azure
  Explorer left panel read a blob that does not exist (`history.json`) and required
  a list when the manifest is a dict, so it was always empty — now reads
  `playlists_manifest.json` and returns an exact manifest-track → blob join
  (`playlist_summaries`) so selecting a playlist filters the grid; sync progress no
  longer claims success for a sync that never ran.
- Uploaded 20 files / 788 MB that had never synced (incl. all 18 Gita chapters).
  Gita now 18/18 resolving; **Gita plays on the phone** (user-confirmed).

**Known-good verification method:** inspect the live container read-only with the
azure SDK and `curl` HEAD against real track URLs. That is how every claim above was
checked — do not trust the UI alone.

- **Claude Code (7122848):** removed OneDrive UI (dead weight — audio is on
  Azure); between-track pause defaults to 0/gapless (a silent gap can let iOS
  drop the session; background never pauses); visible settings-modal scrollbar.
- **Claude Code (f13b619):** Trace Logs moved into the header (removed the
  floating button that overlapped Play); mobile transport buttons made square +
  bigger (play 60px r12, prev/next 50px squares).
- **Claude Code (08ea75e):** fixed screen-off mid-song stall (removed the
  double-download; IndexedDB-first advance); lock-screen Next/Prev (dropped seek
  handlers); bigger mobile player controls (60px play); mobile volume
  control (slider popup, 0–100%); shuffle on mobile card; uploaded Gita blobs.
- **Claude Code (b37604c):** iOS background audio (Web Audio off on phones),
  MediaSession art, icon-only desktop buttons, settings-modal scroll fix,
  logo→Home, mobile card actions + tracks toolbar, header cleanup, favicons,
  deleted-last sort, settings persisted to IndexedDB, IndexedDB-browser column.
- **Antigravity (51898a9, 74b105d, 3702902):** bigger mobile buttons, initial
  lock-screen next/prev, initial screen-off advancement, inline mobile playlist
  controls, desktop app YouTube downloading + Azure auto-sync + Gita manifest.
- **Claude Code (90799d5 … 2ae48b2):** mobile crash fix, IndexedDB browser fix,
  Azure filename/thumbnail fixes, music-note logo, full-width sidebar buttons,
  docs.

---

## 7. Open items / trade-offs to discuss with the user

### Current open items in THIS repo (GitHub issues)

- **#10 SECURITY — container is publicly readable.** `public_access = blob`, so any
  blob downloads anonymously (verified: `curl` → HTTP 200, 2.6 MB, no SAS). The SAS
  provides no read protection. Worse, `playlists_manifest.json` is served publicly
  and lists all 1214 filenames. Listing is disabled, but the manifest removes the
  need to list. **Deliberately NOT changed** — flipping the container to private
  breaks playback on any device without a valid SAS. Needs a user decision.
- **#5** `/api/history/{job}/items/{track}/ai-karaoke` is registered **twice** in
  `src/main.py` (lines ~2357 and ~2560). FastAPI matches the first; the second
  (which lacks `background_tasks`) is unreachable dead code. Confirm which is
  correct and delete the other.
- **#6** Voice-to-Instrument quality — pitch extraction carries breath/vibrato
  artifacts into MIDI. Needs stronger smoothing or an end-to-end voice→MIDI model.
- **#7** README still says `python main.py`; entry point is `src/main.py`.
- **160 of 1214 manifest tracks have no blob** (135 in "All Songs") — their local
  files are gone from the download folder, so sync cannot upload them. The explorer
  now flags this per playlist with a ⚠ count rather than hiding it.
- **Old-repo defects not yet carried over.** 16 open issues in
  `SonicStream-YouTube-Downloader`; the PWA ones apply unchanged because `web-pwa/`
  is byte-identical. Its #23 (one-click Azure upload) is DONE here.
- **PWA lock-screen/Bluetooth resume is still unsolved** (old repo #38): resume
  succeeds but is silent. Needs on-device diagnostics, not another blind fix.

### Pre-existing trade-offs

- **Volume boost on mobile:** currently 0–100% only (background-safe). Boost
  >100% requires the Web Audio graph, which breaks iOS background playback.
  Needs a user decision (reliability vs loudness), possibly an opt-in toggle.
- **Durable offline for long playlists with screen off:** proactive prefetch
  caches ahead, but iOS throttles background fetch, so tracks far beyond the
  prefetch window may stream (reliable) rather than play from cache. "Download
  All" guarantees full offline.
- **Gita:** now streams from Azure blob (uploaded). If the user prefers it fully
  local, deploy `web-pwa/media/` and point Gita tracks at `./media/...` via a
  `downloadUrl` in `deploy_pwa.py`.
- The `web-pwa` div balance in `desktop.html` has a pre-existing minor imbalance
  (non-fatal); worth a cleanup pass.
