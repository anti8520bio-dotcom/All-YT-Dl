import type { APIRoute } from 'astro';

async function extractPlayerResponse(videoId: string): Promise<any> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) throw new Error(`YouTube returned status ${response.status}`);
  const html = await response.text();

  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});\s*(?:var|let|const|window\.)?/s);
  if (!match) throw new Error('Could not extract player response from YouTube page');

  return JSON.parse(match[1]);
}

const QUALITY_HEIGHTS: Record<string, number> = {
  '360': 360,
  '480': 480,
  '720': 720,
  '1085': 1080,
};

export const GET: APIRoute = async ({ url: reqUrl }) => {
  const videoUrl = reqUrl.searchParams.get('videoUrl');
  const videoQuality = reqUrl.searchParams.get('quality') || '720';
  const isAudioOnly = reqUrl.searchParams.get('audioOnly') === 'true';

  if (!videoUrl) {
    return new Response(JSON.stringify({ error: 'Missing videoUrl param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idMatch = videoUrl.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|shorts\/)([^#\&\?]*).*/);
  const videoId = idMatch?.[2]?.length === 11 ? idMatch[2] : null;
  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const playerResponse = await extractPlayerResponse(videoId);
    const streamingData = playerResponse.streamingData || {};
    const rawFormats: any[] = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

    let targetFormat: any = null;

    if (isAudioOnly) {
      targetFormat = rawFormats
        .filter((f: any) => f.mimeType?.startsWith('audio/') && f.url)
        .sort((a: any, b: any) => (parseInt(b.bitrate || '0') - parseInt(a.bitrate || '0')))[0];
    } else {
      const targetHeight = QUALITY_HEIGHTS[videoQuality] || 720;

      targetFormat = rawFormats
        .filter((f: any) => f.mimeType?.startsWith('video/') && f.url && f.height)
        .filter((f: any) => f.height <= targetHeight)
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];

      if (!targetFormat) {
        targetFormat = rawFormats
          .filter((f: any) => f.mimeType?.startsWith('video/') && f.url && f.height)
          .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
      }
    }

    if (!targetFormat) {
      return new Response(JSON.stringify({ error: 'No suitable format found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const downloadUrl = targetFormat.url;
    const mimeType = targetFormat.mimeType?.split(';')[0] || 'video/mp4';
    const ext = isAudioOnly ? 'm4a' : 'mp4';

    const videoResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
      },
    });

    if (!videoResponse.ok) {
      throw new Error(`YouTube CDN returned status ${videoResponse.status}`);
    }

    const contentLength = videoResponse.headers.get('Content-Length') || targetFormat.contentLength;

    return new Response(videoResponse.body, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="yt-download.${ext}"`,
        'Content-Type': mimeType,
        'Content-Length': contentLength || '',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err) {
    console.error('Download error:', err);
    const msg = String(err);
    let userMsg = 'Download failed. Unable to process this video from the server.';

    if (msg.includes('403') || msg.includes('Sign in')) {
      userMsg = 'YouTube is blocking this request. Try again later or use a lower quality.';
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
      userMsg = 'YouTube connection timed out. Please try again.';
    }

    return new Response(JSON.stringify({ error: 'Download failed', message: userMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
