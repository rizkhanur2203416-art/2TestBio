/* ================================================================
   BIOIMUN E-MODULE — GOOGLE APPS SCRIPT BACKEND
   ================================================================
   Cara deploy:
   1. Buka script.google.com → New Project → tempel kode ini
   2. Klik Deploy → New deployment → Web app
   3. Execute as: Me | Who has access: Anyone
   4. Copy URL deployment → paste ke SHEET_URL di sync.js
   ================================================================ */

// ── KONFIGURASI ──────────────────────────────────────────────────
const SPREADSHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_KAMU';
// Cara dapat ID: buka Google Sheet → lihat URL
// https://docs.google.com/spreadsheets/d/[ID_ADA_DISINI]/edit

// Nama setiap sheet (tab)
const SHEETS = {
  LOGIN       : 'Log_Login',
  PROGRESS    : 'Progress_Belajar',
  KUIS        : 'Hasil_Kuis',
  DRILL       : 'Hasil_Drill',
  LKPD        : 'Progress_LKPD',
  PRETEST     : 'Jawaban_PreTest',
  POSTTEST    : 'Jawaban_PostTest',
  ANGKET      : 'Angket_Ownership',
  REFLEKTIF   : 'Esai_Reflektif',
  REKAP       : 'Rekap_Siswa',
};

// ── ENTRY POINT — semua request masuk sini ────────────────────────
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch (action) {
      case 'login':       result = recordLogin(data);      break;
      case 'progress':    result = recordProgress(data);   break;
      case 'kuis':        result = recordKuis(data);       break;
      case 'drill':       result = recordDrill(data);      break;
      case 'lkpd':        result = recordLKPD(data);       break;
      case 'pretest':     result = recordTest(data, 'pretest');  break;
      case 'posttest':    result = recordTest(data, 'posttest'); break;
      case 'angket':      result = recordAngket(data);     break;
      case 'reflektif':   result = recordReflektif(data);  break;
      default:            result = { status:'error', msg:'Unknown action: ' + action };
    }

    updateRekap(data.username || '');
    return buildResponse(result);

  } catch (err) {
    return buildResponse({ status: 'error', msg: err.toString() });
  }
}

// Untuk test GET (cek apakah web app aktif)
function doGet(e) {
  return buildResponse({ status:'ok', msg:'BioImun API aktif ✅', time: new Date().toISOString() });
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPER: ambil atau buat sheet ────────────────────────────────
function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function now() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

// ── INISIALISASI HEADER semua sheet ──────────────────────────────
function initAllSheets() {
  const headers = {
    [SHEETS.LOGIN]:    ['Timestamp','Username','Nama','Role','Kelas','IP_Kira2'],
    [SHEETS.PROGRESS]: ['Timestamp','Username','Nama','Materi1','Materi2','Materi3','Materi4','Materi5',
                        'Kuis1Lulus','Kuis2Lulus','Kuis3Lulus','Kuis4Lulus','Kuis5Lulus',
                        'Skor_Kuis1','Skor_Kuis2','Skor_Kuis3','Skor_Kuis4','Skor_Kuis5',
                        'XP','DrillBest%','Total_Materi_Selesai','Total_Kuis_Lulus','Persen_Progress'],
    [SHEETS.KUIS]:     ['Timestamp','Username','Nama','Materi_Ke','Judul_Materi','Skor','Lulus_YN','Percobaan_Ke'],
    [SHEETS.DRILL]:    ['Timestamp','Username','Nama','Jumlah_Soal','Skor','Persen','Status'],
    [SHEETS.LKPD]:     ['Timestamp','Username','Nama','Kelompok','Tahap','Nama_Tahap','Status'],
    [SHEETS.PRETEST]:  ['Timestamp','Username','Nama','Soal1','Soal2','Soal3','Soal4','Soal5','Status'],
    [SHEETS.POSTTEST]: ['Timestamp','Username','Nama','Soal1','Soal2','Soal3','Soal4','Soal5','Status'],
    [SHEETS.ANGKET]:   ['Timestamp','Username','Nama','Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','Q9','Q10','Q11','Q12','Q13','Q14','Q15',
                        'Total_Skor','Persen','Dimensi_TJ','Dimensi_Motivasi','Dimensi_Mandiri','Dimensi_Terlibat','Dimensi_Refleksi','Kategori'],
    [SHEETS.REFLEKTIF]:['Timestamp','Username','Nama','Esai1_TanggungJawab','Esai2_Motivasi','Esai3_Pemahaman','Esai4_Tantangan','Esai5_Penerapan','Status'],
    [SHEETS.REKAP]:    ['Terakhir_Update','Username','Nama','Role','Total_Login','Progress%','Kuis_Lulus','XP',
                        'PreTest','PostTest','Angket_Skor','LKPD_Selesai','Drill_Best%','Status_Keseluruhan'],
  };

  Object.entries(headers).forEach(([name, hdr]) => {
    const sheet = getSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(hdr);
      sheet.getRange(1, 1, 1, hdr.length).setFontWeight('bold')
           .setBackground('#1a6b4a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
}

// ── 1. LOG LOGIN ─────────────────────────────────────────────────
function recordLogin(d) {
  const sheet = getSheet(SHEETS.LOGIN);
  if (sheet.getLastRow() === 0) initAllSheets();
  sheet.appendRow([now(), d.username, d.nama, d.role, d.kelas, '—']);
  return { status:'ok', msg:'Login tercatat' };
}

// ── 2. PROGRESS BELAJAR ──────────────────────────────────────────
function recordProgress(d) {
  const sheet  = getSheet(SHEETS.PROGRESS);
  const prog   = d.progress;
  const matDone = prog.materi.filter(Boolean).length;
  const kuisLulus = prog.kuisPassed.filter(Boolean).length;
  const pct    = Math.round(kuisLulus / 5 * 100);

  // Cari baris yang sudah ada untuk user ini, update jika ada
  const existing = findRow(sheet, d.username, 2);
  const row = [
    now(), d.username, d.nama,
    prog.materi[0]?'✅':'❌', prog.materi[1]?'✅':'❌', prog.materi[2]?'✅':'❌',
    prog.materi[3]?'✅':'❌', prog.materi[4]?'✅':'❌',
    prog.kuisPassed[0]?'✅':'❌', prog.kuisPassed[1]?'✅':'❌', prog.kuisPassed[2]?'✅':'❌',
    prog.kuisPassed[3]?'✅':'❌', prog.kuisPassed[4]?'✅':'❌',
    prog.kuisScore[0]??'—', prog.kuisScore[1]??'—', prog.kuisScore[2]??'—',
    prog.kuisScore[3]??'—', prog.kuisScore[4]??'—',
    prog.xp || 0,
    prog.drillBest !== null ? prog.drillBest + '%' : '—',
    matDone, kuisLulus, pct + '%',
  ];

  if (existing > 0) {
    sheet.getRange(existing, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { status:'ok', msg:'Progress disimpan' };
}

// ── 3. HASIL KUIS ────────────────────────────────────────────────
function recordKuis(d) {
  const sheet = getSheet(SHEETS.KUIS);
  const materiNames = [
    'Sistem Pertahanan Tubuh',
    'Pertahanan Nonspesifik',
    'Pertahanan Spesifik',
    'Jenis Imunitas',
    'Gangguan Sistem Imun'
  ];
  // Hitung percobaan ke berapa
  const data    = sheet.getDataRange().getValues();
  const attempt = data.filter(r => r[1] === d.username && r[3] == d.materiIdx + 1).length + 1;

  sheet.appendRow([
    now(), d.username, d.nama,
    d.materiIdx + 1,
    materiNames[d.materiIdx] || 'Materi ' + (d.materiIdx+1),
    d.skor + '/3',
    d.lulus ? '✅ LULUS' : '❌ Tidak Lulus',
    attempt,
  ]);
  return { status:'ok', msg:'Hasil kuis tercatat' };
}

// ── 4. HASIL DRILL ───────────────────────────────────────────────
function recordDrill(d) {
  const sheet = getSheet(SHEETS.DRILL);
  const pct   = Math.round(d.skor / d.jumlahSoal * 100);
  sheet.appendRow([
    now(), d.username, d.nama,
    d.jumlahSoal, d.skor + '/' + d.jumlahSoal, pct + '%',
    pct >= 80 ? '🌟 Sangat Baik' : pct >= 60 ? '👍 Baik' : '📚 Perlu Latihan',
  ]);
  return { status:'ok', msg:'Hasil drill tercatat' };
}

// ── 5. PROGRESS LKPD ────────────────────────────────────────────
function recordLKPD(d) {
  const sheet = getSheet(SHEETS.LKPD);
  const namaStage = ['Orientasi Masalah','Organisasi Belajar','Penyelidikan','Penyajian Hasil','Evaluasi'];
  sheet.appendRow([
    now(), d.username, d.nama,
    'Kelompok ' + d.kelompok,
    d.tahap + 1,
    namaStage[d.tahap] || 'Tahap ' + (d.tahap+1),
    '✅ Selesai',
  ]);
  return { status:'ok', msg:'Progress LKPD tercatat' };
}

// ── 6. PRE-TEST & POST-TEST ──────────────────────────────────────
function recordTest(d, type) {
  const sheetName = type === 'pretest' ? SHEETS.PRETEST : SHEETS.POSTTEST;
  const sheet     = getSheet(sheetName);

  // Update jika sudah ada, append jika belum
  const existing = findRow(sheet, d.username, 2);
  const row = [
    now(), d.username, d.nama,
    d.jawaban[0] || '—', d.jawaban[1] || '—', d.jawaban[2] || '—',
    d.jawaban[3] || '—', d.jawaban[4] || '—',
    '✅ Dikumpulkan',
  ];

  if (existing > 0) {
    sheet.getRange(existing, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { status:'ok', msg: type + ' tercatat' };
}

// ── 7. ANGKET OWNERSHIP OF LEARNING ─────────────────────────────
function recordAngket(d) {
  const sheet = getSheet(SHEETS.ANGKET);
  const answers = d.answers; // array 15 nilai (1-5)
  const total   = answers.reduce((s, v) => s + v, 0);
  const pct     = Math.round(total / (15 * 5) * 100);

  // Dimensi (tiap 3 item)
  const dimTJ  = answers.slice(0,3).reduce((s,v)=>s+v,0);
  const dimMot = answers.slice(3,6).reduce((s,v)=>s+v,0);
  const dimMan = answers.slice(6,9).reduce((s,v)=>s+v,0);
  const dimTer = answers.slice(9,12).reduce((s,v)=>s+v,0);
  const dimRef = answers.slice(12,15).reduce((s,v)=>s+v,0);
  const kategori = pct>=80?'🌟 Sangat Tinggi':pct>=65?'👍 Tinggi':pct>=50?'📚 Cukup':'💪 Rendah';

  const existing = findRow(sheet, d.username, 2);
  const row = [
    now(), d.username, d.nama,
    ...answers,
    total, pct + '%',
    dimTJ + '/15', dimMot + '/15', dimMan + '/15', dimTer + '/15', dimRef + '/15',
    kategori,
  ];

  if (existing > 0) {
    sheet.getRange(existing, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { status:'ok', msg:'Angket tercatat', skor: total, pct };
}

// ── 8. ESAI REFLEKTIF ────────────────────────────────────────────
function recordReflektif(d) {
  const sheet = getSheet(SHEETS.REFLEKTIF);
  const existing = findRow(sheet, d.username, 2);
  const row = [
    now(), d.username, d.nama,
    d.esai[0] || '—', d.esai[1] || '—', d.esai[2] || '—',
    d.esai[3] || '—', d.esai[4] || '—',
    '✅ Dikumpulkan',
  ];

  if (existing > 0) {
    sheet.getRange(existing, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { status:'ok', msg:'Esai reflektif tercatat' };
}

// ── 9. REKAP SISWA (auto-update) ─────────────────────────────────
function updateRekap(username) {
  if (!username) return;
  const sheet  = getSheet(SHEETS.REKAP);
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Kumpulkan data dari semua sheet
  function getLatestRow(sheetName, usernameCol) {
    const s = ss.getSheetByName(sheetName);
    if (!s || s.getLastRow() < 2) return null;
    const data = s.getDataRange().getValues();
    // cari baris terakhir untuk username ini
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][usernameCol - 1]) === username) return data[i];
    }
    return null;
  }

  const progRow     = getLatestRow(SHEETS.PROGRESS, 2);
  const angketRow   = getLatestRow(SHEETS.ANGKET, 2);
  const pretestRow  = getLatestRow(SHEETS.PRETEST, 2);
  const posttestRow = getLatestRow(SHEETS.POSTTEST, 2);

  // Hitung login count
  const loginSheet = ss.getSheetByName(SHEETS.LOGIN);
  let loginCount = 0;
  if (loginSheet && loginSheet.getLastRow() > 1) {
    loginSheet.getDataRange().getValues().slice(1).forEach(r => { if (r[1] === username) loginCount++; });
  }

  // LKPD selesai
  const lkpdSheet = ss.getSheetByName(SHEETS.LKPD);
  let lkpdCount = 0;
  if (lkpdSheet && lkpdSheet.getLastRow() > 1) {
    const seenKelompok = new Set();
    lkpdSheet.getDataRange().getValues().slice(1).forEach(r => {
      if (r[1] === username && r[5] === 'Evaluasi') seenKelompok.add(r[3]);
    });
    lkpdCount = seenKelompok.size;
  }

  const progPct   = progRow   ? progRow[22]  : '0%';
  const kuisLulus = progRow   ? progRow[20]  : 0;
  const xp        = progRow   ? progRow[18]  : 0;
  const drillBest = progRow   ? progRow[19]  : '—';
  const nama      = progRow   ? progRow[2]   : username;
  const angketSkor= angketRow ? angketRow[18]: '—';
  const hasPretest  = pretestRow  ? '✅' : '❌';
  const hasPosttest = posttestRow ? '✅' : '❌';

  const parseInt_safe = (v) => { const n = parseInt(String(v)); return isNaN(n) ? 0 : n; };
  const progNum = parseInt_safe(String(progPct));
  const status  = progNum === 100 && hasPretest==='✅' && hasPosttest==='✅'
                ? '🎓 Selesai'
                : progNum >= 50
                ? '📚 Sedang Belajar'
                : '🆕 Baru Mulai';

  const existing = findRow(sheet, username, 2);
  const row = [
    now(), username, nama, progRow ? (progRow[3] || '—') : '—',
    loginCount, progPct, kuisLulus, xp,
    hasPretest, hasPosttest, angketSkor,
    lkpdCount + ' kelompok', drillBest, status,
  ];

  if (existing > 0) {
    sheet.getRange(existing, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

// ── UTILITY: cari baris berdasarkan username ──────────────────────
function findRow(sheet, username, col) {
  if (sheet.getLastRow() < 2) return -1;
  const vals = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(username)) return i + 2;
  }
  return -1;
}

// ── AUTO-FORMAT: jalankan sekali untuk setup sheet ───────────────
function setupSheets() {
  initAllSheets();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Auto-resize semua kolom di semua sheet
  Object.values(SHEETS).forEach(name => {
    const s = ss.getSheetByName(name);
    if (s) {
      s.autoResizeColumns(1, s.getLastColumn() || 1);
      // Freeze header
      if (s.getFrozenRows() === 0) s.setFrozenRows(1);
    }
  });
  Logger.log('Setup selesai! Semua sheet sudah siap.');
}
