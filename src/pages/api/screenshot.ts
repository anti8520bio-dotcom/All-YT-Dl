import type { APIRoute } from 'astro';

const SCREENSHOT_API_KEY = '';

const SCREENSHOT_SERVICES: Record<string, (url: string, format: string) => string> = {
  screenshotlayer: (url, format) =>
    `https://api.screenshotlayer.com/api/capture?access_key=${SCREENSHOT_API_KEY || 'YOUR_KEY'}&url=${encodeURIComponent(url)}&viewport=1920x1080&fullpage=1&format=${format === 'pdf' ? 'PNG' : 'PNG'}`,
  screenshotone: (url, format) =>
    `https://api.screenshotone.com/take?access_key=${SCREENSHOT_API_KEY || 'YOUR_KEY'}&url=${encodeURIComponent(url)}&viewport_width=1920&viewport_height=1080&full_page=true&format=${format === 'pdf' ? 'pdf' : 'png'}`,
};

const DEFAULT_SERVICE = 'screenshotone';

export const GET: APIRoute = async ({ url: reqUrl }) => {
  const targetUrl = reqUrl.searchParams.get('url');
  const format = reqUrl.searchParams.get('format') || 'png';

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let validUrl: URL;
  try {
    const raw = targetUrl.trim();
    validUrl = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const apiUrl = SCREENSHOT_SERVICES[DEFAULT_SERVICE](validUrl.href, format);

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (text.includes('Invalid access key') || text.includes('invalid_access_key')) {
        return new Response(
          JSON.stringify({
            error: 'Screenshot service not configured',
            message: 'Please sign up for a free API key at https://screenshotone.com and set the SCREENSHOT_API_KEY environment variable in Cloudflare Pages.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Screenshot API returned ${response.status}: ${text.slice(0, 200)}`);
    }

    const blob = await response.blob();
    const contentType = format === 'pdf' ? 'application/pdf' : 'image/png';
    const contentDisposition = format === 'pdf'
      ? 'attachment; filename="screenshot.pdf"'
      : 'inline; filename="screenshot.png"';

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Screenshot API error:', err);
    return new Response(
      JSON.stringify({
        error: 'Failed to capture screenshot',
        message: String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
