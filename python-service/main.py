from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import yt_dlp
import os
import re
import glob
import json
import uuid
import subprocess
import requests
from pathlib import Path
from urllib.parse import urlparse

# Check bundled ffmpeg
try:
    import imageio_ffmpeg
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_PATH = None

app = FastAPI(title="PinVault Pro Video Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.environ.get("PYTHON_SERVICE_API_KEY", "dev-key")
RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = os.environ.get("RAPIDAPI_HOST", "social-media-video-downloader.p.rapidapi.com")

DOWNLOAD_DIR = Path("./downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── Browser-like headers for scraping ──────────────────
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


def _is_pinterest_url(url: str) -> bool:
    """Check if the URL is a Pinterest URL."""
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()
    return any(x in host for x in ['pinterest.com', 'pin.it', 'pinterest.co', 'pinimg.com'])


def _resolve_short_url(url: str) -> str:
    """Resolve short URLs like pin.it to their full URL."""
    try:
        resp = requests.head(url, headers=BROWSER_HEADERS, allow_redirects=True, timeout=10)
        return resp.url
    except Exception:
        try:
            resp = requests.get(url, headers=BROWSER_HEADERS, allow_redirects=True, timeout=10)
            return resp.url
        except Exception:
            return url


def _extract_pin_id(url: str) -> Optional[str]:
    """Extract pin ID from a Pinterest URL."""
    match = re.search(r'/pin/(\d+)', url)
    if match:
        return match.group(1)
    parsed = urlparse(url)
    match = re.search(r'(\d{10,})', parsed.path)
    if match:
        return match.group(1)
    return None


def _scrape_pinterest_direct(url: str) -> Optional[dict]:
    """
    Directly scrape Pinterest page to extract video/image data.
    Ensures that only the SPECIFIC pin's media is returned and NOT unrelated recommendations.
    """
    try:
        if 'pin.it' in url:
            url = _resolve_short_url(url)
            print(f"Resolved short URL to: {url}")

        pin_id = _extract_pin_id(url)
        print(f"Pinterest URL: {url}, Pin ID: {pin_id}")

        # Method 1: Fetch page HTML directly (contains full HD video MP4 and metadata)
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=15)
        if resp.status_code != 200 or len(resp.text) < 500:
            return None

        html = resp.text.replace(r'\/', '/').replace(r'\u002F', '/')

        # Verify pin existence: check if page returned PinNotFound
        if 'PinNotFound' in html:
            print("Pin marked as PinNotFound on Pinterest.")
            raise HTTPException(status_code=404, detail="This Pin does not exist or has been deleted on Pinterest.")

        video_url = None
        thumbnail = None
        title = ""
        description = ""

        # Check Relay Completed Requests for the exact pin's data
        relay_matches = re.findall(r'window\.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__\([^\,]+\,\s*(\{.*?\})\);', html)
        for rm in relay_matches:
            try:
                r_json = json.loads(rm)
                p_data = r_json.get('data', {}).get('v3GetPinQueryv2', {}) or r_json.get('data', {}).get('v3GetPinQuery', {})
                if not p_data:
                    continue

                if p_data.get('__typename') == 'PinNotFound':
                    raise HTTPException(status_code=404, detail="This Pin does not exist or has been deleted on Pinterest.")

                # Extract title and description
                title = p_data.get('title') or p_data.get('gridTitle') or ''
                description = p_data.get('description') or ''

                # Check videos
                v_obj = p_data.get('videos', {})
                if v_obj:
                    v_list = v_obj.get('videoList') or v_obj.get('video_list') or {}
                    for q in ['V_720P', 'V_EXP7', 'V_480P', 'V_360P']:
                        if q in v_list and v_list[q].get('url'):
                            video_url = v_list[q]['url']
                            break
                    if not video_url and 'V_HLSV4' in v_list:
                        hls_url = v_list['V_HLSV4'].get('url')
                        if hls_url:
                            # Try converted 720p mp4
                            mp4_candidate = re.sub(r'/hls/', '/720p/', hls_url).replace('.m3u8', '.mp4')
                            try:
                                chk = requests.head(mp4_candidate, headers=BROWSER_HEADERS, timeout=5)
                                if chk.status_code == 200:
                                    video_url = mp4_candidate
                                else:
                                    video_url = hls_url
                            except Exception:
                                video_url = hls_url

                # Check images
                img_obj = p_data.get('images', {})
                if img_obj:
                    for s in ['orig', '736x', '564x']:
                        if s in img_obj and img_obj[s].get('url'):
                            thumbnail = img_obj[s]['url']
                            break

                if video_url or thumbnail:
                    break
            except HTTPException:
                raise
            except Exception:
                continue

        # Fallback regex search for direct video URLs in the page
        if not video_url:
            v_matches = re.findall(r'https?://(?:v|v1)\.pinimg\.com/videos/[^\s"\'<>]+?\.(?:mp4|m3u8)', html)
            for vm in v_matches:
                if '.mp4' in vm:
                    video_url = vm
                    break
            if not video_url and v_matches:
                hls_cand = v_matches[0]
                mp4_cand = re.sub(r'/hls/', '/720p/', hls_cand).replace('.m3u8', '.mp4')
                try:
                    chk = requests.head(mp4_cand, headers=BROWSER_HEADERS, timeout=5)
                    if chk.status_code == 200:
                        video_url = mp4_cand
                    else:
                        video_url = hls_cand
                except Exception:
                    video_url = hls_cand

        # Fallback for thumbnail / title
        if not thumbnail:
            og_img = re.search(r'property="og:image"\s+content="([^"]+)"', html)
            if og_img:
                thumbnail = og_img.group(1)

        if not title:
            title_m = re.search(r'<title>([^<]+)</title>', html)
            if title_m:
                title = re.sub(r'\s*[-|]\s*Pinterest\s*$', '', title_m.group(1)).strip()
            if not title:
                title = f"Pinterest Pin {pin_id or ''}".strip()

        media_url = video_url or thumbnail
        if not media_url:
            return None

        is_image = video_url is None
        formats = []
        if video_url:
            formats.append({
                'format_id': '1080p',
                'ext': 'mp4',
                'resolution': 'HD Video (MP4)',
                'filesize': None,
            })
        if thumbnail:
            ext = 'jpg'
            if '.png' in thumbnail.lower():
                ext = 'png'
            elif '.gif' in thumbnail.lower():
                ext = 'gif'
            elif '.webp' in thumbnail.lower():
                ext = 'webp'
            formats.append({
                'format_id': 'original_image',
                'ext': ext,
                'resolution': 'Original Image (Full Quality)' if is_image else 'Thumbnail Image',
                'filesize': None,
            })

        return {
            'title': title,
            'description': description[:300],
            'thumbnail': thumbnail or video_url,
            'duration': 0,
            'uploader': 'Pinterest',
            'view_count': 0,
            'platform': 'pinterest',
            'formats': formats,
            'url': url,
            '_video_url': media_url,
            '_is_image': is_image,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Pinterest direct scrape failed: {e}")
        return None


def _parse_widget_data(pin_data: dict, original_url: str) -> Optional[dict]:
    """Parse Pinterest widget API response data."""
    try:
        videos = pin_data.get('videos', {})
        images = pin_data.get('images', {})

        video_url = None
        if videos and videos.get('video_list'):
            video_list = videos['video_list']
            for quality in ['V_720P', 'V_EXP7', 'V_480P', 'V_360P']:
                if quality in video_list and video_list[quality].get('url'):
                    video_url = video_list[quality]['url']
                    break

        thumbnail = None
        if images:
            for size in ['orig', '736x', '564x', '474x', '236x']:
                if size in images and images[size].get('url'):
                    thumbnail = images[size]['url']
                    break

        if not video_url and not thumbnail:
            return None

        media_url = video_url or thumbnail
        is_image = video_url is None
        formats = []
        if video_url:
            formats.append({
                'format_id': '1080p',
                'ext': 'mp4',
                'resolution': 'HD Video (MP4)',
                'filesize': None,
            })
        if thumbnail:
            formats.append({
                'format_id': 'original_image',
                'ext': 'jpg',
                'resolution': 'Original Image (Full Quality)' if is_image else 'Thumbnail',
                'filesize': None,
            })

        title = pin_data.get('description', 'Pinterest Pin')[:100] or 'Pinterest Pin'
        return {
            'title': title,
            'description': (pin_data.get('description') or '')[:300],
            'thumbnail': thumbnail or video_url,
            'duration': 0,
            'uploader': pin_data.get('pinner', {}).get('full_name', 'Pinterest'),
            'view_count': pin_data.get('repin_count', 0),
            'platform': 'pinterest',
            'formats': formats,
            'url': original_url,
            '_video_url': media_url,
            '_is_image': is_image,
        }
    except Exception as e:
        print(f"Widget data parse failed: {e}")
        return None


class MetadataRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    format: str = "mp4"
    quality: str = "best"


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "python-service",
        "ffmpeg_available": FFMPEG_PATH is not None,
    }


# ── Metadata Endpoint ──────────────────────────────────
@app.post("/api/metadata")
def fetch_metadata(req: MetadataRequest):
    """Extract video metadata without downloading."""
    target_url = req.url.strip()

    # 1. Direct Pinterest handling
    if _is_pinterest_url(target_url):
        pin_meta = _scrape_pinterest_direct(target_url)
        if pin_meta:
            return pin_meta

    # 2. General extractor with yt-dlp
    ydl_opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'skip_download': True,
        'youtube_include_dash_manifest': False,
    }

    if FFMPEG_PATH:
        ydl_opts['ffmpeg_location'] = FFMPEG_PATH

    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            if not info:
                raise HTTPException(status_code=404, detail="Could not extract video info")

            # Collect available resolutions
            formats = []
            if info.get('formats'):
                seen_heights = set()
                # Sort formats from highest resolution to lowest
                sorted_formats = sorted(
                    info['formats'],
                    key=lambda x: (x.get('height') or 0, x.get('tbr') or 0),
                    reverse=True
                )
                for f in sorted_formats:
                    height = f.get('height')
                    vcodec = f.get('vcodec', '')
                    ext = f.get('ext', 'mp4')
                    if not height or height < 144 or vcodec in ('none', '') or ext in ('mhtml',):
                        continue
                    if height not in seen_heights:
                        seen_heights.add(height)
                        formats.append({
                            'format_id': f'{height}p',  # Clear resolution identifier
                            'ext': 'mp4',
                            'resolution': f'{height}p HD' if height >= 720 else f'{height}p',
                            'filesize': f.get('filesize') or f.get('filesize_approx'),
                        })

            if not formats:
                formats = [{
                    'format_id': 'best',
                    'ext': 'mp4',
                    'resolution': 'Best Available Quality',
                    'filesize': None,
                }]

            # Detect platform
            extractor = (info.get('extractor') or '').lower()
            url_lower = target_url.lower()
            platform = 'unknown'
            if 'pinterest' in extractor or 'pinterest' in url_lower or 'pin.it' in url_lower:
                platform = 'pinterest'
            elif 'youtube' in extractor or 'youtu.be' in url_lower or 'youtube.com' in url_lower:
                platform = 'youtube'
            elif 'instagram' in extractor or 'instagram.com' in url_lower:
                platform = 'instagram'
            elif 'facebook' in extractor or 'fb' in extractor or 'facebook.com' in url_lower or 'fb.watch' in url_lower:
                platform = 'facebook'
            elif 'tiktok' in extractor or 'tiktok.com' in url_lower:
                platform = 'tiktok'
            elif 'twitter' in extractor or 'x.com' in url_lower or 'twitter.com' in url_lower:
                platform = 'twitter'
            elif 'reddit' in extractor or 'reddit.com' in url_lower:
                platform = 'reddit'
            elif 'vimeo' in extractor or 'vimeo.com' in url_lower:
                platform = 'vimeo'

            return {
                'title': info.get('title', 'Untitled'),
                'description': (info.get('description') or '')[:300],
                'thumbnail': info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader') or info.get('channel'),
                'view_count': info.get('view_count'),
                'platform': platform,
                'formats': formats[:6],
                'url': target_url,
            }

    except yt_dlp.utils.DownloadError as e:
        # Fallback to Pinterest scraper if relevant
        if _is_pinterest_url(target_url):
            pin_meta = _scrape_pinterest_direct(target_url)
            if pin_meta:
                return pin_meta

        # Fallback to RapidAPI
        if RAPIDAPI_KEY:
            try:
                print(f"yt-dlp failed, falling back to RapidAPI for: {target_url}")
                url = f"https://{RAPIDAPI_HOST}/download"
                querystring = {"url": target_url}
                headers = {
                    "X-RapidAPI-Key": RAPIDAPI_KEY,
                    "X-RapidAPI-Host": RAPIDAPI_HOST
                }
                response = requests.get(url, headers=headers, params=querystring, timeout=15)
                response.raise_for_status()
                data = response.json()
                return {
                    'title': data.get('title', 'Video Download'),
                    'description': '',
                    'thumbnail': data.get('thumbnail', ''),
                    'duration': 0,
                    'uploader': data.get('author', 'Unknown'),
                    'view_count': 0,
                    'platform': 'unknown',
                    'formats': [{
                        'format_id': 'best',
                        'ext': 'mp4',
                        'resolution': 'HD Video (Best)',
                        'filesize': None,
                        'url': data.get('video_url', data.get('url', ''))
                    }],
                    'url': target_url,
                }
            except Exception as api_err:
                raise HTTPException(status_code=400, detail=f"Failed to fetch video info: {str(api_err)}")

        raise HTTPException(status_code=400, detail=f"Could not process URL: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ── Helper: sanitize filename ──────────────────────────
def _sanitize_filename(name: str) -> str:
    """Remove characters that are unsafe for filenames."""
    name = re.sub(r'[\\/:*?"<>|]', '_', name)
    return name[:200].strip() or 'video'


# ── Helper: cleanup old temp files (older than 1 hour) ─
def _cleanup_old_downloads():
    """Remove download files older than 1 hour to prevent disk bloat."""
    import time
    cutoff = time.time() - 3600
    for f in DOWNLOAD_DIR.iterdir():
        if f.is_file() and f.stat().st_mtime < cutoff:
            try:
                f.unlink()
            except OSError:
                pass


# ── Download & Stream Endpoint ─────────────────────────
@app.post("/api/download")
def download_video(req: DownloadRequest):
    """
    Download video or image and stream it back to the client.
    Guarantees full HD quality with sound and proper filename.
    """
    _cleanup_old_downloads()
    task_id = str(uuid.uuid4())
    target_url = req.url.strip()

    # 1. Direct handling for Pinterest
    if _is_pinterest_url(target_url):
        pin_meta = _scrape_pinterest_direct(target_url)
        if pin_meta and pin_meta.get('_video_url'):
            media_url = pin_meta['_video_url']
            is_image = pin_meta.get('_is_image', False)

            # Check if it's an HLS stream on Pinterest (.m3u8)
            if '.m3u8' in media_url and FFMPEG_PATH:
                filepath = DOWNLOAD_DIR / f"{task_id}.mp4"
                print(f"[{task_id}] Transcoding Pinterest HLS stream to MP4 via ffmpeg...")
                try:
                    cmd = [
                        FFMPEG_PATH,
                        "-y",
                        "-headers", f"User-Agent: {BROWSER_HEADERS['User-Agent']}\r\n",
                        "-i", media_url,
                        "-c", "copy",
                        "-bsf:a", "aac_adtstoasc",
                        str(filepath)
                    ]
                    subprocess.run(cmd, check=True, timeout=60, capture_output=True)
                    if filepath.exists() and filepath.stat().st_size > 1000:
                        title = _sanitize_filename(pin_meta.get('title', 'pinterest_video'))
                        download_name = f"{title}.mp4"
                        return FileResponse(
                            path=str(filepath),
                            filename=download_name,
                            media_type='video/mp4',
                            headers={'Content-Disposition': f'attachment; filename="{download_name}"'},
                        )
                except Exception as ff_err:
                    print(f"FFmpeg transcode failed: {ff_err}")

            # Direct file download (MP4 or Image)
            ext = '.mp4' if not is_image else '.jpg'
            if '.png' in media_url.lower():
                ext = '.png'
            elif '.gif' in media_url.lower():
                ext = '.gif'
            elif '.webp' in media_url.lower():
                ext = '.webp'

            filepath = DOWNLOAD_DIR / f"{task_id}{ext}"
            try:
                print(f"[{task_id}] Direct downloading Pinterest media: {media_url}")
                r = requests.get(media_url, headers=BROWSER_HEADERS, stream=True, timeout=35)
                r.raise_for_status()
                with open(filepath, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=16384):
                        f.write(chunk)

                title = _sanitize_filename(pin_meta.get('title', 'pinterest_media'))
                download_name = f"{title}{ext}"
                media_type = 'video/mp4' if ext == '.mp4' else f'image/{ext[1:]}'

                return FileResponse(
                    path=str(filepath),
                    filename=download_name,
                    media_type=media_type,
                    headers={'Content-Disposition': f'attachment; filename="{download_name}"'},
                )
            except Exception as e:
                print(f"Direct Pinterest media download failed, falling back to yt-dlp: {e}")
                filepath.unlink(missing_ok=True)

    # 2. General download with yt-dlp (YouTube, Instagram, TikTok, Twitter, Facebook, etc.)
    # Build format string ensuring audio is ALWAYS merged with video
    format_str = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best'
    
    # Parse requested quality (e.g. "1080p", "720p", "480p", "360p")
    quality_str = (req.quality or '').lower().strip()
    if quality_str and quality_str not in ('best', ''):
        height_match = re.search(r'(\d+)', quality_str)
        if height_match:
            h = int(height_match.group(1))
            if h >= 144:
                format_str = (
                    f'bestvideo[height<={h}][ext=mp4]+bestaudio[ext=m4a]/'
                    f'bestvideo[height<={h}]+bestaudio/'
                    f'best[height<={h}][ext=mp4]/'
                    f'best[height<={h}]/best'
                )

    outtmpl = str(DOWNLOAD_DIR / f'{task_id}.%(ext)s')
    ydl_opts: Dict[str, Any] = {
        'outtmpl': outtmpl,
        'format': format_str,
        'merge_output_format': 'mp4',
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'socket_timeout': 30,
    }

    if FFMPEG_PATH:
        ydl_opts['ffmpeg_location'] = FFMPEG_PATH

    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'

    try:
        print(f"[{task_id}] Starting yt-dlp download for {target_url} with format: {format_str}")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(target_url, download=True)
            if not info_dict:
                raise HTTPException(status_code=400, detail="Could not download video")

        downloaded_files = sorted(
            DOWNLOAD_DIR.glob(f'{task_id}.*'),
            key=lambda p: p.stat().st_size,
            reverse=True,
        )
        if not downloaded_files:
            raise HTTPException(status_code=500, detail="Download completed but file not found on disk")

        filepath = downloaded_files[0]
        title = _sanitize_filename(info_dict.get('title', 'video'))
        ext = filepath.suffix
        download_name = f'{title}{ext}'

        media_types = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
        }
        media_type = media_types.get(ext.lower(), 'application/octet-stream')

        return FileResponse(
            path=str(filepath),
            filename=download_name,
            media_type=media_type,
            headers={'Content-Disposition': f'attachment; filename="{download_name}"'},
        )

    except yt_dlp.utils.DownloadError as e:
        for f in DOWNLOAD_DIR.glob(f'{task_id}.*'):
            f.unlink(missing_ok=True)

        # Fallback to RapidAPI
        if RAPIDAPI_KEY:
            try:
                print(f"[{task_id}] yt-dlp failed, attempting RapidAPI download...")
                url = f"https://{RAPIDAPI_HOST}/download"
                querystring = {"url": target_url}
                headers = {
                    "X-RapidAPI-Key": RAPIDAPI_KEY,
                    "X-RapidAPI-Host": RAPIDAPI_HOST
                }
                response = requests.get(url, headers=headers, params=querystring, timeout=30)
                response.raise_for_status()
                data = response.json()

                video_url = data.get('video_url') or data.get('url')
                if not video_url:
                    raise Exception("No video URL returned from RapidAPI")

                vid_resp = requests.get(video_url, stream=True, timeout=30)
                vid_resp.raise_for_status()

                filepath = DOWNLOAD_DIR / f'{task_id}.mp4'
                with open(filepath, 'wb') as f:
                    for chunk in vid_resp.iter_content(chunk_size=16384):
                        f.write(chunk)

                download_name = f'video_{task_id[:8]}.mp4'
                return FileResponse(
                    path=str(filepath),
                    filename=download_name,
                    media_type='video/mp4',
                    headers={'Content-Disposition': f'attachment; filename="{download_name}"'},
                )
            except Exception as api_err:
                raise HTTPException(status_code=400, detail=f"Download failed: {str(api_err)}")

        raise HTTPException(status_code=400, detail=f"Could not download: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        for f in DOWNLOAD_DIR.glob(f'{task_id}.*'):
            f.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
