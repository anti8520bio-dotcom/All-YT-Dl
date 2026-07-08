import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { createReadStream, unlink } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ffmpegPath: string = require('ffmpeg-static') || '';

const formatMap: Record<string, string> = {
  audio: 'bestaudio/best',
  '360': 'best[height<=360]',
  '480': 'best[height<=480]',
  '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
  '1085': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
};

async function downloadToFile(videoUrl: string, format: string, outputPath: string): Promise<void> {
  const args = [
    '-m', 'yt_dlp',
    '-f', format,
    '--js-runtimes', 'deno',
    '--no-progress', '--no-warnings',
    '--no-playlist',
    '--throttled-rate', '100K',
    '--extractor-retries', 'infinite',
    '--retries', 'infinite',
    '--ffmpeg-location', ffmpegPath,
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    videoUrl,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('python', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Exit ${code}: ${stderr.slice(0, 300)}`));
    });
    proc.on('error', reject);
  });
}

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

  const ext = isAudioOnly ? 'm4a' : 'mp4';
  const contentType = isAudioOnly ? 'audio/mp4' : 'video/mp4';
  const ytdlFormat = isAudioOnly
    ? formatMap['audio']
    : (formatMap[videoQuality] || formatMap['720']);

  const tmpId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `${tmpId}.${ext}`);

  try {
    await downloadToFile(videoUrl, ytdlFormat, outputPath);

    const fileStat = await stat(outputPath);
    const stream = createReadStream(outputPath);

    stream.on('close', () => {
      unlink(outputPath).catch(() => {});
    });
    stream.on('error', () => {
      unlink(outputPath).catch(() => {});
    });

    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="yt-download.${ext}"`,
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    unlink(outputPath).catch(() => {});
    console.error('Download error:', err);

    const msg = String(err);
    let userMsg = 'Download failed. Unable to process this video from the server.';

    if (msg.includes('403') || msg.includes('Sign in')) {
      userMsg = 'YouTube is blocking this request. Try again later or use a lower quality.';
    } else if (msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') || msg.includes('ENOTFOUND')) {
      userMsg = 'YouTube connection timed out. Please try again.';
    }

    return new Response(JSON.stringify({ error: 'Download failed', message: userMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
