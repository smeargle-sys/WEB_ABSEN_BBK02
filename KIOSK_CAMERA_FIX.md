# Kiosk Camera Fix - Blank Scanner Screen

## Masalah
Area scanner kiosk menampilkan layar hitam blank dengan hanya tulisan "📱 Arahkan kamera ke kartu QR". Kamera tidak ter-load.

## Root Cause
Library `html5-qrcode` dimuat dengan atribut `defer` di script tag:
```html
<script defer src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
```

Atribut `defer` membuat library ter-load secara asynchronous SETELAH DOM parsing selesai, tapi JavaScript code yang memanggil `Html5Qrcode.getCameras()` langsung jalan saat login berhasil. Hasilnya: `Html5Qrcode` belum ter-define, error silent, dan kamera tidak ter-load.

## Solusi

### Fix 1: Remove `defer` Attribute
```html
<!-- SEBELUM (bermasalah) -->
<script defer src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>

<!-- SESUDAH (diperbaiki) -->
<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
```

Tanpa `defer`, script ter-load secara synchronous dan library ready sebelum kode JavaScript lain berjalan.

### Fix 2: Add Library Check in startCamera()
```javascript
// SEBELUM
function startCamera() {
  if (S.scanning || !S.token) return;
  S.scanning = true;
  Html5Qrcode.getCameras().then(cameras => { ... })
}

// SESUDAH
function startCamera() {
  if (S.scanning || !S.token) return;
  
  // Check if html5-qrcode library is loaded
  if (typeof Html5Qrcode === 'undefined') {
    console.warn('Html5Qrcode not loaded yet, retrying in 500ms...');
    setTimeout(startCamera, 500);  // Retry setelah 500ms
    return;
  }
  
  S.scanning = true;
  Html5Qrcode.getCameras().then(cameras => { ... })
}
```

Defensive programming: jika library belum ready, function retry otomatis sampai library available.

## Testing

### Sebelum Fix
1. Login ke kiosk dengan PIN
2. Layar scanner hitam
3. Buka DevTools (F12) → Console
4. Lihat error: `Uncaught ReferenceError: Html5Qrcode is not defined`

### Sesudah Fix
1. Login ke kiosk dengan PIN
2. Kamera aktif, layar menampilkan feed video
3. DevTools → Console: tidak ada error
4. Siap scan QR

## Deployment

### GitHub Pages (Auto-Deploy)
1. File `kiosk.html` sudah updated di GitHub
2. GitHub Pages auto-deploy dalam hitungan detik
3. Hardrefresh browser kiosk: `Cmd+Shift+R` (Mac) atau `Ctrl+Shift+R` (Windows)

### Untuk Test di Lokal
```bash
cd /Volumes/NewVols/git/ABSEN_BBK02
git checkout kiosk.html  # Pastikan latest dari GitHub
# Open kiosk.html di browser lokal
# Cek console: tidak boleh ada error
```

## Related
- **Issue**: Camera scanner tidak ter-load saat login kiosk
- **Commit**: b07e21e - fix: resolve blank camera scanner
- **Files**: kiosk.html
- **Date**: Nov 25, 2024

## Prevention
1. Hindari `defer` pada script yang kritis untuk initialization
2. Selalu add defensive checks sebelum memanggil library
3. Test di browser DevTools Console untuk pastikan no errors
4. Use `setTimeout(retry, delay)` untuk handle async loading

---

**Pelajaran:** Jangan andalkan timing implicit. Load library synchronously atau add explicit checks.
