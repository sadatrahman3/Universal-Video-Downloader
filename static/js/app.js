const state = {
    currentUrl: '',
    currentInfo: null,
    activeDownloads: {},
    currentTab: 'video',
};

const DOM = {};

function initDOM() {
    DOM.urlInput = document.getElementById('urlInput');
    DOM.fetchBtn = document.getElementById('fetchBtn');
    DOM.pasteBtn = document.getElementById('pasteBtn');
    DOM.quickAudioBtn = document.getElementById('quickAudioBtn');
    DOM.quickVideoBtn = document.getElementById('quickVideoBtn');
    DOM.infoSection = document.getElementById('infoSection');
    DOM.thumbnailImg = document.getElementById('thumbnailImg');
    DOM.videoTitle = document.getElementById('videoTitle');
    DOM.videoUploader = document.getElementById('videoUploader');
    DOM.videoDuration = document.getElementById('videoDuration');
    DOM.videoDate = document.getElementById('videoDate');
    DOM.videoDescription = document.getElementById('videoDescription');
    DOM.tabBtns = document.querySelectorAll('.tab-btn');
    DOM.formatSelect = document.getElementById('formatSelect');
    DOM.audioQualitySelect = document.getElementById('audioQualitySelect');
    DOM.audioQualityGroup = document.getElementById('audioQualityGroup');
    DOM.customArgs = document.getElementById('customArgs');
    DOM.downloadBtn = document.getElementById('downloadBtn');
    DOM.playlistSection = document.getElementById('playlistSection');
    DOM.playlistTitle = document.getElementById('playlistTitle');
    DOM.playlistCount = document.getElementById('playlistCount');
    DOM.playlistItems = document.getElementById('playlistItems');
    DOM.downloadAllBtn = document.getElementById('downloadAllBtn');
    DOM.downloadsList = document.getElementById('downloadsList');
    DOM.clearBtn = document.getElementById('clearBtn');
    DOM.themeToggle = document.getElementById('themeToggle');
    DOM.toast = document.getElementById('toast');
}

function showToast(message, type = '') {
    DOM.toast.textContent = message;
    DOM.toast.className = 'toast ' + type;
    requestAnimationFrame(() => DOM.toast.classList.add('show'));
    setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.length === 8) {
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec) return '';
    return formatBytes(bytesPerSec) + '/s';
}

function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

async function fetchInfo(url) {
    DOM.fetchBtn.disabled = true;
    DOM.fetchBtn.textContent = 'Loading...';

    try {
        const res = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.error, 'error');
            return null;
        }
        return data;
    } catch (err) {
        showToast('Failed to fetch info: ' + err.message, 'error');
        return null;
    } finally {
        DOM.fetchBtn.disabled = false;
        DOM.fetchBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Fetch Info`;
    }
}

function displayInfo(info) {
    state.currentInfo = info;
    DOM.infoSection.style.display = 'block';

    DOM.videoTitle.textContent = info.title;
    DOM.videoUploader.textContent = info.uploader;
    DOM.thumbnailImg.src = info.thumbnail || '/static/placeholder.svg';
    DOM.thumbnailImg.onerror = function() {
        this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" fill="%23333"><rect width="200" height="120"/><text x="50%" y="50%" fill="%23666" text-anchor="middle" dy=".3em" font-size="14">No Thumbnail</text></svg>';
    };
    DOM.videoDuration.textContent = formatDuration(info.duration) ? 'Duration: ' + formatDuration(info.duration) : '';
    DOM.videoDate.textContent = info.upload_date ? 'Uploaded: ' + formatDate(info.upload_date) : '';
    DOM.videoDescription.textContent = info.description || '';

    populateFormats(info, 'video');
    DOM.playlistSection.style.display = 'none';

    if (info.is_playlist) {
        displayPlaylist(info);
    }
}

function populateFormats(info, type) {
    DOM.formatSelect.innerHTML = '';

    let formats = [];
    if (type === 'video') {
        formats = info.video_formats || [];
    } else if (type === 'audio') {
        formats = info.audio_formats || [];
    } else if (type === 'video_only') {
        formats = info.video_only_formats || [];
    }

    if (formats.length === 0) {
        const opt = document.createElement('option');
        opt.value = type === 'audio' ? 'bestaudio/best' : 'bestvideo+bestaudio/best';
        opt.textContent = 'Auto (Best)';
        DOM.formatSelect.appendChild(opt);
        return;
    }

    formats.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.format_id;
        if (type === 'video') {
            opt.textContent = `${f.height}p - ${f.ext.toUpperCase()} (${f.vcodec || ''}) ${f.filesize ? '- ' + formatBytes(f.filesize) : ''}`;
        } else if (type === 'audio') {
            opt.textContent = `${f.ext.toUpperCase()} - ${f.abr ? f.abr + 'kbps' : 'Unknown quality'} ${f.filesize ? '- ' + formatBytes(f.filesize) : ''}`;
        } else {
            opt.textContent = `${f.height}p - ${f.ext.toUpperCase()} ${f.filesize ? '- ' + formatBytes(f.filesize) : ''}`;
        }
        DOM.formatSelect.appendChild(opt);
    });
}

function displayPlaylist(info) {
    DOM.playlistSection.style.display = 'block';
    DOM.playlistTitle.textContent = info.playlist_title || 'Playlist';
    DOM.playlistCount.textContent = `${info.entries?.length || 0} videos`;
    DOM.playlistItems.innerHTML = '';

    (info.entries || []).forEach(entry => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        div.innerHTML = `
            <img src="${entry.thumbnail || ''}" alt="" onerror="this.style.display='none'">
            <div class="playlist-item-info">
                <div class="item-title">${entry.title}</div>
                <div class="item-meta">${formatDuration(entry.duration) || ''}</div>
            </div>
        `;
        div.addEventListener('click', () => {
            DOM.urlInput.value = entry.url;
            handleFetch();
        });
        DOM.playlistItems.appendChild(div);
    });
}

async function handleFetch() {
    const url = DOM.urlInput.value.trim();
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }
    state.currentUrl = url;
    const info = await fetchInfo(url);
    if (info) {
        displayInfo(info);
    }
}

async function startDownload(url, type, formatId, quality, customArgs) {
    const payload = { url, type, format_id: formatId, quality, custom_args: customArgs };

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.error, 'error');
            return null;
        }
        showToast('Download started!', 'success');
        return data.download_id;
    } catch (err) {
        showToast('Failed to start download: ' + err.message, 'error');
        return null;
    }
}

function subscribeProgress(downloadId) {
    const evtSource = new EventSource(`/api/progress/${downloadId}`);
    evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateDownloadItem(downloadId, data);
        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
            evtSource.close();
            refreshDownloads();
        }
    };
    evtSource.onerror = () => {
        evtSource.close();
        refreshDownloads();
    };
    state.activeDownloads[downloadId] = evtSource;
}

function updateDownloadItem(id, data) {
    const item = document.querySelector(`.download-item[data-id="${id}"]`);
    if (!item) return;

    const statusEl = item.querySelector('.download-status');
    const progressText = item.querySelector('.download-progress-text');
    const fill = item.querySelector('.progress-fill');
    const actionsEl = item.querySelector('.download-actions');

    if (data.status === 'downloading') {
        statusEl.textContent = 'Downloading';
        statusEl.className = 'download-status downloading';
        progressText.textContent = `${data.percent}% ${formatSpeed(data.speed)} ${formatETA(data.eta) ? '- ' + formatETA(data.eta) + ' left' : ''}`;
        fill.style.width = data.percent + '%';
        fill.className = 'progress-fill';
    } else if (data.status === 'processing') {
        statusEl.textContent = 'Processing...';
        statusEl.className = 'download-status processing';
        progressText.textContent = 'Finalizing download...';
        fill.style.width = '100%';
        fill.className = 'progress-fill';
    } else if (data.status === 'completed') {
        statusEl.textContent = 'Completed';
        statusEl.className = 'download-status completed';
        progressText.textContent = 'Done';
        fill.style.width = '100%';
        fill.className = 'progress-fill completed';
                actionsEl.innerHTML = `<button class="btn-action download-file" onclick="window.open('/api/download/${id}/file','_blank')" title="Download file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
        </button>`;
    } else if (data.status === 'error') {
        statusEl.textContent = 'Error';
        statusEl.className = 'download-status error';
        progressText.textContent = data.error || 'Download failed';
        fill.style.width = '0%';
        fill.className = 'progress-fill error';
    } else if (data.status === 'cancelled') {
        statusEl.textContent = 'Cancelled';
        statusEl.className = 'download-status cancelled';
        progressText.textContent = 'Download was cancelled';
        fill.style.width = '0%';
        fill.className = 'progress-fill error';
    } else {
        statusEl.textContent = data.status || 'Starting...';
        statusEl.className = 'download-status';
    }
}

async function refreshDownloads() {
    try {
        const res = await fetch('/api/downloads');
        const downloads = await res.json();
        renderDownloads(downloads);
    } catch (err) {
        console.error('Failed to refresh downloads:', err);
    }
}

function renderDownloads(downloads) {
    if (downloads.length === 0) {
        DOM.downloadsList.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>
                </svg>
                <p>No downloads yet</p>
            </div>`;
        return;
    }

    DOM.downloadsList.innerHTML = '';
    downloads.forEach(d => {
        const div = document.createElement('div');
        div.className = 'download-item';
        div.dataset.id = d.id;

        const isActive = d.status === 'downloading' || d.status === 'processing' || d.status === 'starting';
        const isCompleted = d.status === 'completed';
        const isError = d.status === 'error' || d.status === 'cancelled';
        const pct = d.percent || 0;

        let actionsHtml = '';
        if (isActive) {
            actionsHtml = `<button class="btn-action cancel" onclick="cancelDownload('${d.id}')" title="Cancel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;
        } else if (isCompleted) {
            actionsHtml = `<button class="btn-action download-file" onclick="window.open('/api/download/${d.id}/file','_blank')" title="Download file">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>`;
        } else if (isError) {
            actionsHtml = `<button class="btn-action delete" onclick="deleteDownload('${d.id}')" title="Dismiss">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>`;
        }

        div.innerHTML = `
            <div class="download-info">
                <div class="download-title">${d.url ? d.url.substring(0, 60) : 'Download'}</div>
                <div class="download-meta">
                    <span class="download-status ${d.status}">${d.status}</span>
                    <span class="download-progress-text">${pct}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${d.status === 'completed' ? 'completed' : d.status === 'error' || d.status === 'cancelled' ? 'error' : ''}" style="width:${pct}%"></div>
                </div>
            </div>
            <div class="download-actions">${actionsHtml}</div>
        `;

        DOM.downloadsList.appendChild(div);

        if (isActive) {
            subscribeProgress(d.id);
        }
    });
}

async function cancelDownload(id) {
    try {
        await fetch(`/api/cancel/${id}`, { method: 'POST' });
        if (state.activeDownloads[id]) {
            state.activeDownloads[id].close();
            delete state.activeDownloads[id];
        }
        refreshDownloads();
        showToast('Download cancelled', '');
    } catch (err) {
        showToast('Failed to cancel', 'error');
    }
}

async function deleteDownload(id) {
    try {
        await fetch(`/api/delete/${id}`, { method: 'POST' });
        if (state.activeDownloads[id]) {
            state.activeDownloads[id].close();
            delete state.activeDownloads[id];
        }
        refreshDownloads();
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

async function downloadFile(id) {
    window.open(`/api/download/${id}/file`, '_blank');
}

// Init
initDOM();

if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light');
}

// Event Listeners
DOM.fetchBtn.addEventListener('click', handleFetch);
DOM.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetch();
});

DOM.pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        DOM.urlInput.value = text;
        handleFetch();
    } catch {
        showToast('Cannot access clipboard', 'error');
    }
});

DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        DOM.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentTab = btn.dataset.type;
        DOM.audioQualityGroup.style.display = btn.dataset.type === 'audio' ? 'flex' : 'none';

        if (state.currentInfo) {
            populateFormats(state.currentInfo, btn.dataset.type);
        }
    });
});

DOM.downloadBtn.addEventListener('click', async () => {
    if (!state.currentUrl) {
        showToast('No URL to download', 'error');
        return;
    }

    const dlType = state.currentTab;
    const formatId = DOM.formatSelect.value;
    const quality = DOM.audioQualitySelect.value;
    const customArgs = DOM.customArgs.value.trim();

    DOM.downloadBtn.disabled = true;
    DOM.downloadBtn.innerHTML = 'Starting...';

    const downloadId = await startDownload(state.currentUrl, dlType, formatId, quality, customArgs);
    if (downloadId) {
        refreshDownloads();
    }

    DOM.downloadBtn.disabled = false;
    DOM.downloadBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download`;
});

DOM.quickAudioBtn.addEventListener('click', async () => {
    const url = DOM.urlInput.value.trim();
    if (!url) { showToast('Enter a URL first', 'error'); return; }
    const id = await startDownload(url, 'audio', '', 'mp3', '');
    if (id) refreshDownloads();
});

DOM.quickVideoBtn.addEventListener('click', async () => {
    const url = DOM.urlInput.value.trim();
    if (!url) { showToast('Enter a URL first', 'error'); return; }
    const id = await startDownload(url, 'video', '', '', '');
    if (id) refreshDownloads();
});

DOM.downloadAllBtn.addEventListener('click', async () => {
    if (!state.currentInfo || !state.currentInfo.entries) return;
    showToast(`Processing ${state.currentInfo.entries.length} items...`, '');
    for (const entry of state.currentInfo.entries) {
        if (entry.url) {
            await startDownload(entry.url, state.currentTab, DOM.formatSelect.value, DOM.audioQualitySelect.value, DOM.customArgs.value.trim());
        }
    }
    refreshDownloads();
});

DOM.clearBtn.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/clear', { method: 'POST' });
        const data = await res.json();
        showToast(`Cleared ${data.removed} downloads`, 'success');
        refreshDownloads();
    } catch {
        showToast('Failed to clear', 'error');
    }
});

DOM.themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

refreshDownloads();
setInterval(refreshDownloads, 5000);

console.log('YTDLnis Web loaded');
