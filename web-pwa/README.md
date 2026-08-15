# SonicStream Web PWA

A Progressive Web App (PWA) that streams music directly from your **OneDrive storage** (via Microsoft Graph API) and plays **local iPhone files offline** without requiring Apple Developer fees or paid servers.

---

## 🌟 Key Features

1. **OneDrive API Music Streaming**: Log in with your Microsoft account to stream MP3s directly from your `OneDrive\YoutubeDownloads` folder.
2. **Local iPhone File Import**: Pick MP3 files directly from your iOS **Files App** (*"On My iPhone"*, Downloads folder) for instant playback.
3. **100% Free Hosting ($0/mo)**: Designed to deploy to **Azure Static Web Apps (Free Tier)**, **Firebase Hosting**, or **Cloudflare Pages**.
4. **Offline Listening**: Saves tracks and blobs locally using **IndexedDB** so music plays seamlessly in Airplane Mode or cellular dead zones.
5. **Car Bluetooth & Lockscreen Controls**: Integrates with W3C `navigator.mediaSession` for iPhone lockscreen artwork and car steering wheel controls (Play, Pause, Next, Prev, Seek).

---

## 🚀 Azure Static Web Apps Deployment ($0 / Month)

### Step 1: Azure App Registration (Free)
1. Go to [Azure Portal > App Registrations](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps).
2. Click **New registration**:
   - **Name**: `SonicStream Web PWA`
   - **Supported account types**: `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI**: Select `Single-page application (SPA)` and enter your deployment domain (e.g. `https://your-app.azurestaticapps.net`).
3. Copy the **Application (Client) ID** and paste it into the **SonicStream PWA Settings modal**.

### Step 2: Deploy to Azure Static Web Apps
1. Ensure your `keys.json` is configured locally with your SAS tokens.
2. Run `python deploy_pwa.py inject` to inject the configuration into the `web-pwa` build.
3. Deploy the folder directly to Azure:
   `npx @azure/static-web-apps-cli deploy ./web-pwa --env production --deployment-token <TOKEN>`
4. Run `python deploy_pwa.py clean` to reset the configuration file locally.
5. Your app will be live on an HTTPS URL immediately!

---

## 📱 How to Install on iPhone / iPad

1. Open your deployed URL in **Safari** on your iPhone.
2. Tap the **Share button** (square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. SonicStream will launch full-screen as a standalone native app!
