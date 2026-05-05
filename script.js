/* ====================================================================
   BIOIMUN – MAIN SCRIPT (MERGED)
   Menggabungkan: sync.js (sinkronisasi Google Sheets) + script.js (logika utama)
   ==================================================================== */

'use strict';

/* ================================================================
   BIOIMUN MODUL — SYNC.JS
   Lapisan sinkronisasi antara website dan Google Sheets
   ================================================================
   CARA PAKAI:
   1. Jalankan Google Apps Script (lihat google-apps-script.gs)
   2. Tempel URL deployment di variabel SHEET_URL di bawah
   3. Tambahkan <script src="sync.js"></script> di dashboard.html
      SEBELUM <script src="script.js"></script>
   ================================================================ */

/* ───────────────────────────────────────────────────────────────
   ⚙️  KONFIGURASI — WAJIB DIISI SETELAH DEPLOY APPS SCRIPT
   ─────────────────────────────────────────────────────────────── */
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzBOHUUtlBo1YOgc673eM_QExj67Op43dBjX_UNRxaHJkTqZ-HOnZ0E3b8dxLm72TH6/exec';
// Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'

/* ───────────────────────────────────────────────────────────────
   🔧  CORE SEND FUNCTION
   Mengirim data ke Google Apps Script via fetch (no-cors)
   ─────────────────────────────────────────────────────────────── */
async function sendToSheet(action, payload) {
  if (!SHEET_URL || SHEET_URL === '' || SHEET_URL === 'BELUM_DIKONFIGURASI') {
    console.warn('[BioImun Sync] SHEET_URL belum dikonfigurasi.');
    return;
  }
  try {
    const body = JSON.stringify({ action, ...payload });
    // Gunakan no-cors karena Apps Script tidak support CORS penuh
    await fetch(SHEET_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain' }, // text/plain agar no-cors lolos
      body,
    });
    console.log('[BioImun Sync] ✅ Terkirim:', action);
  } catch (err) {
    console.warn('[BioImun Sync] ⚠️ Gagal kirim:', action, err.message);
    // Simpan ke antrean lokal agar bisa dikirim ulang
    queueFailedSync(action, payload);
  }
}

/* ───────────────────────────────────────────────────────────────
   📦  ANTREAN OFFLINE
   Jika tidak ada internet, simpan dulu lalu kirim saat online
   ─────────────────────────────────────────────────────────────── */
function queueFailedSync(action, payload) {
  try {
    const key   = 'bioimun_sync_queue';
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    queue.push({ action, payload, ts: Date.now() });
    // Simpan maks 50 item antrean
    if (queue.length > 50) queue.splice(0, queue.length - 50);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {}
}

async function flushSyncQueue() {
  try {
    const key   = 'bioimun_sync_queue';
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await fetch(SHEET_URL, {
          method : 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body   : JSON.stringify({ action: item.action, ...item.payload }),
        });
        console.log('[BioImun Sync] 🔄 Antrean terkirim:', item.action);
      } catch (e) {
        remaining.push(item);
      }
    }
    localStorage.setItem(key, JSON.stringify(remaining));
    if (remaining.length === 0) console.log('[BioImun Sync] ✅ Semua antrean berhasil dikirim!');
  } catch (e) {}
}

// Kirim antrean saat koneksi kembali
window.addEventListener('online', () => {
  console.log('[BioImun Sync] 🌐 Koneksi kembali, mengirim antrean...');
  flushSyncQueue();
});

/* ───────────────────────────────────────────────────────────────
   👤  HELPER: ambil data user aktif
   ─────────────────────────────────────────────────────────────── */
function getSyncUser() {
  try {
    const u = JSON.parse(sessionStorage.getItem('bioimun_user') || '{}');
    return {
      username: u.username || 'unknown',
      nama    : u.name     || 'Unknown',
      role    : u.role     || 'siswa',
      kelas   : u.kelas    || '—',
    };
  } catch (e) {
    return { username:'unknown', nama:'Unknown', role:'siswa', kelas:'—' };
  }
}

/* ═══════════════════════════════════════════════════════════════
   📤  FUNGSI SYNC PER AKTIVITAS
   Setiap fungsi dipanggil otomatis dari titik-titik di script.js
   ═══════════════════════════════════════════════════════════════ */

/* ── 1. LOGIN ───────────────────────────────────────────────────
   Dipanggil: saat pengguna berhasil login (dari login.html)        */
function syncLogin(user) {
  sendToSheet('login', {
    username: user.username,
    nama    : user.name,
    role    : user.role,
    kelas   : user.kelas || '—',
  });
}

/* ── 2. PROGRESS BELAJAR ────────────────────────────────────────
   Dipanggil: setiap saveProgress() — setelah baca materi / kuis  */
function syncProgress(progressData) {
  const u = getSyncUser();
  sendToSheet('progress', {
    username: u.username,
    nama    : u.nama,
    progress: progressData,
  });
}

/* ── 3. HASIL KUIS ──────────────────────────────────────────────
   Dipanggil: setelah siswa submit kuis materi                     */
function syncKuis(materiIdx, skor, lulus) {
  const u = getSyncUser();
  sendToSheet('kuis', {
    username : u.username,
    nama     : u.nama,
    materiIdx,
    skor,
    lulus,
  });
}

/* ── 4. HASIL DRILL ─────────────────────────────────────────────
   Dipanggil: setelah drill selesai (showDrillResult)              */
function syncDrill(jumlahSoal, skor) {
  const u = getSyncUser();
  sendToSheet('drill', {
    username   : u.username,
    nama       : u.nama,
    jumlahSoal,
    skor,
  });
}

/* ── 5. PROGRESS LKPD ──────────────────────────────────────────
   Dipanggil: setiap tahap LKPD diselesaikan                      */
function syncLKPD(kelompok, tahap) {
  const u = getSyncUser();
  sendToSheet('lkpd', {
    username: u.username,
    nama    : u.nama,
    kelompok,
    tahap,
  });
}

/* ── 6. PRE-TEST ────────────────────────────────────────────────
   Dipanggil: saat siswa submit pre-test                           */
function syncPretest(jawaban) {
  const u = getSyncUser();
  sendToSheet('pretest', {
    username: u.username,
    nama    : u.nama,
    jawaban,                       // array 5 string
  });
}

/* ── 7. POST-TEST ───────────────────────────────────────────────
   Dipanggil: saat siswa submit post-test                          */
function syncPosttest(jawaban) {
  const u = getSyncUser();
  sendToSheet('posttest', {
    username: u.username,
    nama    : u.nama,
    jawaban,
  });
}

/* ── 8. ANGKET OWNERSHIP ────────────────────────────────────────
   Dipanggil: saat siswa submit angket                             */
function syncAngket(answers) {
  const u = getSyncUser();
  sendToSheet('angket', {
    username: u.username,
    nama    : u.nama,
    answers,                       // array 15 nilai (1-5)
  });
}

/* ── 9. ESAI REFLEKTIF ──────────────────────────────────────────
   Dipanggil: saat siswa submit esai reflektif                     */
function syncReflektif(esai) {
  const u = getSyncUser();
  sendToSheet('reflektif', {
    username: u.username,
    nama    : u.nama,
    esai,                          // array 5 string
  });
}

/* ═══════════════════════════════════════════════════════════════
   🪝  MONKEY-PATCH — menyisipkan sync ke fungsi script.js
   Dilakukan SETELAH script.js dimuat (via defer / DOMContentLoaded)
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* Kirim antrean offline yang tertunda */
  flushSyncQueue();

  /* ── PATCH saveProgress ─────────────────────────────────────── */
  const _origSaveProgress = window.saveProgress;
  window.saveProgress = function () {
    _origSaveProgress?.();
    // Throttle: tidak kirim lebih dari sekali per 10 detik
    clearTimeout(window._syncProgressTimer);
    window._syncProgressTimer = setTimeout(() => {
      if (window.progress) syncProgress(window.progress);
    }, 10000);
  };

  /* ── PATCH submitKuis ───────────────────────────────────────── */
  const _origSubmitKuis = window.submitKuis;
  window.submitKuis = function () {
    _origSubmitKuis?.();
    // Baca hasil dari progress yang baru disimpan
    const idx    = window.currentMateri ?? 0;
    const skor   = window.progress?.kuisScore?.[idx] ?? 0;
    const lulus  = window.progress?.kuisPassed?.[idx] ?? false;
    syncKuis(idx, skor, lulus);
  };

  /* ── PATCH showDrillResult ──────────────────────────────────── */
  const _origShowDrillResult = window.showDrillResult;
  window.showDrillResult = function () {
    _origShowDrillResult?.();
    const num  = window.drillNum ?? 5;
    const ans  = window.drillAnswers ?? [];
    const qs   = window.drillQuestions ?? [];
    let   skor = 0;
    qs.forEach((q, i) => { if (ans[i] === q.ans) skor++; });
    syncDrill(num, skor);
  };

  /* ── PATCH submitPBLDetail (LKPD per kelompok) ─────────────── */
  const _origSubmitPBLDetail = window.submitPBLDetail;
  window.submitPBLDetail = function (idx, textareaId) {
    _origSubmitPBLDetail?.(idx, textareaId);
    const grp = window.currentLKPDGroup ?? 1;
    syncLKPD(grp, idx);
  };

  /* ── PATCH submitTest (pretest / posttest / reflektif) ─────── */
  const _origSubmitTest = window.submitTest;
  window.submitTest = function (type) {
    _origSubmitTest?.(type);
    const idMap = {
      pretest  : ['pre-q1','pre-q2','pre-q3','pre-q4','pre-q5'],
      posttest : ['post-q1','post-q2','post-q3','post-q4','post-q5'],
      reflektif: ['ref-q1','ref-q2','ref-q3','ref-q4','ref-q5'],
    };
    const ids     = idMap[type] || [];
    const jawaban = ids.map(id => document.getElementById(id)?.value || '');

    if (type === 'pretest')   syncPretest(jawaban);
    if (type === 'posttest')  syncPosttest(jawaban);
    if (type === 'reflektif') syncReflektif(jawaban);
  };

  /* ── PATCH submitAngket ─────────────────────────────────────── */
  const _origSubmitAngket = window.submitAngket;
  window.submitAngket = function () {
    _origSubmitAngket?.();
    const answers = [];
    for (let i = 0; i < 15; i++) {
      const sel = document.querySelector(`input[name="angket-${i}"]:checked`);
      answers.push(sel ? parseInt(sel.value) : 0);
    }
    syncAngket(answers);
  };

  console.log('[BioImun Sync] ✅ Semua patch aktif. Siap sinkronisasi ke Google Sheets.');
});


/* ====================================================================
   LOGIKA UTAMA – NAVIGASI, PROGRESS, MATERI, KUIS, DRILL
   ==================================================================== */

/* ====================================================================
   BIOIMUN MODUL – SCRIPT.JS
   Semua logika sistem: navigasi, progress, materi, kuis, LKPD, drill
   ==================================================================== */


/* ========================= STATE ========================= */
let currentUser   = null;
let currentMateri = 0;
let currentPBL    = 0;
let drillNum      = 5;
let drillIdx      = 0;
let drillQuestions = [];
let drillAnswers   = [];
let kuisAnswers    = [];
let sidebarCollapsed = false;

// Progress: materi[i] = true jika selesai dibaca, kuisPassed[i] = true jika skor >=2/3
let progress = {
  materi:     [false, false, false, false, false], // dibaca?
  kuisPassed: [false, false, false, false, false], // lulus kuis?
  kuisScore:  [null, null, null, null, null],
  lkpd:       [false, false, false, false, false], // submit setiap tahap
  drillBest:  null,
  xp: 0,
};

const MIN_KUIS_SCORE = 2; // dari 3 soal

/* ========================= INIT ========================= */
document.addEventListener('DOMContentLoaded', () => {
  // Cek login
  const raw = sessionStorage.getItem('bioimun_user');
  if (!raw) { window.location.href = 'login.html'; return; }
  currentUser = JSON.parse(raw);

  // Muat progress dari localStorage per user
  loadProgress();
  renderUser();
  updateGlobalProgress();
  updateSidebarLocks();
  renderBadges();
  navigateTo('dashboard');
  initGlosarium();
  initRujukan();
  initSubmateriCards();
});

/* ========================= USER ========================= */
function renderUser() {
  const el = (id) => document.getElementById(id);
  const fn = currentUser.name.split(' ')[0];
  if (el('side-avatar'))  el('side-avatar').textContent  = currentUser.name[0];
  if (el('side-name'))    el('side-name').textContent    = currentUser.name;
  if (el('side-role'))    el('side-role').textContent    = currentUser.role === 'guru' ? 'Guru Biologi' : 'Pelajar · ' + currentUser.kelas;
  if (el('hero-name'))    el('hero-name').textContent    = fn;
  if (el('topbar-user'))  el('topbar-user').textContent  = fn;
}

/* ========================= PROGRESS ========================= */
function loadProgress() {
  try {
    const key = 'bioimun_prog_' + currentUser.username;
    const d   = localStorage.getItem(key);
    if (d) {
      const p = JSON.parse(d);
      Object.assign(progress, p);
    }
  } catch(e) {}
}

function saveProgress() {
  try {
    const key = 'bioimun_prog_' + currentUser.username;
    localStorage.setItem(key, JSON.stringify(progress));
  } catch(e) {}
  // ── SYNC ke Google Sheets (throttle 10 detik) ──
  clearTimeout(window._syncProgressTimer);
  window._syncProgressTimer = setTimeout(() => {
    if (typeof syncProgress === 'function') syncProgress(progress);
  }, 10000);
}

function materiUnlocked(idx) {
  if (idx === 0) return true;
  return progress.kuisPassed[idx - 1] === true;
}

function lkpdUnlocked(idx) {
  if (idx === 0) return true;
  return progress.lkpd[idx - 1] === true;
}

function updateGlobalProgress() {
  const done  = progress.kuisPassed.filter(Boolean).length;
  const pct   = Math.round((done / 5) * 100);
  const fill  = document.getElementById('prog-mini');
  const label = document.getElementById('prog-pct');
  if (fill)  fill.style.width   = pct + '%';
  if (label) label.textContent  = pct + '%';

  // Stat cards
  const matDone  = progress.materi.filter(Boolean).length;
  const el = document.getElementById('stat-materi-done');
  if (el) el.textContent = matDone;

  // XP
  progress.xp = done * 20 + (progress.drillBest ? Math.round(progress.drillBest * 5) : 0);
  const xpEl = document.getElementById('xp-val');
  if (xpEl) xpEl.textContent = progress.xp + ' XP';
  const xpFill = document.getElementById('xp-fill');
  if (xpFill) xpFill.style.width = Math.min(100, progress.xp) + '%';

  // Last score
  const scores = progress.kuisScore.filter(v => v !== null);
  const lsEl   = document.getElementById('last-score');
  if (lsEl) lsEl.textContent = scores.length ? scores[scores.length-1] + '/3' : '-';

  // Progress tracks
  for (let i = 0; i < 5; i++) {
    const tf = document.getElementById('prog-track-' + i);
    if (tf) {
      const v = progress.kuisPassed[i] ? 100 : (progress.materi[i] ? 50 : 0);
      tf.style.width = v + '%';
    }
  }
}

function updateSidebarLocks() {
  // Ruang belajar cards
  for (let i = 0; i < 5; i++) {
    const card = document.getElementById('sm-card-' + i);
    if (!card) continue;
    const unlocked = materiUnlocked(i);
    card.classList.toggle('locked', !unlocked);
    const statusEl = card.querySelector('.materi-status');
    const lockOvEl = card.querySelector('.lock-overlay');
    if (statusEl) {
      if (progress.kuisPassed[i]) {
        statusEl.className = 'materi-status done';
        statusEl.innerHTML = '✅ Selesai';
      } else if (unlocked) {
        statusEl.className = 'materi-status open';
        statusEl.innerHTML = '📖 Tersedia';
      } else {
        statusEl.className = 'materi-status locked';
        statusEl.innerHTML = '🔒 Terkunci';
      }
    }
    if (lockOvEl) lockOvEl.style.display = unlocked ? 'none' : 'flex';
    const progFill = document.getElementById('prog-' + i);
    if (progFill) {
      const v = progress.kuisPassed[i] ? 100 : (progress.materi[i] ? 50 : 0);
      progFill.style.width = v + '%';
    }
  }

  // PBL sidebar tabs
  for (let i = 0; i < 5; i++) {
    const tab = document.querySelector(`.pbl-stage-tab[data-stage="${i}"]`);
    if (!tab) continue;
    const unlocked = lkpdUnlocked(i);
    tab.classList.toggle('pbl-locked', !unlocked);
    const badgeEl = tab.querySelector('.pbl-stage-badge');
    if (badgeEl) {
      if (progress.lkpd[i]) {
        badgeEl.style.background = '#dcfce7';
        badgeEl.style.color      = '#15803d';
        badgeEl.textContent      = '✅';
        tab.classList.add('pbl-done');
      } else if (!unlocked) {
        badgeEl.style.background = '#f1f5f9';
        badgeEl.style.color      = '#94a3b8';
        badgeEl.textContent      = '🔒';
      } else {
        badgeEl.style.background = '#dbeafe';
        badgeEl.style.color      = '#1d4ed8';
        badgeEl.textContent      = '📝';
      }
    }
  }
}

function renderBadges() {
  const container = document.getElementById('badge-container');
  if (!container) return;
  const badges = [
    { id:0, icon:'🌟', name:'Pemula',    cond: progress.materi.filter(Boolean).length >= 1 },
    { id:1, icon:'📚', name:'Pelajar',   cond: progress.materi.filter(Boolean).length >= 3 },
    { id:2, icon:'🏆', name:'Juara',     cond: progress.kuisPassed.every(Boolean) },
    { id:3, icon:'🔬', name:'Ilmuwan',   cond: progress.drillBest !== null },
    { id:4, icon:'🎓', name:'Sarjana',   cond: progress.lkpd.every(Boolean) },
  ];
  container.innerHTML = badges.map(b => `
    <div class="gbadge ${b.cond ? 'earned' : 'locked-b'}" title="${b.name}">
      <div class="gb-icon">${b.icon}</div>
      <div class="gb-name">${b.name}</div>
    </div>`).join('');
}

/* ========================= SIDEBAR ========================= */
function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const mc  = document.querySelector('.main-content');
  if (window.innerWidth <= 768) {
    sb.classList.toggle('mobile-open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
  } else {
    sidebarCollapsed = !sidebarCollapsed;
    sb.classList.toggle('collapsed', sidebarCollapsed);
    mc.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  }
}

function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

/* ========================= NAVIGATION ========================= */
const PAGE_MAP = {
  dashboard:'sp-dashboard', kompetensi:'sp-kompetensi',
  ruangbelajar:'sp-ruangbelajar', lkpd:'sp-lkpd',
  drill:'sp-drill', glosarium:'sp-glosarium',
  rujukan:'sp-rujukan', identitas:'sp-identitas', materi:'sp-materi'
};
const TITLES = {
  dashboard:'🏠 Beranda', kompetensi:'🎯 Kompetensi', ruangbelajar:'📚 Ruang Belajar',
  lkpd:'📋 LKPD – <em>Problem-Based Learning</em>', drill:'✏️ Drill Soal',
  glosarium:'📖 Glosarium', rujukan:'📚 Daftar Rujukan', identitas:'👤 Identitas Pengembang',
  materi:'📄 Materi'
};
const NAV_ORDER = ['dashboard','kompetensi','ruangbelajar','lkpd','drill','glosarium','rujukan','identitas'];

function navigateTo(pg) {
  document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const spId = PAGE_MAP[pg];
  if (spId) document.getElementById(spId)?.classList.add('active');
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = TITLES[pg] || pg;
  const idx = NAV_ORDER.indexOf(pg);
  const items = document.querySelectorAll('.nav-item');
  if (idx >= 0 && items[idx]) items[idx].classList.add('active');
  if (pg === 'lkpd') openPBL(0);
  if (pg === 'glosarium') initGlosarium();
  if (pg === 'rujukan') initRujukan();
  window.scrollTo(0, 0);
  closeSidebarMobile();
}

function doLogout() {
  sessionStorage.removeItem('bioimun_user');
  window.location.href = 'login.html';
}

/* ========================= KOMPETENSI ACCORDION ========================= */
function toggleAccord(el) {
  const body = el.nextElementSibling;
  const isOpen = body.classList.contains('open');
  document.querySelectorAll('.kp-accord-body').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.kp-accord-head').forEach(h => h.classList.remove('open'));
  if (!isOpen) {
    body.classList.add('open');
    el.classList.add('open');
  }
}

/* ========================= MATERI DATA ========================= */
const MATERI = [
  {
    title: 'Sistem Pertahanan Tubuh',
    emoji: '🛡️',
    content: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-size:1.6rem;">🛡️</span>
        <div>
          <h2 style="margin:0;font-size:1.15rem;color:var(--primary-dark);">Sistem Pertahanan Tubuh Manusia</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <span style="font-size:.78rem;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-weight:600;"><i class="fas fa-book"></i> Biologi Fase F</span>
            <span style="font-size:.78rem;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-weight:600;"><i class="fas fa-book-open"></i> Flipbook Interaktif</span>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#f0fdf4,#eff6ff);border:1px solid #bbf7d0;border-radius:14px;padding:12px 16px;margin-bottom:14px;font-size:.84rem;color:#166534;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.2rem;flex-shrink:0;">💡</span>
        <span>Baca seluruh flipbook di bawah ini. Gunakan tombol navigasi halaman untuk berpindah halaman. Setelah selesai membaca, kerjakan kuis di bawah untuk membuka materi berikutnya.</span>
      </div>
      <div style="position:relative;width:100%;padding-bottom:62%;height:0;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#1a1a2e;">
        <iframe
          src="https://heyzine.com/flip-book/e5f9aa37bc.html"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"
          allowfullscreen
          loading="lazy"
          title="BioImun – Sistem Pertahanan Tubuh"
        ></iframe>
      </div>
      <div style="margin-top:10px;text-align:center;">
        <a href="https://heyzine.com/flip-book/e5f9aa37bc.html" target="_blank" rel="noopener"
           style="font-size:.82rem;color:var(--accent);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
          <i class="fas fa-external-link-alt"></i> Buka di tab baru untuk tampilan penuh
        </a>
      </div>`,
    kuis: [
      { q:'Apa fungsi utama sistem pertahanan tubuh?', opts:['Mengangkut oksigen','Melindungi dari patogen','Mencerna makanan','Menghasilkan hormon'], ans:1,
        penj:'Sistem imun berfungsi melindungi tubuh dari serangan patogen (bakteri, virus, jamur, parasit) dan benda asing.' },
      { q:'Sel darah putih yang berperan dalam sistem imun disebut?', opts:['Eritrosit','Trombosit','Leukosit','Hemoglobin'], ans:2,
        penj:'Leukosit (sel darah putih) adalah komponen utama sistem imun yang mencakup neutrofil, limfosit, monosit, dll.' },
      { q:'Organ berikut yang termasuk organ limfoid primer adalah?', opts:['Limpa','Amandel','Timus','Kelenjar getah bening'], ans:2,
        penj:'Timus adalah organ limfoid primer tempat pematangan sel T. Sumsum tulang juga termasuk organ limfoid primer.' }
    ]
  },
  {
    title: 'Pertahanan Tubuh Nonspesifik',
    emoji: '🔰',
    content: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-size:1.6rem;">🔰</span>
        <div>
          <h2 style="margin:0;font-size:1.15rem;color:var(--primary-dark);">Pertahanan Tubuh Nonspesifik</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <span style="font-size:.78rem;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-weight:600;"><i class="fas fa-book"></i> Biologi Fase F</span>
            <span style="font-size:.78rem;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-weight:600;"><i class="fas fa-book-open"></i> Flipbook Interaktif</span>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#f0fdf4,#eff6ff);border:1px solid #bbf7d0;border-radius:14px;padding:12px 16px;margin-bottom:14px;font-size:.84rem;color:#166534;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.2rem;flex-shrink:0;">💡</span>
        <span>Baca seluruh flipbook di bawah ini. Gunakan tombol navigasi halaman untuk berpindah halaman. Setelah selesai membaca, kerjakan kuis di bawah untuk membuka materi berikutnya.</span>
      </div>
      <div style="position:relative;width:100%;padding-bottom:62%;height:0;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#1a1a2e;">
        <iframe
          src="https://heyzine.com/flip-book/ca1f979511.html"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"
          allowfullscreen
          loading="lazy"
          title="BioImun – Pertahanan Tubuh Nonspesifik"
        ></iframe>
      </div>
      <div style="margin-top:10px;text-align:center;">
        <a href="https://heyzine.com/flip-book/ca1f979511.html" target="_blank" rel="noopener"
           style="font-size:.82rem;color:var(--accent);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
          <i class="fas fa-external-link-alt"></i> Buka flipbook di tab baru untuk tampilan penuh
        </a>
      </div>`,
    kuis: [
      { q:'Berikut yang BUKAN komponen pertahanan nonspesifik adalah?', opts:['Fagositosis','Demam','Antibodi spesifik','Interferon'], ans:2,
        penj:'Antibodi spesifik merupakan komponen pertahanan spesifik (adaptif), bukan nonspesifik. Pertahanan nonspesifik tidak mengenal antigen tertentu.' },
      { q:'Proses sel imun menelan dan mencerna patogen disebut?', opts:['Antibodi','Fagositosis','Imunisasi','Vaksinasi'], ans:1,
        penj:'Fagositosis adalah proses sel fagosit (neutrofil, makrofag) menelan dan mencerna partikel asing atau patogen.' },
      { q:'Protein yang diproduksi sel terinfeksi virus untuk menghambat replikasi virus disebut?', opts:['Antibodi','Antigen','Interferon','Limfosit'], ans:2,
        penj:'Interferon adalah protein yang diproduksi sel terinfeksi virus. Interferon menghambat replikasi virus di sel-sel sekitar yang belum terinfeksi.' }
    ]
  },
  {
    title: 'Pertahanan Tubuh Spesifik',
    emoji: '🎯',
    content: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-size:1.6rem;">🎯</span>
        <div>
          <h2 style="margin:0;font-size:1.15rem;color:var(--primary-dark);">Pertahanan Tubuh Spesifik</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <span style="font-size:.78rem;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-weight:600;"><i class="fas fa-book"></i> Biologi Fase F</span>
            <span style="font-size:.78rem;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-weight:600;"><i class="fas fa-book-open"></i> Flipbook Interaktif</span>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#f0fdf4,#eff6ff);border:1px solid #bbf7d0;border-radius:14px;padding:12px 16px;margin-bottom:14px;font-size:.84rem;color:#166534;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.2rem;flex-shrink:0;">💡</span>
        <span>Baca seluruh flipbook di bawah ini. Gunakan tombol navigasi halaman untuk berpindah halaman. Setelah selesai membaca, kerjakan kuis di bawah untuk membuka materi berikutnya.</span>
      </div>
      <div style="position:relative;width:100%;padding-bottom:62%;height:0;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#1a1a2e;">
        <iframe
          src="https://heyzine.com/flip-book/7f3f5fc4c1.html"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"
          allowfullscreen
          loading="lazy"
          title="BioImun – Pertahanan Tubuh Spesifik"
        ></iframe>
      </div>
      <div style="margin-top:10px;text-align:center;">
        <a href="https://heyzine.com/flip-book/7f3f5fc4c1.html" target="_blank" rel="noopener"
           style="font-size:.82rem;color:var(--accent);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
          <i class="fas fa-external-link-alt"></i> Buka flipbook di tab baru untuk tampilan penuh
        </a>
      </div>`,
    kuis: [
      { q:'Sel limfosit yang menghasilkan antibodi adalah?', opts:['Sel T sitotoksik','Sel T helper','Sel B','Makrofag'], ans:2,
        penj:'Sel B yang teraktivasi berdiferensiasi menjadi sel plasma yang memproduksi antibodi dalam jumlah besar.' },
      { q:'Tempat pematangan Sel T adalah?', opts:['Sumsum tulang','Timus','Limpa','Hati'], ans:1,
        penj:'Sel T diproduksi di sumsum tulang namun dimatangkan di timus. Nama "T" berasal dari thymus (timus).' },
      { q:'Kemampuan sistem imun merespons lebih cepat pada infeksi ulang disebut?', opts:['Fagositosis','Imunitas pasif','Memori imun','Inflamasi'], ans:2,
        penj:'Memori imun terbentuk dari sel B dan T memori yang bertahan lama. Saat terpapar antigen sama lagi, respons imun sekunder jauh lebih cepat dan kuat.' }
    ]
  },
  {
    title: 'Jenis Imunitas',
    emoji: '💉',
    content: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-size:1.6rem;">💉</span>
        <div>
          <h2 style="margin:0;font-size:1.15rem;color:var(--primary-dark);">Jenis Imunitas</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <span style="font-size:.78rem;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-weight:600;"><i class="fas fa-book"></i> Biologi Fase F</span>
            <span style="font-size:.78rem;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-weight:600;"><i class="fas fa-book-open"></i> Flipbook Interaktif</span>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#f0fdf4,#eff6ff);border:1px solid #bbf7d0;border-radius:14px;padding:12px 16px;margin-bottom:14px;font-size:.84rem;color:#166534;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.2rem;flex-shrink:0;">💡</span>
        <span>Baca seluruh flipbook di bawah ini. Gunakan tombol navigasi halaman untuk berpindah halaman. Setelah selesai membaca, kerjakan kuis di bawah untuk membuka materi berikutnya.</span>
      </div>
      <div style="position:relative;width:100%;padding-bottom:62%;height:0;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#1a1a2e;">
        <iframe
          src="https://heyzine.com/flip-book/42be1c3c5e.html"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"
          allowfullscreen
          loading="lazy"
          title="BioImun – Jenis Imunitas"
        ></iframe>
      </div>
      <div style="margin-top:10px;text-align:center;">
        <a href="https://heyzine.com/flip-book/42be1c3c5e.html" target="_blank" rel="noopener"
           style="font-size:.82rem;color:var(--accent);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
          <i class="fas fa-external-link-alt"></i> Buka flipbook di tab baru untuk tampilan penuh
        </a>
      </div>`,
    kuis: [
      { q:'Imunitas yang terbentuk setelah seseorang sembuh dari penyakit termasuk?', opts:['Pasif alami','Aktif alami','Aktif buatan','Pasif buatan'], ans:1,
        penj:'Ketika seseorang sakit lalu sembuh, tubuh membentuk antibodi dan sel memori secara alami. Ini disebut imunitas aktif alami.' },
      { q:'Pemberian vaksin menghasilkan jenis imunitas?', opts:['Pasif alami','Pasif buatan','Aktif alami','Aktif buatan'], ans:3,
        penj:'Vaksin memperkenalkan antigen lemah/mati agar tubuh sendiri membentuk antibodi dan sel memori. Ini adalah imunitas aktif buatan.' },
      { q:'Antibodi yang diterima bayi melalui ASI merupakan contoh imunitas?', opts:['Aktif alami','Aktif buatan','Pasif alami','Pasif buatan'], ans:2,
        penj:'Antibodi dari ASI (terutama IgA) diberikan dari ibu ke bayi secara alami. Bayi tidak membuat antibodi sendiri, sehingga ini adalah imunitas pasif alami.' }
    ]
  },
  {
    title: 'Gangguan Sistem Pertahanan Tubuh',
    emoji: '🦠',
    content: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-size:1.6rem;">🦠</span>
        <div>
          <h2 style="margin:0;font-size:1.15rem;color:var(--primary-dark);">Gangguan Sistem Pertahanan Tubuh</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <span style="font-size:.78rem;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-weight:600;"><i class="fas fa-book"></i> Biologi Fase F</span>
            <span style="font-size:.78rem;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-weight:600;"><i class="fas fa-book-open"></i> Flipbook Interaktif</span>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#f0fdf4,#eff6ff);border:1px solid #bbf7d0;border-radius:14px;padding:12px 16px;margin-bottom:14px;font-size:.84rem;color:#166534;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.2rem;flex-shrink:0;">💡</span>
        <span>Baca seluruh flipbook di bawah ini. Gunakan tombol navigasi halaman untuk berpindah halaman. Setelah selesai membaca, kerjakan kuis di bawah untuk membuka materi berikutnya.</span>
      </div>
      <div style="position:relative;width:100%;padding-bottom:62%;height:0;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#1a1a2e;">
        <iframe
          src="https://heyzine.com/flip-book/957bf0f36d.html"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"
          allowfullscreen
          loading="lazy"
          title="BioImun – Gangguan Sistem Pertahanan Tubuh"
        ></iframe>
      </div>
      <div style="margin-top:10px;text-align:center;">
        <a href="https://heyzine.com/flip-book/957bf0f36d.html" target="_blank" rel="noopener"
           style="font-size:.82rem;color:var(--accent);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
          <i class="fas fa-external-link-alt"></i> Buka flipbook di tab baru untuk tampilan penuh
        </a>
      </div>`,
    kuis: [
      { q:'Reaksi berlebihan sistem imun terhadap zat tidak berbahaya disebut?', opts:['Autoimun','Alergi','Imunodefisiensi','Fagositosis'], ans:1,
        penj:'Alergi (hipersensitivitas) terjadi ketika sistem imun bereaksi berlebihan terhadap alergen yang sebenarnya tidak berbahaya, melibatkan IgE dan sel mast.' },
      { q:'HIV menyerang jenis sel limfosit yang mana?', opts:['Sel B','Sel T sitotoksik','Sel T helper (CD4+)','Sel NK'], ans:2,
        penj:'HIV secara spesifik menginfeksi Sel T helper (CD4+), yang merupakan sel koordinator respons imun. Berkurangnya sel ini melemahkan seluruh sistem imun.' },
      { q:'Penyakit Lupus (SLE) termasuk jenis gangguan?', opts:['Alergi','Imunodefisiensi','Autoimun','Infeksi virus'], ans:2,
        penj:'Lupus (Systemic Lupus Erythematosus) adalah penyakit autoimun dimana sistem imun menyerang berbagai jaringan tubuh sendiri.' }
    ]
  }
];

/* ========================= RUANG BELAJAR ========================= */
function initSubmateriCards() {
  for (let i = 0; i < 5; i++) {
    const card = document.getElementById('sm-card-' + i);
    if (card) {
      card.onclick = () => openMateri(i);
    }
  }
}

function openMateri(idx) {
  if (!materiUnlocked(idx)) {
    showToast('🔒 Selesaikan kuis materi sebelumnya terlebih dahulu!', 'error');
    return;
  }
  currentMateri = idx;
  const m = MATERI[idx];
  navigateTo('materi');
  document.getElementById('mb-title').textContent = m.title;
  document.getElementById('topbar-title').textContent = '📄 ' + m.title;

  const box = document.getElementById('materi-content-box');
  box.innerHTML = m.content;

  // Tandai materi sudah dibaca
  progress.materi[idx] = true;
  saveProgress();
  updateGlobalProgress();
  updateSidebarLocks();

  renderKuis(idx);
}

function backToRuangBelajar() {
  navigateTo('ruangbelajar');
  updateSidebarLocks();
}

/* ========================= KUIS ========================= */
function renderKuis(matIdx) {
  const kuis      = MATERI[matIdx].kuis;
  const container = document.getElementById('kuis-questions');
  kuisAnswers     = [];
  container.innerHTML = '';
  document.getElementById('kuis-score').style.display     = 'none';
  document.getElementById('kuis-actions').style.display   = 'flex';
  document.getElementById('kuis-unlock-msg').style.display = 'none';
  document.getElementById('kuis-locked-msg').style.display = 'none';

  kuis.forEach((q, qi) => {
    const letters = ['A','B','C','D'];
    const optsHtml = q.opts.map((o, oi) =>
      `<div class="q-opt" onclick="selectKuisOpt(this,${qi},${oi})" data-qi="${qi}" data-oi="${oi}">
        <div class="opt-letter">${letters[oi]}</div>${o}
      </div>`).join('');
    container.innerHTML += `
      <div class="q-card" id="qcard-${qi}">
        <div class="q-text">${qi+1}. ${q.q}</div>
        <div class="q-options">${optsHtml}</div>
        <div class="q-feedback" id="qfb-${qi}"></div>
      </div>`;
  });
}

function selectKuisOpt(el, qi, oi) {
  document.querySelectorAll(`[data-qi="${qi}"]`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  kuisAnswers[qi] = oi;
}

function submitKuis() {
  const kuis  = MATERI[currentMateri].kuis;
  let   score = 0;
  let   allAnswered = true;

  kuis.forEach((q, qi) => {
    if (kuisAnswers[qi] === undefined) { allAnswered = false; return; }
    const userAns = kuisAnswers[qi];
    const opts    = document.querySelectorAll(`[data-qi="${qi}"]`);
    const fb      = document.getElementById('qfb-' + qi);
    opts.forEach(o => o.onclick = null);
    opts.forEach((o, oi) => {
      if (oi === q.ans)          o.classList.add('correct');
      else if (userAns === oi)   o.classList.add('wrong');
    });
    if (userAns === q.ans) {
      score++;
      fb.textContent = '✅ Jawaban benar! ' + q.penj;
      fb.className   = 'q-feedback show ok';
    } else {
      fb.textContent = `❌ Salah. Jawaban benar: ${['A','B','C','D'][q.ans]}. ${q.penj}`;
      fb.className   = 'q-feedback show fail';
    }
  });

  if (!allAnswered) {
    showToast('⚠️ Jawab semua soal terlebih dahulu!', 'error');
    return;
  }

  progress.kuisScore[currentMateri] = score;
  const passed = score >= MIN_KUIS_SCORE;
  progress.kuisPassed[currentMateri] = passed;
  progress.xp += score * 5;
  saveProgress();
  updateGlobalProgress();
  updateSidebarLocks();
  renderBadges();
  // ── SYNC kuis ke Google Sheets ──
  if (typeof syncKuis === 'function') syncKuis(currentMateri, score, passed);

  const scoreBox = document.getElementById('kuis-score');
  scoreBox.style.display = 'block';
  scoreBox.innerHTML = `
    <div class="score-box">
      <div style="font-size:2.5rem;margin-bottom:8px">${score===3?'🏆':score>=2?'👍':'📚'}</div>
      <div class="score-val">${score}/3</div>
      <div class="score-label">${score===3?'Sempurna! Luar biasa!':score>=2?'Bagus! Kamu lulus!':'Perlu belajar lagi!'}</div>
    </div>`;

  document.getElementById('kuis-actions').style.display = 'none';

  if (passed) {
    document.getElementById('kuis-unlock-msg').style.display = 'block';
    showToast('🎉 Selamat! Materi berikutnya terbuka!', 'success');
  } else {
    document.getElementById('kuis-locked-msg').style.display = 'block';
    showToast(`Skor ${score}/3. Minimal ${MIN_KUIS_SCORE}/3 untuk lanjut.`, 'error');
  }
}

function resetKuis() {
  kuisAnswers = [];
  renderKuis(currentMateri);
}

/* ========================= LKPD PBL ========================= */
function openPBL(idx) {
  if (!lkpdUnlocked(idx)) {
    showToast('🔒 Selesaikan tahap sebelumnya terlebih dahulu!', 'error');
    return;
  }
  currentPBL = idx;
  document.querySelectorAll('.pbl-stage-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
  const area = document.getElementById('lkpd-content-area');

  if (!lkpdUnlocked(idx)) {
    area.innerHTML = `
      <div class="lkpd-locked-panel">
        <i class="fas fa-lock"></i>
        <h3>Tahap Terkunci</h3>
        <p>Selesaikan tahap sebelumnya untuk membuka tahap ini.</p>
      </div>`;
    return;
  }
  area.innerHTML = PBL_CONTENT[idx];
}

function submitLKPD(idx) {
  progress.lkpd[idx] = true;
  saveProgress();
  updateSidebarLocks();
  renderBadges();
  // ── SYNC LKPD ke Google Sheets ──
  if (typeof syncLKPD === 'function') syncLKPD(1, idx);
  showToast('✅ Tahap ' + (idx+1) + ' berhasil diselesaikan! Tahap berikutnya terbuka.', 'success');
  // Buka tab berikutnya jika ada
  if (idx < 4) setTimeout(() => openPBL(idx + 1), 800);
}

const PBL_CONTENT = [
  // ── Tahap 1: Orientasi Masalah ──
  `<div class="lkpd-content animate-in">
    <h3 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:16px;">🔍 Tahap 1: Orientasi pada Masalah</h3>
    <div class="case-box">
      <h4>📰 Studi Kasus: Lonjakan Kasus DBD</h4>
      <p>Pada awal musim hujan, terjadi peningkatan signifikan kasus Demam Berdarah Dengue (DBD). Data Kementerian Kesehatan menunjukkan kenaikan 40% dibanding tahun lalu. Banyak pasien mengalami penurunan trombosit drastis dan kebocoran plasma. Mengapa sistem imun seseorang bisa kalah dari virus dengue?</p>
    </div>
    <div class="case-box" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-color:#93c5fd;margin-top:12px;">
      <h4 style="color:#1e40af;">🤧 Kasus Tambahan: Meningkatnya Kasus Alergi</h4>
      <p style="color:#1e3a8a;">Prevalensi alergi pada anak-anak meningkat 20% dalam 10 tahun terakhir. Para ilmuwan menduga berkaitan dengan perubahan pola hidup dan paparan polutan. Mengapa sistem imun beberapa orang "salah sasaran" menyerang zat yang tidak berbahaya?</p>
    </div>
    <div style="margin-top:20px;">
      <label style="font-size:.9rem;font-weight:700;color:var(--text);display:block;margin-bottom:8px;">✏️ Rumusan Masalah Kelompok Kamu:</label>
      <textarea class="textarea-field" id="rm-text" placeholder="Tuliskan rumusan masalah berdasarkan kasus di atas (minimal 2 kalimat tanya)..."></textarea>
    </div>
    <div style="margin-top:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h4 style="font-size:.95rem;font-weight:800;color:var(--primary-dark);">💬 Forum Diskusi Kelas</h4>
        <button class="btn-primary" onclick="addForumPost(0)" style="padding:8px 16px;font-size:.82rem;"><i class="fas fa-plus"></i> Tambah</button>
      </div>
      <div id="forum-posts-0">
        <div class="forum-post"><div class="forum-post-header"><div class="fp-avatar">K1</div><div><div class="fp-name">Kelompok 1</div><div class="fp-time">2 jam lalu</div></div></div><div class="fp-text">Menurut kami, masalah utama adalah: Mengapa sistem imun tidak mampu mengenali dan menghancurkan virus dengue sebelum menyebabkan kerusakan organ?</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (3)</button></div></div>
        <div class="forum-post"><div class="forum-post-header"><div class="fp-avatar" style="background:linear-gradient(135deg,#7c3aed,#4f46e5)">K2</div><div><div class="fp-name">Kelompok 2</div><div class="fp-time">1 jam lalu</div></div></div><div class="fp-text">Kami meneliti: Bagaimana mekanisme virus dengue menghindari sistem imun? Apakah ada hubungannya dengan antibody-dependent enhancement?</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (5)</button></div></div>
      </div>
    </div>
    <button class="btn-primary" style="margin-top:20px;width:100%" onclick="checkAndSubmitLKPD(0,'rm-text')"><i class="fas fa-check-circle"></i> Selesaikan Tahap 1</button>
  </div>`,

  // ── Tahap 2: Organisasi Belajar ──
  `<div class="lkpd-content animate-in">
    <h3 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:16px;">📚 Tahap 2: Mengorganisasikan Siswa untuk Belajar</h3>
    <div class="info-box" style="margin-bottom:16px;"><strong>📌 Tujuan:</strong> Merencanakan strategi belajar, membagi tugas, dan mengidentifikasi sumber belajar.</div>
    <div class="card" style="margin-bottom:16px;">
      <h4 style="margin-bottom:14px;font-size:.95rem;font-weight:800;"><i class="fas fa-book-open" style="color:var(--primary)"></i> Sumber Belajar Tambahan</h4>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid var(--border);border-radius:12px;background:var(--bg);">
          <div style="width:40px;height:40px;border-radius:10px;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-size:1.1rem;">📄</div>
          <div><div style="font-size:.88rem;font-weight:700;">Jurnal: Immunological Response to Dengue Virus</div><div style="font-size:.76rem;color:var(--text-muted);">Nature Immunology, 2023</div></div>
          <button class="btn-secondary" style="margin-left:auto;padding:6px 14px;font-size:.78rem;" onclick="showToast('Membuka artikel...','info')">Buka →</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid var(--border);border-radius:12px;background:var(--bg);">
          <div style="width:40px;height:40px;border-radius:10px;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:1.1rem;">📚</div>
          <div><div style="font-size:.88rem;font-weight:700;">Ruang Belajar BioImun</div><div style="font-size:.76rem;color:var(--text-muted);">Materi interaktif dengan kuis</div></div>
          <button class="btn-secondary" style="margin-left:auto;padding:6px 14px;font-size:.78rem;" onclick="navigateTo('ruangbelajar')">Buka →</button>
        </div>
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">📝 Rencana Belajar Kelompok:</label>
      <textarea class="textarea-field" id="org-text" placeholder="Tuliskan: pembagian tugas anggota, sumber yang akan digunakan, target waktu, dan strategi belajar kelompok Anda..." style="min-height:120px"></textarea>
    </div>
    <div style="margin-top:20px;">
      <h4 style="font-size:.95rem;font-weight:800;margin-bottom:12px;">💬 Forum Berbagi Informasi</h4>
      <div id="forum-posts-1">
        <div class="forum-post"><div class="forum-post-header"><div class="fp-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706)">K3</div><div><div class="fp-name">Kelompok 3</div><div class="fp-time">30 menit lalu</div></div></div><div class="fp-text">Kami membagi tugas: 2 orang riset tentang mekanisme virus dengue, 2 orang riset tentang sistem komplemen, 1 orang koordinator presentasi.</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (2)</button></div></div>
      </div>
      <button class="btn-secondary" onclick="addForumPost(1)" style="margin-top:10px;padding:8px 16px;font-size:.82rem;"><i class="fas fa-plus"></i> Tambah Info</button>
    </div>
    <button class="btn-primary" style="margin-top:20px;width:100%" onclick="checkAndSubmitLKPD(1,'org-text')"><i class="fas fa-check-circle"></i> Selesaikan Tahap 2</button>
  </div>`,

  // ── Tahap 3: Penyelidikan ──
  `<div class="lkpd-content animate-in">
    <h3 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:16px;">🔬 Tahap 3: Membimbing Penyelidikan</h3>
    <div class="info-box" style="margin-bottom:16px;"><strong>🎯 Tujuan:</strong> Melakukan penyelidikan mendalam dan menganalisis berbagai sumber informasi ilmiah.</div>
    <div class="card" style="margin-bottom:16px;">
      <h4 style="margin-bottom:14px;font-size:.95rem;font-weight:800;">🌐 Sumber Referensi Ilmiah</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
        <div style="padding:14px;border:2px solid var(--border);border-radius:12px;cursor:pointer;transition:all .2s;text-align:center;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"><div style="font-size:1.5rem;margin-bottom:6px;">🏛️</div><div style="font-size:.85rem;font-weight:700;">PubMed</div><div style="font-size:.75rem;color:var(--text-muted);">Jurnal biomedis</div></div>
        <div style="padding:14px;border:2px solid var(--border);border-radius:12px;cursor:pointer;transition:all .2s;text-align:center;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"><div style="font-size:1.5rem;margin-bottom:6px;">🏥</div><div style="font-size:.85rem;font-weight:700;">Kemenkes RI</div><div style="font-size:.75rem;color:var(--text-muted);">Data kesehatan</div></div>
        <div style="padding:14px;border:2px solid var(--border);border-radius:12px;cursor:pointer;transition:all .2s;text-align:center;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"><div style="font-size:1.5rem;margin-bottom:6px;">🔬</div><div style="font-size:.85rem;font-weight:700;">WHO</div><div style="font-size:.75rem;color:var(--text-muted);">Kesehatan global</div></div>
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">📝 Hasil Analisis Informasi:</label>
      <textarea class="textarea-field" id="inv-text" style="min-height:140px" placeholder="Tuliskan hasil analisis dari berbagai sumber yang telah kalian temukan. Sertakan sumber (judul artikel/URL) dan temuan penting dari setiap sumber..."></textarea>
    </div>
    <div style="margin-top:20px;">
      <h4 style="font-size:.95rem;font-weight:800;margin-bottom:12px;">💬 Forum Penyelidikan Terbuka</h4>
      <div id="forum-posts-2">
        <div class="forum-post"><div class="forum-post-header"><div class="fp-avatar" style="background:linear-gradient(135deg,#0e7fb5,#0d4530)">K4</div><div><div class="fp-name">Kelompok 4</div><div class="fp-time">45 menit lalu</div></div></div><div class="fp-text">Dari jurnal PubMed, kami menemukan bahwa virus dengue menggunakan mekanisme ADE (Antibody-Dependent Enhancement) untuk justru menggunakan antibodi sebagai "kuda Troya" untuk masuk ke sel imun. Sangat menarik!</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (7)</button></div></div>
      </div>
      <button class="btn-secondary" onclick="addForumPost(2)" style="margin-top:10px;padding:8px 16px;font-size:.82rem;"><i class="fas fa-plus"></i> Bagikan Temuan</button>
    </div>
    <button class="btn-primary" style="margin-top:20px;width:100%" onclick="checkAndSubmitLKPD(2,'inv-text')"><i class="fas fa-check-circle"></i> Selesaikan Tahap 3</button>
  </div>`,

  // ── Tahap 4: Penyajian Hasil ──
  `<div class="lkpd-content animate-in">
    <h3 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:16px;">🎨 Tahap 4: Mengembangkan dan Menyajikan Hasil</h3>
    <div class="info-box" style="margin-bottom:16px;"><strong>🎯 Tujuan:</strong> Membuat dan mempresentasikan hasil penyelidikan dalam bentuk infografis atau karya kreatif.</div>
    <div style="margin-bottom:16px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">📝 Deskripsi Infografis Kelompok:</label>
      <textarea class="textarea-field" id="pres-text" placeholder="Jelaskan isi infografis yang kalian buat: topik, konten utama, pesan yang ingin disampaikan, dan cara penyajiannya..." style="min-height:110px"></textarea>
    </div>
    <h4 style="font-size:.95rem;font-weight:800;margin-bottom:14px;">🖼️ Galeri Karya Kelompok</h4>
    <div class="gallery-grid" style="margin-bottom:20px;">
      <div class="gallery-item"><div class="gi-icon">🛡️</div><div class="gi-title">Infografis Sistem Imun</div><div class="gi-group">Kelompok 1</div></div>
      <div class="gallery-item"><div class="gi-icon">🦠</div><div class="gi-title">Mekanisme DBD vs Imun</div><div class="gi-group">Kelompok 2</div></div>
      <div class="gallery-item"><div class="gi-icon">💉</div><div class="gi-title">Jenis Vaksin Indonesia</div><div class="gi-group">Kelompok 3</div></div>
      <div class="gallery-item"><div class="gi-icon">🔬</div><div class="gi-title">Alergi & Hipersensitivitas</div><div class="gi-group">Kelompok 4</div></div>
      <div class="gallery-item" style="border-style:dashed;" onclick="showToast('Upload infografis (format teks deskripsi di atas)','info')"><div style="font-size:2rem;margin-bottom:6px">➕</div><div class="gi-title">Tambah Karya</div></div>
    </div>
    <div style="margin-top:16px;">
      <h4 style="font-size:.95rem;font-weight:800;margin-bottom:12px;">💬 Komentar & Diskusi Antar Kelompok</h4>
      <div id="forum-posts-3">
        <div class="forum-post"><div class="forum-post-header"><div class="fp-avatar">K2</div><div><div class="fp-name">Kelompok 2</div><div class="fp-time">1 jam lalu</div></div></div><div class="fp-text">Infografis Kelompok 1 sangat informatif! Kami suka bagian tentang komponen sel imun. Apakah kalian juga menjelaskan peran sel NK (Natural Killer)?</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (4)</button></div></div>
      </div>
      <div style="margin-top:12px;">
        <textarea class="textarea-field" id="comment-text" placeholder="Berikan komentar atau pertanyaan untuk kelompok lain..." style="min-height:70px"></textarea>
        <button class="btn-secondary" style="margin-top:8px;padding:9px 18px;font-size:.85rem" onclick="addComment()"><i class="fas fa-paper-plane"></i> Kirim Komentar</button>
      </div>
    </div>
    <button class="btn-primary" style="margin-top:20px;width:100%" onclick="checkAndSubmitLKPD(3,'pres-text')"><i class="fas fa-check-circle"></i> Selesaikan Tahap 4</button>
  </div>`,

  // ── Tahap 5: Evaluasi ──
  `<div class="lkpd-content animate-in">
    <h3 style="font-size:1.1rem;font-weight:800;color:var(--primary-dark);margin-bottom:16px;">✅ Tahap 5: Menganalisis dan Mengevaluasi</h3>
    <div class="info-box" style="margin-bottom:16px;"><strong>🎯 Tujuan:</strong> Merefleksikan proses pembelajaran, mengevaluasi solusi, dan menarik kesimpulan.<br><small style="color:var(--text-muted);">📌 Catatan: Refleksi ini hanya dapat dilihat oleh guru.</small></div>
    <div style="margin-bottom:16px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">💡 Solusi yang Ditemukan Kelompok:</label>
      <textarea class="textarea-field" id="sol-text" placeholder="Tuliskan solusi/jawaban atas rumusan masalah berdasarkan hasil penyelidikan..."></textarea>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">📝 Kesimpulan:</label>
      <textarea class="textarea-field" id="kes-text" placeholder="Tuliskan kesimpulan dari keseluruhan proses pembelajaran PBL ini..."></textarea>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">🔄 Evaluasi Proses Pembelajaran:</label>
      <textarea class="textarea-field" id="eval-text" placeholder="Apa yang berjalan baik? Apa yang perlu diperbaiki? Apa yang kalian pelajari? (min. 3 kalimat)" style="min-height:120px"></textarea>
    </div>
    <div style="margin-bottom:20px;">
      <label style="font-size:.9rem;font-weight:700;display:block;margin-bottom:8px;">⭐ Penilaian Diri (Self-Assessment):</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="padding:14px;border:2px solid var(--border);border-radius:12px;background:#fff;">
          <div style="font-size:.85rem;font-weight:700;margin-bottom:8px;">Kontribusi dalam Kelompok</div>
          <div style="display:flex;gap:6px;">${[1,2,3,4,5].map(n=>`<button onclick="rateSelf(this,${n},'kolaborasi')" style="width:32px;height:32px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:1.1rem;transition:all .2s">⭐</button>`).join('')}</div>
        </div>
        <div style="padding:14px;border:2px solid var(--border);border-radius:12px;background:#fff;">
          <div style="font-size:.85rem;font-weight:700;margin-bottom:8px;">Pemahaman Materi</div>
          <div style="display:flex;gap:6px;">${[1,2,3,4,5].map(n=>`<button onclick="rateSelf(this,${n},'pemahaman')" style="width:32px;height:32px;border-radius:8px;border:2px solid var(--border);background:#fff;cursor:pointer;font-size:1.1rem;transition:all .2s">⭐</button>`).join('')}</div>
        </div>
      </div>
    </div>
    <button class="btn-primary" style="width:100%" onclick="checkAndSubmitLKPD(4,'eval-text')"><i class="fas fa-flag-checkered"></i> Selesaikan LKPD Seluruhnya</button>
  </div>`
];

function checkAndSubmitLKPD(idx, textareaId) {
  const ta = document.getElementById(textareaId);
  if (!ta || ta.value.trim().length < 20) {
    showToast('⚠️ Isi kolom teks terlebih dahulu (minimal 20 karakter)!', 'error');
    if (ta) ta.focus();
    return;
  }
  submitLKPD(idx);
}

function addForumPost(stage) {
  openModal('Tambah Diskusi', `
    <div class="form-group"><label>Nama Kelompok</label><div class="input-wrap"><i class="fas fa-users"></i><input type="text" id="fp-group" placeholder="Kelompok..."></div></div>
    <div class="form-group" style="margin-top:14px"><label>Diskusi / Rumusan Masalah</label><textarea class="textarea-field" id="fp-text" placeholder="Tuliskan pendapat, pertanyaan, atau temuan..." style="min-height:90px"></textarea></div>
    <button class="btn-primary" onclick="postForum(${stage})" style="width:100%;margin-top:8px"><i class="fas fa-paper-plane"></i> Kirim</button>
  `);
}

function postForum(stage) {
  const g = document.getElementById('fp-group').value || 'Kelompok';
  const t = document.getElementById('fp-text').value;
  if (!t) return;
  const posts = document.getElementById('forum-posts-' + stage);
  if (posts) {
    const init = g.split(' ').map(w => w[0]).join('').toUpperCase().substring(0,2) || 'K';
    posts.innerHTML += `<div class="forum-post animate-in"><div class="forum-post-header"><div class="fp-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706)">${init}</div><div><div class="fp-name">${g}</div><div class="fp-time">Baru saja</div></div></div><div class="fp-text">${t}</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (0)</button></div></div>`;
  }
  closeModal();
  showToast('✅ Diskusi berhasil ditambahkan!', 'success');
}

function likePost(btn) {
  const txt   = btn.innerHTML;
  const match = txt.match(/\((\d+)\)/);
  if (match) btn.innerHTML = `<i class="fas fa-thumbs-up"></i> Suka (${parseInt(match[1])+1})`;
}

function addComment() {
  const ta = document.getElementById('comment-text');
  if (!ta || !ta.value.trim()) { showToast('Tulis komentar terlebih dahulu.','error'); return; }
  const posts = document.getElementById('forum-posts-3');
  if (posts) {
    posts.innerHTML += `<div class="forum-post animate-in"><div class="forum-post-header"><div class="fp-avatar">${currentUser.name[0]}</div><div><div class="fp-name">${currentUser.name}</div><div class="fp-time">Baru saja</div></div></div><div class="fp-text">${ta.value}</div><div class="fp-actions"><button class="fp-btn" onclick="likePost(this)"><i class="fas fa-thumbs-up"></i> Suka (0)</button></div></div>`;
  }
  ta.value = '';
  showToast('✅ Komentar terkirim!', 'success');
}

function rateSelf(btn, n, cat) {
  const parent = btn.parentElement;
  parent.querySelectorAll('button').forEach((b, i) => b.style.background = i < n ? '#fef3c7' : '#fff');
  showToast(`Rating ${cat}: ${n}/5 disimpan!`, 'success');
}

/* ========================= DRILL SOAL ========================= */
const ALL_QUESTIONS = [
  { q:'Sel darah putih yang berperan utama dalam imunitas adaptif adalah?', opts:['Eritrosit','Trombosit','Limfosit','Basofil'], ans:2, penj:'Limfosit (Sel B dan Sel T) adalah sel utama dalam respons imun spesifik/adaptif. Sel B menghasilkan antibodi, Sel T berperan dalam imunitas seluler.' },
  { q:'Proses fagositosis pertama kali ditemukan oleh?', opts:['Louis Pasteur','Elie Metchnikoff','Alexander Fleming','Robert Koch'], ans:1, penj:'Elie Metchnikoff menemukan proses fagositosis pada akhir abad ke-19 dan memenangkan Nobel Prize bersama Paul Ehrlich tahun 1908.' },
  { q:'Antibodi termasuk dalam golongan protein?', opts:['Enzim','Hormon','Imunoglobulin','Lipoprotein'], ans:2, penj:'Antibodi adalah protein imunoglobulin yang diproduksi oleh sel plasma (turunan sel B yang teraktivasi).' },
  { q:'Vaksin BCG diberikan untuk mencegah penyakit?', opts:['Polio','Tuberkulosis','Campak','Hepatitis'], ans:1, penj:'BCG (Bacillus Calmette-Guérin) adalah vaksin untuk mencegah penyakit tuberkulosis (TBC) yang disebabkan Mycobacterium tuberculosis.' },
  { q:'Sel T helper memiliki penanda permukaan?', opts:['CD8','CD4','MHC I','MHC II'], ans:1, penj:'Sel T helper (Th) memiliki penanda CD4 di permukaannya. CD4 inilah yang digunakan HIV sebagai reseptor untuk masuk ke sel T helper.' },
  { q:'Penyakit yang disebabkan sistem imun menyerang sel tubuh sendiri disebut?', opts:['Alergi','Imunodefisiensi','Autoimun','Anafilaksis'], ans:2, penj:'Penyakit autoimun terjadi ketika sistem imun gagal membedakan "self" dan "non-self", sehingga menyerang jaringan tubuh sendiri.' },
  { q:'Imunoglobulin mana yang paling banyak dalam darah?', opts:['IgA','IgM','IgG','IgE'], ans:2, penj:'IgG adalah imunoglobulin paling melimpah dalam serum darah, sekitar 75-80% dari total antibodi. IgG juga bisa melewati plasenta.' },
  { q:'Proses pembentukan antibodi oleh sel plasma disebut?', opts:['Fagositosis','Imunogenisitas','Respons humoral','Opsonisasi'], ans:2, penj:'Respons imun humoral melibatkan produksi antibodi oleh sel plasma (sel B yang teraktivasi oleh antigen dan bantuan sel T helper).' },
  { q:'Kulit merupakan komponen pertahanan tubuh jenis?', opts:['Spesifik','Nonspesifik','Adaptif','Humoral'], ans:1, penj:'Kulit adalah penghalang fisik yang merupakan bagian pertahanan nonspesifik (bawaan/innate). Kulit mencegah patogen masuk ke tubuh.' },
  { q:'Sel NK (Natural Killer) berfungsi untuk?', opts:['Memproduksi antibodi','Membunuh sel tumor dan terinfeksi virus','Mengaktifkan sel B','Menghasilkan komplemen'], ans:1, penj:'Sel NK membunuh sel-sel yang terinfeksi virus dan sel tumor tanpa memerlukan pengenalan MHC spesifik, sebagai bagian imunitas bawaan.' },
  { q:'Demam merupakan mekanisme pertahanan tubuh karena?', opts:['Menurunkan produksi antibodi','Menghambat pertumbuhan patogen','Mengaktifkan alergi','Meningkatkan pH darah'], ans:1, penj:'Demam meningkatkan suhu tubuh yang menghambat pertumbuhan dan replikasi banyak patogen, sekaligus meningkatkan aktivitas sel imun.' },
  { q:'HIV menyerang sel?', opts:['Sel B','Eritrosit','Sel T helper (CD4+)','Trombosit'], ans:2, penj:'HIV secara spesifik menginfeksi dan menghancurkan Sel T helper (CD4+), melemahkan sistem imun secara keseluruhan hingga terjadi AIDS.' },
  { q:'Komplemen adalah?', opts:['Jenis antibodi','Protein plasma yang membantu imunitas','Jenis limfosit','Organ limfoid'], ans:1, penj:'Sistem komplemen terdiri dari protein plasma yang bekerja bersama antibodi untuk menghancurkan patogen melalui lisis membran, opsonisasi, dll.' },
  { q:'Antigen adalah?', opts:['Zat yang diproduksi tubuh untuk melawan infeksi','Zat asing yang memicu respons imun','Sel darah putih khusus','Protein pelindung sel'], ans:1, penj:'Antigen adalah molekul (biasanya protein atau polisakarida) yang dapat memicu respons imun dan berikatan spesifik dengan antibodi.' },
  { q:'Imunisasi pasif alami pada bayi terjadi melalui?', opts:['Vaksinasi','ASI dan plasenta','Infeksi ringan','Serum antitoksin'], ans:1, penj:'Bayi mendapatkan imunitas pasif alami melalui antibodi (IgG) yang melewati plasenta selama kehamilan dan IgA dari ASI.' }
];

function changeDrillNum(delta) {
  drillNum = Math.max(5, Math.min(15, drillNum + delta));
  const dispEl = document.getElementById('drill-num-display');
  if (dispEl) dispEl.textContent = drillNum;
}

function startDrill() {
  drillQuestions = [...ALL_QUESTIONS].sort(() => Math.random() - .5).slice(0, drillNum);
  drillIdx     = 0;
  drillAnswers = new Array(drillNum).fill(-1);
  document.getElementById('drill-setup-area').style.display  = 'none';
  document.getElementById('drill-quiz-area').style.display   = 'block';
  document.getElementById('drill-result-area').style.display = 'none';
  document.getElementById('drill-tot').textContent = drillNum;
  showDrillQuestion();
}

function showDrillQuestion() {
  const q = drillQuestions[drillIdx];
  document.getElementById('drill-cur').textContent   = drillIdx + 1;
  document.getElementById('drill-prog').style.width  = ((drillIdx / drillNum) * 100) + '%';
  const letters = ['A','B','C','D'];
  document.getElementById('drill-question-box').innerHTML = `
    <div class="q-text" style="font-size:1rem;">${drillIdx+1}. ${q.q}</div>
    <div class="q-options" style="margin-top:14px;">${q.opts.map((o,i)=>`<div class="q-opt" onclick="selectDrillOpt(this,${i})" data-oi="${i}"><div class="opt-letter">${letters[i]}</div>${o}</div>`).join('')}</div>`;
  const nextBtn = document.getElementById('drill-next-btn');
  if (nextBtn) nextBtn.textContent = drillIdx === drillNum - 1 ? 'Selesai ✓' : 'Soal Berikutnya →';
}

function selectDrillOpt(el, oi) {
  document.querySelectorAll('[data-oi]').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  drillAnswers[drillIdx] = oi;
}

function nextDrill() {
  if (drillIdx < drillNum - 1) {
    drillIdx++;
    showDrillQuestion();
  } else {
    showDrillResult();
  }
}

function showDrillResult() {
  document.getElementById('drill-quiz-area').style.display   = 'none';
  document.getElementById('drill-result-area').style.display = 'block';
  let score = 0;
  drillQuestions.forEach((q,i) => { if (drillAnswers[i] === q.ans) score++; });
  document.getElementById('drill-final-score').textContent = score + '/' + drillNum;
  const pct = Math.round(score / drillNum * 100);
  document.getElementById('drill-result-msg').textContent =
    pct >= 80 ? '🏆 Sangat bagus! Pertahankan prestasi kamu!' :
    pct >= 60 ? '👍 Cukup baik. Terus berlatih untuk lebih baik!' :
                '📚 Perlu lebih banyak latihan. Pelajari lagi materinya!';

  let pembHtml = '<h4 style="font-size:.92rem;font-weight:800;margin-bottom:14px;color:var(--primary-dark);">📖 Pembahasan Detail:</h4>';
  drillQuestions.forEach((q,i) => {
    const isCorrect = drillAnswers[i] === q.ans;
    const letters   = ['A','B','C','D'];
    pembHtml += `<div style="padding:14px 16px;border:2px solid ${isCorrect?'var(--success)':'var(--danger)'};border-radius:12px;margin-bottom:12px;background:${isCorrect?'#f0fdf4':'#fef2f2'}">
      <div style="font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:6px;">${i+1}. ${q.q}</div>
      <div style="font-size:.82rem;color:${isCorrect?'#166534':'#991b1b'};margin-bottom:6px;">${isCorrect?'✅':'❌'} Jawaban kamu: ${drillAnswers[i]>=0?letters[drillAnswers[i]]:'Tidak dijawab'} | Jawaban benar: ${letters[q.ans]} (${q.opts[q.ans]})</div>
      <div style="font-size:.82rem;color:var(--text-muted);line-height:1.6;">💡 <strong>Pembahasan:</strong> ${q.penj}</div>
    </div>`;
  });
  document.getElementById('drill-pembahasan').innerHTML = pembHtml;

  if (progress.drillBest === null || pct > progress.drillBest) {
    progress.drillBest = pct;
  }
  saveProgress();
  updateGlobalProgress();
  renderBadges();
  // ── SYNC drill ke Google Sheets ──
  if (typeof syncDrill === 'function') syncDrill(drillNum, score);
}

function endDrill() {
  document.getElementById('drill-quiz-area').style.display  = 'none';
  document.getElementById('drill-setup-area').style.display = 'block';
}

function resetDrill() {
  document.getElementById('drill-result-area').style.display = 'none';
  document.getElementById('drill-setup-area').style.display  = 'block';
  drillNum = 5;
  const dispEl = document.getElementById('drill-num-display');
  if (dispEl) dispEl.textContent = drillNum;
}

/* ========================= GLOSARIUM ========================= */
const GLOSARIUM_DATA = [
  { term:'Alergen', def:'Zat yang tidak berbahaya tetapi memicu reaksi alergi pada individu yang sensitif.' },
  { term:'Alergi', def:'Respons imun berlebihan terhadap zat yang sebenarnya tidak berbahaya, melibatkan IgE dan sel mast.' },
  { term:'Anafilaksis', def:'Reaksi alergi berat dan mengancam jiwa yang terjadi dengan cepat setelah paparan alergen.' },
  { term:'Antibodi', def:'Protein imunoglobulin yang diproduksi oleh sel plasma sebagai respons terhadap antigen spesifik.' },
  { term:'Antigen', def:'Molekul asing (biasanya protein) yang memicu respons imun dan berikatan spesifik dengan antibodi.' },
  { term:'Autoimun', def:'Kondisi di mana sistem imun menyerang jaringan atau sel tubuh sendiri secara keliru.' },
  { term:'Basofil', def:'Jenis sel darah putih granulosit yang melepas histamin saat terjadi reaksi alergi.' },
  { term:'CD4+', def:'Penanda permukaan sel T helper yang digunakan sebagai target infeksi oleh HIV.' },
  { term:'Dendritic Cell', def:'Sel penyaji antigen (APC) profesional yang mengaktifkan limfosit T naif.' },
  { term:'Epitop', def:'Bagian spesifik dari antigen yang dikenali dan berikatan dengan antibodi atau reseptor sel T.' },
  { term:'Fagositosis', def:'Proses sel (makrofag, neutrofil) menelan dan mencerna partikel asing atau patogen.' },
  { term:'Histamin', def:'Senyawa kimia yang dilepaskan sel mast selama reaksi alergi, menyebabkan peradangan.' },
  { term:'Imunitas aktif', def:'Imunitas yang terbentuk saat tubuh sendiri memproduksi antibodi setelah terpapar antigen.' },
  { term:'Imunitas pasif', def:'Imunitas yang diperoleh dari antibodi yang dibuat organisme lain dan dipindahkan ke tubuh.' },
  { term:'Imunoglobulin', def:'Nama ilmiah untuk antibodi; protein berbentuk Y yang diproduksi sel plasma.' },
  { term:'Inflamasi', def:'Respons jaringan terhadap cedera atau infeksi ditandai kemerahan, panas, bengkak, dan nyeri.' },
  { term:'Interferon', def:'Protein yang diproduksi sel terinfeksi virus untuk menghambat replikasi virus di sel sekitarnya.' },
  { term:'Komplemen', def:'Sistem protein plasma yang bekerja bersama antibodi untuk menghancurkan patogen.' },
  { term:'Limfosit', def:'Jenis sel darah putih yang berperan dalam imunitas spesifik; terdiri dari Sel B dan Sel T.' },
  { term:'Limpa', def:'Organ limfoid terbesar yang menyaring darah dan merupakan tempat respons imun terhadap antigen darah.' },
  { term:'Makrofag', def:'Sel fagosit besar yang berasal dari monosit; berperan dalam fagositosis dan penyajian antigen.' },
  { term:'MHC', def:'Major Histocompatibility Complex; protein permukaan sel yang mempresentasikan fragmen antigen ke limfosit T.' },
  { term:'Monosit', def:'Sel darah putih yang bermigrasi ke jaringan dan berubah menjadi makrofag.' },
  { term:'Neutrofil', def:'Sel darah putih terbanyak; fagosit yang merupakan pertahanan pertama melawan infeksi bakteri.' },
  { term:'Opsonisasi', def:'Proses pelapisan patogen dengan antibodi atau komplemen untuk memudahkan fagositosis.' },
  { term:'Patogen', def:'Organisme atau agen penyebab penyakit seperti bakteri, virus, jamur, atau parasit.' },
  { term:'Sel B', def:'Limfosit yang diproduksi di sumsum tulang; menghasilkan antibodi sebagai respons imun humoral.' },
  { term:'Sel NK', def:'Natural Killer cell; limfosit bawaan yang membunuh sel tumor dan sel terinfeksi virus.' },
  { term:'Sel T', def:'Limfosit yang dimatangkan di timus; berperan dalam imunitas seluler dan regulasi respons imun.' },
  { term:'Sitokin', def:'Protein pembawa pesan yang digunakan sel imun untuk berkomunikasi dan mengkoordinasikan respons imun.' },
  { term:'Timus', def:'Kelenjar di dada tempat Sel T diproduksi dan dimatangkan menjadi sel T yang kompeten.' },
  { term:'Vaksin', def:'Preparat biologis yang memberikan imunitas aktif buatan terhadap penyakit tertentu.' },
];

function initGlosarium() {
  const af = document.getElementById('alpha-filter');
  if (!af || af.children.length > 0) return;
  const alphas = [...new Set(GLOSARIUM_DATA.map(g => g.term[0].toUpperCase()))].sort();
  af.innerHTML = `<button class="alpha-btn active" onclick="filterAlpha(this,'all')">All</button>` +
    alphas.map(a => `<button class="alpha-btn" onclick="filterAlpha(this,'${a}')">${a}</button>`).join('');
  renderGlosarium(GLOSARIUM_DATA);
}

function renderGlosarium(data) {
  const list = document.getElementById('glos-list');
  if (!list) return;
  list.innerHTML = data.length ? data.map(g => `
    <div class="glos-item">
      <div class="glos-term">${g.term}</div>
      <div class="glos-def">${g.def}</div>
    </div>`).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px">Istilah tidak ditemukan.</p>';
}

function filterAlpha(btn, letter) {
  document.querySelectorAll('.alpha-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = letter === 'all' ? GLOSARIUM_DATA : GLOSARIUM_DATA.filter(g => g.term[0].toUpperCase() === letter);
  renderGlosarium(filtered);
}

function filterGlosarium() {
  const q        = document.getElementById('glos-search-inp').value.toLowerCase();
  const filtered = GLOSARIUM_DATA.filter(g => g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q));
  renderGlosarium(filtered);
}

/* ========================= RUJUKAN ========================= */
const RUJUKAN_DATA = [
  { type:'book',    title:'Biologi untuk SMA/MA Kelas XI',              author:'Irnaningtyas',                  year:'2023', penerbit:'Erlangga, Jakarta',             note:'Kurikulum Merdeka' },
  { type:'book',    title:'Campbell Biology (12th Edition)',             author:'Reece, J.B., Urry, L.A., et al.',year:'2021', penerbit:'Pearson Education, New York',   note:'International Reference' },
  { type:'book',    title:'Immunology: A Short Course (8th Edition)',    author:'Coico, R. & Sunshine, G.',      year:'2015', penerbit:'Wiley-Blackwell',                note:'Standard Immunology Text' },
  { type:'article', title:'Innate Immune Evasion by SARS-CoV-2',        author:'Voss, M. et al.',               year:'2023', penerbit:'Nature Immunology, Vol. 24',     note:'Peer-reviewed journal' },
  { type:'article', title:'Dengue Virus Immune Evasion Mechanisms',     author:'Guzman, M.G. et al.',           year:'2022', penerbit:'PLoS Pathogens, 18(3)',          note:'Open access' },
  { type:'article', title:'Advances in Vaccine Development',            author:'Pollard, A.J. & Bijker, E.M.',  year:'2021', penerbit:'Nature Reviews Immunology, 21',  note:'Peer-reviewed' },
  { type:'web',     title:'Sistem Imun – Tinjauan Klinis',              author:'Kementerian Kesehatan RI',      year:'2024', penerbit:'kemkes.go.id',                   note:'Sumber resmi pemerintah' },
  { type:'web',     title:'Immunology Overview',                        author:'NIAID',                         year:'2024', penerbit:'niaid.nih.gov',                  note:'US Government' },
];

function initRujukan() {
  const list = document.getElementById('rujukan-list');
  if (!list || list.children.length > 0) return;
  const icons   = { book:'📚', article:'📄', web:'🌐' };
  const classes = { book:'ri-book', article:'ri-article', web:'ri-web' };
  list.innerHTML = RUJUKAN_DATA.map((r,i) => `
    <div class="ref-item animate-in" style="animation-delay:${i*0.06}s">
      <div class="ref-icon ${classes[r.type]}">${icons[r.type]}</div>
      <div>
        <div class="ref-title">${r.title}</div>
        <div class="ref-author">${r.author}</div>
        <div class="ref-author" style="margin-top:2px">${r.penerbit}</div>
        <div class="ref-year">${r.year} · ${r.note}</div>
      </div>
    </div>`).join('');
}

/* ========================= MODAL ========================= */
function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = body;
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
document.addEventListener('DOMContentLoaded', () => {
  const mo = document.getElementById('modal');
  if (mo) mo.addEventListener('click', function(e) { if (e.target === this) closeModal(); });
});

/* ========================= TOAST ========================= */
let toastTimer;
function showToast(msg, type = 'success') {
  const t      = document.getElementById('toast');
  const icons  = { success:'✅', error:'❌', info:'ℹ️' };
  t.innerHTML  = `<span style="font-size:1.1rem">${icons[type]||'✅'}</span> ${msg}`;
  t.className  = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer   = setTimeout(() => t.classList.remove('show'), 3200);
}