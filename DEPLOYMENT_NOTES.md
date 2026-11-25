# Deployment Notes — Versi 22 (Kiosk Feature)

## 📤 Deployment Status: ✅ COMPLETE (Clasp Push)

**Tanggal:** 25 November 2026
**Method:** Google Clasp (CLI)
**Status:** Code.js sudah di-push ke Apps Script

---

## 📋 Push Details

```
Script ID: 1drwcNba-exKhQJGSG62dI7oXMVesrfQWeimVFfmnXIrYKQAsDkxcmRm_
Deployment ID: AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT
Web App URL: https://script.google.com/macros/s/.../exec
```

**Files Pushed (via Clasp):**
- ✅ Code.js (v22 dengan API kiosk)
- ✅ Index.html
- ✅ config.js
- ✅ kiosk.html
- ✅ appsscript.json

---

## 🔧 Verifikasi Deployment (di Apps Script)

Setelah push Clasp, lakukan verifikasi manual di Google Apps Script:

### 1. Cek VERSI_SERVER

Buka **Code.js** di Apps Script, cari:
```javascript
const VERSI_SERVER = 22;  // ✅ Harus 22 (bukan 21)
```

### 2. Cek METODE_VALID

Pastikan ada 2 metode baru:
```javascript
const METODE_VALID = [
  'Scan QR', 
  'Foto QR', 
  'Ketik ID', 
  'Manual',
  'Mandiri (Kamera)',      // ✅ NEW
  'Mandiri (Reader)'       // ✅ NEW
];
```

### 3. Cek API Kiosk

Pastikan ada 3 fungsi baru di object `API`:
```javascript
API.kioskInfo(token)      // ✅ NEW
API.kioskScan(...)        // ✅ NEW
API.kioskSinkron(...)     // ✅ NEW
```

### 4. Cek Flag Kiosk

Pastikan ada di `getPetugasByPin_`:
```javascript
kiosk: /kiosk/i.test(r[3])  // ✅ NEW
```

---

## 🚀 Final Deployment Steps (Manual)

### Step 1: Deploy ke Web App
1. Buka Apps Script
2. Klik **Deploy** (atas kanan)
3. Pilih **Kelola deployment**
4. Klik **Edit** pada deployment yang ada
5. Di dropdown **Version**, pilih **"Versi baru"** (BUKAN "Deployment baru")
6. Klik **Deploy**

**PENTING:** URL /exec harus **TETAP SAMA** setelah deploy.

### Step 2: Verifikasi Web App
Buka Web App URL di browser:
```
https://script.google.com/macros/s/AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT/exec
```

Jika normal (halaman login) → ✅ Deploy berhasil

### Step 3: Tambah PIN Kiosk di Tab Petugas
1. Buka Google Sheet "ABSENSI BBK02"
2. Tab "Petugas" → tambah baris baru
3. Isi sesuai contoh:

| Nama | PIN | Bagian | Peran | Aktif |
|------|-----|--------|-------|-------|
| Kiosk Pintu Masuk | 999888 | Semua | Kiosk | Ya |

**PENTING:** 
- Kolom **Peran** HARUS = "Kiosk" (case-sensitive)
- PIN HARUS hanya angka
- PIN HARUS unik (berbeda dari petugas lain)

### Step 4: Test Login Petugas
1. Buka: https://.../web_absen_bbk02/index.html (GitHub Pages)
2. Login dengan PIN petugas
3. Pastikan normal

### Step 5: Test Login Kiosk
1. Buka: https://.../web_absen_bbk02/kiosk.html (GitHub Pages)
2. Login dengan PIN kiosk (999888)
3. Pastikan normal

---

## 📝 Change Summary

| Aspek | Perubahan |
|-------|-----------|
| **VERSI_SERVER** | 21 → 22 |
| **METODE_VALID** | +2 metode baru (Mandiri Kamera/Reader) |
| **API** | +3 endpoint kiosk (kioskInfo, kioskScan, kioskSinkron) |
| **Petugas** | +flag kiosk untuk identifikasi akun kiosk |
| **Feature** | ✅ Kiosk Presensi Mandiri (file kiosk.html) |
| **Backward Compat** | ✅ App petugas tetap bekerja (v21→v22) |
| **URL /exec** | ✅ Tetap sama (tidak berubah) |

---

## ✅ Checklist Deployment

- [x] Code.js v22 di-push via Clasp
- [ ] Deploy Web App (manual di Apps Script)
- [ ] Verifikasi VERSI_SERVER = 22
- [ ] Verifikasi API kiosk ada
- [ ] Test index.html (petugas)
- [ ] Test kiosk.html (kiosk)
- [ ] Tambah PIN kiosk di Tab Petugas
- [ ] Scan test dari kiosk
- [ ] Verifikasi data di Sheet (metode "Mandiri")

---

## 🎯 Troubleshoot

| Masalah | Solusi |
|---------|--------|
| Login petugas error | Pastikan VERSI_APP = 22 di index.html |
| Kiosk login ditolak | Pastikan Peran = "Kiosk" di Tab Petugas |
| URL /exec berubah | Harus gunakan "Versi baru", bukan "Deployment baru" |
| API not found | Pastikan Code.js v22 sudah di-deploy |

---

## 📞 Support

Jika ada issue:
1. Check console browser (F12)
2. Check Tab Log di Sheet ABSENSI BBK02
3. Verifikasi VERSI_SERVER & VERSI_APP match

---

**Deployment via Clasp: ✅ SUCCESS**
**Manual Deploy di UI: ⏳ PENDING**

