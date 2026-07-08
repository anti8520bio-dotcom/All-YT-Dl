import type { APIRoute } from 'astro';

const siteUrl = 'https://allytdl.com';

const pages = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/image-to-text', priority: '0.9', changefreq: 'weekly' },
  { loc: '/website-screenshot', priority: '0.9', changefreq: 'weekly' },
  { loc: '/privacy', priority: '0.3', changefreq: 'monthly' },
  { loc: '/terms', priority: '0.3', changefreq: 'monthly' },
];

export const GET: APIRoute = async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((page) => `  <url>
    <loc>${siteUrl}${page.loc}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'no-cache',
    },
  });
};
