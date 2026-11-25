# Kiosk: Kamera Hitam (Tidak Mendeteksi Kamera)

**Tanggal:** 2026-11-26
**File terdampak:** `kiosk.html`
**Status:** ✅ Selesai, sudah dites dan berhasil

---

## Gejala

- Setelah login kiosk dan sesi berstatus **Terbuka**, kotak kamera hanya hitam.
- Tulisan "📱 Arahkan kamera ke kartu QR" tetap tampil, dan status di bawahnya tertulis "Menunggu scan...".
- Browser **tidak pernah menampilkan pop-up izin kamera**.
- Tidak ada `alert`, dan console tidak menampilkan error.

## Penyebab Utama

State awal di `kiosk.html` salah:

```js
var S = {
  ...
  scanning: true,   // ❌ BUG
  ...
};
```

Sementara itu, baris pertama `startCamera()` berisi penjaga berikut:

```js
function startCamera() {
  if (S.scanning || !S.token) return;   // langsung keluar karena scanning sudah true
  ...
}
```

Karena `S.scanning` sudah bernilai `true` sejak awal, `startCamera()` **selalu keluar sebelum memanggil kamera**. Akibatnya:

- `getUserMedia` / `Html5Qrcode.getCameras()` tidak pernah dipanggil, sehingga pop-up izin tidak muncul.
- Blok `.catch` tidak pernah jalan, sehingga tidak ada error atau alert.
- `#reader` tetap kosong dan yang terlihat hanya latar hitam `.cam-box`.

### Mengapa sulit ditemukan

Masalahnya terlihat seperti masalah kamera, izin, HTTPS, atau constraint perangkat, sehingga perbaikan sebelumnya mengarah ke sana. Lihat riwayat commit:

- `ux: add loading indicator screen during initialization`
- `fix: wait for DOMContentLoaded before showing loading screen`
- `fix: add constraint fallback for different camera types`

Padahal kode kamera **tidak pernah dieksekusi**. Kode tidak menghasilkan error apa pun, jadi tidak ada petunjuk di console. Kuncinya ada di membaca alur state: nilai awal `S.scanning` dibandingkan dengan penjaga di `startCamera()`.

> **Pelajaran:** kalau sebuah fitur diam saja tanpa error dan tanpa pop-up izin, cek dulu apakah fungsinya benar-benar dipanggil sampai selesai (pasang `console.log` di baris pertama dan setelah setiap `return` awal). Jangan langsung mengubah constraint atau konfigurasi kamera.

---

## Perbaikan

### 1. Nilai awal state (perbaikan utama)

```js
scanning: false,
```

### 2. `startCamera()` ditulis ulang agar lebih tahan banting

- **Pengecekan awal:** `window.isSecureContext` dan `navigator.mediaDevices.getUserMedia`. Jika gagal, tampilkan pesan bahwa kamera butuh HTTPS/localhost dan browser yang mendukung.
- **Status di layar** untuk setiap tahap:
  - `⏳ Meminta izin kamera...`
  - Setelah 10 detik tanpa jawaban: `⏳ Menunggu izin kamera — klik "Allow"...`
  - `✅ Kamera aktif · menunggu scan...`
- **Fallback kamera berurutan:** kamera depan/FaceTime (berdasarkan label) → `{ facingMode: 'user' }` → `{ facingMode: 'environment' }` → semua kamera lain yang terdeteksi. Kode lama mencoba ulang `start()` dengan kamera yang sama.
- **Pesan error yang jelas:**
  | Error browser | Pesan ke pengguna |
  |---|---|
  | `NotAllowedError` / Permission | Izin kamera ditolak, izinkan di pengaturan situs lalu refresh |
  | `NotFoundError` | Kamera tidak ditemukan |
  | `NotReadableError` / TrackStart | Kamera sedang dipakai aplikasi lain (Zoom/Meet/FaceTime) |
- **Tombol "Coba lagi"** muncul di status saat gagal.
- **Petunjuk kamera** (`#camHint`) disembunyikan setelah video aktif, supaya tidak menutupi gambar. Ditambahkan juga `pointer-events: none`.
- **Ukuran kotak QR** sekarang 70% dari sisi terpendek video, tidak lagi tetap 250px.

### 3. Fungsi baru `camGagal(msg)` dan `stopCamera()`

- `camGagal()` mereset `scanning` dan menampilkan pesan error beserta tombol "Coba lagi".
- `stopCamera()` dipakai saat sesi berubah menjadi tidak Terbuka (di polling sinkron). Fungsi ini menghentikan dan membersihkan scanner **serta mereset `S.scanning = false`**. Sebelumnya hanya `S.qrScanner.stop()` yang dipanggil, sehingga `scanning` tetap `true` dan kamera **tidak akan menyala lagi** saat sesi dibuka kembali. Bug ini sejenis dengan bug utama.

---

## Catatan Pengujian

- Jangan tes di **panel preview editor** (VS Code Simple Browser / Live Preview), karena biasanya tidak bisa mengakses kamera. Gunakan Chrome/Safari di `http://localhost:...` atau URL GitHub Pages (HTTPS).
- macOS: pastikan browser diberi izin di **System Settings → Privacy & Security → Camera**.
- Tutup aplikasi lain yang sedang memakai kamera (Zoom, Meet, FaceTime).

### Checklist uji

- [x] Login kiosk, sesi Terbuka: pop-up izin muncul, video tampil, status "✅ Kamera aktif"
- [ ] Tolak izin: muncul pesan "Izin kamera ditolak" dan tombol "Coba lagi"
- [ ] Sesi ditutup lalu dibuka lagi: kamera menyala kembali otomatis
- [ ] Scan kartu QR: hasil scan muncul
