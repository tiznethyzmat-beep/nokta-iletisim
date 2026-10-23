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
    if (!USE_FIREBASE) return ID_PREFIX + (Math.max(FIRST_ID_NUMBER, ...ticketsCache.map(t => idNumber(t.id))) + 1);
    const ref = fbDb.collection('meta').doc('counter');
    const n = await fbDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const next = (snap.exists ? snap.data().n : FIRST_ID_NUMBER) + 1;
      tx.set(ref, { n: next });
      return next;
    });
    return ID_PREFIX + n;
  },

  // Kaydı ekler veya günceller. prev: düzenlemeden önceki hali (telefon değiştiyse eski kaydı temizlemek için)
  async save(ticket, prev) {
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
    resultBox.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center shadow-xl"><h4 class="font-bold text-slate-800 mb-1">Sorgulama şu an yapılamıyor</h4><p class="text-xs text-slate-500">Lütfen biraz sonra tekrar deneyin veya WhatsApp'tan bize yazın.</p></di
