import type { APIRoute } from 'astro';
import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  const browser = await browserPromise;
  browser.on('disconnected', () => {
    browserPromise = null;
  });
  return browser;
}

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
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setViewport({
      width: 3840,
      height: 2160,
      deviceScaleFactor: 2,
    });

    await page.goto(validUrl.href, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});

    // Scroll through page to trigger lazy content loading
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 800;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight - 500) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 500));

    if (format === 'pdf') {
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });

      await page.close();

      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="screenshot.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
          'Cache-Control': 'no-cache',
        },
      });
    }

    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'png',
    });

    await page.close();

    return new Response(screenshotBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="screenshot.png"`,
        'Content-Length': screenshotBuffer.length.toString(),
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
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
