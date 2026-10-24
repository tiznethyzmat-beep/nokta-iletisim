# Nokta İletişim – Teknik Servis Portalı

Müşteriler servis koduyla cihazlarının durumunu sorgular; tekniker paneliyle kayıtlar yönetilir.
Derleme gerektirmez: **3 dosya** (`index.html`, `style.css`, `app.js`) + logo.

```
├── index.html        Sayfa (tüm ekranlar)
├── style.css         Tüm stiller
├── app.js            Tüm kod (ayarlar, Firebase, müşteri/tekniker mantığı, fiş)
├── logo.png          Logo
├── firestore.rules   Veritabanı güvenlik kuralları (Firebase'e yüklenir)
└── vercel.json       Vercel ayarı
```

## Giriş ve çalışma durumu

| Mod | Ne zaman | Kayıtlar |
|---|---|---|
| **Firebase yok** | `FIREBASE_CONFIG.apiKey` boş ya da Firebase yüklenemedi | Panele **giriş kapalı**; panelde sarı uyarı görünür. |
| **Bulut** | `FIREBASE_CONFIG` dolu | Firebase'de. Her cihazdan görünür; müşteri kendi telefonundan sorgular. Giriş: Firebase'de tanımlı e-posta + şifre. Kodda şifre yoktur. |

## 1) Firebase kurulumu (bir kez, ~10 dakika)

1. <https://console.firebase.google.com> → **Proje ekle** (Analytics gerekmez).
2. **Build → Authentication → Başla → Sign-in method → E-posta/Şifre → Etkinleştir.**
3. **Authentication → Users → Kullanıcı ekle**: tekniker e-postası ve güçlü şifre.
   *(Ayarlar → Kullanıcı eylemleri bölümünde "kayıt oluşturmayı" kapatabilirsiniz.)*
4. **Build → Firestore Database → Veritabanı oluştur** (bölge: `eur3` ya da `europe-west`; **Üretim modu**).
5. **Firestore → Kurallar** sekmesi: `firestore.rules` dosyasının içeriğini yapıştırın,
   `ADMIN_E_POSTA_BURAYA` yerine 3. adımdaki e-postayı yazın, **Yayınla**.
6. **Proje ayarları (⚙) → Genel → Uygulamalarınız → Web (`</>`)** → uygulamayı kaydedin → çıkan
   `firebaseConfig` değerlerini `app.js` en üstündeki `FIREBASE_CONFIG` içine yapıştırın.
7. **Authentication → Settings → Authorized domains**: Vercel adresinizi ekleyin (`siteniz.vercel.app`).
8. Değişikliği GitHub'a gönderin; Vercel otomatik yayınlar.

> `firebaseConfig` anahtarları gizli değildir; güvenliği 5. adımdaki kurallar sağlar.

## 2) GitHub + Vercel

Bu klasörün içeriğini GitHub deposunun **köküne** yükleyin (`index.html` kökte olmalı).
Vercel'de projeyi bu depoya bağlayın: Framework = **Other**, Build Command boş, Output Directory boş.
Her `git push` siteyi otomatik günceller.

## Veri güvenliği nasıl sağlanıyor?

| Koleksiyon | İçerik | Kim erişir |
|---|---|---|
| `tickets/{kod}` | Tam kayıt: telefon, ekran şifresi, SIM PIN, maliyet | **Yalnız yönetici** |
| `public/{kod}` | Gizlenmiş özet: `Ahmet Y***`, cihaz, durum, ücret, not | Kodu bilen tek tek okur; **liste alınamaz** |
| `lookup/{telefon}` | Telefon → servis kodları | Telefonu bilen okur; **liste alınamaz** |
| `meta/counter` | Servis kodu sayacı | Yalnız yönetici |

Müşteri başkasının kaydını göremez; ancak kodu veya telefonu bilen kişi o kaydın *gizlenmiş özetini* görür.
Servis kodları sıralı (`X101, X102...`) olduğu için tahmin edilebilir; daha sıkı olması gerekirse koda
rastgele ek (ör. `X101-7Q`) eklenebilir.

## Sık yapılan değişiklikler

| Ne | Nerede |
|---|---|
| Telefon / WhatsApp numarası | `app.js` → `SHOP` (ve `index.html` içindeki yazılar) |
| Servis fişi şartları | `app.js` → `RECEIPT_TERMS` |
| Durum adımları | `app.js` → `statusMap` |
| Servis kodu önü / başlangıç | `app.js` → `ID_PREFIX`, `FIRST_ID_NUMBER` |
| Görünüm | `style.css` (renk paleti: `index.html` başındaki `tailwind.config`) |
| Logo | `logo.png` dosyasını aynı adla değiştirin |

## Yedek

Panelde **Yedekle** düğmesi tüm kayıtları JSON dosyasına indirir, **Yükle** geri yükler
(bulut modunda aynı kodlu kayıtların üzerine yazar). Düzenli yedek almanız önerilir.

## Yeni eklenenler
- **Servis kodu** artık rastgele ek taşır (`TR2026-X101-7Q`): tahmin edilemez. Eski kodlar çalışmaya devam eder.
- **Fişte QR kod**: okutulunca `siteniz/?kod=...` açılır ve cihaz durumu otomatik sorgulanır.
- **Panel**: Bugün / Bu ay / Bu yıl / Hepsi + geçmiş yıl ve ay seçimi; yeni özet kartları.
- **WhatsApp**: duruma göre hazır müşteri mesajı ("Teslime hazır" için ayrı metin).
- **SEO / PWA**: `sitemap.xml`, `robots.txt`, Open Graph, yerel işletme verisi, `manifest.webmanifest` (ana ekrana eklenebilir).
- `sitemap.xml`, `robots.txt` ve `index.html` içindeki `https://nokta-iletisim.vercel.app` adresini kendi alan adınızla değiştirin.
- **Kayıt tarihçesi**: her kayıtta saat simgeli düğme; durum, ücret, maliyet ve not değişiklikleri kim/ne zaman ile görünür.
- Rastgele kod eki kapalıdır (`app.js` → `RANDOM_SUFFIX = false`). Açmak için `true` yapın.
