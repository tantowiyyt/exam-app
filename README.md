# E-Learning & Ujian CAT Sekolah

Aplikasi **LMS (Learning Management System) sekolah** yang dilengkapi **modul ujian CAT (Computer Assisted Test)**.
Dipasang di satu server/PC di sekolah dan diakses siswa, guru, pengawas, serta admin lewat browser di jaringan lokal (atau internet).

Dibangun dengan Next.js 16, React 19, Prisma + SQLite, dan Tailwind CSS 4. Tidak butuh server database terpisah.

> **Status:** fitur lengkap dan teruji otomatis (667 tes E2E, uji beban 150 peserta serentak tanpa gagal).
> Disarankan **simulasi di lab** dulu sebelum dipakai untuk ujian sungguhan — lihat [checklist go-live](DEPLOY.md#9-checklist-sebelum-ujian-pertama).

---

## Daftar Isi

- [Fitur](#fitur)
- [Peran Pengguna](#peran-pengguna)
- [Instalasi Cepat (Coba di Komputer Sendiri)](#instalasi-cepat-coba-di-komputer-sendiri)
- [Instalasi di Server Sekolah](#instalasi-di-server-sekolah)
- [Langkah Pertama Setelah Instalasi](#langkah-pertama-setelah-instalasi)
- [Memperbarui Aplikasi](#memperbarui-aplikasi)
- [Backup](#backup)
- [Pengujian](#pengujian)
- [Struktur Proyek](#struktur-proyek)
- [Keterbatasan](#keterbatasan)

---

## Fitur

### Ruang belajar (LMS)
- **Kelas & mata pelajaran**: tiap mapel punya guru pengampu; anggota kelas otomatis dari data siswa. Ada wali kelas.
- **Materi**: teks, video YouTube, lampiran (PDF/Office/gambar/ZIP, maks 10 MB); tercatat siapa yang sudah membaca.
- **Tugas**: tenggat, terima/tolak terlambat, tugas untuk siswa tertentu, maks 5 lampiran, **rubrik penilaian**,
  minta revisi, unduh semua jawaban sebagai ZIP, salin tugas ke kelas lain.
- **Kuis**: pilihan ganda, benar/salah, isian, esai; acak soal, timer dari server, beberapa percobaan, pembahasan.
- **Presensi** per pertemuan: diisi guru (H/I/S/A) atau mandiri oleh siswa dengan kode/QR; tautan **kelas virtual** (Zoom/Meet).
- **Topik/bab**, **terbit terjadwal**, **kalender**, **pengumuman & diskusi**, **notifikasi**, progres belajar per siswa.
- **Bank soal guru**: simpan soal per mapel (lintas kelas), beri label bab, bagikan ke guru lain.
- **Nilai**: rekap per mapel dengan bobot tugas/kuis/UH/UTS/UAS/presensi dan **KKM**, ekspor CSV.
- **Ujian per mapel** (UH/UTS/UAS): offline (guru mengisi nilai) atau CAT (token, layar penuh, deteksi pelanggaran, monitoring guru).
- **Soal bergambar, beraudio (listening), dan berumus** (notasi LaTeX `$x^2$`) di kuis, ujian, dan bank soal.
- **Remedial, pengayaan, dan susulan** dari tugas/ujian untuk siswa tertentu; nilai yang masuk rapor mengikuti aturan mapel
  (nilai tertinggi dibatasi KKM, nilai tertinggi, atau mengganti).
- **Semester** aktif dan **rapor** lintas mapel: format **Kurikulum Merdeka** (nilai akhir, predikat, capaian kompetensi)
  atau rinci per komponen, deskripsi capaian, catatan wali kelas, **ekstrakurikuler, prestasi, kokurikuler, ketidakhadiran S/I/A,
  keputusan naik kelas**, peringkat, siap cetak A4. Data tahun lalu tetap utuh setelah kenaikan kelas (arsip anggota kelas per semester).

### Administrasi sekolah
- **Jadwal pelajaran** (roster) per kelas & per guru dengan cek bentrok; "Jadwal Hari Ini" di beranda.
- **Jurnal mengajar** guru: materi & kegiatan per pertemuan, siswa tidak hadir otomatis dari presensi; tampilan supervisi & cetak.
- **Rekap kehadiran** siswa lintas mapel.
- **Impor siswa dari Dapodik** (file Excel unduhan Dapodik) dan **ekspor nilai untuk e-Rapor** (Excel per kelas: nilai akhir, predikat,
  capaian, kehadiran, ekskul).
- **Lupa password mandiri**: kode lewat WhatsApp/email, atau permintaan ke wali kelas yang bisa mereset password siswanya.
- **Notifikasi WhatsApp & email** (opsional): tugas baru, pengumuman, pengingat tenggat H-1, jadwal ujian H-1.
- **Panduan penggunaan** per peran di dalam aplikasi (bisa dicetak/PDF).

### Ujian CAT sekolah
- Kelola ujian: durasi, jadwal mulai/selesai, **pool soal** (soal acak per siswa), bagian ujian (bisa berwaktu sendiri).
- **Beberapa ujian aktif bersamaan** untuk kelas yang berbeda; status "sudah ujian" dicatat per ujian.
- **Timer dan sesi di server**: jawaban tersimpan otomatis, tahan refresh/mati listrik, bisa lanjut di komputer lain,
  waktu habis = dinilai otomatis.
- **Anti-curang**: deteksi pindah tab & keluar layar penuh, blokir salin-tempel/klik kanan/shortcut, watermark nama,
  otomatis dikumpulkan pada pelanggaran ke-5. (Untuk penguncian perangkat penuh, gunakan [Safe Exam Browser](https://safeexambrowser.org).)
- **Peserta Ujian**: atur ruang & sesi per kelas/siswa, reset per siswa atau per ujian.
- **Berita acara & daftar hadir** per ruang/sesi untuk pengawas (kehadiran otomatis, catatan kejadian, siap cetak).
- **Monitoring real-time** untuk pengawas: progres, sisa waktu, pelanggaran; tambah waktu, kumpulkan paksa, reset sesi.
- **Kartu ujian A4** (kop sekolah, foto, QR, tata tertib), rekap nilai + CSV, histori, statistik & analisis tingkat kesulitan soal,
  review jawaban oleh siswa.
- Impor siswa & soal dari CSV.

### Sistem & keamanan
- Login JWT di cookie httpOnly, password bcrypt, pembatas percobaan login, CSRF, header keamanan.
- Hak akses dicek dari database di setiap API; audit log, log aktivitas, aturan IP (whitelist/blacklist).
- Backup & restore lengkap (JSON berisi data + foto + lampiran) dari menu admin.
- Identitas sekolah (nama aplikasi, logo, kop) diatur dari menu Pengaturan; modul CAT bisa dinonaktifkan.
- Tampilan responsif (HP/laptop), mode gelap opsional, bahasa Indonesia/Inggris.

## Peran Pengguna

| Peran | Akses |
|---|---|
| **Admin** | Semua menu: akun, kelas & mapel, jadwal, jurnal (supervisi), semester, impor Dapodik, ujian CAT sekolah, kartu, berita acara, nilai, rapor & ekspor e-Rapor, notifikasi, pengaturan, backup |
| **Guru** | Mapel yang diampu (materi, tugas, kuis, presensi, ujian mapel, remedial, nilai), jadwal & jurnal mengajar, bank soal, rapor kelas yang diajar |
| **Wali kelas** (guru) | Ditambah: data rapor (ekskul, prestasi, ketidakhadiran, kenaikan kelas), reset password siswa perwaliannya |
| **Pengawas** | Monitoring ujian CAT dan berita acara/daftar hadir (dibatasi ke ruangnya bila diisi) |
| **Siswa** | Ruang belajar kelasnya, jadwal, kehadiran, ujian CAT, nilai & rapor sendiri, data diri |

---

## Instalasi Cepat (Coba di Komputer Sendiri)

**Kebutuhan:** [Node.js](https://nodejs.org) versi **20 atau lebih baru** (diuji dengan v24) dan [Git](https://git-scm.com).

```bash
git clone https://github.com/tantowiyyt/exam-app.git
cd exam-app
npm ci

# Konfigurasi
cp .env.example .env              # Windows (cmd/PowerShell): copy .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   -> salin hasilnya ke SESSION_SECRET di file .env

# Database & akun admin pertama
npm run db:push
npm run admin:buat -- admin "PasswordAdminKuat123" "Administrator"

# Jalankan (mode pengembangan)
npm run dev
```

Buka **http://localhost:3000**, lalu login dengan username dan password admin yang baru dibuat.

> Database (`prisma/dev.db`), foto/lampiran (`storage/`), dan `.env` **tidak** ikut di repo — semuanya dibuat di komputer Anda.

## Instalasi di Server Sekolah

Ringkasnya, sama seperti di atas tetapi dijalankan dalam mode produksi:

```bash
npm ci
cp .env.example .env              # isi SESSION_SECRET; COOKIE_SECURE=false bila diakses via http://IP
npm run db:push
npm run admin:buat -- admin "PasswordAdminKuat123" "Administrator"
npm run build
npm start -- -p 3000
```

Siswa membuka `http://<IP-server>:3000` dari komputer lab.

Hal penting:
- **`COOKIE_SECURE=false`** wajib bila aplikasi diakses lewat `http://` (tanpa HTTPS); tanpa ini semua orang gagal login.
- Buka port 3000 di firewall server.
- Jalankan **satu instance saja** (jangan mode cluster).
- Opsional: `STORAGE_DIR` untuk menaruh foto & lampiran di luar folder aplikasi.

Panduan lengkap — firewall, HTTPS dengan reverse proxy, menjalankan sebagai layanan Windows (NSSM) / Linux (systemd),
backup terjadwal, kapasitas, dan checklist sebelum ujian — ada di **[DEPLOY.md](DEPLOY.md)**.

## Langkah Pertama Setelah Instalasi

1. **Pengaturan** → isi nama aplikasi, nama & alamat sekolah, logo, kop dan penandatangan kartu/rapor.
2. **Pengaturan → Semester** → pastikan semester aktif sudah benar.
3. **Guru & Staf** → buat akun guru dan pengawas (pengawas bisa dibatasi per ruang).
4. **Impor Dapodik** → unggah file unduhan Dapodik (atau **Siswa** → tambah/impor CSV).
5. **Kelas & Mapel** → buat kelas (bisa otomatis dari data siswa), mapel, guru pengampu, dan **wali kelas**.
   **Jadwal Pelajaran** → isi roster per kelas.
6. (Opsional) **Notifikasi WA/Email** → isi token gateway WhatsApp (mis. Fonnte) dan/atau SMTP email, lalu kirim pesan uji.
7. Untuk ujian CAT sekolah: **Kelola Ujian** → buat ujian & pilih kelas peserta → **Bank Soal** (tambah/impor soal) →
   **Peserta Ujian** (atur ruang & sesi) → **Kartu Ujian** (cetak) → aktifkan ujian → pengawas mengisi **Berita Acara**.

Panduan langkah demi langkah untuk tiap peran ada di menu **Panduan** di dalam aplikasi.

Lupa password admin? Jalankan lagi `npm run admin:buat -- admin "PasswordBaru"`.

## Memperbarui Aplikasi

```bash
# 1. backup dulu (lihat bagian Backup)
git pull
npm ci
npm run db:push
node scripts/migrasi-status-ujian.mjs   # aman diulang; perlu sekali saat update dari versi sebelum ujian per kelas
npm run build
# 2. restart aplikasi/layanan
```

Jangan memperbarui saat ujian sedang berlangsung. File `.env`, `prisma/dev.db*`, dan folder `storage/` jangan ditimpa.

> Skema database dikelola dengan `prisma db push`. Folder `prisma/migrations` sudah usang — **jangan** jalankan `prisma migrate deploy`.

## Backup

- **Dari aplikasi:** menu *Backup & Restore* → unduh file JSON (data + foto + lampiran).
- **File database:** SQLite berjalan dalam mode WAL, jadi **jangan menyalin `dev.db` saja**. Gunakan:
  ```bash
  sqlite3 prisma/dev.db ".backup 'backup/cat-2026-11-02.db'"
  ```
  dan salin juga folder `storage/`. Lakukan backup sebelum dan sesudah setiap ujian.

## Pengujian

Tes end-to-end menjalankan server produksi terhadap **salinan** database (data asli tidak disentuh):

```bash
npm run build
npm run test:e2e      # ±869 tes fungsional
npm run test:beban    # + uji beban 150 peserta serentak
```

Rincian tiap suite: [tests/README.md](tests/README.md).

## Struktur Proyek

```
prisma/schema.prisma   skema database
scripts/               buat-admin, migrasi data
src/app/               halaman (admin, kelas = LMS, ujian, dashboard, ...) dan API (src/app/api)
src/components/        komponen UI (AppShell, komponen LMS)
src/lib/               logika bersama: sesi login, sesi ujian, pemilihan soal, rekap nilai, rapor, hak akses
src/proxy.ts           proteksi rute per peran
tests/                 tes E2E & uji beban
DEPLOY.md              panduan server
AGENTS.md              catatan pengembangan rinci per fase
```

## Keterbatasan

- Satu server/instance saja (pembatas login & cache disimpan di memori).
- Bila 150 orang login pada detik yang sama, login butuh ±12 detik (verifikasi password sengaja berat); dalam praktik login tersebar.
- Aturan IP membaca header `X-Forwarded-For` — gunakan reverse proxy agar tidak bisa dipalsukan.
- Layar penuh tidak didukung di iPhone (hanya deteksi pindah tab).
- Penguncian perangkat ala Safe Exam Browser tidak dibangun; gunakan Safe Exam Browser resmi bila diperlukan.
- Notifikasi WhatsApp memerlukan layanan gateway pihak ketiga (umumnya berbayar) dan akses internet dari server.
- File ekspor e-Rapor berupa Excel umum; sesuaikan/salin kolomnya ke template e-Rapor versi sekolah Anda.
