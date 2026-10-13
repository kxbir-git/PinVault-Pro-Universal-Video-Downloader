/**
 * Universal Video URL validator – prevents SSRF by whitelisting known platform hostnames.
 */
const ALLOWED_HOSTS = new Set([
  // Pinterest
  'pinterest.com', 'www.pinterest.com', 'pin.it', 'in.pinterest.com',
  // YouTube
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
  // Instagram
  'instagram.com', 'www.instagram.com',
  // Facebook
  'facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com',
  // TikTok
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  // Twitter / X
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  // Reddit
  'reddit.com', 'www.reddit.com', 'old.reddit.com',
  // Vimeo
  'vimeo.com', 'www.vimeo.com'
]);

export function validateVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.length > 2000) return false;

  try {
    const parsed = new URL(url);

    // Only HTTPS (or HTTP for short links)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    // Must be a known host
    const host = parsed.hostname.toLowerCase();
    
    if (ALLOWED_HOSTS.has(host) || host.endsWith('.pinterest.com')) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}
