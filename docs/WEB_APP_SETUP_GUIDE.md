# SonicStream Web/Mobile Player — Set Up Your Own Cloud Instance

> **Important:** the web/mobile player is **not a hosted service.** To use it, **you
> host your own copy** on Azure Static Web Apps (free tier) and point it at **your
> own** Azure Blob Storage where your audio lives. This guide walks a new user
> through the whole thing.
>
> **You do NOT need the web app to enjoy your music** — the **desktop app already
> downloads and plays** everything locally (see `DESKTOP_APP_USER_GUIDE.md`). The
> web/mobile player only exists to stream your library to your **phone** (car,
> lock screen, offline caching). Set it up only if you want that.

---

## What you'll end up with

- Your audio + a `playlists_manifest.json` living in **your** Azure Blob container.
- The player app (`web-pwa/`) hosted on **your** Azure Static Web App at a URL like
  `https://<random-name>.azurestaticapps.net`.
- That URL **pinned** to your phone's home screen, streaming your library.

Cost: **$0/month** on Azure free tiers for personal use (storage egress is a few
cents at most).

---

## Prerequisites

- An **Azure account** (free): https://azure.microsoft.com/free
- **Azure CLI** installed: https://learn.microsoft.com/cli/azure/install-azure-cli
- **Node.js** (for the one-line deploy tool): https://nodejs.org
- This repo cloned locally, and the **desktop app working** (that's what produces
  your audio + `history.json`).

---

## Step 1 — Create your Azure Blob Storage (holds your audio)

```bash
az login
# Pick names that are globally unique (lowercase, no spaces):
az group create -n rg-sonicstream -l eastus
az storage account create -n <yourstorageacct> -g rg-sonicstream -l eastus --sku Standard_LRS
az storage container create --account-name <yourstorageacct> -n media --public-access off
```

Get your **account key** (needed by the local sync tool, kept OFF GitHub):
```bash
az storage account keys list -n <yourstorageacct> -g rg-sonicstream --query "[0].value" -o tsv
```

Allow the player to stream cross-origin (one time):
```bash
az storage cors add --services b --methods GET HEAD OPTIONS --origins "*" \
  --allowed-headers "*" --exposed-headers "*" --max-age 3600 \
  --account-name <yourstorageacct> --account-key <ACCOUNT_KEY>
```

Create a **read-only SAS token** (this is the ONLY secret that goes on your phone;
it can only read, and it expires):
```bash
az storage container generate-sas --name media --permissions r \
  --expiry 2027-12-31T23:59Z --account-name <yourstorageacct> --account-key <ACCOUNT_KEY> --https-only -o tsv
```
Save that SAS string — you'll paste it into the app's **Settings** later.

---

## Step 2 — Put your keys in the local (never-committed) file

Copy `keys.example.json` to `keys.json` (already gitignored) and fill in **your**
values:
```json
{
  "azure_storage_account": "<yourstorageacct>",
  "azure_container": "media",
  "azure_account_key": "<ACCOUNT_KEY>",     // used only by the local sync tool
  "azure_sas_token": "<READ_ONLY_SAS>",     // read-only; pasted into the app
  "azure_client_id": "",
  "onedrive_share_link": ""
}
```
`keys.json` **never** gets committed. The committed `web-pwa/settings.json` stays
blank on purpose.

---

## Step 3 — Sync your audio + playlists to the cloud

This is the part that copies your downloaded files and playlist list into Azure.
**Today this is a local script** (there isn't yet a one-click button in the
desktop app — that's a tracked pending feature). Run:

```bash
python sync_to_cloud.py            # regenerate manifest + upload new audio + upload manifest
python sync_to_cloud.py --dry-run  # show what WOULD upload, change nothing
```

It reads `keys.json`, regenerates `playlists_manifest.json` from your desktop
app's `history.json`, uploads any **new** mp3s (skips ones already there), and
uploads the manifest. Re-run it any time you download more music.

> If you'd rather not run scripts, you can ask **Claude Code / Antigravity** in
> this repo to "sync new files and playlists to Azure" — it runs the same tool.

---

## Step 4 — Deploy the player app to Azure Static Web Apps

```bash
# Create the Static Web App (no GitHub connection needed for manual deploy):
az staticwebapp create -n sonicstream-pwa -g rg-sonicstream

# Get its deployment token:
az staticwebapp secrets list -n sonicstream-pwa -g rg-sonicstream --query "properties.apiKey" -o tsv

# Deploy the web-pwa folder (media/ excluded — audio streams from Blob):
python deploy_pwa.py clean        # ensure settings.json is blank for a clean deploy
mv web-pwa/media ./_media_tmp 2>/dev/null
npx --yes @azure/static-web-apps-cli deploy ./web-pwa --deployment-token <TOKEN> --env production
mv ./_media_tmp web-pwa/media 2>/dev/null
```

Azure prints your live URL, e.g. `https://<random-name>.azurestaticapps.net`.

> The `*.azurestaticapps.net` name is **auto-generated and cannot be renamed**.
> For a branded/short URL you'd add a **custom domain** you own (Azure Portal →
> your Static Web App → Custom domains).

---

## Step 5 — Get your URL onto your phone (pin as an app)

1. Open your Static Web App URL in the phone browser (Safari on iPhone, Chrome on
   Android).
2. Open **Settings** in the app → paste your **read-only SAS token** (from Step 1)
   → the app saves it on the device.
3. Tap **Sync/Refresh** — your playlists appear and stream.
4. **Pin it:** iPhone Safari → Share → **Add to Home Screen**; Android Chrome →
   menu → **Install app**. Launch from the icon for full-screen playback with
   lock-screen / car controls.
5. After you deploy an update later, tap the header **Update** button on the phone
   to fetch the newest version.

---

## Optional — Run the player locally (usually NOT needed)

You can host the player on your own PC to try it before deploying — but you don't
have to, because the **desktop app already plays your music**. If you want to:

```bash
python deploy_pwa.py inject      # writes local config.js from keys.json (gitignored)
cd web-pwa
python -m http.server 8099
# open http://127.0.0.1:8099/desktop.html  (or mobile.html)
```

Local audio note: on `http://127.0.0.1` the player looks for a local media server;
the simplest real test is still the deployed Azure site with your SAS. For just
listening on your PC, use the **desktop app** instead.

---

## How it all fits together (mental model)

```
Desktop app  →  downloads audio + keeps history.json
      │
      │  python sync_to_cloud.py   (reads keys.json, local only)
      ▼
Your Azure Blob (media/)  ──  mp3 files + playlists_manifest.json
      │
      │  read-only SAS token (you paste it in the app once per device)
      ▼
Your Azure Static Web App  ──  the player (web-pwa) you deployed
      │
      ▼
Your phone  ──  pinned to home screen, streams + caches offline
```

- **Secrets stay local.** Only the **read-only SAS** ever leaves your PC, and only
  onto your own phone. Account keys live in gitignored `keys.json` / the sync
  script and are never committed or deployed.
- Full command reference for maintainers: `docs/DEPLOYMENT.md`.
