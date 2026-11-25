# Deployment Best Practices - Pelajaran dari Kiosk v22

Dokumentasi ini mencatat pelajaran berharga dari deployment Kiosk v22 untuk mencegah isu yang sama di masa depan.

## 1. File Structure untuk Clasp + GitHub Pages

### 🎯 Aturan Utama
- **Apps Script files** (akan di-deploy ke Apps Script):
  - `Code.js` - Backend (harus `.js`, bukan `.gs`)
  - `Index.html` - Frontend UI
  - `appsscript.json` - Manifest

- **GitHub Pages files** (hanya di GitHub, JANGAN di Apps Script):
  - `config.js` - Konfigurasi (berisi API_URL, etc.)
  - `kiosk.html` - Halaman alternatif/kiosk UI
  - Dokumentasi (*.md)

### ❌ Kesalahan yang Dihindari
```
JANGAN LAKUKAN:
❌ Memiliki Code.gs dan Code.js bersamaan
❌ Push config.js ke Apps Script (akan error: "window is not defined")
❌ Push kiosk.html ke Apps Script (hanya untuk GitHub Pages)
❌ Simpan documentation files di root dengan .clasp.json rootDir="."
```

### ✅ Struktur yang Benar
```
repo root/
├── .clasp.json                 (scriptId + rootDir)
├── .gitignore                  (eksklusi temporary files)
├── Code.js                     ← Apps Script backend
├── Index.html                  ← Apps Script frontend
├── appsscript.json            ← Apps Script manifest
├── config.js                   ← GitHub Pages config (onerror="void 0" di Index.html)
├── kiosk.html                  ← GitHub Pages kiosk UI (optional)
├── *.md                        ← Dokumentasi
└── .git/
```

**Catatan:** `Index.html` load `config.js` dengan fallback:
```html
<script src="config.js" onerror="void 0"></script>
<!-- Di Apps Script: config.js tidak ada, onerror void 0 (ignore) -->
<!-- Di GitHub Pages: config.js ada, berisi ABSEN_CONFIG = { API_URL: '...' } -->
```

---

## 2. Clasp Configuration

### Setup .clasp.json
```json
{
  "scriptId": "1drwcNba-exKhQJGSG62dI7oXMVesrfQWeimVFfmnXIrYKQAsDkxcmRm_",
  "rootDir": "."
}
```

### Mencegah Konflik File

**Masalah:** Clasp dengan `rootDir="."` akan track semua file di root. Jika ada:
- `Code.gs` + `Code.js` → Conflict (duplikat)
- `config.js` → Akan push ke Apps Script (error "window not defined")

**Solusi:**
1. Rename `Code.gs` → `Code.js` (Clasp standard)
2. Jangan simpan `config.js` di root jika rootDir="."
3. Gunakan `.gitignore` untuk temp files

---

## 3. Push Workflow

### Sebelum Push, Pastikan:
```bash
# 1. Cek status Clasp (akan detect konflik jika ada)
clasp status

# 2. Verifikasi file tracked oleh Clasp
clasp status | grep -E "Tracked|Untracked"

# 3. Jangan ada duplikat:
ls Code.* config.* kiosk.* 2>/dev/null
# Hanya boleh: Code.js, config.js (jika untuk GitHub Pages, bukan Apps Script)
```

### Push & Redeploy
```bash
# 1. Push dengan force (safe jika sudah verify file)
clasp push --force

# 2. Redeploy dengan ID yang sama (keep URL)
clasp redeploy DEPLOYMENT_ID

# Output: Redeployed ID @VERSION
```

### Troubleshooting Conflict

**Error:** `Conflicting files found`

**Diagnosis:**
```bash
clasp status
# Lihat file apa saja yang "Tracked" vs "Untracked"
# Jika ada duplikat di Tracked, itu penyebabnya
```

**Solusi:**
```bash
# 1. Identifikasi file yang salah
ls -la Code.* config.* kiosk.* 2>/dev/null

# 2. Hapus duplikat lokal
rm Code.gs config.js kiosk.html

# 3. Verifikasi
clasp status  # Harus berhasil tanpa error

# 4. Push ulang
clasp push --force
```

---

## 4. Versi Tracking

### Konvensi Versi

**Apps Script Backend & Frontend versi harus match:**

```javascript
// Code.js (backend)
const VERSI_SERVER = 22;  // Increment saat ada perubahan API

// Index.html (frontend)
var VERSI_APP = 22;  // Harus sama dengan VERSI_SERVER

// Saat deploy:
// - Update VERSI_APP di Index.html
// - Update VERSI_SERVER di Code.js
// - Pastikan kedua nilai SAMA
// - Test: Login harus tampil "Versi aplikasi 22 · server 22"
```

### Verifikasi Versi Sebelum Deploy
```bash
# Cek versi di Code.js
grep "VERSI_SERVER" Code.js

# Cek versi di Index.html
grep "VERSI_APP" Index.html

# Harus sama! Jika beda, update dulu sebelum push
```

---

## 5. GitHub Sync Best Practices

### Commit Message Convention
```bash
# Fix/bugfix commits
git commit -m "fix: resolve Clasp conflict and deploy kiosk v22"

# Feature commits
git commit -m "feat: add kiosk self-service API (kioskInfo, kioskScan, kioskSinkran)"

# Documentation
git commit -m "docs: add deployment best practices guide"

# Format: <type>: <description>
# Types: feat, fix, docs, refactor, test, chore
```

### Push ke GitHub
```bash
# Jangan pernah push langsung ke main (selalu buat branch)
git push origin <branch-name>

# Jika sudah merge ke main locally:
git push origin main

# Verify:
git log --oneline -1
git status  # Working directory clean
```

### Restore File dari Git History
```bash
# Jika file hilang, restore dari history
git show HEAD~2:config.js  # Lihat isi file di commit lama

# Restore:
git checkout HEAD~2 -- config.js
git add config.js && git commit -m "restore: bring back config.js"
git push origin main
```

---

## 6. Testing Checklist Sebelum Deployment

Sebelum `clasp push` dan `clasp redeploy`, pastikan:

### Local Testing
- [ ] `clasp status` → No "Conflicting files found" error
- [ ] Hanya ada 3 tracked files: `Code.js`, `Index.html`, `appsscript.json`
- [ ] `config.js` TIDAK di-tracked oleh Clasp (hanya di GitHub)
- [ ] `kiosk.html` TIDAK di-tracked oleh Clasp (hanya di GitHub)

### Version Check
- [ ] `VERSI_SERVER` di Code.js = nilai baru
- [ ] `VERSI_APP` di Index.html = nilai baru (sama dengan server)
- [ ] Kedua versi SAMA

### Apps Script Check
- [ ] No `ReferenceError: window is not defined` errors
- [ ] Login endpoint respond dengan success
- [ ] Response include `versiServer` di JSON

### Post-Deploy Test
- [ ] Buka web app URL (/exec)
- [ ] Login berhasil
- [ ] Lihat footer: "Versi aplikasi XX · server XX"
- [ ] Versi kedua angka MATCH (tidak boleh mismatch)
- [ ] Kiosk feature berfungsi (kioskInfo, kioskScan, kioskSinkron APIs)

---

## 7. Dokumentasi Deployment

Setiap kali deploy versi baru, buat dokumentasi:

```markdown
# Deployment v[XX]

## Changes
- [ ] List API changes
- [ ] List UI changes
- [ ] List bugfixes

## Testing
- [ ] All features tested
- [ ] No regressions
- [ ] Version mismatch resolved

## Deployment
- [ ] Pushed to Apps Script
- [ ] Redeployed @VERSION
- [ ] GitHub synced
- [ ] config.js present (GitHub Pages)

## Status
✅ Live and operational
```

Simpan di `DEPLOYMENT_[VERSION].md` atau di RESOLUTION.md.

---

## 8. Checklist File Structure Sebelum Merge

```bash
#!/bin/bash
# Script untuk verifikasi pre-merge

echo "=== Checking file structure ==="
echo "Config files:"
ls -la .clasp.json appsscript.json

echo -e "\n=== Clasp tracked files ==="
clasp status 2>/dev/null | grep -E "Tracked|Untracked"

echo -e "\n=== Conflict check ==="
if ls Code.gs Code.js config.js kiosk.html 2>/dev/null | grep -q .; then
  echo "⚠️  Warning: Multiple versions of same file found"
  ls Code.* config.* kiosk.* 2>/dev/null
else
  echo "✅ No duplicate files"
fi

echo -e "\n=== Version check ==="
grep "VERSI_SERVER" Code.js
grep "VERSI_APP" Index.html

echo -e "\n=== Git status ==="
git status --short
```

Simpan sebagai `.kiro/hooks/pre-commit.sh` untuk auto-check sebelum commit.

---

## 9. Quick Reference

### Deploy Flow
```
1. Update Code.js VERSI_SERVER
2. Update Index.html VERSI_APP (harus sama)
3. Verify: clasp status (no conflicts)
4. Push: clasp push --force
5. Redeploy: clasp redeploy DEPLOYMENT_ID
6. Test: Login + version check
7. Commit: git commit -m "deploy: v[XX]"
8. Push: git push origin main
```

### Avoid Mistakes
```
❌ DON'T: Push config.js to Apps Script
❌ DON'T: Keep Code.gs after rename to Code.js
❌ DON'T: Deploy without version match (21 vs 22)
❌ DON'T: Forget to restore config.js to GitHub

✅ DO: Keep config.js ONLY in GitHub (onerror fallback)
✅ DO: Use clasp status before every push
✅ DO: Test version display after deploy
✅ DO: Sync GitHub after every Apps Script deploy
```

---

## Referensi

- [Google Clasp Documentation](https://github.com/google/clasp)
- [Google Apps Script Deployment](https://developers.google.com/apps-script/guides/deployment)
- Deployment ID: `AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT`
- Script ID: `1drwcNba-exKhQJGSG62dI7oXMVesrfQWeimVFfmnXIrYKQAsDkxcmRm_`

**Last Updated:** Nov 25, 2024 (Kiosk v22 Deployment)
