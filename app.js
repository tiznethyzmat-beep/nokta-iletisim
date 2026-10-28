/**
 * Nokta İletişim – Teknik Servis Portalı
 * Tek dosyalık uygulama kodu. Bölümler:
 *   1. Ayarlar          (telefon, Firebase anahtarları, fiş şartları)
 *   2. Yardımcılar
 *   3. Veri katmanı     (Firebase Firestore  ya da  tarayıcı depolaması)
 *   4. Arayüz           (sekmeler, pencereler, açılış)
 *   5. Müşteri sayfaları (sorgulama, servis talebi)
 *   6. Tekniker girişi
 *   7. Tekniker paneli  (özet, tablo)
 *   8. Kayıt işlemleri  (ekle, düzenle, sil)
 *   9. Servis fişi
 */

// ======================================================================
// 1. AYARLAR (en çok burayı değiştireceksiniz)
// ======================================================================

const SHOP = {
  name: 'NOKTA İLETİŞİM',
  phoneDisplay: '+90 542 288 82 88',
  whatsapp: '905422888288'          // başında + ve boşluk olmadan, ülke koduyla
};
const OFFICIAL_WA = SHOP.whatsapp;
const SITE_URL = 'https://nokta-iletisim.vercel.app';   // fişteki QR, yazı ve WhatsApp bağlantıları
// Google yorum bağlantınız (Google Business Profile → yorum bağlantısı). Boşsa Maps araması açılır.
const GOOGLE_REVIEW_URL = 'https://www.google.com/maps/search/?api=1&query=Nokta%20%C4%B0leti%C5%9Fim%20K%C4%B1rklareli';
// Tahmin edilemesin diye servis koduna rastgele ek (ör. X103-9A4U)
const RANDOM_SUFFIX = true;    // yeni kodlar tahmin edilemez: X103-9A4U (false = X103)
function randCode() { if (!RANDOM_SUFFIX) return ''; const c = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }

/*
 * FIREBASE ANAHTARLARI
 * Firebase Console → Proje ayarları → "Web uygulaması" bölümündeki firebaseConfig değerlerini buraya yapıştırın.
 * Bu değerler gizli değildir; güvenlik firestore.rules dosyasındaki kurallarla sağlanır.
 * apiKey boş bırakılırsa panel kapalı kalır (giriş yapılamaz) ve müşteri sorgusu veri bulamaz.
 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCJtEwzQuoIGouwpetCP5-_-8C0PspdNm4',
  authDomain: 'nokta-iletisim.firebaseapp.com',
  projectId: 'nokta-iletisim',
  storageBucket: 'nokta-iletisim.firebasestorage.app',
  messagingSenderId: '49361014048',
  appId: '1:49361014048:web:87bbedf55c87f189625b45'
};

const STORAGE_KEY = 'nokta_servis_tickets_2026';
const ID_PREFIX = 'X';               // yeni servis kodu: X107-9A4U (eski kodlar TR2026-X101 de çalışır)
const FIRST_ID_NUMBER = 100;          // ilk kayıt 101 olur

// Onarım durumları (4 adım)
const statusMap = {
  kayit:  { label: '1. Kayıt Alındı',  color: 'bg-sky-100 text-sky-800 border-sky-300' },
  tespit: { label: '2. Arıza Tespiti', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  tamir:  { label: '3. Tamirde',       color: 'bg-amber-100 text-amber-800 border-amber-300' },
  hazir:  { label: '4. Teslime Hazır', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  teslim: { label: '5. Teslim Edildi', color: 'bg-slate-200 text-slate-700 border-slate-400' }
};

// Servis fişinin altında basılan şartlar (HTML kullanılabilir)
const RECEIPT_TERMS = [
  '<b>A kalite ekran değişimlerinde garanti yoktur.</b>',
  '<b>Orijinal ekran değişiminde</b> sıvı teması ve darbe görmeden dokunmatiğinde ve görüntüsünde sorun yaşanan cihazlar <b>3 gün içerisinde</b> getirilirse kontrol edilir.',
  'Test edildikten sonra sorun müşteri kaynaklı değilse müdahale edilir.',
  'Cihaz, yalnızca bu servis fişi ve kimlik ibrazıyla kayıt sahibine teslim edilir.',
  'Onarım tamamlandığında bildirilen cihaz <b>30 gün</b> içinde mağazadan teslim alınmalıdır. Bu süreden sonra alınmayan cihazın saklanması, kaybolması veya hasar görmesinden mağazamız sorumlu değildir.',
  'Cihazdaki verilerin yedeğini almak müşterinin sorumluluğundadır; işlem sırasında oluşabilecek veri kaybından mağazamız sorumlu tutulamaz.',
  'Arıza tespitinde ek arıza veya ücret değişikliği çıkarsa işlemden önce müşteriye bilgi verilir.',
  'Kargo, kurye veya adrese teslim hizmeti yoktur; cihaz mağazaya getirilir ve mağazadan teslim alınır.',
  'Cihazı teslim bırakan müşteri bu şartları okuduğunu ve kabul ettiğini beyan eder.'
];

// ======================================================================
// 2. YARDIMCILAR
// ======================================================================

// HTML içine yazılan metni güvenli hale getirir (XSS koruması)
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// "Ahmet Yılmaz" -> "Ahmet Y***" (müşteri sorgusunda kişisel veriyi gizler)
const maskName = n => String(n||'').trim().split(/\s+/).map((w,i)=> i===0 ? w : w[0]+'***').join(' ');

// Metinden yalnızca rakamları bırakır
const digits = v => String(v||'').replace(/\D/g,'');

// Telefonun son 10 hanesi (kayıt eşleştirme anahtarı)
const phoneKey = p => digits(p).slice(-10);

// Telefonu WhatsApp biçimine çevirir (905XXXXXXXXX)
function waNumber(ph) { const c = digits(ph); return c.startsWith('90') ? c : (c.startsWith('0') ? '9' + c : '90' + c); }

// Panoya kopyala (güvenli bağlantı yoksa eski yönteme geçer)
function copyText(text, btn) {
  const done = ok => {
    if (!btn) return;
    const old = btn.innerHTML;
    btn.innerHTML = ok ? '<i class="fa-solid fa-check mr-1"></i> Kopyalandı' : '<i class="fa-solid fa-xmark mr-1"></i> Kopyalanamadı';
    setTimeout(() => { btn.innerHTML = old; }, 1500);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); done(ok);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done(true), fallback);
  else fallback();
}

// ======================================================================
// 3. VERİ KATMANI
// ======================================================================

/*
 * Tüm kayıt okuma/yazma işlemleri DB nesnesinden geçer.
 *
 * FIREBASE MODU (FIREBASE_CONFIG dolu):
 *   tickets/{kod}  Tam kayıt (şifre kodu, maliyet vb.)  -> yalnız yönetici okur/yazar
 *   public/{kod}   Müşterinin göreceği gizlenmiş özet    -> kod bilen tek tek okuyabilir, liste alınamaz
 *   lookup/{tel}   Telefon -> servis kodları listesi     -> telefonu bilen okuyabilir, liste alınamaz
 *   meta/counter   Servis kodu sayacı                    -> yalnız yönetici
 * FIREBASE YOKSA: panele giriş kapalıdır; kayıtlar yalnız bu tarayıcının localStorage alanında kalır.
 */
let USE_FIREBASE = Boolean(FIREBASE_CONFIG.apiKey) && typeof firebase !== 'undefined';
let isAdminLoggedIn = false;
let ticketsCache = [];        // yönetici panelinin kullandığı güncel kayıt listesi
let fbDb = null, fbAuth = null, stopListening = null;

// Müşterinin göreceği (kişisel verisi gizlenmiş) kayıt özeti
function toPublic(t) {
  return {
    id: t.id, date: t.date || '', nameMasked: maskName(t.name), device: t.device || '',
    gelenler: t.gelenler || '', problem: t.problem || '', price: Number(t.price) || 0,
    note: t.note || '', status: t.status || 'kayit'
  };
}

function dateToInput(dateStr) { const d = parseTrDate(dateStr); return d ? d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0') : todayStr(); }
function inputToTr(v, timePart) { const [y, m, d] = String(v).split('-'); return d + '.' + m + '.' + y + ' - ' + (timePart || '12:00'); }
// Cihazın "Teslim edildi" yapıldığı tarih (tarihçeden); yoksa kayıt tarihi
function deliveredAt(t) {
  let src = t.date;
  (t.history || []).forEach(e => { if (/→ 5\. Teslim Edildi/.test(e.x)) src = e.d; });
  return src;
}

function nowTr() {
  const n = new Date();
  return n.toLocaleDateString('tr-TR') + ' - ' + n.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// Kayıt tarihçesi: kim, ne zaman, neyi değiştirdi
function buildHistory(ticket, prev) {
  const h = Array.isArray(ticket.history) ? ticket.history.slice() : (prev && Array.isArray(prev.history) ? prev.history.slice() : []);
  const by = (typeof fbAuth !== 'undefined' && fbAuth && fbAuth.currentUser && fbAuth.currentUser.email) || 'tekniker';
  const when = nowTr();
  const add = x => h.push({ d: when, by, x });
  const num = v => Number(v) || 0;
  if (!prev) add('Kayıt açıldı');
  else {
    if ((prev.payMethod || '') !== (ticket.payMethod || '') && ticket.payMethod !== undefined) add('Ödeme: ' + (ticket.payMethod ? PAY[ticket.payMethod].label : 'Ödenmedi'));
    if ((prev.date || '') !== (ticket.date || '')) add('Kayıt tarihi: ' + (prev.date || '-') + ' → ' + (ticket.date || '-'));
    if (prev.status !== ticket.status) add('Durum: ' + ((statusMap[prev.status] || {}).label || prev.status) + ' → ' + ((statusMap[ticket.status] || {}).label || ticket.status));
    if (num(prev.price) !== num(ticket.price)) add('Ücret: ' + num(prev.price) + ' → ' + num(ticket.price) + ' TL');
    if (num(prev.cost) !== num(ticket.cost)) add('Maliyet: ' + num(prev.cost) + ' → ' + num(ticket.cost) + ' TL');
    if ((prev.note || '') !== (ticket.note || '')) add('Not: ' + (ticket.note || '(boş)'));
  }
  ticket.history = h.slice(-60);
}

// "Teslime hazır" olduğu günden beri geçen gün (tarihçeden, yoksa kayıt tarihinden)
function daysReady(t) {
  if (t.status !== 'hazir') return 0;
  let src = t.date;
  (t.history || []).forEach(e => { if (/→ 4\. Teslime Hazır/.test(e.x)) src = e.d; });
  const d = parseTrDate(src); if (!d) return 0;
  return Math.floor((Date.now() - new Date(d.y, d.m - 1, d.d).getTime()) / 86400000);
}

function renderOverdue(all) {
  let box = document.getElementById('overdue-box');
  if (!box) {
    const bar = document.getElementById('stats-period'); if (!bar) return;
    box = document.createElement('div'); box.id = 'overdue-box';
    bar.insertAdjacentElement('beforebegin', box);
  }
  const late = all.filter(t => daysReady(t) >= 30);
  box.innerHTML = late.length ? `<div class="mb-3 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-sm font-semibold"><i class="fa-solid fa-triangle-exclamation mr-2"></i><b>${late.length} cihaz 30 günden fazladır teslim alınmadı:</b> ${late.map(t => esc(t.id) + ' (' + esc(t.name) + ', ' + daysReady(t) + ' gün)').join(' · ')}</div>` : '';
}

function showHistory(id) {
  const t = getTickets().find(x => x.id === id); if (!t) return;
  let m = document.getElementById('modal-history');
  if (!m) {
    m = document.createElement('div'); m.id = 'modal-history';
    m.className = 'fixed inset-0 z-50 bg-slate-900/70 hidden flex items-center justify-center p-4';
    m.onclick = e => { if (e.target === m) closeModal('modal-history'); };
    document.body.appendChild(m);
  }
  const rows = (t.history || []).slice().reverse().map(e => `<li class="py-2 border-b border-slate-100"><div class="text-[11px] font-bold text-slate-500">${esc(e.d)} · ${esc(e.by)}</div><div class="text-sm font-semibold text-slate-800">${esc(e.x)}</div></li>`).join('');
  m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"><div class="p-4 border-b flex items-center justify-between"><h3 class="font-extrabold text-slate-900">Kayıt tarihçesi · ${esc(t.id)}</h3><button onclick="closeModal('modal-history')" class="text-slate-400 hover:text-slate-700 text-xl px-2">×</button></div><ul class="p-4 overflow-y-auto">${rows || '<li class="text-sm text-slate-500">Bu kayıt için tarihçe yok (eski kayıt).</li>'}</ul></div>`;
  openModal('modal-history');
}

// ===== Çalışma saatleri: her gün 10:00–20:00 (değişirse yalnızca burayı ve Google profilini güncelleyin) =====
const SHOP_HOURS = { 0: [10, 20], 1: [10, 20], 2: [10, 20], 3: [10, 20], 4: [10, 20], 5: [10, 20], 6: [10, 20] };   // 0 = Pazar
function shopStatusAt(d) {
  const parts = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(x => { parts[x.type] = x.value; });
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  const now = (+parts.hour) * 60 + (+parts.minute), [oh, ch] = SHOP_HOURS[dow], pad = n => String(n).padStart(2, '0');
  if (now >= oh * 60 && now < ch * 60) return { open: true, text: 'Şu an açık · ' + pad(ch) + ':00\'a kadar' };
  if (now < oh * 60) return { open: false, text: 'Kapalı · bugün ' + pad(oh) + ':00\'da açılır' };
  return { open: false, text: 'Kapalı · yarın ' + pad(SHOP_HOURS[(dow + 1) % 7][0]) + ':00\'da açılır' };
}
function renderShopStatus() {
  const s = shopStatusAt(new Date());
  document.querySelectorAll('[data-shop-status]').forEach(el => { el.textContent = s.text; el.className = (el.dataset.base || '') + ' ' + (s.open ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'); });
}

// ===== Servis fişi çıktı düzeni (A4'ü doldurur). CSS dosyasına bağlı değildir; eski/önbellekteki style.css olsa da çalışır. =====
(function () {
  const st = document.createElement('style');
  st.id = 'receipt-print-style';
  st.textContent = `
@page { size: A4; margin: 10mm; }
@media print {
  html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#print-area) { display: none !important; }
  #print-area { display: block !important; margin: 0 !important; padding: 0 !important; }
  #print-area .receipt { max-width: none !important; width: 100% !important; box-sizing: border-box !important; margin: 0 !important; padding: 8mm 10mm !important; min-height: 258mm; display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; }
  #print-area .receipt-head { gap: 20px; margin-bottom: 16px; }
  #print-area .receipt-logo { width: 110px !important; height: 110px !important; }
  #print-area .receipt h2 { font-size: 30px; }
  #print-area .receipt-sub { font-size: 17px; }
  #print-area .receipt-info { font-size: 17.5px; line-height: 1.62; margin: 10px 0; }
  #print-area .receipt-qr { gap: 22px; margin: 14px 0; font-size: 15px; }
  #print-area .receipt-qr img, #print-area .receipt-qr canvas { width: 120px !important; height: 120px !important; }
  #print-area .receipt-note { font-size: 15px; }
  #print-area .receipt-terms { font-size: 13.2px; margin-top: 12px; padding-top: 10px; }
  #print-area .receipt-terms ol { padding-left: 22px; line-height: 1.5; }
  #print-area .receipt-terms li { margin-bottom: 3px; }
  #print-area .receipt-sign { margin-top: auto; padding-top: 28px; font-size: 18px; }
  #print-area .report { font-family: Inter, Arial, sans-serif; color: #000; font-size: 11.5px; }
  #print-area .report-head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #0f6b67; padding-bottom: 10px; margin-bottom: 12px; }
  #print-area .report-head img { width: 70px; height: 70px; border-radius: 50%; }
  #print-area .report h1 { font-size: 22px; margin: 0; }
  #print-area .report .rsub { font-size: 13px; color: #444; margin-top: 3px; }
  #print-area .report .sum { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 10px 0; }
  #print-area .report .sum.sum4 { grid-template-columns: repeat(4, 1fr); }
  #print-area .report .sum div { border: 1.5px solid #0f6b67; border-radius: 8px; padding: 6px 9px; background: #f2faf9; }
  #print-area .report .sum span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #444; font-weight: 700; }
  #print-area .report .sum b { font-size: 16px; }
  #print-area .report .rnote { font-size: 10.5px; color: #555; margin: 4px 0 10px; }
  #print-area .report table { width: 100%; border-collapse: collapse; }
  #print-area .report th, #print-area .report td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  #print-area .report th { background: #e8f1f0; font-size: 10.5px; text-transform: uppercase; }
  #print-area .report thead { display: table-header-group; }
  #print-area .report tr { page-break-inside: avoid; }
  #print-area .report td.r { text-align: right; white-space: nowrap; }
  #print-area .report tfoot td { font-weight: 800; background: #f3f3f3; }
}`;
  document.head.appendChild(st);
})();

// ===== Bağlı cihazlar (tekniker oturumları) ve çevrimiçi ziyaretçi sayacı =====
const ONLINE_MS = 3 * 60 * 1000, VISITOR_ONLINE_MS = 150 * 1000;
let liveError = '', liveUnsubs = [], liveTimer = null, sessionsCache = [], presenceCache = [], visitsCache = [];

function randId(n) { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let r = ''; for (let i = 0; i < n; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }
function getSid() { return localStorage.getItem('nokta_sid') || ''; }
function newSid() { const s = 'S' + randId(14); localStorage.setItem('nokta_sid', s); return s; }
function getDid() { let v = localStorage.getItem('nokta_did'); if (!v) { v = 'D' + randId(12); localStorage.setItem('nokta_did', v); } return v; }
function getVid() { let v = localStorage.getItem('nokta_vid'); if (!v) { v = randId(12); localStorage.setItem('nokta_vid', v); } return v; }
function todayStr() { return new Date().toLocaleDateString('sv-SE'); }
function fmtTime(ms) { return ms ? new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'; }

function deviceInfo() {
  const ua = navigator.userAgent;
  let os = 'Bilinmeyen cihaz';
  if (/Windows/.test(ua)) os = 'Windows'; else if (/Android/.test(ua)) os = 'Android'; else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'Mac'; else if (/Linux/.test(ua)) os = 'Linux';
  let br = 'Tarayıcı';
  if (/Edg\//.test(ua)) br = 'Edge'; else if (/OPR\/|Opera/.test(ua)) br = 'Opera'; else if (/Firefox\//.test(ua)) br = 'Firefox';
  else if (/Chrome\//.test(ua)) br = 'Chrome'; else if (/Safari\//.test(ua)) br = 'Safari';
  const type = /iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : (/Mobile|iPhone|iPod/.test(ua) ? 'phone' : 'pc');
  return { os, br, type };
}

// Ziyaretçi sayacı: anonim, kişisel veri tutmaz (rastgele kimlik + sayfa + cihaz türü)
function isBotUA() {
  return !!navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|facebookexternalhit|whatsapp|telegram|google-read|bingpreview/i.test(navigator.userAgent);
}

function trackVisit() {
  if (isBotUA()) return;   // arama motoru robotları ziyaretçi sayılmaz
  const vid = getVid(), dev = deviceInfo().type, p = String(PAGE || 'x').slice(0, 20), today = todayStr();
  const beat = () => { if (!document.hidden) fbDb.collection('presence').doc(vid).set({ t: Date.now(), p, dev }).catch(() => {}); };
  beat(); setInterval(beat, 90000);
  document.addEventListener('visibilitychange', beat);
  if (localStorage.getItem('nokta_vday') !== today) {
    localStorage.setItem('nokta_vday', today);
    fbDb.collection('visits').doc(today + '_' + vid).set({ d: today, t: Date.now(), dev, p }).catch(() => {});
  }
}

async function forceLogout(msg) {
  stopLive();
  try { await fbAuth.signOut(); } catch (e) {}
  localStorage.removeItem('nokta_sid');
  if (msg) alert(msg);
}

async function startLive() {
  if (!USE_FIREBASE || liveUnsubs.length) return;
  localStorage.setItem('nokta_staff', '1');
  let sid = getSid() || newSid();
  const ref = fbDb.collection('sessions').doc(sid), now = Date.now();
  try {
    const snap = await ref.get();
    if (snap.exists && snap.data().revoked) { await forceLogout('Bu cihazın oturumu başka bir cihazdan kapatıldı.'); return; }
    if (!snap.exists) { const d = deviceInfo(); await ref.set({ id: sid, did: getDid(), os: d.os, br: d.br, type: d.type, loginAt: now, lastSeen: now, revoked: false, out: false }); }
    else await ref.update({ lastSeen: now, out: false });
  } catch (e) { console.warn('Oturum kaydı yazılamadı (firestore.rules güncellendi mi?)', e); liveError = (e && e.code) || 'error'; }

  // IP ve yaklaşık şehir (Vercel sunucu funksiyasından; yerelde/çevrimdışı çalışmaz, sorun değil)
  fetch('/api/whoami', { cache: 'no-store' }).then(r => r.json()).then(g => {
    if (g && g.ip) ref.update({ ip: String(g.ip).slice(0, 60), city: String(g.city || '').slice(0, 60), country: String(g.country || '').slice(0, 5) }).catch(() => {});
  }).catch(() => {});
  // 30 günden eski oturum kayıtlarını temizle
  fbDb.collection('sessions').get().then(sn => sn.docs.forEach(d => { const x = d.data(); if ((x.lastSeen || 0) < Date.now() - 30 * 86400000) d.ref.delete().catch(() => {}); })).catch(() => {});

  const onErr = err => { console.warn('Canlı veri okunamadı:', err); liveError = (err && err.code) || 'error'; renderLive(); };
  liveUnsubs.push(fbDb.collection('sessions').onSnapshot(snap => {
    liveError = '';
    sessionsCache = snap.docs.map(x => x.data());
    // Aynı tarayıcının eski oturumlarını temizle (her giriş yeni kayıt açtığı için listede tekrar görünmesin)
    const did = getDid();
    sessionsCache.filter(x => x.did === did && x.id !== sid).forEach(x => fbDb.collection('sessions').doc(x.id).delete().catch(() => {}));
    sessionsCache = sessionsCache.filter(x => !(x.did === did && x.id !== sid));
    const me = sessionsCache.find(x => x.id === sid);
    if (me && me.revoked) { forceLogout('Bu cihazın oturumu başka bir cihazdan kapatıldı.'); return; }
    renderLive();
  }, onErr));
  liveUnsubs.push(fbDb.collection('presence').onSnapshot(snap => { presenceCache = snap.docs.map(x => Object.assign({ id: x.id }, x.data())); renderLive(); }, onErr));
  const wk = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv-SE');
  liveUnsubs.push(fbDb.collection('visits').where('d', '>=', wk).onSnapshot(snap => { visitsCache = snap.docs.map(x => x.data()); renderLive(); }, onErr));
  fbDb.collection('presence').doc(getVid()).delete().catch(() => {});   // teknikerin kendisi ziyaretçi sayılmasın
  liveTimer = setInterval(() => { ref.update({ lastSeen: Date.now() }).catch(() => {}); renderLive(); }, 60000);
}

function stopLive() {
  liveUnsubs.forEach(u => { try { u(); } catch (e) {} }); liveUnsubs = [];
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  sessionsCache = []; presenceCache = []; visitsCache = [];
}

async function endSession() {   // Çıkış yapmadan önce çağrılır
  const sid = getSid(); if (!USE_FIREBASE || !sid) return;
  try { await fbDb.collection('sessions').doc(sid).update({ out: true, outAt: Date.now(), lastSeen: Date.now() }); } catch (e) {}
}

async function revokeSession(id) {
  if (!confirm('Bu cihazın oturumu kapatılsın mı?')) return;
  try { await fbDb.collection('sessions').doc(id).update({ revoked: true, revokedAt: Date.now() }); } catch (e) { dbFail(e); }
}
async function revokeOthers() {
  const sid = getSid(), list = sessionsCache.filter(s => s.id !== sid && !s.revoked && !s.out);
  if (!list.length) { alert('Kapatılacak başka oturum yok.'); return; }
  if (!confirm(list.length + ' cihazın oturumu kapatılsın mı? (Bu cihaz hariç)')) return;
  try { await Promise.all(list.map(s => fbDb.collection('sessions').doc(s.id).update({ revoked: true, revokedAt: Date.now() }))); } catch (e) { dbFail(e); }
}
async function deleteSessionRow(id) { try { await fbDb.collection('sessions').doc(id).delete(); } catch (e) { dbFail(e); } }

function renderLive() {
  const dBox = document.getElementById('devices-box'), vBox = document.getElementById('visitors-box');
  if (!isAdminLoggedIn || !dBox || !vBox) return;
  const now = Date.now(), sid = getSid();

  if (liveError) {
    const msg = liveError === 'permission-denied'
      ? '<b>İzin yok.</b> Firebase kuralları güncellenmemiş. Firebase Console → Firestore Database → Kurallar sekmesine <code>sessions</code>, <code>presence</code> ve <code>visits</code> bölümlerini ekleyip <b>Yayınla</b> deyin (README / firestore.rules dosyasında hazır).'
      : 'Canlı veri okunamadı (' + esc(liveError) + '). İnternetinizi kontrol edip sayfayı yenileyin.';
    const w = '<div class="glass-card p-4 border-2 border-rose-300 bg-rose-50 text-rose-800 text-sm font-semibold"><i class="fa-solid fa-triangle-exclamation mr-2"></i>' + msg + '</div>';
    dBox.innerHTML = w; vBox.innerHTML = ''; return;
  }

  // --- Bağlı cihazlar ---
  const sess = sessionsCache.slice().sort((a, b) => (b.loginAt || 0) - (a.loginAt || 0));
  const state = s => s.revoked ? 'revoked' : s.out ? 'out' : ((s.lastSeen || 0) > now - ONLINE_MS ? 'online' : 'idle');
  const active = sess.filter(s => state(s) === 'online').length;
  const label = { online: ['Çevrimiçi', 'bg-emerald-100 text-emerald-700 border-emerald-300'], idle: ['Çevrimdışı', 'bg-slate-100 text-slate-600 border-slate-300'], out: ['Çıkış yaptı', 'bg-slate-100 text-slate-500 border-slate-200'], revoked: ['Uzaktan kapatıldı', 'bg-rose-100 text-rose-700 border-rose-300'] };
  const icon = { pc: 'fa-computer', phone: 'fa-mobile-screen', tablet: 'fa-tablet-screen-button' };
  if (!document.getElementById('dev-list')) {
    dBox.innerHTML = `<details class="glass-card p-4 sm:p-5"><summary class="cursor-pointer flex items-center justify-between gap-3 font-extrabold text-slate-900 list-none"><span><i class="fa-solid fa-laptop-mobile text-sky-600 mr-2"></i>Bağlı cihazlar</span><span id="dev-sum" class="text-xs font-bold"></span></summary><div class="mt-3 flex justify-end"><button onclick="revokeOthers()" class="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"><i class="fa-solid fa-right-from-bracket mr-1"></i>Diğer hepsinden çıkar</button></div><ul id="dev-list" class="mt-2 divide-y divide-slate-100"></ul></details>`;
  }
  document.getElementById('dev-sum').innerHTML = `<span class="text-emerald-700">${active} aktif</span> · ${sess.length} kayıt`;
  document.getElementById('dev-list').innerHTML = sess.slice(0, 25).map(s => {
    const st = state(s), me = s.id === sid;
    return `<li class="py-3 flex items-start justify-between gap-3">
      <div class="min-w-0 flex gap-3"><div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0"><i class="fa-solid ${icon[s.type] || 'fa-computer'}"></i></div>
      <div class="min-w-0"><div class="font-bold text-slate-900 text-sm">${esc(s.os)} · ${esc(s.br)} ${me ? '<span class="ml-1 text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-300 rounded-full px-2 py-0.5">Bu cihaz</span>' : ''}</div>
      <div class="text-[11px] text-slate-500 font-medium leading-relaxed">${s.ip ? '<i class="fa-solid fa-location-dot mr-1"></i>' + esc(s.ip) + (s.city ? ' · ' + esc(s.city) + (s.country ? ', ' + esc(s.country) : '') : '') + '<br>' : ''}Giriş: ${fmtTime(s.loginAt)}<br>Son hareket: ${fmtTime(s.lastSeen)}${s.out ? '<br>Çıkış: ' + fmtTime(s.outAt) : ''}${s.revoked ? '<br>Kapatıldı: ' + fmtTime(s.revokedAt) : ''}</div>
      <span class="inline-block mt-1 text-[10px] font-bold border rounded-full px-2 py-0.5 ${label[st][1]}">${label[st][0]}</span></div></div>
      <div class="shrink-0">${(st === 'online' || st === 'idle') && !me ? `<button onclick="revokeSession('${esc(s.id)}')" class="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-2">Çıkar</button>` : (st === 'out' || st === 'revoked') ? `<button onclick="deleteSessionRow('${esc(s.id)}')" class="text-slate-400 hover:text-red-600 px-2" title="Listeden sil"><i class="fa-solid fa-trash"></i></button>` : ''}</div></li>`;
  }).join('') || '<li class="py-3 text-sm text-slate-500">Henüz kayıt yok.</li>';

  // --- Ziyaretçiler ---
  const on = presenceCache.filter(x => (x.t || 0) > now - VISITOR_ONLINE_MS);
  const phone = on.filter(x => x.dev === 'phone').length, pc = on.filter(x => x.dev === 'pc').length, tab = on.length - phone - pc;
  const pages = {}; on.forEach(x => { pages[x.p] = (pages[x.p] || 0) + 1; });
  const pageNames = { sorgula: 'Cihaz Sorgula', randevu: 'Servis Talebi', iletisim: 'İletişim', sss: 'Sık Sorulanlar' };
  const today = todayStr(), cnt = {}; visitsCache.forEach(v => { cnt[v.d] = (cnt[v.d] || 0) + 1; });
  const days = []; for (let i = 0; i < 7; i++) { const dt = new Date(Date.now() - i * 86400000); days.push({ d: dt.toLocaleDateString('sv-SE'), n: dt.toLocaleDateString('tr-TR', { weekday: 'short' }) }); }
  const todayN = cnt[today] || 0, weekN = days.reduce((s, x) => s + (cnt[x.d] || 0), 0), max = Math.max(1, ...days.map(x => cnt[x.d] || 0));
  if (!document.getElementById('vis-body')) {
    vBox.innerHTML = `<details class="glass-card p-4 sm:p-5"><summary class="cursor-pointer flex items-center justify-between gap-3 font-extrabold text-slate-900 list-none"><span><i class="fa-solid fa-users text-[#16a095] mr-2"></i>Sitede ziyaretçiler</span><span id="vis-sum" class="text-xs font-bold"></span></summary><div id="vis-body" class="mt-4"></div></details>`;
  }
  document.getElementById('vis-sum').innerHTML = `<span class="text-emerald-700">${on.length} online</span> · bugün ${todayN}`;
  document.getElementById('vis-body').innerHTML = `
    <div class="grid grid-cols-3 gap-3 text-center">
      <div class="rounded-2xl bg-emerald-50 border border-emerald-200 p-3"><div class="text-2xl font-extrabold text-emerald-700">${on.length}</div><div class="text-[11px] font-bold text-emerald-800 uppercase">Şu an online</div></div>
      <div class="rounded-2xl bg-sky-50 border border-sky-200 p-3"><div class="text-2xl font-extrabold text-sky-700">${todayN}</div><div class="text-[11px] font-bold text-sky-800 uppercase">Bugün girdi</div></div>
      <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3"><div class="text-2xl font-extrabold text-slate-800">${weekN}</div><div class="text-[11px] font-bold text-slate-600 uppercase">Son 7 gün</div></div>
    </div>
    <div class="mt-3 text-xs text-slate-600 font-medium">${on.length ? `<i class="fa-solid fa-mobile-screen mr-1"></i>${phone} telefon · <i class="fa-solid fa-computer mx-1"></i>${pc} bilgisayar${tab ? ' · ' + tab + ' tablet' : ''}${Object.keys(pages).length ? '<br>Bakılan sayfalar: ' + Object.keys(pages).map(k => esc(pageNames[k] || k) + ' (' + pages[k] + ')').join(', ') : ''}` : 'Şu an sitede kimse yok.'}</div>
    ${on.length ? '<ul class="mt-3 text-xs text-slate-600 divide-y divide-slate-100">' + on.slice().sort((a, b) => b.t - a.t).map(x => '<li class="py-1.5 flex justify-between gap-2"><span><i class="fa-solid ' + (x.dev === 'phone' ? 'fa-mobile-screen' : x.dev === 'tablet' ? 'fa-tablet-screen-button' : 'fa-computer') + ' mr-1.5 text-slate-400"></i>' + (x.dev === 'phone' ? 'Telefon' : x.dev === 'tablet' ? 'Tablet' : 'Bilgisayar') + ' · ' + esc(pageNames[x.p] || x.p) + '</span><span class="text-slate-400">' + Math.max(0, Math.round((now - x.t) / 1000)) + ' sn önce</span></li>').join('') + '</ul>' : ''}
    <div class="mt-4 flex items-end gap-2 h-20">${days.slice().reverse().map(x => `<div class="flex-1 text-center"><div class="text-[10px] font-bold text-slate-600">${cnt[x.d] || 0}</div><div class="mx-auto w-full max-w-[28px] rounded-t bg-[#16a095]/80" style="height:${Math.max(3, Math.round((cnt[x.d] || 0) / max * 48))}px"></div><div class="text-[10px] text-slate-500 mt-1">${x.n}</div></div>`).join('')}</div>
    <p class="text-[10px] text-slate-400 mt-3">Sayım anonimdir (kim olduğu bilinmez). Arama motoru robotları ve teknikerin kendi cihazları sayılmaz. "Bugün girdi" aynı cihazı bir kez sayar.</p>`;
}

// Panel kodunun senkron kullandığı güncel liste
function getTickets() { return ticketsCache; }

function idNumber(id) { const m = String(id).match(/X(\d+)/); return m ? parseInt(m[1], 10) : 0; }

function localLoad() {
  try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(d) ? d : []; }
  catch (e) { return []; }
}
function localPersist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(ticketsCache)); }

// Firebase App Check (bot / sahte istek koruması). Firebase Console > App Check > reCAPTCHA v3 site anahtarını (herkese açık anahtar) buraya yazın.
const APPCHECK_SITE_KEY = '';

const DB = {
  get mode() { return USE_FIREBASE ? 'firebase' : 'local'; },

  // Açılışta bir kez çağrılır
  init() {
    if (USE_FIREBASE) {
      try {
        if (APPCHECK_SITE_KEY && location.hostname === 'localhost') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        firebase.initializeApp(FIREBASE_CONFIG);
        if (APPCHECK_SITE_KEY && firebase.appCheck) {
          try { firebase.appCheck().activate(APPCHECK_SITE_KEY, true); } catch (e) { console.warn('App Check başlatılamadı:', e); }
        }
        fbDb = firebase.firestore();
        fbAuth = firebase.auth();
        fbAuth.onAuthStateChanged(DB.onAuthChanged);
        return;
      } catch (err) {
        console.error('Firebase başlatılamadı, test moduna geçildi:', err);
        USE_FIREBASE = false;
      }
    }
    ticketsCache = localLoad();
    isAdminLoggedIn = false;      // Firebase yoksa panele giriş yoktur
  },

  // Firebase: giriş durumu değişince
  onAuthChanged(user) {
    isAdminLoggedIn = Boolean(user);
    if (user) {
      DB.listen();
      startLive();
      closeModal('modal-login');
    } else {
      if (stopListening) { stopListening(); stopListening = null; }
      stopLive();
      ticketsCache = [];
      resetAdminUi();
      if (PAGE === 'admin') location.replace('index.html?giris=1');
    }
  },

  // Firebase: kayıtları canlı dinle (başka cihazdaki değişiklik de anında görünür)
  listen() {
    if (stopListening) return;
    stopListening = fbDb.collection('tickets').onSnapshot(snap => {
      ticketsCache = snap.docs.map(d => d.data()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (isAdminLoggedIn) renderAdminTable();
    }, err => { stopListening = null; dbFail(err); });
  },

  // Yeni servis kodu üretir (çakışmasız)
  async nextId() {
    if (!USE_FIREBASE) return ID_PREFIX + (Math.max(FIRST_ID_NUMBER, ...ticketsCache.map(t => idNumber(t.id))) + 1) + (RANDOM_SUFFIX ? '-' + randCode() : '');
    const ref = fbDb.collection('meta').doc('counter');
    const n = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const next = (snap.exists ? snap.data().n : FIRST_ID_NUMBER) + 1;
      tx.set(ref, { n: next });
      return next;
    });
    return ID_PREFIX + n + (RANDOM_SUFFIX ? '-' + randCode() : '');
  },

  // Kaydı ekler veya günceller. prev: düzenlemeden önceki hali (telefon değiştiyse eski kaydı temizlemek için)
  async save(ticket, prev) {
    buildHistory(ticket, prev);
    if (!USE_FIREBASE) {
      const i = ticketsCache.findIndex(x => x.id === ticket.id);
      if (i >= 0) ticketsCache[i] = ticket; else ticketsCache.unshift(ticket);
      localPersist();
      return;
    }
    const FV = firebase.firestore.FieldValue;
    const clean = JSON.parse(JSON.stringify(ticket));   // undefined değerleri temizler
    const batch = fbDb.batch();
    batch.set(fbDb.collection('tickets').doc(ticket.id), clean);
    batch.set(fbDb.collection('public').doc(ticket.id), toPublic(ticket));
    const key = phoneKey(ticket.phone);
    if (key.length === 10) batch.set(fbDb.collection('lookup').doc(key), { codes: FV.arrayUnion(ticket.id) }, { merge: true });
    const oldKey = prev ? phoneKey(prev.phone) : '';
    if (oldKey.length === 10 && oldKey !== key) batch.set(fbDb.collection('lookup').doc(oldKey), { codes: FV.arrayRemove(ticket.id) }, { merge: true });
    await batch.commit();
  },

  async remove(ticket) {
    if (!USE_FIREBASE) {
      ticketsCache = ticketsCache.filter(x => x.id !== ticket.id);
      localPersist();
      return;
    }
    const FV = firebase.firestore.FieldValue;
    const batch = fbDb.batch();
    batch.delete(fbDb.collection('tickets').doc(ticket.id));
    batch.delete(fbDb.collection('public').doc(ticket.id));
    const key = phoneKey(ticket.phone);
    if (key.length === 10) batch.set(fbDb.collection('lookup').doc(key), { codes: FV.arrayRemove(ticket.id) }, { merge: true });
    await batch.commit();
  },

  // Yedek dosyasından toplu yükleme
  async importAll(list) {
    if (!USE_FIREBASE) { ticketsCache = list.slice(); localPersist(); return; }
    for (let i = 0; i < list.length; i += 100) {
      const FV = firebase.firestore.FieldValue;
      const batch = fbDb.batch();
      list.slice(i, i + 100).forEach(t => {
        batch.set(fbDb.collection('tickets').doc(t.id), JSON.parse(JSON.stringify(t)));
        batch.set(fbDb.collection('public').doc(t.id), toPublic(t));
        const key = phoneKey(t.phone);
        if (key.length === 10) batch.set(fbDb.collection('lookup').doc(key), { codes: FV.arrayUnion(t.id) }, { merge: true });
      });
      await batch.commit();
    }
    // sayaç, içe aktarılan en büyük numaranın gerisinde kalmasın
    const top = Math.max(FIRST_ID_NUMBER, ...list.map(t => idNumber(t.id)));
    const ref = fbDb.collection('meta').doc('counter');
    await fbDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      tx.set(ref, { n: Math.max(top, snap.exists ? snap.data().n : 0) });
    });
  },

  // Müşteri sorgusu: servis kodu veya telefon -> gizlenmiş kayıt özetleri (en yeni üstte)
  async publicLookup(raw) {
    // Boşluk, farklı tire karakterleri ve küçük harf hatası tolere edilir
    const q = String(raw).trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, '-');
    const d = digits(q);
    const isPhone = d.length >= 10 && !/[A-Z]/.test(q);
    // Aday kodlar: yazdığı gibi + eski biçim (TR2026-X101) için ön ek
    const cands = [q];
    if (/^X\d/.test(q)) cands.push('TR2026-' + q);

    if (!USE_FIREBASE) {
      return ticketsCache.filter(t => cands.includes(t.id.toUpperCase()) || (isPhone && phoneKey(t.phone) === d.slice(-10))).map(toPublic);
    }
    if (q.includes('/')) return [];
    if (isPhone) {
      const snap = await fbDb.collection('lookup').doc(d.slice(-10)).get();
      const codes = snap.exists ? (snap.data().codes || []) : [];
      const docs = await Promise.all(codes.map(c => fbDb.collection('public').doc(c).get()));
      return docs.filter(x => x.exists).map(x => x.data()).sort((a, b) => idNumber(b.id) - idNumber(a.id));
    }
    for (const c of cands) {
      const snap = await fbDb.collection('public').doc(c).get();
      if (snap.exists) return [snap.data()];
    }
    return [];
  }
};

// Veritabanı hatasını kullanıcıya anlaşılır şekilde göster
function dbFail(err) {
  console.error(err);
  const code = err && err.code;
  let msg;
  if (code === 'permission-denied') msg = 'İzin verilmedi. firestore.rules kuralları Firebase\'e yüklenmemiş olabilir ya da bu hesap yönetici olarak tanımlı değil.';
  else if (code === 'unavailable' || code === 'deadline-exceeded') msg = 'Bağlantı sorunu. İnternetinizi kontrol edip tekrar deneyin.';
  else msg = 'İşlem tamamlanamadı: ' + ((err && err.message) || err);
  alert(msg);
}

// Gönder düğmesini işlem sürerken kilitle (çift kayıt olmasın)
function setBusy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('opacity-60', on);
  btn.classList.toggle('cursor-wait', on);
}

// Yedekleme
function exportBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(getTickets(), null, 2)], { type: 'application/json' }));
  a.download = 'nokta-servis-yedek-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

function importBackup(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let d;
    try {
      d = JSON.parse(r.result);
      if (!Array.isArray(d) || !d.every(x => x && /^[A-Za-z0-9_-]+$/.test(String(x.id)))) throw 0;
    } catch (e) { alert('Geçersiz yedek dosyası!'); ev.target.value = ''; return; }
    const msg = USE_FIREBASE
      ? d.length + ' kayıt buluta yüklenecek (aynı kodlu kayıtların üzerine yazılır). Devam edilsin mi?'
      : d.length + ' kayıt yüklenecek. Mevcut kayıtların yerine geçer. Devam edilsin mi?';
    if (confirm(msg)) {
      DB.importAll(d).then(() => { renderAdminTable(); alert('Yedek yüklendi.'); }).catch(dbFail);
    }
    ev.target.value = '';
  };
  r.readAsText(f);
}

// ======================================================================
// 4. ARAYÜZ
// ======================================================================

// Sayfa açılışı
window.onload = function () {
  DB.init();
  adaptLoginForm();
  updateModeBadge();
  if (document.getElementById('view-' + PAGE)) switchTab(PAGE);
  if (PAGE === 'admin' && !USE_FIREBASE) location.replace('index.html?giris=1');
  renderRecent();
  const kod = new URLSearchParams(location.search).get('kod');
  if (kod && document.getElementById('search-input')) {
    // QR / bağlantı ile gelen müşteri: afişi gizle, sorguyu çalıştır, sonuca otomatik kaydır
    document.getElementById('search-input').value = kod;
    const hero = document.getElementById('hero-banner'); if (hero) hero.classList.add('hidden');
    const toResult = () => { const b = document.getElementById('search-result'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    setTimeout(async () => { const run = performSearch(); setTimeout(toResult, 80); await run; toResult(); setTimeout(toResult, 400); }, 500);
  }
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (new URLSearchParams(location.search).get('giris') && document.getElementById('modal-login')) checkAdminAccess();
  if (new URLSearchParams(location.search).get('staff') === '1') { localStorage.setItem('nokta_staff', '1'); setTimeout(() => alert('Bu cihaz ziyaretçi sayacından çıkarıldı.'), 300); }
  if (USE_FIREBASE && PAGE !== 'admin' && !localStorage.getItem('nokta_staff')) trackVisit();
  renderShopStatus(); setInterval(renderShopStatus, 60000);
  if (document.getElementById('tab-ozet')) { let pt = 'ozet'; try { pt = localStorage.getItem('nokta_ptab') || 'ozet'; } catch (e) {} setPanelTab(pt); }
  if (isAdminLoggedIn) renderAdminTable();
};

// Esc tuşu açık pencereleri kapatır
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['modal-login','modal-new-ticket','modal-edit-ticket','modal-created'].forEach(closeModal); });

const PAGE = document.body.dataset.page;
const PAGE_URLS = {sorgula:'index.html',randevu:'servis-talebi.html',satis:'satis-takas.html',iletisim:'iletisim.html',sss:'sik-sorulanlar.html',admin:'panel.html'};

// Her sekme ayrı sayfadır: hedef bu sayfada yoksa ilgili sayfaya gider
function switchTab(tabId) {
  const target = document.getElementById('view-' + tabId);
  if (!target) { if (PAGE_URLS[tabId]) location.href = PAGE_URLS[tabId]; return; }
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  target.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-slate-800', 'text-sky-400');
    btn.classList.add('text-slate-300');
  });

  ['nav-','mnav-'].forEach(pr => {
    const a = document.getElementById(pr + tabId);
    if (a) { a.classList.add('text-sky-400'); a.classList.remove('text-slate-300'); if (pr === 'nav-') a.classList.add('bg-slate-800'); }
  });
  const hero = document.getElementById('hero-banner');
  if (hero) hero.classList.toggle('hidden', tabId === 'admin');
  window.scrollTo(0, 0);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Panelde hangi veritabanı kullanıldığını gösteren rozet
function updateModeBadge() {
  const b = document.getElementById('db-mode-badge');
  if (!b) return;
  b.innerHTML = USE_FIREBASE
    ? '<i class="fa-solid fa-cloud mr-1"></i> Bulut (Firebase)'
    : '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Firebase bağlı değil';
  b.className = 'inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold border ' +
    (USE_FIREBASE ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' : 'bg-amber-500/20 text-amber-200 border-amber-400/40');
}

// Firebase modunda giriş penceresi e-posta ister
function adaptLoginForm() {
  if (!USE_FIREBASE) return;
  const input = document.getElementById('login-user');
  input.type = 'email';
  input.placeholder = 'E-posta adresiniz';
  document.querySelector('label[for="login-user"]').textContent = 'E-posta';
  document.getElementById('login-error-text').textContent = 'E-posta veya şifre hatalı.';
}

// ======================================================================
// 5. MÜŞTERİ SAYFALARI
// ======================================================================

function stepperHtml(cur) {
  const steps = [['Kayıt alındı','fa-clipboard-list'],['Arıza tespiti','fa-magnifying-glass'],['Tamirde','fa-screwdriver-wrench'],['Teslime hazır','fa-box-open']];
  return '<ol class="grid grid-cols-4">' + steps.map(([t, ic], i) => {
    const n = i + 1, done = n < cur, now = n === cur, fin = now && n === 4;
    const circle = fin ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 shadow-lg shadow-emerald-500/30'
      : done ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
      : now ? 'bg-white text-sky-600 border-2 border-sky-500 ring-4 ring-sky-100 shadow-lg'
      : 'bg-slate-100 text-slate-400 border border-slate-200';
    const line = i < 3 ? `<span class="absolute top-6 -mt-0.5 left-1/2 w-full h-1 rounded-full ${n < cur ? 'bg-sky-500' : 'bg-slate-200'}"></span>` : '';
    const tc = fin ? 'font-bold text-emerald-700' : now ? 'font-bold text-slate-900' : done ? 'font-semibold text-sky-700' : 'text-slate-400 font-medium';
    return `<li class="relative flex flex-col items-center text-center">${line}
      <span class="relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center text-lg ${circle}"><i class="fa-solid ${done || fin ? 'fa-check' : ic}"></i></span>
      <span class="mt-2.5 text-[11px] sm:text-xs leading-tight ${tc}">${t}</span>
      ${now ? `<span class="mt-1 text-[10px] font-semibold ${fin ? 'text-emerald-600' : 'text-sky-600'}">${fin ? 'Gelip alabilirsiniz' : 'Şu an burada'}</span>` : ''}</li>`;
  }).join('') + '</ol>';
}

function fillSearch(code) {
  document.getElementById('search-input').value = code;
  performSearch();
}

let searchToken = 0;   // eski sorgu sonucu yenisinin üzerine yazmasın

function scrollToResult() {
  const b = document.getElementById('search-result');
  if (b && !b.classList.contains('hidden')) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function performSearch() {
  const inp = document.getElementById('search-input');
  if (inp && document.activeElement === inp) inp.blur(); // telefonda klavye kapansın, sonuç görünsün
  const run = performSearchInner();
  setTimeout(scrollToResult, 60);   // "Aranıyor..." görününce hemen aşağı in
  await run;
  scrollToResult();                  // sonuç gelince tekrar hizala
  setTimeout(scrollToResult, 350);
}
async function performSearchInner() {
  const query = document.getElementById('search-input').value.trim().toUpperCase();
  const resultBox = document.getElementById('search-result');
  resultBox.classList.remove('hidden');

  if (!query) {
    resultBox.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl text-center text-sm font-medium border border-red-200">Lütfen Servis Takip Kodu veya Telefon No yazınız!</div>`;
    return;
  }

  const token = ++searchToken;
  resultBox.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Aranıyor...</div>`;

  let matches;
  try {
    matches = await DB.publicLookup(query);
  } catch (err) {
    if (token !== searchToken) return;
    console.error(err);
    resultBox.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center shadow-xl"><h4 class="font-bold text-slate-800 mb-1">Sorgulama şu an yapılamıyor</h4><p class="text-xs text-slate-500">Lütfen biraz sonra tekrar deneyin veya WhatsApp'tan bize yazın.</p></div>`;
    return;
  }
  if (token !== searchToken) return;

  if (matches.length === 0) {
    resultBox.innerHTML = `
      <div class="glass-card rounded-2xl p-6 text-center shadow-xl">
        <h4 class="font-bold text-slate-800 mb-1">Kayıt Bulunamadı</h4>
        <p class="text-sm text-slate-500">"<strong>${esc(query)}</strong>" için kayıt bulunamadı.</p>
        <p class="text-sm text-slate-600 mt-3">Kodu fişteki gibi yazın (örn. X104-7K3M) ya da telefon numaranızı <strong>05XX XXX XX XX</strong> biçiminde girin.</p>
        <a href="https://wa.me/${OFFICIAL_WA}?text=Merhaba,%20cihaz%20kaydimi%20bulamadim." target="_blank" rel="noopener" class="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl text-sm"><i class="fa-brands fa-whatsapp"></i> WhatsApp'tan yardım iste</a>
      </div>`;
    return;
  }

  resultBox.innerHTML = (matches.length > 1
    ? `<p class="text-sm font-semibold text-slate-600 mb-3 text-center">Bu numaraya ait ${matches.length} kayıt bulundu (en yenisi üstte):</p>` : '')
    + matches.map(ticketCardHtml).join('<div class="h-5"></div>');
  if (matches[0] && matches[0].id) saveRecent(matches[0].id);
}

const RECENT_KEY = 'nokta_recent_codes';
function getRecent() { try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r.filter(x => typeof x === 'string' && /^[A-Z0-9-]{3,24}$/i.test(x)).slice(0, 5) : []; } catch (e) { return []; } }
function saveRecent(code) {
  if (!code) return;
  try { const r = getRecent().filter(x => x !== code); r.unshift(code); localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 5))); } catch (e) {}
  renderRecent();
}
function clearRecent() { try { localStorage.removeItem(RECENT_KEY); } catch (e) {} renderRecent(); }
function renderRecent() {
  const box = document.getElementById('recent-codes'); if (!box) return;
  const r = getRecent();
  box.innerHTML = r.length
    ? '<span>Son sorgular:</span>' + r.map(c => `<button type="button" onclick="fillSearch('${esc(c)}')">${esc(c)}</button>`).join('') + '<button type="button" class="rc-clear" onclick="clearRecent()">Temizle</button>'
    : '';
}

function stepperMini(cur, status) {
  const steps = [['Kayıt alındı', 'fa-clipboard-list'], ['Arıza tespiti', 'fa-magnifying-glass'], ['Tamirde', 'fa-screwdriver-wrench'], ['Teslime hazır', 'fa-box-open']];
  return '<ol class="ms">' + steps.map(([t, ic], k) => {
    const n = k + 1, done = n < cur || (status === 'teslim' && n === 4), fin = status === 'hazir' && n === 4, now = n === cur && !done;
    const cls = fin ? 'ms-c ms-fin' : done ? 'ms-c ms-done' : now ? 'ms-c ms-now' : 'ms-c';
    const line = k < 3 ? `<span class="ms-line ${n < cur ? 'on' : ''}"></span>` : '';
    const sub = fin ? 'Gelip alabilirsiniz' : (now && status !== 'teslim' ? 'Şu an burada' : '');
    return `<li>${line}<span class="${cls}"><i class="fa-solid ${done || fin ? 'fa-check' : ic}"></i></span><span class="ms-t ${done || now || fin ? 'on' : ''}">${t}</span>${sub ? `<span class="ms-s${fin ? ' fin' : ''}">${sub}</span>` : ''}</li>`;
  }).join('') + '</ol>';
}

function ticketCardHtml(match) {
  const stInfo = statusMap[match.status] || statusMap.kayit;
  const stepLevels = { kayit: 1, tespit: 2, tamir: 3, hazir: 4, teslim: 4 };
  const currentStep = stepLevels[match.status] || 1;
  const hint = match.status === 'hazir' ? 'Gelip alabilirsiniz' : (match.status === 'teslim' ? '' : 'Şu an: ' + ['Kayıt alındı', 'Arıza tespiti', 'Tamirde'][currentStep - 1]);

  return `
    <div class="glass-card result-card rc2">

      <div class="rc-top">
        <div class="min-w-0">
          <p class="rc-lbl">Servis kodu</p>
          <div class="rc-code"><h3>${esc(match.id)}</h3><button onclick="copyText('${esc(match.id)}', this)" class="rc-copy" title="Servis kodunu kopyala"><i class="fa-regular fa-copy"></i> Kopyala</button></div>
          <p class="rc-date"><i class="fa-regular fa-clock"></i> Kabul tarihi: ${esc(match.date || 'Bugün')}</p>
        </div>
        <span class="rc-pill border ${stInfo.color}">${stInfo.label}</span>
      </div>

      <div class="rc-steps">${stepperMini(currentStep, match.status)}</div>

      <div class="rc-tiles">
        <div class="rc-tile"><span>Müşteri</span><strong>${esc(match.nameMasked || maskName(match.name))}</strong></div>
        <div class="rc-tile"><span>Cihaz</span><strong>${esc(match.device)}</strong></div>
        <div class="rc-tile"><span>Arıza</span><strong>${esc(match.problem)}</strong></div>
        <div class="rc-tile"><span>Tahmini ücret</span><strong class="rc-price">${match.price ? match.price + ' TL' : 'Belirtilmedi'}</strong></div>
        <div class="rc-tile rc-wide"><span>Aksesuar</span><strong class="rc-acc">${esc(match.gelenler || 'Yok')}</strong></div>
      </div>

      <div class="rc-note">
        <span>Tekniker notu</span>
        <p>${esc(match.note || 'Henüz ek bir not girilmedi.')}</p>
      </div>

      ${match.status === 'teslim'
        ? `<div class="rc-info rc-done"><i class="fa-solid fa-circle-check"></i> <span><strong>Cihazınız teslim edilmiştir.</strong> Bizi tercih ettiğiniz için teşekkür ederiz.</span></div>`
        : match.status === 'hazir'
        ? `<div class="rc-info rc-ready"><i class="fa-solid fa-store"></i> <span><strong>Cihazınız hazır!</strong> Mağazamıza gelip servis fişinizle teslim alabilirsiniz (kapanış 20:00). Adrese gönderim yapılmamaktadır.</span></div>`
        : `<p class="rc-plain"><i class="fa-solid fa-circle-info"></i> Cihaz hazır olunca mağazadan kendiniz teslim alırsınız; kargo/adrese teslim yoktur.</p>`}

      <a href="https://wa.me/${OFFICIAL_WA}?text=Merhaba,%20${esc(match.id)}%20kodlu%20cihazim%20hakkinda%20bilgi%20almak%20istiyorum." target="_blank" rel="noopener" class="rc-wa"><i class="fa-brands fa-whatsapp"></i> WhatsApp'tan bilgi al</a>

    </div>`;
}

function handleBookingSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('book-name').value;
  const phone = document.getElementById('book-phone').value;
  const device = document.getElementById('book-device').value;
  const problem = document.getElementById('book-problem').value;

  const mesaj = encodeURIComponent(`Merhaba Nokta İletişim,\n- *Müşteri:* ${name}\n- *Tel:* ${phone}\n- *Cihaz:* ${device}\n- *Arıza:* ${problem}\n- Cihazı mağazaya kendim getireceğim, kendim teslim alacağım.`);
  window.open(`https://wa.me/${OFFICIAL_WA}?text=${mesaj}`, '_blank');
}

// ======================================================================
// 6. TEKNİKER GİRİŞİ
// ======================================================================

function checkAdminAccess() {
  if (isAdminLoggedIn) {
    switchTab('admin');
    renderAdminTable();
  } else {
    openModal('modal-login');
    setTimeout(() => { const u = document.getElementById('login-user'); if (u) u.focus(); }, 0);
  }
}

// ===== Giriş koruması: üst üste hatalı denemede geçici kilit (15 dk, her turda 2 katı, en çok 24 saat) =====
const LOGIN_MAX_FAILS = 5, LOGIN_LOCK_KEY = 'nokta_login_guard';
function loginGuard() { try { return JSON.parse(localStorage.getItem(LOGIN_LOCK_KEY) || '{}') || {}; } catch (e) { return {}; } }
function loginGuardSave(s) { try { localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(s)); } catch (e) {} }
function loginLockLeft() { const s = loginGuard(); return s.until && s.until > Date.now() ? s.until - Date.now() : 0; }
function loginLockText(ms) {
  const m = Math.ceil(ms / 60000);
  return 'Çok fazla hatalı giriş denemesi. Güvenlik için giriş geçici olarak kapatıldı. ' + (m >= 60 ? Math.ceil(m / 60) + ' saat' : m + ' dakika') + ' sonra tekrar deneyin.';
}
function loginRegisterFail(force) {
  const s = loginGuard(); s.fails = (s.fails || 0) + 1;
  if (force || s.fails >= LOGIN_MAX_FAILS) {
    s.rounds = (s.rounds || 0) + 1; s.fails = 0;
    s.until = Date.now() + Math.min(15 * 60000 * Math.pow(2, s.rounds - 1), 24 * 3600000);
  }
  loginGuardSave(s); return s;
}
function loginGuardReset() { try { localStorage.removeItem(LOGIN_LOCK_KEY); } catch (e) {} }

async function handleAdminLogin(e) {
  e.preventDefault();
  const form = e.target;
  const left = loginLockLeft();
  if (left > 0) {
    const c0 = document.getElementById('login-card'), er0 = document.getElementById('login-error');
    document.getElementById('login-error-text').textContent = loginLockText(left);
    er0.classList.remove('hidden');
    c0.classList.remove('shake'); void c0.offsetWidth; c0.classList.add('shake');
    return;
  }
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true);
  try {
    if (!USE_FIREBASE) throw Object.assign(new Error('no-firebase'), { code: 'app/no-firebase' });
    newSid();   // her girişte yeni oturum kimliği
    await fbAuth.signInWithEmailAndPassword(u, p);
    loginGuardReset();
    form.reset();
    document.getElementById('login-error').classList.add('hidden');
    closeModal('modal-login');
    switchTab('admin');
    renderAdminTable();
  } catch (err) {
    const c = document.getElementById('login-card'), er = document.getElementById('login-error');
    const code = (err && err.code) || '';
    let extra = '';
    if (USE_FIREBASE && code === 'auth/too-many-requests') { loginRegisterFail(true); }
    else if (USE_FIREBASE && !/network|api-key|operation-not-allowed|unauthorized-domain/.test(code)) {
      const st = loginRegisterFail(false);
      if (loginLockLeft() > 0) extra = ' ' + loginLockText(loginLockLeft());
      else extra = ' Kalan deneme: ' + (LOGIN_MAX_FAILS - st.fails) + '.';
    }
    document.getElementById('login-error-text').textContent = loginErrorText(err) + extra;
    er.classList.remove('hidden');
    c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  } finally {
    setBusy(btn, false);
  }
}

// Giriş hatasını anlaşılır yaz (kurulum sorunlarını da gösterir)
function loginErrorText(err) {
  const code = (err && err.code) || '';
  if (!USE_FIREBASE) return 'Giriş şu an kullanılamıyor: Firebase yüklenemedi veya ayarlanmamış.';
  if (code === 'auth/network-request-failed') return 'Bağlantı sorunu. İnternetinizi kontrol edin.';
  if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') return 'Firebase anahtarı (apiKey) hatalı. app.js içindeki FIREBASE_CONFIG\'i kontrol edin.';
  if (code === 'auth/operation-not-allowed') return 'Firebase\'de E-posta/Şifre girişi açık değil (Authentication → Sign-in method).';
  if (code === 'auth/unauthorized-domain') return 'Bu site adresi Firebase\'de yetkili değil (Authentication → Settings → Authorized domains).';
  if (code === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.';
  return 'E-posta veya şifre hatalı.';
}

function togglePass() {
  const i = document.getElementById('login-pass'), e = document.getElementById('pass-eye');
  const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  e.className = 'fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye');
}

// Panelde kalan verileri temizle ve ana sayfaya dön
function resetAdminUi() {
  const body = document.getElementById('admin-table-body'), stats = document.getElementById('admin-stats-box');
  if (body) body.innerHTML = '';
  if (stats) stats.innerHTML = '';
  if (PAGE === 'admin') location.replace('index.html');
}

async function logoutAdmin() {
  if (USE_FIREBASE) { await endSession(); await fbAuth.signOut(); }   // onAuthChanged paneli temizler
  else { isAdminLoggedIn = false; resetAdminUi(); }
  switchTab('sorgula');
  alert('Tekniker panelinden çıkış yapıldı.');
}

// ======================================================================
// 7. TEKNİKER PANELİ: ÖZET VE TABLO
// ======================================================================

function setFilter(v) { document.getElementById('admin-status-filter').value = v; if (document.getElementById('tab-kayit')) setPanelTab('kayit'); renderAdminTable(); }

// Panel sekmeleri: Özet / Kayıtlar / Sistem
function setPanelTab(t) {
  if (!document.getElementById('tab-ozet')) return;
  if (!['ozet', 'kayit', 'sistem'].includes(t)) t = 'ozet';
  ['ozet', 'kayit', 'sistem'].forEach(k => document.getElementById('tab-' + k).classList.toggle('hidden', k !== t));
  document.querySelectorAll('#panel-tabs .ptab').forEach(b => b.classList.toggle('ptab-on', b.dataset.ptab === t));
  try { localStorage.setItem('nokta_ptab', t); } catch (e) {}
}

// Özet kartları: toplam, tamirde, hazır, gelir, gider, net kâr
let statsPeriod = 'bugun'; // bugun | ay | yil | hepsi | secay | secyil
let statsMonth = '';       // 'YYYY-MM'
let statsDay = '';         // 'YYYY-MM-DD'
let statsYear = 0;

// "22.10.2026 - 13:00" -> {d, m, y}
function parseTrDate(str) {
  const m = String(str || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? { d: +m[1], m: +m[2], y: +m[3] } : null;
}

function setStatsPeriod(v) { statsPeriod = v; renderAdminTable(); }
function setStatsMonth(v) { if (!v) return; statsMonth = v; statsPeriod = 'secay'; renderAdminTable(); }
function setStatsDay(v) { if (!v) return; statsDay = v; statsPeriod = 'secgun'; renderAdminTable(); }
function setStatsYear(v) { if (!v) return; statsYear = +v; statsPeriod = 'secyil'; renderAdminTable(); }

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function periodLabel() {
  const n = new Date(), tr = d => d.toLocaleDateString('tr-TR');
  if (statsPeriod === 'bugun') return 'Bugün · ' + tr(n);
  if (statsPeriod === 'dun') return 'Dün · ' + tr(new Date(Date.now() - 86400000));
  if (statsPeriod === 'ay') return 'Bu ay · ' + TR_MONTHS[n.getMonth()] + ' ' + n.getFullYear();
  if (statsPeriod === 'yil') return 'Bu yıl · ' + n.getFullYear();
  if (statsPeriod === 'secyil') return 'Yıl · ' + statsYear;
  if (statsPeriod === 'secay') { const [y, m] = statsMonth.split('-'); return 'Ay · ' + TR_MONTHS[m - 1] + ' ' + y; }
  if (statsPeriod === 'secgun') { const [y, m, d] = statsDay.split('-'); return 'Gün · ' + d + '.' + m + '.' + y; }
  return 'Hepsi · tüm kayıtlar';
}

function inStatsPeriod(dateStr) {
  if (statsPeriod === 'hepsi') return true;
  const now = new Date(), d = parseTrDate(dateStr);
  if (!d) return false;
  if (statsPeriod === 'dun') { const y = new Date(Date.now() - 86400000); return d.y === y.getFullYear() && d.m === y.getMonth() + 1 && d.d === y.getDate(); }
  if (statsPeriod === 'secgun') { const [y, m, dd] = statsDay.split('-').map(Number); return d.y === y && d.m === m && d.d === dd; }
  if (statsPeriod === 'yil') return d.y === now.getFullYear();
  if (statsPeriod === 'secyil') return d.y === statsYear;
  if (statsPeriod === 'secay') { const [y, m] = statsMonth.split('-').map(Number); return d.y === y && d.m === m; }
  if (d.y !== now.getFullYear() || d.m !== now.getMonth() + 1) return false;
  return statsPeriod === 'ay' || d.d === now.getDate();
}

function renderStats(allTickets) {
  const statsBox = document.getElementById('admin-stats-box');
  if (!statsBox) return;

  // Dönem seçici: Bugün / Bu ay / Bu yıl / Hepsi + geçmiş ay ve yıl seçimi
  let bar = document.getElementById('stats-period');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'stats-period';
    bar.className = 'flex items-center gap-2 mb-3 flex-wrap';
    statsBox.insertAdjacentElement('beforebegin', bar);
  }
  const now = new Date();
  const years = new Set([now.getFullYear()]);
  allTickets.forEach(t => { const d = parseTrDate(t.date); if (d) years.add(d.y); });
  const yearList = [...years].sort((a, b) => b - a);
  const labels = { bugun: 'Bugün', dun: 'Dün', ay: 'Bu ay', hepsi: 'Hepsi' };
  const sel = k => statsPeriod === k;
  bar.innerHTML = `<div class="w-full mb-1 text-sm font-extrabold text-[#0f6b67]"><i class="fa-regular fa-calendar-check mr-1"></i>Gösterilen dönem: <span class="text-slate-900">${periodLabel()}</span></div>`
    + '<div class="pscroll">' + Object.keys(labels).map(k => `<button type="button" onclick="setStatsPeriod('${k}')" class="pchip ${sel(k) ? 'pchip-on' : ''}">${sel(k) ? '<i class="fa-solid fa-check mr-1"></i>' : ''}${labels[k]}</button>`).join('')
    + `<label class="pchip-lbl">Gün <span class="daypick pchip ${sel('secgun') ? 'pchip-sel' : ''}"><span class="daypick-t">${/^\d{4}-\d\d-\d\d$/.test(statsDay || '') ? statsDay.slice(8, 10) + '.' + statsDay.slice(5, 7) + '.' + statsDay.slice(2, 4) : 'gg.aa.yy'}</span><input type="date" value="${statsDay}" onchange="setStatsDay(this.value)" aria-label="Gün seç"></span></label>`
    + '</div>';

  const tickets = allTickets.filter(t => inStatsPeriod(t.date));

  const total = tickets.length;
  const tamirde = allTickets.filter(t => t.status === 'tamir').length;     // şu an tamirde olanlar (hangi tarihte açılmış olursa olsun)
  const hazir = allTickets.filter(t => t.status === 'hazir').length;      // şu an teslim bekleyenler
  const teslimN = allTickets.filter(t => t.status === 'teslim' && inStatsPeriod(deliveredAt(t))).length;

  // Gelir, gider ve net kâr
  let totalGelir = 0;
  let totalGider = 0;

  tickets.forEach(t => {
    totalGelir += Number(t.price) || 0;
    totalGider += Number(t.cost) || 0;
  });

  const netKar = totalGelir - totalGider;

  statsBox.innerHTML = `
    <div class="stat stat-net"><div class="stat-ico"><i class="fa-solid fa-wallet"></i></div><div class="stat-lbl">Net Kazanç</div><div class="stat-val">${netKar} TL</div></div>
    <div class="stat stat-gelir"><div class="stat-ico"><i class="fa-solid fa-arrow-trend-up"></i></div><div class="stat-lbl">Gelir</div><div class="stat-val">${totalGelir} TL</div></div>
    <div class="stat stat-gider"><div class="stat-ico"><i class="fa-solid fa-arrow-trend-down"></i></div><div class="stat-lbl">Gider</div><div class="stat-val">${totalGider} TL</div></div>
    <div class="stat stat-cihaz"><div class="stat-ico"><i class="fa-solid fa-mobile-screen"></i></div><div class="stat-lbl">Yeni Kayıt</div><div class="stat-val">${total}</div></div>
    <div class="stat stat-tamir"><div class="stat-ico"><i class="fa-solid fa-screwdriver-wrench"></i></div><div class="stat-lbl">Tamirde</div><div class="stat-val">${tamirde}</div></div>
    <div class="stat stat-hazir"><div class="stat-ico"><i class="fa-solid fa-circle-check"></i></div><div class="stat-lbl">Teslime hazır</div><div class="stat-val">${hazir}</div></div>
<div class="stat stat-teslim"><div class="stat-ico"><i class="fa-solid fa-hand-holding"></i></div><div class="stat-lbl">Teslim Edildi</div><div class="stat-val">${teslimN}</div></div>
  `;
}

// ===== Ödeme (nakit / kart / havale) =====
const PAY = {
  nakit:  { label: 'Nakit',  icon: 'fa-money-bill-wave',   tile: 'paytile-nakit',  badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  kart:   { label: 'Kart',   icon: 'fa-credit-card',       tile: 'paytile-kart',   badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  havale: { label: 'Havale', icon: 'fa-building-columns',  tile: 'paytile-havale', badge: 'bg-sky-100 text-sky-800 border-sky-300' }
};
const money = n => (Number(n) || 0).toLocaleString('tr-TR') + ' TL';
// Ödenmemiş: hazır/teslim edilmiş, ücreti var, ödeme şekli açıkça boş. (Eski kayıtlarda alan hiç yoktur: onlar sayılmaz.)
function isUnpaid(t) { return (t.status === 'hazir' || t.status === 'teslim') && (Number(t.price) || 0) > 0 && t.payMethod === ''; }
function payBadge(t) {
  if (t.payMethod && PAY[t.payMethod]) return '<br><span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ' + PAY[t.payMethod].badge + '"><i class="fa-solid ' + PAY[t.payMethod].icon + ' mr-1"></i>' + PAY[t.payMethod].label + '</span>';
  if (isUnpaid(t)) return '<br><span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-800 border-amber-300"><i class="fa-solid fa-hourglass-half mr-1"></i>Ödenmedi</span>';
  return '';
}

// "Ödeme nasıl alındı?" penceresi. Sonuç: 'nakit' | 'kart' | 'havale' | '' (henüz ödenmedi) | null (vazgeç)
function askPayment(t) {
  return new Promise(resolve => {
    let m = document.getElementById('modal-pay');
    if (!m) {
      m = document.createElement('div'); m.id = 'modal-pay';
      m.className = 'fixed inset-0 z-[60] bg-slate-900/70 hidden flex items-center justify-center p-4';
      m.onclick = e => { if (e.target === m) window.__payPick(null); };
      document.body.appendChild(m);
    }
    window.__payPick = v => { closeModal('modal-pay'); resolve(v); };
    const btn = k => '<button onclick="__payPick(\'' + k + '\')" class="paypick paypick-' + k + '"><i class="fa-solid ' + PAY[k].icon + ' text-2xl mb-1"></i><span>' + PAY[k].label + '</span></button>';
    m.innerHTML = '<div class="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl">'
      + '<div class="text-center"><div class="text-xs font-bold text-slate-500 uppercase tracking-wide">Teslim edilirken</div>'
      + '<h3 class="text-xl font-extrabold text-slate-900 mt-1">Ödeme nasıl alındı?</h3>'
      + '<p class="text-sm text-slate-600 mt-1"><span class="font-mono font-bold text-emerald-700">' + esc(t.id) + '</span> · ' + esc(t.name) + '</p>'
      + '<p class="text-2xl font-black text-emerald-600 mt-1">' + money(t.price) + '</p></div>'
      + '<div class="grid grid-cols-3 gap-2 mt-4">' + btn('nakit') + btn('kart') + btn('havale') + '</div>'
      + '<button onclick="__payPick(\'\')" class="w-full mt-3 py-3 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-800 font-bold text-sm"><i class="fa-solid fa-hourglass-half mr-1"></i> Henüz ödenmedi (sonra alınacak)</button>'
      + '<button onclick="__payPick(null)" class="w-full mt-2 py-2 text-slate-500 font-semibold text-sm">Vazgeç</button></div>';
    openModal('modal-pay');
  });
}

// Satırdan hızlı durum değiştirme (Düzenle penceresini açmadan)
async function quickStatus(id, v) {
  const t = getTickets().find(x => x.id === id);
  if (!t || t.status === v) return;
  let pay = t.payMethod, paidAt = t.paidAt;
  if (v === 'teslim') {
    if ((Number(t.price) || 0) > 0 && !t.payMethod) {
      const r = await askPayment(t);
      if (r === null) { renderAdminTable(); return; }
      pay = r; paidAt = r ? nowTr() : '';
    } else if (!confirm(id + ' kodlu cihaz "Teslim edildi" olarak işaretlensin mi?')) { renderAdminTable(); return; }
  }
  const next = Object.assign({}, t, { status: v });
  if (pay !== undefined) { next.payMethod = pay; next.paidAt = paidAt || ''; }
  try { await DB.save(next, t); } catch (e) { dbFail(e); renderAdminTable(); }
}

// ===== Tahsilat kutusu (nakit / kart / havale / alacak) =====
function payTotals(all) {
  const o = { nakit: { n: 0, sum: 0 }, kart: { n: 0, sum: 0 }, havale: { n: 0, sum: 0 }, unpaid: { n: 0, sum: 0 } };
  all.forEach(t => {
    if (t.payMethod && o[t.payMethod] && inStatsPeriod(t.paidAt || t.date)) { o[t.payMethod].n++; o[t.payMethod].sum += Number(t.price) || 0; }
    if (isUnpaid(t)) { o.unpaid.n++; o.unpaid.sum += Number(t.price) || 0; }
  });
  return o;
}
function renderPayBox(all) {
  const box = document.getElementById('pay-box');
  if (!box || !isAdminLoggedIn) return;
  const o = payTotals(all), total = o.nakit.sum + o.kart.sum + o.havale.sum;
  const tile = k => `<div class="paytile ${PAY[k].tile}"><div class="paytile-ico"><i class="fa-solid ${PAY[k].icon}"></i></div><div><div class="paytile-lbl">${PAY[k].label}</div><div class="paytile-val">${money(o[k].sum)}</div><div class="paytile-sub">${o[k].n} ödeme</div></div></div>`;
  let sn = document.getElementById('stats-note');
  if (!sn) { const sb = document.getElementById('admin-stats-box'); if (sb) { sn = document.createElement('p'); sn.id = 'stats-note'; sn.className = 'text-[11px] text-slate-400 font-medium px-1 mt-1'; sn.textContent = 'Tamirde ve Teslime hazır: şu anki durum. Diğer kartlar seçili döneme göre.'; sb.insertAdjacentElement('afterend', sn); } }
  box.innerHTML = `<div class="mb-2 px-1"><div class="text-sm font-extrabold text-slate-800"><i class="fa-solid fa-wallet text-[#16a095] mr-1.5"></i>Tahsilat</div><div class="text-xs font-semibold text-slate-500 mt-0.5">${periodLabel()} · toplam alınan: <span class="text-emerald-700 font-extrabold">${money(total)}</span></div></div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">${tile('nakit')}${tile('kart')}${tile('havale')}
    <button type="button" onclick="setFilter('unpaid')" class="paytile paytile-alacak text-left"><div class="paytile-ico"><i class="fa-solid fa-hourglass-half"></i></div><div><div class="paytile-lbl">Alacak (ödenmemiş)</div><div class="paytile-val">${money(o.unpaid.sum)}</div><div class="paytile-sub">${o.unpaid.n} kayıt · göster</div></div></button></div>`;
}

// ===== Rapor (A4 çıktı) ve Excel (CSV) =====
function printReport() {
  const all = getTickets(), box = document.getElementById('print-area');
  if (!box) return;
  const reg = all.filter(t => inStatsPeriod(t.date)).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const gelir = reg.reduce((s, t) => s + (Number(t.price) || 0), 0), gider = reg.reduce((s, t) => s + (Number(t.cost) || 0), 0);
  const teslimN = all.filter(t => t.status === 'teslim' && inStatsPeriod(deliveredAt(t))).length;
  const o = payTotals(all), tahsil = o.nakit.sum + o.kart.sum + o.havale.sum;
  const sum = (l, v) => '<div><span>' + l + '</span><b>' + v + '</b></div>';
  const rows = reg.map(t => '<tr><td>' + esc(t.id) + '</td><td>' + esc(String(t.date).split(' - ')[0]) + '</td><td>' + esc(t.name) + '</td><td>' + esc(t.device) + '</td><td>' + esc(t.problem) + '</td><td class="r">' + (Number(t.price) || 0) + '</td><td class="r">' + (Number(t.cost) || 0) + '</td><td>' + (t.payMethod && PAY[t.payMethod] ? PAY[t.payMethod].label : (isUnpaid(t) ? 'Ödenmedi' : '-')) + '</td><td>' + esc((statusMap[t.status] || {}).label ? statusMap[t.status].label.replace(/^\d\.\s*/, '') : '') + '</td></tr>').join('');
  box.innerHTML = '<div class="report">'
    + '<div class="report-head"><img src="' + document.getElementById('site-logo').src + '" alt=""><div><h1>' + SHOP.name + ' · Dönem Raporu</h1><div class="rsub">' + esc(periodLabel()) + ' · Çıktı: ' + esc(nowTr()) + '</div></div></div>'
    + '<div class="sum">' + sum('Yeni kayıt', reg.length) + sum('Teslim edilen', teslimN) + sum('Gelir', money(gelir)) + sum('Gider', money(gider)) + sum('Net kazanç', money(gelir - gider)) + '</div>'
    + '<div class="sum sum4">' + sum('Nakit', money(o.nakit.sum)) + sum('Kart', money(o.kart.sum)) + sum('Havale', money(o.havale.sum)) + sum('Alacak (ödenmemiş)', money(o.unpaid.sum)) + '</div>'
    + '<div class="rnote">Tahsil edilen toplam: <b>' + money(tahsil) + '</b> · Gelir/gider kayıt tarihine, tahsilat ödeme tarihine, teslim sayısı teslim tarihine göre hesaplanır.</div>'
    + '<table><thead><tr><th>Kod</th><th>Tarih</th><th>Müşteri</th><th>Cihaz</th><th>Arıza</th><th>Ücret</th><th>Maliyet</th><th>Ödeme</th><th>Durum</th></tr></thead><tbody>' + (rows || '<tr><td colspan="9">Bu dönemde kayıt yok.</td></tr>') + '</tbody>'
    + '<tfoot><tr><td colspan="5">TOPLAM (' + reg.length + ' kayıt)</td><td class="r">' + gelir + '</td><td class="r">' + gider + '</td><td colspan="2">Net: ' + (gelir - gider) + ' TL</td></tr></tfoot></table></div>';
  box.classList.remove('hidden');
  const oldTitle = document.title;
  document.title = 'Nokta-Rapor-' + periodLabel().replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü.]+/g, '-').replace(/^-|-$/g, '');   // PDF olarak kaydederken önerilen dosya adı
  const restore = () => { document.title = oldTitle; box.classList.add('hidden'); window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  setTimeout(() => { window.print(); setTimeout(restore, 1500); }, 350);
}

// Teslim bekleyen (hazır) cihazlar listesi
let readyOpen = true;
function renderReadyBox(all) {
  const box = document.getElementById('ready-box');
  if (!box || !isAdminLoggedIn) return;
  const list = all.filter(t => t.status === 'hazir').sort((a, b) => daysReady(b) - daysReady(a));
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<details class="glass-card p-4 sm:p-5" ${readyOpen ? 'open' : ''} ontoggle="readyOpen = this.open">
    <summary class="cursor-pointer flex items-center justify-between gap-3 font-extrabold text-slate-900 list-none"><span><i class="fa-solid fa-box-open text-emerald-600 mr-2"></i>Teslim bekleyen cihazlar</span><span class="text-xs font-bold text-emerald-700">${list.length} cihaz</span></summary>
    <ul class="mt-3 divide-y divide-slate-100">${list.slice(0, 12).map(t => `<li class="py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <div class="min-w-0"><div class="font-bold text-slate-900 text-sm"><span class="font-mono text-emerald-700">${esc(t.id)}</span> · ${esc(t.name)}</div><div class="text-[11px] text-slate-500 font-medium">${esc(t.device)} · ${daysReady(t)} gündür bekliyor${daysReady(t) >= 30 ? ' <b class="text-amber-700">⚠ 30+ gün</b>' : ''}</div></div>
      <div class="flex gap-2 shrink-0 flex-wrap"><a href="https://wa.me/${waNumber(t.phone)}?text=${encodeURIComponent(buildNotifyMsg(t, statusMap.hazir))}" target="_blank" class="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"><i class="fa-brands fa-whatsapp"></i> Haber ver</a><button onclick="quickStatus('${esc(t.id)}','teslim')" class="text-xs font-bold text-white bg-slate-700 hover:bg-slate-900 rounded-lg px-3 py-2"><i class="fa-solid fa-hand-holding"></i> Teslim edildi</button></div></li>`).join('')}</ul>
    ${list.length > 12 ? '<p class="text-[11px] text-slate-400 mt-2">İlk 12 cihaz gösteriliyor.</p>' : ''}</details>`;
}

// Müşteriye gidecek WhatsApp metni (duruma göre)
function buildNotifyMsg(t, st) {
  const link = SITE_URL + '/?kod=' + encodeURIComponent(t.id);
  if (t.status === 'hazir') {
    const u = Number(t.price) || 0;
    const rev = GOOGLE_REVIEW_URL || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Nokta İletişim Kırklareli');
    return `Sayın ${t.name}, ${t.id} kodlu ${t.device} cihazınız *teslime hazırdır* ✅\nServis fişinizle mağazamızdan teslim alabilirsiniz.${u ? '\nÜcret: ' + u + ' TL' : ''}\n\nGoogle'da kısa bir yorum yazarsanız çok seviniriz 🙏\n${rev}\n\nNokta İletişim · ${SHOP.phoneDisplay}`;
  }
  return `Sayın ${t.name}, ${t.id} kodlu ${t.device} cihazınızın durumu: *${st.label}*.${t.note ? '\nNot: ' + t.note : ''}\nCanlı takip: ${link}\nNokta İletişim`;
}

// Kayıt tablosunu (masaüstü) / kartlarını (mobil) çizer
function renderAdminTable() {
  const tbody = document.getElementById('admin-table-body');
  if (!tbody || !isAdminLoggedIn) return;
  tbody.innerHTML = '';

  let tickets = getTickets();
  const phoneCount = {};
  tickets.forEach(t => { const k = digits(t.phone).slice(-10); phoneCount[k] = (phoneCount[k] || 0) + 1; });

  // Özet kartlarını güncelle
  renderStats(tickets);
  renderPayBox(tickets);
  renderOverdue(tickets);
  renderReadyBox(tickets);
  renderLive();
  const totalCount = tickets.length;

  // Arama ve filtre
  const searchQuery = document.getElementById('admin-search-input')?.value.trim().toLowerCase() || '';
  const statusFilter = document.getElementById('admin-status-filter')?.value || 'all';
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('chip-on', c.dataset.v === statusFilter));

  if (searchQuery) {
    tickets = tickets.filter(t => 
      t.id.toLowerCase().includes(searchQuery) || 
      t.name.toLowerCase().includes(searchQuery) || 
      t.phone.includes(searchQuery) || 
      t.device.toLowerCase().includes(searchQuery)
    );
  }

  if (statusFilter === 'unpaid') {
    tickets = tickets.filter(isUnpaid);
  } else if (statusFilter !== 'all') {
    tickets = tickets.filter(t => t.status === statusFilter);
  }

  // Dönem süzgeci: arama/durum süzgeci yokken seçili dönemdeki kayıtlar + devam eden işler (teslim edilmeyenler)
  const periodActive = !searchQuery && statsPeriod !== 'hepsi' && (statusFilter === 'all' || statusFilter === 'teslim');
  if (periodActive) tickets = tickets.filter(t => t.status !== 'teslim' || inStatsPeriod(deliveredAt(t)));
  let note = document.getElementById('list-note');
  if (!note) {
    const sc = document.getElementById('admin-search-input')?.closest('.glass-card');
    if (sc) { note = document.createElement('div'); note.id = 'list-note'; sc.insertAdjacentElement('afterend', note); }
  }
  if (note) note.innerHTML = periodActive
    ? `<div class="px-1 py-2 text-xs font-semibold text-slate-600"><i class="fa-regular fa-calendar mr-1 text-[#16a095]"></i>${tickets.length} kayıt: <b>${periodLabel()}</b>${statusFilter === 'all' ? ' + devam eden işler' : ''} (teslim edilenler teslim tarihine göre) · <button onclick="setStatsPeriod('hepsi')" class="text-sky-700 underline font-bold">Hepsini göster</button></div>`
    : `<div class="px-1 py-2 text-xs font-semibold text-slate-500">${tickets.length} kayıt gösteriliyor${searchQuery || statusFilter !== 'all' ? ' (arama / durum süzgeci tüm kayıtlarda çalışır)' : ''}</div>`;

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center"><div class="w-full text-center">${totalCount === 0
      ? '<i class="fa-solid fa-inbox text-3xl text-slate-300 mb-3 block"></i><p class="text-sm text-slate-500 mb-4">Henüz servis kaydı yok.</p><button onclick="openNewRecordModal()" class="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"><i class="fa-solid fa-plus-circle mr-1"></i> İlk servis kaydını ekle</button>'
      : '<p class="text-xs text-slate-400">Bu süzgece uygun kayıt bulunamadı.' + (periodActive ? ' <button onclick="setStatsPeriod(\'hepsi\')" class="text-sky-700 underline font-bold">Hepsini göster</button>' : '') + '</p>'}</div></td></tr>`;
    return;
  }

  const rows = [];
  tickets.forEach(t => {
    const st = statusMap[t.status] || statusMap.kayit;
    const cleanPhone = t.phone ? t.phone.replace(/[^0-9]/g, '') : '';
    const waPhone = cleanPhone.startsWith('0') ? '9' + cleanPhone : (cleanPhone.startsWith('90') ? cleanPhone : '90' + cleanPhone);

    const notifyMsg = buildNotifyMsg(t, st);

    const gelirVal = Number(t.price) || 0;
    const giderVal = Number(t.cost) || 0;
    const karVal = gelirVal - giderVal;

    rows.push(`
      <tr class="hover:bg-slate-50 transition-all">
        <td data-label="Servis Kod" class="py-3.5 px-4 font-black text-sky-700 font-mono whitespace-nowrap"><div class="cv">${esc(t.id)} <button onclick="copyText('${esc(t.id)}', this)" class="ml-1 text-slate-400 hover:text-sky-700 text-xs font-sans font-semibold" title="Servis kodunu kopyala"><i class="fa-regular fa-copy"></i></button>${daysReady(t) >= 30 ? ' <span class="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5 font-sans">' + daysReady(t) + ' gün alınmadı</span>' : ''}</div></td>
        <td data-label="Kayıt Tarihi" class="py-3.5 px-4 text-xs font-semibold text-slate-600 whitespace-nowrap"><div class="cv"><i class="fa-regular fa-clock text-sky-600 mr-1"></i>${esc(String(t.date || '').split(' - ')[0])}${String(t.date || '').includes(' - ') ? '<br><small class="text-slate-400 font-medium">' + esc(String(t.date).split(' - ')[1]) + '</small>' : ''}${t.status === 'teslim' ? '<br><small class="text-emerald-700 font-bold">Teslim: ' + esc(deliveredAt(t).replace(' - ', ' ')) + '</small>' : ''}</div></td>
        <td data-label="Müşteri / Tel" class="py-3.5 px-4 whitespace-nowrap"><div class="cv"><span class="font-bold text-slate-800">${esc(t.name)}</span>${(phoneCount[digits(t.phone).slice(-10)] || 1) > 1 ? ` <span class="text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5" title="Aynı numaradan toplam kayıt">Eski müşteri · ${phoneCount[digits(t.phone).slice(-10)]}</span>` : ''}<br><small class="text-slate-400">${esc(t.phone)}</small></div></td>
        <td data-label="Cihaz" class="py-3.5 px-4"><div class="cv"><span class="text-slate-800 font-semibold">${esc(t.device)}</span>${t.serino ? '<br><small class="text-slate-400">SN: ' + esc(t.serino) + '</small>' : ''}${t.lockcode ? '<br><small class="font-mono text-slate-700">Ekran: <b>' + esc(t.lockcode) + '</b></small>' : ''}${t.simpin ? '<br><small class="font-mono text-slate-500">SIM PIN: <b>' + esc(t.simpin) + '</b></small>' : ''}${t.gelenler ? '<br><small class="text-amber-800 font-medium">Üzerinde: ' + esc(t.gelenler) + '</small>' : ''}</div></td>
        <td data-label="Arıza / Beyan" class="py-3.5 px-4 text-slate-700 text-xs max-w-xs truncate"><div class="cv">${esc(t.problem)}</div></td>
        <td data-label="Ücret / Maliyet" class="py-3.5 px-4 text-xs font-semibold whitespace-nowrap"><div class="cv">
          <span class="text-emerald-600 font-extrabold">${gelirVal} TL</span>${payBadge(t)}
          ${giderVal > 0 ? '<br><small class="text-slate-500 font-semibold">Maliyet ' + giderVal + ' · <span class="text-sky-700 font-bold">Kâr ' + karVal + '</span></small>' : ''}
        </div></td>
        <td data-label="Durum" class="py-3.5 px-4 whitespace-nowrap"><div class="cv"><select onchange="quickStatus('${esc(t.id)}', this.value)" class="px-2.5 py-1.5 rounded-full text-xs font-bold border ${st.color} cursor-pointer max-w-full" title="Durumu değiştir">${Object.keys(statusMap).map(k => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${statusMap[k].label}</option>`).join('')}</select></div></td>
        <td data-label="İşlem" class="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
          <a href="https://wa.me/${waPhone}?text=${encodeURIComponent(notifyMsg)}" target="_blank" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 p-2 rounded-lg text-xs transition-all border border-emerald-200 inline-block" title="Müşteriye WhatsApp Gönder">
            <i class="fa-brands fa-whatsapp text-sm"></i><span class="act-label">WhatsApp</span>
          </a>
          <button onclick="copyReadyMessage('${esc(t.id)}', this)" class="bg-slate-100 hover:bg-sky-100 text-sky-700 p-2 rounded-lg text-xs border border-slate-200" title="Hazır mesajı kopyala"><i class="fa-regular fa-copy"></i><span class="act-label">Kopyala</span></button>
          <button onclick="printReceipt('${esc(t.id)}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg text-xs border border-slate-200" title="Servis fişi yazdır"><i class="fa-solid fa-print"></i><span class="act-label">Fiş</span></button>
          <button onclick="openEditModal('${esc(t.id)}')" title="Düzenle" class="bg-slate-100 hover:bg-sky-100 text-sky-700 p-2 rounded-lg text-xs transition-all border border-slate-200"><i class="fa-solid fa-pen"></i><span class="act-label"> Düzenle</span></button>
          <button onclick="deleteTicket('${esc(t.id)}')" title="Sil" class="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg text-xs transition-all border border-red-200"><i class="fa-solid fa-trash"></i><span class="act-label"> Sil</span></button>
          <button onclick="showHistory('${esc(t.id)}')" class="bg-slate-100 hover:bg-sky-100 text-slate-700 p-2 rounded-lg text-xs border border-slate-200" title="Kayıt tarihçesi"><i class="fa-solid fa-clock-rotate-left"></i><span class="act-label"> Tarihçe</span></button>
        </td>
      </tr>`);
  });
  tbody.innerHTML = rows.join('');
}

// ======================================================================
// 8. KAYIT İŞLEMLERİ
// ======================================================================

function openNewRecordModal() {
  const rb = document.getElementById('returning-box'); if (rb) { rb.classList.add('hidden'); rb.innerHTML = ''; }
  const dt = document.getElementById('admin-add-date'); if (dt) dt.value = todayStr();
  const ap = document.getElementById('admin-add-pay'); if (ap) ap.value = '';   // varsayılan: bugün (değiştirilebilir)
  openModal('modal-new-ticket');
}

// Aynı telefon numarasına ait önceki kayıtları bul (son 10 hane)
function customerHistory(phone) {
  const d = digits(phone).slice(-10);
  if (d.length < 10) return [];
  return getTickets().filter(t => digits(t.phone).slice(-10) === d);
}

// Yeni kayıtta telefon yazılınca önceki müşteriyi tanı
function checkReturning() {
  const box = document.getElementById('returning-box');
  const hist = customerHistory(document.getElementById('admin-add-phone').value);
  if (!hist.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const last = hist[0];
  const nameInput = document.getElementById('admin-add-name');
  if (!nameInput.value.trim()) nameInput.value = last.name;
  box.innerHTML = `<div class="font-bold text-sm"><i class="fa-solid fa-user-check mr-1"></i> Tanıdık müşteri: ${esc(last.name)} — ${hist.length} önceki kayıt</div>`
    + hist.slice(0, 5).map(h => `<div class="text-emerald-800">• ${esc(h.id)} · ${esc(h.device)} · ${esc((statusMap[h.status] || statusMap.kayit).label)} · ${esc(h.date || '')}</div>`).join('')
    + (hist.length > 5 ? `<div class="text-emerald-700">... ve ${hist.length - 5} kayıt daha</div>` : '');
  box.classList.remove('hidden');
}

// Müşteriye gönderilecek hazır mesaj
function readyMessage(t) {
  return `Sayın ${t.name}, cihazınız Nokta İletişim Teknik Servis kaydına alındı. Servis kodunuz: ${t.id}. Cihazınızın durumunu web sitemizden bu kodla takip edebilirsiniz.`;
}

function copyReadyMessage(id, btn) {
  const t = getTickets().find(x => x.id === id);
  if (t) copyText(t.status === 'hazir' ? buildNotifyMsg(t, statusMap.hazir) : readyMessage(t), btn);
}

function showCreated(t) {
  document.getElementById('created-code').textContent = t.id;
  const msg = readyMessage(t);
  document.getElementById('created-wa').href = `https://wa.me/${waNumber(t.phone)}?text=` + encodeURIComponent(msg);
  document.getElementById('created-print').onclick = () => printReceipt(t.id);
  document.getElementById('created-copy-code').onclick = e => copyText(t.id, e.currentTarget);
  document.getElementById('created-copy-msg').onclick = e => copyText(msg, e.currentTarget);
  openModal('modal-created');
}

async function handleAdminCreateTicket(e) {
  e.preventDefault();
  const form = e.target;
  if (digits(document.getElementById('admin-add-phone').value).length < 10) {
    alert('Telefon numarası en az 10 haneli olmalı (örn: 05XX XXX XX XX).');
    return;
  }
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true);
  try {
    const now = new Date();
    const timeNow = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const chosen = document.getElementById('admin-add-date').value || todayStr();
    const [cy, cm, cd] = chosen.split('-').map(Number);
    const ticket = {
      id: await DB.nextId(),
      ts: new Date(cy, cm - 1, cd, now.getHours(), now.getMinutes()).getTime(),
      date: inputToTr(chosen, timeNow),
      name: document.getElementById('admin-add-name').value.trim(),
      phone: document.getElementById('admin-add-phone').value.trim(),
      device: document.getElementById('admin-add-device').value.trim(),
      serino: document.getElementById('admin-add-serino').value,
      lockcode: document.getElementById('admin-add-lockcode').value,
      simpin: document.getElementById('admin-add-simpin').value,
      gelenler: document.getElementById('admin-add-gelenler').value,
      problem: document.getElementById('admin-add-problem').value,
      price: Number(document.getElementById('admin-add-price').value) || 0,
      cost: Number(document.getElementById('admin-add-cost').value) || 0,
      status: document.getElementById('admin-add-status').value,
      payMethod: document.getElementById('admin-add-pay').value,
      paidAt: document.getElementById('admin-add-pay').value ? inputToTr(chosen, timeNow) : '',
      note: document.getElementById('admin-add-note').value || 'Kayıt açıldı.'
    };
    await DB.save(ticket, null);
    form.reset();
    closeModal('modal-new-ticket');
    renderAdminTable();
    showCreated(ticket);
  } catch (err) {
    dbFail(err);
  } finally {
    setBusy(btn, false);
  }
}

function openEditModal(id) {
  const item = getTickets().find(t => t.id === id);
  if (!item) return;
  document.getElementById('admin-edit-id').value = id;
  document.getElementById('admin-edit-status').value = item.status;
  ['name', 'phone', 'device', 'problem'].forEach(k => document.getElementById('admin-edit-' + k).value = item[k] || '');
  document.getElementById('admin-edit-lockcode').value = item.lockcode || '';
  document.getElementById('admin-edit-simpin').value = item.simpin || '';
  document.getElementById('admin-edit-price').value = item.price || 0;
  document.getElementById('admin-edit-cost').value = item.cost || 0;
  document.getElementById('admin-edit-gelenler').value = item.gelenler || '';
  document.getElementById('admin-edit-note').value = item.note || '';
  document.getElementById('admin-edit-date').value = dateToInput(item.date);
  const ep = document.getElementById('admin-edit-pay');
  [...ep.querySelectorAll('option[value="__old"]')].forEach(o => o.remove());
  if (item.payMethod === undefined) { ep.insertAdjacentHTML('afterbegin', '<option value="__old">Bilinmiyor (eski kayıt)</option>'); ep.value = '__old'; }
  else ep.value = item.payMethod || '';
  openModal('modal-edit-ticket');
}

async function handleAdminUpdateTicket(e) {
  e.preventDefault();
  const form = e.target;
  const id = document.getElementById('admin-edit-id').value;
  const prev = getTickets().find(t => t.id === id);
  if (!prev) { closeModal('modal-edit-ticket'); return; }
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true);
  try {
    const next = Object.assign({}, prev, {
      status: document.getElementById('admin-edit-status').value,
      lockcode: document.getElementById('admin-edit-lockcode').value,
      simpin: document.getElementById('admin-edit-simpin').value,
      price: Number(document.getElementById('admin-edit-price').value) || 0,
      cost: Number(document.getElementById('admin-edit-cost').value) || 0,
      gelenler: document.getElementById('admin-edit-gelenler').value,
      note: document.getElementById('admin-edit-note').value
    });
    ['name', 'phone', 'device', 'problem'].forEach(k => next[k] = document.getElementById('admin-edit-' + k).value.trim());
    const pv = document.getElementById('admin-edit-pay').value;
    if (pv !== '__old') {
      next.payMethod = pv;
      next.paidAt = pv ? (prev.payMethod === pv && prev.paidAt ? prev.paidAt : nowTr()) : '';
    }
    const nd = document.getElementById('admin-edit-date').value;
    if (nd && nd !== dateToInput(prev.date)) {
      next.date = inputToTr(nd, String(prev.date || '').split(' - ')[1]);
      const [ey, em, ed] = nd.split('-').map(Number); const pt = new Date(prev.ts || Date.now());
      next.ts = new Date(ey, em - 1, ed, pt.getHours(), pt.getMinutes()).getTime();
    }
    await DB.save(next, prev);
    renderAdminTable();
    closeModal('modal-edit-ticket');
  } catch (err) {
    dbFail(err);
  } finally {
    setBusy(btn, false);
  }
}

// Silince true, vazgeçilince/başarısız olunca false döner
async function deleteTicket(id) {
  const t = getTickets().find(x => x.id === id);
  if (!t || !confirm(`${id} kodlu cihaz kaydını silmek istediğinize emin misiniz?`)) return false;
  try {
    await DB.remove(t);
    renderAdminTable();
    return true;
  } catch (err) {
    dbFail(err);
    return false;
  }
}

// ======================================================================
// 9. SERVİS FİŞİ
// ======================================================================

function printReceipt(id) {
  const t = getTickets().find(x => x.id === id);
  if (!t) return;

  const terms = RECEIPT_TERMS.map(item => `<li>${item}</li>`).join('');
  const box = document.getElementById('print-area');

  box.innerHTML = `
    <div class="receipt">
      <div class="receipt-head">
        <img class="receipt-logo" src="${document.getElementById('site-logo').src}" alt="">
        <div>
          <h2>${SHOP.name}</h2>
          <div class="receipt-sub">Servis Fişi · Tel: ${SHOP.phoneDisplay}</div>
        </div>
      </div>
      <p class="receipt-info">
        <b>Servis Kodu:</b> ${esc(t.id)}<br>
        <b>Tarih:</b> ${esc(t.date)}<br>
        <b>Müşteri:</b> ${esc(t.name)} (${esc(t.phone)})<br>
        <b>Cihaz:</b> ${esc(t.device)}<br>
        <b>Seri No:</b> ${esc(t.serino || '-')}<br>
        <b>Üzerinde gelenler:</b> ${esc(t.gelenler || 'Yok')}<br>
        <b>Arıza:</b> ${esc(t.problem)}<br>
        <b>Tahmini ücret:</b> ${Number(t.price) || 0} TL
      </p>
      <div class="receipt-qr"><div id="receipt-qr"></div><span>Cihaz durumunu görmek için telefonunuzla QR kodu okutun.<br><b>${SITE_URL}</b></span></div>
      <p class="receipt-note">Cihaz durumunu servis koduyla web sitemizden takip edebilirsiniz. Teslim alırken bu fiş gereklidir.</p>
      <div class="receipt-terms">
        <b>SERVİS ŞARTLARI</b>
        <ol>${terms}</ol>
      </div>
      <p class="receipt-sign">Müşteri imzası: ______________</p>
    </div>`;

  box.classList.remove('hidden');
  try {
    if (window.QRCode) new QRCode(document.getElementById('receipt-qr'), { text: SITE_URL + '/?kod=' + encodeURIComponent(t.id), width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
  } catch (e) {}
  setTimeout(() => { window.print(); box.classList.add('hidden'); }, 450);
}
