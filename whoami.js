// Vercel serverless funksiyası: ziyaretçinin IP ve (yaklaşık) şehir bilgisini döndürür.
// Yalnızca tekniker paneli oturum kaydı için kullanılır; müşteri ziyaretlerinde çağrılmaz.
module.exports = (req, res) => {
  const h = req.headers;
  const ip = String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '').trim();
  const dec = v => { try { return decodeURIComponent(String(v || '')); } catch (e) { return String(v || ''); } };
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ip,
    city: dec(h['x-vercel-ip-city']),
    region: dec(h['x-vercel-ip-country-region']),
    country: dec(h['x-vercel-ip-country'])
  });
};
