import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';

/**
 * Extract available format URLs via yt-dlp --dump-json --no-download.
 * This is fast — it only parses metadata, never downloads any files.
 * The CDN URLs are then used by the client's browser to download directly
 * from YouTube's CDN (avoids server IP rate-limiting entirely).
 */
export const GET: APIRoute = async ({ url: reqUrl }) => {
  const videoUrl = reqUrl.searchParams.get('videoUrl');
  if (!videoUrl) {
    return new Response(JSON.stringify({ error: 'Missing videoUrl param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const json = await runDumpJSON(videoUrl);
    const formats = json.formats || [];

    // Group formats by quality for the frontend
    const result = {
      title: json.title,
      duration: json.duration,
      formats: {
        combined: formats
          .filter((f: any) => f.url && f.vcodec !== 'none' && f.acodec !== 'none')
          .map((f: any) => ({
            qualityLabel: `${f.height}p`,
            height: f.height,
            formatId: f.format_id,
            url: f.url,
            ext: f.ext,
            size: f.filesize || f.filesize_approx || null,
            hasAudio: true,
          })),
        video: formats
          .filter((f: any) => f.url && f.vcodec !== 'none' && f.acodec === 'none')
          .map((f: any) => ({
            qualityLabel: `${f.height}p`,
            height: f.height,
            formatId: f.format_id,
            url: f.url,
            ext: f.ext,
            fps: f.fps,
            size: f.filesize || f.filesize_approx || null,
            hasAudio: false,
          })),
        audio: formats
          .filter((f: any) => f.url && f.vcodec === 'none' && f.acodec !== 'none')
          .map((f: any) => ({
            qualityLabel: `${f.abr || 128}kbps`,
            abr: f.abr,
            formatId: f.format_id,
            url: f.url,
            ext: f.ext,
            size: f.filesize || f.filesize_approx || null,
          })),
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

async function runDumpJSON(videoUrl: string): Promise<any> {
  const args = [
    '-m', 'yt_dlp',
    '--dump-json',
    '--no-download',
    '--js-runtimes', 'deno',
    '--no-progress', '--no-warnings', '-q',
    '--no-playlist',
    videoUrl,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('python', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('Invalid JSON from yt-dlp'));
        }
      } else {
        reject(new Error(`Exit ${code}: ${stderr.slice(0, 200)}`));
      }
    });
    proc.on('error', reject);
  });
}
