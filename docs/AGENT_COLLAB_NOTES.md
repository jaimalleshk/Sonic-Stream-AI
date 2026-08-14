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
- **`master` is the deploy branch.** The user wants check-ins on `master`.
  `feature/wifi-sync` mirrors it. There is **no GitHub Actions workflow**, so
  `git push` does NOT auto-deploy — deploy is a manual SWA CLI step (§4).
- Commit messages should explain the *why* (root cause), not just the *what* —
  the audio bugs are subtle and the reasoning matters.

---

## 2. Architecture in one paragraph

Desktop app (`main.py`) downloads audio → `sync_azure_batch.py` uploads mp3s +
`playlists_manifest.json` to Azure Blob `stsonicstream/media`. The PWA
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
az login --tenant db659a83-b811-41fb-946b-fd4f7e813864 --use-device-code
# Static Web App: sonicstream-pwa / rg-sonicstream
TOKEN=$(az staticwebapp secrets list -n sonicstream-pwa -g rg-sonicstream --query "properties.apiKey" -o tsv)
# Exclude the 46 MB media/ (audio streams from Azure Blob), deploy, restore:
mv web-pwa/media ./_media_tmp
npx --yes @azure/static-web-apps-cli deploy ./web-pwa --deployment-token "$TOKEN" --env production
mv ./_media_tmp web-pwa/media
```

- Live URL: **https://salmon-hill-08be7d60f.7.azurestaticapps.net** (the
  `*.azurestaticapps.net` name is auto-generated and can't be renamed; a branded
  URL needs a custom domain).
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

## 6. Change Log (most recent first)

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
