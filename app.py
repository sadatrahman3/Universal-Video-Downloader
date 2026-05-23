import os
import re
import json
import uuid
import threading
import queue
import time
import yt_dlp
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_file
from flask_cors import CORS
from config import DOWNLOAD_DIR, YTDLP_OPTIONS, DOWNLOAD_HISTORY

app = Flask(__name__)
CORS(app)

download_progress = {}
active_downloads = {}
stop_events = {}

def sanitize_filename(name):
    return re.sub(r'[<>:"/\\|?*]', '_', name)[:200]

def progress_hook(download_id):
    def hook(d):
        if d.get('status') == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            speed = d.get('speed', 0)
            eta = d.get('eta', 0)
            pct = (downloaded / total * 100) if total else 0
            download_progress[download_id] = {
                'status': 'downloading',
                'percent': round(pct, 1),
                'downloaded': downloaded,
                'total': total,
                'speed': speed,
                'eta': eta,
                'filename': d.get('filename', ''),
            }
        elif d.get('status') == 'finished':
            download_progress[download_id] = {
                'status': 'processing',
                'percent': 100,
                'filename': d.get('filename', ''),
            }
        elif d.get('status') == 'error':
            download_progress[download_id] = {
                'status': 'error',
                'error': str(d.get('error', 'Unknown error')),
            }
    return hook

def extract_info(url, playlist=False):
    opts = {
        **YTDLP_OPTIONS,
        'playlist_items': None if playlist else '1',
        'extract_flat': 'in_playlist' if playlist else False,
    }
    if not playlist:
        opts['playlistend'] = 1

    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)

def get_audio_formats(info):
    audio = []
    for f in info.get('formats', []):
        if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
            abr = f.get('abr', 0)
            audio.append({
                'format_id': f['format_id'],
                'ext': f.get('ext', ''),
                'abr': abr,
                'filesize': f.get('filesize') or f.get('filesize_approx', 0),
                'codec': f.get('acodec', ''),
            })
    seen = {}
    unique = []
    for a in sorted(audio, key=lambda x: x['abr'] or 0, reverse=True):
        key = a['ext']
        if key not in seen:
            seen[key] = True
            unique.append(a)
    return unique

def get_video_formats(info):
    video = []
    for f in info.get('formats', []):
        if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
            video.append({
                'format_id': f['format_id'],
                'ext': f.get('ext', ''),
                'width': f.get('width', 0),
                'height': f.get('height', 0),
                'filesize': f.get('filesize') or f.get('filesize_approx', 0),
                'vcodec': f.get('vcodec', ''),
                'acodec': f.get('acodec', ''),
                'tbr': f.get('tbr', 0),
            })
    seen = set()
    unique = []
    for v in sorted(video, key=lambda x: (x['height'] or 0, x['tbr'] or 0), reverse=True):
        key = (v['height'], v['ext'])
        if key not in seen:
            seen.add(key)
            unique.append(v)
    return unique

def get_video_only_formats(info):
    formats = []
    for f in info.get('formats', []):
        if f.get('vcodec') != 'none' and f.get('acodec') == 'none':
            formats.append({
                'format_id': f['format_id'],
                'ext': f.get('ext', ''),
                'width': f.get('width', 0),
                'height': f.get('height', 0),
                'filesize': f.get('filesize') or f.get('filesize_approx', 0),
                'vcodec': f.get('vcodec', ''),
                'tbr': f.get('tbr', 0),
            })
    seen = set()
    unique = []
    for v in sorted(formats, key=lambda x: (x['height'] or 0, x['tbr'] or 0), reverse=True):
        key = (v['height'], v['ext'])
        if key not in seen:
            seen.add(key)
            unique.append(v)
    return unique

def run_download(download_id, url, fmt, output_template, custom_opts=None):
    stop_events[download_id] = threading.Event()
    active_downloads[download_id] = True

    opts = {
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [progress_hook(download_id)],
        'outtmpl': output_template,
        'ignoreerrors': True,
        'no_color': True,
        'concurrent_fragment_downloads': 4,
        'retries': 10,
        'fragment_retries': 10,
    }

    if custom_opts:
        opts.update(custom_opts)

    if fmt:
        opts['format'] = fmt

    def _download():
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            if download_progress.get(download_id, {}).get('status') != 'error':
                download_progress[download_id] = {
                    'status': 'completed',
                    'percent': 100,
                    'filename': download_progress.get(download_id, {}).get('filename', ''),
                }
        except Exception as e:
            download_progress[download_id] = {
                'status': 'error',
                'error': str(e),
            }
        finally:
            active_downloads[download_id] = False
            stop_events.pop(download_id, None)

    thread = threading.Thread(target=_download, daemon=True)
    thread.start()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def get_info():
    data = request.get_json()
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        info = extract_info(url, playlist=False)
        result = {
            'title': info.get('title', 'Unknown'),
            'thumbnail': info.get('thumbnail', ''),
            'duration': info.get('duration', 0),
            'webpage_url': info.get('webpage_url', url),
            'uploader': info.get('uploader', info.get('channel', 'Unknown')),
            'upload_date': info.get('upload_date', ''),
            'description': (info.get('description') or '')[:500],
            'audio_formats': get_audio_formats(info),
            'video_formats': get_video_formats(info),
            'video_only_formats': get_video_only_formats(info),
            'extractor': info.get('extractor', ''),
            'extractor_key': info.get('extractor_key', ''),
        }

        if info.get('entries') and len(info['entries']) > 1:
            result['is_playlist'] = True
            result['playlist_count'] = len(info['entries'])
            result['playlist_title'] = info.get('title', 'Playlist')
            result['entries'] = []
            for e in info['entries'][:50]:
                if e:
                    result['entries'].append({
                        'title': e.get('title', 'Unknown'),
                        'url': e.get('url') or e.get('webpage_url', ''),
                        'thumbnail': e.get('thumbnail', ''),
                        'duration': e.get('duration', 0),
                    })

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/download', methods=['POST'])
def start_download():
    data = request.get_json()
    url = data.get('url', '').strip()
    download_type = data.get('type', 'video')
    format_id = data.get('format_id', '')
    quality = data.get('quality', '')
    playlist_items = data.get('playlist_items', '')
    custom_args = data.get('custom_args', '')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    download_id = str(uuid.uuid4())[:8]
    sanitized_title = 'downloaded_file'
    output_template = os.path.join(DOWNLOAD_DIR, f'{download_id}_%(title)s.%(ext)s')

    fmt = None
    custom_opts = {}

    if custom_args:
        custom_opts['format'] = format_id if format_id else 'best'
        extra = custom_args.strip()
        for part in extra.split():
            if '=' in part:
                k, v = part.split('=', 1)
                custom_opts[k] = v
    elif download_type == 'audio':
        fmt = f'{format_id}/bestaudio/best'
        custom_opts.update({
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': quality or 'mp3',
                'preferredquality': '320',
            }],
        })
    elif download_type == 'video':
        if format_id:
            fmt = format_id
        else:
            fmt = 'bestvideo+bestaudio/best'
    elif download_type == 'video_only':
        fmt = f'{format_id}/bestvideo' if format_id else 'bestvideo'

    if playlist_items:
        custom_opts['playlist_items'] = playlist_items

    download_progress[download_id] = {'status': 'starting', 'percent': 0}
    DOWNLOAD_HISTORY[download_id] = {
        'id': download_id,
        'url': url,
        'type': download_type,
        'title': 'Starting...',
        'status': 'starting',
        'created_at': time.time(),
    }

    run_download(download_id, url, fmt, output_template, custom_opts)

    return jsonify({'download_id': download_id})


@app.route('/api/progress/<download_id>')
def progress_stream(download_id):
    def generate():
        last_status = None
        while True:
            prog = download_progress.get(download_id)
            if prog:
                yield f'data: {json.dumps(prog)}\n\n'
                if prog.get('status') in ('completed', 'error'):
                    break
                last_status = prog.get('status')
            else:
                if last_status and last_status in ('completed', 'error'):
                    break
                yield f'data: {json.dumps({"status": "waiting", "percent": 0})}\n\n'
            time.sleep(0.5)

    return Response(stream_with_context(generate()), mimetype='text/event-stream')


@app.route('/api/downloads')
def list_downloads():
    downloads = []
    for did, info in DOWNLOAD_HISTORY.items():
        prog = download_progress.get(did, {})
        downloads.append({
            'id': did,
            'url': info.get('url', ''),
            'type': info.get('type', ''),
            'title': info.get('title', ''),
            'status': prog.get('status', info.get('status', 'unknown')),
            'percent': prog.get('percent', 0),
            'speed': prog.get('speed', 0),
            'eta': prog.get('eta', 0),
            'error': prog.get('error', ''),
            'filename': prog.get('filename', ''),
            'created_at': info.get('created_at', 0),
        })
    downloads.sort(key=lambda x: x['created_at'], reverse=True)
    return jsonify(downloads)


@app.route('/api/cancel/<download_id>', methods=['POST'])
def cancel_download(download_id):
    stop_event = stop_events.get(download_id)
    if stop_event:
        stop_event.set()
    download_progress[download_id] = {'status': 'cancelled', 'percent': 0}
    active_downloads[download_id] = False
    return jsonify({'success': True})


@app.route('/api/clear', methods=['POST'])
def clear_downloads():
    to_remove = []
    for did in list(DOWNLOAD_HISTORY.keys()):
        prog = download_progress.get(did, {})
        if prog.get('status') in ('completed', 'error', 'cancelled'):
            to_remove.append(did)
    for did in to_remove:
        DOWNLOAD_HISTORY.pop(did, None)
        download_progress.pop(did, None)
    return jsonify({'success': True, 'removed': len(to_remove)})


@app.route('/api/delete/<download_id>', methods=['POST'])
def delete_download(download_id):
    DOWNLOAD_HISTORY.pop(download_id, None)
    download_progress.pop(download_id, None)
    active_downloads.pop(download_id, None)
    stop_events.pop(download_id, None)
    return jsonify({'success': True})


@app.route('/api/download/<download_id>/file')
def get_download_file(download_id):
    for fname in os.listdir(DOWNLOAD_DIR):
        if fname.startswith(download_id):
            filepath = os.path.join(DOWNLOAD_DIR, fname)
            if os.path.isfile(filepath):
                return send_file(filepath, as_attachment=True, download_name=fname)
    return jsonify({'error': 'File not found'}), 404


@app.route('/api/file/<path:filename>')
def get_file(filename):
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404


@app.route('/api/playlist', methods=['POST'])
def get_playlist():
    data = request.get_json()
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        info = extract_info(url, playlist=True)
        if not info.get('entries'):
            return jsonify({'error': 'No playlist entries found'}), 400

        entries = []
        for e in info['entries']:
            if e:
                entries.append({
                    'title': e.get('title', 'Unknown'),
                    'url': e.get('url') or e.get('webpage_url', ''),
                    'thumbnail': e.get('thumbnail', ''),
                    'duration': e.get('duration', 0),
                    'index': e.get('playlist_index', 0),
                })

        return jsonify({
            'title': info.get('title', 'Playlist'),
            'count': len(entries),
            'entries': entries,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
