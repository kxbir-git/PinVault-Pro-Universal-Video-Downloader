'use client';
import { useState } from 'react';

// Platform icons (SVG paths)
const PLATFORMS = [
  { name: 'Pinterest', color: '#E60023', icon: 'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z' },
  { name: 'Instagram', color: '#E4405F', icon: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z' },
  { name: 'YouTube', color: '#FF0000', icon: 'M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
  { name: 'Facebook', color: '#1877F2', icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  { name: 'TikTok', color: '#010101', icon: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  { name: 'Twitter/X', color: '#000000', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
];

interface VideoMeta {
  title: string;
  description: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  platform: string;
  formats: { format_id: string; ext: string; resolution: string; filesize: number | null }[];
  url: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
  const PYTHON_URL = process.env.NEXT_PUBLIC_PYTHON_URL || 'http://localhost:8001';

  const handleFetchMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setStatus('Fetching video info...');
    setStatusType('info');
    setVideoMeta(null);

    try {
      const res = await fetch(`${PYTHON_URL}/api/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data: VideoMeta = await res.json();
      setVideoMeta(data);
      setStatus(null);
    } catch (error: any) {
      setStatus(error.message || 'Failed to fetch video info. Please check the URL.');
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (formatId?: string) => {
    setIsDownloading(true);
    setStatus('Downloading video... This may take a moment.');
    setStatusType('info');

    try {
      const res = await fetch(`${PYTHON_URL}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), quality: formatId || 'best' }),
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const err = await res.json();
          throw new Error(err.detail || 'Download failed');
        }
        throw new Error(`Download failed (HTTP ${res.status})`);
      }

      // Get the filename from Content-Disposition header
      const disposition = res.headers.get('content-disposition');
      let filename = 'video.mp4';
      if (disposition) {
        const match = disposition.match(/filename="?([^";\n]+)"?/);
        if (match) filename = match[1];
      }

      // Stream the response as a blob and trigger browser download
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      setStatus('✓ Download complete! Check your Downloads folder.');
      setStatusType('success');
    } catch (error: any) {
      setStatus(error.message || 'Download failed. Please try again.');
      setStatusType('error');
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="min-h-screen bg-white text-slate-800 font-sans relative flex flex-col">
      {/* Navbar */}
      <nav className="w-full bg-white border-b border-slate-100 z-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="PinVault Pro" className="w-8 h-8 rounded-lg shadow-sm" />
            <span className="text-xl font-bold tracking-tight text-slate-800">
              PinVault<span className="text-blue-500">Pro</span>
            </span>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium">
            <a href="#features" className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors rounded-full">Features</a>
            <a href="#how-it-works" className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors rounded-full">How it works</a>
            <a href="#platforms" className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors rounded-full">Platforms</a>
            <a href="#" className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors rounded-full">API</a>
          </div>

          {/* Mobile Menu Button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-slate-500 hover:text-slate-700 focus:outline-none"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {isMobileMenuOpen && (
          <div className="sm:hidden absolute top-16 left-0 w-full bg-white border-b border-slate-100 shadow-lg px-4 py-4 flex flex-col gap-2 z-50">
            <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-2.5 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium">Features</a>
            <a href="#how-it-works" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-2.5 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium">How it works</a>
            <a href="#platforms" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-2.5 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium">Platforms</a>
            <a href="#" onClick={() => setIsMobileMenuOpen(false)} className="px-4 py-2.5 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium">API</a>
          </div>
        )}
      </nav>

      {/* Main Content Area */}
      <div className="flex-grow bg-gradient-to-b from-slate-50 to-white relative">

        {/* Ad Placeholder (Top) */}
        <section className="px-4 pt-6 pb-2 w-full flex justify-center">
          <div
            id="top-ad-slot"
            className="w-full max-w-3xl min-h-[60px] sm:min-h-[90px] border-2 border-dashed border-slate-300 bg-slate-50/80 flex items-center justify-center rounded-xl text-slate-400 font-medium tracking-widest text-xs sm:text-sm uppercase transition-all"
          >
            {/* PASTE YOUR TOP AD SCRIPT OR BANNER HERE */}
            <span>Advertisement</span>
          </div>
        </section>

        {/* Hero Section */}
        <section className="relative z-10 flex flex-col items-center justify-center px-4 pt-6 pb-14 max-w-4xl mx-auto text-center">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs sm:text-sm font-semibold mb-6 border border-blue-100 shadow-sm">
            🚀 Universal Video Downloader — 7+ Platforms
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-800 mb-4 sm:mb-6 leading-tight">
            Download Videos <br className="hidden sm:block" />
            from Anywhere.
          </h1>

          <p className="text-slate-500 text-sm sm:text-lg md:text-xl mb-6 max-w-2xl px-2">
            The simplest way to save videos from Pinterest, Instagram, YouTube, Facebook, TikTok, Twitter/X, and more. Completely free, no watermarks.
          </p>

          {/* Supported Platforms Icons */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 mb-8 sm:mb-10 max-w-2xl">
            {PLATFORMS.map((p) => (
              <div key={p.name} className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity bg-white sm:bg-transparent px-2.5 py-1 sm:p-0 rounded-full border sm:border-0 border-slate-100 shadow-xs sm:shadow-none">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill={p.color}>
                  <path d={p.icon} />
                </svg>
                <span className="text-xs sm:text-sm font-medium text-slate-600">{p.name}</span>
              </div>
            ))}
          </div>

          {/* Input Area */}
          <form onSubmit={handleFetchMetadata} className="w-full max-w-2xl relative z-20 px-1 sm:px-0">
            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-white border border-slate-200 rounded-2xl sm:rounded-full p-1.5 sm:p-2 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-slate-200/80 transition-shadow duration-300 gap-2 sm:gap-0">
              <input
                type="url"
                required
                placeholder="Paste video URL (Pinterest, YouTube, Instagram...)"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setVideoMeta(null); setStatus(null); }}
                className="w-full bg-transparent text-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 outline-none placeholder:text-slate-400 placeholder:truncate text-sm sm:text-base md:text-lg rounded-xl sm:rounded-full"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-full font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-md text-sm sm:text-base md:text-lg flex-shrink-0"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Fetching...</span>
                  </>
                ) : (
                  'Get Video'
                )}
              </button>
            </div>
            {status && (
              <p className={`mt-4 text-xs sm:text-sm font-medium text-center animate-pulse px-2 break-words ${statusType === 'error' ? 'text-red-500' : statusType === 'success' ? 'text-green-600' : 'text-blue-600'
                }`}>
                {status}
              </p>
            )}
          </form>

          {/* Video Preview Card */}
          {videoMeta && (
            <div className="w-full max-w-2xl mt-8 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
              <div className="flex flex-col sm:flex-row">
                {/* Thumbnail */}
                {videoMeta.thumbnail && (
                  <div className="w-full sm:w-52 h-44 sm:h-auto flex-shrink-0 bg-slate-100 relative overflow-hidden">
                    <img src={videoMeta.thumbnail} alt={videoMeta.title} className="w-full h-full object-cover" />
                    {videoMeta.duration ? (
                      <span className="absolute bottom-2 right-2 bg-black/75 text-white text-[11px] px-2 py-0.5 rounded font-mono">
                        {formatDuration(videoMeta.duration)}
                      </span>
                    ) : null}
                  </div>
                )}
                {/* Info */}
                <div className="p-4 sm:p-5 flex-grow flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full capitalize border border-blue-100">
                        {videoMeta.platform}
                      </span>
                      {videoMeta.uploader && (
                        <span className="text-xs text-slate-400 truncate max-w-[200px]">by {videoMeta.uploader}</span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-800 line-clamp-2 mb-3 leading-snug">
                      {videoMeta.title}
                    </h3>
                  </div>

                  {/* Quality options */}
                  {videoMeta.formats.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {videoMeta.formats.map((f) => (
                        <button
                          key={f.format_id}
                          onClick={() => handleDownload(f.format_id)}
                          disabled={isDownloading}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold rounded-xl sm:rounded-full transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span>{f.resolution}</span>
                          {f.filesize ? <span className="opacity-70 text-[11px]">({formatSize(f.filesize)})</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleDownload()}
                      disabled={isDownloading}
                      className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl sm:rounded-full transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {isDownloading ? 'Downloading...' : 'Download Best Quality'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* How it Works Section */}
        <section id="how-it-works" className="py-16 bg-white border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-800 mb-12">How to Download Videos</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mb-4 shadow-sm border border-blue-100">1</div>
                <h3 className="text-xl font-bold mb-2">Copy the URL</h3>
                <p className="text-slate-500">Open any supported platform (Pinterest, Instagram, YouTube, etc.), find the video, and copy its link.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mb-4 shadow-sm border border-blue-100">2</div>
                <h3 className="text-xl font-bold mb-2">Paste the Link</h3>
                <p className="text-slate-500">Paste the copied link into the search box above and click &quot;Get Video&quot;.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mb-4 shadow-sm border border-blue-100">3</div>
                <h3 className="text-xl font-bold mb-2">Choose & Download</h3>
                <p className="text-slate-500">Pick your preferred quality and download the video instantly — no watermarks, no signup required.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Supported Platforms Section */}
        <section id="platforms" className="py-16 bg-gradient-to-b from-white to-slate-50 border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-800 mb-4">Supported Platforms</h2>
            <p className="text-center text-slate-500 mb-12 max-w-xl mx-auto">Download videos from all major social media and video sharing platforms with a single tool.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { name: 'Pinterest', desc: 'Pins, videos & GIFs', color: 'bg-red-50 border-red-100', iconColor: '#E60023' },
                { name: 'Instagram', desc: 'Reels, Stories & Posts', color: 'bg-pink-50 border-pink-100', iconColor: '#E4405F' },
                { name: 'YouTube', desc: 'Videos & Shorts', color: 'bg-red-50 border-red-100', iconColor: '#FF0000' },
                { name: 'Facebook', desc: 'Videos & Reels', color: 'bg-blue-50 border-blue-100', iconColor: '#1877F2' },
                { name: 'TikTok', desc: 'Videos without watermark', color: 'bg-slate-50 border-slate-200', iconColor: '#010101' },
                { name: 'Twitter / X', desc: 'Video tweets & GIFs', color: 'bg-slate-50 border-slate-200', iconColor: '#000000' },
                { name: 'Reddit', desc: 'Video posts', color: 'bg-orange-50 border-orange-100', iconColor: '#FF4500' },
                { name: 'Vimeo', desc: 'HD & 4K videos', color: 'bg-cyan-50 border-cyan-100', iconColor: '#1AB7EA' },
              ].map((platform) => (
                <div key={platform.name} className={`${platform.color} border rounded-2xl p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow`}>
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
                    <span className="text-lg font-bold" style={{ color: platform.iconColor }}>{platform.name[0]}</span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">{platform.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{platform.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 bg-slate-50 border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-3">Why use PinVault Pro?</h2>
              <p className="text-slate-500 text-sm sm:text-base">Fast, high-quality, and unlimited video downloads with no restrictions.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-start hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 mb-4 shadow-sm border border-blue-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">Lightning Fast Speeds</h4>
                <p className="text-slate-500 text-sm">Our global edge network processes and delivers video downloads instantly.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-start hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500 mb-4 shadow-sm border border-purple-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">1080p & 4K Quality</h4>
                <p className="text-slate-500 text-sm">Download raw original files in crystal-clear HD, 1080p, and 4K quality with full audio.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-start hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-green-500 mb-4 shadow-sm border border-green-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
                </div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">7+ Platforms Supported</h4>
                <p className="text-slate-500 text-sm">Pinterest, Instagram, YouTube, Facebook, TikTok, Twitter/X, Reddit — all in one tool.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-start hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 mb-4 shadow-sm border border-rose-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h4 className="text-lg font-bold text-slate-800 mb-2">100% Free & Secure</h4>
                <p className="text-slate-500 text-sm">We don&apos;t log your downloads or store your data. No registration or subscription required.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Ad Placeholder (Bottom) */}
        <section className="px-4 py-10 w-full flex justify-center bg-white">
          <div
            id="bottom-ad-slot"
            className="w-full max-w-4xl min-h-[60px] sm:min-h-[90px] border-2 border-dashed border-slate-300 bg-slate-50/80 flex items-center justify-center rounded-xl text-slate-400 font-medium tracking-widest text-xs sm:text-sm uppercase transition-all"
          >
            {/* PASTE YOUR BOTTOM AD SCRIPT OR BANNER HERE */}
            <span>Advertisement</span>
          </div>
        </section>

      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src="/logo.svg" alt="PinVault Pro" className="w-8 h-8 rounded-lg" />
              <span className="text-xl font-bold tracking-tight text-white">PinVault<span className="text-blue-500">Pro</span></span>
            </div>
            <p className="text-sm text-slate-400 max-w-sm">
              The #1 universal video downloader. Save videos from Pinterest, Instagram, YouTube, Facebook, TikTok, and more. We respect copyright and encourage users to only download content for personal use.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Links</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Home</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Developer API</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">DMCA / Copyright</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-slate-800 text-sm text-slate-500 text-center flex flex-col md:flex-row justify-between items-center">
          <p>© 2026 PinVault Pro. All rights reserved.</p>
          <div className="mt-4 md:mt-0 flex gap-4">
          </div>
        </div>
      </footer>
    </main>
  );
}
