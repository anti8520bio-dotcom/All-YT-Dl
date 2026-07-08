import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url: reqUrl }) => {
  try {
    const videoId = reqUrl.searchParams.get('id');
    const type = reqUrl.searchParams.get('type') || 'maxresdefault';

    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Missing video id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imgUrl = `https://img.youtube.com/vi/${videoId}/${type}.jpg`;
    const response = await fetch(imgUrl);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Thumbnail not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const blob = await response.blob();

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${videoId}_${type}.jpg"`,
        'Content-Type': 'image/jpeg',
        'Content-Length': blob.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Thumbnail API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch thumbnail' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
