/**
 * =====================================================================
 *  ABSENSI ONLINE PENGAJIAN — Google Apps Script  (v1.0)
 * =====================================================================
 *  Fitur
 *   - Web app petugas di HP: tandai Hadir / Izin, cari nama, scan QR
 *     (kamera live -> fallback foto -> ketik/scan ID -> cari nama)
 *   - Petugas Pria & Wanita bisa mengisi bersamaan (dikunci per bagian)
 *   - Sesi dibuat otomatis di hari pengajian & ditutup otomatis H+1:
 *     jamaah yang tidak tercatat => "Alpa", jamaah berstatus
 *     "Dikecualikan" => tidak dihitung dalam persentase
 *   - Dashboard di tab "Dashboard": pilih Bulan Awal–Akhir & Jenis Kelamin
 *   - Ambang kategori & aturan izin bisa diatur di tab "Pengaturan"
 *
 *  PEMASANGAN SINGKAT (detail di PANDUAN.md) — pasang di file Google Sheet BARU
 *  (mis. "ABSENSI BBK02"). Data jamaah DIBACA dari file "SENSUS BBK02 Dashboard"
 *  tab "Jamaah" (single source of truth) — file sensus tidak diubah.
 *   1. Buat Google Sheet baru -> Ekstensi -> Apps Script.
 *   2. Tempel file ini ke Code.gs. Buat file HTML bernama "Index",
 *      tempel isi Index.html. Simpan.
 *   3. Muat ulang Sheet -> menu "Absensi" -> "1. Setup awal".
 *   4. Menu "2. Cek data Jamaah" (dibaca dari tab Jamaah, kolom Flag Absen).
 *   5. Ganti PIN di tab Petugas.
 *   6. Deploy -> Deployment baru -> Aplikasi web
 *      (Jalankan sebagai: Saya, Yang memiliki akses: Siapa saja).
 *   7. Menu "3. Pasang otomatisasi".
 * =====================================================================
 */

// ---------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------
const SH = {
  SET: 'Pengaturan',
  MASTER: 'Jamaah',          // tab data jamaah = single source of truth (tidak diubah oleh script)
  PETUGAS: 'Petugas',
  SESI: 'Sesi',
  ABSEN: 'Absensi',
  DASH: 'Dashboard_Absensi',
};
const ST = { H: 'Hadir', I: 'Izin', A: 'Alpa', X: 'Dikecualikan' };
const SESI_BUKA = 'Terbuka';
const SESI_TUTUP = 'Ditutup';

const HDR = {
  // template hanya dipakai jika tab Jamaah belum ada (format mengikuti data sensus)
  MASTER: ['ID Jamaah', 'ID Keluarga', 'Hubungan Keluarga', 'Nama Lengkap', 'Nama Absen', 'Jenis Kelamin', 'Tahun Lahir',
    'Status Nikah', 'Status Keaktifan', 'Flag Absen', 'Status Keberadaan', 'Catatan'],
  PETUGAS: ['Nama', 'PIN', 'Bagian', 'Peran', 'Aktif'],
  SESI: ['ID_Sesi', 'Tanggal', 'Hari', 'Keterangan', 'Status', 'Dibuka Oleh', 'Waktu Dibuka', 'Waktu Ditutup'],
  ABSEN: ['Key', 'ID_Sesi', 'Tanggal', 'ID_Jamaah', 'Nama', 'JK', 'Status', 'Metode', 'Petugas', 'Waktu'],
};
// indeks kolom tab Absensi (0-based)
const AX = { KEY: 0, SESI: 1, TGL: 2, ID: 3, NAMA: 4, JK: 5, STATUS: 6, METODE: 7, PETUGAS: 8, WAKTU: 9 };

// Naikkan angka ini setiap kali Code.gs diubah. Web app akan memperingatkan jika server masih versi lama
// (artinya lupa: Deploy -> Kelola deployment -> Edit -> Versi baru).
const VERSI_SERVER = 7;

const SENSUS_ID_DEFAULT = '1jgTL5COMzaDnvnnOTL_0DhQOlycHFaSS7HavLhR7IW0'; // file "SENSUS BBK02 Dashboard"

const DEFAULT_SET = [
  ['Nama Kelompok', 'BBK02', 'Ditampilkan di web app, kartu QR & dashboard'],
  ['Hari Pengajian', 'Senin, Jumat', 'Pisahkan dengan koma. Sesi dibuat otomatis pada hari-hari ini'],
  ['File Data Jamaah', SENSUS_ID_DEFAULT, 'ID atau link file Google Sheet sensus (sumber data jamaah, hanya dibaca). Kosongkan jika tab Jamaah ada di file ini'],
  ['Nama Tab Jamaah', 'Jamaah', 'Nama tab data jamaah di file sensus'],
  ['Ambang Kurang (%)', 50, 'Kehadiran di bawah angka ini = "Kurang"'],
  ['Ambang Perhatian (%)', 75, 'Di bawah angka ini (tapi >= ambang kurang) = "Perlu Perhatian"'],
  ['Izin Dihitung Hadir', 'TIDAK', 'TIDAK = izin tercatat & dihitung sebagai sesi wajib (mengurangi %). YA = izin dianggap hadir'],
];

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Nama kolom tab Jamaah yang dikenali (huruf kecil, urutan = prioritas). Urutan kolom di sheet bebas.
const MASTER_ALIAS = {
  id: ['id jamaah', 'id', 'id_jamaah', 'kode jamaah', 'kode'],
  nama: ['nama absen', 'nama panggilan', 'nama', 'nama jamaah', 'nama lengkap'],   // nama yang tampil di absensi
  lengkap: ['nama lengkap', 'nama'],
  jk: ['jenis kelamin', 'jk', 'l/p', 'gender', 'kelamin'],
  flag: ['flag absen', 'wajib absen', 'flag'],                 // Y = wajib absen (dihitung), N = tidak
  keberadaan: ['status keberadaan', 'keberadaan'],
  status: ['status', 'status jamaah'],                          // cadangan jika tidak ada kolom Flag Absen
  gabung: ['tgl gabung', 'tanggal gabung', 'tanggal masuk', 'tgl masuk'],
};

// ---------------------------------------------------------------------
// Utilitas umum
// ---------------------------------------------------------------------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone() || 'Asia/Jakarta'; }
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" belum ada. Jalankan menu Absensi -> 1. Setup awal.');
  return sh;
}
function fmt_(d, pattern) { return Utilities.formatDate(d, tz_(), pattern); }
function todayStr_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function pad2_(n) { return String(n).padStart(2, '0'); }

/** Nilai sel tanggal -> 'yyyy-MM-dd' ('' jika tidak valid). */
function toDateStr_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : fmt_(v, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // dd/mm/yyyy
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return '';
}
/** 'yyyy-MM-dd' -> nama hari (tanpa masalah zona waktu). */
function hariDari_(dateStr) {
  const p = dateStr.split('-').map(Number);
  return HARI[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
}
function labelBulan_(ym) { const p = ym.split('-'); return BULAN[Number(p[1]) - 1] + ' ' + p[0]; }
function labelTgl_(dateStr, denganTahun) {
  const p = dateStr.split('-');
  return Number(p[2]) + ' ' + BULAN[Number(p[1]) - 1] + (denganTahun ? ' ' + p[0].slice(2) : '');
}
/** 'Nov 2026' | '2026-11' | Date -> '2026-11' */
function parseBulan_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : fmt_(v, 'yyyy-MM');
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]);
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const i = BULAN.findIndex(b => b.toLowerCase() === m[1].slice(0, 3).toLowerCase());
    if (i >= 0) return m[2] + '-' + pad2_(i + 1);
  }
  return '';
}
function normJK_(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return '';
  if (/^(l|lk|laki|pria|ikhwan|putra|male)/.test(s)) return 'L';
  if (/^(p|pr|perempuan|wanita|akhwat|putri|female)/.test(s)) return 'P';
  return '';
}
function normStatusJamaah_(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s || s === 'aktif') return 'Aktif';
  if (/kecual|udzur|uzur|exclude/.test(s)) return 'Dikecualikan';
  if (/non|tidak aktif|keluar|pindah|wafat|meninggal/.test(s)) return 'Nonaktif';
  return 'Aktif';
}
function headerMap_(headers, alias) {
  const norm = headers.map(h => String(h == null ? '' : h).trim().toLowerCase().replace(/\s+/g, ' '));
  const map = {};
  Object.keys(alias).forEach(k => {
    map[k] = -1;
    for (let i = 0; i < alias[k].length && map[k] < 0; i++) map[k] = norm.indexOf(alias[k][i]);
  });
  return map;
}
function isYa_(v) { return /^(y|ya|yes|1|true|wajib)$/i.test(String(v == null ? '' : v).trim()); }
function indexBy_(arr, key) { const o = {}; arr.forEach(x => { if (x[key]) o[x[key]] = x; }); return o; }

let LOCK_HELD_ = false;
function withLock_(fn) {
  if (LOCK_HELD_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('Server sedang sibuk, coba lagi sebentar.');
  LOCK_HELD_ = true;
  try { return fn(); } finally { LOCK_HELD_ = false; lock.releaseLock(); }
}

// ---------------------------------------------------------------------
// Pengaturan, Master, Petugas
// ---------------------------------------------------------------------
function getSettings_() {
  const sh = ss_().getSheetByName(SH.SET);
  const map = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { map[String(r[0]).trim()] = r[1]; });
  }
  const num = (v, d) => {
    if (v === '' || v == null) return d;
    const n = Number(String(v).replace('%', '').replace(',', '.'));
    return isFinite(n) ? n : d;
  };
  let kurang = num(map['Ambang Kurang (%)'], 50);
  let perhatian = num(map['Ambang Perhatian (%)'], 75);
  if (kurang > 0 && kurang <= 1) kurang *= 100;          // jika sel diformat persen
  if (perhatian > 0 && perhatian <= 1) perhatian *= 100;
  if (perhatian < kurang) perhatian = kurang;
  return {
    namaKelompok: String(map['Nama Kelompok'] || 'Pengajian'),
    hari: String(map['Hari Pengajian'] || '').split(/[,;]/)
      .map(s => s.trim().toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean),
    ambangKurang: kurang,
    ambangPerhatian: perhatian,
    izinHadir: /^(ya|y|yes|true|1)$/i.test(String(map['Izin Dihitung Hadir'] || '').trim()),
    fileJamaah: idDariLink_(map.hasOwnProperty('File Data Jamaah') ? map['File Data Jamaah'] : SENSUS_ID_DEFAULT),
    tabJamaah: String(map['Nama Tab Jamaah'] || SH.MASTER).trim(),
  };
}

function idDariLink_(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : s;
}

/** Tab Jamaah: dari file sensus (Pengaturan "File Data Jamaah") atau dari file ini. Hanya dibaca. */
function masterSheet_() {
  const set = getSettings_();
  let sh;
  if (set.fileJamaah && set.fileJamaah !== ss_().getId()) {
    let file;
    try { file = SpreadsheetApp.openById(set.fileJamaah); }
    catch (e) { throw new Error('File data jamaah tidak bisa dibuka (cek ID/link & izin akses): ' + e.message); }
    sh = file.getSheetByName(set.tabJamaah);
    if (!sh) throw new Error('Tab "' + set.tabJamaah + '" tidak ada di file ' + file.getName());
  } else {
    sh = ss_().getSheetByName(set.tabJamaah) || ss_().getSheetByName(SH.MASTER);
    if (!sh) throw new Error('Tab "' + set.tabJamaah + '" tidak ditemukan. Isi "File Data Jamaah" di tab Pengaturan.');
  }
  return sh;
}

const MASTER_CACHE_KEY = 'master_v2';
/** Data jamaah (di-cache 5 menit agar scan cepat). Menu "Muat ulang data Jamaah" menghapus cache. */
function getMaster_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get(MASTER_CACHE_KEY);
  if (c) { try { return JSON.parse(c); } catch (e) { /* lanjut baca ulang */ } }
  const out = bacaMaster_();
  try { cache.put(MASTER_CACHE_KEY, JSON.stringify(out), 300); } catch (e) { /* data terlalu besar: tanpa cache */ }
  return out;
}
function hapusCacheMaster_() { CacheService.getScriptCache().remove(MASTER_CACHE_KEY); }

function bacaMaster_() {
  const sh = masterSheet_();
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return [];
  const data = sh.getRange(1, 1, lr, lc).getValues();
  const m = headerMap_(data[0], MASTER_ALIAS);
  if (m.nama < 0) throw new Error('Kolom "Nama Absen"/"Nama Lengkap" tidak ditemukan di tab ' + sh.getName());
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const nama = String(r[m.nama] == null ? '' : r[m.nama]).trim();
    if (!nama) continue;
    // Flag Absen Y = wajib absen (Aktif). N = tidak wajib (tidak muncul & tidak dihitung).
    let status = 'Aktif';
    if (m.flag >= 0) status = isYa_(r[m.flag]) ? 'Aktif' : 'Nonaktif';
    else if (m.status >= 0) status = normStatusJamaah_(r[m.status]);
    out.push({
      row: i + 1,
      id: m.id >= 0 ? String(r[m.id] || '').trim().toUpperCase() : '',
      nama: nama,
      lengkap: m.lengkap >= 0 ? String(r[m.lengkap] || '').trim() : nama,
      jk: m.jk >= 0 ? normJK_(r[m.jk]) : '',
      ket: m.keberadaan >= 0 ? String(r[m.keberadaan] || '').trim() : '',
      status: status,
      gabung: m.gabung >= 0 ? toDateStr_(r[m.gabung]) : '',
    });
  }
  return out;
}

/** Validasi struktur tab Jamaah TANPA mengubah isinya. Mengembalikan peta kolom. */
function cekKolomMaster_(sh) {
  const headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const m = headerMap_(headers, MASTER_ALIAS);
  const kurang = [];
  if (m.id < 0) kurang.push('ID Jamaah');
  if (m.nama < 0) kurang.push('Nama Absen / Nama Lengkap');
  if (m.jk < 0) kurang.push('Jenis Kelamin');
  if (m.flag < 0) kurang.push('Flag Absen');
  if (kurang.length) throw new Error('Kolom berikut tidak ditemukan di baris 1 tab ' + sh.getName() + ': ' + kurang.join(', '));
  return m;
}

function getPetugasByPin_(pin) {
  pin = String(pin == null ? '' : pin).trim();
  if (!pin) throw new Error('PIN wajib diisi');
  const sh = sheet_(SH.PETUGAS);
  const lr = sh.getLastRow();
  if (lr < 2) throw new Error('Belum ada petugas terdaftar');
  const rows = sh.getRange(2, 1, lr - 1, 5).getDisplayValues();
  const cocok = rows.filter(r => String(r[1]).trim() === pin && !/^(tidak|no|n|false)$/i.test(String(r[4]).trim()));
  if (!cocok.length) throw new Error('PIN salah atau petugas tidak aktif');
  if (cocok.length > 1) {
    throw new Error('PIN ini dipakai ' + cocok.length + ' petugas (' + cocok.map(r => r[0]).join(', ') +
      '). Admin: buat PIN berbeda untuk tiap petugas di tab Petugas.');
  }
  const r = cocok[0];
  return { nama: String(r[0] || 'Petugas').trim(), bagian: normJK_(r[2]) || 'Semua', admin: /admin/i.test(r[3]) };
}

/** Autentikasi PIN + pembatas percobaan (30 gagal / 10 menit). */
function auth_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fail') || 0);
  if (fails >= 30) throw new Error('Terlalu banyak percobaan PIN salah. Coba lagi 10 menit lagi.');
  try {
    return getPetugasByPin_(pin);
  } catch (e) {
    cache.put('pin_fail', String(fails + 1), 600);
    throw e;
  }
}

// ---------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------
function getSesiList_() {
  const sh = sheet_(SH.SESI);
  const lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, 8).getValues().map((r, i) => ({
    row: i + 2,
    id: String(r[0]).trim(),
    tanggal: toDateStr_(r[1]),
    hari: String(r[2] || ''),
    ket: String(r[3] || ''),
    status: String(r[4]).trim() || SESI_BUKA,
  })).filter(s => s.id && s.tanggal);
}

function sesiDto_(s) {
  return { id: s.id, tanggal: s.tanggal, hari: s.hari || hariDari_(s.tanggal), ket: s.ket, status: s.status };
}

/** Buka sesi untuk tanggal tertentu (1 sesi per hari). Mengembalikan sesi yang sudah ada jika ada. */
function bukaSesi_(tanggal, ket, oleh) {
  const id = 'S' + tanggal.replace(/-/g, '');
  const ada = getSesiList_().find(s => s.id === id);
  if (ada) return ada;
  const sh = sheet_(SH.SESI);
  const row = [id, tanggal, hariDari_(tanggal), ket || 'Pengajian rutin', SESI_BUKA, oleh || '', new Date(), ''];
  sh.appendRow(row);
  return { row: sh.getLastRow(), id: id, tanggal: tanggal, hari: row[2], ket: row[3], status: SESI_BUKA };
}

/**
 * Tutup sesi: jamaah aktif yang tidak tercatat -> Alpa,
 * jamaah Dikecualikan (selain yang Hadir) -> Dikecualikan.
 */
function tutupSesi_(sesi) {
  const sh = sheet_(SH.ABSEN);
  const master = getMaster_();
  const byId = indexBy_(master, 'id');
  const data = readAbsen_();
  const ada = {};
  let minI = -1, maxI = -1;
  data.forEach((r, i) => {
    if (String(r[AX.SESI]) === sesi.id) {
      ada[String(r[AX.ID]).trim().toUpperCase()] = i;
      if (minI < 0) minI = i;
      maxI = i;
    }
  });

  let nAlpa = 0, nKecuali = 0;
  // 1) rapikan baris yang sudah ada (status kosong / jamaah dikecualikan)
  if (minI >= 0) {
    const block = data.slice(minI, maxI + 1).map(r => [r[AX.STATUS], r[AX.METODE]]);
    let changed = false;
    Object.keys(ada).forEach(id => {
      const i = ada[id], j = byId[id];
      const cur = String(data[i][AX.STATUS] || '').trim();
      let st = cur;
      if (j && j.status === 'Dikecualikan' && cur !== ST.H) st = ST.X;
      else if (!cur) st = ST.A;
      if (st !== cur) {
        block[i - minI] = [st, 'Otomatis'];
        changed = true;
      }
    });
    if (changed) sh.getRange(minI + 2, AX.STATUS + 1, block.length, 2).setValues(block);
  }
  // 2) tambahkan jamaah yang belum tercatat
  const now = new Date();
  const appends = [];
  master.forEach(j => {
    if (!j.id || !j.jk || j.status === 'Nonaktif' || ada[j.id] !== undefined) return;
    if (j.gabung && j.gabung > sesi.tanggal) return; // belum bergabung saat sesi
    const st = j.status === 'Dikecualikan' ? ST.X : ST.A;
    if (st === ST.A) nAlpa++; else nKecuali++;
    appends.push([sesi.id + '|' + j.id, sesi.id, sesi.tanggal, j.id, j.nama, j.jk, st, 'Otomatis', 'Sistem', now]);
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  // 3) tandai sesi ditutup
  const ssh = sheet_(SH.SESI);
  ssh.getRange(sesi.row, 5).setValue(SESI_TUTUP);
  ssh.getRange(sesi.row, 8).setValue(now);
  hapusCacheAbsen_(sesi.id);
  return { alpa: nAlpa, dikecualikan: nKecuali };
}

/** Trigger harian (±05:00): buat sesi jika hari ini termasuk Hari Pengajian. */
function buatSesiOtomatis() {
  const set = getSettings_();
  const today = todayStr_();
  if (set.hari.indexOf(hariDari_(today).toLowerCase()) >= 0) {
    withLock_(() => bukaSesi_(today, 'Pengajian rutin', 'Otomatis'));
    refreshDashboard_();
  }
}

/** Trigger harian (±01:00): tutup semua sesi terbuka yang tanggalnya sudah lewat. */
function tutupSesiOtomatis() {
  return withLock_(() => {
    const today = todayStr_();
    let n = 0;
    getSesiList_().forEach(s => {
      if (s.status !== SESI_TUTUP && s.tanggal < today) { tutupSesi_(s); n++; }
    });
    refreshDashboard_();
    return n;
  });
}

// ---------------------------------------------------------------------
// Absensi
// ---------------------------------------------------------------------
function readAbsen_() {
  const sh = sheet_(SH.ABSEN);
  const lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, HDR.ABSEN.length).getValues();
}

// ---------------------------------------------------------------------
// Sinkron antar-HP: status absensi per sesi disimpan di cache (+ nomor versi).
// HP petugas cukup bertanya "versi masih sama?" setiap ±15 detik -> ringan & cepat.
// ---------------------------------------------------------------------
const ABSEN_CACHE_TTL = 120;   // detik; sesudahnya dibaca ulang dari sheet (menangkap edit manual di sheet)
function absenKey_(sesiId) { return 'absen_v1_' + sesiId; }
function bacaAbsenSesi_(sesiId) {
  const map = {};
  readAbsen_().forEach(r => {
    if (String(r[AX.SESI]) === sesiId) map[String(r[AX.ID]).trim().toUpperCase()] = String(r[AX.STATUS] || '');
  });
  return map;
}
function simpanCacheAbsen_(sesiId, o) {
  try { CacheService.getScriptCache().put(absenKey_(sesiId), JSON.stringify(o), ABSEN_CACHE_TTL); } catch (e) { /* tanpa cache */ }
}
/** {ver, absen:{ID: status}} — dari cache, atau dibaca ulang dari sheet (di dalam lock agar tidak bentrok dengan penyimpanan). */
function getAbsenSesi_(sesiId) {
  const raw = CacheService.getScriptCache().get(absenKey_(sesiId));
  if (raw) { try { return JSON.parse(raw); } catch (e) { /* baca ulang */ } }
  return withLock_(() => {
    const raw2 = CacheService.getScriptCache().get(absenKey_(sesiId));
    if (raw2) { try { return JSON.parse(raw2); } catch (e) { /* baca ulang */ } }
    const o = { ver: Date.now(), absen: bacaAbsenSesi_(sesiId) };
    simpanCacheAbsen_(sesiId, o);
    return o;
  });
}
function hapusCacheAbsen_(sesiId) { CacheService.getScriptCache().remove(absenKey_(sesiId)); }

/** changes: [{id, status: 'Hadir'|'Izin'|'' , metode: 'Scan QR'|'Foto QR'|'Ketik ID'|'Manual'}] */
const METODE_VALID = ['Scan QR', 'Foto QR', 'Ketik ID', 'Manual'];
function simpanAbsen_(sesi, changes, petugas) {
  const sh = sheet_(SH.ABSEN);
  const master = indexBy_(getMaster_(), 'id');
  const lr = sh.getLastRow();
  const keyRow = {};
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 1).getValues().forEach((r, i) => { if (r[0]) keyRow[String(r[0])] = i + 2; });

  // dedupe: perubahan terakhir per ID yang berlaku
  const perId = {};
  changes.forEach(c => { const id = String(c && c.id || '').trim().toUpperCase(); if (id) perId[id] = c; });

  const now = new Date();
  const appends = [];
  const ditolak = [];
  const tulis = {};   // id -> status yang benar-benar ditulis (untuk cache sinkron)
  let n = 0;
  Object.keys(perId).forEach(id => {
    const c = perId[id];
    const j = master[id];
    if (!j || j.status === 'Nonaktif') { ditolak.push(id); return; }
    if (petugas.bagian !== 'Semua' && j.jk !== petugas.bagian) { ditolak.push(id); return; }   // di luar hak akses
    let status = (c.status === ST.H || c.status === ST.I) ? c.status : '';
    if (!status && sesi.status === SESI_TUTUP) status = j.status === 'Dikecualikan' ? ST.X : ST.A; // koreksi admin
    const metode = c.metode === 'QR' ? 'Scan QR' : (METODE_VALID.indexOf(c.metode) >= 0 ? c.metode : 'Manual');
    const key = sesi.id + '|' + id;
    if (keyRow[key]) {
      sh.getRange(keyRow[key], AX.STATUS + 1, 1, 4).setValues([[status, metode, petugas.nama, now]]);
      tulis[id] = status;
      n++;
    } else if (status) {
      appends.push([key, sesi.id, sesi.tanggal, id, j.nama, j.jk, status, metode, petugas.nama, now]);
      tulis[id] = status;
      n++;
    }
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  // perbarui cache sinkron (masih di dalam lock)
  const raw = CacheService.getScriptCache().get(absenKey_(sesi.id));
  let snap = null;
  if (raw) { try { snap = JSON.parse(raw); } catch (e) { snap = null; } }
  if (snap) { Object.keys(tulis).forEach(id => { snap.absen[id] = tulis[id]; }); }
  else snap = { absen: bacaAbsenSesi_(sesi.id) };
  snap.ver = Math.max(Date.now(), (snap.ver || 0) + 1);
  simpanCacheAbsen_(sesi.id, snap);
  return { tersimpan: n, ditolak: ditolak, ver: snap.ver, absen: snap.absen };
}

// ---------------------------------------------------------------------
// API untuk web app (dipanggil via google.script.run.apiCall atau doPost)
// ---------------------------------------------------------------------
const API = {
  login: function (pin) {
    const p = auth_(pin);
    return { petugas: p, namaKelompok: getSettings_().namaKelompok, versiServer: VERSI_SERVER };
  },
  init: function (pin) {
    const p = auth_(pin);
    const list = getSesiList_().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 20).map(sesiDto_);
    return { petugas: p, today: todayStr_(), sesi: list, namaKelompok: getSettings_().namaKelompok };
  },
  bukaSesiHariIni: function (pin) {
    const p = auth_(pin);
    return sesiDto_(withLock_(() => bukaSesi_(todayStr_(), 'Pengajian rutin', p.nama)));
  },
  dataSesi: function (pin, sesiId) {
    const p = auth_(pin);
    const s = getSesiList_().find(x => x.id === sesiId);
    if (!s) throw new Error('Sesi tidak ditemukan');
    // Hak akses dari kolom "Bagian" di tab Petugas: Semua = pria & wanita, L = pria saja, P = wanita saja.
    const semua = getMaster_().filter(j => j.id && j.jk);
    const boleh = j => p.bagian === 'Semua' || j.jk === p.bagian;
    const jamaah = semua
      .filter(j => j.status !== 'Nonaktif' && boleh(j))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
      .map(j => ({ id: j.id, nama: j.nama, lengkap: j.lengkap, jk: j.jk, ket: j.ket, kecuali: j.status === 'Dikecualikan' }));
    // jamaah lain (Flag N / di luar bagian petugas) — hanya untuk menampilkan nama saat QR-nya di-scan
    const lain = semua.filter(j => j.status === 'Nonaktif' || !boleh(j))
      .map(j => ({ id: j.id, nama: j.nama, jk: j.jk, wajib: j.status !== 'Nonaktif' }));
    const snap = getAbsenSesi_(sesiId);
    return { sesi: sesiDto_(s), jamaah: jamaah, lain: lain, absen: snap.absen, ver: snap.ver };
  },
  simpan: function (pin, sesiId, changes) {
    const p = auth_(pin);
    if (!Array.isArray(changes) || !changes.length) return { tersimpan: 0, ditolak: [] };
    if (changes.length > 400) throw new Error('Terlalu banyak data dalam satu kali simpan');
    return withLock_(() => {
      const s = getSesiList_().find(x => x.id === sesiId);
      if (!s) throw new Error('Sesi tidak ditemukan');
      if (s.status === SESI_TUTUP && !p.admin) throw new Error('Sesi sudah ditutup. Hubungi admin untuk koreksi.');
      return simpanAbsen_(s, changes, p);
    });
  },
  /** Dipanggil tiap ±15 dtk oleh setiap HP. Hanya mengirim data jika versi berubah. */
  sinkron: function (pin, sesiId, verKlien) {
    auth_(pin);
    const s = getSesiList_().find(x => x.id === sesiId);
    if (!s) throw new Error('Sesi tidak ditemukan');
    const snap = getAbsenSesi_(sesiId);
    if (verKlien && snap.ver === verKlien) return { ver: snap.ver, sama: true, status: s.status };
    return { ver: snap.ver, absen: snap.absen, status: s.status };
  },
  tutupSesi: function (pin, sesiId) {
    const p = auth_(pin);
    if (!p.admin) throw new Error('Hanya admin yang bisa menutup sesi');
    return withLock_(() => {
      const s = getSesiList_().find(x => x.id === sesiId);
      if (!s) throw new Error('Sesi tidak ditemukan');
      const res = tutupSesi_(s);
      refreshDashboard_();
      return res;
    });
  },
  kartu: function (pin) {
    const p = auth_(pin);
    if (!p.admin) throw new Error('Hanya admin yang bisa mencetak kartu');
    return {
      namaKelompok: getSettings_().namaKelompok,
      jamaah: getMaster_().filter(j => j.id && j.status !== 'Nonaktif')
        .sort((a, b) => a.jk.localeCompare(b.jk) || a.nama.localeCompare(b.nama, 'id'))
        .map(j => ({ id: j.id, nama: j.nama, lengkap: j.lengkap, jk: j.jk })),
    };
  },
};

/** Satu pintu untuk semua panggilan dari web app. */
function apiCall(fn, args) {
  if (!Object.prototype.hasOwnProperty.call(API, fn)) throw new Error('Fungsi tidak dikenal: ' + fn);
  return API[fn].apply(null, Array.isArray(args) ? args : []);
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Absensi Pengajian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Endpoint JSON — dipakai jika Index.html di-hosting di luar Apps Script (mis. GitHub Pages). */
function doPost(e) {
  let out;
  try {
    const body = JSON.parse(e.postData.contents);
    out = { ok: true, data: apiCall(body.fn, body.args) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
/**
 * Hitung rekap (fungsi murni, tanpa akses Sheet).
 * sesiList: [{id, tanggal, hari, status}], absen: [{sesi, id, nama, jk, status}]
 * o: {awal:'yyyy-MM', akhir:'yyyy-MM', jk:'Semua'|'L'|'P', ambangKurang, ambangPerhatian, izinHadir}
 */
function hitungRekap_(sesiList, absen, o) {
  const sesiP = sesiList
    .filter(s => s.status === SESI_TUTUP && s.tanggal.slice(0, 7) >= o.awal && s.tanggal.slice(0, 7) <= o.akhir)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const nilai = st => (st === ST.H || (st === ST.I && o.izinHadir)) ? 1 : 0;
  const wajib = st => st === ST.X ? 0 : 1;

  const J = {}, S = {}, B = {};
  sesiP.forEach(s => {
    S[s.id] = { tanggal: s.tanggal, hari: s.hari || hariDari_(s.tanggal), hL: 0, hP: 0, izin: 0, alpa: 0, num: 0, den: 0 };
    const b = s.tanggal.slice(0, 7);
    if (!B[b]) B[b] = { bulan: b, sesi: 0, numL: 0, denL: 0, numP: 0, denP: 0 };
    B[b].sesi++;
  });

  absen.forEach(r => {
    const ss = S[r.sesi];
    if (!ss) return;
    if (o.jk !== 'Semua' && r.jk !== o.jk) return;
    const st = r.status || ST.A;
    const j = J[r.id] || (J[r.id] = { id: r.id, nama: r.nama, jk: r.jk, hadir: 0, izin: 0, alpa: 0, kecuali: 0, num: 0, den: 0, seq: [] });
    if (st === ST.H) j.hadir++; else if (st === ST.I) j.izin++; else if (st === ST.X) j.kecuali++; else j.alpa++;
    const v = nilai(st), d = wajib(st);
    j.num += v; j.den += d;
    j.seq.push({ t: ss.tanggal, st: st });
    if (st === ST.H) { if (r.jk === 'L') ss.hL++; else ss.hP++; }
    else if (st === ST.I) ss.izin++;
    else if (st !== ST.X) ss.alpa++;
    ss.num += v; ss.den += d;
    const b = B[ss.tanggal.slice(0, 7)];
    if (r.jk === 'L') { b.numL += v; b.denL += d; } else { b.numP += v; b.denP += d; }
  });

  const pct = (n, d) => d ? n / d : null;
  const kategori = p => p === null ? 'Dikecualikan'
    : (p * 100 < o.ambangKurang ? 'Kurang' : (p * 100 < o.ambangPerhatian ? 'Perlu Perhatian' : 'Baik'));

  const jamaah = Object.keys(J).map(k => {
    const j = J[k];
    const p = pct(j.num, j.den);
    j.seq.sort((a, b) => b.t.localeCompare(a.t));
    let beruntun = 0;
    for (let i = 0; i < j.seq.length; i++) {
      const x = j.seq[i];
      if (x.st === ST.X) continue;
      if (x.st === ST.H || x.st === ST.I) break;
      beruntun++;
    }
    return { id: j.id, nama: j.nama, jk: j.jk, hadir: j.hadir, izin: j.izin, alpa: j.alpa, kecuali: j.kecuali,
      dihitung: j.den, pct: p, beruntun: beruntun, kategori: kategori(p), num: j.num };
  }).sort((a, b) => ((a.pct === null) - (b.pct === null)) || ((a.pct || 0) - (b.pct || 0)) || a.nama.localeCompare(b.nama));

  const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
  const jL = jamaah.filter(j => j.jk === 'L'), jP = jamaah.filter(j => j.jk === 'P');
  const ringkas = {
    sesi: sesiP.length,
    jamaah: jamaah.filter(j => j.dihitung > 0).length,
    pct: pct(sum(jamaah, j => j.num), sum(jamaah, j => j.dihitung)),
    pctL: pct(sum(jL, j => j.num), sum(jL, j => j.dihitung)),
    pctP: pct(sum(jP, j => j.num), sum(jP, j => j.dihitung)),
    baik: jamaah.filter(j => j.kategori === 'Baik').length,
    perhatian: jamaah.filter(j => j.kategori === 'Perlu Perhatian').length,
    kurang: jamaah.filter(j => j.kategori === 'Kurang').length,
  };
  const sesi = sesiP.map(s => { const x = S[s.id]; return Object.assign({}, x, { pct: pct(x.num, x.den) }); });
  const bulan = Object.keys(B).sort().map(k => {
    const b = B[k];
    return { bulan: k, sesi: b.sesi, pct: pct(b.numL + b.numP, b.denL + b.denP), pctL: pct(b.numL, b.denL), pctP: pct(b.numP, b.denP) };
  });
  return { ringkas: ringkas, sesi: sesi, bulan: bulan, jamaah: jamaah };
}

function refreshDashboard_() {
  const sh = ss_().getSheetByName(SH.DASH);
  if (!sh) return;
  const set = getSettings_();
  const sesiAll = getSesiList_();
  const today = todayStr_();

  // daftar bulan untuk dropdown = bulan yang punya sesi + bulan ini
  const bulanSet = {};
  sesiAll.forEach(s => { bulanSet[s.tanggal.slice(0, 7)] = 1; });
  bulanSet[today.slice(0, 7)] = 1;
  const labels = Object.keys(bulanSet).sort().map(labelBulan_);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(labels, true).setAllowInvalid(false).build();
  const fil = sh.getRange('C3:C4');
  fil.setNumberFormat('@');

  let awal = parseBulan_(sh.getRange('C3').getValue());
  let akhir = parseBulan_(sh.getRange('C4').getValue());
  if (!awal) awal = today.slice(0, 7);
  if (!akhir) akhir = awal;
  if (awal > akhir) { const t = awal; awal = akhir; akhir = t; }
  fil.clearDataValidations();
  fil.setValues([[labelBulan_(awal)], [labelBulan_(akhir)]]);
  fil.setDataValidation(rule);

  const jkLabel = String(sh.getRange('C5').getValue() || 'Semua');
  const jk = /pria/i.test(jkLabel) ? 'L' : (/wanita/i.test(jkLabel) ? 'P' : 'Semua');

  const absen = readAbsen_().map(r => ({
    sesi: String(r[AX.SESI]), id: String(r[AX.ID]).trim().toUpperCase(), nama: String(r[AX.NAMA]),
    jk: normJK_(r[AX.JK]), status: String(r[AX.STATUS] || '').trim(),
  }));
  const R = hitungRekap_(sesiAll, absen, {
    awal: awal, akhir: akhir, jk: jk,
    ambangKurang: set.ambangKurang, ambangPerhatian: set.ambangPerhatian, izinHadir: set.izinHadir,
  });
  renderDashboard_(sh, R, set, awal, akhir, jk === 'Semua' ? 'Pria & Wanita' : (jk === 'L' ? 'Pria' : 'Wanita'));
}

function pv_(p) { return p === null || p === undefined ? '-' : p; }

function tabel_(sh, row, col, title, headers, rows, pctCols) {
  sh.getRange(row, col).setValue(title).setFontWeight('bold').setFontSize(12);
  sh.getRange(row + 1, col, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1b5e20').setFontColor('#ffffff').setWrap(true).setVerticalAlignment('middle');
  if (!rows.length) {
    sh.getRange(row + 2, col).setValue('Belum ada data pada periode ini.').setFontColor('#888888');
    return;
  }
  sh.getRange(row + 2, col, rows.length, headers.length).setValues(rows);
  (pctCols || []).forEach(c => sh.getRange(row + 2, col + c, rows.length, 1).setNumberFormat('0.0%'));
  sh.getRange(row + 1, col, rows.length + 1, headers.length)
    .setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
}

function renderDashboard_(sh, R, set, awal, akhir, jkLabel) {
  const nJ = R.jamaah.length;
  const butuh = 20 + Math.max(R.bulan.length, R.sesi.length, 1) + nJ + 10;
  if (sh.getMaxRows() < butuh) sh.insertRowsAfter(sh.getMaxRows(), butuh - sh.getMaxRows());
  if (sh.getMaxColumns() < 26) sh.insertColumnsAfter(sh.getMaxColumns(), 26 - sh.getMaxColumns());
  sh.getRange(7, 1, sh.getMaxRows() - 6, sh.getMaxColumns()).clear();
  sh.getCharts().forEach(c => sh.removeChart(c));

  const beda = awal.slice(0, 4) !== akhir.slice(0, 4);
  const periode = awal === akhir ? labelBulan_(awal) : labelBulan_(awal) + ' s/d ' + labelBulan_(akhir);
  sh.getRange('B1').setValue('Dashboard Kehadiran — ' + set.namaKelompok);
  sh.getRange('B2').setValue('Periode: ' + periode + '   ·   ' + jkLabel + '   ·   Diperbarui ' + fmt_(new Date(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#666666');
  sh.getRange('E3:E5').setValues([
    ['Kurang: < ' + set.ambangKurang + '%   ·   Perlu Perhatian: ' + set.ambangKurang + '% – < ' + set.ambangPerhatian + '%   ·   Baik: ≥ ' + set.ambangPerhatian + '%'],
    ['Izin dihitung hadir: ' + (set.izinHadir ? 'YA' : 'TIDAK') + '   (ubah ambang & aturan izin di tab Pengaturan)'],
    ['Ganti pilihan di kolom kuning → dashboard diperbarui otomatis. Hanya sesi berstatus Ditutup yang dihitung.'],
  ]).setFontColor('#666666').setFontStyle('italic');

  // KPI
  const k = R.ringkas;
  sh.getRange(7, 2, 1, 8).setValues([['Jumlah Sesi', 'Jamaah Dihitung', 'Rata-rata Kehadiran', 'Rata-rata Pria',
    'Rata-rata Wanita', 'Baik', 'Perlu Perhatian', 'Kurang']])
    .setFontSize(9).setFontColor('#555555').setWrap(true).setVerticalAlignment('bottom');
  sh.getRange(8, 2, 1, 8).setValues([[k.sesi, k.jamaah, pv_(k.pct), pv_(k.pctL), pv_(k.pctP), k.baik, k.perhatian, k.kurang]])
    .setFontSize(16).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(8, 4, 1, 3).setNumberFormat('0.0%');
  sh.getRange(7, 2, 2, 8).setBackground('#f1f8f4');
  sh.getRange(8, 7).setFontColor('#1e7e34');
  sh.getRange(8, 8).setFontColor('#b7791f');
  sh.getRange(8, 9).setFontColor('#c0392b');

  // Rekap per bulan (B..F) & tren per sesi (H..N)
  tabel_(sh, 10, 2, 'Rekap per Bulan', ['Bulan', 'Sesi', '% Total', '% Pria', '% Wanita'],
    R.bulan.map(b => [labelBulan_(b.bulan), b.sesi, pv_(b.pct), pv_(b.pctL), pv_(b.pctP)]), [2, 3, 4]);
  tabel_(sh, 10, 8, 'Tren per Sesi', ['Tanggal', 'Hari', 'Hadir Pria', 'Hadir Wanita', 'Izin', 'Alpa', '% Kehadiran'],
    R.sesi.map(s => [labelTgl_(s.tanggal, beda), s.hari, s.hL, s.hP, s.izin, s.alpa, pv_(s.pct)]), [6]);

  if (R.sesi.length) {
    try {
      const n = R.sesi.length;
      const chart = sh.newChart()
        .setChartType(Charts.ChartType.LINE)
        .addRange(sh.getRange(11, 8, n + 1, 1))
        .addRange(sh.getRange(11, 14, n + 1, 1))
        .setNumHeaders(1)
        .setPosition(10, 16, 0, 0)
        .setOption('title', '% Kehadiran per Sesi')
        .setOption('legend', { position: 'none' })
        .setOption('pointSize', 5)
        .setOption('vAxis', { format: 'percent', viewWindow: { min: 0, max: 1 } })
        .setOption('colors', ['#2e7d32'])
        .setOption('width', 560)
        .setOption('height', 300)
        .build();
      sh.insertChart(chart);
    } catch (err) { /* grafik opsional */ }
  }

  // Rekap per jamaah
  const jr = 12 + Math.max(R.bulan.length, R.sesi.length, 1) + 3;
  const rows = R.jamaah.map((j, i) => [i + 1, j.id, j.nama, j.jk, j.hadir, j.izin, j.alpa, j.kecuali, j.dihitung,
    pv_(j.pct), j.beruntun, j.kategori]);
  tabel_(sh, jr, 2, 'Rekap per Jamaah — urut dari kehadiran terendah',
    ['No', 'ID', 'Nama', 'JK', 'Hadir', 'Izin', 'Alpa', 'Dikecualikan', 'Sesi Dihitung', '% Kehadiran', 'Alpa Beruntun*', 'Kategori'],
    rows, [9]);
  if (nJ) {
    const warna = { 'Kurang': '#fde2e1', 'Perlu Perhatian': '#fff4ce', 'Baik': '#e6f4ea', 'Dikecualikan': '#eeeeee' };
    const bg = R.jamaah.map(j => { const c = warna[j.kategori] || '#ffffff'; return [c, c, c]; });
    sh.getRange(jr + 2, 11, nJ, 3).setBackgrounds(bg);
    sh.getRange(jr + 2, 13, nJ, 1).setFontWeight('bold');
  }
  sh.getRange(jr + 3 + Math.max(nJ, 1), 2)
    .setValue('* Alpa Beruntun = jumlah alpa berturut-turut pada sesi-sesi terakhir dalam periode (izin/hadir memutus hitungan).')
    .setFontColor('#888888').setFontStyle('italic');
}

function onEdit(e) {
  try {
    const r = e && e.range;
    if (!r) return;
    if (r.getSheet().getName() !== SH.DASH) return;
    if (r.getColumn() <= 3 && r.getLastColumn() >= 3 && r.getRow() <= 5 && r.getLastRow() >= 3) refreshDashboard_();
  } catch (err) {
    if (e && e.source) e.source.toast('Gagal memperbarui dashboard: ' + err.message);
  }
}

// ---------------------------------------------------------------------
// Setup & menu
// ---------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Absensi')
    .addItem('1. Setup awal (buat tab & pengaturan)', 'setupAwal')
    .addItem('2. Cek data Jamaah (sekaligus muat ulang)', 'cekDataJamaah')
    .addItem('3. Pasang otomatisasi (sesi & rekap)', 'pasangOtomatisasi')
    .addSeparator()
    .addItem('Buka sesi hari ini', 'menuBukaSesiHariIni')
    .addItem('Tutup sesi yang sudah lewat', 'menuTutupSesiLewat')
    .addItem('Perbarui dashboard', 'menuRefreshDashboard')
    .addSeparator()
    .addItem('Tampilkan link web app', 'menuLinkWebApp')
    .addToUi();
}

function styleHeader_(sh, nCol) {
  sh.getRange(1, 1, 1, nCol).setFontWeight('bold').setBackground('#1b5e20').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function ensureSheet_(name, headers, index) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = index === undefined ? ss.insertSheet(name) : ss.insertSheet(name, index);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);
  return sh;
}

function setupAwal() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone('Asia/Jakarta');

  // Pengaturan
  let sh = ensureSheet_(SH.SET, ['Pengaturan', 'Nilai', 'Keterangan']);
  const adaKey = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  const kurang = DEFAULT_SET.filter(r => adaKey.indexOf(r[0]) < 0);
  if (kurang.length) sh.getRange(sh.getLastRow() + 1, 1, kurang.length, 3).setValues(kurang);
  const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
  const iIzin = keys.indexOf('Izin Dihitung Hadir');
  if (iIzin >= 0) sh.getRange(iIzin + 2, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['YA', 'TIDAK'], true).build());
  sh.getRange(2, 2, keys.length, 1).setBackground('#fff8e1');
  sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 520);

  // Tab Jamaah di file sensus: hanya dibaca & dicek strukturnya (tidak diubah).
  hapusCacheMaster_();
  cekKolomMaster_(masterSheet_());

  // Petugas
  sh = ensureSheet_(SH.PETUGAS, HDR.PETUGAS);
  sh.getRange('B:B').setNumberFormat('@');
  if (sh.getLastRow() < 2) {
    sh.getRange(2, 1, 3, 5).setValues([
      ['Admin', '123456', 'Semua', 'Admin', 'Ya'],
      ['Petugas Pria', '111111', 'L', 'Petugas', 'Ya'],
      ['Petugas Wanita', '222222', 'P', 'Petugas', 'Ya'],
    ]);
  }
  const nP = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 3, nP, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Semua', 'L', 'P'], true)
    .setHelpText('Hak akses petugas: Semua = boleh mencatat pria & wanita, L = pria saja, P = wanita saja.').build());
  sh.getRange(2, 4, nP, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Petugas', 'Admin'], true).build());
  sh.getRange(2, 5, nP, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Ya', 'Tidak'], true).build());

  // Sesi
  sh = ensureSheet_(SH.SESI, HDR.SESI);
  sh.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('G:H').setNumberFormat('yyyy-mm-dd hh:mm');

  // Absensi
  sh = ensureSheet_(SH.ABSEN, HDR.ABSEN);
  sh.getRange('C:C').setNumberFormat('yyyy-mm-dd');
  sh.getRange('J:J').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sh.hideColumns(1);

  // Dashboard
  sh = ss.getSheetByName(SH.DASH) || ss.insertSheet(SH.DASH, 0);
  sh.setHiddenGridlines(true);
  sh.getRange('B1').setFontSize(18).setFontWeight('bold').setFontColor('#1b5e20');
  sh.getRange('B3:B5').setValues([['Bulan Awal'], ['Bulan Akhir'], ['Jenis Kelamin']]).setFontWeight('bold');
  const c5 = sh.getRange('C5');
  c5.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Semua', 'Pria', 'Wanita'], true).build());
  if (!c5.getValue()) c5.setValue('Semua');
  sh.getRange('C3:C5').setBackground('#fff59d').setFontWeight('bold')
    .setBorder(true, true, true, true, true, true, '#c9a400', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 16);
  sh.setColumnWidth(2, 95);
  sh.setColumnWidth(3, 150);
  sh.setColumnWidth(4, 210);
  for (let c = 5; c <= 14; c++) sh.setColumnWidth(c, 92);
  sh.setColumnWidth(15, 16);

  refreshDashboard_();
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('Setup selesai ✅',
    'Langkah berikutnya:\n' +
    '1) Data jamaah dibaca dari file sensus, tab Jamaah (Flag Absen = Y → wajib absen).\n' +
    '2) Menu Absensi → 2. Cek data Jamaah.\n' +
    '3) Ganti PIN di tab Petugas (PIN contoh: 123456 / 111111 / 222222).\n' +
    '4) Atur Hari Pengajian & ambang di tab Pengaturan.\n' +
    '5) Deploy sebagai Aplikasi web, lalu menu 3. Pasang otomatisasi.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Laporan kualitas data tab Jamaah (tidak mengubah data). */
function cekDataJamaah() {
  const ui = SpreadsheetApp.getUi();
  hapusCacheMaster_();
  const sh = masterSheet_();
  const m = cekKolomMaster_(sh);
  const lr = sh.getLastRow();
  const data = lr >= 2 ? sh.getRange(2, 1, lr - 1, sh.getLastColumn()).getValues() : [];
  const iAktif = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(h => String(h).trim().toLowerCase()).indexOf('status keaktifan');
  const seen = {}, dup = [], tanpaId = [], tanpaJK = [], flagAneh = [], beda = [];
  let wajibL = 0, wajibP = 0, total = 0;
  data.forEach((r, i) => {
    const nama = String(r[m.nama] || '').trim();
    if (!nama) return;
    total++;
    const baris = i + 2, id = String(r[m.id] || '').trim().toUpperCase();
    if (!id) tanpaId.push(baris + ' ' + nama); else { if (seen[id]) dup.push(id); seen[id] = 1; }
    const f = String(r[m.flag] || '').trim();
    if (!/^(y|n)$/i.test(f)) flagAneh.push(baris + ' ' + nama + ' (' + (f || 'kosong') + ')');
    if (isYa_(f)) {
      const jk = normJK_(r[m.jk]);
      if (jk === 'L') wajibL++; else if (jk === 'P') wajibP++; else tanpaJK.push(baris + ' ' + nama);
      if (iAktif >= 0 && /^n/i.test(String(r[iAktif]).trim())) beda.push(baris + ' ' + nama);
    }
  });
  const daftar = (judul, arr) => arr.length ? '\n\n⚠️ ' + judul + ' (' + arr.length + '):\n- ' + arr.slice(0, 10).join('\n- ') + (arr.length > 10 ? '\n- ...' : '') : '';
  ui.alert('Cek data Jamaah',
    'Sumber: ' + sh.getParent().getName() + ' → tab ' + sh.getName() + '\n' +
    'Total jamaah: ' + total + '\nWajib absen (Flag Y): ' + (wajibL + wajibP) + '  →  Pria ' + wajibL + ', Wanita ' + wajibP +
    daftar('Tanpa ID Jamaah — tidak bisa diabsen', tanpaId) +
    daftar('ID ganda', dup) +
    daftar('Flag Y tapi Jenis Kelamin kosong/tidak dikenal', tanpaJK) +
    daftar('Flag Absen bukan Y/N', flagAneh) +
    daftar('Flag Y tapi Status Keaktifan = N (cek apakah benar wajib absen)', beda),
    ui.ButtonSet.OK);
}

function pasangOtomatisasi() {
  const nama = ['buatSesiOtomatis', 'tutupSesiOtomatis'];
  ScriptApp.getProjectTriggers().forEach(t => { if (nama.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('buatSesiOtomatis').timeBased().everyDays(1).atHour(5).inTimezone(tz_()).create();
  ScriptApp.newTrigger('tutupSesiOtomatis').timeBased().everyDays(1).atHour(1).inTimezone(tz_()).create();
  SpreadsheetApp.getUi().alert('Otomatisasi terpasang ✅\n- Setiap ±05:00: sesi dibuat jika hari ini hari pengajian.\n' +
    '- Setiap ±01:00: sesi kemarin ditutup (yang tidak tercatat = Alpa) & dashboard diperbarui.');
}

function menuBukaSesiHariIni() {
  const s = withLock_(() => bukaSesi_(todayStr_(), 'Pengajian rutin', 'Admin (menu)'));
  refreshDashboard_();
  SpreadsheetApp.getUi().alert('Sesi aktif: ' + s.id + ' (' + (s.hari || hariDari_(s.tanggal)) + ', ' + s.tanggal + ')');
}
function menuTutupSesiLewat() {
  const n = tutupSesiOtomatis();
  SpreadsheetApp.getUi().alert(n + ' sesi ditutup. Dashboard diperbarui.');
}
function menuRefreshDashboard() {
  refreshDashboard_();
  ss_().toast('Dashboard diperbarui');
}
function menuLinkWebApp() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(url ? 'Link web app untuk petugas:\n\n' + url
    : 'Belum di-deploy. Buka Apps Script → Deploy → Deployment baru → Aplikasi web.');
}