# SonicStream Configuration, Build & Deployment Guide

This guide details the exact key management and deployment workflow for SonicStream:

- **Local Keys File (`keys.json`)**: Local-only file holding your active credentials. Never checked into Git.
- **GitHub Check-in File (`web-pwa/settings.json`)**: Checked into GitHub with all key values blank (`""`).
- **Deployment Injector (`deploy_pwa.py`)**: Script that populates key values into `web-pwa/settings.json` for local running & deployment, and resets them back to blank (`""`) for GitHub check-ins.

---

## 🏗️ Architecture & Workflow Overview

```
[GitHub Check-In Repository]
  web-pwa/settings.json  ──► { "azure_sas_token": "", "azure_storage_account": "", ... } (All blank)
  keys.example.json     ──► Reference template file

[Local Machine (Gitignored)]
  keys.json              ──► { "azure_sas_token": "se=2027...", "azure_storage_account": "stsonicstream", ... }

[Deploy / Build Script: deploy_pwa.py]
  python deploy_pwa.py inject ──► Reads keys.json & populates web-pwa/settings.json + web-pwa/config.js
  python deploy_pwa.py clean  ──► Resets web-pwa/settings.json back to blank values for Git check-in

[Web PWA Runtime]
  1. Fetches ./settings.json dynamically on launch.
  2. Displays loaded values in the Settings Modal UI.
  3. Streams audio/video tracks and syncs manifests via Azure Blob Storage.
```

---

## 🔒 1. Local Keys File (`keys.json`)

On your local machine, your secret parameters are saved in **`keys.json`** in the project root:

```json
{
  "azure_storage_account": "stsonicstream",
  "azure_container": "media",
  "azure_sas_token": "se=2027-12-31T23%3A59%3A59Z&sp=r&sv=2026-02-06&sr=c&sig=...",
  "azure_client_id": "51f81489-12ee-4a9e-aaae-a2591f45987d",
  "onedrive_share_link": "https://traimber-my.sharepoint.com/..."
}
```

`keys.json` is listed in `.gitignore` and **will never be committed to Git**.

---

## 📄 2. Checked-in Settings File (`web-pwa/settings.json`)

The checked-in version of **`web-pwa/settings.json`** in GitHub contains blank values:

```json
{
  "azure_storage_account": "",
  "azure_container": "",
  "azure_sas_token": "",
  "azure_client_id": "",
  "onedrive_share_link": ""
}
```

---

## 🚀 3. Deployment Script (`deploy_pwa.py`)

Use `deploy_pwa.py` to toggle between deployment mode and GitHub check-in mode:

### A. Inject Keys for Local Running & Deployment
```bash
python deploy_pwa.py inject
```
- Reads `keys.json`.
- Populates key values into `web-pwa/settings.json` and `web-pwa/config.js`.
- Deploy the `web-pwa/` folder to Azure Static Web Apps. The online app will load `settings.json`, populate the Settings UI, and stream audio/video tracks directly!

### B. Clean Settings for GitHub Check-in
```bash
python deploy_pwa.py clean
```
- Resets `web-pwa/settings.json` back to blank values (`""`).
- Safely commit your changes to GitHub without leaking any keys or URLs.

---

## ⚙️ 4. Summary of Configuration Files

| File | Status in Git | Purpose |
|---|---|---|
| `keys.json` | **Gitignored** | Local active keys file containing your private URLs & SAS tokens |
| `keys.example.json` | **Checked In** | Reference template for new environments |
| `web-pwa/settings.json` | **Checked In** | Settings file (blank `""` values on GitHub; populated during deployment) |
| `deploy_pwa.py` | **Checked In** | Script to `inject` keys for deployment or `clean` back to blank for Git |
| `web-pwa/app.js` | **Checked In** | PWA engine that fetches `settings.json`, populates UI inputs, & streams tracks |
