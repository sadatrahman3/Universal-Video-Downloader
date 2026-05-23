import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, 'downloads')

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

FFMPEG_LOCATION = None
for candidate in ['/opt/ffmpeg/ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']:
    if os.path.exists(candidate):
        FFMPEG_LOCATION = os.path.dirname(candidate)
        break

YTDLP_OPTIONS = {
    'quiet': True,
    'no_warnings': False,
    'extract_flat': False,
    'ignoreerrors': True,
    'no_color': True,
    'concurrent_fragment_downloads': 4,
}

if FFMPEG_LOCATION:
    YTDLP_OPTIONS['ffmpeg_location'] = FFMPEG_LOCATION

DOWNLOAD_HISTORY = {}
