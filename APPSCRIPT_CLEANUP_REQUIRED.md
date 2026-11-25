# ⚠️ Apps Script Manual Cleanup Required

## Status
- ✅ GitHub repo: Cleaned (.gitignore added, config.js & kiosk.html removed from tracking)
- ❌ Apps Script: Still has config.js & kiosk.html (need manual delete)
- ⏳ Waiting for: Manual cleanup di Apps Script UI

## Why?
Accidentally pushed `config.js` dan `kiosk.html` ke Apps Script sebelum .gitignore setup. File-file ini hanya untuk **GitHub Pages**, bukan untuk Apps Script server.

## Cleanup Steps

### 1. Open Apps Script Editor
```
https://script.google.com/home/all
```

### 2. Find Project
Cari "ABSEN_BBK02 Server" project di list

### 3. Delete Unwanted Files
Di sidebar kiri (file list), lihat:
```
📄 Code.js          ✅ KEEP
📄 Index             ✅ KEEP  
📄 config.js         ❌ DELETE (klik kanan → Delete)
📄 kiosk.html        ❌ DELETE (klik kanan → Delete)
📄 appsscript.json   ✅ KEEP
```

**Delete cara:**
1. Right-click pada `config.js`
2. Pilih "Delete"
3. Confirm
4. Repeat untuk `kiosk.html`

### 4. After Deletion
Editor akan menunjukkan "Changed" indicator (biasanya bintang/asterisk)

### 5. Save/Deploy
Klik "Deploy" atau "Save" button di Apps Script UI

### 6. Verify
Di file list harus hanya tersisa:
```
📄 Code.js
📄 Index
📄 appsscript.json
```

## After Cleanup: Redeploy

```bash
cd /Volumes/NewVols/git/ABSEN_BBK02

# Verify local state (harus hanya 3 files)
clasp status
# Output harus:
# Tracked files:
# └─ Code.js
# └─ Index.html
# └─ appsscript.json

# Redeploy to production
clasp redeploy AKfycbxRgdrSEDO7D76_F9ycuX3GvKa1hCdLbxfIn5C5yj-kt8vzVqb-rFa0pqU7C_CJ8zRT

# Verify: test kiosk.html di GitHub Pages
# Should work without "window is not defined" error
```

## GitHub Files
Pastikan `.gitignore` sudah ada:
```bash
git ls-files | grep -E "config|kiosk"
# Output: (kosong, tidak ada file tersebut di tracking)
```

**Last Updated:** Nov 25, 2024
**Blocking:** Kiosk deployment v22 cleanup
