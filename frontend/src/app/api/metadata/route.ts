import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const PYTHON_URLS = Array.from(
  new Set(
    [
      process.env.PYTHON_SERVICE_URL,
      process.env.NEXT_PUBLIC_PYTHON_URL,
      'http://127.0.0.1:8001',
      'http://localhost:8001',
      'http://127.0.0.1:8000',
      'http://localhost:8000',
      'http://python-service:8000',
    ].filter(Boolean) as string[]
  )
);

let isSpawningPython = false;

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensurePythonRunning(): Promise<string | null> {
  // Check if any Python URL is already responsive
  for (const url of PYTHON_URLS) {
    if (await checkHealth(url)) {
      return url;
    }
  }

  if (isSpawningPython) {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 500));
      for (const url of PYTHON_URLS) {
        if (await checkHealth(url)) return url;
      }
    }
    return null;
  }

  isSpawningPython = true;
  try {
    const candidateDirs = [
      path.resolve(process.cwd(), '..', 'python-service'),
      path.resolve(process.cwd(), 'python-service'),
      'C:\\Project\\PinVaultPro\\python-service',
    ];

    const serviceDir = candidateDirs.find((d) => fs.existsSync(path.join(d, 'main.py')));
    if (!serviceDir) {
      console.warn('[AutoStart] python-service folder not found in candidates:', candidateDirs);
      return null;
    }

    const pythonBinaries = [
      path.join(serviceDir, 'venv311', 'Scripts', 'python.exe'),
      path.join(serviceDir, 'venv', 'Scripts', 'python.exe'),
      'python.exe',
      'python',
    ];

    const pythonPath = pythonBinaries.find((p) => p.startsWith('python') || fs.existsSync(p)) || 'python';

    console.log(`[AutoStart] Starting Python service from ${serviceDir} using ${pythonPath}...`);

    const sub = spawn(
      pythonPath,
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'],
      {
        cwd: serviceDir,
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      }
    );
    sub.unref();

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 600));
      for (const url of ['http://127.0.0.1:8001', 'http://localhost:8001']) {
        if (await checkHealth(url)) {
          console.log(`[AutoStart] Python service successfully started at ${url}`);
          return url;
        }
      }
    }
    return null;
  } catch (err) {
    console.error('[AutoStart] Failed to spawn Python service:', err);
    return null;
  } finally {
    isSpawningPython = false;
  }
}

// ── Native Direct Pinterest Scraper Fallback ──────────
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function scrapePinterestDirect(url: string) {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const finalUrl = res.url;
    const html = (await res.text()).replace(/\\\//g, '/').replace(/\\u002F/g, '/');

    if (res.status === 404 || html.includes('"PinNotFound"')) {
      return { error: 'This Pin does not exist or has been deleted on Pinterest.', status: 404 };
    }

    let videoUrl: string | null = null;
    let thumbnail: string | null = null;
    let title = '';
    let description = '';

    // Search for video URLs
    const vMatches = html.match(/https?:\/\/(?:v|v1)\.pinimg\.com\/videos\/[^\s"'<>]+?\.(?:mp4|m3u8)/g);
    if (vMatches && vMatches.length > 0) {
      const mp4Match = vMatches.find((m) => m.includes('.mp4'));
      if (mp4Match) {
        videoUrl = mp4Match;
      } else {
        const hls = vMatches[0];
        videoUrl = hls.replace(/\/hls\//, '/720p/').replace('.m3u8', '.mp4');
      }
    }

    if (!videoUrl) {
      const ogVid =
        html.match(/property="og:video(?::secure_url)?"\s+content="([^"]+)"/i) ||
        html.match(/content="([^"]+)"\s+property="og:video(?::secure_url)?"/i);
      if (ogVid) videoUrl = ogVid[1];
    }

    const ogImg =
      html.match(/property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogImg) thumbnail = ogImg[1];

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/\s*[-|]\s*Pinterest\s*$/i, '').trim();
    }
    if (!title) title = 'Pinterest Pin';

    const descMatch =
      html.match(/property="og:description"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+property="og:description"/i);
    if (descMatch) description = descMatch[1].trim();

    const mediaUrl = videoUrl || thumbnail;
    if (!mediaUrl) return null;

    const isImage = !videoUrl;
    const formats: any[] = [];
    if (videoUrl) {
      formats.push({
        format_id: '1080p',
        ext: 'mp4',
        resolution: 'HD Video (MP4)',
        filesize: null,
      });
    }
    if (thumbnail) {
      formats.push({
        format_id: 'original_image',
        ext: 'jpg',
        resolution: isImage ? 'Original Image (Full Quality)' : 'Thumbnail',
        filesize: null,
      });
    }

    return {
      title,
      description: description.slice(0, 300),
      thumbnail: thumbnail || videoUrl,
      duration: 0,
      uploader: 'Pinterest',
      view_count: 0,
      platform: 'pinterest',
      formats,
      url: finalUrl,
      _video_url: mediaUrl,
      _is_image: isImage,
    };
  } catch (err: any) {
    console.error('Direct Pinterest scraper error:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ detail: 'Video URL is required' }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    const isPinterest = /pinterest\.com|pin\.it|pinimg\.com/i.test(trimmedUrl);

    // 1. Ensure Python service is available or auto-started
    const activePyUrl = await ensurePythonRunning();

    // 2. Try Python service if available
    if (activePyUrl) {
      try {
        const res = await fetch(`${activePyUrl}/api/metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmedUrl }),
          signal: AbortSignal.timeout(30000),
        });

        const data = await res.json().catch(() => ({ detail: 'Invalid JSON response from downloader' }));
        if (res.ok) {
          return NextResponse.json(data);
        }

        // If Python returned an error for a Pinterest link, try direct fallback
        if (isPinterest) {
          const directData = await scrapePinterestDirect(trimmedUrl);
          if (directData && !('error' in directData)) {
            return NextResponse.json(directData);
          }
        }

        return NextResponse.json(data, { status: res.status });
      } catch (pyErr: any) {
        console.warn('Call to Python service failed:', pyErr?.message);
      }
    }

    // 3. Fallback for Pinterest if Python was not available or timed out
    if (isPinterest) {
      const directData = await scrapePinterestDirect(trimmedUrl);
      if (directData) {
        if ('error' in directData) {
          return NextResponse.json({ detail: directData.error }, { status: directData.status || 400 });
        }
        return NextResponse.json(directData);
      }
    }

    return NextResponse.json(
      {
        detail:
          'Could not connect to Python downloader service. The service is being started in the background. Please wait 5 seconds and click Fetch again.',
      },
      { status: 503 }
    );
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Internal server error' }, { status: 500 });
  }
}
