<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# CAT SYSTEM — Development Log

## Tech Stack
- **Framework**: Next.js 16.2.9 (App Router, Turbopack)
- **React**: 19.2.4
- **Database**: SQLite via Prisma 5.22
- **Styling**: Tailwind CSS 4
- **Auth**: JWT (jose) + httpOnly cookies + bcryptjs
- **Runtime**: Node.js on Windows (PowerShell)

## Credentials
- **Admin**: username `admin` — password tidak dicatat di repo. Buat/reset dengan `npm run admin:buat -- <username> <password>`
- **Database**: `prisma/dev.db`
- **Env**: `DATABASE_URL=file:./dev.db`, `SESSION_SECRET` (random)

---

## Database Schema (prisma/schema.prisma)

### Models
| Model | Fields | Purpose |
|-------|--------|---------|
| **User** | id, nomorPeserta (unique), nama, password, role (ADMIN/PENGAWAS/PESERTA), kelas, ruang, sesi, nilai, sudahUjian, createdAt, relations: jawaban[], histori[], pelanggaran[], activities[], auditLogs[] | Peserta & admin |
| **Soal** | id, ujianId?, pertanyaan, opsiA-D, jawabanBenar, mataPelajaran, bobot, createdAt, relations: jawaban[] | Bank soal |
| **JawabanUjian** | id, userId, soalId, ujianId?, jawabanPeserta, jawabanBenar, benar, mataPelajaran, createdAt, @@unique([userId, soalId]) | Jawaban per soal per user |
| **Ujian** | id, nama, durasiMenit, jadwalMulai, jadwalSelesai, isActive, poolSize?, createdAt, updatedAt, relations: soal[], jawaban[], histori[] | Konfigurasi ujian |
| **HistoriUjian** | id, userId, ujianId?, waktuMulai, waktuSelesai, totalSoal, jumlahBenar, jumlahSalah, nilaiAkhir, skorPerMapel (JSON string) | Log sesi ujian |
| **Pelanggaran** | id, userId, jenis, keterangan, createdAt | Log pelanggaran anti-cheat |
| **UserActivity** | id, userId, activity, details?, ipAddress?, userAgent?, createdAt | Tracking aktivitas user |
| **IPRule** | id, ipAddress, type (WHITELIST/BLACKLIST), keterangan?, createdBy?, createdAt | IP access rules |
| **SesiUjian** | id, userId, ujianId?, waktuMulai, tambahanMenit, jawaban (JSON), ragu (JSON), tahap, tahapMulai, selesai | Sesi pengerjaan di server (timer resmi, autosave, bagian berwaktu) |
| **PengaturanAplikasi** | key (PK), value, updatedAt | Key-value: identitas instansi/kop & penandatangan kartu (`instansi.*`) |
| **AuditLog** | id, userId?, action, target?, details?, ipAddress?, createdAt | Catatan audit sistem |

---

## Features Implemented

### Phase 1 — Core (Critical)
| Feature | Status | Files |
|---------|--------|-------|
| JWT auth (httpOnly cookies) | ✅ | `src/lib/session.ts`, `src/app/api/login/route.ts` |
| bcrypt password hashing | ✅ | `src/app/api/login/route.ts` |
| Route protection (proxy.ts) | ✅ | `src/proxy.ts` (harus sejajar `src/app`, bukan di root) |
| Admin session verification | ✅ | `src/lib/admin-auth.ts` |
| Auto-hash legacy plain-text passwords | ✅ | `src/app/api/login/route.ts` |

### Phase 2 — Important Features
| Feature | Status | Files |
|---------|--------|-------|
| Exam timer + auto-submit | ✅ | `src/app/ujian/page.tsx` |
| Fisher-Yates shuffle per mapel | ✅ | `src/app/api/ujian/route.ts` |
| Pengaturan model (durasi, jadwal) | ✅ | `prisma/schema.prisma` |
| Real-time dashboard stats (10s interval) | ✅ | `src/app/admin/page.tsx`, `src/app/api/admin/stats/route.ts` |
| CSV export scores | ✅ | `src/app/admin/nilai/page.tsx` |
| Jadwal ujian (mulai/selesai) | ✅ | Admin set datetime, dashboard countdown, ujian page blocks outside window |

### Phase 3 — Enhancements
| Feature | Status | Files |
|---------|--------|-------|
| CSV import peserta | ✅ | `src/app/admin/peserta/page.tsx`, `src/app/api/admin/peserta/route.ts` (POST bulk) |
| CSV import soal (bulk) | ✅ | `src/app/admin/soal/page.tsx`, `src/app/api/admin/soal/route.ts` (POST bulk) |
| Search/filter/pagination admin | ✅ | Peserta & Soal pages |
| Export soal ke CSV | ✅ | `src/app/admin/soal/page.tsx` (handleExportSoal) |
| Reset ujian per peserta | ✅ | `src/app/api/admin/peserta/route.ts` (PATCH resetUjian) |
| Reset semua peserta | ✅ | `src/app/api/admin/peserta/route.ts` (PATCH resetAll) |

### Phase 4 — UI/UX
| Feature | Status | Files |
|---------|--------|-------|
| Toast notifications (replace alert()) | ✅ | `src/components/Toast.tsx` |
| Mata pelajaran grouping (TIK, Matematika, B.Indo, P.Umum) | ✅ | Soal API, ujian page sections |
| Per-mapel score detail after exam | ✅ | `src/app/ujian/page.tsx` |
| Cetak Kartu Ujian (print-friendly) | ✅ | `src/app/admin/kartu/page.tsx` |
| Soal Favorit/Ragu toggle | ✅ | `src/app/ujian/page.tsx` (raguSet state) |
| Histori Ujian (admin) | ✅ | `src/app/admin/histori/page.tsx`, `src/app/api/admin/histori/route.ts` |
| Statistik per Mapel (CSS bar chart) | ✅ | `src/app/admin/statistik/page.tsx`, `src/app/api/admin/statistik-mapel/route.ts` |

### Phase 5 — Security / Anti-Cheat
| Feature | Status | Files |
|---------|--------|-------|
| Tab switch detection (visibilitychange) | ✅ | `src/app/ujian/page.tsx` |
| Copy/paste/right-click prevention | ✅ | `src/app/ujian/page.tsx` |
| Keyboard shortcut blocking (Ctrl+C/V/F12) | ✅ | `src/app/ujian/page.tsx` |
| Fullscreen enforcement | ✅ | `src/app/ujian/page.tsx` |
| Watermark overlay (nama + nomor) | ✅ | `src/app/ujian/page.tsx` |
| Pelanggaran counter + auto-submit (5x) | ✅ | `src/app/ujian/page.tsx`, `src/app/api/ujian/pelanggaran/route.ts` |
| Protect /api/ujian with auth | ✅ | `src/app/api/ujian/route.ts` |
| Protect /api/pengaturan with auth | ✅ | `src/app/api/pengaturan/route.ts` |
| Server-side timer validation | ✅ | `src/app/api/ujian/submit/route.ts` |
| Rate limiting on login (brute-force) | ✅ | `src/lib/rate-limit.ts`, `src/app/api/login/route.ts` |
| CSRF protection on submit | ✅ | `src/lib/csrf.ts`, `src/app/api/csrf/route.ts` |

### Phase 6 — Advanced Features
| Feature | Status | Files |
|---------|--------|-------|
| Soal bobot/weight | ✅ | `prisma/schema.prisma`, `src/app/api/admin/soal/route.ts`, `src/app/admin/soal/page.tsx` |
| Multi-exam support | ✅ | `prisma/schema.prisma`, `src/app/api/admin/ujian/route.ts` |
| PostgreSQL migration | ✅ | `prisma/schema.prisma`, `.env`, `package.json` (pg driver) |
| Offline handling / service worker | ✅ | `public/sw.js`, `src/app/offline/page.tsx`, `src/components/ServiceWorkerRegistration.tsx` |
| Dark mode | ✅ | `src/components/ThemeProvider.tsx`, `src/components/ThemeToggle.tsx`, `src/app/globals.css` |
| Analisis difficulty soal | ✅ | `src/app/api/admin/analisis-soal/route.ts`, `src/app/admin/analisis-soal/page.tsx` |
| Review jawaban peserta | ✅ | `src/app/api/ujian/review/route.ts`, `src/app/ujian/review/page.tsx` |

### Phase 9 — Advanced Exam Features (2026-07-26)
| Feature | Status | Files |
|---------|--------|-------|
| Monitoring Ujian Real-Time | ✅ | `src/app/admin/monitoring/page.tsx`, `src/app/api/admin/monitoring/route.ts` |
| Ruang Tunggu (Waiting Room) | ✅ | `src/app/ujian/page.tsx` |
| Ujian Series/Bagian (Fleksibel) | ✅ | `prisma/schema.prisma` (BagianUjian), `src/app/admin/bagian/page.tsx`, `src/app/api/admin/bagian/route.ts` |
| Multi-Bahasa (ID/EN) | ✅ | `src/lib/i18n/translations.ts`, `src/lib/i18n/provider.tsx`, `src/components/LanguageToggle.tsx` |
| Dark/Light Mode Toggle (Dashboard) | ✅ | `src/app/dashboard/page.tsx`, `src/app/login/page.tsx` |
| Accessibility improvements | ✅ | Semua form pakai label, required, aria attributes |

### Phase 10 — Penyelesaian & Perbaikan (2026-10-14)
| Item | Status | Files |
|------|--------|-------|
| Halaman Kelola Ujian (buat/edit/aktifkan/hapus, pool soal, jadwal) | ✅ | `src/app/admin/ujian/page.tsx`, `src/app/api/admin/ujian/route.ts` |
| Soal baru otomatis masuk ujian aktif; pilih ujian & bagian di Bank Soal/impor CSV | ✅ | `src/app/api/admin/soal/route.ts`, `src/app/admin/soal/page.tsx` |
| Pemilihan soal per peserta deterministik (pool + batasSoal bagian), dipakai GET & submit | ✅ | `src/lib/ujian-soal.ts` |
| Penilaian hanya atas soal yang diberikan (sebelumnya soal di luar pool dihitung salah) | ✅ | `src/app/api/ujian/submit/route.ts` |
| Grup soal per Bagian + skorPerBagian | ✅ | `src/app/api/ujian/route.ts`, `src/app/ujian/page.tsx` |
| Blokir ambil soal / submit ulang setelah selesai | ✅ | `src/app/api/ujian/route.ts`, `submit/route.ts` |
| Progres & timer ujian tahan refresh (localStorage); timer tidak jalan di ruang tunggu; dibatasi jadwal selesai | ✅ | `src/app/ujian/page.tsx` |
| Ruang/sesi peserta dari data asli (bukan hardcode) | ✅ | `src/app/ujian/page.tsx` |
| Proxy dipindah ke `src/proxy.ts` (sebelumnya tidak aktif); `/profile` diproteksi | ✅ | `src/proxy.ts` |
| Cache pengaturan di-invalidasi saat admin mengubah ujian | ✅ | `src/app/api/admin/pengaturan/route.ts`, `ujian/route.ts` |
| Audit log untuk soal, ujian, pengaturan, submit | ✅ | API terkait |
| Hapus soal yang sudah dijawab ditolak dengan pesan jelas (sebelumnya error FK) | ✅ | `src/app/api/admin/soal/route.ts` |

**Durasi per bagian** kini diterapkan — lihat Phase 12.

### Phase 15 — Persiapan Produksi (2026-10-14)
| Item | Files |
|------|-------|
| `COOKIE_SECURE` (false untuk server lab via http://IP; default true di produksi) + peringatan bila `SESSION_SECRET` < 32 karakter | `src/lib/session.ts`, `.env.example` |
| Skrip admin pertama / reset password admin: `npm run admin:buat -- <user> <pass> [nama]` | `scripts/buat-admin.mjs` |
| SQLite mode WAL otomatis; log query Prisma hanya di development | `src/lib/prisma.ts` |
| `STORAGE_DIR` untuk lokasi foto/logo | `src/lib/storage.ts` |
| Header keamanan (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) | `next.config.ts` |
| Tes E2E di dalam proyek: `npm run build && npm run test:e2e` (127 tes), `npm run test:beban` | `tests/run.mjs`, `tests/e2e/*.mjs`, `tests/README.md` |
| Panduan instalasi server, backup, update, checklist go-live | `DEPLOY.md` |

Uji beban 150 peserta serentak: 0 gagal; simpan jawaban ±0,5 dtk, submit ±0,9 dtk (median).

### Phase 14 — Kartu Ujian A4 (2026-10-14)
| Item | Files |
|------|-------|
| Kartu 1 lembar A4/peserta: kop (logo, instansi, alamat), judul + nama ujian + tahun pelajaran, pas foto 3x4, identitas (no. peserta, nama, kelas, NIK, TTL, JK, ruang, sesi), jadwal + paraf pengawas, username/password, tata tertib, tanda tangan peserta & penandatangan | `src/app/admin/kartu/page.tsx` |
| Pengaturan kop & penandatangan (+ upload logo, tata tertib) disimpan di DB | `src/lib/pengaturan-aplikasi.ts`, `src/app/api/admin/instansi/route.ts` |
| Kolom `User.kelas` (form & CSV peserta — kolom ke-6), tombol "Kartu" per peserta (`/admin/kartu?id=`) | `prisma/schema.prisma`, `src/app/admin/peserta/page.tsx`, `src/app/api/admin/peserta/route.ts` |
| Filter cetak: semua / per ruang / per kelas / cari / satu peserta | `src/app/admin/kartu/page.tsx` |
| Kolom kartu yang kosong dicetak titik-titik (diisi tangan); JK "Laki-laki / Perempuan *)" | `src/app/admin/kartu/page.tsx` |
| Admin bisa isi/koreksi data diri peserta (NIK, TTL, JK, alamat, HP, foto) di menu Peserta | `src/app/admin/peserta/page.tsx`, `src/app/api/admin/peserta/route.ts` |
| Akun uji coba MOCK-001, 209090, `-` dihapus (backup: `prisma/dev.db.bak-20261014071034`) | — |

### Phase 13 — Role PENGAWAS & Kelola Akun (2026-10-14)
| Role | Akses |
|------|-------|
| ADMIN | Semua halaman/API admin, juga bisa mencoba halaman ujian |
| PENGAWAS | Hanya `/admin/monitoring` (+Waktu/Kumpulkan/Reset sesi) & `/akun/password`. Jika `User.ruang` diisi, hanya peserta di ruang itu |
| PESERTA | `/dashboard`, `/profile`, `/ujian`, `/ujian/review`, `/akun/password` |

| Item | Files |
|------|-------|
| Routing per role (beranda: admin -> /admin, pengawas -> /admin/monitoring, peserta -> /dashboard) | `src/proxy.ts` |
| Role dicek dari DATABASE di setiap API (`verifyRole`/`verifyAdminSession`/`verifyStaffSession`), bukan dari token -> penurunan/hapus akun langsung berlaku | `src/lib/admin-auth.ts`, `src/app/api/me/route.ts` |
| Kelola Akun admin & pengawas (username, role, ruang, reset password); tidak bisa menurunkan/hapus diri sendiri atau admin terakhir | `src/app/admin/akun/page.tsx`, `src/app/api/admin/akun/route.ts` |
| Endpoint peserta hanya bisa mengubah akun ber-role PESERTA | `src/app/api/admin/peserta/route.ts` |

### Phase 12 — Sesi Ujian Server & Fitur Pengawas (2026-10-14)
| Item | Files |
|------|-------|
| Sesi ujian di server: waktu mulai/tenggat ditentukan server (klien tak bisa memperpanjang waktu) | `src/lib/sesi-ujian.ts`, `src/app/api/ujian/route.ts`, `submit/route.ts` |
| Simpan otomatis jawaban & ragu ke server (indikator "Tersimpan", retry saat offline, lanjut di perangkat lain) | `src/app/api/ujian/jawaban/route.ts`, `src/app/ujian/page.tsx` |
| Waktu habis saat browser tertutup -> dinilai otomatis dari jawaban tersimpan | `src/app/api/ujian/route.ts` |
| Soal tidak dikirim sebelum jadwal mulai | `src/app/api/ujian/route.ts` |
| Bagian berwaktu (BagianUjian.durasiMenit): berurutan, bagian lain terkunci & isinya tidak dikirim | `src/lib/sesi-ujian.ts`, `src/app/api/ujian/lanjut/route.ts` |
| Monitoring: sisa waktu, bagian aktif, aksi +Waktu / Kumpulkan / Reset sesi | `src/app/api/admin/sesi/route.ts`, `src/app/admin/monitoring/page.tsx` |
| Ganti password (admin & peserta) | `src/app/akun/password/page.tsx`, `src/app/api/me/password/route.ts` |
| Backup memuat sesiUjian & file foto (base64) | `src/app/api/admin/backup/route.ts` |
| Tema & bahasa via useSyncExternalStore + skrip anti-kedip; lint 0 error | `src/components/ThemeProvider.tsx`, `src/lib/i18n/provider.tsx`, `src/app/layout.tsx` |

Catatan: skema dikelola dengan `npx prisma db push` (folder migrations sudah usang).

### Phase 11 — Bug Fix (2026-10-14)
| Bug | Files |
|-----|-------|
| Edit peserta mengisi form dgn hash password -> hash di-hash ulang, peserta tak bisa login | `src/app/admin/peserta/page.tsx`, `src/app/api/admin/peserta/route.ts` |
| Hash password terkirim ke browser (GET peserta & nilai) | `src/app/api/admin/peserta/route.ts`, `src/app/api/admin/nilai/route.ts` |
| Hapus peserta yang punya data selalu gagal (FK) | `src/app/api/admin/peserta/route.ts` |
| Restore backup: urutan hapus/insert melanggar FK, ID tidak dipertahankan, tabel tidak lengkap, tanpa transaksi | `src/app/api/admin/backup/route.ts` |
| Foto upload 404 di produksi (file ditambah ke public/ setelah build) & ekstensi dari nama file | `src/app/api/upload/route.ts`, `src/app/api/foto/[name]/route.ts` (storage/fotos) |
| Token CSRF tidak terikat user (JWT sesi pun lolos) | `src/lib/csrf.ts`, `src/app/api/csrf/route.ts` |
| Pelanggaran dihitung seumur akun -> setelah reset langsung auto-submit | `src/app/api/ujian/pelanggaran/route.ts` |
| Monitoring: terjawab/sedang ujian selalu 0, totalSoal salah | `src/app/api/admin/monitoring/route.ts`, `src/app/ujian/page.tsx` |
| Daftar mandiri mengisi ruang default -> auto-assign ruang tak pernah jalan | `src/app/api/daftar/route.ts` |
| Dashboard: skor per mapel dibaca sebagai objek -> bar kosong | `src/app/dashboard/page.tsx` |
| Wildcard IP rule tidak escape titik; CIDR/IPv6-mapped | `src/lib/ip-check.ts` |
| Validasi profil (tanggal lahir, NIK, URL foto) | `src/app/api/me/route.ts` |

### Phase 8 — Public Registration (2026-07-26)
| Feature | Status | Files |
|---------|--------|-------|
| Registrasi mandiri peserta (auto-generate NP) | ✅ | `src/app/daftar/page.tsx`, `src/app/api/daftar/route.ts` |
| Login page link ke daftar | ✅ | `src/app/login/page.tsx` |
| Public route /daftar | ✅ | `src/proxy.ts` |
| Riwayat Ujian di dashboard peserta | ✅ | `src/app/dashboard/page.tsx`, `src/app/api/ujian/history/route.ts` |
| Lengkapi Data Diri (profile) | ✅ | `src/app/profile/page.tsx`, `src/app/api/me/route.ts` (PUT) |

### Phase 7 — Performance & Security Enhancements (2026-07-25)
| Feature | Status | Files |
|---------|--------|-------|
| Database indexing | ✅ | `prisma/schema.prisma` - Index di User, Soal, JawabanUjian, Ujian |
| Backup/Restore database | ✅ | `src/app/api/admin/backup/route.ts`, `src/app/admin/backup/page.tsx` |
| User activity monitor | ✅ | `src/app/api/user-activity/route.ts`, `src/app/admin/activity/page.tsx` |
| IP whitelist/blacklist | ✅ | `src/lib/ip-check.ts`, `src/app/api/admin/ip-rules/route.ts`, `src/app/admin/ip-rules/page.tsx` |
| Audit logging | ✅ | `src/lib/audit-log.ts`, `src/app/api/admin/audit-logs/route.ts`, `src/app/admin/audit-logs/page.tsx` |
| API caching | ✅ | `src/lib/cache.ts` - Cache di stats & pengaturan API |
| Question pooling | ✅ | `src/app/api/ujian/route.ts` - Pool size config di Ujian model |
| Dashboard export PDF | ✅ | `src/lib/pdf-export.ts` - Export stats ke PDF |

---

## File Structure (All Routes)

### Pages (○ Static)
```
src/app/
├── page.tsx                          # Landing page
├── login/page.tsx                    # Login
├── daftar/page.tsx                   # Public registration
├── dashboard/page.tsx                # Participant dashboard (countdown, tutorial)
├── profile/page.tsx                  # Lengkapi data diri (ruang, sesi)
├── ujian/page.tsx                    # Exam page (timer, anti-cheat, ragu, watermark)
└── admin/
    ├── page.tsx                      # Admin dashboard (stats, jadwal settings, menu)
    ├── ujian/page.tsx                # Kelola ujian (multi-exam, pool, aktivasi)
    ├── peserta/page.tsx              # CRUD peserta, import CSV, reset all
    ├── soal/page.tsx                 # CRUD soal, bulk import, export CSV, bulk delete
    ├── nilai/page.tsx                # Live score recap + CSV export
    ├── kartu/page.tsx                # Cetak kartu ujian (print-friendly)
    ├── histori/page.tsx              # Riwayat ujian
    ├── statistik/page.tsx            # Statistik per mapel (bar chart)
    ├── analisis-soal/page.tsx        # Analisis difficulty soal
    ├── backup/page.tsx               # Backup & restore database
    ├── activity/page.tsx             # User activity monitor
    ├── ip-rules/page.tsx             # IP whitelist/blacklist management
    └── audit-logs/page.tsx           # Audit logs viewer
```

### API Routes (ƒ Dynamic)
```
src/app/api/
├── login/route.ts                    # POST login
├── logout/route.ts                   # POST logout
├── me/route.ts                       # GET current user
├── daftar/route.ts                   # POST public registration
├── csrf/route.ts                     # GET CSRF token
├── pengaturan/route.ts               # GET pengaturan (auth required)
├── user-activity/route.ts            # POST track activity, GET activity data
├── ujian/
│   ├── route.ts                      # GET soal grouped + shuffled (auth required)
│   ├── submit/route.ts               # POST submit ujian + save histori
│   ├── pelanggaran/route.ts          # POST log pelanggaran, GET for admin
│   ├── review/route.ts               # GET review jawaban (peserta)
│   └── history/route.ts              # GET riwayat ujian peserta
└── admin/
    ├── stats/route.ts                # GET dashboard stats
    ├── peserta/route.ts              # CRUD + PATCH resetUjian/resetAll + POST bulk import
    ├── soal/route.ts                 # CRUD + POST bulk import + DELETE bulk
    ├── nilai/route.ts                # GET scores
    ├── pengaturan/route.ts           # GET/PUT pengaturan (admin)
    ├── ujian/route.ts                # CRUD ujian (multi-exam management)
    ├── histori/route.ts              # GET histori ujian
    ├── statistik-mapel/route.ts      # GET statistik per mapel
    ├── analisis-soal/route.ts        # GET analisis difficulty soal
    ├── backup/route.ts               # GET backup, POST restore
    ├── ip-rules/route.ts             # CRUD IP whitelist/blacklist rules
    └── audit-logs/route.ts           # GET audit logs with pagination
```

### Shared
```
src/
├── lib/
│   ├── prisma.ts                     # Prisma singleton
│   ├── session.ts                    # JWT session (jose)
│   ├── admin-auth.ts                 # Admin session verification
│   ├── rate-limit.ts                 # Login brute-force protection
│   ├── csrf.ts                       # CSRF token generation/verification
│   ├── ip-check.ts                   # IP whitelist/blacklist checking
│   ├── audit-log.ts                  # Audit logging utility
│   ├── cache.ts                      # In-memory caching for API
│   ├── pdf-export.ts                 # PDF export utility
│   └── ujian-soal.ts                 # Pemilihan soal per peserta (pool, bagian, seed)
├── components/
│   ├── Toast.tsx                     # Toast notification provider + useToast hook
│   ├── ThemeProvider.tsx             # Dark mode context provider
│   ├── ThemeToggle.tsx               # Dark/light mode toggle button
│   └── ServiceWorkerRegistration.tsx # PWA service worker registration
public/
├── sw.js                             # Service worker for offline caching
src/proxy.ts                          # Next.js 16 route protection (dipindah dari root — di root tidak dijalankan)
```

---

## Seed Data
- **70 soal** across 4 mata pelajaran (from web crawling):
  - TIK: 20 soal
  - Matematika: 20 soal
  - Bahasa Indonesia: 15 soal
  - Pengetahuan Umum: 15 soal
- Seed script: `prisma/seed.ts`

---

## Build Status
- `npm run build` passes ✅
- `npm run test:e2e` (butuh build): 127 tes lulus — lihat `tests/README.md`
- Deploy: lihat `DEPLOY.md`
- 43 routes total (16 static, 27 dynamic)
- `npx eslint src`: 0 error (sisa warning ringan, mis. `<img>`)

---

## Known Limitations / Future Work
1. ~~Timer is client-side only (server doesn't validate waktuMulai)~~ ✅ FIXED
2. ~~No rate limiting on login (brute-force possible)~~ ✅ FIXED
3. ~~No CSRF protection~~ ✅ FIXED
4. ~~No question weights/bobot~~ ✅ FIXED
5. ~~Single exam configuration only (no multi-exam support)~~ ✅ FIXED
6. ~~SQLite (not suitable for high-concurrency production)~~ ✅ FIXED (PostgreSQL ready)
7. ~~No offline handling / service worker~~ ✅ FIXED
8. ~~No dark mode~~ ✅ FIXED
9. ~~No question difficulty analysis~~ ✅ FIXED
10. ~~No participant self-service review (lihat jawaban benar/salah setelah ujian)~~ ✅ FIXED
11. ~~No database indexing for performance~~ ✅ FIXED
12. ~~No backup/restore functionality~~ ✅ FIXED
13. ~~No user activity monitoring~~ ✅ FIXED
14. ~~No IP whitelist/blacklist~~ ✅ FIXED
15. ~~No audit logging~~ ✅ FIXED
16. ~~No API caching~~ ✅ FIXED
17. ~~No question pooling~~ ✅ FIXED
18. ~~No PDF export for dashboard~~ ✅ FIXED
