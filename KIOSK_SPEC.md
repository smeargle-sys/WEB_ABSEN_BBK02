# Spesifikasi Fitur: Kiosk Presensi Mandiri — Absensi Pengajian BBK02

> Dokumen serah-terima untuk dikerjakan di IDE (Claude Code). Berisi konteks sistem yang sudah berjalan, keputusan desain yang sudah disepakati, dan rincian perubahan yang perlu dibuat.
> Mockup layar: https://claude.ai/artifact/BHxN55HEyFvCTnoqUMNpzc

---

## 1. Latar belakang

Aplikasi absensi online sudah dipakai di pengajian rutin dan diterima baik. Beberapa jamaah meminta bisa **absen sendiri (self tap)** tanpa menunggu petugas memindai kartunya.

Opsi yang dipertimbangkan:

| Opsi | Status |
|---|---|
| **Kiosk**: tablet/HP di pintu masuk, jamaah menempelkan kartu QR-nya sendiri | **Dikerjakan sekarang** (dokumen ini) |
| Halaman presensi pribadi dengan akun jamaah | Backlog: butuh pendaftaran akun, reset sandi, dan pencegahan absen dari rumah |
| Pengajian ibu-ibu & pra-remaja (filter peserta) | Ditunda sampai uji coba pengajian rutin selesai. **Jangan** dibuat ulang. |

---

## 2. Baseline sistem (versi 21)

### 2.1 Komponen

| Bagian | Lokasi | Catatan |
|---|---|---|
| Tampilan petugas | Repo publik GitHub `smeargle-sys/web_absen_bbk02`: `index.html` (VERSI_APP = 21) + `config.js` | Di-host GitHub Pages (kamera tidak bisa di iframe Apps Script) |
| Server | Apps Script `Code.gs` (VERSI_SERVER = 21) + file HTML `Index` (isi sama dengan index.html), terikat ke Google Sheet **ABSENSI BBK02** | **Tidak boleh** masuk repo publik |
| Data jamaah | Tab **Jamaah** di file **SENSUS BBK02 Dashboard** | **Hanya dibaca**, tidak pernah diubah oleh sistem |
| Panduan | `PANDUAN.md` | Jangan diunggah ke repo publik |

Repo publik hanya boleh berisi `index.html`, `config.js`, dan (nanti) `kiosk.html`.

### 2.2 Konvensi yang wajib dijaga

- **Panggilan API**: `fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({fn, args})})`. `text/plain` sengaja dipakai untuk menghindari preflight CORS. Respons berbentuk `{ok, data}` atau `{ok:false, error}`. Ada cadangan `google.script.run.apiCall(fn, args)` bila halaman dibuka dari Apps Script.
- **Fungsi baru** ditambahkan ke objek `API` di Code.gs, lalu dipanggil lewat `apiCall(fn, args)` / `doPost`.
- **Auth**: `login(pin)` mengembalikan token (cache `tok_<hex>`, TTL 6 jam = `TOKEN_TTL` 21600, maksimum Apps Script). `auth_(token)` memvalidasi ulang PIN ke tab Petugas di setiap panggilan. Error yang berawalan `SESI_HABIS:` berarti harus login ulang. Ada lockout 20 kali salah PIN per 10 menit.
- **Tab Petugas**: kolom `Nama | PIN | Bagian (Semua/L/P) | Peran | Aktif`. `getPetugasByPin_` saat ini mengembalikan `{nama, bagian, admin}` dengan `admin = /admin/i.test(Peran)`.
- **Penulisan data** selalu di dalam `withLock_` (LockService, reentrant). Snapshot per sesi disimpan di cache `absen_v2_<sesiId>` = `{ver, absen, telat, info}` dan ditulis langsung saat menyimpan (write-through).
- **Simpan absen**: `simpanAbsen_` dipanggil dari `API.simpan(token, sesiId, changes)`.
  - `changes = [{id, status: 'Hadir'|'Izin'|'', metode}]`.
  - Metode yang sah ada di `METODE_VALID = ['Scan QR','Foto QR','Ketik ID','Manual']`.
  - Kalau status sama sudah tercatat, scan ganda **tidak menimpa** data pertama (dikembalikan di `sudah`).
  - Keterlambatan dihitung **di server** (`sekarang_()` dibanding `Batas Tepat Waktu`), dan hanya untuk sesi yang terbuka hari ini.
- **Aturan sesi** (`sesiBoleh_`): petugas hanya boleh mengakses sesi **hari ini**, Admin boleh semua sesi, dan sesi yang sudah diarsipkan ditolak. Sesi dibuka otomatis pada jam buka di Hari Pengajian dan ditutup otomatis pada jam tutup (trigger `jadwalOtomatis` tiap 5 menit). Hanya Admin yang bisa membuka atau menutup sesi secara manual.
- **Tab Absensi** (12 kolom): `Key | ID_Sesi | Tanggal | ID_Jamaah | Nama | JK | Status | Metode | Petugas | Waktu | Terlambat | Menit Terlambat` (konstanta `AX`).
- **Versi**: `VERSI_SERVER` (Code.gs) dan `VERSI_APP` (html) dicocokkan.
  - Server lebih lama → aplikasi menampilkan banner peringatan.
  - Aplikasi lebih lama → aplikasi memuat ulang sendiri dengan `?v=`.
  - **Naikkan keduanya** bila API berubah.
- **Deploy**: selalu lewat **Kelola deployment → Edit → Versi baru**, supaya URL /exec tidak berubah. Jangan membuat "Deployment baru".
- **Palet UI** (sama dengan aplikasi petugas):

  | Peran warna | Warna |
  |---|---|
  | Header | merah gradasi `#ED0226 → #B90024` (mockup `#E30425 → #A8001F`) |
  | Tombol | navy `#1F2A5A` |
  | Hadir | hijau `#15803D` (latar `#E9F7EE`) |
  | Terlambat | kuning kunyit `#E3A008` (teks `#92400E`) |
  | Izin | ungu `#7C3AED` |
  | Error | merah `#DC2626` |

  Font sistem di aplikasi, ikon garis SVG inline, **tanpa emoji**.

---

## 3. Keputusan desain yang sudah disepakati

1. **Pembaca QR**: **kamera depan** tablet (html5-qrcode, `facingMode: 'user'`, preview dicerminkan) **dan** **QR reader USB/Bluetooth** (keyboard-wedge) dibaca **bersamaan**, tanpa perlu diatur. Uji coba dimulai dengan kamera saja. QR reader cukup dicolokkan bila diperlukan.
2. **Kiosk hanya mencatat Hadir.** Tidak ada Izin, batal, koreksi, atau daftar nama di layar.
3. **Layar kiosk TIDAK menampilkan "terlambat".** Semua yang datang mendapat panel hijau yang sama, karena layar dilihat banyak jamaah. Status terlambat tetap dihitung server dan hanya terlihat di dashboard pengurus.
4. **Layar kembali siap otomatis ±3 detik** setelah hasil tampil.
5. **Kartu tidak dikenal atau bukan wajib absen** menampilkan pesan netral yang sama: *"Kartu belum dikenali — silakan ke petugas di meja absensi"*. Tidak menyebut Flag Absen.
6. Data dari kiosk tercatat dengan **metode tersendiri**, supaya pengurus bisa membedakannya dari scan petugas.

---

## 4. Layar (lihat mockup)

Orientasi tablet **landscape**, desain 1180×820, dibuat responsif untuk portrait atau HP.

| # | Keadaan | Isi |
|---|---|---|
| 0 | **Terkunci** (sesi belum dibuka / sudah ditutup) | Header + jam. Pesan: *"Presensi dibuka pukul 19:30"* atau *"Sesi hari ini sudah ditutup"*. Kamera mati. Polling tiap 15–30 detik; terbuka sendiri saat sesi dibuka. *(Belum ada di mockup.)* |
| 1 | **Siap scan** | Header merah (*Presensi Mandiri · BBK02*, tanggal · keterangan sesi · status, jam besar). Kiri: preview kamera depan + kotak bidik. Kanan: judul *"Tempelkan kartu QR Anda ke kamera"*, 3 langkah, dan kotak info *"Lupa kartu atau HP mati? Silakan ke petugas di meja absensi."* Footer: *Mode kiosk · hanya mencatat kehadiran* + *Hadir hari ini: N*. |
| 1b | **Siap scan, mode QR reader** (varian) | Area kamera diganti ilustrasi alat + panah *"Tempelkan kartu ke alat pemindai di bawah layar"*. Dipakai bila kamera dimatikan lewat pengaturan kiosk. |
| 2 | **Berhasil** | Panel hijau penuh, ikon centang, **nama besar** (Nama Absen), *"Hadir · tercatat 19:38"*, *"Jazakallahu khoiro, silakan masuk."*, bar hitung mundur 3 detik. |
| 3 | **Sudah tercatat** | Panel navy, *"Sudah tercatat pukul 19:38"*, *"Tidak perlu scan lagi. Silakan masuk."* |
| 4 | **Kendala** | Panel kuning, *"Kartu belum dikenali"*, *"Silakan ke petugas di meja absensi."* Juga dipakai untuk jamaah bukan wajib absen dan ID tidak dikenal. |
| 5 | **Koneksi bermasalah** (indikator kecil, bukan layar penuh) | Ikon/teks kecil di footer, mis. *"3 data menunggu dikirim"*. Hasil tetap tampil hijau; data diantrikan dan dikirim ulang otomatis. |

Bunyi dan getar dibedakan: sukses (nada tinggi pendek), sudah tercatat (dua nada pendek), kendala (nada rendah).

---

## 5. Perubahan server (Code.gs → versi 22)

### 5.1 Peran Kiosk
- Tab Petugas: nilai baru pada kolom **Peran** = `Kiosk`. Bagian diisi `Semua`. Satu baris per perangkat kiosk, mis. *Kiosk Pintu Pria*, masing-masing dengan PIN unik.
- `getPetugasByPin_` menambahkan `kiosk: /kiosk/i.test(Peran)`. Kiosk **tidak pernah** admin.
- `login` dan `infoAwal_` / `paketAwal_` mengembalikan flag `kiosk`.

### 5.2 Pembatasan akun kiosk (dicek di server, bukan hanya di UI)
- Hanya boleh: `login`, `logout`, `init` / `mulai` (versi ringkas, lihat 5.3), `kioskScan`, `sinkron` (ringkas).
- **Ditolak** untuk akun kiosk: `simpan` (status Izin/batal), `bukaSesiHariIni`, `tutupSesi`, `ubahKeterangan`, `rekapPesan`, `kartu`, `dataSesi` lengkap.
- Kiosk hanya boleh mencatat ke **sesi hari ini yang berstatus Terbuka**. Sesi yang sudah ditutup ditolak dengan error berawalan `SESI_DITUTUP:`.

### 5.3 API baru (usulan)
```text
kioskInfo(token) → {
  kelompok, today, jadwal: {jamBuka, jamTutup},
  sesi: {id, tanggal, hari, ket, status} | null,
  jamaah: [{id, nama}],      // hanya jamaah wajib absen (Flag Absen = Y), untuk tampilan instan
  hadir: <jumlah hadir hari ini>,
  sudah: {<id>: 'HH:mm'},    // yang sudah Hadir, agar layar "Sudah tercatat" bisa instan
  ver
}

kioskScan(token, sesiId, items) → {
  hasil: [{id, status: 'baru'|'sudah'|'ditolak', nama, jam}],
  hadir, ver
}
// items: [{id, sumber: 'kamera'|'reader', t: <epoch ms dari perangkat>}]
```
- `kioskScan` memakai ulang `simpanAbsen_` dengan `status: 'Hadir'` dan metode baru. Scan pertama tetap dipertahankan, dan keterlambatan dihitung server seperti biasa.
- `METODE_VALID` ditambah `'Mandiri (Kamera)'` dan `'Mandiri (Reader)'`. Kolom **Petugas** diisi nama akun kiosk.
- Mendukung **batch** supaya antrean offline bisa dikirim sekaligus.
- Respons **tidak** membawa info terlambat dan **tidak** membawa daftar status seluruh jamaah. Yang dibawa hanya hasil per item + jumlah hadir.
- `sinkron` untuk kiosk cukup mengembalikan `{ver, hadir, sudah, status sesi}`, supaya scan dari petugas lain juga dikenali sebagai "sudah tercatat".

### 5.4 Lain-lain
- Naikkan `VERSI_SERVER` ke 22.
- Catat di tab **Log** saat akun kiosk login dan logout.
- Dashboard tidak perlu diubah (perhitungan persentase tetap sama). Opsional: jumlah per metode di panel *Sesi Berjalan*.

---

## 6. Perubahan klien

### 6.1 File baru `kiosk.html` (disarankan)
Dibuat terpisah dari `index.html` supaya aplikasi petugas tidak terganggu. File ini memakai `config.js` yang sama dan disimpan di repo publik yang sama. URL kiosk: `…github.io/web_absen_bbk02/kiosk.html`.

Fungsi yang dibutuhkan:
1. **Login kiosk dengan PIN**, sekali saat perangkat dipasang. Token disimpan di `localStorage` dengan kunci tersendiri, mis. `absen_bbk02_kiosk`.
   - Akun yang bukan Kiosk ditolak, dengan pesan *"PIN ini bukan akun kiosk"*.
   - Token 6 jam cukup untuk satu sesi (dipasang ±19:15, tutup 23:59 → perlu diperhatikan; lihat Pertanyaan terbuka #4).
2. **Layar penuh + layar tetap menyala**:
   - `document.documentElement.requestFullscreen()` setelah tap pertama.
   - Wake Lock API (`navigator.wakeLock.request('screen')`), diminta ulang pada `visibilitychange`.
3. **Kamera depan**: `Html5Qrcode.start({facingMode:'user'}, {fps:10, aspectRatio:1, qrbox: 70%})`. Preview dicerminkan (CSS `transform: scaleX(-1)` pada `video`), lalu cek apakah QR masih terbaca. Bila `facingMode` ditolak, pilih kamera dari `getCameras()` yang labelnya *front/depan/user*.
4. **QR reader (keyboard-wedge)**: listener `keydown` global yang menampung karakter.
   - Input dianggap dari alat bila jeda antarkarakter < ~50 ms dan diakhiri `Enter`.
   - Abaikan ketikan manual yang lambat.
   - Cadangan: `<input>` tersembunyi yang selalu difokuskan (perlu diuji di Android Chrome dan iPad Safari).
   - Tanpa keyboard virtual muncul: `inputmode="none"`.
5. **Normalisasi ID**: `trim().toUpperCase()`. Scan ID yang sama dalam 5 detik diabaikan (debounce, seperti `onScan` di index.html).
6. **Hasil instan dari data lokal**:
   - ID ada di `jamaah` dan belum di `sudah` → panel hijau.
   - ID sudah di `sudah` → panel navy.
   - ID tidak ada → panel kuning.
   - Penyimpanan dilakukan di belakang layar lewat `kioskScan`.
7. **Antrean offline**: item yang belum terkirim disimpan di `localStorage` dan dikirim ulang dengan backoff. Indikator jumlah antrean tampil di footer.
8. **Kembali ke "Siap" otomatis** setelah 3 detik. Scan baru saat hasil masih tampil langsung diproses dan menggantikan hasil sebelumnya.
9. **Polling**:
   - Saat terkunci: `kioskInfo` tiap 15–30 detik sampai sesi terbuka.
   - Saat siap: `sinkron` ringkas tiap 15 detik untuk jumlah hadir dan daftar `sudah`.
   - Bila status menjadi *Ditutup*: kamera dimatikan, tampil layar 0.
10. **Keluar dari mode kiosk**: tekan lama (±3 detik) di logo/header, lalu masukkan **PIN Admin**. Jamaah tidak bisa keluar tanpa PIN.
11. **Pengaturan kiosk** (di balik PIN Admin): kamera aktif/mati (mode reader saja), pilih kamera, volume.
12. **Pengecekan versi**: pakai `VERSI_APP` dan aturan reload yang sama dengan index.html.
13. **Tanpa emoji**. Ikon SVG garis. Teks besar (judul ≥ 48px, nama ≥ 72px), cocok untuk jamaah lansia.

### 6.2 `index.html`
- Tidak wajib diubah. Opsional: tampilkan metode *Mandiri* di Timeline, mis. *"19:41 · Pria · mandiri (kiosk pintu)"*. Teks metode dipetakan di `METODE_TEKS`.
- Bila VERSI dinaikkan, naikkan juga `VERSI_APP` di index.html supaya cocok dengan server.

---

## 7. Keamanan & privasi
- Akun kiosk adalah akun dengan hak paling kecil. Pembatasannya ditegakkan **di server**.
- Perangkat kiosk tidak menampilkan daftar nama atau persentase. Data `jamaah` (id + nama) hanya ada di memori perangkat.
- Status terlambat tidak dikirim ke kiosk.
- Kiosk ditempatkan di area yang diawasi petugas. Risiko yang tersisa: jamaah menitipkan kartu ke orang lain. Ini diterima untuk tahap uji coba.
- Repo tetap publik dan hanya berisi HTML + config. Jangan menaruh PIN atau ID file Sheet di repo.

---

## 8. Kriteria penerimaan (uji coba)
1. Akun Peran = Kiosk bisa login di `kiosk.html`. Akun petugas/admin biasa ditolak di kiosk. Akun Kiosk ditolak di `index.html`, atau diarahkan ke kiosk.
2. Sebelum jam buka, kiosk menampilkan layar terkunci, lalu terbuka sendiri ≤ 30 detik setelah sesi dibuka (otomatis atau oleh Admin).
3. Kartu wajib absen di-scan lewat kamera depan → panel hijau dengan nama dalam ≤ 1 detik. Di tab Absensi tercatat `Hadir`, metode `Mandiri (Kamera)`, Petugas = nama akun kiosk, dan kolom Terlambat terisi benar menurut server.
4. Hal yang sama lewat QR reader USB/Bluetooth → metode `Mandiri (Reader)`, tanpa menyentuh layar.
5. Scan ulang kartu yang sama → panel *Sudah tercatat* dengan jam scan pertama. Data pertama tidak berubah.
6. Jamaah yang sudah di-scan petugas di HP lain → kiosk menampilkan *Sudah tercatat* setelah sinkron.
7. ID tidak dikenal / Flag Absen N → panel kuning, tidak ada baris baru di tab Absensi.
8. Wi-Fi diputus, 3 kartu di-scan → tetap tampil hijau, footer menampilkan *3 data menunggu*. Setelah koneksi pulih, ketiganya tersimpan dengan jam server.
9. Panggilan `simpan` (Izin), `tutupSesi`, `dataSesi` lengkap, atau `rekapPesan` dengan token kiosk ditolak server.
10. Layar tidak mati selama sesi, dan keluar dari kiosk hanya bisa dengan PIN Admin.
11. Setelah sesi ditutup (otomatis), kiosk kembali ke layar terkunci. Jamaah yang belum tercatat menjadi Alpa seperti biasa.
12. Dashboard dan rekap WhatsApp tetap benar, dan scan kiosk ikut terhitung.

---

## 9. Langkah pemasangan (setelah selesai)
1. Apps Script: ganti `Code.gs` → **Deploy → Kelola deployment → Edit → Versi baru**. URL tidak berubah.
2. GitHub: unggah `kiosk.html` (dan `index.html` bila VERSI_APP dinaikkan). `config.js` tidak perlu diubah.
3. Tab Petugas: tambah baris `Kiosk Pintu Pria | <PIN acak> | Semua | Kiosk | Ya` (dan baris lain per perangkat).
4. Tablet: buka `…/kiosk.html`, login PIN kiosk, izinkan kamera, tap sekali untuk layar penuh. Sebaiknya aktifkan *screen pinning* (Android) atau *Guided Access* (iPad).
5. Perbarui `PANDUAN.md`: bagian baru *Kiosk presensi mandiri*.

---

## 10. Pertanyaan terbuka (putuskan sebelum/selama pengerjaan)
1. Perangkat kiosk: tablet Android atau iPad? Berapa unit (satu bersama, atau pria & wanita terpisah)?
2. Orientasi: landscape (sesuai mockup) atau portrait dengan stand?
3. Kiosk hanya untuk jamaah wajib absen, atau jamaah Flag N juga boleh tercatat? Saat ini: ditolak dengan pesan netral.
4. Token 6 jam: cukup bila kiosk dipasang ≥ 18:00 untuk sesi yang tutup 23:59. Bila perlu lebih lama, pertimbangkan token kiosk yang diperpanjang otomatis (re-issue saat `sinkron`).
5. Perlukah suara sapaan, mis. *"Hadir, terima kasih"* lewat SpeechSynthesis, atau cukup bunyi bip?
6. Perlukah foto/selfie saat scan untuk mencegah titip kartu? Saran: **tidak** untuk tahap ini, demi privasi dan kecepatan.

---

## 11. Di luar cakupan
- Halaman presensi pribadi dengan akun jamaah (backlog).
- Pengajian ibu-ibu & pra-remaja / filter peserta (ditunda; sudah dihapus dari kode, jangan dibuat ulang tanpa permintaan).
- NFC, GPS / geofence, QR sesi berganti di layar.
