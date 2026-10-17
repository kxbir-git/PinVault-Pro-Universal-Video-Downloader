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
    if (!serviceDir) return null;

    const pythonBinaries = [
      path.join(serviceDir, 'venv311', 'Scripts', 'python.exe'),
      path.join(serviceDir, 'venv', 'Scripts', 'python.exe'),
      'python.exe',
      'python',
    ];

    const pythonPath = pythonBinaries.find((p) => p.startsWith('python') || fs.existsSync(p)) || 'python';

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
        if (await checkHealth(url)) return url;
      }
    }
    return null;
  } catch (err) {
    console.error('[Download] Failed to auto-start Python:', err);
    return null;
  } finally {
    isSpawningPython = false;
  }
}

// Direct stream fallback for CDN media URLs (e.g. Pinterest mp4/jpg)
async function tryDirectStream(mediaUrl: string, filename = 'video.mp4') {
  try {
    const res = await fetch(mediaUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) return null;

    const headers = new Headers();
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Content-Type', res.headers.get('content-type') || 'video/mp4');
    const contentLength = res.headers.get('content-length');
    if (contentLength) headers.set('content-length', contentLength);

    return new NextResponse(res.body, {
      status: 200,
      headers,
    });
  } catch {
    return null;
  }
}

async function handleDownload(url: string, quality: string) {
  // If the URL is already a direct media file (pinimg, googlevideo, etc.)
  if (url.startsWith('http') && (url.includes('.pinimg.com/videos/') || url.match(/\.(mp4|jpg|jpeg|png|webp)(\?|$)/i))) {
    const extMatch = url.match(/\.(mp4|jpg|jpeg|png|webp)(\?|$)/i);
    const ext = extMatch ? `.${extMatch[1]}` : '.mp4';
    const directStream = await tryDirectStream(url, `download_${Date.now()}${ext}`);
    if (directStream) return directStream;
  }

  const activePyUrl = await ensurePythonRunning();
  if (activePyUrl) {
    try {
      const res = await fetch(`${activePyUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, quality }),
        signal: AbortSignal.timeout(600000),
      });

      if (res.ok) {
        const headers = new Headers();
        const rawDisposition = res.headers.get('content-disposition');
        const contentType = res.headers.get('content-type') || 'application/octet-stream';

        if (rawDisposition) {
          const safeDisposition = rawDisposition.replace(/[^\x20-\x7E]/g, '_');
          headers.set('content-disposition', safeDisposition);
        }
        headers.set('content-type', contentType);
        const contentLength = res.headers.get('content-length');
        if (contentLength) headers.set('content-length', contentLength);

        return new NextResponse(res.body, {
          status: 200,
          headers,
        });
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errJson = await res.json().catch(() => ({}));
        return NextResponse.json(errJson, { status: res.status });
      }
      return NextResponse.json({ detail: `Download failed with HTTP ${res.status}` }, { status: res.status });
    } catch (err: any) {
      console.warn('Python download service error:', err?.message);
    }
  }

  return NextResponse.json(
    {
      detail: 'Downloader backend service is not ready. Please try again in a few moments.',
    },
    { status: 503 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, quality = 'best' } = body;

    if (!url) {
      return NextResponse.json({ detail: 'URL is required' }, { status: 400 });
    }

    return await handleDownload(url, quality);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const quality = searchParams.get('quality') || 'best';

    if (!url) {
      return NextResponse.json({ detail: 'URL is required' }, { status: 400 });
    }

    return await handleDownload(url, quality);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Internal server error' }, { status: 500 });
  }
}
