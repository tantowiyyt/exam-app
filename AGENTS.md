<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# E-Learning Sekolah (LMS + modul Ujian CAT) — Development Log

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
- **Env**: `DATABASE_URL=file:./dev.db`, `SESSION_SECRET` (random) — contoh lengkap di `.env.example`

---

## Status Terakhir (2026-10-15) — BACA INI DULU

**Repo:** https://github.com/tantowiyyt/exam-app (branch `main`). Database, foto upload, dan `.env` sengaja tidak di-commit.

**Kondisi:** fitur lengkap + LMS (Phase 16) + administrasi sekolah (Phase 20–23), build & lint bersih, `npm run test:e2e` 945 tes lulus, uji beban 150 peserta serentak 0 gagal (sebelum LMS).
Siap untuk **simulasi**, belum untuk ujian sungguhan — selesaikan daftar di bawah dulu.

**Belum dilakukan (oleh pemilik proyek):**
1. Simulasi 5–10 peserta di lab (alur UI ujian belum pernah dicoba orang sungguhan di browser) — checklist di `DEPLOY.md` §9
2. Ganti password admin lewat menu *Ganti Password* (password lama pernah tertulis di dokumen ini)
3. Di server: isi `.env` dari `.env.example` (`SESSION_SECRET` acak, `COOKIE_SECURE=false` bila lab via http://IP)
4. Buat akun pengawas per ruang, isi kelas peserta, isi kop kartu, cetak kartu
5. LMS: buat akun guru (Kelola Akun → role Guru), kelas & mapel (Admin → LMS → Kelas & Mapel), lalu uji alur materi/tugas/kuis/presensi dengan guru & siswa sungguhan
6. Administrasi (Phase 20–23): tetapkan wali kelas, isi jadwal pelajaran, impor siswa dari Dapodik, (opsional) aktifkan WhatsApp/email di Notifikasi WA/Email
   (gateway WA berbayar, mis. Fonnte; server butuh akses internet keluar), cocokkan file Ekspor e-Rapor dengan template e-Rapor versi sekolah

**Fitur LMS yang belum dibuat (prioritas rendah, hasil perbandingan dengan Moodle/EdLink):** video conference terintegrasi (tautan Zoom/Meet sudah ada), koreksi/anotasi PDF langsung di file, video panduan (panduan tertulis per peran sudah ada di menu Panduan).

**Keputusan yang sudah diambil:**
- Penguncian perangkat ala Safe Exam Browser **tidak** dibangun di proyek ini. Pakai Safe Exam Browser resmi bila perlu;
  aplikasi tetap punya deteksi pelanggaran (pindah tab, keluar fullscreen, copy/paste, shortcut; auto-submit di pelanggaran ke-5).
- Skema DB dikelola dengan `npx prisma db push` (folder `prisma/migrations` usang — jangan `migrate deploy`).
- Satu instance server saja (rate limit & cache di memori).

**Keterbatasan yang diketahui:**
- Login serentak 150 orang pada detik yang sama ±12 dtk (bcrypt); dalam praktik login tersebar.
- IP dibaca dari `X-Forwarded-For` → pakai reverse proxy agar aturan IP & rate limit tidak bisa dipalsukan.
- Admin yang diturunkan role-nya masih melihat tampilan halaman admin (kosong, API menolak) sampai login ulang.
- Durasi per bagian hanya berlaku bila SEMUA soal ujian berada di bagian yang punya durasi.
- Sisa 18 warning lint ringan (`<img>`, unused vars) — tidak ada error.
- Ujian CAT **sekolah** (menu admin): beberapa boleh aktif bersamaan asal **kelas pesertanya tidak beririsan** (Phase 19); mengaktifkan ujian yang beririsan menonaktifkan ujian lain itu. Status "sudah ujian" per ujian (`SesiUjian.selesai`); `User.sudahUjian`/`User.nilai` masih ditulis tetapi tidak lagi dipakai untuk logika.
  Ujian per mapel (UH/UTS/UAS) dikelola guru di tab Ujian dan bisa CAT bersamaan di banyak kelas (Phase 18, mesin Kuis mode ujian).
- Ujian CAT mapel dipantau guru pengampu (bukan role Pengawas); layar penuh tidak tersedia di iPhone (hanya deteksi pindah tab).
- Notifikasi WA/email & penjadwalnya di memori satu proses (satu instance). Kode lupa password hanya lewat kanal yang aktif; tanpa kanal = lewat wali kelas/admin.
- Ekspor e-Rapor berupa Excel umum (bukan template resmi per versi); kolom perlu disalin ke template e-Rapor sekolah. Impor Dapodik membaca lembar pertama saja.
- Arsip anggota kelas hanya tersedia untuk semester yang ditinggalkan setelah Phase 20; semester lama tanpa arsip memakai kelas siswa saat ini.
- LMS: lampiran yang belum/tidak lagi tertaut ke materi/tugas/jawaban bisa dibuka siapa pun yang login asal tahu URL acaknya (UUID);
  lampiran yang tertaut hanya untuk anggota/pengelola mapelnya.

**Backup DB lokal** (di-ignore git): `prisma/dev.db.bak-20261014063026`, `-065253`, `-071034`, `-090459` (sebelum skema LMS), `-115525` (sebelum fitur tugas lanjutan), `-132330` (sebelum kuis), `-134625` (sebelum presensi), `-135714` (sebelum topik & jadwal terbit), `-140714` (sebelum bobot nilai & rubrik) — boleh dihapus bila tidak diperlukan.
**PERHATIAN:** backup `-115525` s/d `-164000` dibuat dengan menyalin `dev.db` saja padahal perubahan masih di `dev.db-wal`, sehingga isinya SAMA (kondisi 09:29, sebelum kelas/kuis/dst). Backup lengkap yang valid (via `VACUUM INTO`): `-164500` (63 akun, 21 kelas), `-170000` (sebelum 273 mapel), `-173000` (sebelum 630 siswa), `-174500` (sebelum skema ujian offline), `-190000` (sebelum skema semester & ujian CAT mapel), `-203000` (sebelum bank soal & tautan kelas virtual), `-213000` (sebelum deskripsi & catatan rapor), `-223000` (sebelum skema ujian sekolah per kelas), `-20261015100954` (sebelum skema administrasi Phase 20+), `-20261015105538` (sebelum kolom NISN), `-20261015113213` (sebelum orang tua & pesan), `-20261015115433` (sebelum lencana).
**Data contoh di dev.db (2026-10-14):** 21 kelas X–XII IPA/IPS/Bahasa, 273 mapel ber-guru, 25 guru + 25 pengawas (`storage/akun-guru-pengawas.csv`), 630 siswa 30/kelas (`storage/akun-siswa.csv`), pembagian mapel di `storage/pembagian-mapel.csv`. Ruang/sesi ujian siswa baru masih kosong.
Backup berikutnya pakai `VACUUM INTO` / `sqlite3 .backup` (lihat `DEPLOY.md`), **jangan `cp dev.db`**.

---

## Database Schema (prisma/schema.prisma)

### Models
| Model | Fields | Purpose |
|-------|--------|---------|
| **User** | id, nomorPeserta (unique), nama, password, role (ADMIN/PENGAWAS/GURU/PESERTA/ORANGTUA), kelas, ruang, sesi, nilai, sudahUjian, createdAt, relations: jawaban[], histori[], pelanggaran[], activities[], auditLogs[] | Peserta & admin |
| **Soal** | id, ujianId?, pertanyaan, opsiA-D, jawabanBenar, mataPelajaran, bobot, createdAt, relations: jawaban[] | Bank soal |
| **JawabanUjian** | id, userId, soalId, ujianId?, jawabanPeserta, jawabanBenar, benar, mataPelajaran, createdAt, @@unique([userId, soalId]) | Jawaban per soal per user |
| **Ujian** | id, nama, durasiMenit, jadwalMulai, jadwalSelesai, isActive, poolSize?, mapelId?, kelasTarget, jenis, semesterId?, createdAt, updatedAt, relations: soal[], jawaban[], histori[] | Konfigurasi ujian |
| **HistoriUjian** | id, userId, ujianId?, waktuMulai, waktuSelesai, totalSoal, jumlahBenar, jumlahSalah, nilaiAkhir, skorPerMapel (JSON string) | Log sesi ujian |
| **Pelanggaran** | id, userId, jenis, keterangan, createdAt | Log pelanggaran anti-cheat |
| **UserActivity** | id, userId, activity, details?, ipAddress?, userAgent?, createdAt | Tracking aktivitas user |
| **IPRule** | id, ipAddress, type (WHITELIST/BLACKLIST), keterangan?, createdBy?, createdAt | IP access rules |
| **SesiUjian** | id, userId, ujianId?, waktuMulai, tambahanMenit, jawaban (JSON), ragu (JSON), tahap, tahapMulai, selesai | Sesi pengerjaan di server (timer resmi, autosave, bagian berwaktu) |
| **PengaturanAplikasi** | key (PK), value, updatedAt | Key-value: identitas instansi/kop & penandatangan kartu (`instansi.*`) |
| **AuditLog** | id, userId?, action, target?, details?, ipAddress?, createdAt | Catatan audit sistem |
| **Kelas / Mapel** | Kelas: nama (unique = User.kelas); Mapel: kelasId, nama, guruId? | LMS — Phase 16 |
| **Materi / MateriDibaca** | mapelId, judul, isi, linkVideo, lampiran, terbit / (userId, materiId) | LMS |
| **Tugas / PengumpulanTugas** | mapelId, judul, tenggat, terimaTerlambat, untukSiswa (",3,7," / ""=semua), nilaiMaks, lampiran+lampiranLain (JSON) / tugasId+userId unique, jawaban, lampiran+lampiranLain, status (dikumpulkan/revisi), nilai, catatanGuru | LMS |
| **User.notifDibacaAt** | waktu terakhir notifikasi LMS dibuka | LMS |
| **Kuis / SoalKuis / PercobaanKuis** | Kuis: mapelId, judul, durasiMenit (0=bebas), mulai?, selesai?, maksPercobaan, acakSoal, tampilkanJawaban, terbit / SoalKuis: tipe (pg/bs/isian/esai), opsi (JSON), kunci, pembahasan, bobot, urutan / Percobaan: kuisId+userId+ke unique, jawaban & skorEsai (JSON), skor, nilai (0–100), perluDinilai | LMS kuis |
| **SesiPresensi / Presensi** | Sesi: mapelId, judul, tanggal, kode (6 karakter), bukaSampai? (presensi mandiri), catatan / Presensi: sesiId+userId unique, status H/I/S/A, mandiri, keterangan, waktu | LMS presensi |
| **Mapel.bobotTugas/Kuis/Ujian/Presensi, kkm**; `Tugas.rubrik` (JSON [{kriteria,deskripsi,maks}]); `PengumpulanTugas.nilaiRubrik` (JSON number[]) | Bobot semua 0 = rata-rata biasa; rubrik ada = nilaiMaks = jumlah maks | LMS nilai |
| **UjianManual / NilaiUjianManual** | UjianManual: mapelId, judul, jenis (UH/UTS/UAS/LAIN), mode (offline/cat), kuisId?, semesterId, tanggal?, nilaiMaks, keterangan, terbit (nilai diumumkan), diumumkanAt / Nilai: ujianId+userId unique, nilai (Float), catatan | LMS ujian mapel |
| **DeskripsiRapor** (mapelId+userId+semesterId unique, deskripsi) / **CatatanRapor** (userId+semesterId unique, catatan) | tanpa relasi FK; dihapus bersama akun / mapel | Rapor |
| **BankSoal** (pemilikId, mapel = nama mapel, label, tipe, pertanyaan, opsi, kunci, pembahasan, bobot, bersama); `SesiPresensi.linkVirtual` | Bank soal guru & kelas virtual | Phase 18 |
| **Semester** + `semesterId` di Tugas/Kuis/SesiPresensi/UjianManual; `Kuis.modeUjian/token/maksPelanggaran`; `PercobaanKuis.pelanggaran/tambahanMenit`; `Mapel.bobotUH/UTS/UAS` | Semester: tahunAjaran+semester unique, aktif | Phase 18 |
| **Topik** + `Materi/Tugas/Kuis.topikId`, `Materi/Tugas.terbitPada` | Topik: mapelId, judul, deskripsi, urutan (topikId tanpa relasi FK; hapus topik = isi jadi tanpa topik). terbitPada = terbit terjadwal | LMS |
| **Pengumuman / Komentar** | mapelId, judul, isi / isi + salah satu materiId/tugasId/pengumumanId | LMS |

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

### Phase 26 — Lencana (2026-10-15)
| Item | Files |
|------|-------|
| **Lencana otomatis** per semester, dihitung saat dibuka (tidak disimpan) + progres untuk yang belum didapat: Rajin Hadir (≥95% dari ≥8 pertemuan), Tepat Waktu (semua tugas bertenggat dikumpulkan sebelum tenggat, ≥5), Pembaca Setia (≥90% materi, ≥5), Nilai Sempurna (nilai penuh tugas/kuis/ujian diumumkan), Jago Kuis (≥5 kuis, rata-rata ≥85), Aktif Berdiskusi (≥10 komentar), Tuntas Semua (KKM di semua mapel ber-KKM, ≥3; tidak dihitung di tampilan guru agar ringan) | `src/lib/lencana.ts` |
| **Lencana dari guru** (`LencanaSiswa`): guru pengampu/admin memberi ke banyak siswa sekaligus — Siswa Teraktif, Kreatif, Suka Membantu, Disiplin, Kemajuan Pesat, Juara Kelas, atau penghargaan bernama bebas + catatan; pemberi/admin bisa mencabut; siswa mendapat notifikasi lonceng | `src/app/api/lms/lencana/route.ts`, `src/app/api/lms/notifikasi/route.ts` |
| Halaman **Lencana** (siswa: miliknya; guru/admin: per mapel dengan centang siswa) & **Lencana Anak** (orang tua) | `src/components/Lencana.tsx`, `src/app/kelas/lencana/page.tsx`, `src/app/ortu/lencana/page.tsx` |
| Hapus akun/mapel ikut menghapus lencana; backup memuat `lencanaSiswa`; panduan diperbarui | `src/lib/lms.ts`, `src/app/api/admin/kelas/route.ts`, `src/app/api/admin/backup/route.ts` |
| Tes E2E (24 tes) | `tests/e2e/21-lencana.mjs` |

### Phase 25 — Akun Orang Tua & Pesan Pribadi (2026-10-15)
| Item | Files |
|------|-------|
| Role **ORANGTUA** (`OrangTuaSiswa`: satu orang tua bisa beberapa anak). Login → **portal `/ortu`**: kartu tiap anak (kehadiran %, tugas berjalan, tugas terlambat) & rincian (nilai per mapel seperti yang dilihat siswa — nilai belum diumumkan tidak tampil, tugas & status, ketidakhadiran, ujian mendatang, pengumuman, jadwal, tautan pesan ke wali/guru). **Rapor Anak** (`/ortu/rapor`, API rapor `?anak=`). Hanya baca; proxy membatasi ke `/ortu` & `/akun` | `src/app/api/ortu/route.ts`, `src/app/ortu/**`, `src/lib/ortu.ts`, `src/components/Rapor.tsx` (dipindah dari halaman rapor), `src/proxy.ts` |
| Admin **Pengguna → Orang Tua**: buat satu-satu (NIS anak), buat massal per kelas (`ortu-NIS`, password acak/tanggal lahir/NIS, unduh CSV password awal), edit tautan anak, reset password, hapus | `src/app/api/admin/orangtua/route.ts`, `src/app/admin/orangtua/page.tsx` |
| **Pesan pribadi** (`Pesan`; menu Pesan untuk semua role, penanda belum dibaca di bilah atas & menu, dicek tiap 60 dtk): daftar percakapan, pesan baru dengan pencarian kontak, utas diperbarui tiap 10 dtk, status dibaca, batas 20 pesan/menit. Aturan kontak: admin → siapa saja; guru → admin, guru, siswa kelas yang diajar/diwalikan & orang tuanya; siswa → admin, guru mapel & wali kelasnya (tidak ke siswa lain); orang tua → admin, guru & wali anaknya; pengawas → admin; membalas orang yang pernah mengirim selalu boleh | `src/lib/pesan.ts`, `src/app/api/pesan/route.ts`, `src/app/akun/pesan/page.tsx`, `src/components/AppShell.tsx` |
| Rekap kehadiran siswa dipindah ke fungsi bersama (menu Kehadiran & portal orang tua); hapus akun ikut menghapus tautan orang tua & pesan; backup memuat `orangTuaSiswa` & `pesan`; panduan Orang Tua | `src/lib/kehadiran.ts`, `src/lib/lms.ts`, `src/app/api/admin/backup/route.ts`, `src/app/akun/panduan/page.tsx` |
| Tes E2E (52 tes) | `tests/e2e/20-ortu-pesan.mjs` |

### Phase 24 — Identitas LMS, CAT sebagai Modul (2026-10-15)
Keputusan pemilik: aplikasi tampil sebagai LMS; ujian CAT adalah salah satu modul di dalamnya.

| Item | Files |
|------|-------|
| Menu admin: Beranda/Kalender → **Pembelajaran** (Kelas & Mapel, Jadwal, Jurnal, Bank Soal Guru, Rapor) → **Pengguna** (Siswa, Impor Dapodik, Guru & Staf, Reset Password) → **Modul Ujian CAT** (kotak bertanda "modul", bisa dilipat) → **Sistem** (bisa dilipat) → Akun. Grup lipat terbuka otomatis bila halamannya aktif; status buka/tutup diingat di browser (`localStorage.menuLipat`). Guru: grup Mengajar; siswa: grup Belajar dengan menu **Ujian Sekolah** (dulu "Ujian CAT") | `src/components/AppShell.tsx` |
| Judul halaman modul: grup "Modul Ujian CAT"; "Bank Soal Ujian", "Peserta & Ruang Ujian" | `src/app/admin/**` |
| Beranda admin: kartu **Aktivitas Belajar** (materi baru 7 hari, tugas berjalan, pertemuan & jurnal hari ini, % kehadiran hari ini) | `src/app/api/lms/kelas/route.ts`, `src/app/kelas/page.tsx` |
| Halaman depan: 7 fitur LMS (termasuk rapor/e-Rapor, administrasi guru, pemberitahuan) + kartu "Modul Ujian CAT" bertanda modul (hilang bila modul nonaktif); tautan lupa password | `src/app/page.tsx` |
| Sisa merek lama dihapus: "CAT SYSTEM" di review jawaban (→ nama aplikasi), teks terjemahan, nama cache service worker (`elearning-v2`), nama paket `e-learning-sekolah`, judul README/AGENTS; istilah siswa "Ujian sekolah" di beranda, kalender, dasbor ujian | berbagai |

### Phase 23 — Notifikasi WA/Email, Berita Acara, Dapodik & e-Rapor (2026-10-15)
| Item | Files |
|------|-------|
| **Notifikasi WhatsApp/email terjadwal**: tugas baru (termasuk terbit terjadwal), pengumuman, pengingat tenggat 24 jam (yang belum mengumpulkan), jadwal ujian 24 jam (ujian mapel offline/CAT, ujian CAT sekolah). Kunci unik per kejadian+siswa (tidak terkirim ganda); siswa bisa mematikan (`User.notifWa`). Penjadwal di `instrumentation.ts` (2 menit setelah start, lalu tiap 10 menit; `NOTIF_PENJADWAL=off` untuk mematikan — dipakai runner tes). Halaman admin **Notifikasi WA/Email**: pengaturan kanal, jenis pesan, kirim uji, "Kirim pengingat sekarang", log 30 terakhir | `src/lib/pengingat.ts`, `src/instrumentation.ts`, `src/app/admin/notifikasi/page.tsx`, `src/app/api/admin/notifikasi/route.ts` |
| **Berita acara & daftar hadir** ujian CAT sekolah per ruang & sesi (admin & pengawas; pengawas hanya ruangnya): kehadiran otomatis dari sesi ujian, waktu mulai/selesai, catatan kejadian, keterangan peserta tidak hadir, cetak daftar hadir (kolom tanda tangan) & berita acara | `src/app/api/admin/berita-acara/route.ts`, `src/app/admin/berita-acara/page.tsx`, `src/proxy.ts` |
| **Impor siswa dari Dapodik** (.xlsx unduhan "Daftar Peserta Didik" atau CSV): baris judul dicari otomatis, NIS = NIPD (kosong → NISN), kelas = Rombel Saat Ini; pratinjau lalu impor; siswa yang ada (NIS/NISN sama) diperbarui tanpa mengubah password; password awal NISN / tanggal lahir / NIS; opsi buat kelas. Kolom baru `User.nisn` (form admin) | `src/app/api/admin/dapodik/route.ts`, `src/app/admin/dapodik/page.tsx`, `tests/fixtures/dapodik-contoh.xlsx` |
| **Ekspor nilai e-Rapor** (.xlsx per kelas & semester, tombol di Rapor): lembar Rekap, satu lembar per mapel (NISN, NIS, Nama, L/P, Nilai Akhir, Predikat, Capaian Kompetensi), lembar Kehadiran & Ekskul (S/I/A, ekskul, prestasi, kokurikuler, catatan, keputusan). Urutan kolom template e-Rapor bisa berbeda per versi | `src/app/api/lms/rapor/ekspor/route.ts` |
| Pembaca/penulis xlsx & CSV tanpa dependensi (zip + XML; sharedStrings & inlineStr; tanggal teks/serial Excel) | `src/lib/xlsx.ts` |
| Tes E2E (44 tes) | `tests/e2e/19-berita-dapodik-notif.mjs` |

### Phase 22 — Remedial/Pengayaan/Susulan & Rapor Lengkap (2026-10-15)
| Item | Files |
|------|-------|
| **Remedial / pengayaan / susulan** dari tugas atau ujian mapel (tombol "+ Remedial/Susulan" di kolom tab Nilai; usulan siswa otomatis: di bawah KKM / belum bernilai / sudah tuntas). Tugas disalin untuk siswa terpilih; ujian offline dibuat baru; ujian CAT dibuat sebagai draf dengan soal disalin & token baru. Kolom `indukId`, `tipeSusulan`, `untukSiswa` (UjianManual & Kuis.untukSiswa) — siswa lain tidak melihat/mengerjakan/diberi nilai | `src/app/api/lms/susulan/route.ts`, `src/components/lms/RekapNilai.tsx` (`FormSusulan`), `src/components/lms/UjianManual.tsx` |
| Nilai turunan digabung ke induk di rekap & rapor (`gabungRemedial`): susulan mengisi nilai kosong / 0 lewat tenggat; remedial sesuai `Mapel.aturanRemedial` (maksKkm = tertinggi, nilai remedial dibatasi KKM [bawaan] / maks = tertinggi / ganti); pengayaan tidak mengubah nilai. Tab Nilai menampilkan nilai asli dicoret → nilai dipakai (`baris.akhir`) | `src/lib/rekap.ts` |
| **Rapor lengkap** (`DataRapor`, diisi wali kelas/admin di rapor satu siswa): ketidakhadiran sakit/izin/tanpa keterangan (hari; kosong = jumlah pertemuan dari presensi), ekstrakurikuler (maks 10, predikat & keterangan), prestasi, kokurikuler/projek, keputusan naik/tinggal kelas/lulus (+ ke kelas). Tercetak di rapor (keputusan tampil di semester Genap atau bila diisi) | `src/lib/rapor.ts` (`bacaDataRapor`, `dataRaporDariBody`), `src/app/api/lms/rapor/route.ts`, `src/app/kelas/rapor/page.tsx` (`FormDataRapor`) |
| Tes E2E (45 tes) | `tests/e2e/18-remedial-rapor.mjs` |

### Phase 21 — Jadwal Pelajaran & Jurnal Mengajar (2026-10-15)
| Item | Files |
|------|-------|
| **Jadwal pelajaran** (roster) per semester: admin mengisi per kelas (mapel, hari, jam, ruang); ditolak bila bentrok di kelas yang sama atau guru pengampu yang sama. Siswa: jadwal kelasnya; guru: jadwal mengajarnya / kelas yang diajar; admin: per kelas atau per guru; cetak. Kartu **Jadwal Hari Ini** di beranda siswa/guru. Hapus mapel ikut menghapus jadwalnya | `src/app/api/lms/jadwal/route.ts`, `src/app/kelas/jadwal/page.tsx`, `src/app/api/lms/kelas/route.ts` |
| **Jurnal mengajar**: guru mengisi tanggal, jam ke-, materi, kegiatan, catatan per pertemuan; siswa tidak hadir (I/S/A) otomatis dari presensi mapel itu pada tanggal yang sama (atau pertemuan yang dipilih). Admin melihat semua (filter guru/mapel/tanggal) untuk supervisi; cetak dengan tanda tangan kepala sekolah & guru. Mapel yang punya jurnal tidak bisa dihapus | `src/app/api/lms/jurnal/route.ts`, `src/app/kelas/jurnal/page.tsx` |
| Tes E2E (44 tes) | `tests/e2e/17-jadwal-jurnal.mjs` |

### Phase 20 — Akun, Media Soal, Arsip Semester (2026-10-15)
| Item | Files |
|------|-------|
| **Kehadiran Saya** (siswa): rekap H/I/S/A & % lintas mapel per semester + riwayat per pertemuan (menu Kehadiran) | `src/app/api/lms/kehadiran/route.ts`, `src/app/kelas/kehadiran/page.tsx` |
| **Wali kelas** = `Kelas.waliId` (pilih guru di Kelas & Mapel; data lama "Wali kelas: Nama" di keterangan tetap dikenali) | `src/lib/wali.ts`, `src/app/api/admin/kelas/route.ts`, `src/app/admin/kelas/page.tsx` |
| **Lupa password** (`/lupa-password`, publik): bila email/WA aktif & akun punya kontak → kode 6 angka (15 menit, 5 percobaan, sekali pakai); selain itu permintaan ke wali kelas/admin. Menu **Reset Password Siswa** (wali: siswa perwaliannya; admin: semua) → password sementara. `User.email`, `User.notifWa` di Data Diri & form admin | `src/app/api/lupa-password/route.ts`, `src/app/api/lms/reset-password/route.ts`, `src/app/lupa-password/page.tsx`, `src/app/kelas/reset-password/page.tsx` |
| **Notifikasi luar aplikasi** (dasar): email SMTP (nodemailer) & WhatsApp gateway (Fonnte / Wablas / URL lain JSON `{target,message}`), log & anti-kirim-ganda (`NotifKeluar.kunci`). API admin: pengaturan (rahasia tidak dikirim balik) + kirim uji | `src/lib/notif-keluar.ts`, `src/app/api/admin/notifikasi/route.ts` |
| **Soal bergambar, berumus, beraudio**: unggah `/api/media` (admin/guru; JPG/PNG/GIF/WEBP 5 MB, MP3/OGG/WAV/M4A 15 MB, cek magic bytes) → disisipkan `[gambar:URL]`/`[audio:URL]`; rumus LaTeX `$...$`, `$$...$$`, `\(...\)` dirender KaTeX. Editor (tombol + Gambar/Audio, + Rumus, pratinjau) di soal kuis/ujian CAT mapel, bank soal, & Bank Soal CAT admin; tampil di ujian CAT, review, kuis, bank soal. Media dilayani untuk pengguna login dengan dukungan Range (audio Safari) | `src/components/KontenSoal.tsx`, `src/app/api/media/**`, `src/lib/storage.ts` (`MEDIA_DIR`) |
| **Arsip anggota kelas per semester** (`AnggotaKelas`): disalin otomatis saat ganti semester aktif & sebelum pindah/naik kelas massal (tidak menimpa arsip lama); rekap nilai, presensi, deskripsi, anggota mapel, rapor, & kehadiran semester lalu memakai arsip → data tahun lalu utuh setelah kenaikan kelas. Ganti nama kelas ikut mengganti arsip | `src/lib/anggota.ts` |
| **Panduan** per peran (siswa, guru, wali kelas, pengawas, admin), bisa dicetak/simpan PDF (menu Panduan) | `src/app/akun/panduan/page.tsx` |
| Backup memuat tabel baru (arsip anggota, data rapor, jadwal, jurnal, berita acara) & folder media soal (`mediaSoal`); runner tes `--hanya 16` | `src/app/api/admin/backup/route.ts`, `tests/run.mjs` |
| Tes E2E (69 tes) | `tests/e2e/16-akun-media-arsip.mjs` |

### Phase 19 — Ujian CAT Sekolah per Kelas (2026-10-15)
| Item | Files |
|------|-------|
| `Ujian.kelasTarget` (",A,B,"; "" = kelas mapel bila `mapelId`, selain itu semua siswa), `Ujian.jenis` (UH/UTS/UAS/LAIN), `Ujian.semesterId` (ujian baru → semester aktif) | `prisma/schema.prisma`, `src/app/api/admin/ujian/route.ts`, `src/app/admin/ujian/page.tsx` |
| Beberapa ujian aktif bersamaan untuk kelas berbeda; ujian aktif untuk siswa dicari dari kelasnya (`ujianAktifUntuk`) di ujian, submit, simpan, sesi pengawas, data diri, beranda, riwayat, review | `src/lib/ujian-peserta.ts`, `src/lib/sesi-ujian.ts`, `src/app/api/ujian/**`, `src/app/api/me/route.ts` |
| Status sudah/mengerjakan/belum **per ujian** dari `SesiUjian` (bukan `User.sudahUjian` global); jawaban ujian lain tidak terhapus saat menilai | `src/lib/ujian-peserta.ts` (`statusPeserta`, `sudahMengerjakan`) |
| Menu **Peserta Ujian** (admin): siswa kelas target per ujian + status & nilai, atur ruang/sesi per kelas atau per siswa, reset satu siswa / semua peserta satu ujian (riwayat nilai tetap) | `src/app/admin/peserta-ujian/page.tsx`, `src/app/api/admin/peserta-ujian/route.ts` |
| Monitoring, rekap nilai admin, dasbor statistik per ujian aktif | `src/app/api/admin/{monitoring,nilai,stats}/route.ts` |
| Rekap nilai mapel: ujian CAT sekolah khusus mapel atau lintas mapel (skor mata pelajaran bernama sama) untuk kelas itu, per semester, masuk komponen UH/UTS/UAS sesuai `jenis` | `src/lib/rekap.ts` |
| Migrasi sekali jalan data lama (sudah dijalankan di dev.db; jalankan juga di server setelah `db push`): `node scripts/migrasi-status-ujian.mjs` | `scripts/migrasi-status-ujian.mjs` |
| Tes E2E multi-ujian (39 tes) | `tests/e2e/15-multi-ujian.mjs` |

### Phase 18 — Ujian per Mapel (UH/UTS/UAS) & Semester (2026-10-14)
Keputusan pemilik: tiap mapel punya ujian sendiri yang dikelola guru, dengan opsi pelaksanaan CAT; CAT dibangun dari mesin Kuis;
semester aktif global; menu Ujian CAT admin tetap untuk ujian sekolah.

| Item | Files |
|------|-------|
| **Semester**: model `Semester` (tahunAjaran, Ganjil/Genap, satu aktif), `semesterId` di Tugas/Kuis/SesiPresensi/UjianManual. Semester pertama dibuat otomatis dari tanggal & data lama dimasukkan ke situ; data baru → semester aktif | `src/lib/semester.ts`, `src/app/api/admin/semester/route.ts`, `src/components/Semester.tsx` (di Admin → Pengaturan) |
| Halaman mapel, presensi, ujian, & rekap nilai per semester (`?semester=id`, bawaan aktif); pilihan semester di sampul mapel | `src/app/api/lms/mapel/[id]/route.ts`, `nilai/route.ts`, `presensi/route.ts`, `src/app/kelas/[id]/page.tsx` |
| **Ujian mapel** (`UjianManual` + `jenis` UH/UTS/UAS/LAIN, `mode` offline/cat, `kuisId`): offline = guru isi nilai; CAT = dibuat otomatis Kuis `modeUjian` (1 kesempatan, acak soal, token 6 karakter, draf sampai soal diterbitkan). Nilai CAT = hasil mengerjakan; siswa melihat nilai/jawaban setelah guru **Umumkan Nilai** | `src/app/api/lms/ujian-manual/route.ts`, `src/components/lms/UjianManual.tsx` |
| Mode ujian saat mengerjakan: token wajib (bila ada, percobaan dibatasi), layar penuh, pindah tab / keluar layar penuh = pelanggaran (dicatat server; ke-`maksPelanggaran` = kumpul otomatis), salin-tempel & klik kanan diblokir, token tidak pernah dikirim ke siswa | `src/app/api/lms/kuis/[id]/kerjakan/route.ts`, `src/components/lms/kuis.tsx` |
| **Monitoring** guru (tab Monitoring di halaman ujian): status, terjawab, sisa waktu, pelanggaran, nilai; tambah waktu (`PercobaanKuis.tambahanMenit`), kumpulkan paksa, reset, ganti/hapus token | `src/app/api/lms/kuis/[id]/monitor/route.ts`, `src/components/lms/MonitorUjian.tsx` |
| Rekap: komponen UH/UTS/UAS + bobot `Mapel.bobotUH/UTS/UAS` (Ujian lain = jenis LAIN + ujian CAT sekolah, yang tampil hanya di semester aktif) | `nilai/route.ts`, `src/components/lms/RekapNilai.tsx` |
| Kuis mode ujian tidak tampil di tab Kuis; agenda/kalender/notifikasi menyebut "Ujian"; backup memuat semester | API kelas, kalender, notifikasi, backup |
| Tes E2E semester & ujian CAT mapel (75 tes) | `tests/e2e/12-ujian-cat-semester.mjs` |
| **Rapor** lintas mapel per semester (menu Rapor): kop sekolah, nilai per komponen (UH/UTS/UAS/tugas/kuis/hadir), nilai akhir & KKM per mapel, rata-rata, kehadiran H/I/S/A gabungan, peringkat (staf), tanda tangan orang tua / wali kelas / penandatangan (dari Pengaturan kartu), cetak A4 satu halaman per siswa. Admin: semua kelas; guru: kelas yang diajar atau diwalikan (keterangan kelas "Wali kelas: Nama"); siswa: rapornya sendiri tanpa nilai yang belum diumumkan | `src/app/api/lms/rapor/route.ts`, `src/app/kelas/rapor/page.tsx` |
| Perhitungan rekap nilai mapel dipindah ke satu fungsi (dipakai tab Nilai & rapor) | `src/lib/rekap.ts` |
| Tes E2E rapor (38 tes) | `tests/e2e/13-rapor.mjs` |
| Rapor **format Kurikulum Merdeka** (nilai akhir, **predikat**, **capaian kompetensi**) atau rinci per komponen; **catatan wali kelas** per siswa (diisi di rapor satu siswa). Batas predikat A/B/C diatur admin (Pengaturan → Predikat Rapor, bawaan 90/80/70) | `src/lib/rapor.ts`, `src/app/api/lms/rapor/route.ts` (PUT catatan), `src/app/kelas/rapor/page.tsx` |
| **Deskripsi capaian** per siswa per mapel per semester di tab Nilai (guru): saran otomatis dari nilai tertinggi/terendah (nama mapel tidak diulang), sunting, simpan | `src/app/api/lms/mapel/[id]/deskripsi/route.ts`, `src/components/lms/DeskripsiRapor.tsx` |
| **Bank soal guru** (menu Bank Soal): soal per *nama* mapel (lintas kelas), label bab/topik, cari, bagikan ke guru lain (hanya pemilik yang mengubah/menghapus), tambah lewat editor/impor teks. Di editor soal kuis & ujian CAT: **Ambil dari Bank Soal** (disalin) dan **Simpan ke Bank Soal** | `src/app/api/lms/bank-soal/route.ts`, `src/app/kelas/bank-soal/page.tsx`, `src/components/lms/kuis.tsx` (`PilihBankSoal`, `EditorSoal` props `simpanKe`/`mapelNama`/`tunggal`) |
| **Tautan kelas virtual** (Zoom/Meet) per pertemuan presensi: tombol Gabung di tab Presensi (sejak hari pertemuan) & kartu "Kelas Virtual Hari Ini" di beranda siswa/guru | `SesiPresensi.linkVirtual`, `src/app/api/lms/presensi/route.ts`, `src/components/lms/Presensi.tsx`, `src/app/api/lms/kelas/route.ts` |
| Tes E2E bank soal & kelas virtual (31 tes) | `tests/e2e/14-bank-soal-virtual.mjs` |

### Phase 17 — Tampilan LMS-first (2026-10-14)
Aplikasi diposisikan sebagai **LMS yang punya modul ujian CAT** (keputusan pemilik). Dikerjakan bertahap:

| Tahap | Isi | Files |
|-------|-----|-------|
| 1 | Satu kerangka untuk semua role: bilah atas (nama aplikasi + sekolah, notifikasi, user, Keluar) + menu samping (layar lebar) / laci menu (HP); tidak dipakai di `/ujian` (layar penuh) & tersembunyi saat cetak | `src/components/AppShell.tsx`, `src/app/{kelas,admin,akun,profile,dashboard}/layout.tsx` |
| 1 | Setelah login semua role ke beranda LMS `/kelas` (pengawas tetap ke monitoring). Beranda: siswa = banner ujian CAT aktif untuk kelasnya; guru/admin = "Perlu Dinilai"; admin = ringkasan sekolah | `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/api/lms/kelas/route.ts`, `src/app/kelas/page.tsx` |
| 1 | Identitas aplikasi: `instansi.namaAplikasi` (default "E-Learning") & `instansi.modulCat` (aktif/nonaktif → menu & banner CAT disembunyikan); API publik `/api/identitas` | `src/lib/pengaturan-aplikasi.ts`, `src/app/api/identitas/route.ts` |
| 2 | Semua halaman admin di dalam kerangka; navbar lama diganti `HeaderHalaman` (grup + judul + aksi); menu admin dikelompokkan Akademik / Ujian CAT / Sistem; halaman **Pengaturan** (nama aplikasi, sekolah, alamat, logo, modul CAT) | `src/app/admin/**`, `src/app/admin/pengaturan/page.tsx` |
| 3 | Halaman depan LMS (nama aplikasi & sekolah, fitur; kartu Ujian CAT hanya bila modul aktif), login "NIS / Username", judul tab = nama aplikasi, istilah "Siswa" di admin, kaki kartu ujian memakai nama aplikasi | `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/admin/peserta/page.tsx`, `src/app/admin/kartu/page.tsx` |
| 3 | **Data Diri** bisa dilihat & diubah kapan saja (tema terang, terisi data lama); simpan tidak lagi gagal bila belum ada jadwal ujian (ruang diatur admin). Dari dasbor ujian (`?lanjut=ujian`) kembali ke ujian | `src/app/profile/page.tsx`, `src/app/api/me/route.ts` |
| 3 | Mode gelap tidak lagi otomatis mengikuti sistem (tampilan LMS terang); hanya bila dipilih pengguna. Dasbor ujian siswa tanpa tombol ganda (password/keluar/kelas sudah di menu) | `src/app/layout.tsx`, `src/components/ThemeProvider.tsx`, `src/app/dashboard/page.tsx` |

`LmsNav` kini hanya sub-judul halaman (kembali + judul); bilah tab mapel `sticky top-14` mengikuti tinggi bilah atas.

### Phase 16 — LMS (2026-10-14)
Ujian CAT kini bagian dari LMS. Anggota kelas = peserta dengan `User.kelas` == `Kelas.nama` (ganti nama kelas ikut mengganti kelas peserta).

| Role | Akses LMS |
|------|-----------|
| ADMIN | Kelola kelas & mapel (`/admin/kelas`), buka & kelola semua mapel di `/kelas` |
| GURU (baru) | Hanya `/kelas` & `/akun`; mengelola mapel yang ia ampu (materi, tugas, nilai, pengumuman, diskusi) |
| PESERTA | `/kelas` — mapel di kelasnya: baca materi, kumpulkan tugas, lihat nilai, diskusi; plus ujian CAT seperti biasa |

| Item | Files |
|------|-------|
| Model Kelas, Mapel, Materi, MateriDibaca, Tugas, PengumpulanTugas, Pengumuman, Komentar; `Ujian.mapelId` | `prisma/schema.prisma` |
| Hak akses per mapel (kelola/siswa), validasi, hapus data LMS saat akun dihapus | `src/lib/lms.ts` |
| Admin: CRUD kelas & mapel, buat kelas dari data peserta | `src/app/admin/kelas/page.tsx`, `src/app/api/admin/kelas/route.ts` |
| Beranda LMS, halaman mapel (tab Beranda/Materi/Tugas/Ujian/Anggota), detail materi, detail tugas & penilaian (+CSV) | `src/app/kelas/**`, `src/components/lms/ui.tsx` |
| API LMS: kelas, mapel, materi, tugas, pengumpulan, pengumuman, komentar | `src/app/api/lms/**` |
| Upload lampiran (PDF/Office/gambar/TXT/ZIP, maks 10 MB, cek magic bytes) di `STORAGE_DIR/lms` | `src/app/api/lms/upload/route.ts`, `src/app/api/lms/file/[name]/route.ts` |
| Materi tercatat "sudah dibaca" saat siswa membuka; video YouTube disematkan | `src/app/api/lms/materi/[id]/route.ts` |
| Tugas: tenggat, terlambat ditandai, jawaban terkunci setelah dinilai | `src/app/api/lms/pengumpulan/route.ts` |
| Ujian bisa ditautkan ke mapel; siswa kelas lain mendapat layar "Ujian bukan untuk kelas Anda" | `src/app/admin/ujian/page.tsx`, `src/app/api/ujian/route.ts`, `src/app/ujian/page.tsx` |
| Backup/restore memuat tabel LMS (ujian dipulihkan setelah mapel) | `src/app/api/admin/backup/route.ts` |
| Rekap nilai per mapel (tab Nilai): tugas + ujian CAT per siswa, rata-rata %, tugas lewat tenggat tanpa kumpul = 0, CSV; siswa hanya nilainya | `src/app/api/lms/mapel/[id]/nilai/route.ts`, `src/components/lms/RekapNilai.tsx` |
| Beranda `/kelas` siswa: daftar "Tugas yang Harus Dikerjakan" lintas mapel (tenggat terdekat) | `src/app/api/lms/kelas/route.ts`, `src/app/kelas/page.tsx` |
| Lampiran hanya bisa dibuka anggota mapel (draf: pengelola; jawaban: pemilik & guru) | `src/lib/lms.ts` (`bolehBukaLampiran`), `src/app/api/lms/file/[name]/route.ts` |
| Backup JSON memuat file lampiran LMS (`lampiranLms`, base64) | `src/app/api/admin/backup/route.ts` |
| Tugas untuk siswa tertentu (`untukSiswa`); siswa lain tidak melihat/mengumpulkan/berkomentar; rekap nilai = n/a | `src/lib/lms.ts` (`whereTugasSiswa`, `ditugaskan`), `src/app/api/lms/tugas/route.ts` |
| Maks 5 lampiran per tugas & per jawaban (`berkas: [{url,nama}]`; lampiran pertama tetap di kolom lama) | `src/lib/lms.ts` (`berkasDariBody`, `daftarBerkas`), `src/components/lms/ui.tsx` (`UploadBerkas`) |
| Opsi "terima terlambat" — bila mati, pengumpulan setelah tenggat ditolak (kecuali revisi) | `src/app/api/lms/pengumpulan/route.ts` |
| Minta revisi: guru mengembalikan jawaban dengan catatan, siswa kirim ulang; filter penilaian (perlu dinilai/revisi/dinilai/belum kumpul), lompat ke siswa berikutnya | `src/app/api/lms/pengumpulan/route.ts`, `src/app/kelas/[id]/tugas/[tugasId]/page.tsx` |
| Unduh semua jawaban satu tugas sebagai ZIP (folder per siswa, tanpa dependensi) | `src/app/api/lms/tugas/[id]/zip/route.ts`, `src/lib/zip.ts` |
| Salin tugas ke mapel lain yang dikelola (sebagai draf) | `src/app/api/lms/tugas/route.ts` (`salinDari`) |
| Notifikasi (lonceng): siswa — tugas/materi/pengumuman baru, nilai, revisi; guru — pengumpulan baru, komentar. Dihitung dari data 30 hari, dibaca = `User.notifDibacaAt` | `src/app/api/lms/notifikasi/route.ts`, `src/components/lms/Notifikasi.tsx` |
| Tes E2E LMS (134 tes) | `tests/e2e/06-lms.mjs` |
| **Kuis per mapel** (terpisah dari mesin ujian CAT, banyak kuis bisa dibuka bersamaan): soal PG/benar-salah/isian/esai, bobot, pembahasan, impor soal dari teks, jadwal buka/tutup, durasi (timer server), beberapa percobaan (nilai tertinggi), acak soal, simpan otomatis, waktu habis = dinilai dari jawaban tersimpan | `src/lib/kuis.ts`, `src/app/api/lms/kuis/**`, `src/components/lms/kuis.tsx`, `src/app/kelas/[id]/kuis/[kuisId]/page.tsx` |
| Kuis: guru menilai esai, hapus percobaan (kerjakan ulang), ubah kunci = nilai dihitung ulang, CSV; siswa lihat kunci & pembahasan setelah kuis ditutup (bila diizinkan) | `src/app/api/lms/percobaan/[id]/route.ts` |
| Kuis masuk rekap nilai (nilai tertinggi; ditutup tanpa dikerjakan = 0), agenda siswa, notifikasi (kuis dibuka / esai perlu dinilai), backup | `nilai/route.ts`, `kelas/route.ts`, `notifikasi/route.ts`, `backup/route.ts` |
| Tes E2E kuis (63 tes) | `tests/e2e/07-kuis.mjs` |
| **Presensi per pertemuan** (tab Presensi): guru membuat pertemuan & mengisi H/I/S/A (+keterangan), presensi mandiri siswa dengan kode/QR selama waktu yang ditentukan (percobaan kode dibatasi), ganti kode/tutup, rekap % kehadiran (<75% merah) + CSV; notifikasi presensi dibuka; backup | `src/app/api/lms/presensi/route.ts`, `src/components/lms/Presensi.tsx` |
| Tes E2E presensi (34 tes) | `tests/e2e/08-presensi.mjs` |
| **Topik** (tab Topik): materi/tugas/kuis dikelompokkan per bab/minggu, urutkan, pindah item, progres siswa per topik | `src/app/api/lms/topik/route.ts`, `src/components/lms/Topik.tsx` |
| **Terbit terjadwal** materi & tugas (Draf / Terbitkan sekarang / Jadwalkan): sebelum waktunya tidak terlihat, tidak bisa dibuka/dikumpulkan/dikomentari, tidak masuk notifikasi & tidak dihitung 0 di rekap | `src/lib/lms.ts` (`whereTerbit`, `sudahTerbit`), `src/components/lms/ui.tsx` (`PilihTerbit`) |
| **Progres belajar** per siswa di tab Anggota (materi dibaca, tugas dikumpulkan, kuis dikerjakan, %) | `src/app/api/lms/mapel/[id]/route.ts` (`progres`) |
| Tes E2E topik, jadwal, progres (38 tes) | `tests/e2e/09-topik-jadwal.mjs` |
| **Kalender** (`/kelas/kalender`): tenggat tugas, kuis dibuka/ditutup, pertemuan, jadwal ujian mapel, (guru) terbit terjadwal; tanda selesai untuk siswa | `src/app/api/lms/kalender/route.ts`, `src/app/kelas/kalender/page.tsx` |
| **Bobot nilai akhir** per kategori (tugas/kuis/ujian/presensi) + **KKM** (tuntas/belum) di tab Nilai, CSV ikut komponen | `src/app/api/lms/mapel/[id]/route.ts` (PUT), `nilai/route.ts`, `src/components/lms/RekapNilai.tsx` |
| **Rubrik penilaian tugas**: kriteria + skor maks, guru mengisi skor per kriteria (nilai = jumlah), siswa melihat rincian; ikut disalin; revisi mengosongkan skor | `src/lib/lms.ts` (`rubrikDariBody`), `pengumpulan/route.ts`, `src/components/lms/ui.tsx` (`TabelRubrik`) |
| Tes E2E kalender, bobot nilai, rubrik (31 tes) | `tests/e2e/10-kalender-nilai.mjs` |
| **Ujian offline / nilai manual** (tab Ujian): ujian CAT kini opsional — guru membuat ujian (nama, tanggal, nilai maks), mengisi nilai + catatan per siswa (atau tempel 2 kolom dari Excel: NIS/nama + nilai), lalu **Umumkan**. Sebelum diumumkan siswa hanya melihat jadwalnya. Masuk rekap nilai kategori Ujian (dipersenkan dari nilai maks; tanpa nilai = tidak dihitung), kalender, notifikasi nilai, backup, CSV | `src/app/api/lms/ujian-manual/route.ts`, `src/components/lms/UjianManual.tsx` |
| Tes E2E ujian offline (44 tes) | `tests/e2e/11-ujian-manual.mjs` |
| Admin Kelas & Mapel: cari kelas/wali/mapel/guru, filter tingkat, daftar mapel per kelas bisa dibuka-tutup; Ruang Belajar admin/guru: cari & lipat per kelas bila mapel > 12 | `src/app/admin/kelas/page.tsx`, `src/app/kelas/page.tsx` |

Kartu ujian (sesi yang sama): tema warna & model ringkas 4 kartu/A4, QR nomor peserta (`qrcode`), disimpan di `instansi.warnaKartu`/`instansi.modelKartu`.

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
| GURU | `/kelas` (LMS, mapel yang diampu) & `/akun/password` — lihat Phase 16 |
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
- `npm run test:e2e` (butuh build): 945 tes lulus — lihat `tests/README.md`
- Deploy: lihat `DEPLOY.md`
- ±60 routes (halaman statis + API dinamis)
- `npx eslint src`: 0 error (sisa warning ringan, mis. `<img>`)

---

## Known Limitations / Future Work
1. ~~Timer is client-side only (server doesn't validate waktuMulai)~~ ✅ FIXED
2. ~~No rate limiting on login (brute-force possible)~~ ✅ FIXED
3. ~~No CSRF protection~~ ✅ FIXED
4. ~~No question weights/bobot~~ ✅ FIXED
5. ~~Single exam configuration only (no multi-exam support)~~ ✅ FIXED
6. SQLite dipertahankan (mode WAL, diuji 150 peserta serentak). Pindah ke PostgreSQL butuh ubah `provider` di schema & uji ulang — belum dilakukan
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
