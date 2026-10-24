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
// Tahmin edilemesin diye servis koduna rastgele ek (ör. TR2026-X101-7Q)
const RANDOM_SUFFIX = false;   // true yaparsanız yeni kodlar TR2026-X101-7Q gibi olur
function randCode() { if (!RANDOM_SUFFIX) return ''; const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 2; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }

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
const ID_PREFIX = 'TR2026-X';        // servis kodu: TR2026-X101, TR2026-X102 ...
const FIRST_ID_NUMBER = 100;          // ilk kayıt 101 olur

// Onarım durumları (4 adım)
const statusMap = {
  kayit:  { label: '1. Kayıt Alındı',  color: 'bg-sky-100 text-sky-800 border-sky-300' },
  tespit: { label: '2. Arıza Tespiti', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  tamir:  { label: '3. Tamirde',       color: 'bg-amber-100 text-amber-800 border-amber-300' },
  hazir:  { label: '4. Teslime Hazır', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
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

// Panel kodunun senkron kullandığı güncel liste
function getTickets() { return ticketsCache; }

function idNumber(id) { return parseInt(String(id).split('-X')[1], 10) || 0; }

function localLoad() {
  try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(d) ? d : []; }
  catch (e) { return []; }
}
function localPersist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(ticketsCache)); }

const DB = {
  get mode() { return USE_FIREBASE ? 'firebase' : 'local'; },

  // Açılışta bir kez çağrılır
  init() {
    if (USE_FIREBASE) {
      try {
        firebase.initializeApp(FIREBASE_CONFIG);
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
      closeModal('modal-login');
    } else {
      if (stopListening) { stopListening(); stopListening = null; }
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
    const q = String(raw).trim().toUpperCase();
    const d = digits(q);
    const isPhone = d.length >= 10 && !/[A-Z]/.test(q);

    if (!USE_FIREBASE) {
      return ticketsCache.filter(t => t.id.toUpperCase() === q || (isPhone && phoneKey(t.phone) === d.slice(-10))).map(toPublic);
    }
    if (q.includes('/')) return [];
    if (isPhone) {
      const snap = await fbDb.collection('lookup').doc(d.slice(-10)).get();
      const codes = snap.exists ? (snap.data().codes || []) : [];
      const docs = await Promise.all(codes.map(c => fbDb.collection('public').doc(c).get()));
      return docs.filter(x => x.exists).map(x => x.data()).sort((a, b) => idNumber(b.id) - idNumber(a.id));
    }
    const snap = await fbDb.collection('public').doc(q).get();
    return snap.exists ? [snap.data()] : [];
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
  const kod = new URLSearchParams(location.search).get('kod');
  if (kod && document.getElementById('search-input')) { document.getElementById('search-input').value = kod; setTimeout(performSearch, 700); }
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (new URLSearchParams(location.search).get('giris') && document.getElementById('modal-login')) checkAdminAccess();
  if (isAdminLoggedIn) renderAdminTable();
};

// Esc tuşu açık pencereleri kapatır
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['modal-login','modal-new-ticket','modal-edit-ticket','modal-created'].forEach(closeModal); });

const PAGE = document.body.dataset.page;
const PAGE_URLS = {sorgula:'index.html',randevu:'servis-talebi.html',iletisim:'iletisim.html',sss:'sik-sorulanlar.html',admin:'panel.html'};

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

async function performSearch() {
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
        <p class="text-xs text-slate-500">"<strong>${esc(query)}</strong>" sorgusuna ait aktif bir tamir kaydı bulunamadı.</p>
      </div>`;
    return;
  }

  resultBox.innerHTML = (matches.length > 1
    ? `<p class="text-sm font-semibold text-slate-600 mb-3 text-center">Bu numaraya ait ${matches.length} kayıt bulundu (en yenisi üstte):</p>` : '')
    + matches.map(ticketCardHtml).join('<div class="h-5"></div>');
}

function ticketCardHtml(match) {
  const stInfo = statusMap[match.status] || statusMap.kayit;

  // Adım seviyeleri (1-4)
  const stepLevels = { kayit: 1, tespit: 2, tamir: 3, hazir: 4 };
  const currentStep = stepLevels[match.status] || 1;
  const progressPercent = ((currentStep - 1) / 3) * 100;

  // Mavi renkli, onay işaretli (✓) adım göstergesi
  const checkActive = "bg-sky-500 text-white shadow-md shadow-sky-500/40 border border-sky-400";
  const textActive = "text-sky-600 font-bold";

  return `
    <div class="glass-card rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">

      <!-- Servis kodu ve durum etiketi -->
      <div class="flex flex-wrap justify-between items-center border-b border-slate-200 pb-4 gap-2">
        <div>
          <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">SERVİS FİŞ KODU</span>
          <h3 class="text-2xl font-black text-sky-700 tracking-wide">${esc(match.id)}</h3>
          <p class="text-[11px] text-slate-400 font-medium"><i class="fa-regular fa-clock mr-1"></i> Kabul Tarihi: ${esc(match.date || 'Bugün')}</p>
        </div>
        <span class="px-4 py-1.5 rounded-full text-xs font-extrabold border ${stInfo.color} flex items-center gap-1.5 shadow-sm whitespace-nowrap">
          <span class="w-2 h-2 rounded-full bg-current"></span> ${stInfo.label}
        </span>
      </div>

      <!-- Durum adımları -->
      <div class="py-4 px-1">${stepperHtml(currentStep)}</div>

      <!-- Müşteri & Cihaz Detay Kutusu -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/80 p-5 rounded-xl border border-slate-200/80">
        <div>
          <span class="text-slate-500 font-semibold block">Müşteri:</span>
          <strong class="text-slate-900 text-sm">${esc(match.nameMasked || maskName(match.name))}</strong>
        </div>
        <div>
          <span class="text-slate-500 font-semibold block">Cihaz / Model:</span>
          <strong class="text-slate-900 text-sm">${esc(match.device)}</strong>
        </div>
        <div>
          <span class="text-slate-500 font-semibold block">Üzerinde Gelenler:</span>
          <span class="text-amber-800 font-semibold">${esc(match.gelenler || 'Teslim alınan aksesuar yok')}</span>
        </div>
        <div>
          <span class="text-slate-500 font-semibold block">Tahmini Onarım Ücreti:</span>
          <strong class="text-emerald-600 text-sm">${match.price ? match.price + ' TL' : 'Belirtilmedi'}</strong>
        </div>
        <div class="sm:col-span-2 pt-2 border-t border-slate-200">
          <span class="text-slate-700 font-bold block">Arıza / Müşteri Şikayeti:</span>
          <p class="text-slate-950 mt-1 text-lg sm:text-xl font-extrabold uppercase tracking-wide leading-snug">${esc(match.problem)}</p>
        </div>
      </div>

      <!-- TEKNİKER GÜNCELLEME NOTU KUTUSU -->
      <div class="bg-sky-50 border-2 border-sky-400 p-4 rounded-xl flex items-start gap-3 shadow-md">
        <div class="p-2 bg-sky-100 text-sky-700 rounded-lg shrink-0">
          <i class="fa-solid fa-user-gear text-base"></i>
        </div>
        <div>
          <h5 class="font-extrabold text-sky-900 text-sm uppercase tracking-wider">TEKNİKER GÜNCELLEME NOTU:</h5>
          <p class="text-slate-950 text-lg sm:text-xl mt-1.5 font-extrabold leading-snug">${esc(match.note || 'Henüz ek bir not girilmedi.')}</p>
        </div>
      </div>

      ${match.status === 'hazir'
        ? `<div class="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl text-xs font-medium leading-relaxed"><i class="fa-solid fa-store mr-1"></i> <strong>Cihazınız hazır!</strong> Mağazamıza gelip servis fişinizle teslim alabilirsiniz (kapanış 20:00). Adrese gönderim yapılmamaktadır.</div>`
        : `<div class="bg-slate-50 border border-slate-200 text-slate-600 p-3 rounded-xl text-[11px] leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i> Cihaz hazır olunca mağazadan kendiniz teslim alırsınız; kargo/adrese teslim yoktur.</div>`}

      <!-- WhatsApp Butonu -->
      <div class="pt-2">
        <a href="https://wa.me/${OFFICIAL_WA}?text=Merhaba,%20${esc(match.id)}%20kodlu%20cihazim%20hakkinda%20bilgi%20almak%20istiyorum." target="_blank" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md">
          <i class="fa-brands fa-whatsapp text-base"></i> WhatsApp'tan Bilgi Al (+90 542 288 82 88)
        </a>
      </div>

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

async function handleAdminLogin(e) {
  e.preventDefault();
  const form = e.target;
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true);
  try {
    if (!USE_FIREBASE) throw Object.assign(new Error('no-firebase'), { code: 'app/no-firebase' });
    await fbAuth.signInWithEmailAndPassword(u, p);
    form.reset();
    document.getElementById('login-error').classList.add('hidden');
    closeModal('modal-login');
    switchTab('admin');
    renderAdminTable();
  } catch (err) {
    const c = document.getElementById('login-card'), er = document.getElementById('login-error');
    document.getElementById('login-error-text').textContent = loginErrorText(err);
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
  if (USE_FIREBASE) await fbAuth.signOut();   // onAuthChanged paneli temizler
  else { isAdminLoggedIn = false; resetAdminUi(); }
  switchTab('sorgula');
  alert('Tekniker panelinden çıkış yapıldı.');
}

// ======================================================================
// 7. TEKNİKER PANELİ: ÖZET VE TABLO
// ======================================================================

function setFilter(v) { document.getElementById('admin-status-filter').value = v; renderAdminTable(); }

// Özet kartları: toplam, tamirde, hazır, gelir, gider, net kâr
let statsPeriod = 'bugun'; // bugun | ay | yil | hepsi | secay | secyil
let statsMonth = '';       // 'YYYY-MM'
let statsYear = 0;

// "22.10.2026 - 13:00" -> {d, m, y}
function parseTrDate(str) {
  const m = String(str || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? { d: +m[1], m: +m[2], y: +m[3] } : null;
}

function setStatsPeriod(v) { statsPeriod = v; renderAdminTable(); }
function setStatsMonth(v) { if (!v) return; statsMonth = v; statsPeriod = 'secay'; renderAdminTable(); }
function setStatsYear(v) { if (!v) return; statsYear = +v; statsPeriod = 'secyil'; renderAdminTable(); }

function inStatsPeriod(dateStr) {
  if (statsPeriod === 'hepsi') return true;
  const now = new Date(), d = parseTrDate(dateStr);
  if (!d) return false;
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
  const labels = { bugun: 'Bugün', ay: 'Bu ay', yil: 'Bu yıl', hepsi: 'Hepsi' };
  bar.innerHTML = Object.keys(labels).map(k =>
    `<button type="button" onclick="setStatsPeriod('${k}')" class="chip ${statsPeriod === k ? 'chip-on' : ''}">${labels[k]}</button>`
  ).join('')
  + `<select onchange="setStatsYear(this.value)" class="chip ${statsPeriod === 'secyil' ? 'chip-on' : ''}"><option value="">Yıl seç</option>${yearList.map(y => `<option value="${y}" ${statsPeriod === 'secyil' && statsYear === y ? 'selected' : ''}>${y}</option>`).join('')}</select>`
  + `<input type="month" value="${statsMonth}" onchange="setStatsMonth(this.value)" title="Geçmiş ay seç" class="chip ${statsPeriod === 'secay' ? 'chip-on' : ''}">`
  + `<span class="text-[11px] text-slate-500 font-medium">Kayıt tarihine göre</span>`;

  const tickets = allTickets.filter(t => inStatsPeriod(t.date));

  const total = tickets.length;
  const tamirde = tickets.filter(t => t.status === 'tamir').length;
  const hazir = tickets.filter(t => t.status === 'hazir').length;

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
    <div class="stat stat-cihaz"><div class="stat-ico"><i class="fa-solid fa-mobile-screen"></i></div><div class="stat-lbl">Toplam Cihaz</div><div class="stat-val">${total}</div></div>
    <div class="stat stat-tamir"><div class="stat-ico"><i class="fa-solid fa-screwdriver-wrench"></i></div><div class="stat-lbl">Tamirde</div><div class="stat-val">${tamirde}</div></div>
    <div class="stat stat-hazir"><div class="stat-ico"><i class="fa-solid fa-circle-check"></i></div><div class="stat-lbl">Teslime Hazır</div><div class="stat-val">${hazir}</div></div>
  `;
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
  renderOverdue(tickets);
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

  if (statusFilter !== 'all') {
    tickets = tickets.filter(t => t.status === statusFilter);
  }

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="py-12 text-center"><div class="w-full text-center">${totalCount === 0
      ? '<i class="fa-solid fa-inbox text-3xl text-slate-300 mb-3 block"></i><p class="text-sm text-slate-500 mb-4">Henüz servis kaydı yok.</p><button onclick="openNewRecordModal()" class="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"><i class="fa-solid fa-plus-circle mr-1"></i> İlk servis kaydını ekle</button>'
      : '<p class="text-xs text-slate-400">Arama kriterlerinize uygun kayıt bulunamadı.</p>'}</div></td></tr>`;
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
        <td data-label="Servis Kod" class="py-3.5 px-4 font-black text-sky-700 font-mono whitespace-nowrap"><div class="cv">${esc(t.id)}${daysReady(t) >= 30 ? ' <span class="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5 font-sans">' + daysReady(t) + ' gün alınmadı</span>' : ''}</div></td>
        <td data-label="Kayıt Tarihi" class="py-3.5 px-4 text-xs font-semibold text-slate-600 whitespace-nowrap"><div class="cv"><i class="fa-regular fa-clock text-sky-600 mr-1"></i>${esc(t.date || '22.10.2026 - 13:00')}</div></td>
        <td data-label="Müşteri / Tel" class="py-3.5 px-4 whitespace-nowrap"><div class="cv"><span class="font-bold text-slate-800">${esc(t.name)}</span>${(phoneCount[digits(t.phone).slice(-10)] || 1) > 1 ? ` <span class="text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5" title="Aynı numaradan toplam kayıt">Eski müşteri · ${phoneCount[digits(t.phone).slice(-10)]}</span>` : ''}<br><small class="text-slate-400">${esc(t.phone)}</small></div></td>
        <td data-label="Cihaz / Seri No" class="py-3.5 px-4 whitespace-nowrap"><div class="cv"><span class="text-slate-700 font-medium">${esc(t.device)}</span><br><small class="text-slate-400">SN: ${esc(t.serino || '-')}</small></div></td>
        <td data-label="Cihaz & SIM Kodu" class="py-3.5 px-4 text-xs font-mono whitespace-nowrap"><div class="cv">
          <span class="text-slate-700">Ekran: <b>${esc(t.lockcode || '-')}</b></span><br>
          <span class="text-slate-500">SIM PIN: <b>${esc(t.simpin || '-')}</b></span>
        </div></td>
        <td data-label="Üzerinde Gelenler" class="py-3.5 px-4 text-xs font-medium text-amber-800 whitespace-nowrap"><div class="cv">${esc(t.gelenler || 'Yok')}</div></td>
        <td data-label="Arıza / Beyan" class="py-3.5 px-4 text-slate-700 text-xs max-w-xs truncate"><div class="cv">${esc(t.problem)}</div></td>
        <td data-label="Ücret / Maliyet" class="py-3.5 px-4 text-xs font-semibold whitespace-nowrap"><div class="cv">
          <span class="text-emerald-600">+${gelirVal} TL</span> / <span class="text-red-500">-${giderVal} TL</span><br>
          <small class="text-sky-700 font-bold">Kâr: ${karVal} TL</small>
        </div></td>
        <td data-label="Durum" class="py-3.5 px-4 whitespace-nowrap"><div class="cv"><span class="px-3 py-1 rounded-full text-xs font-bold border ${st.color} inline-block whitespace-nowrap">${st.label}</span></div></td>
        <td data-label="İşlem" class="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
          <a href="https://wa.me/${waPhone}?text=${encodeURIComponent(notifyMsg)}" target="_blank" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 p-2 rounded-lg text-xs transition-all border border-emerald-200 inline-block" title="Müşteriye WhatsApp Gönder">
            <i class="fa-brands fa-whatsapp text-sm"></i><span class="act-label">WhatsApp</span>
          </a>
          <button onclick="copyReadyMessage('${esc(t.id)}', this)" class="bg-slate-100 hover:bg-sky-100 text-sky-700 p-2 rounded-lg text-xs border border-slate-200" title="Hazır mesajı kopyala"><i class="fa-regular fa-copy"></i><span class="act-label">Kopyala</span></button>
          <button onclick="printReceipt('${esc(t.id)}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg text-xs border border-slate-200" title="Servis fişi yazdır"><i class="fa-solid fa-print"></i><span class="act-label">Fiş</span></button>
          <button onclick="openEditModal('${esc(t.id)}')" class="bg-slate-100 hover:bg-sky-100 text-sky-700 p-2 rounded-lg text-xs transition-all border border-slate-200"><i class="fa-solid fa-pen"></i> Düzenle</button>
          <button onclick="deleteTicket('${esc(t.id)}')" class="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg text-xs transition-all border border-red-200"><i class="fa-solid fa-trash"></i> Sil</button>
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
    const ticket = {
      id: await DB.nextId(),
      ts: now.getTime(),
      date: now.toLocaleDateString('tr-TR') + ' - ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
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
    if (window.QRCode) new QRCode(document.getElementById('receipt-qr'), { text: SITE_URL + '/?kod=' + encodeURIComponent(t.id), width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
  } catch (e) {}
  setTimeout(() => { window.print(); box.classList.add('hidden'); }, 450);
}
