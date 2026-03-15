// api/lexica-proxy.js — Vercel serverless function
// Proxies Lexica.art search API to bypass browser CORS restrictions.
// Called by monsterBook.js portrait picker to fetch AI art thumbnails.
export default async function handler(req, res) {
  const q = req.query.q || '';
  try {
    const r = await fetch(
      `https://lexica.art/api/v1/search?q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) throw new Error(`Lexica ${r.status}`);
    const data = await r.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');
    res.json(data);
  } catch {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ images: [] });
  }
}
