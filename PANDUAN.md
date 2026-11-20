# Panduan Pemasangan — Absensi Online Pengajian

## A. Pasang (±20 menit, sekali saja)
1. Login sebagai **egarchandra@gmail.com**, lalu buat **Google Sheet baru** bernama **ABSENSI BBK02** di folder absensi: https://drive.google.com/drive/folders/1sf8hY__HGSviOfgFe2jxD99vY95yWziH. Folder ini berbeda dari folder file sensus, dan itu tidak masalah karena file sensus dibaca lewat ID-nya.
   - Data jamaah **dibaca** dari file **SENSUS BBK02 Dashboard** → tab **Jamaah**. ID file ini sudah terisi otomatis di tab Pengaturan. File sensus **tidak diubah sama sekali**.
   - Rekap absensi dan dashboard **ditulis** di file baru ini.
2. Di file baru: menu **Ekstensi → Apps Script**.
3. Hapus isi `Code.gs`, lalu tempel isi file **Code.gs**.
4. Klik **+ → HTML**, beri nama **Index** (tanpa .html), lalu tempel isi file **Index.html**. Klik **Simpan**.
5. Kembali ke Sheet, lalu muat ulang (refresh). Akan muncul menu **Absensi** → pilih **1. Setup awal**. Saat diminta izin, pilih akun egarchandra → *Advanced* → *Go to (unsafe)* → *Allow*. Peringatan ini standar untuk script buatan sendiri. Izin ini dipakai untuk membaca file sensus dan menulis ke file absensi.
6. Tab **Jamaah** (di file sensus) dibaca apa adanya dan **tidak pernah diubah** oleh script. Kolom yang dipakai (dicari berdasarkan judul, urutan bebas):
   - **ID Jamaah**: isi QR code dan kunci data absensi. Jangan diubah setelah dipakai.
   - **Nama Absen**: nama yang tampil saat absen. **Nama Lengkap** tampil sebagai keterangan.
   - **Jenis Kelamin** (`L`/`P`).
   - **Flag Absen** (kolom J): `Y` = wajib absen, masuk daftar dan dihitung. `N` = tidak wajib, tidak muncul dan tidak dihitung.
   - **Status Keberadaan**: hanya ditampilkan sebagai label, misalnya "Mondok" atau "Kerja Luar".
7. Menu **Absensi → 2. Cek data Jamaah** untuk melihat laporan ID kosong/ganda, Flag selain Y/N, dan data yang tidak konsisten.
8. Tab **Petugas**: ganti PIN contoh (123456 / 111111 / 222222). Isi **Bagian** `L` atau `P` untuk petugas, dan **Peran** `Admin` untuk pengurus.
9. Tab **Pengaturan**: sudah terisi Nama Kelompok *BBK02*, Hari *Senin, Jumat*, dan ID file sensus. Atur Ambang Kurang %, Ambang Perhatian %, dan Izin Dihitung Hadir sesuai kebutuhan.
   - Perubahan di tab Jamaah terbaca otomatis paling lambat **5 menit** (ada cache supaya scan cepat). Untuk memuat seketika, pakai menu **2. Cek data Jamaah**.
10. Di Apps Script: **Deploy → Deployment baru → Jenis: Aplikasi web**
    - Jalankan sebagai: **Saya**
    - Yang memiliki akses: **Siapa saja** (petugas cukup memakai PIN, tanpa login Google)
    - Salin URL `/exec`, lalu bagikan ke petugas. Sebaiknya simpan di layar utama HP.
11. Menu **Absensi → 3. Pasang otomatisasi**.

> Setiap kali kode diubah: **Deploy → Kelola deployment → Edit → Versi baru**. Dengan cara ini, URL tidak berubah.

## B. Pemakaian rutin
| Siapa | Kapan | Apa |
|---|---|---|
| Sistem | ±05:00 di hari pengajian | Sesi dibuat otomatis |
| Petugas Pria & Wanita | Saat pengajian | Buka link → PIN → scan QR atau tekan **Hadir**/**Izin**. Tersimpan otomatis. |
| Sistem | ±01:00 esok harinya | Sesi ditutup: yang tidak tercatat = **Alpa**, yang Dikecualikan = tidak dihitung |
| Pengurus | Kapan saja | Tab **Dashboard_Absensi** → pilih Bulan Awal, Bulan Akhir, dan Jenis Kelamin |
| Pengurus | Jika ada perubahan jamaah | Cukup ubah tab **Jamaah** (Flag Absen / jamaah baru). Berlaku di sesi berikutnya; riwayat lama tidak berubah. |

Tap **Hadir** sekali lagi untuk membatalkan. Admin tetap bisa mengoreksi sesi yang sudah ditutup.

## C. Scan QR & cadangannya
**Setelah QR di-scan**, panel besar menampilkan **Nama Absen**, Nama Lengkap, dan statusnya. Kehadiran **langsung tercatat**, dan ada tombol **Batalkan** jika salah scan. Warna panel:
- 🟢 Hijau: HADIR, tersimpan
- 🔵 Biru: sudah tercatat sebelumnya, tidak dobel
- 🟠 Oranye: tidak wajib absen (Flag N) atau bagian lain (misalnya QR wanita di-scan petugas pria)
- 🔴 Merah: QR tidak dikenal

Di bawah panel ada riwayat 5 scan terakhir.

Urutan pilihan saat absen:
1. **📷 Scan QR**: kamera live. Kamera live bisa saja diblokir di web app Apps Script karena aturan keamanan Google. Jika diblokir, aplikasi otomatis menyarankan opsi berikutnya.
2. **🖼️ Scan dari Foto**: kamera HP memotret kartu, lalu QR dibaca. Opsi ini selalu bisa dipakai.
3. **Ketik ID lalu Enter** di kolom cari. Cara ini juga cocok untuk **scanner barcode Bluetooth** (±Rp150–300 rb), yang paling cepat untuk antrean panjang.
4. **Cari nama → Hadir**, untuk jamaah yang lupa membawa kartu.

**Cetak kartu**: login dengan PIN Admin → **Cetak Kartu QR** → **Cetak**. Kartu juga bisa di-screenshot dan dikirim ke HP jamaah.

**Opsional, kamera live dijamin jalan**: hosting `Index.html` di GitHub Pages (gratis). Isi `var API_URL = '...URL /exec...'` di bagian atas script. Aplikasinya sama, dan data tetap tersimpan di Sheet yang sama.

## D. Tab yang dibuat (di file ABSENSI BBK02)
Tab **Jamaah** tetap berada di file SENSUS BBK02 Dashboard, dan dikelola di sana seperti biasa. Jangan ubah ID Jamaah yang sudah dipakai.

| Tab | Isi | Boleh diedit manual? |
|---|---|---|
| Dashboard_Absensi | Ringkasan, rekap per bulan, tren per sesi + grafik, rekap per jamaah | Hanya 3 sel kuning (filter) |
| Pengaturan | Nama kelompok, hari, ambang, aturan izin | Ya |
| Petugas | Nama, PIN, bagian, peran | Ya |
| Sesi | Daftar sesi (Terbuka/Ditutup) | Boleh menambah sesi insidental |
| Absensi | Transaksi absensi (1 baris = 1 jamaah per sesi) | Sebaiknya tidak |

## E. Rumus persentase
`% Kehadiran = Hadir ÷ (Hadir + Izin + Alpa)` untuk sesi pada periode yang dipilih.
- Hanya jamaah dengan **Flag Absen = Y** pada saat sesi ditutup yang masuk hitungan. Jika Flag diubah ke N (misalnya mulai mondok), sesi berikutnya tidak dihitung lagi, tetapi riwayat sebelumnya tetap ada.
- Jika **Izin Dihitung Hadir = YA**, rumusnya menjadi `(Hadir + Izin) ÷ (Hadir + Izin + Alpa)`.
- Kategori: **Kurang** < ambang kurang ≤ **Perlu Perhatian** < ambang perhatian ≤ **Baik**.
