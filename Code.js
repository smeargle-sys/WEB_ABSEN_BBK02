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
  LOG: 'Log',
  ARSIP: 'Arsip_',   // satu tab per tahun: Arsip_2026, Arsip_2027, ...
};
const ST = { H: 'Hadir', I: 'Izin', A: 'Alpa', X: 'Dikecualikan' };
const SESI_BUKA = 'Terbuka';
const SESI_TUTUP = 'Ditutup';
const SESI_ARSIP = 'Diarsipkan';   // sesi lama yang datanya sudah dipindah ke tab Arsip_<tahun> (hanya-baca)
function sudahTutup_(s) { return s.status === SESI_TUTUP || s.status === SESI_ARSIP; }

const HDR = {
  // template hanya dipakai jika tab Jamaah belum ada (format mengikuti data sensus)
  MASTER: ['ID Jamaah', 'ID Keluarga', 'Hubungan Keluarga', 'Nama Lengkap', 'Nama Absen', 'Jenis Kelamin', 'Tahun Lahir',
    'Status Nikah', 'Status Keaktifan', 'Flag Absen', 'Status Keberadaan', 'Catatan'],
  PETUGAS: ['Nama', 'PIN', 'Bagian', 'Peran', 'Aktif'],
  SESI: ['ID_Sesi', 'Tanggal', 'Hari', 'Keterangan', 'Status', 'Dibuka Oleh', 'Waktu Dibuka', 'Waktu Ditutup'],
  ABSEN: ['Key', 'ID_Sesi', 'Tanggal', 'ID_Jamaah', 'Nama', 'JK', 'Status', 'Metode', 'Petugas', 'Waktu', 'Terlambat', 'Menit Terlambat'],
};
// indeks kolom tab Absensi (0-based)
const AX = { KEY: 0, SESI: 1, TGL: 2, ID: 3, NAMA: 4, JK: 5, STATUS: 6, METODE: 7, PETUGAS: 8, WAKTU: 9, TELAT: 10, MENIT: 11 };

// Naikkan angka ini setiap kali Code.gs diubah. Web app akan memperingatkan jika server masih versi lama
// (artinya lupa: Deploy -> Kelola deployment -> Edit -> Versi baru).
const VERSI_SERVER = 22;

const SENSUS_ID_DEFAULT = '1jgTL5COMzaDnvnnOTL_0DhQOlycHFaSS7HavLhR7IW0'; // file "SENSUS BBK02 Dashboard"

const DEFAULT_SET = [
  ['Nama Kelompok', 'BBK02', 'Ditampilkan di web app, kartu QR & dashboard'],
  ['Hari Pengajian', 'Senin, Jumat', 'Pisahkan dengan koma. Sesi dibuat otomatis pada hari-hari ini'],
  ['File Data Jamaah', SENSUS_ID_DEFAULT, 'ID atau link file Google Sheet sensus (sumber data jamaah, hanya dibaca). Kosongkan jika tab Jamaah ada di file ini'],
  ['Nama Tab Jamaah', 'Jamaah', 'Nama tab data jamaah di file sensus'],
  ['Ambang Kurang (%)', 50, 'Kehadiran di bawah angka ini = "Kurang"'],
  ['Ambang Perhatian (%)', 75, 'Di bawah angka ini (tapi >= ambang kurang) = "Perlu Perhatian"'],
  ['Jam Buka Sesi', '19:30', 'Sesi dibuka otomatis jam ini pada Hari Pengajian (format JJ:MM)'],
  ['Batas Tepat Waktu', '19:45', 'Hadir SETELAH jam ini dicatat TERLAMBAT (tetap dihitung hadir). Format JJ:MM'],
  ['Jam Tutup Sesi', '23:59', 'Sesi ditutup otomatis jam ini — yang tidak tercatat = Alpa (format JJ:MM, harus setelah jam buka)'],
  ['Batas Sering Terlambat (%)', 50, 'Filter dashboard "Sering Terlambat": jamaah yang terlambat pada >= persen ini dari kehadirannya'],
  ['Izin Dihitung Hadir', 'TIDAK', 'TIDAK = izin tercatat & dihitung sebagai sesi wajib (mengurangi %). YA = izin dianggap hadir'],
  ['Daftar Keterangan Sesi', 'Pengajian rutin, Pengajian Lansia, Pengajian Remaja, ASAD', 'Pilihan keterangan sesi, pisahkan dengan koma. Pilihan PERTAMA dipakai untuk sesi yang dibuka otomatis. Muncul sebagai dropdown di aplikasi & tab Sesi'],
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

// Memo per permintaan web app: sheet yang sama tidak dibaca berulang kali dalam satu panggilan.
let MEMO_ = null;
function memo_(k, fn) {
  if (!MEMO_) return fn();
  if (!Object.prototype.hasOwnProperty.call(MEMO_, k)) MEMO_[k] = fn();
  return MEMO_[k];
}
function lupakan_(k) { if (MEMO_) delete MEMO_[k]; }

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
function getSettings_() { return memo_('set', bacaSettings_); }
function bacaSettings_() {
  const sh = ss_().getSheetByName(SH.SET);
  const map = {};
  if (sh && sh.getLastRow() >= 2) {
    const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    const disp = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues();
    vals.forEach((r, i) => { map[String(r[0]).trim()] = r[1]; map['~' + String(r[0]).trim()] = disp[i][1]; });
  }
  const jam = (v, d) => { const m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/); return m ? pad2_(m[1]) + ':' + m[2] : d; };
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
    jamBuka: jam(map['~Jam Buka Sesi'], '19:30'),
    jamTutup: jam(map['~Jam Tutup Sesi'], '23:59'),
    batasTepat: jam(map['~Batas Tepat Waktu'], '19:45'),
    daftarKet: (function () {
      const raw = map.hasOwnProperty('Daftar Keterangan Sesi') ? map['Daftar Keterangan Sesi'] : 'Pengajian rutin, Pengajian Lansia, Pengajian Remaja, ASAD';
      const out = [];
      String(raw || '').split(/[,;\n]/).map(x => x.replace(/\s+/g, ' ').trim().slice(0, 100)).filter(Boolean)
        .forEach(x => { if (!out.some(y => y.toLowerCase() === x.toLowerCase())) out.push(x); });
      return out.length ? out : ['Pengajian rutin'];
    })(),
    seringTelat: (function () { let v = num(map['Batas Sering Terlambat (%)'], 50); if (v > 0 && v <= 1) v *= 100; return v; })(),
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
  try { cache.put(MASTER_CACHE_KEY, JSON.stringify(out), 900); } catch (e) { /* data terlalu besar: tanpa cache */ }
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
  const rows = memo_('petugas', () => sh.getRange(2, 1, lr - 1, 5).getDisplayValues());
  const cocok = rows.filter(r => String(r[1]).trim() === pin && !/^(tidak|no|n|false)$/i.test(String(r[4]).trim()));
  if (!cocok.length) throw new Error('PIN salah atau petugas tidak aktif');
  if (cocok.length > 1) {
    throw new Error('PIN ini dipakai ' + cocok.length + ' petugas (' + cocok.map(r => r[0]).join(', ') +
      '). Admin: buat PIN berbeda untuk tiap petugas di tab Petugas.');
  }
  const r = cocok[0];
  return { nama: String(r[0] || 'Petugas').trim(), bagian: normJK_(r[2]) || 'Semua', admin: /admin/i.test(r[3]), kiosk: /kiosk/i.test(r[3]) };
}

// ---------------------------------------------------------------------
// Keamanan: PIN hanya dipakai sekali saat login -> ditukar TOKEN sesi acak (berlaku 6 jam).
// Token disimpan di server (cache); HP hanya menyimpan token, bukan PIN.
// Setiap permintaan memeriksa ulang status petugas -> PIN diganti / Aktif=Tidak langsung memutus akses.
// ---------------------------------------------------------------------
const PIN_MAKS_GAGAL = 20;      // percobaan PIN salah per 10 menit (seluruh pengguna)
const TOKEN_TTL = 21600;        // 6 jam (batas maksimum cache Apps Script)

/** Catat kejadian penting ke tab Log (untuk audit). Tidak pernah menggagalkan proses utama. */
function log_(kejadian, ket) {
  try {
    const ss = ss_();
    let sh = ss.getSheetByName(SH.LOG);
    if (!sh) {
      sh = ss.insertSheet(SH.LOG);
      sh.getRange(1, 1, 1, 3).setValues([['Waktu', 'Kejadian', 'Keterangan']]);
      styleHeader_(sh, 3);
    }
    sh.appendRow([new Date(), kejadian, String(ket || '').slice(0, 300)]);
  } catch (e) { /* abaikan */ }
}

/** Login dengan PIN + pembatas percobaan. */
function authPin_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fail') || 0);
  if (fails >= PIN_MAKS_GAGAL) {
    if (!cache.get('pin_lock_logged')) { cache.put('pin_lock_logged', '1', 600); log_('LOGIN DIKUNCI', PIN_MAKS_GAGAL + ' PIN salah dalam 10 menit — kemungkinan ada yang menebak PIN'); }
    throw new Error('Terlalu banyak percobaan PIN salah. Coba lagi 10 menit lagi.');
  }
  try {
    return getPetugasByPin_(pin);
  } catch (e) {
    cache.put('pin_fail', String(fails + 1), 600);
    log_('Login gagal', 'Percobaan ke-' + (fails + 1) + ' dalam 10 menit');
    throw e;
  }
}
function buatToken_(pin) {
  const t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  CacheService.getScriptCache().put('tok_' + t, JSON.stringify({ pin: String(pin).trim() }), TOKEN_TTL);
  return t;
}
/** Validasi token di setiap permintaan. Pesan berawalan SESI_HABIS membuat web app kembali ke layar PIN. */
function auth_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('SESI_HABIS: silakan login ulang dengan PIN.');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('tok_' + token);
  if (!raw) throw new Error('SESI_HABIS: sesi login berakhir, silakan masukkan PIN lagi.');
  try {
    return getPetugasByPin_(JSON.parse(raw).pin);
  } catch (e) {
    cache.remove('tok_' + token);
    throw new Error('SESI_HABIS: akses petugas berubah (PIN diganti / dinonaktifkan). Silakan login ulang.');
  }
}

// ---------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------
function getSesiList_() { return memo_('sesi', bacaSesiList_).map(x => Object.assign({}, x)); }
function bacaSesiList_() {
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
    oleh: String(r[5] || ''),
    buka: jamDari_(r[6]),
    tutup: jamDari_(r[7]),
  })).filter(s => s.id && s.tanggal);
}
/** Ambil jam "HH:mm" dari sel waktu (Date atau teks). */
function jamDari_(v) {
  if (v instanceof Date) return fmt_(v, 'HH:mm');
  const m = String(v || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? pad2_(m[1]) + ':' + m[2] : '';
}

function sesiDto_(s) {
  return { id: s.id, tanggal: s.tanggal, hari: s.hari || hariDari_(s.tanggal), ket: s.ket, status: s.status,
    oleh: s.oleh || '', buka: s.buka || '', tutup: s.tutup || '' };
}

/** Keterangan sesi dari aplikasi: 1 baris, maks 100 karakter, tidak boleh diawali tanda rumus. */
function bersihKet_(v) {
  let k = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!k) return '';
  // hanya boleh memilih dari "Daftar Keterangan Sesi" di tab Pengaturan
  const cocok = getSettings_().daftarKet.filter(x => x.toLowerCase() === k.toLowerCase())[0];
  if (!cocok) throw new Error('Keterangan "' + k + '" tidak ada di daftar. Admin bisa menambahkannya di tab Pengaturan → Daftar Keterangan Sesi.');
  k = cocok;
  if (/^[=+\-@]/.test(k)) k = "'" + k;
  return k;
}
/** Keterangan untuk sesi yang dibuka tanpa pilihan: pilihan pertama di daftar. */
function ketDefault_() { return getSettings_().daftarKet[0] || 'Pengajian rutin'; }
/** Dropdown kolom Keterangan (D) di tab Sesi dari Daftar Keterangan Sesi. Nilai lama di luar daftar tetap boleh (hanya ditandai). */
function terapkanValidasiKet_() {
  const sh = ss_().getSheetByName(SH.SESI);
  if (!sh) return;
  const n = Math.max(sh.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(getSettings_().daftarKet, true).setAllowInvalid(true)
    .setHelpText('Pilih dari Daftar Keterangan Sesi di tab Pengaturan').build();
  sh.getRange(2, 4, n, 1).setDataValidation(rule);
}
function ubahKet_(s, k) {
  sheet_(SH.SESI).getRange(s.row, 4).setValue(k);
  lupakan_('sesi');
}

/** Buka sesi untuk tanggal tertentu (1 sesi per hari). Mengembalikan sesi yang sudah ada jika ada. */
function bukaSesi_(tanggal, ket, oleh) {
  const id = 'S' + tanggal.replace(/-/g, '');
  const ada = getSesiList_().find(s => s.id === id);
  if (ada) return ada;
  const sh = sheet_(SH.SESI);
  const row = [id, tanggal, hariDari_(tanggal), ket || ketDefault_(), SESI_BUKA, oleh || '', new Date(), ''];
  sh.appendRow(row);
  lupakan_('sesi');
  return { row: sh.getLastRow(), id: id, tanggal: tanggal, hari: row[2], ket: String(row[3]).replace(/^'/, ''), status: SESI_BUKA,
    oleh: row[5], buka: fmt_(row[6], 'HH:mm'), tutup: '' };
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
    appends.push([sesi.id + '|' + j.id, sesi.id, sesi.tanggal, j.id, j.nama, j.jk, st, 'Otomatis', 'Sistem', now, '', '']);
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  // 3) tandai sesi ditutup
  const ssh = sheet_(SH.SESI);
  ssh.getRange(sesi.row, 5).setValue(SESI_TUTUP);
  ssh.getRange(sesi.row, 8).setValue(now);
  lupakan_('sesi');
  hapusCacheAbsen_(sesi.id);
  return { alpa: nAlpa, dikecualikan: nKecuali };
}

function sekarang_() { const d = new Date(); return { tanggal: fmt_(d, 'yyyy-MM-dd'), jam: fmt_(d, 'HH:mm') }; }

/**
 * Trigger setiap 5 menit (dipasang lewat menu "3. Pasang otomatisasi"):
 *  - BUKA sesi pada Hari Pengajian mulai "Jam Buka Sesi" (mis. 19:30)
 *  - TUTUP sesi yang masih terbuka mulai "Jam Tutup Sesi" (mis. 23:59) atau yang tanggalnya sudah lewat
 * Ketelitian: paling lambat ±5 menit dari jam yang diatur.
 */
function jadwalOtomatis() {
  const set = getSettings_();
  const now = sekarang_();
  const tutupHariSama = set.jamTutup > set.jamBuka;
  withLock_(() => {
    let berubah = false;
    const hariIni = hariDari_(now.tanggal).toLowerCase();
    const dalamJam = now.jam >= set.jamBuka && (!tutupHariSama || now.jam < set.jamTutup);
    if (set.hari.indexOf(hariIni) >= 0 && dalamJam) {
      const id = 'S' + now.tanggal.replace(/-/g, '');
      if (!getSesiList_().some(x => x.id === id)) {
        bukaSesi_(now.tanggal, ketDefault_(), 'Otomatis');
        log_('Buka sesi', id + ' otomatis pukul ' + now.jam);
        berubah = true;
      }
    }
    getSesiList_().forEach(x => {
      if (sudahTutup_(x)) return;
      const lewat = x.tanggal < now.tanggal || (tutupHariSama && x.tanggal === now.tanggal && now.jam >= set.jamTutup);
      if (lewat) {
        const r = tutupSesi_(x);
        log_('Tutup sesi', x.id + ' otomatis pukul ' + now.jam + ' · alpa ' + r.alpa);
        berubah = true;
      }
    });
    if (berubah) refreshDashboard_();
  });
  // Hangatkan cache agar login & buka sesi petugas tetap cepat
  try {
    hapusCacheMaster_(); getMaster_();
    const hariIni = getSesiList_().find(x => x.tanggal === now.tanggal && !sudahTutup_(x));
    if (hariIni) { getAbsenSesi_(hariIni.id); refreshDashboard_(); }   // panel "Sesi Berjalan" tetap segar
  } catch (e) { /* abaikan */ }
}
/** Kompatibilitas: trigger lama (05:00) kini mengikuti jadwal jam buka/tutup. */
function buatSesiOtomatis() { jadwalOtomatis(); }

/** Tambahkan baris pengaturan yang belum ada (untuk instalasi lama), jam disimpan sebagai teks. */
function lengkapiPengaturan_() {
  const sh = ss_().getSheetByName(SH.SET);
  if (!sh) return;
  const ada = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  DEFAULT_SET.filter(r => ada.indexOf(r[0]) < 0).forEach(r => {
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 2).setNumberFormat('@');
    sh.getRange(row, 1, 1, 3).setValues([r]);
    sh.getRange(row, 2).setBackground('#fff8e1');
  });
  lupakan_('set');
  terapkanValidasiKet_();
}

/** Trigger harian (±01:00): tutup semua sesi terbuka yang tanggalnya sudah lewat. */
function tutupSesiOtomatis() {
  return withLock_(() => {
    const today = todayStr_();
    let n = 0;
    getSesiList_().forEach(s => {
      if (!sudahTutup_(s) && s.tanggal < today) { tutupSesi_(s); n++; }
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
const ABSEN_CACHE_TTL = 600;   // detik; sesudahnya dibaca ulang dari sheet (menangkap edit manual di sheet)
function absenKey_(sesiId) { return 'absen_v2_' + sesiId; }
function bacaAbsenSesi_(sesiId) { return bacaSnapSesi_(sesiId).absen; }
/**
 * {absen:{ID: status}, telat:{ID: menit}, info:{ID: [jam, petugas, metode]}} dari sheet.
 * info hanya untuk Hadir/Izin (dipakai Timeline di aplikasi).
 */
function bacaSnapSesi_(sesiId) {
  const map = {}, telat = {}, info = {};
  readAbsen_().forEach(r => {
    if (String(r[AX.SESI]) !== sesiId) return;
    const id = String(r[AX.ID]).trim().toUpperCase();
    const st = String(r[AX.STATUS] || '');
    map[id] = st;
    if (/^ya$/i.test(String(r[AX.TELAT] || '').trim())) telat[id] = Number(r[AX.MENIT]) || 1;
    if (st === ST.H || st === ST.I) info[id] = infoBaris_(r[AX.WAKTU], r[AX.PETUGAS], r[AX.METODE]);
  });
  return { absen: map, telat: telat, info: info };
}
function infoBaris_(waktu, petugas, metode) { return [jamDari_(waktu), String(petugas || ''), String(metode || '')]; }
function jamKeMenit_(hhmm) { const p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
/** Pastikan judul kolom Terlambat ada (untuk instalasi lama). */
function pastikanKolomAbsen_(sh) {
  memo_('kolomAbsen', () => {
    const h = sh.getRange(1, 1, 1, HDR.ABSEN.length).getValues()[0];
    if (String(h[AX.TELAT] || '') !== HDR.ABSEN[AX.TELAT]) {
      sh.getRange(1, 1, 1, HDR.ABSEN.length).setValues([HDR.ABSEN]);
      styleHeader_(sh, HDR.ABSEN.length);
    }
    return true;
  });
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
    const sn = bacaSnapSesi_(sesiId);
    const o = { ver: Date.now(), absen: sn.absen, telat: sn.telat, info: sn.info };
    simpanCacheAbsen_(sesiId, o);
    return o;
  });
}
function hapusCacheAbsen_(sesiId) { CacheService.getScriptCache().remove(absenKey_(sesiId)); }

/** changes: [{id, status: 'Hadir'|'Izin'|'' , metode: 'Scan QR'|'Foto QR'|'Ketik ID'|'Manual'}] */
const METODE_VALID = ['Scan QR', 'Foto QR', 'Ketik ID', 'Manual', 'Mandiri (Kamera)', 'Mandiri (Reader)'];
function simpanAbsen_(sesi, changes, petugas) {
  const sh = sheet_(SH.ABSEN);
  const master = indexBy_(getMaster_(), 'id');
  const lr = sh.getLastRow();
  const keyRow = {};
  // Baris dikenali dari kolom TERLIHAT (ID_Sesi & ID_Jamaah). Baris yang isinya dihapus manual dianggap tidak ada.
  if (lr >= 2) sh.getRange(2, 1, lr - 1, 4).getValues().forEach((r, i) => {
    const sid = String(r[AX.SESI] || '').trim(), jid = String(r[AX.ID] || '').trim().toUpperCase();
    if (sid && jid) keyRow[sid + '|' + jid] = i + 2;
  });

  // dedupe: perubahan terakhir per ID yang berlaku
  const perId = {};
  changes.forEach(c => { const id = String(c && c.id || '').trim().toUpperCase(); if (id) perId[id] = c; });

  pastikanKolomAbsen_(sh);
  const now = new Date();
  // Terlambat: dihitung dari jam SERVER, hanya untuk sesi hari ini yang masih terbuka (bukan koreksi Admin)
  const set = getSettings_();
  const jamNow = sekarang_();
  const bisaTelat = sesi.status !== SESI_TUTUP && sesi.tanggal === jamNow.tanggal;
  const menitTelat = bisaTelat ? Math.max(0, jamKeMenit_(jamNow.jam) - jamKeMenit_(set.batasTepat)) : 0;
  const tulisTelat = {};   // id -> menit (0 = tepat waktu / tidak berlaku)
  const appends = [];
  const ditolak = [];
  const sudah = [];   // sudah tercatat dengan status yang sama (oleh petugas lain / sebelumnya) -> tidak ditimpa
  const tulis = {};   // id -> status yang benar-benar ditulis (untuk cache sinkron)
  const tulisInfo = {};   // id -> [jam, petugas, metode] (untuk Timeline)
  const kini = getAbsenSesi_(sesi.id).absen;   // status terkini (cache = sheet, dijaga di dalam lock)
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
    if (keyRow[key] && status && (kini[id] || '') === status) {
      // Scan ganda: status sama sudah tercatat -> pertahankan petugas & waktu scan PERTAMA
      sudah.push(id);
      return;
    }
    const telat = (status === ST.H && menitTelat > 0) ? menitTelat : 0;
    const baris = [key, sesi.id, sesi.tanggal, id, j.nama, j.jk, status, metode, petugas.nama, now, telat ? 'Ya' : '', telat || ''];
    if (keyRow[key]) {
      sh.getRange(keyRow[key], 1, 1, HDR.ABSEN.length).setValues([baris]);
      tulis[id] = status; tulisTelat[id] = telat; tulisInfo[id] = infoBaris_(now, petugas.nama, metode);
      n++;
    } else if (status) {
      appends.push(baris);
      tulis[id] = status; tulisTelat[id] = telat; tulisInfo[id] = infoBaris_(now, petugas.nama, metode);
      n++;
    }
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  // perbarui cache sinkron (masih di dalam lock)
  const raw = CacheService.getScriptCache().get(absenKey_(sesi.id));
  let snap = null;
  if (raw) { try { snap = JSON.parse(raw); } catch (e) { snap = null; } }
  if (snap) {
    snap.telat = snap.telat || {}; snap.info = snap.info || {};
    Object.keys(tulis).forEach(id => {
      snap.absen[id] = tulis[id];
      if (tulisTelat[id]) snap.telat[id] = tulisTelat[id]; else delete snap.telat[id];
      if (tulis[id] === ST.H || tulis[id] === ST.I) snap.info[id] = tulisInfo[id]; else delete snap.info[id];
    });
  } else { const sn = bacaSnapSesi_(sesi.id); snap = { absen: sn.absen, telat: sn.telat, info: sn.info }; }
  snap.ver = Math.max(Date.now(), (snap.ver || 0) + 1);
  simpanCacheAbsen_(sesi.id, snap);
  return { tersimpan: n, ditolak: ditolak, sudah: sudah, ver: snap.ver, absen: snap.absen, telat: snap.telat || {}, info: snap.info || {} };
}

// ---------------------------------------------------------------------
// Paket data layar: daftar sesi + data sesi terpilih, dalam SATU panggilan (hemat waktu tunggu)
// ---------------------------------------------------------------------
function dataSesi_(p, sesiId) {
  const s = sesiBoleh_(p, sesiId);
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
  return { sesi: sesiDto_(s), jamaah: jamaah, lain: lain, absen: snap.absen, telat: snap.telat || {}, info: snap.info || {}, ver: snap.ver };
}
function infoAwal_(p) {
  const today = todayStr_();
  let list = getSesiList_().filter(x => x.status !== SESI_ARSIP).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  list = (p.admin && !p.kiosk) ? list.slice(0, 20) : list.filter(x => x.tanggal === today);   // petugas & kiosk: hanya sesi hari ini
  const set = getSettings_();
  return { petugas: p, today: today, sesi: list.map(sesiDto_), namaKelompok: set.namaKelompok, versiServer: VERSI_SERVER,
    jadwal: { hari: set.hari, jamBuka: set.jamBuka, jamTutup: set.jamTutup, batasTepat: set.batasTepat, daftarKet: set.daftarKet } };
}
function paketAwal_(p, pilihId) {
  const init = infoAwal_(p);
  const ada = id => init.sesi.some(x => x.id === id);
  const target = (pilihId && ada(pilihId)) ? pilihId
    : ((init.sesi.find(x => x.tanggal === init.today) || init.sesi.find(x => !sudahTutup_(x)) || init.sesi[0] || {}).id || null);
  return { init: init, target: target, data: target ? dataSesi_(p, target) : null };
}

// ---------------------------------------------------------------------
// Rekap sesi untuk dikirim ke grup WhatsApp pengurus (teks siap tempel, format WhatsApp)
// ---------------------------------------------------------------------
function rekapPesan_(s) {
  const set = getSettings_();
  const L = { A: { L: [], P: [] }, I: { L: [], P: [] }, T: [] };
  const n = { H: 0, HL: 0, HP: 0, I: 0, A: 0, T: 0, wL: 0, wP: 0 };
  readAbsen_().forEach(r => {
    if (String(r[AX.SESI]) !== s.id) return;
    const st = String(r[AX.STATUS] || ''), nama = String(r[AX.NAMA] || r[AX.ID]), jk = normJK_(r[AX.JK]) || 'L';
    if (st === ST.X || !st) return;   // Dikecualikan tidak dihitung
    if (jk === 'L') n.wL++; else n.wP++;
    if (st === ST.H) {
      n.H++; if (jk === 'L') n.HL++; else n.HP++;
      if (/^ya$/i.test(String(r[AX.TELAT] || '').trim())) { n.T++; L.T.push({ nama: nama, jk: jk, m: Number(r[AX.MENIT]) || 0 }); }
    } else if (st === ST.I) { n.I++; L.I[jk].push(nama); }
    else if (st === ST.A) { n.A++; L.A[jk].push(nama); }
  });
  const urut = a => a.sort((x, y) => x.localeCompare(y, 'id'));
  ['L', 'P'].forEach(k => { urut(L.A[k]); urut(L.I[k]); });
  L.T.sort((a, b) => b.m - a.m || a.nama.localeCompare(b.nama, 'id'));
  const total = n.H + n.I + n.A;
  const pct = (a, b) => b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '-';
  const hadirHitung = n.H + (set.izinHadir ? n.I : 0);
  const ket = s.ket && s.ket.trim().toLowerCase() !== ketDefault_().toLowerCase() ? ' · ' + s.ket.trim() : '';
  const daftar = (arr) => arr.map((x, i) => (i + 1) + '. ' + x).join('\n');
  const perJK = (o) => {
    const out = [];
    if (o.L.length) out.push('_Pria (' + o.L.length + ')_\n' + daftar(o.L));
    if (o.P.length) out.push('_Wanita (' + o.P.length + ')_\n' + daftar(o.P));
    return out.join('\n\n') || '-';
  };
  const baris = [
    '*Rekap Absensi ' + set.namaKelompok + '*',
    (s.hari || hariDari_(s.tanggal)) + ', ' + labelTgl_(s.tanggal, false) + ' ' + s.tanggal.slice(0, 4) + ket,
    '',
    'Hadir: *' + n.H + '* dari ' + total + ' (' + pct(hadirHitung, total) + ')',
    'Pria ' + n.HL + '/' + n.wL + ' · Wanita ' + n.HP + '/' + n.wP,
    'Terlambat: ' + n.T + ' · Izin: ' + n.I + ' · Alpa: ' + n.A,
    '',
    '*Alpa (' + n.A + ')*', perJK(L.A),
    '',
    '*Izin (' + n.I + ')*', perJK(L.I),
    '',
    '*Terlambat (' + n.T + ')* — batas ' + set.batasTepat,
    L.T.length ? L.T.map((x, i) => (i + 1) + '. ' + x.nama + ' (' + (x.jk === 'L' ? 'Pria' : 'Wanita') + ', +' + x.m + ' mnt)').join('\n') : '-',
    '',
    '_Data final setelah sesi ditutup. Dashboard lengkap ada di Google Sheet ABSENSI ' + set.namaKelompok + '._',
  ];
  return { teks: baris.join('\n'), sesiId: s.id, hadir: n.H, total: total, izin: n.I, alpa: n.A, telat: n.T };
}

// ---------------------------------------------------------------------
// API untuk web app (dipanggil via google.script.run.apiCall atau doPost)
// ---------------------------------------------------------------------
const API = {
  login: function (pin) {
    const p = authPin_(pin);
    log_('Login', p.nama + (p.admin ? ' (Admin)' : '') + ' · bagian ' + p.bagian);
    return { token: buatToken_(pin), petugas: p, namaKelompok: getSettings_().namaKelompok, versiServer: VERSI_SERVER,
      paket: paketAwal_(p) };
  },
  /** Ringan: hanya daftar sesi (dipakai saat menunggu sesi dibuka). */
  init: function (token) { return infoAwal_(auth_(token)); },
  /** Lengkap: daftar sesi + data sesi terpilih dalam 1 panggilan. */
  mulai: function (token, pilihId) { return paketAwal_(auth_(token), pilihId); },
  logout: function (token) {
    if (/^[a-f0-9]{64}$/.test(String(token || ''))) CacheService.getScriptCache().remove('tok_' + token);
    return true;
  },
  bukaSesiHariIni: function (token, ket) {
    const p = auth_(token);
    if (!p.admin) throw new Error('Hanya Admin yang bisa membuka sesi. Hubungi Admin.');
    const k = bersihKet_(ket);
    const s = withLock_(() => {
      const id = 'S' + todayStr_().replace(/-/g, '');
      const sudahAda = getSesiList_().some(x => x.id === id);
      const sesi = bukaSesi_(todayStr_(), k || ketDefault_(), p.nama);
      if (!sudahAda) log_('Buka sesi', sesi.id + ' oleh ' + p.nama + (k ? ' · ' + k : ''));   // dicatat hanya jika sesi benar-benar baru
      else if (k) { ubahKet_(sesi, k); sesi.ket = k.replace(/^'/, ''); log_('Ubah keterangan', sesi.id + ' oleh ' + p.nama + ': ' + k); }
      return sesi;
    });
    const dto = sesiDto_(s);
    return Object.assign({}, dto, { sesi: dto, paket: paketAwal_(p, s.id) });
  },
  dataSesi: function (token, sesiId) { return dataSesi_(auth_(token), sesiId); },
  simpan: function (token, sesiId, changes) {
    const p = auth_(token);
    if (!Array.isArray(changes) || !changes.length) return { tersimpan: 0, ditolak: [] };
    if (changes.length > 400) throw new Error('Terlalu banyak data dalam satu kali simpan');
    let koreksi = false;
    const res = withLock_(() => {
      const s = sesiBoleh_(p, sesiId);
      if (s.status === SESI_TUTUP && !p.admin) throw new Error('SESI_DITUTUP: Sesi sudah ditutup. Scan tidak bisa disimpan — hubungi Admin untuk koreksi.');
      const r = simpanAbsen_(s, changes, p);
      if (s.status === SESI_TUTUP) {
        log_('Koreksi sesi ditutup', s.id + ' oleh ' + p.nama + ': ' + changes.map(c => c.id + '=' + (c.status || 'batal')).join(', ') + ' · tersimpan ' + r.tersimpan + (r.ditolak.length ? ' · ditolak ' + r.ditolak.join(',') : ''));
        koreksi = r.tersimpan > 0;
      }
      return r;
    });
    // Dashboard_Absensi berisi nilai (bukan rumus) dan hanya diperbarui otomatis selama ada sesi terbuka.
    // Koreksi pada sesi yang sudah ditutup harus memperbarui Dashboard sendiri (di luar lock agar tidak menahan HP/kiosk lain).
    if (koreksi) { try { refreshDashboard_(); } catch (e) { /* data tetap aman di tab Absensi */ } }
    return res;
  },
  /** Dipanggil tiap ±15 dtk oleh setiap HP. Hanya mengirim data jika versi berubah. */
  sinkron: function (token, sesiId, verKlien) {
    const p = auth_(token);
    const s = sesiBoleh_(p, sesiId);
    const snap = getAbsenSesi_(sesiId);
    if (verKlien && snap.ver === verKlien) return { ver: snap.ver, sama: true, status: s.status, sesi: sesiDto_(s) };
    return { ver: snap.ver, absen: snap.absen, telat: snap.telat || {}, info: snap.info || {}, status: s.status, sesi: sesiDto_(s) };
  },
  tutupSesi: function (token, sesiId) {
    const p = auth_(token);
    if (!p.admin) throw new Error('Hanya admin yang bisa menutup sesi');
    return withLock_(() => {
      const s = getSesiList_().find(x => x.id === sesiId);
      if (!s) throw new Error('Sesi tidak ditemukan');
      const res = tutupSesi_(s);
      log_('Tutup sesi', s.id + ' oleh ' + p.nama + ' · alpa ' + res.alpa);
      refreshDashboard_();
      return Object.assign({}, res, { paket: paketAwal_(p, s.id) });
    });
  },
  /** Admin: ubah keterangan / catatan sesi (kolom Keterangan di tab Sesi). */
  ubahKeterangan: function (token, sesiId, ket) {
    const p = auth_(token);
    if (!p.admin) throw new Error('Hanya Admin yang bisa mengubah keterangan sesi.');
    const k = bersihKet_(ket) || ketDefault_();
    return withLock_(() => {
      const s = sesiBoleh_(p, sesiId);
      ubahKet_(s, k);
      log_('Ubah keterangan', s.id + ' oleh ' + p.nama + ': ' + k);
      s.ket = k.replace(/^'/, '');   // tanda ' hanya penanda teks di Sheet
      return sesiDto_(s);
    });
  },
  /** Admin: teks rekap sesi yang sudah ditutup, untuk dikirim ke grup WhatsApp pengurus. */
  rekapPesan: function (token, sesiId) {
    const p = auth_(token);
    if (!p.admin) throw new Error('Hanya Admin yang bisa mengirim rekap.');
    const s = sesiBoleh_(p, sesiId);
    if (!sudahTutup_(s)) throw new Error('Rekap tersedia setelah sesi ditutup.');
    return rekapPesan_(s);
  },
  kartu: function (token) {
    const p = auth_(token);
    if (!p.admin) throw new Error('Hanya admin yang bisa mencetak kartu');
    return {
      namaKelompok: getSettings_().namaKelompok,
      jamaah: getMaster_().filter(j => j.id && j.status !== 'Nonaktif')
        .sort((a, b) => a.jk.localeCompare(b.jk) || a.nama.localeCompare(b.nama, 'id'))
        .map(j => ({ id: j.id, nama: j.nama, lengkap: j.lengkap, jk: j.jk })),
    };
  },
  // ===== KIOSK API (fitur baru v22) =====
  /**
   * Kiosk info: status sesi, daftar jamaah wajib absen, jumlah hadir, versi.
   * Dipakai untuk menampilkan status terkini & mendeteksi "sudah tercatat" secara instan.
   */
  kioskInfo: function (token) {
    const p = auth_(token);
    if (!p.kiosk) throw new Error('PIN ini bukan akun kiosk. Gunakan akun kiosk untuk tablet.');
    const today = todayStr_();
    const sesiBulanIni = getSesiList_().filter(x => x.tanggal.startsWith(today.slice(0, 7))).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const sesiHari = sesiBulanIni.find(x => x.tanggal === today);
    const set = getSettings_();
    let hadir = 0, sudah = {}, verData = 0;
    if (sesiHari && sesiHari.status === SESI_BUKA) {
      const snap = getAbsenSesi_(sesiHari.id);
      verData = snap.ver;
      Object.keys(snap.absen).forEach(id => {
        if (snap.absen[id] === ST.H) {
          hadir++;
          const jam = snap.info && snap.info[id] ? snap.info[id][0] : '';
          if (jam) sudah[id] = jam;
        }
      });
    }
    return {
      kelompok: set.namaKelompok,
      today: today,
      jadwal: { jamBuka: set.jamBuka, jamTutup: set.jamTutup, batasTepat: set.batasTepat },
      sesi: sesiHari ? { id: sesiHari.id, tanggal: sesiHari.tanggal, hari: sesiHari.hari || hariDari_(sesiHari.tanggal), ket: sesiHari.ket, status: sesiHari.status } : null,
      jamaah: getMaster_().filter(j => j.id && j.status === 'Aktif').map(j => ({ id: j.id, nama: j.nama })),
      hadir: hadir,
      sudah: sudah,
      ver: VERSI_SERVER,
      verData: verData,
    };
  },
  /**
   * Kiosk scan: catat absensi dari kiosk.
   * items: [{id, sumber: 'kamera'|'reader', t: epoch ms dari perangkat}]
   * Respons: {hasil: [{id, status: 'baru'|'sudah'|'ditolak', nama, jam}], hadir, ver}
   */
  kioskScan: function (token, sesiId, items) {
    const p = auth_(token);
    if (!p.kiosk) throw new Error('PIN ini bukan akun kiosk.');
    if (!Array.isArray(items) || !items.length) return { hasil: [], hadir: 0, ver: VERSI_SERVER };
    if (items.length > 100) throw new Error('Terlalu banyak item dalam satu scan');
    return withLock_(() => {
      const s = getSesiList_().find(x => x.id === sesiId);
      if (!s) throw new Error('Sesi tidak ditemukan');
      if (s.status === SESI_TUTUP) throw new Error('SESI_DITUTUP: Sesi sudah ditutup, tidak bisa mencatat.');
      if (s.status !== SESI_BUKA) throw new Error('Sesi belum dibuka.');
      if (s.tanggal !== todayStr_()) throw new Error('Kiosk hanya bisa mengakses sesi hari ini.');
      // Konversi items ke format simpanAbsen_
      const changes = items.map(x => ({
        id: String(x.id || '').trim().toUpperCase(),
        status: ST.H,
        metode: (x.sumber === 'reader' ? 'Mandiri (Reader)' : 'Mandiri (Kamera)'),
      })).filter(c => c.id);
      const result = simpanAbsen_(s, changes, p);
      // Respons ringkas untuk kiosk: hanya hasil per item + hadir total (tidak ada terlambat, tidak ada daftar seluruh jamaah)
      const hadir = Object.keys(result.absen || {}).filter(id => result.absen[id] === ST.H).length;
      const master = indexBy_(getMaster_(), 'id');   // sekali saja, bukan per item
      const hasil = items.map(x => {
        const id = String(x.id || '').trim().toUpperCase();
        const j = master[id];
        let st = 'ditolak';
        if (result.ditolak.indexOf(id) >= 0) st = 'ditolak';
        else if (result.sudah.indexOf(id) >= 0) st = 'sudah';
        else if (result.tersimpan > 0 && result.absen && result.absen[id] === ST.H) st = 'baru';
        const jam = result.info && result.info[id] ? result.info[id][0] : '';
        return { id: id, status: st, nama: (j && j.nama) || '', jam: jam };
      });
      return { hasil: hasil, hadir: hadir, ver: VERSI_SERVER };
    });
  },
  /**
   * Kiosk sinkron ringkas: hanya status sesi + jumlah hadir (untuk polling 15 detik).
   * Jika ver sama, respons hanya {ver, sama: true}, hemat bandwidth.
   */
  kioskSinkron: function (token, sesiId, verKlien) {
    const p = auth_(token);
    if (!p.kiosk) throw new Error('PIN ini bukan akun kiosk.');
    const s = getSesiList_().find(x => x.id === sesiId);
    if (!s) return { ver: VERSI_SERVER, status: 'tidak_ada', sama: true };
    // verKlien = versi DATA absen sesi (snap.ver, berubah tiap ada simpan dari kiosk/petugas mana pun),
    // bukan VERSI_SERVER (versi aplikasi, konstan) — dulu memakai VERSI_SERVER sehingga antar-tablet tidak pernah sinkron.
    const snap = getAbsenSesi_(sesiId);   // dari cache; murah
    if (verKlien && snap.ver === verKlien) return { ver: VERSI_SERVER, verData: snap.ver, sama: true, status: s.status };
    const hadir = Object.keys(snap.absen || {}).filter(id => snap.absen[id] === ST.H).length;
    const sudah = {};
    Object.keys(snap.absen || {}).forEach(id => {
      if (snap.absen[id] === ST.H && snap.info && snap.info[id]) {
        sudah[id] = snap.info[id][0];   // jam hadir
      }
    });
    return { ver: VERSI_SERVER, verData: snap.ver, status: s.status, hadir: hadir, sudah: sudah };
  },
};

/**
 * Aturan akses sesi:
 *  - Admin: semua sesi (untuk melihat & koreksi).
 *  - Petugas: HANYA sesi tanggal hari ini. Mencatat hanya jika sesi masih Terbuka.
 */
function sesiBoleh_(p, sesiId) {
  const s = getSesiList_().find(x => x.id === sesiId);
  if (!s) throw new Error('Sesi tidak ditemukan');
  if (!p.admin && s.tanggal !== todayStr_()) throw new Error('Petugas hanya bisa mengakses sesi hari ini.');
  if (s.status === SESI_ARSIP) throw new Error('Sesi ini sudah diarsipkan (hanya-baca). Lihat rekapnya di Dashboard.');
  return s;
}

/** Satu pintu untuk semua panggilan dari web app. */
function apiCall(fn, args) {
  if (!Object.prototype.hasOwnProperty.call(API, fn)) throw new Error('Fungsi tidak dikenal: ' + fn);
  MEMO_ = {};
  try { return API[fn].apply(null, Array.isArray(args) ? args : []); }
  finally { MEMO_ = null; }
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
    .filter(s => sudahTutup_(s) && s.tanggal.slice(0, 7) >= o.awal && s.tanggal.slice(0, 7) <= o.akhir)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const nilai = st => (st === ST.H || (st === ST.I && o.izinHadir)) ? 1 : 0;
  const wajib = st => st === ST.X ? 0 : 1;

  const J = {}, S = {}, B = {};
  sesiP.forEach(s => {
    S[s.id] = { tanggal: s.tanggal, hari: s.hari || hariDari_(s.tanggal), ket: s.ket || '', hL: 0, hP: 0, telat: 0, izin: 0, alpa: 0, num: 0, den: 0 };
    const b = s.tanggal.slice(0, 7);
    if (!B[b]) B[b] = { bulan: b, sesi: 0, ket: {}, numL: 0, denL: 0, numP: 0, denP: 0, hadir: 0, telat: 0 };
    B[b].sesi++;
    const k = String(s.ket || '').trim() || 'Pengajian rutin';
    B[b].ket[k] = (B[b].ket[k] || 0) + 1;
  });

  absen.forEach(r => {
    const ss = S[r.sesi];
    if (!ss) return;
    if (o.jk !== 'Semua' && r.jk !== o.jk) return;
    const st = r.status || ST.A;
    const j = J[r.id] || (J[r.id] = { id: r.id, nama: r.nama, jk: r.jk, hadir: 0, telat: 0, izin: 0, alpa: 0, kecuali: 0, num: 0, den: 0, seq: [] });
    const telat = st === ST.H && !!r.telat;
    if (st === ST.H) j.hadir++; else if (st === ST.I) j.izin++; else if (st === ST.X) j.kecuali++; else j.alpa++;
    if (telat) j.telat++;
    const v = nilai(st), d = wajib(st);
    j.num += v; j.den += d;
    j.seq.push({ t: ss.tanggal, st: st });
    if (st === ST.H) { if (r.jk === 'L') ss.hL++; else ss.hP++; if (telat) ss.telat++; }
    else if (st === ST.I) ss.izin++;
    else if (st !== ST.X) ss.alpa++;
    ss.num += v; ss.den += d;
    const b = B[ss.tanggal.slice(0, 7)];
    if (r.jk === 'L') { b.numL += v; b.denL += d; } else { b.numP += v; b.denP += d; }
    if (st === ST.H) { b.hadir++; if (telat) b.telat++; }
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
    return { id: j.id, nama: j.nama, jk: j.jk, hadir: j.hadir, telat: j.telat, pctTepat: pct(j.hadir - j.telat, j.hadir),
      izin: j.izin, alpa: j.alpa, kecuali: j.kecuali,
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
    hadir: sum(jamaah, j => j.hadir),
    telat: sum(jamaah, j => j.telat),
  };
  ringkas.pctTepat = pct(ringkas.hadir - ringkas.telat, ringkas.hadir);
  const sesi = sesiP.map(s => { const x = S[s.id]; return Object.assign({}, x, { pct: pct(x.num, x.den) }); });
  const bulan = Object.keys(B).sort().map(k => {
    const b = B[k];
    // "8 sesi: Pengajian rutin 5, Pengajian Lansia 2, ASAD 1" (dari kolom Keterangan di tab Sesi)
    const rinci = Object.keys(b.ket).sort((x, y) => b.ket[y] - b.ket[x] || x.localeCompare(y))
      .map(x => Object.keys(b.ket).length > 1 ? x + ' ' + b.ket[x] : x).join(', ');
    return { bulan: k, sesi: b.sesi, sesiTeks: b.sesi + ' sesi: ' + rinci, pct: pct(b.numL + b.numP, b.denL + b.denP), pctL: pct(b.numL, b.denL), pctP: pct(b.numP, b.denP),
      pctTelat: pct(b.telat, b.hadir) };
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

  // Filter "Tampilkan" (C6)
  const c6 = sh.getRange('C6');
  const opsiTampil = ['Semua', 'Kurang & Perlu Perhatian', 'Sering Terlambat'];
  sh.getRange('B6').setValue('Tampilkan').setFontWeight('bold');
  c6.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(opsiTampil, true).build())
    .setBackground('#fff59d').setFontWeight('bold')
    .setBorder(true, true, true, true, true, true, '#c9a400', SpreadsheetApp.BorderStyle.SOLID);
  let tampil = String(c6.getValue() || '').trim();
  if (opsiTampil.indexOf(tampil) < 0) { tampil = 'Semua'; c6.setValue(tampil); }

  // Data absensi: tab Absensi + tab Arsip_<tahun> bila periode mencakup sesi yang sudah diarsipkan
  const perluArsip = sesiAll.some(x => x.status === SESI_ARSIP && x.tanggal.slice(0, 7) >= awal && x.tanggal.slice(0, 7) <= akhir);
  let mentah = readAbsen_();
  if (perluArsip) {
    for (let t = Number(awal.slice(0, 4)); t <= Number(akhir.slice(0, 4)); t++) mentah = mentah.concat(readArsip_(t));
  }
  const absen = mentah.map(r => ({
    sesi: String(r[AX.SESI]), id: String(r[AX.ID]).trim().toUpperCase(), nama: String(r[AX.NAMA]),
    jk: normJK_(r[AX.JK]), status: String(r[AX.STATUS] || '').trim(),
    telat: /^ya$/i.test(String(r[AX.TELAT] || '').trim()),
  }));
  const R = hitungRekap_(sesiAll, absen, {
    awal: awal, akhir: akhir, jk: jk,
    ambangKurang: set.ambangKurang, ambangPerhatian: set.ambangPerhatian, izinHadir: set.izinHadir,
  });
  renderDashboard_(sh, R, set, awal, akhir, jk === 'Semua' ? 'Pria & Wanita' : (jk === 'L' ? 'Pria' : 'Wanita'), tampil);
  renderSesiBerjalan_(sh, hitungSesiBerjalan_(sesiAll, absen, getMaster_(), jk));
}

/**
 * Angka sementara untuk sesi yang MASIH TERBUKA (belum ditutup): hadir/izin/belum.
 * Tidak masuk rekap resmi (yang belum datang belum dianggap Alpa).
 */
function hitungSesiBerjalan_(sesiAll, absen, master, jk) {
  const buka = sesiAll.filter(x => !sudahTutup_(x)).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  if (!buka.length) return null;
  const s = buka[0];
  const wajib = master.filter(j => j.id && j.jk && j.status === 'Aktif' && (jk === 'Semua' || j.jk === jk));
  const idWajib = {}; wajib.forEach(j => { idWajib[j.id] = j.jk; });
  const r = { sesi: s, hL: 0, hP: 0, telat: 0, izin: 0, total: wajib.length, tL: 0, tP: 0 };
  wajib.forEach(j => { if (j.jk === 'L') r.tL++; else r.tP++; });
  absen.forEach(a => {
    if (a.sesi !== s.id || !idWajib[a.id]) return;
    if (a.status === ST.H) { if (idWajib[a.id] === 'L') r.hL++; else r.hP++; if (a.telat) r.telat++; }
    else if (a.status === ST.I) r.izin++;
  });
  r.hadir = r.hL + r.hP;
  r.belum = Math.max(0, r.total - r.hadir - r.izin);
  r.pct = r.total ? r.hadir / r.total : null;
  return r;
}
function renderSesiBerjalan_(sh, r) {
  sh.getRange(6, 11, 3, 9).clear();   // termasuk posisi panel versi lama (kolom K)
  if (!r) {
    sh.getRange(6, 12).setValue('Tidak ada sesi yang sedang berjalan.').setFontColor('#888888').setFontStyle('italic');
    return;
  }
  const s = r.sesi;
  sh.getRange(6, 12).setValue('🟢 Sesi Berjalan (live) — ' + (s.hari || hariDari_(s.tanggal)) + ', ' + labelTgl_(s.tanggal, true) +
    (s.ket ? ' · ' + s.ket : '') +
    '  ·  angka sementara, diperbarui tiap ±5 menit').setFontWeight('bold').setFontColor('#1b5e20');
  sh.getRange(7, 12, 1, 8).setValues([['Hadir', 'Terlambat', 'Pria', 'Wanita', 'Izin', 'Belum Datang', 'Wajib Absen', '% Hadir Sementara']])
    .setFontSize(9).setFontColor('#555555').setWrap(true).setVerticalAlignment('bottom');
  sh.getRange(8, 12, 1, 8).setValues([[r.hadir, r.telat, r.hL + ' / ' + r.tL, r.hP + ' / ' + r.tP, r.izin, r.belum, r.total, pv_(r.pct)]])
    .setFontSize(16).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(8, 19).setNumberFormat('0.0%');
  sh.getRange(8, 13).setFontColor('#b7791f');
  sh.getRange(7, 12, 2, 8).setBackground('#e8f5e9');
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

/** Saring daftar jamaah sesuai pilihan "Tampilkan". */
function saringJamaah_(daftar, tampil, set) {
  if (tampil === 'Kurang & Perlu Perhatian') return daftar.filter(j => j.kategori === 'Kurang' || j.kategori === 'Perlu Perhatian');
  if (tampil === 'Sering Terlambat') {
    return daftar.filter(j => j.hadir > 0 && j.telat > 0 && (j.telat / j.hadir) * 100 >= set.seringTelat)
      .sort((a, b) => (b.telat / b.hadir) - (a.telat / a.hadir) || b.telat - a.telat || a.nama.localeCompare(b.nama));
  }
  return daftar;
}
function renderDashboard_(sh, R, set, awal, akhir, jkLabel, tampil) {
  tampil = tampil || 'Semua';
  const totalJ = R.jamaah.length;
  R = Object.assign({}, R, { jamaah: saringJamaah_(R.jamaah, tampil, set) });
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
    ['Ganti pilihan di kolom kuning → dashboard diperbarui otomatis. Rekap hanya menghitung sesi yang sudah Ditutup; sesi yang masih berjalan tampil di panel "Sesi Berjalan" (kanan atas).'],
  ]).setFontColor('#666666').setFontStyle('italic');

  // KPI
  const k = R.ringkas;
  sh.getRange(7, 2, 1, 9).setValues([['Jumlah Sesi', 'Jamaah Dihitung', 'Rata-rata Kehadiran', 'Rata-rata Pria',
    'Rata-rata Wanita', 'Baik', 'Perlu Perhatian', 'Kurang', 'Tepat Waktu (dari yang hadir)']])
    .setFontSize(9).setFontColor('#555555').setWrap(true).setVerticalAlignment('bottom');
  sh.getRange(8, 2, 1, 9).setValues([[k.sesi, k.jamaah, pv_(k.pct), pv_(k.pctL), pv_(k.pctP), k.baik, k.perhatian, k.kurang, pv_(k.pctTepat)]])
    .setFontSize(16).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(8, 4, 1, 3).setNumberFormat('0.0%');
  sh.getRange(8, 10).setNumberFormat('0.0%').setFontColor('#7c5a00');
  sh.getRange(7, 2, 2, 9).setBackground('#f1f8f4');
  sh.getRange(8, 7).setFontColor('#1e7e34');
  sh.getRange(8, 8).setFontColor('#b7791f');
  sh.getRange(8, 9).setFontColor('#c0392b');

  // Rekap per bulan (B..G) & tren per sesi (H..P)
  sh.setColumnWidth(10, 140);   // Keterangan sesi
  sh.setColumnWidth(16, 92);
  tabel_(sh, 10, 2, 'Rekap per Bulan', ['Bulan', 'Sesi & Keterangan', '% Total', '% Pria', '% Wanita', '% Terlambat'],
    R.bulan.map(b => [labelBulan_(b.bulan), b.sesiTeks, pv_(b.pct), pv_(b.pctL), pv_(b.pctP), pv_(b.pctTelat)]), [2, 3, 4, 5]);
  tabel_(sh, 10, 8, 'Tren per Sesi', ['Tanggal', 'Hari', 'Keterangan', 'Hadir Pria', 'Hadir Wanita', 'Terlambat', 'Izin', 'Alpa', '% Kehadiran'],
    R.sesi.map(s => [labelTgl_(s.tanggal, beda), s.hari, s.ket, s.hL, s.hP, s.telat, s.izin, s.alpa, pv_(s.pct)]), [8]);
  if (R.sesi.length) sh.getRange(12, 10, R.sesi.length, 1).setWrap(true);

  if (R.sesi.length) {
    try {
      const n = R.sesi.length;
      const chart = sh.newChart()
        .setChartType(Charts.ChartType.LINE)
        .addRange(sh.getRange(11, 8, n + 1, 1))
        .addRange(sh.getRange(11, 16, n + 1, 1))
        .setNumHeaders(1)
        .setPosition(10, 18, 0, 0)
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
  const rows = R.jamaah.map((j, i) => [i + 1, j.id, j.nama, j.jk, j.hadir, j.telat, pv_(j.pctTepat), j.izin, j.alpa, j.kecuali,
    j.dihitung, pv_(j.pct), j.beruntun, j.kategori]);
  const judulJ = tampil === 'Semua' ? 'Rekap per Jamaah — urut dari kehadiran terendah'
    : tampil === 'Sering Terlambat' ? 'Rekap per Jamaah — Sering Terlambat (≥ ' + set.seringTelat + '% kehadirannya terlambat): ' + nJ + ' dari ' + totalJ + ' jamaah'
    : 'Rekap per Jamaah — Kurang & Perlu Perhatian: ' + nJ + ' dari ' + totalJ + ' jamaah (urut dari kehadiran terendah)';
  tabel_(sh, jr, 2, judulJ,
    ['No', 'ID', 'Nama', 'JK', 'Hadir', 'Terlambat', '% Tepat Waktu', 'Izin', 'Alpa', 'Dikecualikan', 'Sesi Dihitung', '% Kehadiran', 'Alpa Beruntun*', 'Kategori'],
    rows, [6, 11]);
  if (nJ) {
    const warna = { 'Kurang': '#fde2e1', 'Perlu Perhatian': '#fff4ce', 'Baik': '#e6f4ea', 'Dikecualikan': '#eeeeee' };
    const bg = R.jamaah.map(j => { const c = warna[j.kategori] || '#ffffff'; return [c, c, c]; });
    sh.getRange(jr + 2, 13, nJ, 3).setBackgrounds(bg);   // % Kehadiran, Alpa Beruntun, Kategori
    sh.getRange(jr + 2, 15, nJ, 1).setFontWeight('bold');
    // sorot ketertiban: kolom Terlambat & % Tepat Waktu kuning jika pernah terlambat
    const bgT = R.jamaah.map(j => { const c = j.telat ? '#fff4ce' : '#ffffff'; return [c, c]; });
    sh.getRange(jr + 2, 7, nJ, 2).setBackgrounds(bgT);
  }
  sh.getRange(jr + 3 + Math.max(nJ, 1), 2)
    .setValue('* Alpa Beruntun = jumlah alpa berturut-turut pada sesi-sesi terakhir dalam periode (izin/hadir memutus hitungan).  ' +
      'Terlambat = hadir setelah Batas Tepat Waktu (' + set.batasTepat + '); % Tepat Waktu = (Hadir − Terlambat) ÷ Hadir.')
    .setFontColor('#888888').setFontStyle('italic');
}

function onEdit(e) {
  try {
    const r = e && e.range;
    if (!r) return;
    if (r.getSheet().getName() === SH.SET) { terapkanValidasiKet_(); return; }   // daftar keterangan berubah -> dropdown tab Sesi ikut
    if (r.getSheet().getName() !== SH.DASH) return;
    if (r.getColumn() <= 3 && r.getLastColumn() >= 3 && r.getRow() <= 6 && r.getLastRow() >= 3) refreshDashboard_();
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
    .addItem('Rapikan tab Absensi (perbaiki baris rusak/kosong)', 'rapikanAbsensi')
    .addItem('Hapus data satu sesi (mis. data uji)...', 'hapusDataSesi')
    .addItem('Arsipkan data 1 tahun (setahun sekali, tiap Januari)...', 'arsipkanData')
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
  if (kurang.length) {
    sh.getRange(sh.getLastRow() + 1, 2, kurang.length, 1).setNumberFormat('@');
    sh.getRange(sh.getLastRow() + 1, 1, kurang.length, 3).setValues(kurang);
  }
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
  terapkanValidasiKet_();   // dropdown Keterangan

  // Absensi
  sh = ensureSheet_(SH.ABSEN, HDR.ABSEN);
  if (String(sh.getRange(1, AX.TELAT + 1).getValue()) !== HDR.ABSEN[AX.TELAT]) {
    sh.getRange(1, 1, 1, HDR.ABSEN.length).setValues([HDR.ABSEN]); styleHeader_(sh, HDR.ABSEN.length);
  }
  sh.getRange('C:C').setNumberFormat('yyyy-mm-dd');
  sh.getRange('J:J').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sh.hideColumns(1);

  // Dashboard
  sh = ss.getSheetByName(SH.DASH) || ss.insertSheet(SH.DASH, 0);
  sh.setHiddenGridlines(true);
  sh.getRange('B1').setFontSize(18).setFontWeight('bold').setFontColor('#1b5e20');
  sh.getRange('B3:B6').setValues([['Bulan Awal'], ['Bulan Akhir'], ['Jenis Kelamin'], ['Tampilkan']]).setFontWeight('bold');
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
  lengkapiPengaturan_();
  const nama = ['buatSesiOtomatis', 'tutupSesiOtomatis', 'jadwalOtomatis'];
  ScriptApp.getProjectTriggers().forEach(t => { if (nama.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('jadwalOtomatis').timeBased().everyMinutes(5).create();
  const set = getSettings_();
  SpreadsheetApp.getUi().alert('Otomatisasi terpasang ✅\n' +
    '- Sesi DIBUKA otomatis pukul ' + set.jamBuka + ' pada hari: ' + set.hari.join(', ') + '\n' +
    '- Sesi DITUTUP otomatis pukul ' + set.jamTutup + ' (yang tidak tercatat = Alpa) & dashboard diperbarui\n' +
    '- Dicek setiap 5 menit (ketelitian ±5 menit). Jam bisa diubah di tab Pengaturan.');
}

function menuBukaSesiHariIni() {
  const s = withLock_(() => bukaSesi_(todayStr_(), ketDefault_(), 'Admin (menu)'));
  refreshDashboard_();
  SpreadsheetApp.getUi().alert('Sesi aktif: ' + s.id + ' (' + (s.hari || hariDari_(s.tanggal)) + ', ' + s.tanggal + ')');
}
function menuTutupSesiLewat() {
  const n = tutupSesiOtomatis();
  SpreadsheetApp.getUi().alert(n + ' sesi ditutup. Dashboard diperbarui.');
}
function menuRefreshDashboard() {
  hapusSemuaCacheAbsen_();   // ikut membaca ulang edit manual di tab Absensi
  refreshDashboard_();
  ss_().toast('Dashboard diperbarui');
}

// ---------------------------------------------------------------------
// Arsip tahunan: pindahkan baris absensi tahun-tahun lalu ke tab Arsip_Absensi
// ---------------------------------------------------------------------
function tabArsip_(tahun) { return SH.ARSIP + tahun; }
function readArsip_(tahun) {
  const sh = ss_().getSheetByName(tabArsip_(tahun));
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, HDR.ABSEN.length).getValues();
}
/**
 * Menu: arsipkan SATU tahun (default: tahun lalu) ke tab Arsip_<tahun>.
 * Baris dipindah dari tab Absensi, sesinya ditandai "Diarsipkan" (hanya-baca). Rekap tetap bisa dilihat di Dashboard.
 */
function arsipkanData() {
  const ui = SpreadsheetApp.getUi();
  const tahunIni = Number(todayStr_().slice(0, 4));
  const r = ui.prompt('Arsipkan data 1 tahun',
    'Tahun yang akan diarsipkan (default: ' + (tahunIni - 1) + ').\n' +
    'Data absensi tahun tersebut dipindah ke tab "' + tabArsip_('<tahun>') + '". Rekapnya tetap bisa dilihat di Dashboard; sesinya menjadi hanya-baca.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const tahun = Number(String(r.getResponseText() || '').trim() || (tahunIni - 1));
  if (!(tahun >= 2000 && tahun < tahunIni)) { ui.alert('Tahun harus sebelum ' + tahunIni + ' (tahun berjalan tidak bisa diarsipkan).'); return; }
  const diTahun = x => x.tanggal.slice(0, 4) === String(tahun);
  const masihBuka = getSesiList_().filter(x => diTahun(x) && !sudahTutup_(x));
  if (masihBuka.length) { ui.alert('Masih ada ' + masihBuka.length + ' sesi tahun ' + tahun + ' yang belum ditutup. Jalankan dulu menu "Tutup sesi yang sudah lewat".'); return; }
  const sesiArsip = getSesiList_().filter(x => diTahun(x) && x.status === SESI_TUTUP);
  if (!sesiArsip.length) { ui.alert('Tidak ada sesi tahun ' + tahun + ' yang perlu diarsipkan (mungkin sudah diarsipkan).'); return; }
  const idSet = {}; sesiArsip.forEach(x => { idSet[x.id] = true; });
  const pindah = [], rows = [];
  readAbsen_().forEach((x, i) => { if (idSet[String(x[AX.SESI]).trim()]) { pindah.push(x); rows.push(i + 2); } });
  const ok = ui.alert('Konfirmasi arsip ' + tahun, sesiArsip.length + ' sesi dengan ' + pindah.length + ' baris absensi tahun ' + tahun +
    ' akan dipindah ke tab "' + tabArsip_(tahun) + '".\nLanjutkan?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  withLock_(() => {
    const ss = ss_();
    let ar = ss.getSheetByName(tabArsip_(tahun));
    if (!ar) {
      ar = ss.insertSheet(tabArsip_(tahun));
      ar.getRange(1, 1, 1, HDR.ABSEN.length).setValues([HDR.ABSEN]);
      styleHeader_(ar, HDR.ABSEN.length);
      ar.getRange('C:C').setNumberFormat('yyyy-mm-dd');
      ar.getRange('J:J').setNumberFormat('yyyy-mm-dd hh:mm:ss');
      ar.hideColumns(1);
    }
    if (pindah.length) ar.getRange(ar.getLastRow() + 1, 1, pindah.length, HDR.ABSEN.length).setValues(pindah);   // 1) salin dulu
    hapusBaris_(sheet_(SH.ABSEN), rows);                                                                          // 2) baru hapus
    const ssh = sheet_(SH.SESI);
    sesiArsip.forEach(x => { ssh.getRange(x.row, 5).setValue(SESI_ARSIP); hapusCacheAbsen_(x.id); });
    lupakan_('sesi');
    log_('Arsip data', 'Tahun ' + tahun + ': ' + sesiArsip.length + ' sesi · ' + pindah.length + ' baris dipindah ke ' + tabArsip_(tahun));
    refreshDashboard_();
  });
  ui.alert('Arsip ' + tahun + ' selesai ✅', sesiArsip.length + ' sesi & ' + pindah.length + ' baris dipindah ke tab "' + tabArsip_(tahun) + '".\n' +
    'Rekap ' + tahun + ' tetap bisa dipilih di Dashboard (Bulan Awal/Akhir).', ui.ButtonSet.OK);
}

function hapusSemuaCacheAbsen_() { getSesiList_().forEach(x => hapusCacheAbsen_(x.id)); }
function tanggalDariIdSesi_(id) { const m = String(id).match(/^S(\d{4})(\d{2})(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; }

/** Hapus baris-baris (nomor baris naik) secara berkelompok dari bawah ke atas. */
function hapusBaris_(sh, rows) {
  rows = rows.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < rows.length) {
    let akhir = rows[i], awal = akhir;
    while (i + 1 < rows.length && rows[i + 1] === awal - 1) { i++; awal = rows[i]; }
    sh.deleteRows(awal, akhir - awal + 1);
    i++;
  }
}

/**
 * Menu: Rapikan tab Absensi.
 *  - Baris yang hanya tersisa Key (kolom A tersembunyi) + status -> kolom ID_Sesi, Tanggal, ID, Nama, JK diisi ulang.
 *  - Baris kosong / hanya tersisa Key tanpa status -> dihapus.
 *  - Baris ganda (sesi & jamaah sama) -> yang paling awal dipertahankan.
 */
function rapikanAbsensi() {
  const ui = SpreadsheetApp.getUi();
  const hasil = withLock_(() => {
    const sh = sheet_(SH.ABSEN);
    const data = readAbsen_();
    const master = indexBy_(getMaster_(), 'id');
    const sesiMap = indexBy_(getSesiList_(), 'id');
    const hapus = [], seen = {};
    let diperbaiki = 0;
    data.forEach((r, i) => {
      const row = i + 2;
      let sid = String(r[AX.SESI] || '').trim(), jid = String(r[AX.ID] || '').trim().toUpperCase();
      const key = String(r[AX.KEY] || '').trim(), st = String(r[AX.STATUS] || '').trim();
      if (!(sid && jid)) {
        const m = key.match(/^(S\d{8}(?:-\d+)?)\|(.+)$/);
        if (!(st && m)) { hapus.push(row); return; }
        sid = m[1]; jid = m[2].toUpperCase();
        const j = master[jid] || {}, se = sesiMap[sid];
        sh.getRange(row, 1, 1, 6).setValues([[sid + '|' + jid, sid, se ? se.tanggal : tanggalDariIdSesi_(sid), jid, j.nama || '', j.jk || '']]);
        diperbaiki++;
      } else if (key !== sid + '|' + jid) {
        sh.getRange(row, 1).setValue(sid + '|' + jid);
      }
      const k = sid + '|' + jid;
      if (seen[k]) hapus.push(row); else seen[k] = true;
    });
    hapusBaris_(sh, hapus);
    hapusSemuaCacheAbsen_();
    refreshDashboard_();
    log_('Rapikan Absensi', diperbaiki + ' baris diperbaiki, ' + hapus.length + ' baris kosong/ganda dihapus');
    return { diperbaiki: diperbaiki, dihapus: hapus.length };
  });
  ui.alert('Rapikan tab Absensi ✅', hasil.diperbaiki + ' baris diperbaiki (kolom sesi/ID/nama diisi ulang).\n' +
    hasil.dihapus + ' baris kosong/ganda dihapus.\nDashboard diperbarui.', ui.ButtonSet.OK);
}

/** Menu: hapus satu sesi beserta seluruh data absensinya (mis. data uji coba). */
function hapusDataSesi() {
  const ui = SpreadsheetApp.getUi();
  const daftar = getSesiList_().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 10)
    .map(x => x.id + '  (' + (x.hari || hariDari_(x.tanggal)) + ', ' + x.tanggal + ', ' + x.status + ')').join('\n');
  const r = ui.prompt('Hapus data satu sesi',
    'Ketik ID sesi yang akan dihapus (mis. S20261121).\nSesi terakhir:\n' + (daftar || '(belum ada)'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const id = String(r.getResponseText() || '').trim().toUpperCase();
  const sesi = getSesiList_().find(x => x.id === id);
  if (!sesi) { ui.alert('ID sesi "' + id + '" tidak ditemukan.'); return; }
  const ok = ui.alert('Konfirmasi', 'Hapus sesi ' + id + ' (' + sesi.tanggal + ') beserta SELURUH data absensinya?\nTindakan ini tidak bisa dibatalkan (kecuali lewat Riwayat Versi Google Sheet).', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const n = withLock_(() => {
    const sh = sheet_(SH.ABSEN);
    const rows = [];
    readAbsen_().forEach((x, i) => {
      if (String(x[AX.SESI] || '').trim() === id || String(x[AX.KEY] || '').indexOf(id + '|') === 0) rows.push(i + 2);
    });
    hapusBaris_(sh, rows);
    const ar = ss_().getSheetByName(tabArsip_(sesi.tanggal.slice(0, 4)));
    if (ar && sesi.status === SESI_ARSIP) {
      const rA = [];
      readArsip_(sesi.tanggal.slice(0, 4)).forEach((x, i) => { if (String(x[AX.SESI] || '').trim() === id) rA.push(i + 2); });
      hapusBaris_(ar, rA);
    }
    sheet_(SH.SESI).deleteRow(sesi.row);
    lupakan_('sesi');
    hapusCacheAbsen_(id);
    refreshDashboard_();
    log_('Hapus sesi', id + ' (' + rows.length + ' baris absensi) oleh pemilik file');
    return rows.length;
  });
  ui.alert('Sesi ' + id + ' dihapus ✅ (' + n + ' baris absensi). Dashboard diperbarui.');
}
function menuLinkWebApp() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(url ? 'Link web app untuk petugas:\n\n' + url
    : 'Belum di-deploy. Buka Apps Script → Deploy → Deployment baru → Aplikasi web.');
}