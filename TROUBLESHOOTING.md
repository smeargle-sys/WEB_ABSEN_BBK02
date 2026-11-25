# Troubleshooting Guide - Clasp & Deployment Issues

Panduan untuk mengatasi masalah umum saat deployment.

## Error: "ReferenceError: window is not defined"

### Penyebab
File `config.js` atau `kiosk.html` tidak sengaja dipush ke Apps Script. File ini hanya untuk browser (GitHub Pages), bukan untuk server-side Apps Script.

### Diagnosis
```bash
# Cek file apa saja di Apps Script
clasp status | grep Tracked
# Jika ada config.js atau kiosk.html, itu masalahnya
```

### Solusi
```bash
# 1. Hapus file dari workspace lokal
rm config.js kiosk.html

# 2. Verifikasi
clasp status
# Hanya boleh: Code.js, Index.html, appsscript.json

# 3. Push ulang
clasp push --force

# 4. Redeploy
clasp redeploy DEPLOYMENT_ID

# 5. Test di Apps Script
# - Buka /exec URL
# - Jangan ada error di browser console
```

---

## Error: "Conflicting files found"

### Penyebab
Clasp mendeteksi duplikat atau file yang conflicting:
- `Code.gs` dan `Code.js` keduanya ada
- File dengan nama berbeda case (Windows/Linux sensitivity)
- Multiple versions of same file

### Diagnosis
```bash
# 1. Check status
clasp status
# Error: "Conflicting files found"

# 2. List file di root
ls -la Code.* Config.* config.* 2>/dev/null

# 3. Check git
git status | grep -E "deleted|modified|added"
```

### Solusi Umum
```bash
# Opsi A: Cleanup & Push
rm Code.gs config.js kiosk.html  # Remove unwanted files
clasp push --force
clasp redeploy DEPLOYMENT_ID

# Opsi B: Fresh clone (jika local state terlalu berantakan)
cd ..
rm -rf ABSEN_BBK02
clasp clone 1drwcNba-exKhQJGSG62dI7oXMVesrfQWeimVFfmnXIrYKQAsDkxcmRm_
# Buka di Apps Script UI, hapus file yang tidak perlu (config.js, kiosk.html)
# Lalu push dari local
```

---

## Error: "Failed to push"

### Penyebab
- Authentication issues (Clasp tidak authorized ke Apps Script)
- Network error
- Project ID mismatch

### Diagnosis
```bash
# Verifikasi credential
clasp login  # Logout/login jika perlu

# Verifikasi project ID
cat .clasp.json
# scriptId harus sesuai dengan Apps Script project

# Cek network
curl -I https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

### Solusi
```bash
# 1. Re-authenticate
clasp logout
clasp login
# Ikuti browser prompt, allow access

# 2. Verifikasi .clasp.json
cat .clasp.json
# Format:
# {
#   "scriptId": "1drwcNba-exKhQJGSG62dI7oXMVesrfQWeimVFfmnXIrYKQAsDkxcmRm_",
#   "rootDir": "."
# }

# 3. Push ulang
clasp push --force
```

---

## Error: "Version Mismatch" (21 vs 22)

### Penyebab
Backend (Code.js) dan Frontend (Index.html) versi tidak sama.

### Diagnosis
```bash
# Cek versi
grep "VERSI_SERVER" Code.js
grep "VERSI_APP" Index.html

# Jika berbeda:
# VERSI_SERVER = 22
# VERSI_APP = 21
# ^ INI MASALAH
```

### Solusi
```bash
# 1. Update versi di Index.html
# Cari: var VERSI_APP = 21;
# Ubah menjadi: var VERSI_APP = 22;

# 2. Verify
grep "VERSI_APP" Index.html  # Harus 22 sekarang

# 3. Push & redeploy
clasp push --force
clasp redeploy DEPLOYMENT_ID

# 4. Test
# - Login ke app
# - Lihat footer: "Versi aplikasi 22 · server 22"
# - Kedua angka HARUS sama
```

---

## Error: "Cannot find file config.js" (GitHub Pages)

### Penyebab
`config.js` tidak ada di GitHub repo. File ini diperlukan untuk GitHub Pages kiosk deployment.

### Diagnosis
```bash
# Check git
git ls-files | grep config.js
# Jika tidak ada output, file hilang

# Check local
ls -la config.js
# Jika "No such file", benar-benar hilang
```

### Solusi
```bash
# 1. Restore dari git history
git log --oneline -- config.js
# Lihat commit terakhir yang punya file ini

# 2. Checkout file
git checkout COMMIT_HASH -- config.js
# atau dari HEAD~2: git checkout HEAD~2 -- config.js

# 3. Verify content
cat config.js
# Harus ada: window.ABSEN_CONFIG = { API_URL: '...' }

# 4. Add dan push
git add config.js
git commit -m "restore: bring back config.js for GitHub Pages"
git push origin main
```

---

## Error: "Index.html tidak di-load di Apps Script"

### Penyebab
File case sensitivity. macOS dengan `core.ignorecase=true` treat `Index.html` dan `index.html` sebagai sama, tapi Apps Script strict.

### Diagnosis
```bash
# Check git config
git config core.ignorecase
# macOS: biasanya true (OK)

# Check file di Apps Script UI
# Buka Apps Script Editor → lihat file name di sidebar
```

### Solusi
Ini biasanya bukan masalah di macOS dengan `core.ignorecase=true`. File akan ter-track correctly. Jika tetap error:

```bash
# Verifikasi file ada
ls -la Index.html

# Push explicit
clasp push --force

# Check di Apps Script UI:
# Apps Script Editor > lihat sidebar > harus ada "Index" (atau "Index.html")
```

---

## Workflow Recovery: Cara Kembali ke State Baik

### Scenario: Local sudah berantakan, ingin fresh start

```bash
# Jangan takut! Git punya semuanya

# 1. Reset local ke state terakhir yang baik
git reset --hard origin/main

# 2. Verifikasi file
ls -la Code.* Index.* appsscript.json config.js
# Harus ada keempatnya

# 3. Clasp status
clasp status
# Harus OK tanpa error

# 4. Test
clasp pull  # Pull latest from Apps Script (optional check)
```

### Scenario: Apps Script sudah corrupt (ada file tidak perlu)

```bash
# Jangan push dari local terlebih dahulu!

# 1. Buka Apps Script UI
# https://script.google.com/home/all

# 2. Cari project: "ABSEN_BBK02 Server"

# 3. Di editor, lihat sidebar file:
# - Harus ada: Code.js, Index, appsscript.json
# - JANGAN ada: config.js, kiosk.html, Config, Index.html (lowercase)

# 4. Jika ada yang tidak perlu, delete di Apps Script UI
# Right-click file > Delete

# 5. Baru push dari local
clasp push --force

# 6. Redeploy
clasp redeploy DEPLOYMENT_ID
```

---

## Checklist Post-Deploy

Setelah `clasp redeploy`, pastikan:

```bash
# 1. Version check
echo "Backend versi:"
curl -s -X POST "DEPLOYMENT_URL/exec?action=ping" | grep -o "versi[^,]*"

# Atau cek manual:
# - Buka web app URL
# - Lihat console: browser F12 > Console
# - Tidak boleh ada error merah

# 2. Functionality test
# - Login page load
# - Input credentials
# - Submit → response OK
# - Footer menampilkan: "Versi aplikasi XX · server XX"

# 3. Git sync
git log --oneline -1  # Harus ada commit deployment terbaru
git status            # Harus "working directory clean"

# 4. GitHub Pages (jika pakai)
# - Verifikasi config.js ada: cat config.js
# - API_URL sudah benar
# - GitHub Pages deployed (Settings > Pages > live)
```

---

## Prevention: Checklists untuk Masa Depan

### Pre-Push Checklist
- [ ] `clasp status` → No "Conflicting files found"
- [ ] Only 3 tracked files: `Code.js`, `Index.html`, `appsscript.json`
- [ ] `config.js` NOT tracked by Clasp (verify: `clasp status | grep config`)
- [ ] Version verified: `VERSI_SERVER == VERSI_APP`
- [ ] No `Code.gs` left in repo

### Pre-Redeploy Checklist
- [ ] `clasp push --force` succeeded
- [ ] No errors in Apps Script UI
- [ ] Deployment ID correct: `clasp redeploy DEPLOYMENT_ID`

### Post-Deploy Checklist
- [ ] Web app loads without errors
- [ ] Login works
- [ ] Version display shows match (22 · 22)
- [ ] `git add` + `git commit` + `git push`
- [ ] GitHub Pages working (if applicable)
- [ ] config.js present in GitHub

---

## Quick Help Commands

```bash
# Check everything
echo "=== Git Status ===" && git status --short
echo "=== Clasp Status ===" && clasp status 2>&1
echo "=== File Check ===" && ls -1 Code.* Index.* config.* kiosk.* 2>/dev/null | sort
echo "=== Version Check ===" && echo "Server:" && grep VERSI_SERVER Code.js && echo "App:" && grep VERSI_APP Index.html

# Reset to known-good state
git reset --hard origin/main && rm config.js kiosk.html 2>/dev/null; ls -la

# Full deploy cycle
clasp status && clasp push --force && clasp redeploy AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT && git add -A && git commit -m "deploy: vXX" && git push origin main
```

---

## Emergency Contacts / Escalation

Jika tidak bisa resolve:

1. Check `.clasp.json` - Script ID harus match Apps Script project
2. Check `.git/config` - Origin URL harus correct
3. Check Apps Script UI directly - Lihat file apa saja yang ada
4. Check commit history - `git log --oneline -- config.js` untuk trace file history
5. Last resort: Clone ulang dari Apps Script - `clasp clone SCRIPT_ID`

**Last Updated:** Nov 25, 2024
