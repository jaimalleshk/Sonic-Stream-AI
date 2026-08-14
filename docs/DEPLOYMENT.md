# SonicStream Web PWA — Build & Deployment

How to publish new audio to Azure and deploy the PWA to Azure Static Web Apps.

> Companion docs: [PWA_TECHNICAL.md](PWA_TECHNICAL.md),
> [PWA_FUNCTIONAL.md](PWA_FUNCTIONAL.md). See also root `SETTINGS_GUIDE.md`.

---

## 1. Secrets model (read first)

Secrets never live in git or in the deployed static files (by default):

| File | In git? | Contents |
|---|---|---|
| `keys.json` | **gitignored** | Real Azure account / SAS token / OneDrive link |
| `keys.example.json` | committed | Template with placeholders |
| `web-pwa/config.js` | **gitignored** | Generated `window.SONICSTREAM_CONFIG` |
| `web-pwa/settings.json` | committed **blank** | Runtime config; blank `""` values in git |
| `sync_azure_batch.py` | **gitignored** | Holds the storage **account key** for uploads |
| `web-pwa/media/` | **gitignored** | 46 MB of bundled audio; production streams from Blob |

On the deployed site, the user pastes the SAS token once in **Settings**
(stored in their browser's IndexedDB). Nothing sensitive is served publicly.

---

## 2. Publish new audio to Azure Blob

After downloading new tracks in the desktop app:

```bash
python sync_azure_batch.py
```

This uploads every new `.mp3` (and cover/json) from the configured download
folders to the `stsonicstream / media` container. **The blob name is the file's
on-disk basename** — this is the name the manifest must reference.

---

## 3. Regenerate the manifest and build the PWA

```bash
# Blank the keys for a safe git check-in AND regenerate the manifest:
python deploy_pwa.py clean

# OR inject real keys locally (writes gitignored config.js/settings.json) and regenerate:
python deploy_pwa.py inject
```

Both regenerate `web-pwa/playlists_manifest.json` and `manifest_fallback.js` from
`history.json`, resolving each track's **real on-disk filename** (so manifest
names match the uploaded blob names — see PWA_TECHNICAL §6) and real per-track
thumbnails.

`build_pwa.py` is an alternative that only writes `config.js` from
`pwa_config.json`.

---

## 4. Deploy to Azure Static Web Apps

The repo currently has **no GitHub Actions workflow**, so deployment is manual
via the Azure CLI / SWA CLI. Two options:

### Option A — connect the repo (recommended long-term)

In the Azure Portal → **Static Web Apps** → create/connect to the GitHub repo
`jaimalleshk/SonicStream-YouTube-Downloader`, app location `/web-pwa`. Azure adds
a GitHub Actions workflow; thereafter **`git push` auto-deploys**.

### Option B — manual CLI deploy

```bash
# 1. Log in (this account/tenant requires MFA for the management plane):
az login --tenant db659a83-b811-41fb-946b-fd4f7e813864 --use-device-code

# 2. Find the Static Web App:
az staticwebapp list -o table

# 3. Get its deployment token:
az staticwebapp secrets list -n <APP_NAME> -g <RESOURCE_GROUP> \
   --query "properties.apiKey" -o tsv

# 4. Deploy the web-pwa folder (needs the SWA CLI: npm i -g @azure/static-web-apps-cli):
swa deploy ./web-pwa --deployment-token <TOKEN> --env production
```

> **Note:** as of this writing, `az staticwebapp list` returned
> `AADSTS50076` (MFA required). Re-run `az login` with the `--tenant` above and
> complete MFA before steps 2–4.

Commit the blank-keys state before pushing:

```bash
python deploy_pwa.py clean
git add web-pwa deploy_pwa.py
git commit -m "PWA: <change>"
git push origin HEAD:master
```

---

## 5. Azure Blob CORS (if cross-origin streaming fails)

The player routes audio through a Web Audio graph for the loudness boost, which
requires CORS for cross-origin media. If streamed (non-cached) tracks fail on the
deployed site while cached ones play, allow the site origin on the storage
account (data-plane, uses the account key — no MFA):

```bash
az storage cors add --services b --methods GET HEAD OPTIONS \
  --origins "*" --allowed-headers "*" --exposed-headers "*" --max-age 3600 \
  --account-name stsonicstream --account-key <ACCOUNT_KEY>
```

Tighten `--origins` to your Static Web App domain for production.

---

## 6. Post-deploy checklist

1. Open the deployed URL; confirm it routes to desktop/mobile correctly.
2. Settings → paste the **SAS token** → **Sync / Refresh**.
3. Confirm playlists load with distinct covers and tracks play.
4. On a pinned phone app, use **Update** to pull the newest build.
