# YTDLnis Web

A web-based video/audio downloader powered by yt-dlp. This is a web port of the [YTDLnis Android app](https://github.com/deniscerri/ytdlnis).

## Features

- Download video/audio from 1000+ websites (YouTube, Twitter, Instagram, etc.)
- Choose from available video/audio formats and qualities
- Playlist support with batch download
- Real-time download progress via SSE
- Audio extraction (MP3, AAC, M4A, Opus, FLAC, WAV)
- Quick download buttons
- Dark/light theme
- Custom yt-dlp arguments

## Local Development

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000

## Deploy to Render

1. Fork this repo
2. On Render, create a new Web Service
3. Connect your forked repo
4. Render will auto-detect `render.yaml`

Or manually:
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`

## Deploy to Vercel

1. Fork this repo
2. On Vercel, import the repo
3. Framework: Other
4. Root directory: `web/` (if in subdirectory)
5. Vercel will auto-detect the Python runtime via `vercel.json`

## Deploy anywhere else

Standard Flask app with Gunicorn/WSGI:

```bash
pip install -r requirements.txt
gunicorn app:app --bind 0.0.0.0:5000 --workers 2
```
