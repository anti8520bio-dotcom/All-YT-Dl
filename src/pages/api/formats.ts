import type { APIRoute } from 'astro';

interface YouTubeFormat {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  contentLength?: string;
 品質?: string;
  qualityLabel?: string;
  audioQuality?: string;
  audioChannels?: number;
  approxDurationMs?: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

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

export const GET: APIRoute = async ({ url: reqUrl }) => {
  const videoUrl = reqUrl.searchParams.get('videoUrl');
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
    const videoDetails = playerResponse.videoDetails || {};
    const streamingData = playerResponse.streamingData || {};
    const rawFormats: any[] = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

    const formats = rawFormats
      .filter((f: any) => f.url || f.signatureCipher)
      .map((f: any) => {
        let url = f.url;
        if (!url && f.signatureCipher) {
          const params = new URLSearchParams(f.signatureCipher);
          url = params.get('url') || '';
        }
        if (!url) return null;

        const isVideo = f.mimeType?.startsWith('video/');
        const isAudio = f.mimeType?.startsWith('audio/');

        return {
          itag: f.itag,
          url,
          mimeType: f.mimeType,
          contentLength: f.contentLength,
          qualityLabel: f.qualityLabel || (isVideo ? `${f.height || '?'}p` : null),
          height: f.height || null,
          fps: f.fps || null,
          hasVideo: isVideo,
          hasAudio: isAudio && !f.audioQuality?.includes('AUDIO_QUALITY_LOW'),
          audioQuality: f.audioQuality || null,
          bitrate: f.bitrate || null,
        };
      })
      .filter(Boolean);

    const result = {
      title: videoDetails.title || 'YouTube Video',
      duration: parseInt(videoDetails.lengthSeconds || '0', 10),
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      formats: {
        combined: formats.filter((f: any) => f.hasVideo && f.hasAudio),
        video: formats.filter((f: any) => f.hasVideo && !f.hasAudio),
        audio: formats.filter((f: any) => !f.hasVideo && f.hasAudio),
      },
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Formats API error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to extract video formats',
      message: String(err),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
