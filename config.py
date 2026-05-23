import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, 'downloads')

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

YTDLP_OPTIONS = {
    'quiet': True,
    'no_warnings': False,
    'extract_flat': False,
    'ignoreerrors': True,
    'no_color': True,
    'concurrent_fragment_downloads': 4,
}

DOWNLOAD_HISTORY = {}
