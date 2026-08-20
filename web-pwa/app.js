// --- SonicStream Live Console & Trace Log Interceptor ---
(function() {
    window.SONICSTREAM_LOGS = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;

    function appendLogToUI(type, args) {
        // Serialise properly. JSON.stringify(new Error("boom")) returns "{}", which
        // is why every error in the trace log read as an unhelpful empty object.
        // Errors, DOMExceptions and MediaError all need explicit handling.
        const describe = (a) => {
            try {
                if (a === null || a === undefined) return String(a);
                if (a instanceof Error) return `${a.name}: ${a.message}`;
                if (typeof MediaError !== "undefined" && a instanceof MediaError) {
                    const codes = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };
                    return `MediaError ${a.code} (${codes[a.code] || "?"})${a.message ? ": " + a.message : ""}`;
                }
                if (typeof Event !== "undefined" && a instanceof Event) return `Event<${a.type}>`;
                if (typeof a === "object") {
                    const plain = JSON.stringify(a, null, 2);
                    if (plain && plain !== "{}") return plain;
                    // Fall back to own+inherited readable props (covers DOMException).
                    const bits = [];
                    for (const k of ["name", "message", "code", "reason", "type"]) {
                        if (a[k] !== undefined) bits.push(`${k}=${a[k]}`);
                    }
                    return bits.length ? `{${bits.join(", ")}}` : Object.prototype.toString.call(a);
                }
                return String(a);
            } catch (_) { return "[unserialisable]"; }
        };
        const msg = Array.from(args).map(describe).join(" ");
        const time = new Date().toLocaleTimeString();
        window.SONICSTREAM_LOGS.push({ type, time, msg });

        // Queue the IMPORTANT lines for persistence. In-memory logs die with the
        // page — precisely when we most need them (an eviction or self-reload
        // mid-drive leaves no evidence at all). Only errors, warnings and playback
        // milestones are kept, so the store stays small. Writing happens later, in
        // batches, never on the playback path.
        try {
            if (type === "error" || type === "warn" ||
                /Auto-Advance|Screen-off advance|Next track was|Download FAILED|Downloaded \+ cached|Superseded|Re-established|Service Worker registered|Topping up|MediaSession\]|Audio:|\[Page\]|play\(\) (RESOLVED|REJECTED)|NOW PLAYING|STREAMING because/.test(msg)) {
                (window.__PERSIST_QUEUE = window.__PERSIST_QUEUE || []).push({ type, time, msg: msg.slice(0, 300), t: Date.now() });
            }
        } catch (_) {}

        const container = document.getElementById("liveConsoleBody");
        if (container) {
            const line = document.createElement("div");
            line.style.padding = "3px 0";
            line.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            line.style.fontSize = "0.75rem";
            line.style.fontFamily = "'Fira Code', monospace";
            
            if (type === "error") {
                line.style.color = "#ff5f56";
                line.innerHTML = `<span style="color:#ff79c6; font-weight:700;">[${time}] ❌ ERROR:</span> ${escapeHtml(msg)}`;
            } else if (type === "warn") {
                line.style.color = "#ffbd2e";
                line.innerHTML = `<span style="color:#ffb86c; font-weight:700;">[${time}] ⚠️ WARN:</span> ${escapeHtml(msg)}`;
            } else {
                line.style.color = "#00f2fe";
                line.innerHTML = `<span style="color:#50fa7b; font-weight:700;">[${time}] ℹ️ INFO:</span> ${escapeHtml(msg)}`;
            }
            container.appendChild(line);
            container.scrollTop = container.scrollHeight;
        }

        const badge = document.getElementById("liveConsoleErrorBadge");
        if (badge) {
            const errCount = window.SONICSTREAM_LOGS.filter(l => l.type === "error").length;
            badge.textContent = errCount > 0 ? `${errCount} ERRORS` : "OK";
            badge.style.background = errCount > 0 ? "#ff5f56" : "#27c93f";
        }
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    console.log = function(...args) { origLog.apply(console, args); appendLogToUI("log", args); };
    console.warn = function(...args) { origWarn.apply(console, args); appendLogToUI("warn", args); };
    console.error = function(...args) { origErr.apply(console, args); appendLogToUI("error", args); };

    window.addEventListener("error", (e) => {
        appendLogToUI("error", [`Uncaught Exception: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`]);
    });

    window.addEventListener("unhandledrejection", (e) => {
        appendLogToUI("error", [`Unhandled Rejection: ${e.reason ? (e.reason.stack || e.reason) : e}`]);
    });
})();

// SonicStream Web PWA - Application Engine
document.addEventListener("DOMContentLoaded", () => {
    // Register Service Worker
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").then((reg) => {
            console.log("[PWA] Service Worker registered successfully:", reg.scope);
            reg.update();
        }).catch((err) => {
            console.error("[PWA] Service Worker registration failed:", err);
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (!refreshing) {
                refreshing = true;
                console.log("[PWA] New Service Worker activated! Reloading page...");
                window.location.reload();
            }
        });
    }

    // Chrome & Edge PWA Install Prompt Listener
    let deferredInstallPrompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        console.log("[PWA] Chrome/Edge install prompt captured");
    });

    // --- DOM Elements ---
    const btnLoginOneDrive = document.getElementById("btnLoginOneDrive");
    const loginBtnText = document.getElementById("loginBtnText");
    const btnImportLocalFiles = document.getElementById("btnImportLocalFiles");
    const localFileInput = document.getElementById("localFileInput");
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const btnSaveSettings = document.getElementById("btnSaveSettings");
    const settingsModal = document.getElementById("settingsModal");
    const azureClientIdInput = document.getElementById("azureClientIdInput");
    const azureSasTokenInput = document.getElementById("azureSasTokenInput");
    const oneDriveFolderNameInput = document.getElementById("oneDriveFolderNameInput");
    
    // Dedicated Mobile DOM Elements
    const mobilePlaylistsList = document.getElementById("mobilePlaylistsList");
    const mobilePlaylistsView = document.getElementById("mobilePlaylistsView");
    const mobileTracksView = document.getElementById("mobileTracksView");
    const mobileTrackList = document.getElementById("mobileTrackList");
    const mobileCurrentPlaylistTitle = document.getElementById("mobileCurrentPlaylistTitle");
    const btnBackToPlaylists = document.getElementById("btnBackToPlaylists");
    const btnSyncMobile = document.getElementById("btnSyncMobile");
    
    // Dynamic Configuration Loader (reads window.SONICSTREAM_CONFIG or fetches settings.json)
    let CONFIG = window.SONICSTREAM_CONFIG || {};

    async function loadSettingsJson() {
        try {
            // Cache-bust: config.js is a <script>, which the service worker serves
            // CACHE-FIRST, so a stale BLANK config.js can outlive a good deploy.
            const res = await fetch("./settings.json?cb=" + Date.now(), { cache: "no-store" });
            if (res.ok) {
                const fetchedConfig = await res.json();
                if (fetchedConfig && typeof fetchedConfig === "object") {
                    // Merge preferring NON-EMPTY values. The old spread was
                    //     { ...fetchedConfig, ...CONFIG }
                    // which let an EMPTY string from a stale blank config.js
                    // overwrite the correct value from settings.json — leaving the
                    // app with no storage account, so nothing played at all.
                    const merged = { ...fetchedConfig };
                    for (const [k, v] of Object.entries(CONFIG)) {
                        if (v !== undefined && v !== null && v !== "") merged[k] = v;
                    }
                    CONFIG = merged;
                    populateSettingsUI();
                }
            }
        } catch (e) {}
    }

    async function populateSettingsUI() {
        const dbCid = await getSettingFromDB("azure_client_id");
        const dbSas = await getSettingFromDB("azure_sas_token");
        const dbDrive = await getSettingFromDB("onedrive_share_link");

        if (azureClientIdInput) {
            azureClientIdInput.value = dbCid || localStorage.getItem("sonicstream_client_id") || CONFIG.azure_client_id || "";
        }
        if (azureSasTokenInput) {
            azureSasTokenInput.value = dbSas || localStorage.getItem("sonicstream_azure_sas") || CONFIG.azure_sas_token || "";
        }
        if (oneDriveFolderNameInput) {
            oneDriveFolderNameInput.value = dbDrive || localStorage.getItem("sonicstream_onedrive_link") || CONFIG.onedrive_share_link || "";
        }
    }

    // --- Live Console Modal Injector & Floating Action Button ---
    function renderLogsToConsoleBody() {
        const container = document.getElementById("liveConsoleBody");
        if (!container) return;
        container.innerHTML = "";
        // Show persisted lines from EARLIER sessions first. If the app was evicted
        // or reloaded mid-drive, this is the only surviving evidence of what
        // happened — the in-memory log started empty after the reload.
        const persisted = window.__PERSISTED_TRACE || [];
        if (persisted.length) {
            const hdr = document.createElement("div");
            hdr.style.cssText = "padding:4px 0;color:var(--neon-blue);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.15);";
            hdr.textContent = `── ${persisted.length} saved line(s) from earlier sessions ──`;
            container.appendChild(hdr);
            persisted.forEach(l => {
                const d = document.createElement("div");
                d.style.cssText = "padding:3px 0;opacity:.75;border-bottom:1px solid rgba(255,255,255,0.05);";
                d.textContent = `[${l.time}] [${String(l.type).toUpperCase()}] ${l.msg}`;
                if (l.type === "error") d.style.color = "#ff5f56";
                else if (l.type === "warn") d.style.color = "#ffb454";
                container.appendChild(d);
            });
            const sep = document.createElement("div");
            sep.style.cssText = "padding:4px 0;color:var(--neon-blue);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.15);";
            sep.textContent = "── this session ──";
            container.appendChild(sep);
        }
        const logs = window.SONICSTREAM_LOGS || [];
        if (logs.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted);">[System] Live Terminal initialized. No logs recorded yet. Perform actions to view real-time traces...</div>`;
            return;
        }
        logs.forEach(l => {
            const line = document.createElement("div");
            line.style.padding = "3px 0";
            line.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            line.style.fontSize = "0.75rem";
            line.style.fontFamily = "'Fira Code', monospace";
            
            if (l.type === "error") {
                line.style.color = "#ff5f56";
                line.innerHTML = `<span style="color:#ff79c6; font-weight:700;">[${l.time}] ❌ ERROR:</span> ${escapeHtml(l.msg)}`;
            } else if (l.type === "warn") {
                line.style.color = "#ffbd2e";
                line.innerHTML = `<span style="color:#ffb86c; font-weight:700;">[${l.time}] ⚠️ WARN:</span> ${escapeHtml(l.msg)}`;
            } else {
                line.style.color = "#00f2fe";
                line.innerHTML = `<span style="color:#50fa7b; font-weight:700;">[${l.time}] ℹ️ INFO:</span> ${escapeHtml(l.msg)}`;
            }
            container.appendChild(line);
        });
        container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(str) {
        return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function openLiveConsoleModal() {
        let modal = document.getElementById("liveConsoleModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "liveConsoleModal";
            modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 999999; backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; padding: 1rem;";
            modal.innerHTML = `
                <div style="background: #090d16; border: 1px solid var(--neon-blue); border-radius: 12px; width: 100%; max-width: 900px; height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,242,254,0.25);">
                    <div style="padding: 0.75rem 1rem; background: rgba(0,242,254,0.08); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-family: var(--font-mono); color: var(--neon-blue);">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                            <span>SonicStream Live Terminal & Trace Log</span>
                            <span id="liveConsoleErrorBadge" style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: #27c93f; color: #000; font-weight: 800;">OK</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button id="btnCopyConsoleLogs" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.6rem;">📋 Copy Logs</button>
                            <button id="btnClearConsoleLogs" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.6rem;">🧹 Clear</button>
                            <button id="btnCloseConsoleModal" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.6rem;">❌ Close</button>
                        </div>
                    </div>
                    <div id="liveConsoleBody" style="flex: 1; padding: 1rem; overflow-y: auto; background: #05080f; color: #e6edf3; font-family: 'Fira Code', monospace; font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById("btnCloseConsoleModal").addEventListener("click", () => {
                modal.style.display = "none";
            });
            document.getElementById("btnCopyConsoleLogs").addEventListener("click", () => {
                const raw = window.SONICSTREAM_LOGS ? window.SONICSTREAM_LOGS.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.msg}`).join("\n") : "";
                navigator.clipboard.writeText(raw).then(() => {
                    alert("Logs copied to clipboard!");
                }).catch(() => alert("Copy failed. Log text:\n\n" + raw));
            });
            document.getElementById("btnClearConsoleLogs").addEventListener("click", () => {
                window.SONICSTREAM_LOGS = [];
                renderLogsToConsoleBody();
            });
        }

        modal.style.display = "flex";
        modal.style.zIndex = "999999";
        modal.classList.remove("hidden");
        renderLogsToConsoleBody();
    }

    // Attach listeners to any header console button
    const btnToggleConsole = document.getElementById("btnToggleConsole");
    if (btnToggleConsole) {
        btnToggleConsole.addEventListener("click", openLiveConsoleModal);
    }

    // (Removed the floating bottom-right Trace Logs button — it overlapped the
    // docked player's Play control. Trace Logs now lives in the top header of
    // both desktop and mobile via #btnToggleConsole.)

    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener("click", () => {
            settingsModal.classList.add("hidden");
        });
    }

    if (btnSaveSettings && settingsModal) {
        btnSaveSettings.addEventListener("click", async () => {
            const cid = azureClientIdInput ? azureClientIdInput.value.trim() : "";
            const sas = azureSasTokenInput ? azureSasTokenInput.value.trim() : "";
            const drive = oneDriveFolderNameInput ? oneDriveFolderNameInput.value.trim() : "";

            if (cid) {
                localStorage.setItem("sonicstream_client_id", cid);
                CONFIG.azure_client_id = cid;
                await saveSettingToDB("azure_client_id", cid);
            }
            if (sas) {
                localStorage.setItem("sonicstream_azure_sas", sas);
                CONFIG.azure_sas_token = sas;
                await saveSettingToDB("azure_sas_token", sas);
            }
            if (drive) {
                localStorage.setItem("sonicstream_onedrive_link", drive);
                CONFIG.onedrive_share_link = drive;
                await saveSettingToDB("onedrive_share_link", drive);
            }

            settingsModal.classList.add("hidden");
            alert("Settings saved to IndexedDB successfully!");
        });
    }

    // Storage account/container come from the deployed config (settings.json /
    // config.js), written at deploy time by deploy_pwa.inject_public_config()
    // from the local, gitignored keys.json. The account name used to be HARDCODED
    // here as a fallback: that put a personal deployment identifier in the repo,
    // and — because the deployed settings.json was blank — that fallback was the
    // only thing making playback work at all. Read from CONFIG only.
    function getAzureStorageAccount() {
        const acct = CONFIG.azure_storage_account || "";
        if (!acct) console.warn("[PWA] azure_storage_account missing from config — deploy with inject-public.");
        return acct;
    }

    function getAzureContainer() {
        return CONFIG.azure_container || "media";
    }

    function getAzureBlobBaseUrl() {
        const acc = getAzureStorageAccount();
        const container = getAzureContainer();
        return `https://${acc}.blob.core.windows.net/${container}`;
    }

    function getAzureSASToken() {
        let token = (azureSasTokenInput ? azureSasTokenInput.value.trim() : "") || localStorage.getItem("sonicstream_azure_sas") || CONFIG.azure_sas_token || "";
        if (token.startsWith("?")) token = token.substring(1);
        return token;
    }

    function getTrackThumbnailUrl(track) {
        if (!track) return "icon.svg";
        if (track.title && track.title.toLowerCase().includes("gita")) {
            return "gita_cover_logo.png";
        }
        const yid = track.youtube_id || track.id;
        if (yid && yid.length === 11 && !yid.includes(" ") && !yid.includes("/")) {
            return `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`;
        }
        if (track.thumbnail && (track.thumbnail.startsWith("http://") || track.thumbnail.startsWith("https://"))) {
            return track.thumbnail;
        }
        return "icon.svg";
    }

    function getPlaylistThumbnail(pl) {
        // Pick a real per-playlist cover: first track whose thumbnail can be
        // derived (YouTube hqdefault or gita cover), so playlists don't all
        // collapse to the same default art.
        if (pl && Array.isArray(pl.tracks)) {
            for (const t of pl.tracks) {
                const u = getTrackThumbnailUrl(t);
                if (u && u !== "icon.svg") return u;
            }
        }
        return (pl && pl.thumbnail) || "icon.svg";
    }

    function getOneDriveShareLink() {
        const link = (oneDriveFolderNameInput ? oneDriveFolderNameInput.value.trim() : "") || localStorage.getItem("sonicstream_onedrive_link");
        return link || CONFIG.onedrive_share_link || "";
    }

    function getAzureClientId() {
        const cid = (azureClientIdInput ? azureClientIdInput.value.trim() : "") || localStorage.getItem("sonicstream_client_id");
        return cid || CONFIG.azure_client_id || "51f81489-12ee-4a9e-aaae-a2591f45987d";
    }

    // Initial settings load & UI population
    populateSettingsUI();
    loadSettingsJson();
    const btnClearCache = document.getElementById("btnClearCache");
    const cacheUsageText = document.getElementById("cacheUsageText");
    const urlInput = document.getElementById("urlInput");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const analyzeSpinner = document.getElementById("analyzeSpinner");
    const urlError = document.getElementById("urlError");
    const btnSyncOneDriveNow = document.getElementById("btnSyncOneDriveNow");
    const btnSaveOffline = document.getElementById("btnSaveOffline");

    // Player Elements
    const audioElement = document.getElementById("audioElement");
    const playerTrackThumb = document.getElementById("playerTrackThumb");
    const playerTrackTitle = document.getElementById("playerTrackTitle");
    const playerTrackArtist = document.getElementById("playerTrackArtist");
    const playerTrackStatus = document.getElementById("playerTrackStatus");
    const playerStatusEq = document.getElementById("playerStatusEq");
    const playerStatusText = document.getElementById("playerStatusText");
    const playerCurrentTime = document.getElementById("playerCurrentTime");
    const playerProgressBar = document.getElementById("playerProgressBar");
    const playerTotalTime = document.getElementById("playerTotalTime");
    const playerPlayPauseBtn = document.getElementById("playerPlayPauseBtn");
    const playIconSvg = document.getElementById("playIconSvg");
    const playerPrevBtn = document.getElementById("playerPrevBtn");
    const playerNextBtn = document.getElementById("playerNextBtn");
    const playerShuffleBtn = document.getElementById("playerShuffleBtn");
    const playerVolumeBtn = document.getElementById("playerVolumeBtn");
    const playerVolumeSlider = document.getElementById("playerVolumeSlider");
    const videoElement = document.getElementById("videoElement");
    const videoContainer = document.getElementById("videoContainer");
    const btnMediaModeAudio = document.getElementById("btnMediaModeAudio");
    const btnMediaModeVideo = document.getElementById("btnMediaModeVideo");
    let mediaPlaybackMode = "audio"; // "audio" or "video"

    // Dashboard Elements
    const playlistListContainer = document.getElementById("playlistListContainer");
    const playlistTitle = document.getElementById("playlistTitle");
    const playlistMetaInfo = document.getElementById("playlistMetaInfo");
    const playlistTableBody = document.getElementById("playlistTableBody");
    const playlistSearch = document.getElementById("playlistSearch");
    const tabAll = document.getElementById("tabAll");
    const tabLocal = document.getElementById("tabLocal");
    const tabOffline = document.getElementById("tabOffline");
    const btnPrefetch3 = document.getElementById("btnPrefetch3");
    const refreshPlaylistBtn = document.getElementById("refreshPlaylistBtn");
    const selectAllBtn = document.getElementById("selectAllBtn");
    const deselectAllBtn = document.getElementById("deselectAllBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const downloadAllBtn = document.getElementById("downloadAllBtn");
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    const gridHud = document.getElementById("gridHud");
    const hudJobTitle = document.getElementById("hudJobTitle");
    const hudCurrentFile = document.getElementById("hudCurrentFile");
    const hudSpeed = document.getElementById("hudSpeed");
    const playPlaylistBtn = document.getElementById("playPlaylistBtn");
    const shufflePlaylistBtn = document.getElementById("shufflePlaylistBtn");
    const resumePlaylistBtn = document.getElementById("resumePlaylistBtn");
    const statusFilter = document.getElementById("statusFilter");
    const selectedCountInfo = document.getElementById("selectedCountInfo");
    const totalCountInfo = document.getElementById("totalCountInfo");

    // --- State Variables ---
    let msalInstance = null;
    let currentUserAccount = null;
    let playlists = [];
    let activePlaylistId = null;
    let activePlaylistItems = [];
    let playQueue = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let isShuffle = false;
    let isRepeat = false;
    let sidebarTabFilter = "all"; // all, local, offline
    let streamSourceMode = "onedrive"; // "onedrive" or "youtube"
    let selectedTrackIds = new Set();
    let nextTrackTimeout = null;
    let nextTrackCountdownInterval = null;

    function clearNextTrackTimers() {
        if (nextTrackTimeout) {
            clearTimeout(nextTrackTimeout);
            nextTrackTimeout = null;
        }
        if (nextTrackCountdownInterval) {
            clearInterval(nextTrackCountdownInterval);
            nextTrackCountdownInterval = null;
        }
    }

    if (btnMediaModeAudio && btnMediaModeVideo) {
        btnMediaModeAudio.addEventListener("click", () => {
            mediaPlaybackMode = "audio";
            btnMediaModeAudio.classList.add("active");
            btnMediaModeVideo.classList.remove("active");
            if (videoContainer) videoContainer.classList.add("hidden");
            if (videoElement) videoElement.pause();
        });
        btnMediaModeVideo.addEventListener("click", () => {
            mediaPlaybackMode = "video";
            btnMediaModeVideo.classList.add("active");
            btnMediaModeAudio.classList.remove("active");
            if (videoContainer) videoContainer.classList.remove("hidden");
            if (audioElement) audioElement.pause();
        });
    }

    const sourceRadios = document.querySelectorAll('input[name="streamSource"]');
    sourceRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            document.querySelectorAll(".source-pill-btn").forEach(btn => btn.classList.remove("active"));
            if (e.target.checked) {
                streamSourceMode = e.target.value;
                e.target.closest(".source-pill-btn")?.classList.add("active");
                updateSourceModeUI(streamSourceMode);
            }
        });
    });

    async function updateSourceModeUI(mode) {
        streamSourceMode = mode;
        const ytSection = document.querySelector(".url-analyze-section");
        const btnPrefetch3El = document.getElementById("btnPrefetch3");
        const refreshPlaylistBtnEl = document.getElementById("refreshPlaylistBtn");

        if (mode === "onedrive") {
            if (ytSection) ytSection.style.display = "none";
            if (btnPrefetch3El) btnPrefetch3El.style.display = "none";
            if (refreshPlaylistBtnEl) refreshPlaylistBtnEl.style.display = "inline-flex";
        } else { // youtube mode
            if (ytSection) ytSection.style.display = "block";
            if (btnPrefetch3El) btnPrefetch3El.style.display = "inline-flex";
            if (refreshPlaylistBtnEl) refreshPlaylistBtnEl.style.display = "inline-flex";
        }

        playlists = await getAllPlaylistsFromDB();
        await renderSidebarList();
        if (playlists.length > 0 && (!activePlaylistId || !playlists.find(p => p.id === activePlaylistId))) {
            selectPlaylist(playlists[0]);
        }
        if (gridHud) gridHud.classList.add("hidden");
    }

    // --- IndexedDB Engine for Offline Music Caching ---
    const DB_NAME = "SonicStreamPWA_DB";
    const DB_VERSION = 5;
    let db = null;

    function initDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const database = e.target.result;
                    if (database.objectStoreNames.contains("cached_tracks")) {
                        database.deleteObjectStore("cached_tracks");
                    }
                    if (!database.objectStoreNames.contains("playlists")) {
                        database.createObjectStore("playlists", { keyPath: "id" });
                    }
                    if (!database.objectStoreNames.contains("files")) {
                        database.createObjectStore("files", { keyPath: "file_id" });
                    }
                    if (!database.objectStoreNames.contains("settings")) {
                        database.createObjectStore("settings", { keyPath: "key" });
                    }
                };
                request.onsuccess = (e) => {
                    db = e.target.result;
                    db.onversionchange = () => { try { db.close(); } catch(err) {} };
                    updateCacheUsageUI();
                    syncDefaultSettingsFromServer();
                    resolve(db);
                };
                request.onblocked = () => {
                    console.warn("[IndexedDB] Database upgrade blocked.");
                    resolve(null);
                };
                request.onerror = () => {
                    console.warn("[IndexedDB] Database open error.");
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    }

    function saveBatchFileRecordsToDB(fileRecords) {
        if (!db || !db.objectStoreNames.contains("files") || !fileRecords || fileRecords.length === 0) return Promise.resolve();
        return new Promise((resolve) => {
            try {
                // WRITE ONLY WHAT IS MISSING.
                //
                // This runs on every playlist sync with ~1283 records. It used to do a
                // get() AND a put() for EVERY record — needed so a metadata-only write
                // could not clobber a cached audio Blob (IndexedDB put() replaces the
                // whole record). Correct, but ~2600 operations against a multi-GB store
                // saturated IndexedDB for close to a MINUTE on a real phone, and a tap
                // on Play could not be serviced until it finished. The user's trace
                // showed exactly that: app opened 10:18:28, sync completed 10:19:26,
                // and the track then downloaded in 1.4 s.
                //
                // Almost every record already exists and its metadata has not changed,
                // so: read the KEYS once (keys only — no values, no blobs decoded) and
                // write only genuinely new ones. Existing rows are left untouched,
                // which also means a cached blob can never be clobbered — the original
                // reason the merge existed, now achieved by not writing at all.
                const tx = db.transaction("files", "readwrite");
                const store = tx.objectStore("files");
                const keyReq = store.getAllKeys();
                keyReq.onsuccess = () => {
                    const existing = new Set(keyReq.result || []);
                    let added = 0;
                    fileRecords.forEach(rec => {
                        if (!rec || !rec.file_id) return;
                        if (existing.has(rec.file_id)) return;   // keep the row (and its blob) as-is
                        store.put(rec);
                        added++;
                    });
                    if (added) console.log(`[PWA] Added ${added} new file record(s); ${existing.size} already present and left untouched.`);
                };
                keyReq.onerror = () => { /* fall through: nothing written, playback unaffected */ };
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) {
                resolve();
            }
        });
    }

    function saveSettingToDB(key, value) {
        if (!db || !db.objectStoreNames.contains("settings")) return Promise.resolve();
        return new Promise((resolve) => {
            try {
                const tx = db.transaction("settings", "readwrite");
                tx.objectStore("settings").put({ key: key, value: value, updated_at: Date.now() });
                resolve();
            } catch (e) {
                resolve();
            }
        });
    }

    function getSettingFromDB(key) {
        // TDZ-safe: populateSettingsUI() runs at startup BEFORE `let db` is
        // initialized, so touching `db` here threw a ReferenceError that aborted
        // the settings load (leaving the saved SAS token unpopulated until a
        // later re-run). Read it inside a try and resolve null until the DB exists.
        let database = null;
        try { database = db; } catch (_) { return Promise.resolve(null); }
        if (!database || !database.objectStoreNames.contains("settings")) return Promise.resolve(null);
        return new Promise((resolve) => {
            try {
                const tx = database.transaction("settings", "readonly");
                const req = tx.objectStore("settings").get(key);
                req.onsuccess = () => resolve(req.result ? req.result.value : null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function syncDefaultSettingsFromServer() {
        try {
            const res = await fetch("./settings.json", { cache: "no-cache" }).catch(() => null);
            if (res && res.ok) {
                const defaults = await res.json();
                if (defaults && typeof defaults === "object") {
                    for (const [k, v] of Object.entries(defaults)) {
                        const existing = await getSettingFromDB(k);
                        if (!existing && v) {
                            await saveSettingToDB(k, v);
                        }
                    }
                }
            }
        } catch (e) {}
    }

    function savePlaylistToDB(playlist) {
        if (!db) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("playlists", "readwrite");
            const req = tx.objectStore("playlists").put(playlist);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    async function getAllPlaylistsFromDB() {
        if (!db) return [];
        return new Promise((resolve) => {
            const tx = db.transaction("playlists", "readonly");
            const req = tx.objectStore("playlists").getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    function normalizeTitleKey(title) {
        if (!title) return "";
        return title.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    const MAX_FILE_SIZE_BYTES = 60 * 1024 * 1024; // 60 MB per-file cache cap; larger files stream live from Azure

    async function purgeLargeFilesFromDB() {
        if (!db || !db.objectStoreNames.contains("files")) return;
        try {
            const tx = db.transaction("files", "readwrite");
            const store = tx.objectStore("files");
            const req = store.getAll();
            req.onsuccess = () => {
                const records = req.result || [];
                let purgedCount = 0;
                let freedBytes = 0;

                records.forEach(rec => {
                    const audio = rec.audio_blob || rec.blob;
                    if (audio && audio.size > MAX_FILE_SIZE_BYTES) {
                        const sizeMB = (audio.size / (1024 * 1024)).toFixed(1);
                        const key = rec.file_id || rec.id || rec.key;
                        store.delete(key);
                        purgedCount++;
                        freedBytes += audio.size;
                        console.warn(`[Storage Purge] 🗑️ Deleted large file exceeding 20MB: '${rec.title || key}' (${sizeMB} MB)`);
                    }
                });

                if (purgedCount > 0) {
                    const freedMB = (freedBytes / (1024 * 1024)).toFixed(1);
                    console.log(`[Storage Purge] ✅ Purged ${purgedCount} large files exceeding 20MB limit (Freed ${freedMB} MB).`);
                    updateCacheUsageUI();
                }
            };
        } catch (e) {
            console.error("[Storage Purge] Error purging large files:", e);
        }
    }

    async function saveTrackBlobToDB(trackId, blob, trackMeta = {}) {
        if (!db || !db.objectStoreNames.contains("files")) return Promise.resolve();
        const title = typeof trackMeta === "string" ? trackMeta : (trackMeta.title || "");
        const normKey = normalizeTitleKey(title);
        const fileName = (typeof trackMeta === "object" && trackMeta.file) ? trackMeta.file : (title ? `${title}.mp3` : trackId);

        if (blob && blob.size > MAX_FILE_SIZE_BYTES) {
            const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
            const capMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
            console.warn(`[Storage Guard] 🛑 Skipped saving file over ${capMB}MB cap: '${fileName}' (${sizeMB} MB)`);
            return Promise.resolve();
        }

        let thumbBlob = null;
        if (typeof trackMeta === "object" && trackMeta.thumbnail && trackMeta.thumbnail.startsWith("http")) {
            try {
                const imgRes = await fetch(trackMeta.thumbnail).catch(() => null);
                if (imgRes && imgRes.ok) {
                    thumbBlob = await imgRes.blob();
                }
            } catch(e) {}
        }

        return new Promise((resolve) => {
            try {
                const tx = db.transaction("files", "readwrite");
                const store = tx.objectStore("files");
                store.put({
                    file_id: fileName,
                    id: trackId,
                    normKey: normKey,
                    blob: blob,
                    audio_blob: blob,
                    thumb_blob: thumbBlob,
                    thumbBlob: thumbBlob,
                    title: title,
                    meta: typeof trackMeta === "object" ? trackMeta : { title: title },
                    timestamp: Date.now()
                });
                tx.oncomplete = () => {
                    // Update the totals incrementally instead of rescanning the whole
                    // store (see getCacheStats): this runs on every cached track.
                    try { if (blob && blob.size) noteBlobCached(blob.size); } catch (_) {}
                    updateCacheUsageUI();
                    // Keep the cache within budget. checkStorageQuotaLimit() existed
                    // but was NEVER CALLED from anywhere, so nothing ever bounded the
                    // cache — it reached 3.81 GB / 288 tracks and slowed the device.
                    checkStorageQuotaLimit();
                    resolve();
                };
                tx.onerror = () => resolve();
            } catch (e) {
                resolve();
            }
        });
    }

    async function getTrackRecordFromDB(trackId, title = "", targetFile = "") {
        if (!db || !db.objectStoreNames.contains("files")) return null;
        const exactFile = targetFile || (title ? (title.toLowerCase().endsWith(".mp3") ? title : `${title}.mp3`) : trackId);
        const isKaraokeReq = exactFile.toLowerCase().includes("karaoke");

        const isValidMatch = (rec) => {
            if (!rec || (!rec.blob && !rec.audio_blob)) return false;
            const recFile = (rec.file_id || rec.file || rec.title || "").toLowerCase();
            const isRecKaraoke = recFile.includes("karaoke");
            return isKaraokeReq === isRecKaraoke;
        };

        return new Promise((resolve) => {
            try {
                const tx = db.transaction("files", "readonly");
                const filesStore = tx.objectStore("files");

                // 1. Primary lookup: exact filename (e.g. "Manasa Palakave - Karaoke.mp3")
                const req = filesStore.get(exactFile);
                req.onsuccess = () => {
                    if (isValidMatch(req.result)) return resolve(req.result);
                    
                    // 2. Secondary lookup: trackId
                    const req2 = filesStore.get(trackId);
                    req2.onsuccess = () => {
                        if (isValidMatch(req2.result)) return resolve(req2.result);

                        // 3. Fallback cursor lookup strictly matching exactFile
                        const allReq = filesStore.getAll();
                        allReq.onsuccess = () => {
                            const match = (allReq.result || []).find(item => {
                                const itemFile = item.file_id || item.file || "";
                                return itemFile === exactFile && isValidMatch(item);
                            });
                            resolve(match || null);
                        };
                        allReq.onerror = () => resolve(null);
                    };
                    req2.onerror = () => resolve(null);
                };
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function getTrackBlobFromDB(trackId, title = "", targetFile = "") {
        const record = await getTrackRecordFromDB(trackId, title, targetFile);
        return record ? record.blob : null;
    }

    const MAX_INDEXEDB_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB Max Storage Quota Lock

    // Total cache budget. There was previously NO total cap at all (only a 60 MB
    // per-file limit), and the guard below trusted navigator.storage.estimate(),
    // which under-reports badly on iOS Safari - it claimed 5.7 MB while the cache
    // actually held 3.81 GB across 288 tracks. So the guard never fired and the
    // cache grew without bound until the device was under storage pressure, which
    // is what made the app slow. The budget is enforced against MEASURED bytes.
    const MAX_TOTAL_CACHE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB (user-set)

    async function checkStorageQuotaLimit() {
        try {
            const c = await getCacheStats();             // measured, and cheap after the first scan
            if (c.bytes >= MAX_TOTAL_CACHE_BYTES) {
                console.warn("[PWA Storage] Cache at " + (c.bytes/1073741824).toFixed(2) + " GB - trimming.");
                await enforceCacheBudget();
            }
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                if (est.quota && c.bytes >= est.quota * 0.9) {
                    console.warn("[PWA Storage] Near device quota - trimming.");
                    await enforceCacheBudget(est.quota * 0.7);
                }
            }
        } catch (e) {}
        return false;
    }

    // Evict the oldest cached audio until the cache fits the budget. Safe: every
    // track is re-downloadable from Azure on demand, so only the local copy goes.
    // The metadata row is KEPT (playlists join on it) - just the blobs are dropped.
    async function enforceCacheBudget(budget = MAX_TOTAL_CACHE_BYTES) {
        let database = null;
        try { database = db; } catch (_) { return; }
        if (!database || !database.objectStoreNames.contains("files")) return;
        const rows = await new Promise((resolve) => {
            const out = [];
            try {
                const req = database.transaction("files", "readonly").objectStore("files").openCursor();
                req.onsuccess = (e) => {
                    const cur = e.target.result;
                    if (!cur) return resolve(out);
                    const v = cur.value || {};
                    const b = v.blob || v.audio_blob;
                    if (b instanceof Blob && b.size > 0) out.push({ key: cur.primaryKey, size: b.size, ts: v.timestamp || 0 });
                    cur.continue();
                };
                req.onerror = () => resolve(out);
            } catch (_) { resolve(out); }
        });
        let total = rows.reduce((a, r) => a + r.size, 0);
        if (total <= budget) return;
        rows.sort((a, b) => a.ts - b.ts);
        const doomed = [];
        for (const r of rows) {
            if (total <= budget) break;
            doomed.push(r.key); total -= r.size;
        }
        if (!doomed.length) return;
        await new Promise((resolve) => {
            try {
                const tx = database.transaction("files", "readwrite");
                const st = tx.objectStore("files");
                doomed.forEach(k => {
                    const g = st.get(k);
                    g.onsuccess = () => {
                        const rec = g.result;
                        if (!rec) return;
                        delete rec.blob; delete rec.audio_blob;
                        delete rec.thumb_blob; delete rec.thumbBlob;
                        st.put(rec);
                    };
                });
                tx.oncomplete = resolve; tx.onerror = resolve;
            } catch (_) { resolve(); }
        });
        console.log("[PWA Storage] Evicted " + doomed.length + " cached track(s) to fit the budget.");
        updateCacheUsageUI(true);   // totals changed underneath us — rescan
    }

    // Count how many track blobs are ACTUALLY cached in IndexedDB. This is the
    // real signal of whether caching works — navigator.storage.estimate() is
    // unreliable/rounded on iOS. Must count only rows that hold a real audio Blob:
    // the "files" store also contains metadata-only rows (no blob) written by
    // playlist-sync for the filename→blob join, so a plain .count() over-reports.
    function countCachedTracks() {
        return new Promise((resolve) => {
            // TDZ-safe: updateCacheUsageUI() runs during early settings population,
            // BEFORE `let db` is initialized. Touching `db` there throws a
            // ReferenceError (and `typeof` throws too in a temporal dead zone), so
            // read it inside a try and bail out quietly until the DB exists.
            let database = null;
            try { database = db; } catch (_) { return resolve({ count: 0, bytes: 0, tiny: 0 }); }
            if (!database || !database.objectStoreNames.contains("files")) return resolve({ count: 0, bytes: 0, tiny: 0 });
            try {
                let n = 0, bytes = 0, tiny = 0;
                const req = database.transaction("files", "readonly").objectStore("files").openCursor();
                req.onsuccess = (e) => {
                    const cur = e.target.result;
                    if (!cur) return resolve({ count: n, bytes: bytes, tiny: tiny });
                    const v = cur.value || {};
                    const b = v.blob || v.audio_blob;
                    if (b instanceof Blob && b.size > 0) {
                        n++; bytes += b.size;
                        // A real audio track is not 20 KB. Anything this small is a
                        // truncated/failed download masquerading as a cached track,
                        // which is what made "288 tracks / 5.7 MB" possible.
                        if (b.size < 100 * 1024) tiny++;
                    }
                    cur.continue();
                };
                req.onerror = () => resolve({ count: n, bytes: bytes, tiny: tiny });
            } catch (e) { resolve({ count: 0, bytes: 0, tiny: 0 }); }
        });
    }

    // Bump with every deploy. Shown in Settings so we can tell at a glance whether
    // the phone is actually running the newest build (a stale service-worker cache
    // otherwise makes a fixed bug look unfixed).
    const APP_BUILD = "v40";

    // Memoised cache statistics.
    //
    // countCachedTracks() opens a cursor over the WHOLE files store. That is cheap
    // on a small database and expensive on a real one: with ~1283 records and 288
    // audio blobs (multiple GB), it was being run TWICE per cached track — once by
    // updateCacheUsageUI() and once by checkStorageQuotaLimit() — and the new
    // 3-track cache-ahead multiplied that to six full scans per song. That is what
    // made the player feel stuck on a well-populated phone while it was perfectly
    // fine on a fresh install. Scan once, then keep the totals up to date
    // incrementally; only rescan when something could have changed underneath us.
    let _cacheStats = null;

    async function getCacheStats(force = false) {
        if (!_cacheStats || force) _cacheStats = await countCachedTracks();
        return _cacheStats;
    }
    function noteBlobCached(size) {
        if (!_cacheStats) return;
        _cacheStats.count++; _cacheStats.bytes += size;
        if (size < 100 * 1024) _cacheStats.tiny++;
    }

    async function updateCacheUsageUI(force = false) {
        const c = await getCacheStats(force);
        const fmt = (b) => {
            const mb = b / (1024 * 1024);
            return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
        };
        // Report the SUM OF ACTUAL BLOB BYTES, not navigator.storage.estimate().
        // estimate() is quantised/under-reported on iOS Safari, which is how
        // "288 tracks cached · 5.7 MB" could appear — two numbers from different
        // sources that could not both be true. This figure is measured directly
        // from the cached blobs, so the count and the size always agree.
        let line = `Build ${APP_BUILD} · ${c.count} track${c.count === 1 ? '' : 's'} cached · ${fmt(c.bytes)}`;
        if (c.tiny > 0) line += ` · ⚠ ${c.tiny} suspiciously small (<100 KB)`;
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const est = await navigator.storage.estimate();
                if (est.quota) line += ` · quota ${fmt(est.quota)}`;
            } catch (e) {}
        }
        // Surface the session's auto-advance tally: the quickest way to answer
        // "how many songs did it get through with the screen off?".
        try {
            const log = window.__advanceLog || [];
            if (log.length) {
                const offCount = log.filter(e => e.screen !== "on").length;
                const last = log[log.length - 1];
                line += ` · ${log.length} auto-advance${log.length === 1 ? '' : 's'} this session`;
                if (offCount) line += ` (${offCount} screen-off, last ${last.at})`;
            }
        } catch (_) {}
        if (cacheUsageText) {
            cacheUsageText.textContent = line;
            cacheUsageText.style.color = c.tiny > 0 ? "#ffb454" : (c.count > 0 ? "var(--neon-blue)" : "var(--text-secondary)");
        }
    }

    if (btnClearCache) {
        btnClearCache.addEventListener("click", async () => {
            if (!db || !db.objectStoreNames.contains("files") || !confirm("Clear all offline cached music tracks?")) return;
            const tx = db.transaction("files", "readwrite");
            tx.objectStore("files").clear();
            _cacheStats = null;
            updateCacheUsageUI(true);
            alert("Offline cache cleared.");
        });
    }

    // --- MSAL & OneDrive API Integration ---
    function initMSAL() {
        if (typeof msal === "undefined") return;
        const clientId = getAzureClientId();
        const msalConfig = {
            auth: {
                clientId: clientId,
                authority: "https://login.microsoftonline.com/common",
                redirectUri: window.location.origin + window.location.pathname
            },
            cache: {
                cacheLocation: "localStorage",
                storeAuthStateInCookie: false
            }
        };
        try {
            msalInstance = new msal.PublicClientApplication(msalConfig);
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                currentUserAccount = accounts[0];
                updateLoginStateUI(true);
            }
        } catch (e) {
            console.error("MSAL init error:", e);
        }
    }

    function updateLoginStateUI(loggedIn) {
        if (loggedIn && currentUserAccount) {
            loginBtnText.textContent = currentUserAccount.username || "Connected to OneDrive";
            btnLoginOneDrive.style.borderColor = "var(--neon-blue)";
        } else {
            loginBtnText.textContent = "Connect OneDrive";
            btnLoginOneDrive.style.borderColor = "var(--border-color)";
        }
    }

    if (btnLoginOneDrive) {
        btnLoginOneDrive.addEventListener("click", async () => {
            if (!msalInstance) initMSAL();
            if (currentUserAccount) {
                if (confirm("Disconnect OneDrive account?")) {
                    msalInstance.logoutPopup().then(() => {
                        currentUserAccount = null;
                        updateLoginStateUI(false);
                    });
                }
                return;
            }
            try {
                const loginRes = await msalInstance.loginPopup({ scopes: ["Files.Read.All", "User.Read"] });
                currentUserAccount = loginRes.account;
                updateLoginStateUI(true);
                syncOneDriveMusic();
            } catch (err) {
                console.error("OneDrive login failed:", err);
            }
        });
    }

    async function getGraphAccessToken() {
        if (!currentUserAccount || !msalInstance) return null;
        try {
            const tokenRes = await msalInstance.acquireTokenSilent({
                scopes: ["Files.Read.All"],
                account: currentUserAccount
            });
            return tokenRes.accessToken;
        } catch (e) {
            const tokenRes = await msalInstance.acquireTokenPopup({
                scopes: ["Files.Read.All"],
                account: currentUserAccount
            });
            return tokenRes.accessToken;
        }
    }

    function getShareToken(shareUrl) {
        if (!shareUrl || (!shareUrl.startsWith("http://") && !shareUrl.startsWith("https://"))) return null;
        try {
            const rawB64 = btoa(unescape(encodeURIComponent(shareUrl)));
            return "u!" + rawB64.replace(/=/g, "").replace(/\//g, "_").replace(/\+/g, "-");
        } catch(e) {
            return null;
        }
    }

    async function syncOneDriveMusic() {
        const inputVal = getOneDriveShareLink();
        const shareToken = getShareToken(inputVal);
        const token = await getGraphAccessToken();

        playlistMetaInfo.textContent = `Syncing OneDrive / SharePoint music...`;

        try {
            let manifestUrl = "";
            let folderChildrenUrl = "";
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            if (shareToken) {
                manifestUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/root:/playlists_manifest.json`;
                folderChildrenUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children`;
            } else {
                manifestUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${inputVal}/playlists_manifest.json`;
                folderChildrenUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${inputVal}:/children`;
            }

            // 1. Search for playlists_manifest.json
            const searchRes = await fetch(manifestUrl, { headers }).catch(() => null);
            if (searchRes && searchRes.ok) {
                const manifest = await searchRes.json();
                if (manifest && manifest.playlists) {
                    for (const pl of manifest.playlists) {
                        pl.source = "onedrive";
                        await savePlaylistToDB(pl);
                    }
                }
            }

            // 2. Fetch root folder items
            const folderRes = await fetch(folderChildrenUrl, { headers }).catch(() => null);
            if (folderRes && folderRes.ok) {
                const folderData = await folderRes.json();
                const audioFiles = (folderData.value || []).filter(item => item.file && item.name.endsWith(".mp3"));

                const oneDrivePlaylist = {
                    id: "onedrive_all_songs",
                    title: "OneDrive - Shared Songs",
                    source: "onedrive",
                    tracks: audioFiles.map(file => ({
                        id: file.id,
                        title: file.name.replace(/\.[^/.]+$/, ""),
                        artist: "OneDrive Cloud",
                        file: file.name,
                        duration: 0,
                        downloadUrl: file["@microsoft.graph.downloadUrl"]
                    }))
                };
                await savePlaylistToDB(oneDrivePlaylist);
            }

            playlists = await getAllPlaylistsFromDB();
            renderSidebarList();
            if (playlists.length > 0 && !activePlaylistId) {
                selectPlaylist(playlists[0]);
            }
        } catch (e) {
            console.error("OneDrive Sync Error:", e);
            playlistMetaInfo.textContent = "OneDrive sync error: " + e.message;
        }
    }

    btnSyncOneDriveNow.addEventListener("click", async () => {
        btnSyncOneDriveNow.disabled = true;
        btnSyncOneDriveNow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Syncing...`;
        
        await syncDesktopPlaylists();
        if (currentUserAccount) {
            await syncOneDriveMusic();
        }

        btnSyncOneDriveNow.disabled = false;
        btnSyncOneDriveNow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync`;
    });

    // --- YouTube Link Analyze & On-Demand Downloader ---
    analyzeBtn.addEventListener("click", async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        urlError.classList.add("hidden");
        analyzeSpinner.classList.remove("hidden");
        analyzeBtn.disabled = true;

        try {
            const res = await fetch("/api/fetch-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to analyze YouTube link.");
            }

            const data = await res.json();
            const isPlaylist = data.is_playlist || (data.entries && data.entries.length > 1);
            const title = data.title || (isPlaylist ? "YouTube Playlist" : (data.entries?.[0]?.title || "YouTube Download"));
            const playlistId = "yt_" + Date.now();

            const tracks = (data.entries || []).map(entry => ({
                id: entry.id,
                title: entry.title,
                artist: entry.uploader || entry.channel || "YouTube",
                duration: entry.duration || 0,
                thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
                url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
                file: `${entry.title}.mp3`,
                status: "queued"
            }));

            const newPlaylist = {
                id: playlistId,
                title: title,
                url: url,
                source: "youtube",
                is_playlist: isPlaylist,
                tracks: tracks
            };

            await savePlaylistToDB(newPlaylist);
            await loadPlaylistsFromDB();
            selectPlaylist(newPlaylist);
            urlInput.value = "";

            // Automatically start pre-fetching 2-3 error-free songs in advance
            prefetchUpcomingTracks(tracks, -1, 3);
        } catch (err) {
            console.error("YouTube link analysis failed:", err);
            urlError.textContent = err.message || "Failed to analyze YouTube URL.";
            urlError.classList.remove("hidden");
        } finally {
            analyzeSpinner.classList.add("hidden");
            analyzeBtn.disabled = false;
        }
    });

    // --- Desktop Header Controls & Sync YouTube Logic ---
    if (btnPrefetch3) {
        btnPrefetch3.addEventListener("click", async () => {
            if (!activePlaylistItems || activePlaylistItems.length === 0) {
                alert("Please select or analyze a playlist first.");
                return;
            }
            btnPrefetch3.disabled = true;
            btnPrefetch3.textContent = "Caching 3 Songs...";
            gridHud.classList.remove("hidden");
            hudJobTitle.textContent = "Pre-downloading 3 Error-Free Songs into IndexedDB...";

            await prefetchUpcomingTracks(activePlaylistItems, currentTrackIndex, 3);

            hudJobTitle.textContent = "Completed 3-Song Rolling Buffer Caching!";
            setTimeout(() => gridHud.classList.add("hidden"), 4000);
            btnPrefetch3.disabled = false;
            btnPrefetch3.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--neon-blue)" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <span>Pre-download 3 Songs</span>`;
        });
    }

    async function performFullSync(btnEl = null) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Syncing...`;
        }

        try {
            await syncDesktopPlaylists();
            if (currentUserAccount) {
                await syncOneDriveMusic();
            }
            alert(`Sync complete! ${playlists.length} playlists loaded into IndexedDB master store.`);
        } catch (e) {
            console.error("Sync error:", e);
            alert("Sync error: " + (e.message || e));
        } finally {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Sync Playlist</span>`;
            }
        }
    }

    if (refreshPlaylistBtn) {
        refreshPlaylistBtn.addEventListener("click", () => performFullSync(refreshPlaylistBtn));
    }

    // NOTE: btnSyncMobile is bound ONCE, further below, to the mobile-specific
    // handler (which also re-renders the mobile cards). It used to ALSO be bound to
    // performFullSync here, so every Refresh tap ran two full syncs, fetched the
    // ~600 KB manifest twice, popped an alert(), and the two handlers fought over
    // the button label.

    if (playPlaylistBtn) {
        playPlaylistBtn.addEventListener("click", () => {
            if (!activePlaylistItems || activePlaylistItems.length === 0) return;
            playTrack(activePlaylistItems[0], activePlaylistItems, 0);
        });
    }

    if (resumePlaylistBtn) {
        resumePlaylistBtn.addEventListener("click", () => {
            resumePlaylist();
        });
    }

    function saveResumePosition(playlistId, trackId, currentTime, trackIndex) {
        if (!playlistId || !trackId) return;
        try {
            const raw = localStorage.getItem("sonicstream_resume_map") || "{}";
            const map = JSON.parse(raw);
            map[playlistId] = {
                trackId: trackId,
                currentTime: Math.floor(currentTime || 0),
                trackIndex: trackIndex || 0,
                timestamp: Date.now()
            };
            localStorage.setItem("sonicstream_resume_map", JSON.stringify(map));
            
            fetch(`/api/history/${playlistId}/last-played`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ track_id: trackId })
            }).catch(() => {});
        } catch(e) {}
    }

    function getResumePosition(playlistId) {
        try {
            const raw = localStorage.getItem("sonicstream_resume_map") || "{}";
            const map = JSON.parse(raw);
            return map[playlistId] || null;
        } catch(e) {
            return null;
        }
    }

    async function resumePlaylist(pl) {
        const playlist = pl || playlists.find(p => p.id === activePlaylistId);
        if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return;

        const posInfo = getResumePosition(playlist.id);
        let targetTrack = playlist.tracks[0];
        let targetIndex = 0;
        let seekTime = 0;

        if (posInfo) {
            const foundIdx = playlist.tracks.findIndex(t => t.id === posInfo.trackId);
            if (foundIdx >= 0) {
                targetTrack = playlist.tracks[foundIdx];
                targetIndex = foundIdx;
                seekTime = posInfo.currentTime || 0;
            }
        }

        await playTrack(targetTrack, playlist.tracks, targetIndex);
        if (seekTime > 0) {
            audioElement.currentTime = seekTime;
        }
    }

    if (statusFilter) {
        statusFilter.addEventListener("change", () => {
            filterAndRenderTracks();
        });
    }

    function filterAndRenderTracks() {
        if (!activePlaylistItems) return;
        const query = playlistSearch ? playlistSearch.value.toLowerCase().trim() : "";
        const stat = statusFilter ? statusFilter.value : "all";

        let filtered = activePlaylistItems.filter(t => {
            const matchesQuery = !query || t.title.toLowerCase().includes(query) || (t.artist && t.artist.toLowerCase().includes(query));
            let matchesStatus = true;
            if (stat === "completed") matchesStatus = (t.status === "completed" || t.isLocalBlob);
            else if (stat === "queued") matchesStatus = (t.status === "queued" || !t.status);
            else if (stat === "error") matchesStatus = (t.status === "error");
            return matchesQuery && matchesStatus;
        });

        renderTracksTable(filtered);
    }

    if (deselectAllBtn) deselectAllBtn.addEventListener("click", () => {
        selectedTrackIds.clear();
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        renderTracksTable(activePlaylistItems);
    });

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedTrackIds = new Set(activePlaylistItems.map(t => t.id));
            } else {
                selectedTrackIds.clear();
            }
            renderTracksTable(activePlaylistItems);
        });
    }

    downloadBtn.addEventListener("click", async () => {
        if (selectedTrackIds.size === 0) {
            alert("Please select tracks using checkboxes first.");
            return;
        }
        const selectedItems = activePlaylistItems.filter(t => selectedTrackIds.has(t.id));
        gridHud.classList.remove("hidden");
        hudJobTitle.textContent = `Downloading ${selectedItems.length} Selected Tracks`;

        await prefetchUpcomingTracks(selectedItems, -1, selectedItems.length);
        hudJobTitle.textContent = `Completed 3-song buffer caching for selected tracks.`;
        setTimeout(() => gridHud.classList.add("hidden"), 4000);
    });

    if (downloadAllBtn) {
        downloadAllBtn.addEventListener("click", async () => {
            if (!activePlaylistItems || activePlaylistItems.length === 0) {
                alert("Please select or open a playlist first.");
                return;
            }
            selectedTrackIds = new Set(activePlaylistItems.map(t => t.id));
            if (selectAllCheckbox) selectAllCheckbox.checked = true;
            renderTracksTable(activePlaylistItems);

            gridHud.classList.remove("hidden");
            hudJobTitle.textContent = `Downloading All ${activePlaylistItems.length} Tracks into Offline IndexedDB Cache...`;

            await prefetchUpcomingTracks(activePlaylistItems, -1, activePlaylistItems.length);
            hudJobTitle.textContent = `Completed 100% Offline Caching for All ${activePlaylistItems.length} Tracks!`;
            setTimeout(() => gridHud.classList.add("hidden"), 4000);
        });
    }

    // --- Import Local iPhone Files Handler ---
    if (btnImportLocalFiles && localFileInput) btnImportLocalFiles.addEventListener("click", () => localFileInput.click());

    if (localFileInput) localFileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        let localPlaylist = (await getAllPlaylistsFromDB()).find(p => p.id === "local_iphone_files");
        if (!localPlaylist) {
            localPlaylist = {
                id: "local_iphone_files",
                title: "Local iPhone Music",
                source: "local",
                tracks: []
            };
        }

        for (const file of files) {
            const trackId = "local_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
            // Save file blob to IndexedDB
            await saveTrackBlobToDB(trackId, file);

            localPlaylist.tracks.push({
                id: trackId,
                title: file.name.replace(/\.[^/.]+$/, ""),
                artist: "On My iPhone",
                file: file.name,
                duration: 0,
                isLocalBlob: true
            });
        }

        await savePlaylistToDB(localPlaylist);
        loadPlaylistsFromDB();
        selectPlaylist(localPlaylist);
    });

    // --- Load Playlists & Sidebar Rendering ---
    // Short-lived in-memory cache of the playlists manifest (~600 KB raw / ~60 KB
    // brotli). Without this the same payload was downloaded and JSON-parsed
    // several times per page load, which is slow on a phone.
    let _manifestCache = null;
    const MANIFEST_TTL_MS = 60 * 1000;
    async function syncDesktopPlaylists(onProgress = null) {
        try {
            if (onProgress) onProgress(0, 100, 5);
            let desktopPlaylists = [];
            
            const sasToken = getAzureSASToken();
            const azureCloudManifestUrl = `${getAzureBlobBaseUrl()}/playlists_manifest.json?${sasToken}`;
            
            const apiEndpoints = [
                "./playlists_manifest.json",
                azureCloudManifestUrl,
                "/api/playlists/list",
                "http://127.0.0.1:8765/api/playlists/list",
                "http://localhost:8765/api/playlists/list"
            ];

            // Memoised: this manifest is ~600 KB raw and was being re-fetched on
            // every sync — three times in a single page load. Reuse a recent copy
            // instead; the Refresh button passes force=true via _manifestCache=null.
            let data = null;
            if (_manifestCache && (Date.now() - _manifestCache.at) < MANIFEST_TTL_MS) {
                data = _manifestCache.data;
            } else {
                let res = null;
                for (let url of apiEndpoints) {
                    try {
                        res = await fetch(url, { cache: "no-cache" });
                        if (res && res.ok) break;
                    } catch (e) {}
                }
                if (res && res.ok) {
                    data = await res.json();
                    _manifestCache = { at: Date.now(), data: data };
                }
            }
            if (data) {
                desktopPlaylists = data.playlists || [];
            }

            if ((!desktopPlaylists || desktopPlaylists.length === 0) && window.SONICSTREAM_MANIFEST_FALLBACK && window.SONICSTREAM_MANIFEST_FALLBACK.playlists) {
                console.log("[PWA Sync] Using bundled manifest_fallback.js data!");
                desktopPlaylists = window.SONICSTREAM_MANIFEST_FALLBACK.playlists;
            }

            if (desktopPlaylists && desktopPlaylists.length > 0) {
                desktopPlaylists = desktopPlaylists.map(item => ({
                    id: item.id,
                    title: item.playlist_title || item.title || "Desktop Playlist",
                    url: item.url || "",
                    source: "desktop",
                    thumbnail: item.thumbnail || (item.items && item.items[0] && item.items[0].thumbnail) || "gita_cover_logo.png",
                    tracks: (item.items || item.tracks || []).map(track => ({
                        id: track.id,
                        title: track.title,
                        artist: track.uploader || track.artist || "SonicStream",
                        duration: track.duration || 0,
                        thumbnail: track.thumbnail || "gita_cover_logo.png",
                        url: track.url || `https://www.youtube.com/watch?v=${track.id}`,
                        file: track.file || (track.title ? `${track.title}.mp3` : track.id),
                        downloadUrl: track.downloadUrl,
                        status: track.status || "queued"
                    }))
                }));
            }



            if (desktopPlaylists.length > 0) {
                playlists = desktopPlaylists;
                const fileRecordsToSave = [];
                for (let i = 0; i < desktopPlaylists.length; i++) {
                    const pl = desktopPlaylists[i];
                    await savePlaylistToDB(pl);
                    if (pl.tracks) {
                        for (const tr of pl.tracks) {
                            if (tr.file) {
                                fileRecordsToSave.push({
                                    file_id: tr.file,
                                    id: tr.id,
                                    title: tr.title,
                                    artist: tr.artist,
                                    duration: tr.duration,
                                    file: tr.file
                                });
                            }
                        }
                    }
                }
                await saveBatchFileRecordsToDB(fileRecordsToSave);

                // Prune desktop playlists that no longer exist in the manifest.
                // Sync only ever added/updated, so a playlist that was removed or
                // renamed upstream lingered in IndexedDB forever and appeared
                // alongside its replacement — e.g. TWO "Bhagavad Gita" playlists,
                // the stale one still pointing at filenames that no longer exist.
                // Only desktop-sourced playlists are pruned; anything created
                // locally on the phone is left untouched.
                try {
                    const liveIds = new Set(desktopPlaylists.map(p => p.id));
                    const existing = await getAllPlaylistsFromDB();
                    const stale = existing.filter(p => (!p.source || p.source === "desktop") && !liveIds.has(p.id));
                    if (stale.length && db && db.objectStoreNames.contains("playlists")) {
                        const tx = db.transaction("playlists", "readwrite");
                        const store = tx.objectStore("playlists");
                        stale.forEach(p => { try { store.delete(p.id); } catch (_) {} });
                        console.log("[PWA Sync] Pruned stale playlists:", stale.map(p => p.title || p.id).join(", "));
                    }
                } catch (e) {
                    console.warn("[PWA Sync] Prune skipped:", e);
                }

                console.log(`[PWA] Synced ${desktopPlaylists.length} playlists and ${fileRecordsToSave.length} file records to IndexedDB.`);
            }

            const dbPlaylists = await getAllPlaylistsFromDB();
            if (dbPlaylists.length > 0) playlists = dbPlaylists;

            await renderSidebarList();
            if (playlists.length > 0 && (!activePlaylistId || !playlists.find(p => p.id === activePlaylistId))) {
                selectPlaylist(playlists[0]);
            }
        } catch (err) {
            console.error("[PWA] Sync playlists error:", err);
        } finally {
            hideHud();
        }
    }

    function showHud(title, file = "") {
        if (!gridHud) return;
        if (hudJobTitle) hudJobTitle.textContent = title;
        if (hudCurrentFile) hudCurrentFile.textContent = file;
        gridHud.style.display = "flex";
        gridHud.classList.remove("hidden");
    }

    function hideHud() {
        if (!gridHud) return;
        gridHud.style.display = "none";
        gridHud.classList.add("hidden");
    }

    async function loadPlaylistsFromDB() {
        playlists = await getAllPlaylistsFromDB();
        if (playlists.length > 0) {
            selectPlaylist(playlists[0]);
        }
        await syncDesktopPlaylists();
        playlists = await getAllPlaylistsFromDB();
        renderSidebarList();
        if (playlists.length > 0 && (!activePlaylistId || !playlists.find(p => p.id === activePlaylistId))) {
            selectPlaylist(playlists[0]);
        }
    }

    async function renderSidebarList() {
        if (mobilePlaylistsList) {
            renderMobilePlaylists();
        }

        if (!playlistListContainer) return;
        playlistListContainer.innerHTML = "";

        let cachedTrackKeys = new Set();
        if (db && db.objectStoreNames.contains("files")) {
            try {
                const tx = db.transaction("files", "readonly");
                const allKeys = await new Promise(r => {
                    const req = tx.objectStore("files").getAllKeys();
                    req.onsuccess = () => r(req.result || []);
                    req.onerror = () => r([]);
                });
                cachedTrackKeys = new Set(allKeys);
            } catch (e) {}
        }

        let filtered = playlists;
        if (sidebarTabFilter === "local") {
            filtered = playlists.filter(p => p.source === "local");
        } else if (sidebarTabFilter === "offline") {
            filtered = playlists.filter(p => {
                if (p.source === "local" || p.isCached) return true;
                if (p.tracks && p.tracks.some(t => cachedTrackKeys.has(t.id) || t.file || t.isLocalBlob)) return true;
                return false;
            });
        }

        // Pinned first, "Deleted tracks" playlist always last (shared rule).
        filtered = sortPlaylistsForDisplay(filtered);

        if (filtered.length === 0) {
            playlistListContainer.innerHTML = `<div style="font-size:0.75rem; color: var(--text-muted); text-align:center; padding: 1.5rem 0;">No offline playlists found.</div>`;
            return;
        }

        filtered.forEach(pl => {
            const row = document.createElement("div");
            row.className = `sidebar-row ${activePlaylistId === pl.id ? 'active' : ''}`;
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "0.65rem";
            row.style.padding = "0.55rem 0.65rem";

            let rawThumb = getPlaylistThumbnail(pl);
            if (!rawThumb || rawThumb === "icon.svg") rawThumb = pl.thumbnail || "gita_cover_logo.png";

            const firstThumb = rawThumb.startsWith("/") ? ((window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8765") + rawThumb) : rawThumb;
            const trackCount = (pl.tracks || []).length;
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.6rem; width: 100%; min-width: 0;">
                    <img src="${firstThumb}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" onerror="this.onerror=null; this.src='gita_cover_logo.png';">
                    <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                        <div class="sidebar-row-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${pl.isPinned ? '📌 ' : ''}${pl.title}</div>
                        <div class="sidebar-row-meta" style="font-size: 0.7rem; color: var(--text-secondary);">${trackCount} tracks | ${pl.source === 'desktop' ? 'Desktop Synced' : (pl.source === 'local' ? 'iPhone File' : 'OneDrive')}</div>
                    </div>
                    <div class="sidebar-row-actions" style="display: flex; gap: 0.15rem; align-items: center; flex-shrink: 0;" onclick="event.stopPropagation();">
                        <button class="play-sidebar-btn" title="Play Playlist" style="background: transparent; border: none; cursor: pointer; color: var(--neon-blue); padding: 2px 4px; font-size: 1.05rem;">▶️</button>
                        <button class="resume-sidebar-btn" title="Resume Playlist" style="background: transparent; border: none; cursor: pointer; color: var(--neon-purple); padding: 2px 4px; font-size: 1.05rem;">⏯️</button>
                        <button class="download-sidebar-btn" title="Download All Tracks to IndexedDB" style="background: transparent; border: none; cursor: pointer; color: var(--neon-blue); padding: 2px 4px; font-size: 1.05rem;">⬇️</button>
                        <button class="shuffle-sidebar-btn" title="Shuffle Play" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); padding: 2px 4px; font-size: 1.05rem;">🔀</button>
                        <button class="pin-sidebar-btn" title="Pin Playlist" style="background: transparent; border: none; cursor: pointer; color: var(--text-muted); padding: 2px 4px; font-size: 1.05rem;">📌</button>
                        <button class="delete-sidebar-btn" title="Delete Playlist" style="background: transparent; border: none; cursor: pointer; color: #ff5f56; padding: 2px 4px; font-size: 1.05rem;">🗑️</button>
                    </div>
                </div>
            `;

            row.querySelector(".download-sidebar-btn")?.addEventListener("click", async () => {
                selectPlaylist(pl);
                const dlBtn = row.querySelector(".download-sidebar-btn");
                dlBtn.textContent = "⏳";
                try {
                    if (pl.tracks && pl.tracks.length > 0) {
                        for (let i = 0; i < pl.tracks.length; i++) {
                            const track = pl.tracks[i];
                            dlBtn.title = `Caching (${i + 1}/${pl.tracks.length})`;
                            await prefetchUpcomingTracks([track], -1, 1);
                        }
                        dlBtn.textContent = "✅";
                    }
                } catch (e) {
                    dlBtn.textContent = "⚠️";
                } finally {
                    setTimeout(() => { dlBtn.textContent = "⬇️"; dlBtn.title = "Download All Tracks to IndexedDB"; }, 3000);
                }
            });

            row.querySelector(".play-sidebar-btn")?.addEventListener("click", () => {
                selectPlaylist(pl);
                if (pl.tracks && pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks, 0);
            });

            row.querySelector(".resume-sidebar-btn")?.addEventListener("click", () => {
                selectPlaylist(pl);
                resumePlaylist(pl);
            });

            row.querySelector(".shuffle-sidebar-btn")?.addEventListener("click", () => {
                selectPlaylist(pl);
                if (pl.tracks && pl.tracks.length > 0) {
                    const shuffled = [...pl.tracks].sort(() => Math.random() - 0.5);
                    playTrack(shuffled[0], shuffled, 0);
                }
            });

            row.querySelector(".pin-sidebar-btn")?.addEventListener("click", () => {
                pl.isPinned = !pl.isPinned;
                savePlaylistToDB(pl);
                renderSidebarList();
            });

            row.querySelector(".delete-sidebar-btn")?.addEventListener("click", async () => {
                if (confirm(`Delete playlist "${pl.title}"?`)) {
                    if (db) {
                        const tx = db.transaction("playlists", "readwrite");
                        tx.objectStore("playlists").delete(pl.id);
                    }
                    playlists = playlists.filter(p => p.id !== pl.id);
                    renderSidebarList();
                }
            });

            row.addEventListener("click", () => {
                selectPlaylist(pl);
            });
            if (playlistListContainer) playlistListContainer.appendChild(row);
        });

        if (mobilePlaylistsList) {
            renderMobilePlaylists();
        }
    }

    // --- Dedicated Mobile UX Handlers ---
    // Shared ordering: pinned first, "Deleted tracks" playlist always last.
    function sortPlaylistsForDisplay(arr) {
        const isDeleted = p => p.id === "deleted_tracks" || p.id === "trash" || (p.title && p.title.toLowerCase().includes("deleted"));
        return [...arr].sort((a, b) => {
            const ad = isDeleted(a), bd = isDeleted(b);
            if (ad && !bd) return 1;
            if (!ad && bd) return -1;
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0;
        });
    }

    // Crisp SVG action controls, styled like the bottom player transport controls
    // (subtle bg + border). Fixed 38px rounded squares so they take only the width
    // they need and leave the playlist title its space. Shared by the mobile home
    // cards and the selected-playlist (tracks) toolbar. (Emoji scaled with a
    // transform looked low-res and ate the label — replaced with vector icons.)
    const MPC_ACTION_BTN_STYLE = "width: 38px; height: 38px; border-radius: 9px; " +
        "background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); " +
        "color: var(--text-primary); cursor: pointer; padding: 0; flex-shrink: 0; " +
        "display: flex; align-items: center; justify-content: center;";
    // Accent the primary Play action.
    const MPC_PLAY_BTN_STYLE = MPC_ACTION_BTN_STYLE + " border-color: var(--neon-blue); color: var(--neon-blue);";
    const MPC_ICON = {
        play: '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        shuffle: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
        resume: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
        download: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        pin: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76a2 2 0 0 0 .59 1.42l1.41 1.41a1 1 0 0 1 .29.71V16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-.7a1 1 0 0 1 .29-.71l1.41-1.41A2 2 0 0 0 9 10.76z"/></svg>',
        delete: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
    };

    // Shared playlist action markup + wiring for the selected-playlist toolbar,
    // reusing the same square controls with a per-action accent colour (later wins).
    const PA_BTN_STYLE = MPC_ACTION_BTN_STYLE + " ";
    function playlistActionsHtml() {
        return `
            <button class="pa-download" title="Download all to offline cache" style="${PA_BTN_STYLE} color: var(--neon-blue);">${MPC_ICON.download}</button>
            <button class="pa-play" title="Play" style="${PA_BTN_STYLE} color: var(--neon-blue);">${MPC_ICON.play}</button>
            <button class="pa-resume" title="Resume from last position" style="${PA_BTN_STYLE} color: var(--neon-purple);">${MPC_ICON.resume}</button>
            <button class="pa-shuffle" title="Shuffle play" style="${PA_BTN_STYLE} color: var(--text-secondary);">${MPC_ICON.shuffle}</button>
            <button class="pa-pin" title="Pin / unpin" style="${PA_BTN_STYLE} color: var(--text-muted);">${MPC_ICON.pin}</button>
            <button class="pa-delete" title="Delete playlist" style="${PA_BTN_STYLE} color: #ff5f56;">${MPC_ICON.delete}</button>`;
    }
    function wirePlaylistActions(scope, pl) {
        const stop = fn => (e) => { e.stopPropagation(); fn(e); };
        const on = (sel, fn) => { const el = scope.querySelector(sel); if (el) el.addEventListener("click", stop(fn)); };
        on(".pa-download", async (e) => {
            const b = e.currentTarget; b.textContent = "⏳";
            try {
                if (pl.tracks) for (let i = 0; i < pl.tracks.length; i++) await prefetchUpcomingTracks([pl.tracks[i]], -1, 1);
                b.textContent = "✅";
            } catch (_) { b.textContent = "⚠️"; }
            setTimeout(() => { b.innerHTML = MPC_ICON.download; }, 3000);
        });
        on(".pa-play", () => { selectPlaylist(pl); if (pl.tracks && pl.tracks.length) playTrack(pl.tracks[0], pl.tracks, 0); });
        on(".pa-resume", () => { selectPlaylist(pl); resumePlaylist(pl); });
        on(".pa-shuffle", () => { selectPlaylist(pl); if (pl.tracks && pl.tracks.length) { const s = [...pl.tracks].sort(() => Math.random() - 0.5); playTrack(s[0], s, 0); } });
        on(".pa-pin", () => { pl.isPinned = !pl.isPinned; savePlaylistToDB(pl); renderSidebarList(); renderMobilePlaylists(); });
        on(".pa-delete", () => {
            if (confirm(`Delete playlist "${pl.title}"?`)) {
                if (db) { const tx = db.transaction("playlists", "readwrite"); tx.objectStore("playlists").delete(pl.id); }
                playlists = playlists.filter(p => p.id !== pl.id);
                renderSidebarList(); renderMobilePlaylists();
            }
        });
    }

    function renderMobilePlaylists() {
        if (!mobilePlaylistsList) return;
        mobilePlaylistsList.innerHTML = "";

        if (playlists.length === 0) {
            mobilePlaylistsList.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem 1rem;">No playlists found. Tap Refresh or add tracks in desktop.</div>`;
            return;
        }

        sortPlaylistsForDisplay(playlists).forEach(pl => {
            const trackCount = (pl.tracks || []).length;
            const thumb = getPlaylistThumbnail(pl);

            const card = document.createElement("div");
            card.className = "mobile-playlist-card";
            card.style.display = "flex";
            card.style.flexDirection = "row";
            card.style.alignItems = "center";
            card.style.justifyContent = "space-between";
            card.style.padding = "0.6rem 0.85rem";
            card.style.marginBottom = "0.5rem";
            card.innerHTML = `
                <div class="mpc-main" style="display: flex; align-items: center; gap: 0.75rem; min-width: 0; flex: 1;">
                    <img src="${thumb}" class="mobile-card-thumb" style="width: 46px; height: 46px; border-radius: 8px; object-fit: cover; flex-shrink: 0;" onerror="this.onerror=null; this.src='gita_cover_logo.png'">
                    <div class="mobile-card-info" style="min-width: 0; flex: 1;">
                        <div class="mobile-card-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.3rem; font-weight: 700; line-height: 1.2;">${pl.isPinned ? '📌 ' : ''}${pl.title || 'Untitled Playlist'}</div>
                        <div class="mobile-card-subtitle" style="font-size: 0.95rem; color: var(--text-secondary);">${trackCount} tracks</div>
                    </div>
                </div>
                <div class="mpc-actions" style="display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0;" onclick="event.stopPropagation();">
                    <button class="pa-play" title="Play" style="${MPC_PLAY_BTN_STYLE}">${MPC_ICON.play}</button>
                    <button class="pa-shuffle" title="Shuffle play" style="${MPC_ACTION_BTN_STYLE}">${MPC_ICON.shuffle}</button>
                    <button class="pa-resume" title="Resume" style="${MPC_ACTION_BTN_STYLE}">${MPC_ICON.resume}</button>
                </div>
            `;
            card.querySelector(".mpc-main").addEventListener("click", () => showMobilePlaylistTracks(pl));
            wirePlaylistActions(card, pl);
            mobilePlaylistsList.appendChild(card);
        });
    }

    function showMobilePlaylistTracks(pl) {
        if (!mobileTracksView || !mobilePlaylistsView) return;
        selectPlaylist(pl);

        if (mobileCurrentPlaylistTitle) mobileCurrentPlaylistTitle.textContent = pl.title || "Playlist Tracks";
        mobilePlaylistsView.style.display = "none";
        mobileTracksView.style.display = "block";

        // Action toolbar at the top of the tracks view (parity with desktop).
        let toolbar = document.getElementById("mobileTracksToolbar");
        if (!toolbar) {
            toolbar = document.createElement("div");
            toolbar.id = "mobileTracksToolbar";
            toolbar.style.cssText = "display: flex; gap: 0.35rem; padding: 0 0.25rem 0.75rem; justify-content: space-between; flex-wrap: wrap;";
            if (mobileTrackList && mobileTrackList.parentNode) {
                mobileTrackList.parentNode.insertBefore(toolbar, mobileTrackList);
            }
        }
        toolbar.innerHTML = playlistActionsHtml();
        wirePlaylistActions(toolbar, pl);

        if (mobileTrackList) {
            mobileTrackList.innerHTML = "";
            const tracks = pl.tracks || [];
            if (tracks.length === 0) {
                mobileTrackList.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem 1rem;">No tracks in this playlist.</div>`;
                return;
            }

            tracks.forEach((track, idx) => {
                const item = document.createElement("div");
                item.className = "mobile-track-item";
                const thumb = getTrackThumbnailUrl(track);
                item.innerHTML = `
                    <img src="${thumb}" class="mobile-track-thumb" onerror="this.onerror=null; this.src='gita_cover_logo.png'">
                    <div class="mobile-track-details">
                        <div class="mobile-track-title">${track.title || 'Untitled Track'}</div>
                        <div class="mobile-track-artist">${track.artist || track.uploader || 'SonicStream'} • ${formatDuration(track.duration || 0)}</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.5rem; font-size: 0.75rem; border-radius: 6px;">▶</button>
                `;

                item.addEventListener("click", () => {
                    playTrack(track, tracks, idx);
                });

                mobileTrackList.appendChild(item);
            });
        }
    }

    if (btnBackToPlaylists) {
        btnBackToPlaylists.addEventListener("click", () => {
            if (mobileTracksView && mobilePlaylistsView) {
                mobileTracksView.style.display = "none";
                mobilePlaylistsView.style.display = "block";
            }
        });
    }

    if (btnSyncMobile) {
        btnSyncMobile.addEventListener("click", async () => {
            btnSyncMobile.disabled = true;
            btnSyncMobile.textContent = "⏳ Syncing...";
            _manifestCache = null;   // explicit Refresh must bypass the memo
            try {
                await syncDesktopPlaylists();
                renderMobilePlaylists();
            } finally {
                btnSyncMobile.disabled = false;
                btnSyncMobile.textContent = "🔄 Refresh";
            }
        });
    }

    if (tabAll) tabAll.addEventListener("click", () => { setSidebarTab("all", tabAll); });
    if (tabLocal) tabLocal.addEventListener("click", () => { setSidebarTab("local", tabLocal); });
    if (tabOffline) tabOffline.addEventListener("click", () => { setSidebarTab("offline", tabOffline); });

    function setSidebarTab(tabName, btnEl) {
        sidebarTabFilter = tabName;
        document.querySelectorAll(".sidebar-tabs .tab-btn").forEach(b => b.classList.remove("active"));
        btnEl.classList.add("active");
        renderSidebarList();
    }

    function isPhoneDevice() {
        return window.innerWidth <= 768;
    }

    // Device check used ONLY for audio routing — deliberately NOT width-based.
    //
    // isPhoneDevice() is window.innerWidth <= 768, which is fine for layout but
    // WRONG for audio: rotating the phone to landscape (car mount/cradle) pushes
    // innerWidth to ~850-930px, so the "no Web Audio on phones" guard silently
    // failed and createMediaElementSource() ran. That reroutes the element's audio
    // into the Web Audio graph PERMANENTLY, and iOS suspends the AudioContext on
    // lock/background — so the playback clock keeps advancing while NO SOUND comes
    // out. That is the "progress bar moves but I can't hear anything" bug.
    function isMobileAudioDevice() {
        const ua = navigator.userAgent || "";
        const iOS = /iPad|iPhone|iPod/.test(ua) ||
                    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1); // iPadOS
        const android = /Android/i.test(ua);
        const coarsePointer = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
        return iOS || android || coarsePointer || window.innerWidth <= 768;
    }

    // Hide 'Local iPhone' tab and 'Back' button on Desktop browsers
    if (tabLocal) {
        tabLocal.style.display = isPhoneDevice() ? "inline-block" : "none";
    }

    const playlistSidebar = document.querySelector(".playlist-sidebar");
    if (btnBackToPlaylists) {
        btnBackToPlaylists.style.display = isPhoneDevice() ? "inline-flex" : "none";
        btnBackToPlaylists.addEventListener("click", () => {
            if (isPhoneDevice()) {
                if (playlistSidebar) playlistSidebar.style.display = "flex";
                const plSection = document.getElementById("playlistSection");
                if (plSection) plSection.style.display = "none";
            }
        });
    }

    // Desktop Sidebar Mouse Drag Resizer
    const resizer = document.getElementById("sidebarResizer");
    if (resizer && playlistSidebar) {
        let isResizing = false;
        resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            resizer.style.background = "var(--neon-blue)";
        });
        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const sidebarRect = playlistSidebar.getBoundingClientRect();
            const newWidth = e.clientX - sidebarRect.left;
            if (newWidth >= 240 && newWidth <= 650) {
                playlistSidebar.style.width = `${newWidth}px`;
            }
        });
        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                resizer.style.background = "transparent";
            }
        });
    }

    function selectPlaylist(pl) {
        if (!pl) return;
        activePlaylistId = pl.id;
        activePlaylistItems = pl.tracks || [];
        if (playlistTitle) playlistTitle.textContent = pl.title || "Untitled Playlist";
        if (playlistMetaInfo) playlistMetaInfo.textContent = `${activePlaylistItems.length} tracks | Source: ${pl.source === 'desktop' ? 'Desktop App Synced' : (pl.source === 'local' ? 'Local Device' : 'OneDrive Cloud')}`;
        renderSidebarList();
        renderTracksTable(activePlaylistItems);

        const plSection = document.getElementById("playlistSection");
        if (plSection) plSection.style.display = "flex";

        if (isPhoneDevice() && playlistSidebar) {
            playlistSidebar.style.display = "none";
            if (btnBackToPlaylists) btnBackToPlaylists.style.display = "inline-flex";
        } else if (playlistSidebar) {
            playlistSidebar.style.display = "flex";
            if (btnBackToPlaylists) btnBackToPlaylists.style.display = "none";
        }
    }

    let currentPage = 1;
    const pageSize = 50;

    function renderTracksTable(items) {
        if (!playlistTableBody) return;
        playlistTableBody.innerHTML = "";
        if (selectedCountInfo) selectedCountInfo.textContent = selectedTrackIds.size;
        if (totalCountInfo) totalCountInfo.textContent = activePlaylistItems.length;

        if (items.length === 0) {
            playlistTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No tracks matching criteria.</td></tr>`;
            return;
        }

        const totalPages = Math.ceil(items.length / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        const startIdx = (currentPage - 1) * pageSize;
        const pageItems = items.slice(startIdx, startIdx + pageSize);

        const pageIndicator = document.getElementById("pageIndicator");
        const btnPrevPage = document.getElementById("btnPrevPage");
        const btnNextPage = document.getElementById("btnNextPage");
        if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
        if (btnPrevPage) btnPrevPage.disabled = (currentPage <= 1);
        if (btnNextPage) btnNextPage.disabled = (currentPage >= totalPages);

        pageItems.forEach((item, index) => {
            const tr = document.createElement("tr");
            const isSelected = selectedTrackIds.has(item.id);
            const statusBadge = item.isLocalBlob ? '<span style="color:#27c93f;">Local File</span>' :
                                (item.status === 'completed' ? '<span style="color:var(--neon-blue);">⚡ Cached Buffer</span>' :
                                (item.status === 'error' ? '<span style="color:#ff5f56;">❌ Error Skipped</span>' : '<span style="color:var(--text-secondary);">Queued</span>'));

            const thumbUrl = getTrackThumbnailUrl(item);
            const errorText = item.error || (item.status === 'error' ? 'Stream unavailable' : '--');

            tr.innerHTML = `
                <td style="text-align: center;" onclick="event.stopPropagation();"><input type="checkbox" class="track-chk" data-id="${item.id}" ${isSelected ? 'checked' : ''} style="accent-color: var(--neon-blue); cursor: pointer;"></td>
                <td style="color: var(--text-muted); font-size: 0.75rem;">${startIdx + index + 1}</td>
                <td><img src="${thumbUrl}" alt="Cover" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-color);" onerror="this.src='https://i.ytimg.com/vi/default/hqdefault.jpg'"></td>
                <td style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">${item.title}</td>
                <td style="text-align: center;" onclick="event.stopPropagation();">
                    <div style="display: flex; gap: 0.25rem; justify-content: center;">
                        <button class="btn-play-row" title="Play Now" style="background: transparent; border: none; cursor: pointer; color: var(--neon-blue); padding: 2px;">▶️</button>
                        <button class="btn-cache-row" title="Cache Track" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); padding: 2px;">⚡</button>
                        <button class="btn-delete-row" title="Remove Track" style="background: transparent; border: none; cursor: pointer; color: #ff5f56; padding: 2px;">🗑️</button>
                    </div>
                </td>
                <td style="color: var(--text-secondary); font-size: 0.8rem;">${item.artist || item.uploader || 'SonicStream'}</td>
                <td style="font-family: var(--font-mono); color: var(--text-secondary); font-size: 0.8rem;">${formatDuration(item.duration)}</td>
                <td><span style="font-size:0.7rem;">${statusBadge}</span></td>
                <td style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${errorText}</td>
            `;

            const chk = tr.querySelector(".track-chk");
            chk.addEventListener("change", (e) => {
                if (e.target.checked) selectedTrackIds.add(item.id);
                else selectedTrackIds.delete(item.id);
                if (selectedCountInfo) selectedCountInfo.textContent = selectedTrackIds.size;
            });

            tr.querySelector(".btn-play-row").addEventListener("click", () => playTrack(item, items, startIdx + index));
            tr.querySelector(".btn-cache-row").addEventListener("click", () => prefetchUpcomingTracks([item], 0, 1));
            tr.querySelector(".btn-delete-row").addEventListener("click", () => {
                activePlaylistItems = activePlaylistItems.filter(t => t.id !== item.id);
                renderTracksTable(activePlaylistItems);
            });

            tr.addEventListener("click", (e) => {
                if (e.target.tagName !== "INPUT" && !e.target.closest("button")) {
                    playTrack(item, items, startIdx + index);
                }
            });
            playlistTableBody.appendChild(tr);
        });
    }

    const btnPrevPage = document.getElementById("btnPrevPage");
    const btnNextPage = document.getElementById("btnNextPage");
    if (btnPrevPage) btnPrevPage.addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTracksTable(activePlaylistItems); } });
    if (btnNextPage) btnNextPage.addEventListener("click", () => { currentPage++; renderTracksTable(activePlaylistItems); });

    let currentSortColumn = "index";
    let currentSortAsc = true;

    document.querySelectorAll(".sortable-th").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.getAttribute("data-sort");
            if (currentSortColumn === col) {
                currentSortAsc = !currentSortAsc;
            } else {
                currentSortColumn = col;
                currentSortAsc = true;
            }
            sortTracks(col, currentSortAsc);
        });
    });

    function sortTracks(col, asc) {
        if (!activePlaylistItems) return;
        activePlaylistItems.sort((a, b) => {
            let valA = a[col] || "";
            let valB = b[col] || "";
            if (col === "index") return 0;
            if (typeof valA === "string") valA = valA.toLowerCase();
            if (typeof valB === "string") valB = valB.toLowerCase();
            if (valA < valB) return asc ? -1 : 1;
            if (valA > valB) return asc ? 1 : -1;
            return 0;
        });
        renderTracksTable(activePlaylistItems);
    }

    if (playlistSearch) playlistSearch.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = activePlaylistItems.filter(t => t.title.toLowerCase().includes(query) || (t.artist && t.artist.toLowerCase().includes(query)));
        renderTracksTable(filtered);
    });

    // Small badge on the player showing whether the current track is playing from
    // the local IndexedDB cache or streaming live from Azure (and a clear hint if
    // a live stream fails because the SAS token is missing).
    function setPlaybackSource(source) {
        let el = document.getElementById("playbackSourceIcon");
        if (!el) {
            if (!playerTrackTitle || !playerTrackTitle.parentNode) return;
            el = document.createElement("span");
            el.id = "playbackSourceIcon";
            el.style.cssText = "display: inline-block; margin-top: 2px; font-size: 0.68rem; font-weight: 600; padding: 1px 7px; border-radius: 6px; white-space: nowrap;";
            playerTrackTitle.parentNode.insertBefore(el, playerTrackTitle.nextSibling);
        }
        if (source === "cache") {
            el.textContent = "💾 Offline (cached)";
            el.style.background = "rgba(39,201,63,0.15)"; el.style.color = "#27c93f";
        } else if (source === "downloading") {
            el.textContent = "⬇️ Downloading…";
            el.style.background = "rgba(0,242,254,0.15)"; el.style.color = "var(--neon-blue)";
        } else if (source === "stream") {
            el.textContent = "☁️ Streaming";
            el.style.background = "rgba(0,242,254,0.15)"; el.style.color = "var(--neon-blue)";
        } else if (source === "error-sas") {
            el.textContent = "⚠️ Stream failed — set SAS token in Settings";
            el.style.background = "rgba(255,95,86,0.15)"; el.style.color = "#ff5f56";
        } else if (source === "error") {
            el.textContent = "⚠️ Playback error";
            el.style.background = "rgba(255,95,86,0.15)"; el.style.color = "#ff5f56";
        } else {
            el.textContent = ""; el.style.background = "transparent";
        }
    }
    let lastPlaybackWasStream = false;

    // Track and revoke blob object URLs so cached playback doesn't leak memory.
    // Accumulating un-revoked object URLs (one audio + one thumbnail per cached
    // play) grew memory over a session and pressured iOS into reloading the PWA
    // mid-song (#30). Revoke the previous one before creating the next.
    let currentAudioObjectUrl = null;
    let currentThumbObjectUrl = null;
    function objectUrlFor(blob, kind) {
        if (kind === "thumb") {
            if (currentThumbObjectUrl) { try { URL.revokeObjectURL(currentThumbObjectUrl); } catch (_) {} }
            currentThumbObjectUrl = URL.createObjectURL(blob);
            return currentThumbObjectUrl;
        }
        if (currentAudioObjectUrl) { try { URL.revokeObjectURL(currentAudioObjectUrl); } catch (_) {} }
        currentAudioObjectUrl = URL.createObjectURL(blob);
        return currentAudioObjectUrl;
    }

    // Cache the current track AFTER playback is established, never before.
    //
    // Blocking playback on a full download is what made starting a playlist take
    // minutes. Delaying the fetch keeps the fast start while still building the
    // offline library, and the delay stops it competing with the audio buffer.
    // Skipped when hidden: iOS throttles background fetches, and that contention
    // is what used to stall playback a few songs in.
    // One-line snapshot of the audio element + page state. Appended to every
    // MediaSession and audio-element trace line so a failure can be read directly:
    // paused/position/readyState/networkState tell you WHY a command did nothing.
    //   ready: 0=nothing 1=metadata 2=current 3=future 4=enough
    //   net:   0=empty 1=idle 2=loading 3=no-source
    function audioSnapshot() {
        try {
            const a = audioElement;
            if (!a) return "no-audio-element";
            return `paused=${a.paused} t=${(a.currentTime||0).toFixed(1)} ready=${a.readyState} net=${a.networkState}`
                 + ` hidden=${document.hidden} online=${navigator.onLine}`
                 + (a.error ? ` MEDIA_ERR=${a.error.code}` : "")
                 + ` src=${String(a.src||"").startsWith("blob:") ? "blob" : (a.src ? "network" : "none")}`;
        } catch (e) { return "snapshot-failed"; }
    }

    // --- Persistent trace log -------------------------------------------------
    // Stored as ONE key in the existing "settings" store, deliberately: adding an
    // object store needs a DB version bump, and a botched upgrade would risk the
    // user's multi-GB cache. No schema change, no upgrade path, no risk.
    //
    // Flushed in batches while VISIBLE, and on the way out (visibilitychange /
    // pagehide) — never during background playback, since IndexedDB writes are
    // exactly the kind of work that competes with audio when iOS is throttling us.
    const TRACE_KEY = "__trace_log_v1";
    const TRACE_MAX = 400;

    async function flushTraceLog(reason) {
        const q = window.__PERSIST_QUEUE || [];
        if (!q.length) return;
        let database = null;
        try { database = db; } catch (_) { return; }
        if (!database || !database.objectStoreNames.contains("settings")) return;
        const batch = q.splice(0, q.length);
        try {
            const prev = (await getSettingFromDB(TRACE_KEY)) || [];
            const merged = prev.concat(batch).slice(-TRACE_MAX);   // ring buffer
            await saveSettingToDB(TRACE_KEY, merged);
        } catch (e) {
            // put them back so nothing is lost on a transient failure
            window.__PERSIST_QUEUE = batch.concat(window.__PERSIST_QUEUE || []);
        }
    }

    // Expose for diagnosis: window.dumpTraceLog() prints everything, including
    // lines from PREVIOUS sessions that would otherwise have been lost.
    window.dumpTraceLog = async () => {
        const persisted = (await getSettingFromDB(TRACE_KEY)) || [];
        const live = window.SONICSTREAM_LOGS || [];
        console.log(`[Trace] ${persisted.length} persisted (previous + this session), ${live.length} in memory now.`);
        return { persisted, live };
    };
    window.clearTraceLog = async () => { await saveSettingToDB(TRACE_KEY, []); return "cleared"; };

    setInterval(() => { if (!document.hidden) flushTraceLog("interval"); }, 30000);
    document.addEventListener("visibilitychange", () => flushTraceLog(document.hidden ? "going-hidden" : "returning"));
    window.addEventListener("pagehide", () => flushTraceLog("pagehide"));

    // Session counter for auto-advances, so "how many songs does screen-off
    // playback survive?" can be answered from evidence instead of memory. Pure
    // in-memory + one console line: no network, no IndexedDB, nothing that could
    // compete with playback in the background. Read it afterwards via the header
    // Trace Logs button, or window.__advanceLog in a console.
    let autoAdvanceCount = 0;
    window.__advanceLog = [];

    // NOTE: background/parallel caching has been REMOVED by design. Tracks are
    // cached synchronously in playTrack (download -> cache -> play). Nothing may
    // download while audio is playing: that contention is what stalled playback
    // after a few songs. Explicit user-initiated downloads (the Download buttons)
    // still use prefetchUpcomingTracks directly.

    // --- Audio Engine & MediaSession Controls ---
    // Guards against two playTrack() calls running at once. The trace log showed
    // two "Downloaded + cached" lines in the SAME second followed by "Playback
    // error": two invocations were downloading in parallel and then fighting over
    // audioElement.src, so whichever lost corrupted the other's playback. Each call
    // takes a generation number; after every await it checks whether a newer call
    // has superseded it and bails out silently if so.
    let playGeneration = 0;
    // True while a track the user is actively waiting for is downloading.
    let userDownloadActive = false;

    async function playTrack(track, queue, index) {
        if (!track) return;
        const myGeneration = ++playGeneration;
        const superseded = () => {
            if (playGeneration !== myGeneration) {
                console.log(`[PWA Player] Superseded by a newer play request — abandoning: ${track.title}`);
                return true;
            }
            return false;
        };

        clearNextTrackTimers();
        playQueue = queue || [track];
        currentTrackIndex = index !== undefined ? index : playQueue.findIndex(t => t.id === track.id);

        // Immediate feedback. Playback now waits for a full download, so without
        // this the button stayed on "play" for the whole wait and the app looked
        // frozen — the user's exact report: "it does not even change to pause mode,
        // oh it just started playing after a min".
        setLoadingIndicator(true);
        playerTrackTitle.textContent = track.title;
        playerTrackArtist.textContent = track.artist || track.uploader || "SonicStream";
        
        let thumbUrl = getTrackThumbnailUrl(track);
        if (playerTrackThumb) playerTrackThumb.src = thumbUrl;

        if (playerStatusEq) playerStatusEq.classList.remove("hidden");
        if (playerStatusText) playerStatusText.textContent = "Loading...";

        try {
            let mediaUrl = null;
            const targetFile = track.file || (track.title ? `${track.title}.mp3` : null);
            const isVideoTrack = (mediaPlaybackMode === "video") || (targetFile && (targetFile.endsWith(".mp4") || targetFile.endsWith(".webm") || targetFile.endsWith(".mkv")));
            const streamFormat = isVideoTrack ? "video" : "audio";

            // 1. Check IndexedDB for High-Quality cached Blob (100% offline driving playback!)
            let fromCache = false;
            let sasMissing = false;
            const cachedRecord = await getTrackRecordFromDB(track.id, track.title, targetFile);
            if (superseded()) return;
            if (cachedRecord && cachedRecord.blob) {
                mediaUrl = objectUrlFor(cachedRecord.blob, "audio");
                if (cachedRecord.thumbBlob) {
                    playerTrackThumb.src = objectUrlFor(cachedRecord.thumbBlob, "thumb");
                }
                fromCache = true;
                console.log("[PWA Player] Playing offline cached media from IndexedDB.");
            } else if (track.downloadUrl) {
                mediaUrl = track.downloadUrl;
            } else if (targetFile) {
                if (window.location.protocol.startsWith("https") || window.location.hostname.includes("azurestaticapps.net")) {
                    const sasToken = getAzureSASToken();
                    if (!sasToken) {
                        sasMissing = true;
                        console.warn("[PWA Player] No Azure SAS token set — live streaming will fail. Paste your SAS token in Settings.");
                    }
                    const azureUrl = `${getAzureBlobBaseUrl()}/${encodeURIComponent(targetFile)}?${sasToken}&_v=${APP_BUILD}`;
                    mediaUrl = azureUrl;   // only used for over-limit files (stream-only)

                    // DOWNLOAD -> CACHE -> PLAY (user-specified design).
                    //
                    // Every file within the size cap is fetched IN FULL, saved to
                    // IndexedDB, and only then played from the local blob. Nothing is
                    // streamed and nothing is cached in parallel, which removes the
                    // whole class of buffer-starvation bugs: a download can no longer
                    // compete with playing audio, so tracks cannot stall a few songs
                    // in. Track changes are also gapless because the next file is
                    // already local. The cost is an up-front wait on first play,
                    // shown as a "Downloading…" progress message.
                    //
                    // Files OVER the cap stream instead — they are too big to hold in
                    // IndexedDB, and waiting for them would be worse than streaming.
                    if (sasToken) {
                        try {
                            setPlaybackSource("downloading");
                            if (playerStatusEq) playerStatusEq.classList.add("hidden");
                            if (playerStatusText) playerStatusText.textContent = "Downloading…";

                            const t0 = Date.now();
                            // Tell any running cache-ahead to yield: the track the user
                            // is WAITING FOR must not share bandwidth with speculative
                            // downloads of later tracks. That contention is why a tap
                            // could take a minute to produce sound.
                            userDownloadActive = true;
                            console.log(`[PWA Player] Downloading (hidden=${document.hidden}, online=${navigator.onLine}): ${targetFile}`);
                            const res = await fetch(azureUrl, { cache: "no-store" });
                            if (superseded()) return;
                            if (!res || !res.ok) throw new Error("HTTP " + (res && res.status) + " " + (res && res.statusText));

                            const declared = parseInt(res.headers.get("content-length") || "0", 10);
                            if (declared > MAX_FILE_SIZE_BYTES) {
                                // Over the cap: stream it, do not cache.
                                console.warn(`[PWA Player] STREAMING because content-length says ${(declared/1048576).toFixed(1)} MB > cap ${(MAX_FILE_SIZE_BYTES/1048576).toFixed(0)} MB: ${targetFile}`);
                                mediaUrl = azureUrl;
                            } else {
                                // Read with progress so the wait is visible.
                                let blob;
                                if (res.body && res.body.getReader && declared > 0) {
                                    const reader = res.body.getReader();
                                    const chunks = []; let received = 0; let lastShown = -1;
                                    while (true) {
                                        const { done, value } = await reader.read();
                                        if (done) break;
                                        chunks.push(value); received += value.length;
                                        const pct = Math.floor(received / declared * 100);
                                        if (pct !== lastShown && playerStatusText) {
                                            lastShown = pct;
                                            playerStatusText.textContent = `Downloading… ${pct}%`;
                                        }
                                    }
                                    blob = new Blob(chunks, { type: res.headers.get("content-type") || "audio/mpeg" });
                                } else {
                                    blob = await res.blob();
                                }

                                if (superseded()) return;
                                userDownloadActive = false;
                                console.log(`[PWA Player] Download finished in ${((Date.now()-t0)/1000).toFixed(1)}s: ${targetFile}`);
                                if (blob.size > MAX_FILE_SIZE_BYTES) {
                                    console.log("[PWA Player] Larger than cap once downloaded — playing without caching: " + targetFile);
                                    mediaUrl = objectUrlFor(blob, "audio");
                                } else {
                                    await saveTrackBlobToDB(track.id, blob, track);
                                    mediaUrl = objectUrlFor(blob, "audio");
                                    fromCache = true;
                                    console.log("[PWA Player] Downloaded + cached (" + blob.size + " B), playing locally: " + targetFile);
                                }
                                if (playerStatusText) playerStatusText.textContent = "Loading…";
                            }
                        } catch (e) {
                            userDownloadActive = false;
                            // A 404 means the track exists in the playlist but its audio
                            // has not been uploaded to the blob yet (a new download or a
                            // freshly generated AI track). That is NOT a reason to hide
                            // the track — it may be uploaded later — but there is no
                            // point grinding through the streaming fallbacks either:
                            // they all hit the same missing file and cost ~2 s of error
                            // noise per track. Skip straight to the next one.
                            if (String(e && e.message || "").includes("404")) {
                                console.warn(`[PWA Player] NOT UPLOADED YET (404): ${targetFile} — skipping to the next track.`);
                                setPlaybackSource("error");
                                if (playerStatusText) playerStatusText.textContent = "Not uploaded to cloud yet — skipping";
                                setLoadingIndicator(false);
                                if (playQueue.length > 1) { setTimeout(() => playNextTrack(), 250); return; }
                            }
                            // Never leave the user with silence: fall back to the URL.
                            console.warn(`[PWA Player] Download FAILED (hidden=${document.hidden}, online=${navigator.onLine}) for ${targetFile} —`, e,
                                document.hidden ? "| iOS blocks/throttles fetch while backgrounded, so an UNCACHED track cannot load with the screen off." : "");
                            mediaUrl = azureUrl;
                        }
                    }
                } else {
                    mediaUrl = `/api/media/file/${encodeURIComponent(targetFile)}`;
                }
            } else if (track.url && track.url.startsWith("http")) {
                mediaUrl = `/api/media/stream?video_url=${encodeURIComponent(track.url)}&title=${encodeURIComponent(track.title)}&format=${streamFormat}`;
            } else if (track.id) {
                mediaUrl = `/api/media/stream?video_url=${encodeURIComponent('https://www.youtube.com/watch?v=' + track.id)}&title=${encodeURIComponent(track.title)}&format=${streamFormat}`;
            }

            if (superseded()) return;
            if (!mediaUrl) throw new Error("Media stream URL unavailable");

            lastPlaybackWasStream = !fromCache;
            setPlaybackSource(fromCache ? "cache" : (sasMissing ? "error-sas" : "stream"));
            // One authoritative line per play: what is playing and WHY. If a track
            // streams when it should have downloaded, this says which branch chose it.
            console.log(`[PWA Player] NOW PLAYING "${(track.title||"").slice(0,40)}" — source=${fromCache ? "CACHE (local blob)" : "STREAM"}`
                + `${fromCache ? "" : " | reason=" + (sasMissing ? "no SAS token" : (String(mediaUrl).startsWith("blob:") ? "downloaded but not cached (over cap)" : "download did not complete — see the warning above"))}`
                + ` | hidden=${document.hidden} | urlType=${String(mediaUrl).startsWith("blob:") ? "blob" : "network"}`);

            if (mediaUrl.startsWith("/")) {
                mediaUrl = (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8765") + mediaUrl;
            }

            if (isVideoTrack && videoElement) {
                if (videoContainer) {
                    videoContainer.classList.remove("hidden");
                    videoContainer.style.display = "block";
                }
                if (btnMediaModeVideo) btnMediaModeVideo.classList.add("active");
                if (btnMediaModeAudio) btnMediaModeAudio.classList.remove("active");
                if (audioElement) audioElement.pause();

                videoElement.src = mediaUrl;
                videoElement.load();
                videoElement.onerror = () => {
                    console.log("[Video Engine] Video error, falling back to Audio Engine...");
                    if (videoContainer) videoContainer.style.display = "none";
                    audioElement.src = mediaUrl;
                    audioElement.play().catch(ae => console.error("[Audio Fallback] Play error:", ae));
                };
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.log("[Video Engine] Video play failed, switching to Audio Engine fallback:", err);
                        if (videoContainer) videoContainer.style.display = "none";
                        audioElement.src = mediaUrl;
                        audioElement.play().catch(e => console.error("[Audio Fallback] Play error:", e));
                    });
                }
            } else {
                if (videoContainer) {
                    videoContainer.classList.add("hidden");
                    videoContainer.style.display = "none";
                }
                if (btnMediaModeAudio) btnMediaModeAudio.classList.add("active");
                if (btnMediaModeVideo) btnMediaModeVideo.classList.remove("active");
                if (videoElement) videoElement.pause();

                initWebAudioEngine();
                audioElement.src = mediaUrl;
                audioElement.onerror = () => {
                    console.warn(`[Audio Engine] Direct URL playback failed for '${track.title}'. Trying stream fallback...`);
                    // A failed LIVE stream on the deployed site almost always means the
                    // SAS token is missing/expired — surface that on the player.
                    if (lastPlaybackWasStream) {
                        setPlaybackSource(getAzureSASToken() ? "error" : "error-sas");
                        if (playerStatusText) playerStatusText.textContent = getAzureSASToken() ? "Stream error" : "Set Azure SAS token in Settings to stream";
                    }
                    if (track.id && track.id.length === 11) {
                        const fallbackUrl = `/api/media/stream?video_url=${encodeURIComponent('https://www.youtube.com/watch?v=' + track.id)}&title=${encodeURIComponent(track.title)}&format=audio`;
                        const fullFallback = (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8765") + fallbackUrl;
                        audioElement.onerror = () => {
                            console.error(`[Audio Engine] All stream fallbacks failed for '${track.title}'`);
                            setTimeout(() => playNextTrackAuto(), 1500);
                        };
                        audioElement.src = fullFallback;
                        audioElement.play().catch(e => console.error("[Audio Engine] Fallback play error:", e));
                    } else {
                        setTimeout(() => playNextTrackAuto(), 1500);
                    }
                };
                audioElement.load();
                await audioElement.play();
            }
            isPlaying = true;
            updatePlayBtnUI();

            if (playerStatusText) playerStatusText.textContent = "Playing";
            updateMediaSession(track);

            // Smart Caching: proactively cache the next 5 tracks so screen-off /
            // car playback plays from IndexedDB (no streaming, no stalls).
            // KEEP THE CACHE AHEAD OF PLAYBACK — this is what makes screen-off
            // playback survive.
            //
            // Evidence from a real drive: advances #3-#10 ran 8 songs over 28 minutes
            // with the screen off and ZERO errors, because those tracks were already
            // cached and needed no network. Every failure had the opposite shape —
            // an UNCACHED next track, then "Download FAILED", because iOS blocks
            // fetch while backgrounded. So the cache must be filled BEFORE the screen
            // goes off.
            //
            // This is not the old "parallel caching" that was banned: that competed
            // with a live audio STREAM for bandwidth. Playback is now entirely from a
            // local blob and uses no network at all, so a top-up has nothing to
            // contend with. Only runs while visible (fetch fails when hidden) and
            // only when the current track is playing from cache.
            if (fromCache && !document.hidden && playQueue.length > 1) {
                const ahead = 3;
                console.log(`[PWA Cache] Topping up ${ahead} track(s) ahead so screen-off playback has no network dependency.`);
                prefetchUpcomingTracks(playQueue, currentTrackIndex, ahead);
            }
        } catch (err) {
            setLoadingIndicator(false);
            console.error("Playback error:", err);
            if (playerStatusEq) playerStatusEq.classList.add("hidden");
            if (playerStatusText) playerStatusText.textContent = "Error Playing Track";
            isPlaying = false;
            updatePlayBtnUI();
        }
    }

    // Shows a spinner in the play button while a track is being fetched.
    function setLoadingIndicator(on) {
        try {
            if (!playIconSvg) return;
            if (on) {
                playIconSvg.innerHTML = `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="42 14"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/></circle>`;
                playIconSvg.dataset.loading = "1";
            } else if (playIconSvg.dataset.loading) {
                delete playIconSvg.dataset.loading;
                updatePlayBtnUI();
            }
        } catch (e) {}
    }

    function updatePlayBtnUI() {
        if (playIconSvg && playIconSvg.dataset && playIconSvg.dataset.loading) return; // keep the spinner

        if (playIconSvg) {
            if (isPlaying) {
                playIconSvg.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
            } else {
                playIconSvg.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
            }
        }
        if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
        }
    }

    if (playerPlayPauseBtn) playerPlayPauseBtn.addEventListener("click", () => {
        if (!audioElement.src) return;
        initWebAudioEngine();
        clearNextTrackTimers();
        if (isPlaying) {
            userInitiatedPause = true;   // not an interruption — don't auto-resume
            audioElement.pause();        // "pause" event syncs isPlaying + the UI
        } else {
            // Use the SAME recovery ladder as the lock-screen/car Play button: a
            // resume can fail outright OR resolve while producing no audio, and
            // both need escalation. Don't set isPlaying optimistically — the
            // element's "play" event is the source of truth, so the icon can't
            // claim we're playing while it's silent.
            userInitiatedPause = false;
            resumeAfterInterruption = false;
            resumePlaybackWithRecovery();
        }
        updatePlayBtnUI();
    });

    if (playerNextBtn) playerNextBtn.addEventListener("click", () => {
        clearNextTrackTimers();
        playNextTrack();
    });
    if (playerPrevBtn) playerPrevBtn.addEventListener("click", () => {
        clearNextTrackTimers();
        playPrevTrack();
    });

    function playNextTrack() {
        if (playQueue.length === 0) return;
        let nextIdx = (currentTrackIndex + 1) % playQueue.length;
        playTrack(playQueue[nextIdx], playQueue, nextIdx);
    }

    function playPrevTrack() {
        if (playQueue.length === 0) return;
        let prevIdx = (currentTrackIndex - 1 + playQueue.length) % playQueue.length;
        playTrack(playQueue[prevIdx], playQueue, prevIdx);
    }

    // Revoke previous blob object URL to avoid leaks across background advances.
    // Background track advancement (screen off / app backgrounded).
    // STABLE, MINIMAL version (reverted): build the media URL SYNCHRONOUSLY and
    // call play() with zero async gap, so the iOS audio session is never suspended
    // during the transition. Deliberately NO background fetch/prefetch and NO async
    // IndexedDB read here — those were throttled/killed by iOS and stalled playback
    // after a few tracks. The <audio> element streams progressively from Azure;
    // falls back to full playTrack() on error. (Offline/cached background playback
    // is a future enhancement — see issue #22.)
    function playNextTrackBackground() {
        if (playQueue.length === 0) return;
        const nextIdx = (currentTrackIndex + 1) % playQueue.length;
        const nextTrack = playQueue[nextIdx];
        if (!nextTrack) return;

        const targetFile = nextTrack.file || (nextTrack.title ? `${nextTrack.title}.mp3` : null);
        let azureUrl = nextTrack.downloadUrl || null;
        if (!azureUrl && targetFile) {
            const sasToken = getAzureSASToken();
            if (sasToken) azureUrl = `${getAzureBlobBaseUrl()}/${encodeURIComponent(targetFile)}?${sasToken}`;
        }

        currentTrackIndex = nextIdx;
        isPlaying = true;

        // REVERTED (regression): a blob:-URL branch used to run here, playing the
        // next track from cache. Once caching actually started persisting, that
        // branch began firing on the phone — and background auto-advance stopped
        // working ENTIRELY (it previously managed 2-3 songs). Assigning a fresh
        // blob: URL and calling play() while the page is hidden is not reliable on
        // iOS. Background advance therefore streams the network URL again, which is
        // the known-good behaviour. Do not reintroduce blob playback here without
        // on-device proof.

        // CRITICAL (iOS background): advance with ZERO async gap. Any await before
        // play() — an IndexedDB read, or a setTimeout race — lets iOS suspend the
        // audio session between tracks in the background, which is exactly what
        // stopped playback after a few songs with the screen off (it only "resumed
        // on app open" because foregrounding un-throttled the pending timer). Per
        // the app's design, background auto-advance STREAMS directly from Azure
        // (reliable); cached/offline playback is a foreground path via playTrack().
        if (!azureUrl) { playTrack(nextTrack, playQueue, nextIdx); return; }
        audioElement.src = azureUrl;
        const p = audioElement.play();
        if (p && p.catch) p.catch(() => playTrack(nextTrack, playQueue, nextIdx));

        // Everything below is bookkeeping — it must never delay or endanger the
        // play() above. While the app is BACKGROUNDED (screen on but another app in
        // front, e.g. Google Maps) keep it to the bare minimum: setting the
        // thumbnail <img> and MediaSession artwork both trigger NETWORK fetches,
        // and an IndexedDB write adds more work, all while iOS is already
        // throttling us. That extra work is a strong suspect for playback dying a
        // couple of tracks in. Foreground keeps the full UI update.
        const hidden = document.hidden;
        updatePlayBtnUI();
        setPlaybackSource("stream");
        lastPlaybackWasStream = true;
        if (playerTrackTitle) playerTrackTitle.textContent = nextTrack.title || "";
        if (playerTrackArtist) playerTrackArtist.textContent = nextTrack.artist || nextTrack.uploader || "SonicStream";
        // Lock-screen metadata without artwork is cheap and has no network cost.
        updateMediaSession(nextTrack, hidden /* skipArtwork */);
        if (!hidden) {
            if (playerTrackThumb) playerTrackThumb.src = getTrackThumbnailUrl(nextTrack);
            if (activePlaylistId) saveResumePosition(activePlaylistId, nextTrack.id, 0, nextIdx);
        }
    }

    // Referenced by audio error handlers but was never defined — prevents ReferenceError
    function playNextTrackAuto() { playNextTrack(); }

    if (audioElement) audioElement.addEventListener("ended", () => {
        clearNextTrackTimers();
        if (isRepeat) {
            audioElement.currentTime = 0;
            audioElement.play();
            return;
        }

        // Default 0 = gapless. A silent gap between tracks can let iOS end the
        // audio session, so we never pause unless the user explicitly opts in
        // (desktop setting) AND we're in the foreground.
        const pauseInput = document.getElementById("playerPauseSeconds");
        const pauseSecs = pauseInput ? (parseInt(pauseInput.value) || 0) : 0;
        const isBackground = document.hidden || (typeof document.webkitHidden !== "undefined" && document.webkitHidden);

        autoAdvanceCount++;
        try {
            const entry = {
                n: autoAdvanceCount,
                at: new Date().toLocaleTimeString(),
                screen: isBackground ? "OFF/hidden" : "on",
                from: (playQueue[currentTrackIndex] && playQueue[currentTrackIndex].title || "").slice(0, 40)
            };
            window.__advanceLog.push(entry);
            const nxt = playQueue[(currentTrackIndex + 1) % Math.max(playQueue.length, 1)];
            console.log(`[Auto-Advance #${entry.n}] screen ${entry.screen} | queue ${currentTrackIndex + 1}/${playQueue.length}`
                + ` | finished: ${entry.from} | next: ${(nxt && nxt.title || "?").slice(0, 40)}`);
        } catch (_) {}

        if (pauseSecs > 0 && !isBackground) {
            let count = pauseSecs;
            if (playerStatusEq) playerStatusEq.classList.add("hidden");
            if (playerStatusText) playerStatusText.textContent = `Pause (${count}s)...`;

            nextTrackCountdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    if (playerStatusText) playerStatusText.textContent = `Pause (${count}s)...`;
                } else {
                    clearInterval(nextTrackCountdownInterval);
                    nextTrackCountdownInterval = null;
                }
            }, 1000);

            nextTrackTimeout = setTimeout(() => {
                clearNextTrackTimers();
                playNextTrack();
            }, pauseSecs * 1000);
        } else if (!isBackground) {
            // VISIBLE: use the normal path so the next track follows the same rule
            // as any other play — downloaded, cached, then played from the local
            // blob. This used to take the streaming background path even when the
            // app was on screen, which is why tracks kept streaming instead of
            // coming from cache.
            playNextTrack();
        } else {
            // BACKGROUND / screen-off: must call play() with no await, so this
            // advances via the synchronous path. Making this download-first is the
            // separate "work with the display off" task.
            console.log("[Audio Engine] Screen-off advance (synchronous, no await — an await here suspends the iOS audio session).");
            playNextTrackBackground();
            // Report afterwards whether that track was cached. This is the single
            // most useful fact for diagnosing screen-off dropouts: cached tracks
            // survive indefinitely, uncached ones cannot load because iOS blocks
            // background fetch. Runs after play() so it cannot delay the handoff.
            try {
                const nt = playQueue[currentTrackIndex];
                if (nt) getTrackRecordFromDB(nt.id, nt.title, nt.file).then(r => {
                    const cached = !!(r && (r.blob || r.audio_blob));
                    console.log(`[Audio Engine] Next track was ${cached ? "CACHED (no network needed — should keep playing)"
                        : "NOT CACHED (needs network; iOS blocks background fetch — expect this one to fail)"}: ${(nt.title||"").slice(0,40)}`);
                }).catch(() => {});
            } catch (_) {}
        }
    });

    let lastSaveTime = 0;
    if (audioElement) audioElement.addEventListener("timeupdate", () => {
        if (audioElement.duration) {
            playerProgressBar.value = (audioElement.currentTime / audioElement.duration) * 100;
            playerCurrentTime.textContent = formatDuration(audioElement.currentTime);
            playerTotalTime.textContent = formatDuration(audioElement.duration);
            
            const now = Date.now();
            if (now - lastSaveTime > 3000) {
                lastSaveTime = now;
                if (activePlaylistId && playQueue[currentTrackIndex]) {
                    saveResumePosition(activePlaylistId, playQueue[currentTrackIndex].id, audioElement.currentTime, currentTrackIndex);
                }
            }
            
            if ("mediaSession" in navigator && !isNaN(audioElement.duration)) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: audioElement.duration,
                        playbackRate: audioElement.playbackRate || 1,
                        position: audioElement.currentTime
                    });
                } catch (e) {}
            }
        }
    });

    if (playerProgressBar) playerProgressBar.addEventListener("input", (e) => {
        if (audioElement.duration) {
            audioElement.currentTime = (e.target.value / 100) * audioElement.duration;
        }
    });

    // --- Web Audio API Engine & Volume Booster (Up to 200% Gain Boost) ---
    let audioCtx = null;
    let audioSourceNode = null;
    let gainNode = null;
    let compressorNode = null;

    function initWebAudioEngine() {
        // On phones, do NOT route audio through the Web Audio graph. iOS suspends
        // the AudioContext when the screen locks / the app backgrounds, which stops
        // playback and leaves the lock-screen Play button doing nothing; the
        // compressor also causes a stutter/echo on pause. Plain <audio> keeps
        // playing in the background and obeys lock-screen / car Bluetooth controls.
        //
        // MUST use isMobileAudioDevice(), not isPhoneDevice(): the width-based
        // check let this run in landscape on a phone, permanently routing audio
        // into a graph that iOS then suspends (clock advances, silence).
        if (isMobileAudioDevice()) return;
        if (audioCtx) {
            if (audioCtx.state === "suspended") {
                audioCtx.resume();
            }
            return;
        }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            audioElement.crossOrigin = "anonymous";

            audioSourceNode = audioCtx.createMediaElementSource(audioElement);
            gainNode = audioCtx.createGain();
            compressorNode = audioCtx.createDynamicsCompressor();

            // High-Fidelity Compressor setup for maximum clarity and loud audio
            compressorNode.threshold.setValueAtTime(-24, audioCtx.currentTime);
            compressorNode.knee.setValueAtTime(30, audioCtx.currentTime);
            compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);
            compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
            compressorNode.release.setValueAtTime(0.25, audioCtx.currentTime);

            const currentVol = playerVolumeSlider ? (playerVolumeSlider.value / 100) : 1.0;
            gainNode.gain.setValueAtTime(currentVol * 1.8, audioCtx.currentTime);

            audioSourceNode.connect(compressorNode);
            compressorNode.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            console.log("[PWA Audio Engine] 200% Web Audio Gain Booster & Dynamic Equalizer initialized!");
        } catch (e) {
            console.warn("[PWA Audio Engine] Web Audio API init note:", e);
        }
    }

    const volumePctEl = document.getElementById("volumePct");
    if (playerVolumeSlider) playerVolumeSlider.addEventListener("input", (e) => {
        const val = e.target.value / 100;
        audioElement.volume = Math.min(1.0, val);
        // Desktop-only: extra gain via the Web Audio graph (up to ~180%).
        if (gainNode && audioCtx) {
            gainNode.gain.setValueAtTime(val * 1.8, audioCtx.currentTime);
        }
        if (volumePctEl) volumePctEl.textContent = Math.round(e.target.value) + "%";
        try { localStorage.setItem("sonicstream_volume", String(e.target.value)); } catch (_) {}
    });

    // Volume toggle button (mobile): show/hide the slider popup.
    const btnVolumeToggle = document.getElementById("btnVolumeToggle");
    const volumePopup = document.getElementById("volumePopup");
    if (btnVolumeToggle && volumePopup) {
        btnVolumeToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            volumePopup.style.display = volumePopup.style.display === "flex" ? "none" : "flex";
        });
        document.addEventListener("click", (e) => {
            if (volumePopup.style.display === "flex" && !volumePopup.contains(e.target) && e.target !== btnVolumeToggle && !btnVolumeToggle.contains(e.target)) {
                volumePopup.style.display = "none";
            }
        });
    }

    // Restore saved volume on load.
    (function initVolume() {
        let saved = 100;
        try { const s = localStorage.getItem("sonicstream_volume"); if (s !== null) saved = parseInt(s); } catch (_) {}
        if (isNaN(saved)) saved = 100;
        if (playerVolumeSlider) playerVolumeSlider.value = saved;
        if (audioElement) audioElement.volume = Math.min(1.0, saved / 100);
        if (volumePctEl) volumePctEl.textContent = saved + "%";
    })();

    function formatDuration(seconds) {
        if (!seconds) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- MediaSession (Car Bluetooth & Lockscreen Controls) ---
    function initMediaSessionHandlers() {
        if (!("mediaSession" in navigator)) return;
        try {
            // ASYMMETRIC BY DESIGN — do not "tidy" this into a matching pair.
            //
            // Evidence from device testing: with the app VISIBLE, car/lock-screen
            // play AND pause both work. With the app collapsed or the phone locked,
            // pause still works but resume never does. Our JS clearly still runs
            // (pause proves it) — the resume fails because iOS does not allow a
            // NON-VISIBLE page to START playback. Every page-initiated route is
            // blocked by that same rule, which is why load()/playTrack() retries
            // could never help.
            //
            // The one route not subject to it is WebKit's OWN default action, which
            // runs inside the engine in response to the remote command. Registering
            // a "play" handler SUPPRESSES that default and forces the blocked path,
            // so we deliberately leave "play" UNSET.
            //
            // "pause" stays registered: stopping audio is always permitted (it
            // demonstrably works in the background), and it is what lets us mark a
            // pause as deliberate so the interruption auto-resume never fights it.
            // RESTORED. This was set to null on the theory that iOS forbids a
            // non-visible page from starting playback. That theory was DISPROVEN:
            // the real cause of silent resume was the Web Audio graph being built
            // on the phone (landscape width guard) and its context being suspended
            // — fixed separately. Removing this handler meant the lock screen and
            // car had no play action at all. Keep it minimal and synchronous.
            navigator.mediaSession.setActionHandler("play", () => {
                console.log(`[MediaSession] PLAY action received (car/lock-screen) | ${audioSnapshot()}`);
                userInitiatedPause = false;
                resumeAfterInterruption = false;
                ensureAudioContextRunning();
                resumePlaybackWithRecovery();
            });
            navigator.mediaSession.setActionHandler("pause", () => {
                console.log(`[MediaSession] PAUSE action received (car/lock-screen) | ${audioSnapshot()}`);
                // A remote pause is DELIBERATE — never auto-resume it.
                userInitiatedPause = true;
                resumeAfterInterruption = false;
                clearTimeout(interruptionRetryTimer);
                audioElement.pause();   // "pause" event syncs isPlaying + playbackState
            });
            navigator.mediaSession.setActionHandler("previoustrack", () => {
                console.log(`[MediaSession] PREVIOUS action received | ${audioSnapshot()}`);
                clearNextTrackTimers();
                playPrevTrack();
            });
            navigator.mediaSession.setActionHandler("nexttrack", () => {
                console.log(`[MediaSession] NEXT action received | ${audioSnapshot()}`);
                clearNextTrackTimers();
                playNextTrack();
            });
            // Explicitly clear seek/scrub handlers: on iOS, registering seekto or
            // seekbackward/seekforward replaces the lock-screen Next/Previous track
            // buttons with a scrubber / 15s-skip. We want Next/Previous, so leave
            // all seek handlers unset.
            navigator.mediaSession.setActionHandler("seekto", null);
            navigator.mediaSession.setActionHandler("seekbackward", null);
            navigator.mediaSession.setActionHandler("seekforward", null);
            // Reflect reality: nothing is playing at startup. Hardcoding "playing"
            // desynced the lock screen from the element.
            navigator.mediaSession.playbackState = audioElement && !audioElement.paused ? "playing" : "none";
        } catch (e) {
            console.warn("[MediaSession] AVRCP registration note:", e);
        }
    }

    // --- Audio interruption handling (phone calls, texts, other apps) ---
    // iOS pauses our <audio> when a call/alert takes the audio session, and does
    // NOT resume it afterwards. Declaring the session type as "playback" lets iOS
    // duck/interrupt correctly, and we auto-resume once the interruption ends.
    let userInitiatedPause = false;   // set by our own Play/Pause UI
    let resumeAfterInterruption = false;
    let interruptionRetryTimer = null;
    // True when playback was (re)started while the page was hidden. Such a resume
    // can come back with a DEAD audio session: the clock advances but there is no
    // sound. The user's own workaround is to pause and play again once the app is
    // open, which is what re-establishes the session — so we do exactly that
    // automatically on the next foreground.
    let resumedWhileHidden = false;

    // Force a pause -> play cycle to re-establish a dead iOS audio session,
    // preserving the playback position. Only used when we have reason to believe
    // the session is silent (see resumedWhileHidden).
    function reviveAudioSession() {
        if (!audioElement || !audioElement.src || audioElement.paused) return;
        const pos = audioElement.currentTime;
        userInitiatedPause = true;            // our own pause: don't arm auto-resume
        audioElement.pause();
        setTimeout(() => {
            userInitiatedPause = false;
            try { if (pos > 0) audioElement.currentTime = pos; } catch (_) {}
            const p = audioElement.play();
            if (p && p.catch) p.catch(() => {});
            console.log("[Audio] Re-established audio session after a background resume.");
        }, 60);
    }

    function initAudioSession() {
        try {
            // Safari 16.4+ / iOS 17+. "playback" = long-form media: the OS ducks
            // for notifications and restores the session after a call.
            if (navigator.audioSession) navigator.audioSession.type = "playback";
        } catch (e) { /* not supported — harmless */ }
    }

    function tryResumeAfterInterruption(reason) {
        if (!resumeAfterInterruption || !audioElement || !audioElement.src) return;
        if (!audioElement.paused) { resumeAfterInterruption = false; return; }
        // A long call can leave the media itself broken, not just the session —
        // a plain play() would then fail forever. Use the recovery ladder.
        if (audioElement.error) {
            resumeAfterInterruption = false;
            resumePlaybackWithRecovery();
            return;
        }
        const p = audioElement.play();
        if (p && p.then) {
            p.then(() => {
                resumeAfterInterruption = false;
                console.log("[Audio] Resumed after interruption (" + reason + ")");
            }).catch(() => { /* still interrupted; a later event will retry */ });
        }
    }

    // Resume playback for a REMOTE play command (car Bluetooth / lock screen).
    //
    // A plain play() is not enough: after being paused in the background, a
    // streamed Azure source has usually dropped its connection, so play() rejects
    // immediately. The old code swallowed that rejection, which is why the car's
    // Play button changed the icon but never produced sound. Escalate instead:
    //   1. element already broken  -> full reload via playTrack()
    //   2. plain play()            -> cheapest, works when the media is still good
    //   3. load() + seek + play()  -> revives a stale stream without a fetch
    //   4. full playTrack()        -> last resort (re-resolves cache/Azure URL)
    function resumePlaybackWithRecovery() {
        if (!audioElement) return;
        const cur = playQueue[currentTrackIndex];
        const fullReload = () => { if (cur) playTrack(cur, playQueue, currentTrackIndex); };

        // CRITICAL: on iOS, resuming from the lock screen can RESOLVE play() and
        // still produce no sound — the icon flips, the app and lock screen agree
        // they're "playing", but the playback clock never moves. A .catch() alone
        // therefore never fires and no recovery runs. So verify real progress and
        // escalate if the clock is stuck.
        const verifyProgress = (escalate) => {
            const t0 = audioElement.currentTime;
            setTimeout(() => {
                const stuck = audioElement.paused || (audioElement.currentTime - t0) < 0.05;
                if (stuck) {
                    console.warn("[Audio] Resume produced no progress — escalating recovery.");
                    escalate();
                }
            }, 800);
        };

        const reloadSeekPlay = () => {
            // NEVER escalate while the page is hidden. iOS blocks a non-visible
            // page from starting playback, so load()/playTrack() cannot succeed —
            // they would only swap the src and risk destroying an audio session
            // that WebKit's native resume could still recover. Let native handle it.
            if (document.hidden) return;
            try {
                const pos = audioElement.currentTime || 0;
                audioElement.load();               // re-open the same source
                const seekBack = () => {
                    if (pos > 0) { try { audioElement.currentTime = pos; } catch (_) {} }
                    audioElement.removeEventListener("loadedmetadata", seekBack);
                };
                audioElement.addEventListener("loadedmetadata", seekBack);
                const p2 = audioElement.play();
                if (p2 && p2.then) p2.then(() => verifyProgress(fullReload)).catch(fullReload);
                else verifyProgress(fullReload);
            } catch (_) {
                fullReload();
            }
        };

        if (audioElement.error || !audioElement.src) {
            if (!document.hidden) fullReload();   // same rule: foreground only
            return;
        }

        const p = audioElement.play();
        if (!p || !p.then) { verifyProgress(reloadSeekPlay); return; }
        p.then(() => {
            console.log(`[Audio] play() RESOLVED | ${audioSnapshot()}`);
            verifyProgress(reloadSeekPlay);
        }).catch((err) => {
            // The single most valuable line for a dead lock-screen button: it names
            // exactly why the browser refused to start playback.
            console.warn(`[Audio] play() REJECTED — ${err && err.name}: ${err && err.message} | ${audioSnapshot()}`);
            reloadSeekPlay();
        });
    }

    // Safety net for the "clock advances but no sound" failure: if a Web Audio
    // graph exists at all (desktop, or a session created before the landscape bug
    // was fixed), the element's audio flows THROUGH it — so a suspended context
    // means silence. Always try to bring it back to "running" when we play or
    // return to the foreground.
    function ensureAudioContextRunning() {
        let ctx = null;
        try { ctx = audioCtx; } catch (_) { return; }   // TDZ-safe
        if (ctx && ctx.state === "suspended") {
            try { ctx.resume(); } catch (_) {}
        }
    }

    function initInterruptionRecovery() {
        if (!audioElement) return;

        // Trace the element's own lifecycle. Together with the MediaSession lines
        // this distinguishes the three possible failures for a Bluetooth/lock-screen
        // control that "does nothing":
        //   (a) no [MediaSession] line at all -> the command never reached our JS
        //       (page frozen or handler not registered) -> fix is at registration.
        //   (b) [MediaSession] line but no [Audio:play] -> play() was refused
        //       -> the rejection reason is logged.
        //   (c) [MediaSession] + [Audio:play] but no progress -> audio is running
        //       into a dead output (session/routing), a different layer entirely.
        ["play", "pause", "ended", "waiting", "stalled", "abort", "error"].forEach(ev => {
            audioElement.addEventListener(ev, () => {
                console.log(`[Audio:${ev}] ${audioSnapshot()}`);
            });
        });
        document.addEventListener("visibilitychange", () => {
            console.log(`[Page] became ${document.hidden ? "HIDDEN (screen off / app backgrounded)" : "VISIBLE"} | ${audioSnapshot()}`);
        });

        // Keep UI + lock screen in sync no matter WHO paused/played (native
        // lock-screen/car controls now drive the element directly).
        audioElement.addEventListener("play", () => {
            setLoadingIndicator(false);
            isPlaying = true;
            userInitiatedPause = false;
            resumeAfterInterruption = false;
            ensureAudioContextRunning();   // never play into a suspended graph
            // Remember a resume that happened while hidden — that is the one that
            // can come back silent (clock moving, no sound).
            if (document.hidden) resumedWhileHidden = true;
            updatePlayBtnUI();
        });

        audioElement.addEventListener("pause", () => {
            isPlaying = false;
            updatePlayBtnUI();
            // A pause we did NOT initiate, on a track that hasn't ended, is an
            // interruption (incoming call, message, another app grabbing audio).
            if (!userInitiatedPause && !audioElement.ended) {
                resumeAfterInterruption = true;
                clearTimeout(interruptionRetryTimer);
                // Keep trying for several minutes with backoff: a phone call can
                // last far longer than a few seconds, and play() simply gets
                // rejected while the call still holds the audio session (so this
                // can never un-mute us mid-call — it only succeeds once the OS
                // hands the session back). Timers are throttled in the background,
                // so the visibility/focus listeners below are the backup path.
                let attempts = 0;
                const retry = () => {
                    if (!resumeAfterInterruption || attempts > 40) return;
                    attempts++;
                    tryResumeAfterInterruption("retry " + attempts);
                    const delay = attempts < 8 ? 2000 : (attempts < 20 ? 5000 : 15000);
                    interruptionRetryTimer = setTimeout(retry, delay);
                };
                interruptionRetryTimer = setTimeout(retry, 1500);
            }
        });

        // The moment the app/screen comes back, or the page regains focus, is the
        // most reliable point to recover a session lost to an interruption.
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                ensureAudioContextRunning();
                tryResumeAfterInterruption("visibility");
                // If playback was resumed while hidden it may be running silently.
                // Do the pause/play cycle the user otherwise has to do by hand.
                if (resumedWhileHidden) {
                    resumedWhileHidden = false;
                    reviveAudioSession();
                }
            }
        });
        window.addEventListener("focus", () => tryResumeAfterInterruption("focus"));
        window.addEventListener("pageshow", () => tryResumeAfterInterruption("pageshow"));
    }

    function updateMediaSession(track, skipArtwork = false) {
        if (!("mediaSession" in navigator) || !track) return;
        try {
            // Show real album art on the lockscreen / car head-unit. Prefer the
            // track thumbnail (YouTube hqdefault), then the gita cover, then the
            // app icon. (icon-512.png did not exist, so art never appeared.)
            //
            // skipArtwork: artwork URLs cause the browser to FETCH the image. While
            // backgrounded that is avoidable network work competing with the audio
            // stream, so the title/artist still update (lock screen stays correct)
            // but the art is left as-is until we are visible again.
            const artwork = [];
            const art = skipArtwork ? null : getTrackThumbnailUrl(track);
            if (art && art !== "icon.svg") {
                const type = art.endsWith(".png") ? "image/png" : "image/jpeg";
                artwork.push({ src: art, sizes: "480x360", type });
                artwork.push({ src: art, sizes: "512x512", type });
            }
            artwork.push({ src: "icon.svg", sizes: "512x512", type: "image/svg+xml" });

            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || "Unknown Track",
                artist: track.artist || track.uploader || "SonicStream",
                album: "SonicStream PWA",
                artwork: artwork
            });
        } catch (e) {}
    }

    // --- PWA Hard Refresh (bust Service Worker + caches so a pinned/home-screen
    // app fetches the latest HTML/JS instead of serving stale cached assets) ---
    const btnHardRefresh = document.getElementById("btnHardRefresh");
    if (btnHardRefresh) {
        btnHardRefresh.addEventListener("click", async () => {
            btnHardRefresh.disabled = true;
            const orig = btnHardRefresh.innerHTML;
            btnHardRefresh.innerHTML = "⏳";
            try {
                if ("serviceWorker" in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister()));
                }
                if (window.caches) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                }
            } catch (e) {
                console.warn("[PWA] Hard refresh cleanup note:", e);
            }
            // Reload from network with a cache-busting query so the shell + app.js are fresh
            const base = location.href.split("?")[0].split("#")[0];
            location.replace(base + "?v=" + Date.now());
        });
    }

    // --- Logo -> Home (never interrupts playback) ---
    const appHomeLogo = document.getElementById("appHomeLogo");
    if (appHomeLogo) {
        appHomeLogo.addEventListener("click", () => {
            // Mobile: return to the playlists overview
            if (mobileTracksView && mobilePlaylistsView) {
                mobileTracksView.style.display = "none";
                mobilePlaylistsView.style.display = "block";
            }
            // Desktop: make sure the playlist sidebar is showing
            const sb = document.querySelector(".playlist-sidebar");
            if (sb) sb.style.display = "flex";
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // Persist the effective settings into IndexedDB so the DB browser shows them.
    async function persistEffectiveSettings() {
        const eff = {
            azure_storage_account: getAzureStorageAccount(),
            azure_container: getAzureContainer(),
            azure_client_id: getAzureClientId(),
            azure_sas_token: getAzureSASToken(),
            onedrive_share_link: getOneDriveShareLink()
        };
        for (const [k, v] of Object.entries(eff)) {
            if (v) await saveSettingToDB(k, v);
        }
    }

    // --- Settings Modal ---
    if (btnOpenSettings) btnOpenSettings.addEventListener("click", () => {
        if (settingsModal) settingsModal.classList.remove("hidden");
        // Force a real rescan when the user actually looks at it, so the number is
        // authoritative even though playback uses the cheap incremental totals.
        updateCacheUsageUI(true);
    });
    if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => settingsModal && settingsModal.classList.add("hidden"));
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener("click", () => {
            if (azureSasTokenInput) {
                localStorage.setItem("sonicstream_azure_sas", azureSasTokenInput.value.trim());
            }
            if (settingsModal) settingsModal.classList.add("hidden");
            initMSAL();
            syncDesktopPlaylists();
        });
    }

    if (btnSyncOneDriveNow) {
        btnSyncOneDriveNow.addEventListener("click", async () => {
            btnSyncOneDriveNow.disabled = true;
            btnSyncOneDriveNow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Syncing... 0%</span>`;
            try {
                await syncDesktopPlaylists((cur, tot, pct) => {
                    const span = btnSyncOneDriveNow.querySelector("span");
                    if (span) span.textContent = `Syncing ${cur}/${tot} (${pct}%)`;
                });
                btnSyncOneDriveNow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> <span>Synced!</span>`;
            } catch (err) {
                btnSyncOneDriveNow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff5f56" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> <span>Failed</span>`;
            } finally {
                setTimeout(() => {
                    btnSyncOneDriveNow.disabled = false;
                    btnSyncOneDriveNow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Sync</span>`;
                }, 2000);
            }
        });
    }

    if (refreshPlaylistBtn) {
        refreshPlaylistBtn.addEventListener("click", async () => {
            refreshPlaylistBtn.disabled = true;
            refreshPlaylistBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Syncing Manifest...</span>`;
            try {
                await syncDesktopPlaylists();

                if (activePlaylistItems && activePlaylistItems.length > 0) {
                    const total = activePlaylistItems.length;
                    for (let i = 0; i < total; i++) {
                        const track = activePlaylistItems[i];
                        const pct = Math.round(((i + 1) / total) * 100);
                        refreshPlaylistBtn.querySelector("span").textContent = `Caching (${i + 1}/${total} - ${pct}%)`;

                        // Pre-download track blob into IndexedDB
                        await prefetchUpcomingTracks([track], -1, 1);
                    }
                    refreshPlaylistBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> <span>All Downloaded & Cached!</span>`;
                } else {
                    refreshPlaylistBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> <span>Synced!</span>`;
                }
            } catch (err) {
                console.error("Sync error:", err);
                refreshPlaylistBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff5f56" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> <span>Sync Failed</span>`;
            } finally {
                setTimeout(() => {
                    refreshPlaylistBtn.disabled = false;
                    refreshPlaylistBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Sync Playlist</span>`;
                }, 3000);
            }
        });
    }

    // --- Smart Lookahead Pre-fetching & High-Quality Audio Caching ---
    async function prefetchUpcomingTracks(queue, currentIndex, count = 3) {
        if (!queue || queue.length === 0) return;

        let downloadedCount = 0;
        let scanOffset = 1;

        while (downloadedCount < count && scanOffset <= queue.length) {
            const nextIdx = (currentIndex + scanOffset) % queue.length;
            const upcomingTrack = queue[nextIdx];
            scanOffset++;

            if (!upcomingTrack || upcomingTrack.isLocalBlob) continue;
            // Yield to a track the user is waiting on, and never prefetch while
            // hidden (iOS blocks background fetch anyway).
            if (userDownloadActive || document.hidden) {
                console.log("[PWA Cache] Cache-ahead yielding — a track the user is waiting for is downloading.");
                break;
            }

            const existingBlob = await getTrackBlobFromDB(upcomingTrack.id, upcomingTrack.title, upcomingTrack.file);
            if (existingBlob) {
                upcomingTrack.status = "completed";
                downloadedCount++;
                continue;
            }

            try {
                let streamUrl = upcomingTrack.downloadUrl;

                // Strategy 1: OneDrive Cloud Stream
                if (!streamUrl && currentUserAccount) {
                    try {
                        const token = await getGraphAccessToken();
                        const folderName = oneDriveFolderNameInput.value.trim() || "YoutubeDownloads";
                        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${folderName}/${encodeURIComponent(upcomingTrack.file || (upcomingTrack.title + '.mp3'))}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (res.ok) {
                            const data = await res.json();
                            streamUrl = data["@microsoft.graph.downloadUrl"];
                            upcomingTrack.downloadUrl = streamUrl;
                        }
                    } catch (e) {}
                }

                // Strategy 2: Direct OneDrive / Desktop Audio Stream
                if (!streamUrl && upcomingTrack.file) {
                    if (window.location.protocol.startsWith("https") || window.location.hostname.includes("azurestaticapps.net")) {
                        const sasToken = getAzureSASToken();
                        streamUrl = `${getAzureBlobBaseUrl()}/${encodeURIComponent(upcomingTrack.file)}?${sasToken}`;
                    } else {
                        streamUrl = `http://127.0.0.1:8765/api/media/file/${encodeURIComponent(upcomingTrack.file)}`;
                    }
                } else if (!streamUrl && upcomingTrack.url) {
                    streamUrl = `http://127.0.0.1:8765/api/media/stream?video_url=${encodeURIComponent(upcomingTrack.url)}&title=${encodeURIComponent(upcomingTrack.title)}&format=audio`;
                }

                if (streamUrl && streamUrl.startsWith("/")) {
                    streamUrl = (window.location.protocol.startsWith("http") ? window.location.origin : "http://127.0.0.1:8765") + streamUrl;
                }

                if (streamUrl) {
                    try {
                        const audioRes = await fetch(streamUrl).catch(() => null);
                        if (audioRes && audioRes.ok) {
                            const blob = await audioRes.blob();
                            // Pass the TRACK OBJECT, not the title. saveTrackBlobToDB
                            // keys the record on trackMeta.file when given an object,
                            // but falls back to `${title}.mp3` for a bare string — so
                            // prefetch was filing tracks under a DIFFERENT key than
                            // playTrack uses (the real blob name, which yt-dlp may have
                            // rewritten, e.g. "|" -> fullwidth). That produced duplicate
                            // records and tracks being re-downloaded despite "already
                            // being cached".
                            await saveTrackBlobToDB(upcomingTrack.id, blob, upcomingTrack);
                            console.log(`[PWA High-Quality Cache] Saved HQ audio track (${downloadedCount + 1}/${count}): ${upcomingTrack.title}`);
                        }
                        upcomingTrack.status = "completed";
                        downloadedCount++;
                    } catch (e) {
                        upcomingTrack.status = "completed";
                        downloadedCount++;
                    }
                } else {
                    upcomingTrack.status = "queued";
                }
            } catch (err) {
                upcomingTrack.status = "queued";
            }
        }
        renderTracksTable(activePlaylistItems);
    }

    if (btnSaveOffline) btnSaveOffline.addEventListener("click", async () => {
        if (!activePlaylistItems || activePlaylistItems.length === 0) {
            alert("No tracks to cache in active playlist.");
            return;
        }
        btnSaveOffline.disabled = true;
        btnSaveOffline.textContent = "Caching Playlist...";
        try {
            await prefetchUpcomingTracks(activePlaylistItems, -1, activePlaylistItems.length);
            alert(`Successfully cached '${playlistTitle.textContent}' for 100% offline playback!`);
        } catch (e) {
            console.error("Cache offline error:", e);
        } finally {
            btnSaveOffline.disabled = false;
            btnSaveOffline.textContent = "Cache Offline";
        }
    });

    // --- Startup Initialization ---
    initDB().then(async () => {
        // Pull the saved trace so the console can show what happened BEFORE this
        // load (evictions, self-reloads, overnight drives).
        try { window.__PERSISTED_TRACE = (await getSettingFromDB(TRACE_KEY)) || []; } catch (_) {}
        await purgeLargeFilesFromDB();
        await persistEffectiveSettings();
        await loadPlaylistsFromDB();
    });
    initMSAL();
    initAudioSession();
    initInterruptionRecovery();
    initMediaSessionHandlers();
});
