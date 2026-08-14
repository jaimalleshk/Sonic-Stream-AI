document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements - Settings & Search
    const urlInput = document.getElementById("urlInput");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const analyzeSpinner = document.getElementById("analyzeSpinner");
    const urlError = document.getElementById("urlError");
    
    function showAIStatus(msg) {
        const aiConsole = document.getElementById("aiStatusConsole");
        if (!aiConsole) return;
        if (!msg) {
            aiConsole.style.display = "none";
        } else {
            aiConsole.style.display = "block";
            aiConsole.textContent = msg;
        }
    }
    const downloadDirInput = document.getElementById("downloadDirInput");
    const browseDirBtn = document.getElementById("browseDirBtn");
    const openFolderBtn = document.getElementById("openFolderBtn");

    // DOM Elements - Left Sidebar Playlist Explorer
    const tabPinned = document.getElementById("tabPinned");
    const tabAll = document.getElementById("tabAll");
    const tabTrash = document.getElementById("tabTrash");
    const playlistListContainer = document.getElementById("playlistListContainer");
    const sidebarPrevBtn = document.getElementById("sidebarPrevBtn");
    const sidebarPageInfo = document.getElementById("sidebarPageInfo");
    const sidebarNextBtn = document.getElementById("sidebarNextBtn");
    const btnCreateManual = document.getElementById("btnCreateManual");

    // DOM Elements - Right Playlist Items Grid
    const playlistTitle = document.getElementById("playlistTitle");
    const playlistMetaInfo = document.getElementById("playlistMetaInfo");
    const refreshPlaylistBtn = document.getElementById("refreshPlaylistBtn");
    const selectAllBtn = document.getElementById("selectAllBtn");
    const deselectAllBtn = document.getElementById("deselectAllBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const playlistSearch = document.getElementById("playlistSearch");
    const statusFilter = document.getElementById("statusFilter");
    const playlistTableBody = document.getElementById("playlistTableBody");
    const headerCheckbox = document.getElementById("headerCheckbox");
    const btnPrevPage = document.getElementById("btnPrevPage");
    const btnNextPage = document.getElementById("btnNextPage");
    const pageIndicator = document.getElementById("pageIndicator");

    // DOM Elements - Universal Media Player Controls
    const playerVideo = document.getElementById("playerVideo");
    const playerAudioArtPanel = document.getElementById("playerAudioArtPanel");
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
    const playerPrevBtn = document.getElementById("playerPrevBtn");
    const playerNextBtn = document.getElementById("playerNextBtn");
    const playerKaraokeBtn = document.getElementById("playerKaraokeBtn");
    const playerLiveMuteBtn = document.getElementById("playerLiveMuteBtn");
    const playerShuffleBtn = document.getElementById("playerShuffleBtn");
    const playerRepeatBtn = document.getElementById("playerRepeatBtn");
    const playerVolumeBtn = document.getElementById("playerVolumeBtn");
    const playerVolumeSlider = document.getElementById("playerVolumeSlider");
    const playerMaximizeBtn = document.getElementById("playerMaximizeBtn");

    // HUD and Terminal Console
    const gridHud = document.getElementById("gridHud");
    const hudJobTitle = document.getElementById("hudJobTitle");
    const hudCurrentFile = document.getElementById("hudCurrentFile");
    const hudSpeed = document.getElementById("hudSpeed");
    const hudEta = document.getElementById("hudEta");
    const hudProgressCount = document.getElementById("hudProgressCount");
    const consoleLogs = document.getElementById("consoleLogs");

    // State Variables
    let historyJobs = [];
    let currentPlaylistId = null;
    let playlistItems = [];
    let localItemStates = {}; // Map of item.id -> { status, percentage, speed, start_time, end_time, error_detail }
    let selectedItemIds = new Set();
    
    // Playback state variables
    let playQueue = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let isShuffle = false;
    let isRepeat = false;
    let isMuted = false;
    let lastVolume = 80;
    let isMaximized = false;
    let currentEventSource = null;
    let nextTrackTimeout = null;
    let nextTrackCountdownInterval = null;

    // Sidebar & Items Pagination
    let sidebarTab = "all"; // Pinned, All, or Trash
    let sidebarPage = 1;
    const sidebarPageSize = 5;
    let currentPage = 1;
    const pageSize = 50;

    // Helper: format duration
    function formatDuration(seconds) {
        if (!seconds) return "--:--";
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Helper: show/hide errors
    function showError(msg) {
        urlError.textContent = msg;
        urlError.classList.remove("hidden");
    }
    function hideError() {
        urlError.classList.add("hidden");
    }

    // Terminal Logging
    function logToTerminal(msg, isError = false) {
        const p = document.createElement("p");
        p.textContent = msg;
        if (isError) {
            p.style.color = "var(--error)";
        }
        consoleLogs.appendChild(p);
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }

    // Load jobs history and populate left sidebar explorer
    let isAppInitialized = false;
    async function loadSidebar() {
        try {
            const res = await fetch("/api/history");
            historyJobs = await res.json();
            
            // Auto select first active playlist if none active
            if (historyJobs.length > 0 && !currentPlaylistId) {
                const active = historyJobs.find(job => !job.deleted && !job.is_virtual && job.is_playlist !== false);
                if (active) {
                    selectPlaylist(active);
                }
            }
            
            // Fade out splash screen on first load
            if (!isAppInitialized) {
                isAppInitialized = true;
                const splash = document.getElementById("appSplash");
                if (splash) {
                    splash.style.opacity = "0";
                    setTimeout(() => { splash.style.display = "none"; }, 500);
                }
            }
            
            renderSidebarList();
        } catch (e) {
            console.error("Failed to load history list:", e);
        }
    }

    // Fallback fetching helper for older history items without pre-extracted tracks
    async function fetchPlaylistTracksFallback(job) {
        try {
            const res = await fetch("/api/fetch-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: job.url })
            });
            if (res.ok) {
                const data = await res.json();
                const fetchedItems = data.entries || [];
                
                // Save to backend
                await fetch(`/api/history/${job.id}/items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: fetchedItems })
                });
                
                // Update local job object
                job.items = fetchedItems.map(item => ({
                    id: item.id,
                    title: item.title,
                    uploader: item.uploader || "Unknown",
                    duration: item.duration || 0,
                    thumbnail: item.thumbnail,
                    url: item.url,
                    status: "queued",
                    percentage: 0.0,
                    speed: "--",
                    start_time: "--",
                    end_time: "--",
                    error_detail: ""
                }));
                job.total_tracks = fetchedItems.length;
                return job.items;
            }
        } catch (e) {
            console.error("Failed fallback fetch:", e);
        }
        return [];
    }

    function renderSidebarList() {
        playlistListContainer.innerHTML = "";
        
        let filtered = [];
        if (sidebarTab === "pinned") {
            filtered = historyJobs.filter(job => job.pinned && !job.deleted && job.id !== "deleted_tracks");
        } else if (sidebarTab === "all") {
            // Show all downloads virtual entry at index 0, followed by non-deleted items
            filtered = historyJobs.filter(job => !job.deleted && job.id !== "deleted_tracks");
        } else if (sidebarTab === "trash") {
            // Show deleted tracks virtual entry at index 0, followed by deleted items
            const trashPlaylists = historyJobs.filter(job => job.deleted);
            const deletedTracks = historyJobs.find(job => job.id === "deleted_tracks");
            filtered = deletedTracks ? [deletedTracks].concat(trashPlaylists) : trashPlaylists;
        }
        
        // Pagination logic
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / sidebarPageSize));
        if (sidebarPage > totalPages) sidebarPage = totalPages;
        if (sidebarPage < 1) sidebarPage = 1;
        
        const start = (sidebarPage - 1) * sidebarPageSize;
        const end = Math.min(start + sidebarPageSize, total);
        const pageItems = filtered.slice(start, end);
        
        sidebarPageInfo.textContent = `Page ${sidebarPage} of ${totalPages}`;
        sidebarPrevBtn.disabled = sidebarPage <= 1;
        sidebarNextBtn.disabled = sidebarPage >= totalPages;
        
        if (pageItems.length === 0) {
            playlistListContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 1.5rem 0;">No playlists found.</div>`;
            return;
        }
        
        pageItems.forEach(job => {
            const row = document.createElement("div");
            row.className = `sidebar-row ${currentPlaylistId === job.id ? 'active' : ''}`;
            
            const totalTracks = job.total_tracks || 0;
            const completed = job.success_count || 0;
            const percent = totalTracks > 0 ? Math.round((completed / totalTracks) * 100) : 0;
            const isPinned = job.pinned || false;
            const isVirtual = job.is_virtual || false;
            
            if (sidebarTab === "trash") {
                // Trash Tab controls (Restore / Delete permanently)
                row.innerHTML = `
                    <div class="sidebar-row-header">
                        <div class="sidebar-row-title" title="${job.title}">${job.title}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${totalTracks} tracks</span>
                        <div class="sidebar-row-controls" style="display: flex; gap: 0.5rem; align-items: center;">
                            ${job.id !== "deleted_tracks" ? `
                            <button class="sidebar-row-btn restore-sidebar-btn" title="Restore Playlist">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
                            </button>
                            ` : ''}
                            <button class="sidebar-row-btn perm-delete-sidebar-btn" title="Delete Permanently" style="color: var(--error);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                            </button>
                        </div>
                    </div>
                `;
                
                row.addEventListener("click", (e) => {
                    if (e.target.closest("button")) return;
                    selectPlaylist(job);
                });
                
                if (job.id !== "deleted_tracks") {
                    row.querySelector(".restore-sidebar-btn").addEventListener("click", async (e) => {
                        e.stopPropagation();
                        try {
                            const res = await fetch(`/api/history/${job.id}/restore`, { method: "POST" });
                            if (res.ok) {
                                logToTerminal(`[System] Restored playlist "${job.title}".`);
                                await loadSidebar();
                            }
                        } catch (err) {
                            console.error("Restore failed:", err);
                        }
                    });
                }
                
                row.querySelector(".perm-delete-sidebar-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const warning = job.id === "deleted_tracks" 
                        ? "Are you sure you want to empty the deleted tracks list?" 
                        : `Are you sure you want to delete "${job.title}" permanently? This cannot be undone.`;
                    
                    if (!confirm(warning)) return;
                    
                    try {
                        const res = await fetch(`/api/history/${job.id}`, { method: "DELETE" });
                        if (res.ok) {
                            logToTerminal(`[System] Deleted "${job.title}" permanently.`);
                            if (currentPlaylistId === job.id) {
                                currentPlaylistId = null;
                                playlistItems = [];
                                playlistTitle.textContent = "No Playlist Selected";
                                playlistMetaInfo.textContent = "Select a playlist from the left explorer.";
                                playlistTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No items active.</td></tr>`;
                            }
                            await loadSidebar();
                        }
                    } catch (err) {
                        console.error("Permanent delete failed:", err);
                    }
                });
                
            } else {
                // Active Tabs (Pinned or All)
                row.innerHTML = `
                    <div class="sidebar-row-header">
                        <div class="sidebar-row-title" title="${job.title}">${job.title}</div>
                        ${!isVirtual ? `<span style="font-size: 0.8rem; color: var(--text-muted); font-weight: bold; flex-shrink: 0;">${percent}%</span>` : ''}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${completed}/${totalTracks} tracks</span>
                        <div class="sidebar-row-controls" style="display: flex; gap: 0.5rem; align-items: center;">
                            <button class="sidebar-row-btn play-sidebar-btn" title="Play Playlist">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                            <button class="sidebar-row-btn shuffle-sidebar-btn" title="Shuffle Play">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
                            </button>
                            <button class="sidebar-row-btn resume-sidebar-btn" title="Resume Last Played">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                            </button>
                            ${!isVirtual ? `
                            <button class="sidebar-row-btn move-up-btn" title="Move Up">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                            </button>
                            <button class="sidebar-row-btn move-down-btn" title="Move Down">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <button class="sidebar-row-btn pin-sidebar-btn ${isPinned ? 'pinned-active' : ''}" title="${isPinned ? 'Unpin' : 'Pin'}">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                            </button>
                            <button class="sidebar-row-btn delete-sidebar-btn" title="Move to Trash" style="color: var(--error);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    ${!isVirtual ? `
                    <div class="sidebar-row-progress-container" style="margin-top: 0.35rem;">
                        <div class="sidebar-row-progress-bar" style="width: ${percent}%;"></div>
                    </div>
                    ` : ''}
                `;
                
                row.addEventListener("click", (e) => {
                    if (e.target.closest("button")) return;
                    selectPlaylist(job);
                });
                
                row.querySelector(".play-sidebar-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    await selectPlaylist(job);
                    let tracks = playQueue.filter(t => isTrackDownloaded(t));
                    if (tracks.length > 0) {
                        playTrack(tracks[0], playQueue, playQueue.findIndex(t => t.id === tracks[0].id));
                    } else {
                        alert("No downloaded tracks found in this playlist to play.");
                    }
                });
                
                row.querySelector(".shuffle-sidebar-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    await selectPlaylist(job);
                    let tracks = playQueue.filter(t => isTrackDownloaded(t));
                    if (tracks.length > 0) {
                        isShuffle = true;
                        playerShuffleBtn.classList.add("active");
                        const rand = Math.floor(Math.random() * tracks.length);
                        const origIndex = playQueue.findIndex(t => t.id === tracks[rand].id);
                        playTrack(tracks[rand], playQueue, origIndex);
                    } else {
                        alert("No downloaded tracks found in this playlist to shuffle.");
                    }
                });

                row.querySelector(".resume-sidebar-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    await selectPlaylist(job);
                    let tracks = playlistItems;
                    
                    if (tracks.length > 0) {
                        const lastPlayedId = job.last_played_track_id;
                        const lastPlayedShuffle = job.last_played_shuffle || false;
                        const savedShuffleOrder = job.shuffle_order || [];
                        const savedShuffleIndex = job.shuffle_index !== undefined ? job.shuffle_index : -1;
                        
                        let targetTrack = null;
                        let targetQueue = tracks;
                        let targetIndex = 0;
                        
                        if (lastPlayedId) {
                            targetTrack = tracks.find(t => t.id === lastPlayedId);
                        }
                        if (!targetTrack || !isTrackDownloaded(targetTrack)) {
                            const downloaded = tracks.filter(t => isTrackDownloaded(t));
                            targetTrack = downloaded.length > 0 ? downloaded[0] : null;
                        }
                        
                        if (!targetTrack) {
                            alert("No downloaded tracks available in this playlist to resume.");
                            return;
                        }
                        
                        if (lastPlayedShuffle && savedShuffleOrder.length > 0) {
                            isShuffle = true;
                            playerShuffleBtn.classList.add("active");
                            const orderedQueue = savedShuffleOrder.map(id => tracks.find(t => t.id === id)).filter(Boolean);
                            if (orderedQueue.length > 0) {
                                targetQueue = orderedQueue;
                                targetIndex = savedShuffleIndex >= 0 ? savedShuffleIndex : targetQueue.findIndex(t => t.id === targetTrack.id);
                            }
                        } else {
                            isShuffle = false;
                            playerShuffleBtn.classList.remove("active");
                            targetQueue = tracks;
                            targetIndex = targetQueue.findIndex(t => t.id === targetTrack.id);
                        }
                        
                        playTrack(targetTrack, targetQueue, targetIndex);
                    }
                });
                
                if (!isVirtual) {
                    const moveJob = async (direction) => {
                        try {
                            const res = await fetch(`/api/history/${job.id}/move`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ direction })
                            });
                            if (res.ok) {
                                const data = await res.json();
                                if (data.moved) await loadSidebar();
                            }
                        } catch (err) {
                            console.error("Failed to move playlist:", err);
                        }
                    };
                    row.querySelector(".move-up-btn").addEventListener("click", (e) => {
                        e.stopPropagation();
                        moveJob("up");
                    });
                    row.querySelector(".move-down-btn").addEventListener("click", (e) => {
                        e.stopPropagation();
                        moveJob("down");
                    });

                    row.querySelector(".pin-sidebar-btn").addEventListener("click", async (e) => {
                        e.stopPropagation();
                        try {
                            const res = await fetch(`/api/history/${job.id}/pin`, { method: "POST" });
                            if (res.ok) {
                                const data = await res.json();
                                job.pinned = data.pinned;
                                loadSidebar();
                            }
                        } catch (err) {
                            console.error("Failed to pin job:", err);
                        }
                    });

                    row.querySelector(".delete-sidebar-btn").addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Are you sure you want to move "${job.title}" to the trash bin?`)) return;
                        try {
                            const res = await fetch(`/api/history/${job.id}`, { method: "DELETE" });
                            if (res.ok) {
                                logToTerminal(`[System] Soft-deleted "${job.title}". Moved to Trash.`);
                                if (currentPlaylistId === job.id) {
                                    currentPlaylistId = null;
                                    playlistItems = [];
                                    playlistTitle.textContent = "No Playlist Selected";
                                    playlistMetaInfo.textContent = "Select a playlist from the left explorer.";
                                    playlistTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No items active.</td></tr>`;
                                }
                                await loadSidebar();
                            }
                        } catch (err) {
                            console.error("Soft delete failed:", err);
                        }
                    });
                }
            }
            
            playlistListContainer.appendChild(row);
        });
    }

    async function selectPlaylist(job) {
        currentPlaylistId = job.id;
        playlistTitle.textContent = job.title;
        urlInput.value = job.url || "";
        
        localItemStates = {};
        selectedItemIds.clear();
        
        if ((!job.items || job.items.length === 0) && job.url && !job.is_virtual) {
            playlistMetaInfo.textContent = "Loading items from YouTube...";
            playlistTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">Fetching track list...</td></tr>`;
            
            const fetched = await fetchPlaylistTracksFallback(job);
            if (fetched && fetched.length > 0) {
                playlistItems = fetched;
            } else {
                playlistItems = [];
                playlistTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--error); padding: 2rem;">Failed to fetch tracks.</td></tr>`;
                playlistMetaInfo.textContent = "Fetch failed.";
                return;
            }
        } else {
            playlistItems = job.items || [];
        }
        
        playlistMetaInfo.textContent = `${job.total_tracks} tracks | format: ${job.format || "audio"} | quality: ${job.quality || "highest"}`;
        
        playlistItems.forEach(item => {
            localItemStates[item.id] = {
                status: item.status || "queued",
                percentage: item.percentage || 0.0,
                speed: item.speed || "--",
                start_time: item.start_time || "--",
                end_time: item.end_time || "--",
                error_detail: item.error_detail || "",
                file_missing: item.file_missing || false
            };
            selectedItemIds.add(item.id);
        });
        
        playQueue = playlistItems;
        currentTrackIndex = 0;
        
        currentPage = 1;
        renderPlaylistTable(playlistItems);
        updateSelectionMeta();
        renderSidebarList();

        // Auto-resume pending downloads (only for real, non-virtual playlists)
        if (!job.is_virtual && job.url) {
            const hasPending = playlistItems.some(item => {
                const status = localItemStates[item.id].status;
                return status === "queued" || status === "downloading" || status === "error" || status === "failed";
            });
            
            if (hasPending) {
                logToTerminal(`[System] Auto-resuming pending downloads for "${job.title}"...`);
                autoResumePlaylist(job.id);
            }
        }
    }

    async function autoResumePlaylist(jobId) {
        try {
            const res = await fetch("/api/history/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ job_id: jobId, force_all: false })
            });
            if (res.ok) {
                const resData = await res.json();
                logToTerminal(`[System] Resumed pending queue successfully.`);
                hudJobTitle.textContent = `Active Job: #${resData.job_num} - ${resData.title}`;
                gridHud.classList.remove("hidden");
                startProgressStream();
            }
        } catch (e) {
            console.error("Auto-resume failed:", e);
        }
    }

    // Paging listeners for explorer sidebar
    sidebarPrevBtn.addEventListener("click", () => {
        if (sidebarPage > 1) {
            sidebarPage--;
            renderSidebarList();
        }
    });
    sidebarNextBtn.addEventListener("click", () => {
        let count = 0;
        if (sidebarTab === "pinned") count = historyJobs.filter(j => j.pinned && !j.deleted && j.id !== "deleted_tracks").length;
        else if (sidebarTab === "all") count = historyJobs.filter(j => !j.deleted && j.id !== "deleted_tracks").length;
        else if (sidebarTab === "trash") count = historyJobs.filter(j => j.deleted || j.id === "deleted_tracks").length;
        
        const totalPages = Math.ceil(count / sidebarPageSize);
        if (sidebarPage < totalPages) {
            sidebarPage++;
            renderSidebarList();
        }
    });

    // Sidebar tab selection
    tabPinned.addEventListener("click", () => {
        sidebarTab = "pinned";
        tabPinned.classList.add("active");
        tabAll.classList.remove("active");
        tabTrash.classList.remove("active");
        sidebarPage = 1;
        renderSidebarList();
    });
    tabAll.addEventListener("click", () => {
        sidebarTab = "all";
        tabAll.classList.add("active");
        tabPinned.classList.remove("active");
        tabTrash.classList.remove("active");
        sidebarPage = 1;
        renderSidebarList();
    });
    tabTrash.addEventListener("click", () => {
        sidebarTab = "trash";
        tabTrash.classList.add("active");
        tabPinned.classList.remove("active");
        tabAll.classList.remove("active");
        sidebarPage = 1;
        renderSidebarList();
    });
    // Create Manual Playlist button handler
    btnCreateManual.addEventListener("click", async () => {
        const option = confirm("Click OK to Import files from folder, or Cancel to Create an Empty Playlist.");
        if (option) {
            // Import folder
            try {
                const browseRes = await fetch("/api/settings/browse-folder", { method: "POST" });
                const browseData = await browseRes.json();
                if (browseData.folder_path) {
                    const title = prompt("Enter playlist title:");
                    if (!title || !title.trim()) return;
                    
                    const res = await fetch("/api/playlists/import", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: title.trim(), folder_path: browseData.folder_path })
                    });
                    
                    if (res.ok) {
                        const newPlaylist = await res.json();
                        logToTerminal(`[System] Imported local folder to playlist "${newPlaylist.title}".`);
                        await loadSidebar();
                        selectPlaylist(newPlaylist);
                    } else {
                        const errData = await res.json();
                        alert(`Import failed: ${errData.detail}`);
                    }
                }
            } catch (err) {
                console.error("Browse folder failed:", err);
            }
        } else {
            // Empty manual playlist
            const title = prompt("Enter playlist title:");
            if (!title || !title.trim()) return;
            
            try {
                const res = await fetch("/api/playlists/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: title.trim() })
                });
                if (res.ok) {
                    const newPlaylist = await res.json();
                    logToTerminal(`[System] Created manual playlist "${newPlaylist.title}".`);
                    await loadSidebar();
                    selectPlaylist(newPlaylist);
                }
            } catch (err) {
                console.error("Create manual playlist failed:", err);
            }
        }
    });

    // Sync/Refresh Playlist button handler
    refreshPlaylistBtn.addEventListener("click", async () => {
        if (!currentPlaylistId || currentPlaylistId === "all_downloads" || currentPlaylistId === "deleted_tracks") {
            alert("Please select a real YouTube playlist to sync.");
            return;
        }
        
        refreshPlaylistBtn.disabled = true;
        refreshPlaylistBtn.textContent = "Syncing...";
        logToTerminal(`[System] Fetching latest playlist uploads from YouTube...`);
        
        try {
            const res = await fetch(`/api/history/${currentPlaylistId}/refresh`, { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Refresh failed");
            }
            
            const resData = await res.json();
            if (resData.new_count > 0) {
                logToTerminal(`[System] Sync completed! Found ${resData.new_count} new tracks.`);
                hudJobTitle.textContent = `Active Job: #${resData.job_num} - Delta Sync`;
                gridHud.classList.remove("hidden");
                
                await loadSidebar();
                startProgressStream();
            } else {
                logToTerminal(`[System] Playlist is already up to date. No new uploads detected.`);
                alert("Playlist is already up to date.");
            }
        } catch (err) {
            logToTerminal(`[Error] Refresh failed: ${err.message}`, true);
            alert(`Refresh failed: ${err.message}`);
        } finally {
            refreshPlaylistBtn.disabled = false;
            refreshPlaylistBtn.textContent = "Sync YouTube";
        }
    });

    // Grid column sorting state (null key = original playlist order)
    let gridSortKey = null;
    let gridSortDir = 1;

    function updateSortIndicators() {
        document.querySelectorAll(".sortable-th").forEach(th => {
            const ind = th.querySelector(".sort-ind");
            if (ind) ind.textContent = th.dataset.sort === gridSortKey ? (gridSortDir === 1 ? " ▲" : " ▼") : "";
        });
    }

    document.querySelectorAll(".sortable-th").forEach(th => {
        th.style.cursor = "pointer";
        th.title = "Sort by this column";
        th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (gridSortKey === key) {
                if (gridSortDir === 1) {
                    gridSortDir = -1;
                } else {
                    // third click clears the sort back to playlist order
                    gridSortKey = null;
                    gridSortDir = 1;
                }
            } else {
                gridSortKey = key;
                gridSortDir = 1;
            }
            updateSortIndicators();
            currentPage = 1;
            renderPlaylistTable(playlistItems);
        });
    });

    // Render track rows in the Items Grid
    function renderPlaylistTable(items) {
        playlistTableBody.innerHTML = "";

        const query = playlistSearch.value.toLowerCase().trim();
        const status = statusFilter.value;

        const filteredItems = items.filter(item => {
            const title = item.title.toLowerCase();
            const channel = item.uploader.toLowerCase();
            const state = localItemStates[item.id] || { status: "queued" };
            const itemStatus = state.status || "queued";

            const matchesText = title.includes(query) || channel.includes(query);
            const matchesStatus = (status === "all") || (itemStatus === status);
            return matchesText && matchesStatus;
        });

        if (gridSortKey) {
            const posMap = new Map(items.map((it, i) => [it.id, i]));
            const sortVal = (item) => {
                const state = localItemStates[item.id] || {};
                switch (gridSortKey) {
                    case "index": return posMap.get(item.id) || 0;
                    case "title": return (item.title || "").toLowerCase();
                    case "uploader": return (item.uploader || "").toLowerCase();
                    case "duration": return item.duration || 0;
                    case "status": return state.status || "queued";
                    case "error": return state.error_detail || "";
                    default: return 0;
                }
            };
            filteredItems.sort((a, b) => {
                const va = sortVal(a), vb = sortVal(b);
                if (va < vb) return -gridSortDir;
                if (va > vb) return gridSortDir;
                return 0;
            });
        }

        const totalFiltered = filteredItems.length;
        const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
        
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        
        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        const pageItems = filteredItems.slice(startIdx, endIdx);

        if (totalFiltered === 0) {
            playlistTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No items active.</td></tr>`;
            pageIndicator.textContent = "Page 1 of 1";
            btnPrevPage.disabled = true;
            btnNextPage.disabled = true;
            return;
        }

        pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
        btnPrevPage.disabled = currentPage === 1;
        btnNextPage.disabled = currentPage === totalPages;

        let allChecked = true;
        pageItems.forEach(item => {
            if (!selectedItemIds.has(item.id)) allChecked = false;
        });
        headerCheckbox.checked = allChecked && pageItems.length > 0;

        pageItems.forEach((item, idx) => {
            const state = localItemStates[item.id] || {
                status: "queued",
                percentage: 0.0,
                speed: "--",
                start_time: "--",
                end_time: "--",
                error_detail: ""
            };

            const row = document.createElement("tr");
            row.className = "playlist-row";
            row.setAttribute("data-id", item.id);
            
            const isPlayable = (state.status === "completed" || (state.status === "skipped" && !state.file_missing));
            if (isPlayable) {
                row.classList.add("playable");
            }
            
            const isChecked = selectedItemIds.has(item.id);
            // "skipped" only displays as Downloaded when the file is actually on disk
            const displayStatus = state.status === "skipped" ? (state.file_missing ? "Skipped" : "Downloaded") : state.status;
            
            // Conditional action buttons rendering
            let actionButtons = "";
            if (currentPlaylistId === "deleted_tracks") {
                // Restore / Permanent Delete for deleted tracks
                actionButtons = `
                    <button class="row-restore-btn" style="background: transparent; border: none; color: var(--text-primary); cursor: pointer; padding: 2px;" title="Restore to Playlist">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
                    </button>
                    <button class="row-perm-delete-btn" style="background: transparent; border: none; color: var(--error); cursor: pointer; padding: 2px;" title="Delete Permanently">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                `;
            } else {
                // Play controls + Playlist management tools
                actionButtons = `
                    <button class="row-play-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 2px;" title="Play Track">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button class="row-play-from-here-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 2px;" title="Play From Here">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                    </button>
                    ${isPlayable ? `
                    <button class="row-ai-btn" style="background: transparent; border: none; color: #b19cd9; cursor: pointer; padding: 2px;" title="Create AI Instrumental (Piano)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z"/></svg>
                    </button>
                    <button class="row-karaoke-btn" style="background: transparent; border: none; color: #ffb6c1; cursor: pointer; padding: 2px;" title="Mute Vocals (Karaoke)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                    </button>
                    ` : ''}
                    <button class="row-add-playlist-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 2px;" title="Add to Playlist">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    ${currentPlaylistId !== "all_downloads" ? `
                    <button class="row-delete-btn" style="background: transparent; border: none; color: var(--error); cursor: pointer; padding: 2px;" title="Remove from Playlist">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                    ` : ''}
                `;
            }

            row.innerHTML = `
                <td><input type="checkbox" class="video-checkbox" ${isChecked ? 'checked' : ''} data-id="${item.id}"></td>
                <td style="font-weight: bold; color: var(--text-muted);">${startIdx + idx + 1}</td>
                <td class="thumb-cell"><img src="${item.thumbnail || 'https://i.ytimg.com/vi/default/hqdefault.jpg'}" alt="Thumb" style="width: 40px; height: 30px; object-fit: cover; border-radius: 4px;"></td>
                <td class="title-cell" title="${item.title}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;">${item.title}</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
                        ${actionButtons}
                    </div>
                </td>
                <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);">${item.uploader}</td>
                <td>${formatDuration(item.duration)}</td>
                <td class="status-cell">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-primary); text-transform: capitalize;" id="status-text-${item.id}">
                            ${displayStatus} (${state.percentage}%)
                        </span>
                        <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden;">
                            <div id="fill-${item.id}" style="width: ${state.percentage}%; height: 100%; background: var(--neon-blue); transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                </td>
                <td class="error-detail-cell" id="error-detail-${item.id}" title="${state.error_detail || ''}" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--error); font-size: 0.7rem;">${state.error_detail || ""}</td>
            `;
            
            // Checkbox event binding
            row.querySelector(".video-checkbox").addEventListener("change", (e) => {
                if (e.target.checked) {
                    selectedItemIds.add(item.id);
                } else {
                    selectedItemIds.delete(item.id);
                }
                updateSelectionMeta();
                
                let allCheckedNow = true;
                pageItems.forEach(pi => {
                    if (!selectedItemIds.has(pi.id)) allCheckedNow = false;
                });
                headerCheckbox.checked = allCheckedNow;
            });

            if (currentPlaylistId === "deleted_tracks") {
                // Deleted Tracks action listeners
                row.querySelector(".row-restore-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    try {
                        const res = await fetch(`/api/history/deleted-tracks/${item.id}/restore`, { method: "POST" });
                        if (res.ok) {
                            logToTerminal(`[System] Restored "${item.title}" to its original playlist.`);
                            await loadSidebar();
                            // Refresh currently active Deleted Tracks view
                            const delTracks = historyJobs.find(j => j.id === "deleted_tracks");
                            if (delTracks) selectPlaylist(delTracks);
                        } else {
                            const errData = await res.json();
                            alert(`Restore failed: ${errData.detail}`);
                        }
                    } catch (err) {
                        console.error("Restore failed:", err);
                    }
                });

                row.querySelector(".row-perm-delete-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Are you sure you want to delete "${item.title}" permanently from trash?`)) return;
                    try {
                        const res = await fetch(`/api/history/deleted-tracks/${item.id}/permanent`, { method: "DELETE" });
                        if (res.ok) {
                            logToTerminal(`[System] Deleted "${item.title}" permanently.`);
                            await loadSidebar();
                            const delTracks = historyJobs.find(j => j.id === "deleted_tracks");
                            if (delTracks) selectPlaylist(delTracks);
                        }
                    } catch (err) {
                        console.error("Permanent delete failed:", err);
                    }
                });
            } else {
                // Active Playlists action listeners
                row.querySelector(".row-play-btn").addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!isTrackDownloaded(item)) {
                        alert("This track is not downloaded yet.");
                        return;
                    }
                    const globalIndex = playlistItems.findIndex(t => t.id === item.id);
                    playTrack(item, playlistItems, globalIndex);
                });
                
                row.querySelector(".row-play-from-here-btn").addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!isTrackDownloaded(item)) {
                        alert("This track is not downloaded yet.");
                        return;
                    }
                    const globalIndex = playlistItems.findIndex(t => t.id === item.id);
                    const subQueue = playlistItems.slice(globalIndex);
                    playTrack(item, subQueue, 0);
                });

                const aiBtn = row.querySelector(".row-ai-btn");
                if (aiBtn) {
                    aiBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (!isTrackDownloaded(item)) {
                            alert("This track is not downloaded yet.");
                            return;
                        }
                        if (!currentPlaylistId) return;
                        logToTerminal(`[AI] ✨ Starting AI Instrumental generation for "${item.title}"...`);
                        try {
                            const res = await fetch(`/api/history/${currentPlaylistId}/items/${item.id}/ai-instrumental`, { method: "POST" });
                            if (res.ok) {
                                logToTerminal(`[AI] Generation running in background for "${item.title}". This will take several minutes. You can continue using the app.`);
                            } else {
                                const data = await res.json();
                                alert(`Failed to start AI generation: ${data.detail}`);
                            }
                        } catch (err) {
                            alert(`Failed to start AI generation: ${err.message}`);
                        }
                    });
                }

                const karaokeBtn = row.querySelector(".row-karaoke-btn");
                if (karaokeBtn) {
                    karaokeBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (!isTrackDownloaded(item)) {
                            alert("This track is not downloaded yet.");
                            return;
                        }
                        if (!currentPlaylistId) return;
                        logToTerminal(`[AI] 🎤 Starting Karaoke extraction for "${item.title}"...`);
                        try {
                            const res = await fetch(`/api/history/${currentPlaylistId}/items/${item.id}/ai-karaoke`, { method: "POST" });
                            if (res.ok) {
                                logToTerminal(`[AI] Karaoke extraction running in background for "${item.title}". This will take a couple of minutes.`);
                            } else {
                                const data = await res.json();
                                alert(`Failed to start Karaoke extraction: ${data.detail}`);
                            }
                        } catch (err) {
                            alert(`Failed to start Karaoke extraction: ${err.message}`);
                        }
                    });
                }

                row.querySelector(".row-add-playlist-btn").addEventListener("click", (e) => {
                    e.stopPropagation();
                    showAddToPlaylistMenu(item, e.currentTarget);
                });

                if (currentPlaylistId !== "all_downloads") {
                    row.querySelector(".row-delete-btn").addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Remove "${item.title}" from this playlist?`)) return;
                        try {
                            const res = await fetch(`/api/history/${currentPlaylistId}/tracks/${item.id}`, { method: "DELETE" });
                            if (res.ok) {
                                logToTerminal(`[System] Moved "${item.title}" to trash.`);
                                await loadSidebar();
                                const updatedJob = historyJobs.find(j => j.id === currentPlaylistId);
                                if (updatedJob) selectPlaylist(updatedJob);
                            }
                        } catch (err) {
                            console.error("Soft track delete failed:", err);
                        }
                    });
                }
            }

            // Double click fallback
            if (isPlayable) {
                row.addEventListener("dblclick", () => {
                    playLocalFile(item.title);
                });
            }
            
            playlistTableBody.appendChild(row);
        });
    }

    // Floating add-to-playlist dropdown helper
    function showAddToPlaylistMenu(item, buttonElement) {
        const existing = document.getElementById("addToPlaylistMenu");
        if (existing) existing.remove();
        
        const menu = document.createElement("div");
        menu.id = "addToPlaylistMenu";
        menu.style.position = "absolute";
        menu.style.background = "var(--card-bg)";
        menu.style.border = "1px solid var(--border-color)";
        menu.style.borderRadius = "8px";
        menu.style.padding = "0.5rem 0";
        menu.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
        menu.style.zIndex = "99999";
        menu.style.fontSize = "0.75rem";
        menu.style.minWidth = "160px";
        menu.style.backdropFilter = "blur(12px)";
        
        // Filter out virtual / deleted entries
        const validPlaylists = historyJobs.filter(job => !job.is_virtual && job.id !== "deleted_tracks" && !job.deleted);
        
        validPlaylists.forEach(playlist => {
            const opt = document.createElement("div");
            opt.className = "menu-item";
            opt.style.padding = "0.35rem 1rem";
            opt.style.cursor = "pointer";
            opt.style.color = "var(--text-primary)";
            opt.style.transition = "background 0.2s";
            opt.textContent = playlist.title;
            
            opt.addEventListener("mouseover", () => {
                opt.style.background = "rgba(255, 255, 255, 0.05)";
            });
            opt.addEventListener("mouseout", () => {
                opt.style.background = "transparent";
            });
            
            opt.addEventListener("click", () => {
                menu.remove();
                addTrackToPlaylist(item, playlist);
            });
            
            menu.appendChild(opt);
        });
        
        if (validPlaylists.length > 0) {
            const sep = document.createElement("div");
            sep.style.borderTop = "1px solid var(--border-color)";
            sep.style.margin = "0.25rem 0";
            menu.appendChild(sep);
        }
        
        const createOpt = document.createElement("div");
        createOpt.className = "menu-item";
        createOpt.style.padding = "0.35rem 1rem";
        createOpt.style.cursor = "pointer";
        createOpt.style.color = "var(--neon-blue)";
        createOpt.style.fontWeight = "bold";
        createOpt.textContent = "+ Create New Playlist...";
        
        createOpt.addEventListener("mouseover", () => {
            createOpt.style.background = "rgba(0, 242, 254, 0.08)";
        });
        createOpt.addEventListener("mouseout", () => {
            createOpt.style.background = "transparent";
        });
        
        createOpt.addEventListener("click", () => {
            menu.remove();
            createNewPlaylistWithTrack(item);
        });
        
        menu.appendChild(createOpt);
        
        document.body.appendChild(menu);
        
        const rect = buttonElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        menu.style.top = `${rect.bottom + scrollTop}px`;
        menu.style.left = `${rect.left + scrollLeft}px`;
        
        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== buttonElement) {
                menu.remove();
                document.removeEventListener("mousedown", closeHandler);
            }
        };
        document.addEventListener("mousedown", closeHandler);
    }

    async function addTrackToPlaylist(item, playlist) {
        const exists = playlist.items && playlist.items.some(t => t.id === item.id);
        if (exists) {
            if (!confirm(`"${item.title}" is already in playlist "${playlist.title}". Do you want to add it anyway?`)) {
                return;
            }
        }
        
        try {
            const res = await fetch(`/api/playlists/${playlist.id}/add-track`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item)
            });
            if (res.ok) {
                logToTerminal(`[System] Added "${item.title}" to playlist "${playlist.title}".`);
                await loadSidebar();
                if (currentPlaylistId === playlist.id) {
                    const updatedJob = historyJobs.find(j => j.id === playlist.id);
                    if (updatedJob) selectPlaylist(updatedJob);
                }
            } else {
                const data = await res.json();
                alert(`Failed to add track: ${data.detail}`);
            }
        } catch (e) {
            console.error("Add track failed:", e);
        }
    }

    async function createNewPlaylistWithTrack(item) {
        const name = prompt("Enter name for the new playlist:");
        if (!name || !name.trim()) return;
        
        try {
            const res = await fetch("/api/playlists/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: name.trim() })
            });
            if (res.ok) {
                const newPlaylist = await res.json();
                logToTerminal(`[System] Created new playlist "${newPlaylist.title}".`);
                await addTrackToPlaylist(item, newPlaylist);
            }
        } catch (e) {
            console.error("Create playlist failed:", e);
        }
    }

    async function playLocalFile(title) {
        const format = document.querySelector('input[name="format"]:checked')?.value || "audio";
        const downloadDir = downloadDirInput.value.trim();
        try {
            const res = await fetch("/api/play-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, format, download_dir: downloadDir })
            });
            if (!res.ok) {
                const data = await res.json();
                alert(`Playback failed: ${data.detail}`);
            }
        } catch (e) {
            alert(`Playback failed: ${e.message}`);
        }
    }

    function isTrackDownloaded(track) {
        // localItemStates only covers the playlist currently open in the grid;
        // for tracks of other playlists fall back to the track's own status.
        const state = localItemStates[track.id];
        const status = state ? state.status : track.status;
        const fileMissing = state && ("file_missing" in state) ? state.file_missing : track.file_missing;
        if (status === "skipped") return !fileMissing;
        return status === "completed";
    }

    // Grid checkbox selection operations
    headerCheckbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        const query = playlistSearch.value.toLowerCase().trim();
        const status = statusFilter.value;
        
        const filtered = playlistItems.filter(item => {
            const title = item.title.toLowerCase();
            const channel = item.uploader.toLowerCase();
            const state = localItemStates[item.id] || { status: "queued" };
            const itemStatus = state.status || "queued";
            
            const matchesText = title.includes(query) || channel.includes(query);
            const matchesStatus = (status === "all") || (itemStatus === status);
            return matchesText && matchesStatus;
        });

        filtered.forEach(item => {
            if (checked) {
                selectedItemIds.add(item.id);
            } else {
                selectedItemIds.delete(item.id);
            }
        });

        renderPlaylistTable(playlistItems);
        updateSelectionMeta();
    });

    selectAllBtn.addEventListener("click", () => {
        playlistItems.forEach(item => selectedItemIds.add(item.id));
        headerCheckbox.checked = true;
        renderPlaylistTable(playlistItems);
        updateSelectionMeta();
    });

    deselectAllBtn.addEventListener("click", () => {
        selectedItemIds.clear();
        headerCheckbox.checked = false;
        renderPlaylistTable(playlistItems);
        updateSelectionMeta();
    });

    function updateSelectionMeta() {
        const selectedCountNum = selectedItemIds.size;
        document.getElementById("selectedCount").textContent = selectedCountNum;
        document.getElementById("totalCount").textContent = playlistItems.length;
        downloadBtn.disabled = selectedCountNum === 0 || currentPlaylistId === "all_downloads" || currentPlaylistId === "deleted_tracks";
    }

    // Grid Filters
    playlistSearch.addEventListener("input", () => {
        currentPage = 1;
        renderPlaylistTable(playlistItems);
    });
    statusFilter.addEventListener("change", () => {
        currentPage = 1;
        renderPlaylistTable(playlistItems);
    });

    btnPrevPage.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderPlaylistTable(playlistItems);
        }
    });
    btnNextPage.addEventListener("click", () => {
        const query = playlistSearch.value.toLowerCase().trim();
        const status = statusFilter.value;
        const filteredCount = playlistItems.filter(item => {
            const title = item.title.toLowerCase();
            const channel = item.uploader.toLowerCase();
            const state = localItemStates[item.id] || { status: "queued" };
            const itemStatus = state.status || "queued";
            const matchesText = title.includes(query) || channel.includes(query);
            const matchesStatus = (status === "all") || (itemStatus === status);
            return matchesText && matchesStatus;
        }).length;
        
        const totalPages = Math.ceil(filteredCount / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            renderPlaylistTable(playlistItems);
        }
    });

    // Start download action
    downloadBtn.addEventListener("click", async () => {
        const selected = playlistItems.filter(item => selectedItemIds.has(item.id));
        if (selected.length === 0) return;

        const format = document.querySelector('input[name="format"]:checked').value;
        const quality = document.querySelector('input[name="quality"]:checked').value;
        const downloadDir = downloadDirInput.value.trim();
        const playlistTitleVal = playlistTitle.textContent;
        const playlistUrlVal = urlInput.value.trim();

        gridHud.classList.remove("hidden");
        hudJobTitle.textContent = "Queueing download...";
        
        selected.forEach(item => {
            localItemStates[item.id] = {
                status: "queued",
                percentage: 0.0,
                speed: "--",
                start_time: "--",
                end_time: "--",
                error_detail: ""
            };
        });
        renderPlaylistTable(playlistItems);

        try {
            const res = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: selected,
                    format,
                    quality,
                    playlist_title: playlistTitleVal,
                    playlist_url: playlistUrlVal,
                    skip_duplicates: true,
                    download_dir: downloadDir
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to queue download");
            }

            const resData = await res.json();
            hudJobTitle.textContent = playlistTitleVal;
            if (hudCurrentFile) hudCurrentFile.textContent = "";
            
            await loadSidebar();
            startProgressStream();
        } catch (err) {
            logToTerminal(`[System Error] ${err.message}`, true);
            hudJobTitle.textContent = `Error: ${err.message}`;
        }
    });

    // SSE progress subscription stream
    function startProgressStream() {
        if (currentEventSource) {
            currentEventSource.close();
        }

        currentEventSource = new EventSource("/api/progress");

        currentEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // Never force the HUD open while the server is idle (reconnects)
            if (data.status && data.status !== "idle") {
                gridHud.classList.remove("hidden");
            }

            if (data.status === "downloading") {
                hudJobTitle.textContent = data.playlist_title || `Job #${data.active_job_num}`;
                if (hudCurrentFile) hudCurrentFile.textContent = `↳ ${data.current_title}`;
                hudSpeed.textContent = data.speed;
                hudEta.textContent = data.eta;
            } else if (data.status === "completed") {
                hudJobTitle.textContent = `Completed: ${data.playlist_title || 'Job #' + data.active_job_num}`;
                if (hudCurrentFile) hudCurrentFile.textContent = "";
                hudSpeed.textContent = "--";
                hudEta.textContent = "--";
                loadSidebar();
            } else if (data.status === "failed") {
                hudJobTitle.textContent = `Failed: ${data.playlist_title || 'Job #' + data.active_job_num}`;
                if (hudCurrentFile) hudCurrentFile.textContent = "";
                hudSpeed.textContent = "--";
                hudEta.textContent = "--";
            }

            if (data.item_states) {
                let completedCount = 0;
                let successCount = 0; // completed/skipped only, same rule as the sidebar
                const totalCount = Object.keys(data.item_states).length;
                let triggerRedraw = false;

                Object.keys(data.item_states).forEach(id => {
                    const itemState = data.item_states[id];
                    const oldState = localItemStates[id] || {};
                    const isDone = (itemState.status === "completed" || itemState.status === "skipped" || itemState.status === "error");
                    const wasDone = (oldState.status === "completed" || oldState.status === "skipped" || oldState.status === "error");

                    if (isDone && !wasDone) {
                        triggerRedraw = true;
                    }

                    localItemStates[id] = itemState;
                    if (isDone) completedCount++;
                    if (itemState.status === "completed" || itemState.status === "skipped") successCount++;

                    const statusText = document.getElementById(`status-text-${id}`);
                    const fill = document.getElementById(`fill-${id}`);
                    const displayStatusStr = itemState.status === "skipped" ? "Downloaded" : itemState.status;
                    if (statusText) statusText.textContent = `${displayStatusStr} (${itemState.percentage}%)`;
                    if (fill) fill.style.width = `${itemState.percentage}%`;

                    const errCell = document.getElementById(`error-detail-${id}`);
                    if (errCell) {
                        errCell.textContent = itemState.error_detail || "";
                        errCell.title = itemState.error_detail || "";
                    }
                });

                // Show job-wide progress (matches the sidebar numbers); fall back
                // to session-queue counts for older payloads without the fields.
                if (typeof data.job_total_tracks === "number" && data.job_total_tracks > 0) {
                    hudProgressCount.textContent = `${(data.job_done_baseline || 0) + successCount} / ${data.job_total_tracks}`;
                } else {
                    hudProgressCount.textContent = `${completedCount} / ${totalCount}`;
                }
                if (triggerRedraw) {
                    renderPlaylistTable(playlistItems);
                    // Keep sidebar counts in sync with the HUD during long jobs
                    // (throttled: at most one refresh every 10s)
                    const now = Date.now();
                    if (!window._lastSidebarSyncAt || now - window._lastSidebarSyncAt > 10000) {
                        window._lastSidebarSyncAt = now;
                        loadSidebar();
                    }
                }
            }

            if (data.logs && data.logs.length > 0) {
                consoleLogs.innerHTML = "";
                data.logs.forEach(log => {
                    const p = document.createElement("p");
                    p.textContent = log;
                    if (log.startsWith("[System Error]") || log.startsWith("Error")) {
                        p.style.color = "var(--error)";
                    } else if (log.startsWith("Finished downloading")) {
                        p.style.color = "var(--success)";
                    } else if (log.startsWith("[Duplicate Skipped]")) {
                        p.style.color = "#fbbf24";
                    }
                    consoleLogs.appendChild(p);
                });
                consoleLogs.scrollTop = consoleLogs.scrollHeight;
            }

            if (data.status === "completed" || data.status === "failed") {
                currentEventSource.close();
                currentEventSource = null;
            }
        };
    }

    function generateShuffleOrder(tracks, currentTrackId = null) {
        let downloadedTracks = tracks.filter(t => isTrackDownloaded(t));
        if (downloadedTracks.length === 0) return [];
        
        let ids = downloadedTracks.map(t => t.id);
        
        // Fisher-Yates shuffle
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        
        // If currentTrackId is specified, place it at index 0
        if (currentTrackId) {
            const idx = ids.indexOf(currentTrackId);
            if (idx > -1) {
                ids.splice(idx, 1);
                ids.unshift(currentTrackId);
            }
        }
        
        return ids;
    }

    // Media Player Control state machine
    async function playTrack(track, queue, index, shuffleIndex = null, shuffleOrder = null) {
        if (!track) return;
        
        if (nextTrackTimeout) {
            clearTimeout(nextTrackTimeout);
            nextTrackTimeout = null;
        }
        if (nextTrackCountdownInterval) {
            clearInterval(nextTrackCountdownInterval);
            nextTrackCountdownInterval = null;
        }
        
        playQueue = queue || [track];
        currentTrackIndex = index !== undefined ? index : playQueue.findIndex(t => t.id === track.id);
        
        playerTrackTitle.textContent = track.title;
        playerTrackArtist.textContent = track.uploader || "Unknown";
        playerTrackThumb.src = track.thumbnail || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
        
        updateMediaSessionMetadata(track);
        
        // Handle AI Queue Auto-Apply
        const shouldApplyAI = (typeof aiQueueToggle !== 'undefined' && aiQueueToggle && aiQueueToggle.checked);
        const activeAIMode = window.isLiveMuteOn ? "mute" : (window.isInstrumentOn ? "instrument" : null);

        // Reset AI states
        window.isLiveMuteOn = false;
        window.isInstrumentOn = false;
        window.originalMediaUrl = null;
        if (typeof playerLiveMuteBtn !== 'undefined' && playerLiveMuteBtn) {
            playerLiveMuteBtn.style.color = "var(--text-primary)";
            playerLiveMuteBtn.style.textShadow = "none";
        }
        if (typeof playerInstrumentBtn !== 'undefined' && playerInstrumentBtn) {
            playerInstrumentBtn.style.color = "var(--text-primary)";
            playerInstrumentBtn.style.textShadow = "none";
        }
        
        const format = document.querySelector('input[name="format"]:checked')?.value || "audio";
        const downloadDir = downloadDirInput.value.trim();
        
        if (format === "video") {
            playerVideo.style.display = "block";
            playerAudioArtPanel.style.display = "none";
        } else {
            playerVideo.style.display = "none";
            playerAudioArtPanel.style.display = "flex";
        }
        
        if (playerStatusEq) {
            playerStatusEq.style.visibility = "hidden";
            playerStatusEq.classList.remove("playing");
        }
        if (playerStatusText) playerStatusText.textContent = "Loading...";
        
        try {
            const streamUrl = `/api/media/stream?video_url=${encodeURIComponent(track.url)}&title=${encodeURIComponent(track.title)}&format=${format}&download_dir=${encodeURIComponent(downloadDir)}`;
            
            playerVideo.src = streamUrl;
            playerVideo.load();
            
            await playerVideo.play();
            isPlaying = true;
            updatePlayBtnUI();
            
            if (playerStatusEq) {
                playerStatusEq.style.visibility = "visible";
                playerStatusEq.classList.add("playing");
            }
            if (playerStatusText) playerStatusText.textContent = "Playing";

            savePlaybackPosition(track.id, shuffleIndex, shuffleOrder);

            if (shouldApplyAI && activeAIMode) {
                if (activeAIMode === "mute" && typeof playerLiveMuteBtn !== 'undefined' && playerLiveMuteBtn) {
                    playerLiveMuteBtn.click();
                } else if (activeAIMode === "instrument" && typeof playerInstrumentBtn !== 'undefined' && playerInstrumentBtn) {
                    playerInstrumentBtn.click();
                }
            }
        } catch (err) {
            console.error("Playback failed:", err);
            if (playerStatusEq) {
                playerStatusEq.style.visibility = "hidden";
                playerStatusEq.classList.remove("playing");
            }
            if (playerStatusText) playerStatusText.textContent = "Error Playing File";
            isPlaying = false;
            updatePlayBtnUI();
        }
    }

    async function savePlaybackPosition(trackId, shuffleIndex = null, shuffleOrder = null) {
        if (!currentPlaylistId || currentPlaylistId === "all_downloads" || currentPlaylistId === "deleted_tracks") return;
        
        const job = historyJobs.find(j => j.id === currentPlaylistId) || {};
        
        let finalShuffleOrder = shuffleOrder;
        let finalShuffleIndex = shuffleIndex;
        
        if (isShuffle) {
            if (!finalShuffleOrder) {
                finalShuffleOrder = job.shuffle_order || [];
                if (finalShuffleOrder.length === 0 || !finalShuffleOrder.includes(trackId)) {
                    finalShuffleOrder = generateShuffleOrder(playQueue, trackId);
                    finalShuffleIndex = 0;
                } else {
                    finalShuffleIndex = finalShuffleOrder.indexOf(trackId);
                }
            }
        } else {
            finalShuffleOrder = null;
            finalShuffleIndex = null;
        }
        
        const payload = {
            track_id: trackId,
            shuffle_mode: isShuffle,
            shuffle_order: finalShuffleOrder,
            shuffle_index: finalShuffleIndex
        };
        
        try {
            await fetch(`/api/history/${currentPlaylistId}/last-played`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (job) {
                job.last_played_track_id = trackId;
                job.last_played_shuffle = isShuffle;
                job.shuffle_order = payload.shuffle_order;
                job.shuffle_index = payload.shuffle_index;
            }
        } catch (e) {
            console.error("Playback position save failed:", e);
        }
    }

    function updatePlayBtnUI() {
        const svg = document.getElementById("playIconSvg");
        if (isPlaying) {
            svg.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
        } else {
            svg.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
        }
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }

    // Media Player DOM Listeners
    playerPlayPauseBtn.addEventListener("click", () => {
        if (!playerVideo.src) return;
        if (isPlaying) {
            // Pausing by hand hands control back to the user: the running
            // schedule is cancelled instead of resuming on the next tick.
            if (activeSchedule) {
                stopScheduledPlayback("paused manually");
                return;
            }
            playerVideo.pause();
            isPlaying = false;
        } else {
            playerVideo.play();
            isPlaying = true;
        }
        updatePlayBtnUI();
    });

    playerNextBtn.addEventListener("click", playNextTrack);
    playerPrevBtn.addEventListener("click", playPrevTrack);

    if (playerKaraokeBtn) {
        playerKaraokeBtn.addEventListener("click", async () => {
            if (currentTrackIndex < 0 || currentTrackIndex >= playQueue.length) return;
            const item = playQueue[currentTrackIndex];
            // Since playQueue might not store the playlist ID, we use currentPlayingPlaylistId if available
            // but wait, playQueue could be from "all_downloads" or search. We can just use "all_downloads" 
            // as the fallback playlist ID because the backend now supports looking it up!
            const playlistId = typeof currentPlayingPlaylistId !== "undefined" ? currentPlayingPlaylistId : "all_downloads";
            
            logToTerminal(`[AI] 🎤 Starting Karaoke extraction for currently playing track: "${item.title}"...`);
            try {
                const res = await fetch(`/api/history/${playlistId}/items/${item.id}/ai-karaoke`, { method: "POST" });
                if (res.ok) {
                    logToTerminal(`[AI] Karaoke extraction running in background for "${item.title}".`);
                } else {
                    const data = await res.json();
                    alert(`Failed to start Karaoke extraction: ${data.detail}`);
                }
            } catch (err) {
                alert(`Failed to start Karaoke extraction: ${err.message}`);
            }
        });
    }

    // High-Quality AI Mute (Streamed Demucs extraction instead of Real-time Phase Cancellation)
    if (typeof window.isLiveMuteOn === 'undefined') window.isLiveMuteOn = false;
    if (typeof window.originalMediaUrl === 'undefined') window.originalMediaUrl = null;
    window.isInstrumentOn = false;
    const playerInstrumentBtn = document.getElementById("playerInstrumentBtn");
    const aiQueueToggle = document.getElementById("aiQueueToggle");

    if (playerLiveMuteBtn) {
        playerLiveMuteBtn.addEventListener("click", async () => {
            if (!playerVideo || currentTrackIndex < 0 || currentTrackIndex >= playQueue.length) return;
            
            const item = playQueue[currentTrackIndex];
            const playlistId = typeof currentPlayingPlaylistId !== "undefined" ? currentPlayingPlaylistId : "all_downloads";

            // If Instrument is on, turn it off first to revert stream
            if (window.isInstrumentOn && playerInstrumentBtn) {
                window.isInstrumentOn = false;
                playerInstrumentBtn.style.color = "var(--text-primary)";
                playerInstrumentBtn.style.textShadow = "none";
                if (window.originalMediaUrl) {
                    playerVideo.src = window.originalMediaUrl;
                    window.originalMediaUrl = null;
                }
            }

            // Toggle state
            window.isLiveMuteOn = !window.isLiveMuteOn;
            
            if (window.isLiveMuteOn) {
                // Turn ON High-Quality Mute
                playerLiveMuteBtn.style.color = "#ffb6c1"; // highlight pink
                playerLiveMuteBtn.style.textShadow = "0 0 10px rgba(255,182,193,0.5)";
                logToTerminal(`[AI] ✨ Live Voice Mute ON: Processing high-quality separation for "${item.title}"... This may take a minute.`);
                showAIStatus(`[AI] ✨ Processing Live Voice Mute for "${item.title}"...`);
                
                const originalInnerHTML = playerLiveMuteBtn.innerHTML;
                playerLiveMuteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V2"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>';

                try {
                    const res = await fetch(`/api/history/${playlistId}/items/${item.id}/ai-mute-process`, { method: "POST" });
                    playerLiveMuteBtn.innerHTML = originalInnerHTML; // restore icon
                    
                    if (res.ok) {
                        const data = await res.json();
                        // Save original URL to revert later
                        if (!window.originalMediaUrl) window.originalMediaUrl = playerVideo.src;
                        
                        // Swap audio stream seamlessly
                        const currentTime = playerVideo.currentTime;
                        const isPlaying = !playerVideo.paused;
                        
                        playerVideo.src = data.url;
                        if (isPlaying) playerVideo.play();
                        
                        logToTerminal("[AI] ✨ High-Quality Vocal Mute stream loaded successfully. It will play from the beginning.");
                        showAIStatus(""); // Clear status
                    } else {
                        const data = await res.json();
                        alert(`Failed to process vocal mute: ${data.detail}`);
                        showAIStatus("");
                        // Revert UI
                        window.isLiveMuteOn = false;
                        playerLiveMuteBtn.style.color = "var(--text-primary)";
                        playerLiveMuteBtn.style.textShadow = "none";
                        logToTerminal("[AI] 🎙️ Live Voice Mute Error.");
                    }
                } catch (err) {
                    playerLiveMuteBtn.innerHTML = originalInnerHTML;
                    alert(`Failed to process vocal mute: ${err.message}`);
                    showAIStatus("");
                    window.isLiveMuteOn = false;
                    playerLiveMuteBtn.style.color = "var(--text-primary)";
                    playerLiveMuteBtn.style.textShadow = "none";
                }

            } else {
                // Turn OFF Mute, revert to original stream
                playerLiveMuteBtn.style.color = "var(--text-primary)"; // revert
                playerLiveMuteBtn.style.textShadow = "none";
                logToTerminal("[AI] 🎙️ Live Voice Mute OFF: Reverting to original track.");
                
                if (window.originalMediaUrl) {
                    const currentTime = playerVideo.currentTime;
                    const isPlaying = !playerVideo.paused;
                    playerVideo.src = window.originalMediaUrl;
                    playerVideo.currentTime = currentTime;
                    if (isPlaying) playerVideo.play();
                    window.originalMediaUrl = null;
                }
            }
        });
    }

    if (playerInstrumentBtn) {
        playerInstrumentBtn.addEventListener("click", async () => {
            if (!playerVideo || currentTrackIndex < 0 || currentTrackIndex >= playQueue.length) return;
            
            const item = playQueue[currentTrackIndex];
            const playlistId = typeof currentPlayingPlaylistId !== "undefined" ? currentPlayingPlaylistId : "all_downloads";

            // If Live Mute is on, turn it off first
            if (window.isLiveMuteOn && playerLiveMuteBtn) {
                window.isLiveMuteOn = false;
                playerLiveMuteBtn.style.color = "var(--text-primary)";
                playerLiveMuteBtn.style.textShadow = "none";
                if (window.originalMediaUrl) {
                    playerVideo.src = window.originalMediaUrl;
                    window.originalMediaUrl = null;
                }
            }

            // Toggle state
            window.isInstrumentOn = !window.isInstrumentOn;
            
            if (window.isInstrumentOn) {
                playerInstrumentBtn.style.color = "#a020f0"; // highlight purple
                playerInstrumentBtn.style.textShadow = "0 0 10px rgba(160,32,240,0.5)";
                logToTerminal(`[AI] 🎷 Voice-to-Instrument ON: Synthesizing MIDI replacement for "${item.title}"... This may take a minute.`);
                showAIStatus(`[AI] 🎷 Synthesizing instrument for "${item.title}"...`);
                
                const originalInnerHTML = playerInstrumentBtn.innerHTML;
                playerInstrumentBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V2"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>';

                try {
                    const res = await fetch(`/api/history/${playlistId}/items/${item.id}/ai-instrument-process`, { method: "POST" });
                    playerInstrumentBtn.innerHTML = originalInnerHTML;
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (!window.originalMediaUrl) window.originalMediaUrl = playerVideo.src;
                        
                        const currentTime = playerVideo.currentTime;
                        const isPlaying = !playerVideo.paused;
                        
                        playerVideo.src = data.url;
                        if (isPlaying) playerVideo.play();
                        
                        logToTerminal("[AI] 🎷 Instrument stream loaded successfully. It will play from the beginning.");
                        showAIStatus("");
                    } else {
                        const data = await res.json();
                        alert(`Failed to process instrument: ${data.detail}`);
                        showAIStatus("");
                        window.isInstrumentOn = false;
                        playerInstrumentBtn.style.color = "var(--text-primary)";
                        playerInstrumentBtn.style.textShadow = "none";
                        logToTerminal("[AI] 🎷 Voice-to-Instrument Error.");
                    }
                } catch (err) {
                    playerInstrumentBtn.innerHTML = originalInnerHTML;
                    alert(`Failed to process instrument: ${err.message}`);
                    window.isInstrumentOn = false;
                    playerInstrumentBtn.style.color = "var(--text-primary)";
                    playerInstrumentBtn.style.textShadow = "none";
                }
            } else {
                playerInstrumentBtn.style.color = "var(--text-primary)";
                playerInstrumentBtn.style.textShadow = "none";
                logToTerminal("[AI] 🎷 Voice-to-Instrument OFF: Reverting to original track.");
                
                if (window.originalMediaUrl) {
                    const currentTime = playerVideo.currentTime;
                    const isPlaying = !playerVideo.paused;
                    playerVideo.src = window.originalMediaUrl;
                    playerVideo.currentTime = currentTime;
                    if (isPlaying) playerVideo.play();
                    window.originalMediaUrl = null;
                }
            }
        });
    }


    function playNextTrack() {
        if (playQueue.length === 0) return;
        
        if (isShuffle) {
            const job = historyJobs.find(j => j.id === currentPlaylistId) || {};
            let order = job.shuffle_order || [];
            let sIdx = job.shuffle_index !== undefined ? job.shuffle_index : -1;
            
            if (order.length === 0) {
                const currentTrack = playQueue[currentTrackIndex];
                order = generateShuffleOrder(playQueue, currentTrack ? currentTrack.id : null);
                sIdx = 0;
            } else {
                sIdx++;
            }
            
            if (sIdx >= order.length) {
                sIdx = 0; // Loop around
            }
            
            const nextTrackId = order[sIdx];
            const nextTrack = playQueue.find(t => t.id === nextTrackId);
            
            if (nextTrack) {
                const origIndex = playQueue.findIndex(t => t.id === nextTrackId);
                playTrack(nextTrack, playQueue, origIndex, sIdx, order);
            } else {
                logToTerminal("[Player] Next track not found in shuffle queue.");
                resetPlayerStatusIdle();
            }
        } else {
            let startIndex = currentTrackIndex;
            let nextIndex = currentTrackIndex;
            let found = false;
            
            for (let i = 1; i <= playQueue.length; i++) {
                nextIndex = (startIndex + i) % playQueue.length;
                if (isTrackDownloaded(playQueue[nextIndex])) {
                    found = true;
                    break;
                }
            }
            
            if (found) {
                playTrack(playQueue[nextIndex], playQueue, nextIndex);
            } else {
                logToTerminal("[Player] No downloaded tracks in queue to skip to.");
                resetPlayerStatusIdle();
            }
        }
    }

    // Clears any leftover "Pause (Ns)..." text when playback cannot continue
    function resetPlayerStatusIdle() {
        if (playerStatusEq) {
            playerStatusEq.style.visibility = "hidden";
            playerStatusEq.classList.remove("playing");
        }
        if (playerStatusText) playerStatusText.textContent = "Ready";
        isPlaying = false;
        updatePlayBtnUI();
    }

    function playPrevTrack() {
        if (playQueue.length === 0) return;
        
        if (isShuffle) {
            const job = historyJobs.find(j => j.id === currentPlaylistId) || {};
            let order = job.shuffle_order || [];
            let sIdx = job.shuffle_index !== undefined ? job.shuffle_index : -1;
            
            if (order.length === 0) {
                const currentTrack = playQueue[currentTrackIndex];
                order = generateShuffleOrder(playQueue, currentTrack ? currentTrack.id : null);
                sIdx = 0;
            } else {
                sIdx--;
            }
            
            if (sIdx < 0) {
                sIdx = order.length - 1; // Loop back
            }
            
            const prevTrackId = order[sIdx];
            const prevTrack = playQueue.find(t => t.id === prevTrackId);
            
            if (prevTrack) {
                const origIndex = playQueue.findIndex(t => t.id === prevTrackId);
                playTrack(prevTrack, playQueue, origIndex, sIdx, order);
            } else {
                logToTerminal("[Player] Previous track not found in shuffle queue.");
            }
        } else {
            let startIndex = currentTrackIndex;
            let prevIndex = currentTrackIndex;
            let found = false;
            
            for (let i = 1; i <= playQueue.length; i++) {
                prevIndex = (startIndex - i + playQueue.length) % playQueue.length;
                if (isTrackDownloaded(playQueue[prevIndex])) {
                    found = true;
                    break;
                }
            }
            
            if (found) {
                playTrack(playQueue[prevIndex], playQueue, prevIndex);
            } else {
                logToTerminal("[Player] No downloaded tracks in queue to skip to.");
            }
        }
    }

    playerVideo.addEventListener("ended", () => {
        // A single-file schedule plays its track once, then stops - without
        // this it would loop, because a one-track queue wraps around.
        if (activeSchedule && activeSchedule.target_type === "track") {
            stopScheduledPlayback("single file finished");
            return;
        }
        if (isRepeat) {
            playerVideo.currentTime = 0;
            playerVideo.play();
        } else {
            if (nextTrackTimeout) {
                clearTimeout(nextTrackTimeout);
                nextTrackTimeout = null;
            }
            if (nextTrackCountdownInterval) {
                clearInterval(nextTrackCountdownInterval);
                nextTrackCountdownInterval = null;
            }
            
            const pauseInput = document.getElementById("playerPauseSeconds");
            const pauseSecs = pauseInput ? parseInt(pauseInput.value) : 5;
            
            if (pauseSecs > 0) {
                let count = pauseSecs;
                if (playerStatusEq) {
                    playerStatusEq.style.visibility = "hidden";
                    playerStatusEq.classList.remove("playing");
                }
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
                    if (nextTrackCountdownInterval) {
                        clearInterval(nextTrackCountdownInterval);
                        nextTrackCountdownInterval = null;
                    }
                    try {
                        playNextTrack();
                    } catch (e) {
                        console.error("Auto-advance failed:", e);
                        resetPlayerStatusIdle();
                    }
                }, pauseSecs * 1000);
            } else {
                playNextTrack();
            }
        }
    });

    // Time progress trackers: a requestAnimationFrame loop while playing keeps
    // the seek ball moving smoothly (timeupdate alone only fires ~4x/s).
    let progressRafId = null;
    function updateProgressUI() {
        if (playerVideo.duration) {
            playerProgressBar.value = (playerVideo.currentTime / playerVideo.duration) * 100;
            playerCurrentTime.textContent = formatDuration(playerVideo.currentTime);
            playerTotalTime.textContent = formatDuration(playerVideo.duration);
            updateMediaSessionPositionState();
        }
    }
    function progressLoop() {
        updateProgressUI();
        if (!playerVideo.paused && !playerVideo.ended) {
            progressRafId = requestAnimationFrame(progressLoop);
        } else {
            progressRafId = null;
        }
    }
    playerVideo.addEventListener("play", () => {
        if (progressRafId) cancelAnimationFrame(progressRafId);
        progressRafId = requestAnimationFrame(progressLoop);
    });
    // Fallback for paused-state seeks and metadata loads
    playerVideo.addEventListener("timeupdate", updateProgressUI);

    playerProgressBar.addEventListener("input", (e) => {
        if (playerVideo.duration) {
            playerVideo.currentTime = (e.target.value / 100) * playerVideo.duration;
        }
    });

    playerShuffleBtn.addEventListener("click", () => {
        isShuffle = !isShuffle;
        playerShuffleBtn.classList.toggle("active", isShuffle);
        
        const job = historyJobs.find(j => j.id === currentPlaylistId);
        if (isShuffle) {
            const currentTrack = playQueue[currentTrackIndex];
            const order = generateShuffleOrder(playQueue, currentTrack ? currentTrack.id : null);
            if (job) {
                job.shuffle_order = order;
                job.shuffle_index = 0;
            }
            if (currentTrack) {
                savePlaybackPosition(currentTrack.id, 0, order);
            }
        } else {
            if (job) {
                job.shuffle_order = null;
                job.shuffle_index = null;
            }
            const currentTrack = playQueue[currentTrackIndex];
            if (currentTrack) {
                savePlaybackPosition(currentTrack.id, null, null);
            }
        }
    });

    playerRepeatBtn.addEventListener("click", () => {
        isRepeat = !isRepeat;
        playerRepeatBtn.classList.toggle("active", isRepeat);
    });

    // Volume controllers
    playerVolumeSlider.addEventListener("input", (e) => {
        playerVideo.volume = e.target.value / 100;
        isMuted = (playerVideo.volume === 0);
    });

    playerVolumeBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        if (isMuted) {
            lastVolume = playerVolumeSlider.value;
            playerVideo.volume = 0;
            playerVolumeSlider.value = 0;
            playerVolumeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v6a3 3 0 0 0 3 3h3.58l4.42 4.42V12M22 9.42A9 9 0 0 0 9.42 22"/></svg>`;
        } else {
            playerVideo.volume = lastVolume / 100;
            playerVolumeSlider.value = lastVolume;
            playerVolumeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
        }
    });

    // Maximize Video toggle overlay (YouTube style overlay controls)
    let fullscreenTimeout = null;
    const playerControlsContainer = document.getElementById("playerControlsContainer");
    
    playerMaximizeBtn.addEventListener("click", () => {
        isMaximized = !isMaximized;
        if (isMaximized) {
            playerControlsContainer.classList.add("maximized");
            playerMaximizeBtn.title = "Minimize Player";
            playerMaximizeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>`;
            
            setupFullscreenAutoHide();
        } else {
            playerControlsContainer.classList.remove("maximized");
            playerControlsContainer.classList.remove("idle");
            playerMaximizeBtn.title = "Maximize Player";
            playerMaximizeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
            
            if (fullscreenTimeout) {
                clearTimeout(fullscreenTimeout);
                fullscreenTimeout = null;
            }
        }
    });

    function setupFullscreenAutoHide() {
        if (fullscreenTimeout) clearTimeout(fullscreenTimeout);
        playerControlsContainer.addEventListener("mousemove", handleFullscreenMouseMove);
    }

    function handleFullscreenMouseMove() {
        if (!isMaximized) {
            playerControlsContainer.removeEventListener("mousemove", handleFullscreenMouseMove);
            return;
        }
        
        playerControlsContainer.classList.remove("idle");
        clearTimeout(fullscreenTimeout);
        
        fullscreenTimeout = setTimeout(() => {
            if (isMaximized && isPlaying) {
                playerControlsContainer.classList.add("idle");
            }
        }, 3000);
    }

    // Column resizing handles injection helper
    function initResizableColumns() {
        const table = document.querySelector(".playlist-table-wrapper table");
        if (!table) return;
        
        const row = table.querySelector("thead tr");
        const cols = row ? row.children : [];
        
        for (let i = 0; i < cols.length; i++) {
            if (i < 2) continue; // Don't resize checkbox and index columns
            
            let resizer = cols[i].querySelector(".col-resizer");
            if (!resizer) {
                resizer = document.createElement("div");
                resizer.className = "col-resizer";
                cols[i].appendChild(resizer);
                cols[i].style.position = "relative";
                setupResizerEvents(resizer, cols[i]);
            }
        }
    }

    function setupResizerEvents(resizer, col) {
        let x = 0;
        let w = 0;
        
        const mouseMoveHandler = (e) => {
            const dx = e.clientX - x;
            const newWidth = Math.max(45, w + dx);
            col.style.width = `${newWidth}px`;
            col.style.minWidth = `${newWidth}px`;
            col.style.maxWidth = `${newWidth}px`;
        };
        
        const mouseUpHandler = () => {
            document.removeEventListener("mousemove", mouseMoveHandler);
            document.removeEventListener("mouseup", mouseUpHandler);
            resizer.classList.remove("resizing");
        };
        
        resizer.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            x = e.clientX;
            const styles = window.getComputedStyle(col);
            w = parseInt(styles.width, 10);
            
            resizer.classList.add("resizing");
            document.addEventListener("mousemove", mouseMoveHandler);
            document.addEventListener("mouseup", mouseUpHandler);
        });
    }

    // Analyze YouTube link input
    analyzeBtn.addEventListener("click", analyzeLink);
    urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") analyzeLink();
    });

    async function analyzeLink() {
        const url = urlInput.value.trim();
        if (!url) {
            showError("Please paste a valid YouTube video or playlist URL first.");
            return;
        }

        hideError();
        analyzeBtn.disabled = true;
        analyzeSpinner.classList.remove("hidden");
        logToTerminal(`[System] Fetching playlist metadata from YouTube...`);

        try {
            const res = await fetch("/api/fetch-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Link extraction failed.");
            }

            const data = await res.json();
            playlistItems = data.entries || [];
            playlistTitle.textContent = data.title || "YouTube Playlist";
            playlistMetaInfo.textContent = `${playlistItems.length} tracks fetched from YouTube. Selection ready.`;

            localItemStates = {};
            selectedItemIds.clear();
            currentPage = 1;

            playlistItems.forEach(item => {
                localItemStates[item.id] = {
                    status: "queued",
                    percentage: 0.0,
                    speed: "--",
                    start_time: "--",
                    end_time: "--",
                    error_detail: ""
                };
                selectedItemIds.add(item.id);
            });

            playQueue = playlistItems;
            currentTrackIndex = 0;

            renderPlaylistTable(playlistItems);
            updateSelectionMeta();
            logToTerminal(`[System] Metadata extraction complete. Selected ${playlistItems.length} items.`);

        } catch (err) {
            showError(err.message);
            logToTerminal(`[Error] Metadata extraction failed: ${err.message}`, true);
        } finally {
            analyzeBtn.disabled = false;
            analyzeSpinner.classList.add("hidden");
        }
    }

    // Default download directory config load
    async function loadDefaultDir() {
        try {
            const res = await fetch("/api/settings/dir");
            const data = await res.json();
            downloadDirInput.value = data.download_dir;
        } catch (e) {
            console.error("Failed to load default download dir settings:", e);
        }
    }

    browseDirBtn.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/settings/browse", { method: "POST" });
            const data = await res.json();
            if (data.download_dir) {
                downloadDirInput.value = data.download_dir;
            }
        } catch (e) {
            console.error("Directory browse error:", e);
        }
    });

    openFolderBtn.addEventListener("click", async () => {
        const downloadDir = downloadDirInput.value.trim();
        try {
            const res = await fetch("/api/open-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ download_dir: downloadDir })
            });
            if (!res.ok) {
                const data = await res.json();
                alert(`Error opening folder: ${data.detail}`);
            }
        } catch (e) {
            alert(`Error opening folder: ${e.message}`);
        }
    });

    // YouTube player keyboard shortcuts listener
    document.addEventListener("keydown", (e) => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "SELECT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
            return;
        }

        let handled = false;
        const key = e.key.toLowerCase();
        
        switch (key) {
            case " ":
            case "k":
                playerPlayPauseBtn.click();
                handled = true;
                break;
            case "j":
                if (playerVideo.duration) {
                    playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 10);
                }
                handled = true;
                break;
            case "l":
                if (playerVideo.duration) {
                    playerVideo.currentTime = Math.min(playerVideo.duration, playerVideo.currentTime + 10);
                }
                handled = true;
                break;
            case "arrowleft":
                if (playerVideo.duration) {
                    playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 5);
                }
                handled = true;
                break;
            case "arrowright":
                if (playerVideo.duration) {
                    playerVideo.currentTime = Math.min(playerVideo.duration, playerVideo.currentTime + 5);
                }
                handled = true;
                break;
            case "arrowup":
                playerVolumeSlider.value = Math.min(100, parseInt(playerVolumeSlider.value) + 5);
                playerVolumeSlider.dispatchEvent(new Event("input"));
                handled = true;
                break;
            case "arrowdown":
                playerVolumeSlider.value = Math.max(0, parseInt(playerVolumeSlider.value) - 5);
                playerVolumeSlider.dispatchEvent(new Event("input"));
                handled = true;
                break;
            case "m":
                playerVolumeBtn.click();
                handled = true;
                break;
            case "f":
                playerMaximizeBtn.click();
                handled = true;
                break;
            case "n":
                if (e.shiftKey) {
                    playNextTrack();
                    handled = true;
                }
                break;
            case "p":
                if (e.shiftKey) {
                    playPrevTrack();
                    handled = true;
                }
                break;
        }

        if (e.key >= "0" && e.key <= "9") {
            if (playerVideo.duration) {
                const pct = parseInt(e.key) * 10;
                playerVideo.currentTime = (pct / 100) * playerVideo.duration;
                handled = true;
            }
        }

        if (handled) {
            e.preventDefault();
        }
    });

    // ======================= Auto Play Schedule =======================
    // Playback entries that start and stop the normal player automatically.
    // Nothing here duplicates playback logic: it drives selectPlaylist(),
    // playTrack(), generateShuffleOrder() and the existing player element.

    let scheduleEntries = [];
    let activeSchedule = null;       // entry currently driving playback
    let activeScheduleEndsAt = null; // Date the active entry stops at
    let editingScheduleId = null;

    const schedulerModal = document.getElementById("schedulerModal");
    const scheduleList = document.getElementById("scheduleList");
    const scheduleEditor = document.getElementById("scheduleEditor");
    const schedPlaylist = document.getElementById("schedPlaylist");
    const schedTrack = document.getElementById("schedTrack");
    const schedTrackRow = document.getElementById("schedTrackRow");
    const schedModeRow = document.getElementById("schedModeRow");
    const schedRepeat = document.getElementById("schedRepeat");
    const schedDate = document.getElementById("schedDate");
    const schedDaysRow = document.getElementById("schedDaysRow");
    const schedStart = document.getElementById("schedStart");
    const schedEnd = document.getElementById("schedEnd");
    const schedTitle = document.getElementById("schedTitle");
    const scheduleFormError = document.getElementById("scheduleFormError");
    const autoplayActive = document.getElementById("autoplayActive");
    const autoplayActiveText = document.getElementById("autoplayActiveText");
    const autoplayActiveSub = document.getElementById("autoplayActiveSub");
    const autoplayUpcoming = document.getElementById("autoplayUpcoming");

    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    // --- date/time helpers (all local time; 0 = Monday) ---
    const dayIndex = (d) => (d.getDay() + 6) % 7;
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    function atTime(baseDate, hhmm) {
        const [h, m] = (hhmm || "00:00").split(":").map(Number);
        const d = new Date(baseDate);
        d.setHours(h || 0, m || 0, 0, 0);
        return d;
    }

    // An end time earlier than the start time means the entry runs past midnight
    function windowForDay(entry, dayDate) {
        const start = atTime(dayDate, entry.start_time);
        let end = atTime(dayDate, entry.end_time);
        if (end <= start) end = new Date(end.getTime() + 86400000);
        return { start, end, key: `${toDateStr(dayDate)}T${entry.start_time}` };
    }

    function entryAppliesOn(entry, dayDate) {
        if (entry.repeat === "daily") return true;
        if (entry.repeat === "weekly") return (entry.days || []).includes(dayIndex(dayDate));
        if (entry.repeat === "once") return entry.date === toDateStr(dayDate);
        return false;
    }

    // The window containing `now`, if any (checks yesterday too, for overnight)
    function currentOccurrence(entry, now) {
        for (const offset of [0, -1]) {
            const day = new Date(now);
            day.setDate(day.getDate() + offset);
            if (!entryAppliesOn(entry, day)) continue;
            const w = windowForDay(entry, day);
            if (now >= w.start && now < w.end) return w;
        }
        return null;
    }

    function nextOccurrence(entry, now) {
        for (let offset = 0; offset <= 366; offset++) {
            const day = new Date(now);
            day.setDate(day.getDate() + offset);
            if (!entryAppliesOn(entry, day)) continue;
            const w = windowForDay(entry, day);
            if (w.start > now) return w;
        }
        return null;
    }

    function describeEntry(entry) {
        const job = historyJobs.find(j => j.id === entry.playlist_id);
        const where = job ? job.title : "(missing playlist)";
        const what = entry.target_type === "track"
            ? `${entry.track_title || "Single file"} — from ${where}`
            : `${where} — ${entry.mode === "shuffle" ? "shuffle" : "in order"}`;
        let when;
        if (entry.repeat === "daily") when = "Daily";
        else if (entry.repeat === "weekly") when = (entry.days || []).slice().sort().map(d => DAY_LABELS[d]).join(", ") || "Weekly";
        else when = entry.date || "Once";
        return { what, when: `${when} · ${entry.start_time}–${entry.end_time}` };
    }

    async function loadSchedules() {
        try {
            const res = await fetch("/api/schedules");
            scheduleEntries = await res.json();
        } catch (e) {
            console.error("Failed to load schedules:", e);
            scheduleEntries = [];
        }
        renderScheduleList();
        renderAutoplayPanel();
    }

    // --- the engine: one tick a second ---
    async function scheduleTick() {
        const now = new Date();

        if (activeSchedule && activeScheduleEndsAt && now >= activeScheduleEndsAt) {
            stopScheduledPlayback("end time reached");
        }

        // Never fire before the playlists are loaded, otherwise a startup race
        // would burn the occurrence on a "playlist not found" error.
        if (!activeSchedule && historyJobs.length > 0) {
            for (const entry of scheduleEntries) {
                if (!entry.enabled) continue;
                const occ = currentOccurrence(entry, now);
                if (occ && entry.last_fired !== occ.key) {
                    await startScheduledPlayback(entry, occ);
                    break;
                }
            }
        }

        renderAutoplayPanel(now);
    }

    async function startScheduledPlayback(entry, occ) {
        // Mark the occurrence consumed first, so a failure below (or a manual
        // stop afterwards) can never make it retrigger in the same window.
        entry.last_fired = occ.key;
        fetch(`/api/schedules/${entry.id}/fired`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ last_fired: occ.key })
        }).catch(() => { /* retriggering is already blocked in memory */ });

        const job = historyJobs.find(j => j.id === entry.playlist_id);
        if (!job) {
            logToTerminal(`[Auto Play] "${entry.title}" skipped — its playlist no longer exists.`, true);
            return;
        }

        activeSchedule = entry;
        activeScheduleEndsAt = occ.end;
        logToTerminal(`[Auto Play] Starting "${entry.title}" — stops at ${entry.end_time}.`);

        await selectPlaylist(job);

        const playable = playlistItems.filter(t => isTrackDownloaded(t));
        if (playable.length === 0) {
            logToTerminal(`[Auto Play] "${entry.title}" has no downloaded tracks to play.`, true);
            activeSchedule = null;
            activeScheduleEndsAt = null;
            return;
        }

        if (entry.target_type === "track") {
            const track = playlistItems.find(t => t.id === entry.track_id);
            if (!track || !isTrackDownloaded(track)) {
                logToTerminal(`[Auto Play] "${entry.title}" — the scheduled file is not downloaded.`, true);
                activeSchedule = null;
                activeScheduleEndsAt = null;
                return;
            }
            isShuffle = false;
            playerShuffleBtn.classList.remove("active");
            await playTrack(track, [track], 0);
        } else if (entry.mode === "shuffle") {
            isShuffle = true;
            playerShuffleBtn.classList.add("active");
            const order = generateShuffleOrder(playlistItems);
            const firstId = order[0];
            const first = playlistItems.find(t => t.id === firstId);
            await playTrack(first, playlistItems, playlistItems.findIndex(t => t.id === firstId), 0, order);
        } else {
            isShuffle = false;
            playerShuffleBtn.classList.remove("active");
            const first = playable[0];
            await playTrack(first, playlistItems, playlistItems.findIndex(t => t.id === first.id));
        }

        // Autoplay policies block sound until the window has been interacted
        // with at least once; say so instead of looking silently broken.
        if (playerVideo.paused) {
            logToTerminal(`[Auto Play] "${entry.title}" could not start playback automatically — click anywhere in the app once, then it will work.`, true);
        }
    }

    function stopScheduledPlayback(reason) {
        const entry = activeSchedule;
        activeSchedule = null;
        activeScheduleEndsAt = null;

        if (nextTrackTimeout) {
            clearTimeout(nextTrackTimeout);
            nextTrackTimeout = null;
        }
        if (nextTrackCountdownInterval) {
            clearInterval(nextTrackCountdownInterval);
            nextTrackCountdownInterval = null;
        }

        playerVideo.pause();
        resetPlayerStatusIdle();

        if (entry) logToTerminal(`[Auto Play] "${entry.title}" stopped — ${reason}.`);
        renderAutoplayPanel();
    }

    function renderAutoplayPanel(now = new Date()) {
        if (!autoplayUpcoming) return;

        if (activeSchedule) {
            autoplayActive.classList.remove("hidden");
            autoplayActiveText.textContent = activeSchedule.title;
            const mins = Math.max(0, Math.round((activeScheduleEndsAt - now) / 60000));
            autoplayActiveSub.textContent = `Playing now · stops at ${activeSchedule.end_time} (${mins} min left)`;
        } else {
            autoplayActive.classList.add("hidden");
        }

        const upcoming = scheduleEntries
            .filter(e => e.enabled && e.id !== (activeSchedule && activeSchedule.id))
            .map(e => ({ entry: e, occ: nextOccurrence(e, now) }))
            .filter(x => x.occ)
            .sort((a, b) => a.occ.start - b.occ.start)
            .slice(0, 3);

        if (upcoming.length === 0) {
            autoplayUpcoming.innerHTML = `<span style="color: var(--text-secondary);">${scheduleEntries.length ? "Nothing else coming up." : "No playback entries scheduled."}</span>`;
            return;
        }

        autoplayUpcoming.innerHTML = upcoming.map(({ entry, occ }) => {
            const sameDay = toDateStr(occ.start) === toDateStr(now);
            const dayLabel = sameDay ? "Today" : `${DAY_LABELS[dayIndex(occ.start)]} ${occ.start.getDate()}/${occ.start.getMonth() + 1}`;
            const d = describeEntry(entry);
            return `<div style="display: flex; justify-content: space-between; gap: 0.5rem; min-width: 0;">
                        <span style="color: var(--text-primary); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${d.what}">${entry.title}</span>
                        <span style="color: var(--neon-purple); flex-shrink: 0;">${dayLabel} ${entry.start_time}</span>
                    </div>`;
        }).join("");
    }

    // --- schedule list + editor ---
    function renderScheduleList() {
        if (!scheduleList) return;
        if (scheduleEntries.length === 0) {
            scheduleList.innerHTML = `<div style="color: var(--text-secondary); font-size: 0.78rem; padding: 0.5rem 0;">No playback entries yet. Create one to start music automatically at a set time.</div>`;
            return;
        }

        scheduleList.innerHTML = "";
        scheduleEntries.forEach(entry => {
            const d = describeEntry(entry);
            const isRunning = activeSchedule && activeSchedule.id === entry.id;
            const row = document.createElement("div");
            row.className = `schedule-row ${entry.enabled ? "" : "disabled"} ${isRunning ? "running" : ""}`;
            row.innerHTML = `
                <input type="checkbox" class="sched-enabled" ${entry.enabled ? "checked" : ""} title="${entry.enabled ? "Disable" : "Enable"}" style="width: 15px; height: 15px; accent-color: var(--neon-purple); cursor: pointer; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${entry.title}${isRunning ? ` <span style="color: var(--neon-purple); font-size: 0.7rem;">• playing</span>` : ""}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.what}</div>
                </div>
                <div style="font-size: 0.72rem; color: var(--neon-purple); font-weight: 600; text-align: right; flex-shrink: 0;">${d.when}</div>
                <button class="schedule-row-btn sched-edit" title="Edit entry">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                </button>
                <button class="schedule-row-btn sched-delete" title="Delete entry" style="color: var(--error);">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            `;

            row.querySelector(".sched-enabled").addEventListener("change", async (e) => {
                entry.enabled = e.target.checked;
                if (!entry.enabled && activeSchedule && activeSchedule.id === entry.id) {
                    stopScheduledPlayback("entry disabled");
                }
                await saveEntry(entry, entry.id);
                renderScheduleList();
                renderAutoplayPanel();
            });

            row.querySelector(".sched-edit").addEventListener("click", () => openScheduleEditor(entry));

            row.querySelector(".sched-delete").addEventListener("click", async () => {
                if (!confirm(`Delete playback entry "${entry.title}"?`)) return;
                try {
                    const res = await fetch(`/api/schedules/${entry.id}`, { method: "DELETE" });
                    if (res.ok) {
                        if (activeSchedule && activeSchedule.id === entry.id) stopScheduledPlayback("entry deleted");
                        logToTerminal(`[Auto Play] Deleted entry "${entry.title}".`);
                        await loadSchedules();
                    }
                } catch (err) {
                    console.error("Delete schedule failed:", err);
                }
            });

            scheduleList.appendChild(row);
        });
    }

    // Playable targets: real playlists plus the virtual "All Downloads"
    function schedulablePlaylists() {
        return historyJobs.filter(j => !j.deleted && j.id !== "deleted_tracks");
    }

    function populatePlaylistOptions(selectedId) {
        schedPlaylist.innerHTML = schedulablePlaylists()
            .map(j => `<option value="${j.id}" ${j.id === selectedId ? "selected" : ""}>${j.title}</option>`)
            .join("");
        populateTrackOptions();
    }

    function populateTrackOptions(selectedTrackId) {
        const job = historyJobs.find(j => j.id === schedPlaylist.value);
        const tracks = ((job && job.items) || []).filter(t =>
            (t.status === "completed" || (t.status === "skipped" && !t.file_missing))
        );
        schedTrack.innerHTML = tracks.length
            ? tracks.map(t => `<option value="${t.id}" ${t.id === selectedTrackId ? "selected" : ""}>${t.title}</option>`).join("")
            : `<option value="">No downloaded tracks in this playlist</option>`;
    }

    function setPillGroup(name, value) {
        document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
            r.checked = r.value === value;
            r.closest(".header-pill-btn")?.classList.toggle("active", r.checked);
        });
    }

    function currentPill(name) {
        return document.querySelector(`input[name="${name}"]:checked`)?.value;
    }

    function syncEditorVisibility() {
        const isTrack = currentPill("schedTarget") === "track";
        schedTrackRow.classList.toggle("hidden", !isTrack);
        // Order/shuffle is meaningless for a single file
        schedModeRow.classList.toggle("hidden", isTrack);

        const repeat = schedRepeat.value;
        schedDate.classList.toggle("hidden", repeat !== "once");
        schedDaysRow.classList.toggle("hidden", repeat !== "weekly");

        const overnight = schedEnd.value && schedStart.value && schedEnd.value <= schedStart.value;
        document.getElementById("schedOvernightNote").classList.toggle("hidden", !overnight);
    }

    function openScheduleEditor(entry) {
        editingScheduleId = entry ? entry.id : null;
        scheduleFormError.textContent = "";
        document.getElementById("scheduleEditorTitle").textContent = entry ? "Edit Playback Entry" : "New Playback Entry";

        schedTitle.value = entry ? entry.title : "";
        populatePlaylistOptions(entry ? entry.playlist_id : (schedulablePlaylists()[0] || {}).id);
        setPillGroup("schedTarget", entry ? entry.target_type : "playlist");
        setPillGroup("schedMode", entry ? entry.mode : "order");
        if (entry && entry.target_type === "track") populateTrackOptions(entry.track_id);
        schedRepeat.value = entry ? entry.repeat : "once";
        schedDate.value = entry && entry.date ? entry.date : toDateStr(new Date());
        document.querySelectorAll("#schedDaysRow input").forEach(cb => {
            cb.checked = !!(entry && (entry.days || []).includes(Number(cb.value)));
        });
        schedStart.value = entry ? entry.start_time : "08:00";
        schedEnd.value = entry ? entry.end_time : "09:00";

        syncEditorVisibility();
        scheduleEditor.classList.remove("hidden");
        schedTitle.focus();
    }

    function closeScheduleEditor() {
        scheduleEditor.classList.add("hidden");
        editingScheduleId = null;
    }

    async function saveEntry(payload, id) {
        const url = id ? `/api/schedules/${id}` : "/api/schedules";
        const res = await fetch(url, {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Could not save the entry");
        }
        return res.json();
    }

    if (document.getElementById("btnSaveSchedule")) {
        document.getElementById("btnSaveSchedule").addEventListener("click", async () => {
            const job = historyJobs.find(j => j.id === schedPlaylist.value);
            const isTrack = currentPill("schedTarget") === "track";
            const trackId = schedTrack.value;
            const existing = scheduleEntries.find(e => e.id === editingScheduleId);

            const payload = {
                title: schedTitle.value.trim() || (job ? job.title : "Playback entry"),
                enabled: existing ? existing.enabled : true,
                target_type: isTrack ? "track" : "playlist",
                playlist_id: schedPlaylist.value,
                track_id: isTrack ? trackId : null,
                track_title: isTrack ? (schedTrack.options[schedTrack.selectedIndex] || {}).text : null,
                mode: isTrack ? "order" : currentPill("schedMode"),
                repeat: schedRepeat.value,
                date: schedRepeat.value === "once" ? schedDate.value : null,
                days: schedRepeat.value === "weekly"
                    ? [...document.querySelectorAll("#schedDaysRow input:checked")].map(cb => Number(cb.value))
                    : [],
                start_time: schedStart.value,
                end_time: schedEnd.value,
                last_fired: null   // saving re-arms the entry for the current window
            };

            if (isTrack && !trackId) {
                scheduleFormError.textContent = "Pick a downloaded track";
                return;
            }

            try {
                await saveEntry(payload, editingScheduleId);
                logToTerminal(`[Auto Play] Saved entry "${payload.title}".`);
                closeScheduleEditor();
                await loadSchedules();
            } catch (e) {
                scheduleFormError.textContent = e.message;
            }
        });
    }

    document.getElementById("btnNewSchedule")?.addEventListener("click", () => openScheduleEditor(null));
    document.getElementById("btnCancelSchedule")?.addEventListener("click", closeScheduleEditor);
    schedPlaylist?.addEventListener("change", () => populateTrackOptions());
    schedRepeat?.addEventListener("change", syncEditorVisibility);
    schedStart?.addEventListener("change", syncEditorVisibility);
    schedEnd?.addEventListener("change", syncEditorVisibility);
    document.querySelectorAll('input[name="schedTarget"], input[name="schedMode"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            document.querySelectorAll(`input[name="${e.target.name}"]`).forEach(r => {
                r.closest(".header-pill-btn")?.classList.remove("active");
            });
            e.target.closest(".header-pill-btn")?.classList.add("active");
            if (e.target.name === "schedTarget") populateTrackOptions();
            syncEditorVisibility();
        });
    });

    function openSchedulerModal() {
        schedulerModal.classList.remove("hidden");
        closeScheduleEditor();
        loadSchedules();
    }

    document.getElementById("btnOpenScheduler")?.addEventListener("click", openSchedulerModal);
    document.getElementById("btnPanelAddSchedule")?.addEventListener("click", openSchedulerModal);
    document.getElementById("btnCloseScheduler")?.addEventListener("click", () => schedulerModal.classList.add("hidden"));
    schedulerModal?.addEventListener("click", (e) => {
        if (e.target === schedulerModal) schedulerModal.classList.add("hidden");
    });

    // Start-up initialization
    loadDefaultDir();
    loadSidebar();
    initResizableColumns();
    loadSchedules();
    setInterval(scheduleTick, 1000);

    const notifiedAIJobs = new Set();
    async function pollAIJobs() {
        try {
            const res = await fetch('/api/ai-jobs');
            if (res.ok) {
                const jobs = await res.json();
                for (const [jobId, state] of Object.entries(jobs)) {
                    if ((state.status === "completed" || state.status === "failed") && !notifiedAIJobs.has(jobId)) {
                        notifiedAIJobs.add(jobId);
                        if (state.status === "completed") {
                            logToTerminal(`[AI] ✨ Finished generating AI Instrumental for "${state.track_title}"!`);
                            loadHistory();
                        } else {
                            logToTerminal(`[AI Error] Failed on "${state.track_title}": ${state.error}`, true);
                        }
                    }
                }
            }
        } catch (e) {}
    }
    setInterval(pollAIJobs, 3000);
    // Reattach to an in-flight download after a page reload/app restart so the
    // Active Job HUD keeps reporting progress (harmless when idle).
    startProgressStream();

    // Settings Modal Triggers
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    const settingsModal = document.getElementById("settingsModal");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const btnSaveSettings = document.getElementById("btnSaveSettings");
    
    if (btnOpenSettings && settingsModal) {
        btnOpenSettings.addEventListener("click", () => {
            settingsModal.classList.remove("hidden");
            shadowInputFix();
            checkYtdlpVersion();
        });
    }

    const btnAzureSync = document.getElementById("btnAzureSync");
    if (btnAzureSync) {
        btnAzureSync.addEventListener("click", async () => {
            btnAzureSync.disabled = true;
            const originalText = btnAzureSync.innerHTML;
            btnAzureSync.innerHTML = '<div class="spinner" style="width:14px;height:14px;"></div> Syncing...';
            try {
                const res = await fetch("/api/azure/sync", { method: "POST" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || "Failed to trigger sync");
                showToast(data.message || "Cloud sync completed!");
            } catch (err) {
                console.error(err);
                showToast("Error: " + err.message, true);
            } finally {
                btnAzureSync.disabled = false;
                btnAzureSync.innerHTML = originalText;
            }
        });
    }
    
    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener("click", () => {
            settingsModal.classList.add("hidden");
        });
    }
    
    if (btnSaveSettings && settingsModal) {
        btnSaveSettings.addEventListener("click", () => {
            settingsModal.classList.add("hidden");
            logToTerminal("[System] Settings saved and applied successfully.");
        });
    }

    // --- Wi-Fi Sync (iPhone) settings section ---
    const syncEnabledToggle = document.getElementById("syncEnabledToggle");
    const syncPortInput = document.getElementById("syncPortInput");
    const syncAddressText = document.getElementById("syncAddressText");
    const syncTokenText = document.getElementById("syncTokenText");
    const btnCopySyncToken = document.getElementById("btnCopySyncToken");
    const btnRotateSyncToken = document.getElementById("btnRotateSyncToken");
    const btnExportManifest = document.getElementById("btnExportManifest");
    const syncManifestStatus = document.getElementById("syncManifestStatus");
    const syncRestartNote = document.getElementById("syncRestartNote");
    const syncCookiesInput = document.getElementById("syncCookiesInput");

    function renderSyncConfig(cfg) {
        if (!syncEnabledToggle) return;
        syncEnabledToggle.checked = !!cfg.enabled;
        syncPortInput.value = cfg.port || 8765;
        syncTokenText.textContent = cfg.token || "—";
        syncTokenText.title = cfg.token || "";
        const ip = (cfg.lan_ips && cfg.lan_ips[0]) || null;
        syncAddressText.textContent = cfg.enabled && ip ? `http://${ip}:${cfg.port}` : (cfg.enabled ? "no network detected" : "disabled");
        syncRestartNote.classList.toggle("hidden", !cfg.restart_required);
        if (syncCookiesInput) {
            syncCookiesInput.value = cfg.cookies_from_browser || "none";
        }
    }

    async function loadSyncConfig() {
        try {
            const res = await fetch("/api/sync/config");
            if (res.ok) renderSyncConfig(await res.json());
        } catch (e) { /* section stays inert if unavailable */ }
    }

    async function saveSyncConfig() {
        if (!syncEnabledToggle) return;
        try {
            const cookies_from_browser = syncCookiesInput ? syncCookiesInput.value : "none";
            const res = await fetch("/api/sync/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    enabled: syncEnabledToggle.checked,
                    port: parseInt(syncPortInput.value, 10) || 8765,
                    cookies_from_browser: cookies_from_browser
                })
            });
            if (res.ok) {
                const cfg = await res.json();
                renderSyncConfig(cfg);
                if (cfg.restart_required) {
                    logToTerminal("[Wi-Fi Sync] Setting saved — restart SonicStream to apply.");
                }
            }
        } catch (e) {
            logToTerminal("[Wi-Fi Sync] Failed to save settings: " + e.message);
        }
    }

    if (btnOpenSettings) btnOpenSettings.addEventListener("click", loadSyncConfig);
    if (btnSaveSettings) btnSaveSettings.addEventListener("click", saveSyncConfig);
    if (syncEnabledToggle) syncEnabledToggle.addEventListener("change", saveSyncConfig);
    if (syncCookiesInput) syncCookiesInput.addEventListener("change", saveSyncConfig);

    if (btnCopySyncToken) {
        btnCopySyncToken.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(syncTokenText.textContent || "");
                btnCopySyncToken.textContent = "Copied!";
                setTimeout(() => { btnCopySyncToken.textContent = "Copy"; }, 1500);
            } catch (e) { /* clipboard unavailable in some webview contexts */ }
        });
    }

    if (btnRotateSyncToken) {
        btnRotateSyncToken.addEventListener("click", async () => {
            if (!confirm("Generate a new pairing token? The iPhone app will need to be re-paired.")) return;
            try {
                const res = await fetch("/api/sync/rotate-token", { method: "POST" });
                if (res.ok) {
                    renderSyncConfig(await res.json());
                    logToTerminal("[Wi-Fi Sync] Pairing token rotated — update the iPhone app.");
                }
            } catch (e) { /* ignore */ }
        });
    }

    if (btnExportManifest) {
        btnExportManifest.addEventListener("click", async () => {
            syncManifestStatus.textContent = "Exporting…";
            try {
                const res = await fetch("/api/sync/export-manifest", { method: "POST" });
                if (res.ok) {
                    const data = await res.json();
                    syncManifestStatus.textContent = `Exported ${data.playlists} playlist(s)`;
                    logToTerminal("[Wi-Fi Sync] Manifest exported to " + data.path);
                } else {
                    syncManifestStatus.textContent = "Export failed";
                }
            } catch (e) {
                syncManifestStatus.textContent = "Export failed";
            }
        });
    }

    // Playlists backup: export/import all playlists
    const btnExportPlaylists = document.getElementById("btnExportPlaylists");
    const btnImportPlaylists = document.getElementById("btnImportPlaylists");
    const importPlaylistsFile = document.getElementById("importPlaylistsFile");
    const backupStatusText = document.getElementById("backupStatusText");

    if (btnExportPlaylists) {
        btnExportPlaylists.addEventListener("click", async () => {
            backupStatusText.textContent = "Exporting…";
            try {
                const res = await fetch("/api/playlists/export", { method: "POST" });
                if (res.ok) {
                    const data = await res.json();
                    backupStatusText.textContent = `Exported ${data.playlists} playlist(s) to ${data.path}`;
                    logToTerminal(`[Backup] Playlists exported to ${data.path}`);
                } else {
                    backupStatusText.textContent = "Export failed";
                }
            } catch (e) {
                backupStatusText.textContent = "Export failed";
            }
        });
    }

    if (btnImportPlaylists && importPlaylistsFile) {
        btnImportPlaylists.addEventListener("click", () => importPlaylistsFile.click());

        importPlaylistsFile.addEventListener("change", async () => {
            const file = importPlaylistsFile.files && importPlaylistsFile.files[0];
            importPlaylistsFile.value = ""; // allow re-selecting the same file
            if (!file) return;

            backupStatusText.textContent = "Importing…";
            try {
                const text = await file.text();
                const backup = JSON.parse(text);
                const playlists = Array.isArray(backup) ? backup : backup.playlists;
                if (!Array.isArray(playlists)) throw new Error("Not a playlists backup file");

                const res = await fetch("/api/playlists/import-all", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ playlists })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || "Import failed");
                }
                const data = await res.json();
                backupStatusText.textContent = `Imported ${data.imported} new, merged ${data.merged} existing (${data.tracks_added} tracks added)`;
                logToTerminal(`[Backup] Import done: ${data.imported} new, ${data.merged} merged, ${data.tracks_added} tracks added.`);
                await loadSidebar();
            } catch (e) {
                backupStatusText.textContent = `Import failed: ${e.message}`;
            }
        });
    }

    // yt-dlp version check and update
    async function checkYtdlpVersion() {
        const currentEl = document.getElementById("ytdlpCurrentVersion");
        const latestEl = document.getElementById("ytdlpLatestVersion");
        const statusEl = document.getElementById("ytdlpStatusText");
        const updateBtn = document.getElementById("btnUpdateYtdlp");
        
        currentEl.textContent = "Checking...";
        latestEl.textContent = "Checking...";
        statusEl.style.color = "var(--text-muted)";
        statusEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle; margin-right: 4px; animation: spin 0.8s infinite linear;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Checking...`;
        updateBtn.classList.add("hidden");
        
        try {
            const res = await fetch("/api/ytdlp-version");
            const data = await res.json();
            
            currentEl.textContent = data.current_version;
            latestEl.textContent = data.latest_version;
            
            if (data.update_available) {
                statusEl.style.color = "#ffbd2e";
                statusEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle; margin-right: 4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Update available!`;
                latestEl.style.color = "#ffbd2e";
                updateBtn.classList.remove("hidden");
            } else {
                statusEl.style.color = "#27c93f";
                statusEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg> Up to date`;
                latestEl.style.color = "#27c93f";
                updateBtn.classList.add("hidden");
            }
        } catch (e) {
            currentEl.textContent = "Error";
            latestEl.textContent = "Error";
            statusEl.style.color = "var(--error)";
            statusEl.textContent = "Failed to check version";
        }
    }
    
    document.getElementById("btnUpdateYtdlp")?.addEventListener("click", async () => {
        const updateBtn = document.getElementById("btnUpdateYtdlp");
        const statusEl = document.getElementById("ytdlpStatusText");
        
        updateBtn.disabled = true;
        updateBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s infinite linear;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Updating...`;
        statusEl.style.color = "var(--neon-blue)";
        statusEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle; margin-right: 4px; animation: spin 0.8s infinite linear;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Upgrading yt-dlp...`;
        logToTerminal("[System] Upgrading yt-dlp to latest version...");
        
        try {
            const res = await fetch("/api/ytdlp-update", { method: "POST" });
            const data = await res.json();
            
            if (data.success) {
                statusEl.style.color = "#27c93f";
                statusEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg> Updated! Restart app to apply.`;
                updateBtn.classList.add("hidden");
                logToTerminal(`[System] yt-dlp upgraded successfully. ${data.message}`);
            } else {
                statusEl.style.color = "var(--error)";
                statusEl.textContent = "Upgrade failed";
                logToTerminal(`[Error] yt-dlp upgrade failed: ${data.message}`, true);
                updateBtn.disabled = false;
                updateBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Retry`;
            }
        } catch (e) {
            statusEl.style.color = "var(--error)";
            statusEl.textContent = "Network error during upgrade";
            logToTerminal(`[Error] yt-dlp upgrade failed: ${e.message}`, true);
            updateBtn.disabled = false;
            updateBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Retry`;
        }
    });

    // Setup active states on startup radios
    function shadowInputFix() {
        const formatBtn = document.querySelector('input[name="format"]:checked')?.closest(".header-pill-btn");
        if (formatBtn) formatBtn.classList.add("active");
        const qualityBtn = document.querySelector('input[name="quality"]:checked')?.closest(".header-pill-btn");
        if (qualityBtn) qualityBtn.classList.add("active");
    }
    
    // Format selection change listener for auto quality selection
    const formatRadios = document.querySelectorAll('input[name="format"]');
    formatRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            document.querySelectorAll('input[name="format"]').forEach(r => {
                r.closest(".header-pill-btn")?.classList.remove("active");
            });
            if (e.target.checked) {
                e.target.closest(".header-pill-btn")?.classList.add("active");
                if (e.target.value === "audio") {
                    const highestRadio = document.querySelector('input[name="quality"][value="highest"]');
                    if (highestRadio && !highestRadio.checked) {
                        highestRadio.checked = true;
                        highestRadio.dispatchEvent(new Event("change"));
                    }
                }
            }
        });
    });

    const qualityRadios = document.querySelectorAll('input[name="quality"]');
    qualityRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            document.querySelectorAll('input[name="quality"]').forEach(r => {
                r.closest(".header-pill-btn")?.classList.remove("active");
            });
            if (e.target.checked) {
                e.target.closest(".header-pill-btn")?.classList.add("active");
            }
        });
    });

    shadowInputFix();

    // --- MediaSession & Car Bluetooth / Hardware Media Controls ---
    function initMediaSessionControls() {
        if (!('mediaSession' in navigator)) return;

        try {
            navigator.mediaSession.setActionHandler('play', () => {
                if (playerVideo.src) {
                    playerVideo.play().catch(console.error);
                    isPlaying = true;
                    updatePlayBtnUI();
                    if (playerStatusEq) {
                        playerStatusEq.style.visibility = "visible";
                        playerStatusEq.classList.add("playing");
                    }
                    if (playerStatusText) playerStatusText.textContent = "Playing";
                }
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                if (playerVideo.src) {
                    playerVideo.pause();
                    isPlaying = false;
                    updatePlayBtnUI();
                    if (playerStatusEq) {
                        playerStatusEq.style.visibility = "hidden";
                        playerStatusEq.classList.remove("playing");
                    }
                    if (playerStatusText) playerStatusText.textContent = "Paused";
                }
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                playPrevTrack();
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                playNextTrack();
            });

            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skipTime = details.seekOffset || 10;
                if (playerVideo.duration) {
                    playerVideo.currentTime = Math.max(playerVideo.currentTime - skipTime, 0);
                }
            });

            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skipTime = details.seekOffset || 10;
                if (playerVideo.duration) {
                    playerVideo.currentTime = Math.min(playerVideo.currentTime + skipTime, playerVideo.duration);
                }
            });

            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime !== undefined && playerVideo.duration) {
                    playerVideo.currentTime = details.seekTime;
                }
            });
        } catch (e) {
            console.error("MediaSession action handler setup failed:", e);
        }
    }

    function updateMediaSessionMetadata(track) {
        if (!('mediaSession' in navigator) || !track) return;

        const currentJob = historyJobs.find(j => j.id === currentPlaylistId);
        const albumName = currentJob ? currentJob.title : "SonicStream";

        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || "Unknown Track",
                artist: track.uploader || "SonicStream",
                album: albumName,
                artwork: [
                    {
                        src: track.thumbnail || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`,
                        sizes: '512x512',
                        type: 'image/jpeg'
                    }
                ]
            });
        } catch (e) {
            console.error("MediaSession metadata update failed:", e);
        }
    }

    function updateMediaSessionPositionState() {
        if (!('mediaSession' in navigator) || !playerVideo || !playerVideo.duration || isNaN(playerVideo.duration)) return;
        try {
            navigator.mediaSession.setPositionState({
                duration: playerVideo.duration,
                playbackRate: playerVideo.playbackRate || 1,
                position: playerVideo.currentTime
            });
        } catch (e) {}
    }

    // Physical Hardware Media Keys Listener (MediaPlayPause, MediaTrackNext, MediaTrackPrevious)
    window.addEventListener("keydown", (e) => {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

        if (e.key === "MediaPlayPause") {
            playerPlayPauseBtn.click();
        } else if (e.key === "MediaTrackNext") {
            playNextTrack();
        } else if (e.key === "MediaTrackPrevious") {
            playPrevTrack();
        } else if (e.key === "MediaStop") {
            if (playerVideo.src) {
                playerVideo.pause();
                playerVideo.currentTime = 0;
                isPlaying = false;
                updatePlayBtnUI();
            }
        }
    });

    initMediaSessionControls();
});
