# Nokta İletişim – Teknik Servis Portalı

Müşteriler servis koduyla cihazlarının durumunu sorgular, servis talebi gönderir, sıfır/2. el telefon ve takas bilgisi alır. Tekniker paneliyle kayıtlar, yorumlar ve gelir-gider yönetilir. Derleme gerektirmez (statik site + Firebase + Vercel).

## Dosyalar
- Sayfalar: `index.html` (sorgu, ön bilgi formu, alım-satım, yorumlar), `servis-talebi.html`, `satis-takas.html`, `iletisim.html`, `sik-sorulanlar.html`, 5 hizmet sayfası, `kvkk.html`, `panel.html` (tekniker), `qr-plakat.html` (yazdırılabilir QR plakatları)
- `style.css`, `app.js`: tüm stil ve kod
- `firestore.rules`: Firebase güvenlik kuralları (Firebase Console → Firestore → Rules → Publish)
- `api/whoami.js`: Vercel fonksiyonu; `vercel.json`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `sw.js`

## Yayınlama
1. Dosyaları GitHub'a yükleyin; Vercel otomatik yayınlar.
2. `firestore.rules` içeriğini Firebase'de **Publish** edin (yeni kural yazıldığında tekrar).
3. Google Search Console → `sitemap.xml` gönderin.

## Notlar
- Yorumlar: müşteri sitede yazar, tekniker panelde **Yorumlar** sekmesinden siler.
- "Teslime hazır" / "Teslim edildi" WhatsApp mesajları Google yorum bağlantısını içerir (`GOOGLE_REVIEW_URL` in `app.js`).
- Alan adı alınınca: `index.html` ve diğer sayfalardaki `nokta-iletisim.vercel.app` adreslerini, `sitemap.xml` ve `robots.txt` içindeki adresi yeni alanla değiştirin.
- `qr-plakat.html` adresini açıp **Yazdır**'a basın (sitenizin adresine göre QR otomatik üretilir).
