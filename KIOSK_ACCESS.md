# Cara Mengakses Kiosk Presensi Mandiri

## URL Kiosk

### GitHub Pages (Primary)
```
https://smeargle-sys.github.io/WEB_ABSEN_BBK02/kiosk.html
```

### Deployment IDs
- **Kiosk Backend (Apps Script):**
  - Deployment ID: `AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT`
  - Script ID: `1drwcNba-exKhQJGSG62dI7oXMVesrfQWeimVFfmnXIrYKQAsDkxcmRm_`
  - Versi: v22

---

## Setup Kiosk

### 1. Petugas Setup (Di Tab "Petugas" di Admin Panel)

Sebelum kiosk bisa digunakan, setup dulu:

#### Login ke Admin Panel
- Buka: https://script.google.com/macros/s/AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT/exec
- Login dengan credentials admin

#### Buka Tab "Petugas"
- Klik tab "Petugas" di UI

#### Tambah Entry Kiosk
Isi form dengan:
- **Nama**: "Kiosk Entrance" atau nama lokasi kiosk
- **PIN**: Nomor PIN untuk login kiosk (misal: 1234)
- **Bagian**: Pilih "Semua" (kiosk bisa scan semua bagian) atau pilih bagian spesifik
- **Peran**: Pilih dropdown, select **"Kiosk"** (PENTING!)

#### Save
Klik tombol "Simpan" atau "Tambah"

**Result**: Entry baru dengan Peran="Kiosk" ter-save di database.

---

### 2. Buka Kiosk di Tablet/Device

#### URL Akses Kiosk
```
https://smeargle-sys.github.io/WEB_ABSEN_BBK02/kiosk.html
```

#### Atau akses langsung dari GitHub Pages
1. Buka browser di tablet
2. Ketik URL di address bar
3. Tekan Enter

#### Login Kiosk
- **PIN**: Input PIN yang sudah di-setup di Petugas (misal: 1234)
- Klik "Login"
- **Result**: Layar kiosk terbuka, kamera siap scan QR

---

## Workflow Kiosk

### 1. Login
```
Layar awal (Lock Screen dengan wallpaper merah)
     ↓
Tekan tombol / tap untuk buka PIN input
     ↓
Masukkan PIN (misal 1234)
     ↓
Klik tombol "Login"
     ↓
✅ Login berhasil → Masuk ke scanner screen
```

### 2. Scan Peserta
```
Scanner aktif (kamera siap)
     ↓
Arahkan QR code peserta ke kamera
     ↓
QR ter-scan otomatis
     ↓
Verifikasi data peserta (nama, bagian, status)
     ↓
✅ Presensi tercatat
     ↓
Auto-lock setelah 3 detik
     ↓
Siap scan peserta berikutnya
```

### 3. Auto-Lock
Jika tidak ada scan selama ~5 menit, kiosk auto-lock ke lock screen (untuk keamanan).

---

## Login Credentials untuk Test

### Setup Test Kiosk
Di Tab Petugas, buat entry:
- Nama: "Test Kiosk"
- PIN: "1234"
- Bagian: "Semua"
- Peran: "Kiosk"

### Akses Kiosk
1. Buka: https://smeargle-sys.github.io/WEB_ABSEN_BBK02/kiosk.html
2. Input PIN: **1234**
3. Klik "Login"
4. Ready to scan!

---

## QR Code Generation

### Peserta QR
QR code untuk peserta bisa digenerate dari:
- Admin Panel → Tab "Peserta" → Export QR (atau generate per-peserta)
- Format QR: `peran:PESERTA|npm:12345|nama:John Doe|bagian:Teknik Informatika`

### Test QR
Gunakan online QR generator untuk test:
- https://qr-code-generator.com/
- Input format: `peran:PESERTA|npm:12345|nama:Test User|bagian:Semua`

---

## Troubleshooting

### "PIN Salah"
- Verifikasi PIN di Tab Petugas
- Pastikan entry dengan Peran="Kiosk" sudah ter-save

### "Kamera tidak berfungsi"
- Izinkan akses kamera di browser (tombol "Allow" / izin kamera)
- Coba refresh halaman: Ctrl+R (Windows) atau Cmd+R (Mac)
- Test di browser lain (Chrome recommended)

### "QR tidak ter-scan"
- Pastikan QR code fokus di kamera
- Cahaya cukup (tidak gelap)
- QR code format benar: `peran:PESERTA|npm:...|nama:...|bagian:...`

### "Versi mismatch" (21 vs 22)
- Hardrefresh browser: Ctrl+Shift+R (Windows) atau Cmd+Shift+R (Mac)
- Bersihkan cache: Settings > Clear Cache & Cookies

### "Tidak bisa login ke kiosk.html"
1. Verifikasi config.js ada di repo:
   ```bash
   curl -s https://raw.githubusercontent.com/smeargle-sys/WEB_ABSEN_BBK02/main/config.js | head -5
   ```
2. Jika error, cek GitHub Pages setting di repo settings

---

## File Structure (GitHub Pages)

```
GitHub Repo (WEB_ABSEN_BBK02)
├── kiosk.html           ← Kiosk UI (GitHub Pages)
├── index.html           ← Admin panel (GitHub Pages - fallback, main di Apps Script)
├── config.js            ← Config dengan API_URL
├── Code.js              ← Backend (hanya di Apps Script, tidak di GitHub)
└── ...
```

**Penting:**
- `kiosk.html` + `config.js` dimuat dari GitHub Pages
- `config.js` berisi `API_URL` yang mengarah ke Apps Script deployment
- `Code.js` hanya ada di Apps Script (server-side)

---

## Kiosk API Endpoints

Backend (Apps Script) menyediakan 3 API untuk Kiosk:

### 1. kioskInfo
```javascript
POST /exec?action=kioskInfo&pin=1234

Response:
{
  "id": "petugas-id-123",
  "nama": "Kiosk Entrance",
  "bagian": "Semua",
  "versiServer": 22
}
```

### 2. kioskScan
```javascript
POST /exec?action=kioskScan
Body: { qr: "peran:PESERTA|npm:12345|nama:John|bagian:Teknik" }

Response:
{
  "status": "ok",
  "npm": "12345",
  "nama": "John Doe",
  "bagian": "Teknik Informatika",
  "waktu": "2024-11-25 14:30:45"
}
```

### 3. kioskSinkron
```javascript
POST /exec?action=kioskSinkron
Body: { petugas_id: "...", scans: [...] }

Response:
{
  "status": "ok",
  "total_synced": 10
}
```

---

## Maintenance

### Update Kiosk UI
- Edit `kiosk.html` di repo
- Push ke GitHub
- GitHub Pages auto-deploy (refresh browser kiosk)

### Update Kiosk API
- Edit `Code.js` di repo
- Push ke GitHub
- Deploy ke Apps Script: `clasp push --force`
- Redeploy: `clasp redeploy DEPLOYMENT_ID`
- **Important:** Update version: `VERSI_SERVER` di `Code.js` dan `VERSI_APP` di `kiosk.html` harus match

### Monitor Kiosk Activity
- Buka Admin Panel → Tab "Log" atau "Report"
- Filter: Peran="Kiosk"
- Lihat scan history

---

## Quick Links

| Item | Link |
|------|------|
| Kiosk UI | https://smeargle-sys.github.io/WEB_ABSEN_BBK02/kiosk.html |
| Admin Panel | https://script.google.com/macros/s/AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT/exec |
| GitHub Repo | https://github.com/smeargle-sys/WEB_ABSEN_BBK02 |
| Apps Script Editor | https://script.google.com/home/all (cari "ABSEN_BBK02 Server") |

---

**Last Updated:** Nov 25, 2024 (v22 Deployment)
