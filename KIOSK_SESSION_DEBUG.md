# Kiosk Session Closing Issue - Debugging Guide

## Problem
Sesi kiosk menutup sendiri (layar lock kembali) padahal admin belum tutup sesi.

## Diagnosis Needed

Tolong kumpulkan informasi:

### 1. Kapan Sesi Menutup?
- [ ] Langsung setelah login (dalam 1-2 detik)?
- [ ] Setelah beberapa menit (berapa menit)?
- [ ] Pada waktu tertentu (jam berapa)?
- [ ] Random/tidak konsisten?

### 2. Browser Console Debug
Saat sesi menutup, buka DevTools (F12) dan lihat:

**Tab Console:**
```javascript
// Paste ini di console dan enter:
console.log('S.sesi:', S.sesi);
console.log('S.token:', S.token);
console.log('S.verServer:', S.verServer);
```

Lalu screenshot output atau tulis:
- Apa status S.sesi?
- Apakah S.sesi.status === "Terbuka"?

### 3. Network Debug
Di DevTools > Network tab:
1. Saat scan, lihat request ke API
2. Response dari `kioskInfo` apa?
3. Copy response JSON:
```
{
  "sesi": { "status": "???" },
  "hadir": ???,
  ...
}
```

### 4. Time Check
Verifikasi waktu di tablet vs admin panel:
- Jam di tablet: ?
- Jam di admin panel: ?
- Apakah berbeda (timezone issue)?

## Possible Causes

### A. Backend Logic Error
`kioskInfo` return `sesi.status` tidak "Terbuka" meskipun admin tidak tutup.

**Check:**
- Lihat `SESI_BUKA` constant value di Code.js
- Lihat apa ada auto-close logic yang tidak seharusnya

### B. Timezone/Time Mismatch
Jika jam tablet berbeda dengan server, bisa jadi:
- Datetime calculation di backend salah
- Sesi dianggap "expired" berdasarkan waktu

### C. Data Corruption
Sesi data di sheet ter-update dengan tidak terduga.

**Check:**
- Lihat Google Sheet (tempat sesi disimpan)
- Lihat ada perubahan status sesi tidak sengaja?

### D. Frontend Logic Error
`loadInfo()` parsing response salah, atau condition check salah.

**Check:**
```javascript
// Di kiosk.html line ~280
if (!S.sesi || S.sesi.status !== 'Terbuka') {
  // INI yang trigger lock screen
  show($('main'), false);
  show($('vTerkunci'), true);
}
```

Mungkin `S.sesi.status` value tidak exact match "Terbuka"?

## Quick Fix Options

### Option 1: Extend Polling Interval
Dari 20 detik jadi lebih lama (misal 60 detik), agar kurang sering check status:
```javascript
// kiosk.html line 288
S.timer = setTimeout(() => { loadInfo(); }, 60000);  // 60s instead of 20s
```

### Option 2: Add Debug Logging
Tambahkan log setiap kali `loadInfo()` di-call:
```javascript
function loadInfo() {
  console.log('loadInfo() called, sesi status:', S.sesi?.status);
  call('kioskInfo', S.token).then(res => {
    console.log('kioskInfo response:', res);
    console.log('Response sesi.status:', res.sesi?.status);
    // ... rest of code
  });
}
```

### Option 3: Add Status Override
Jika response status tidak "Terbuka", tapi token still valid, tetap biarkan scanning (risiko: akan accept scan meskipun sesi seharusnya tutup):
```javascript
if (!S.sesi || (S.sesi.status !== 'Terbuka' && S.sesi.status !== 'Dibuka')) {
  // Handle both "Terbuka" dan variasi lain
}
```

## Action Items

1. **Reproduce & Log:**
   - Set kiosk berjalan
   - Tunggu sesi menutup sendiri
   - Collect console logs & network responses

2. **Share Data:**
   - Paste console output
   - Paste kioskInfo response JSON
   - Screenshot status di admin panel

3. **Analysis:**
   - Determine root cause dari data
   - Fix di Code.js atau kiosk.html

4. **Test:**
   - Redeploy
   - Verify sesi tetap buka sampai admin tutup

---

**Waiting for:** Debug data dari user

Jangan close kiosk dulu! Kumpulkan info debug dulu ya.
