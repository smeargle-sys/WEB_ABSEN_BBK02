# Kiosk Presensi Mandiri - v22

Sistem presensi self-service QR di kiosk/tablet untuk acara Pengajian BBK02.

## 🚀 Quick Start

### Akses Kiosk
```
https://smeargle-sys.github.io/WEB_ABSEN_BBK02/kiosk.html
```

### Setup (Admin)
1. Buka Admin Panel: https://script.google.com/macros/s/AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT/exec
2. Tab "Petugas" → Tambah akun kiosk dengan Peran="Kiosk"
3. Berikan PIN ke operator kiosk

### Gunakan Kiosk (Operator)
1. Login dengan PIN
2. Arahkan QR peserta ke kamera
3. Presensi tercatat otomatis

## ⏰ Jam Tutup Sesi (Auto-Lock)

**PENTING:** Kiosk akan **auto-lock** (layar kembali ke lock screen) ketika:
- Jam telah mencapai **Jam Tutup Sesi** (default: 23:59)
- Setting ada di Tab "Pengaturan" → "Jam Tutup Sesi"

**Ini BUKAN bug** - sengaja dirancang untuk:
- Mencegah scan setelah sesi resmi ditutup
- Sinkronisasi dengan status sesi di admin panel

Jika perlu ubah jam tutup, edit di Tab Pengaturan → Jam Tutup Sesi.

## 📋 File Penting

| File | Purpose |
|------|---------|
| `kiosk.html` | UI Kiosk (GitHub Pages) |
| `config.js` | Config API URL (GitHub Pages) |
| `Code.js` | Backend APIs (Apps Script) |
| `Index.html` | Admin Panel UI (Apps Script) |

## 🔗 Links

- **Kiosk UI:** https://smeargle-sys.github.io/WEB_ABSEN_BBK02/kiosk.html
- **Admin Panel:** https://script.google.com/macros/s/AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT/exec
- **GitHub Repo:** https://github.com/smeargle-sys/WEB_ABSEN_BBK02

## 📚 Guides

- **KIOSK_ACCESS.md** - Setup & usage guide
- **KIOSK_SPEC.md** - Technical spec
- **DEPLOYMENT_BEST_PRACTICES.md** - Deployment guidelines

---

**Version:** 22 | **Last Updated:** Nov 25, 2024
