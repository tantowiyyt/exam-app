# Tes End-to-End

Tes menjalankan **server produksi sungguhan** (`next start`) terhadap **salinan** database,
lalu memanggil API seperti browser. Database asli (`prisma/dev.db`) dan folder upload tidak disentuh.

```bash
npm run build        # wajib, tes memakai hasil build terbaru
npm run test:e2e     # semua suite fungsional (±1–2 menit)
node tests/run.mjs --hanya 16,17   # hanya suite tertentu
npm run test:beban   # + uji beban 150 peserta serentak
node tests/run.mjs --beban 300   # jumlah peserta lain
```

Runner (`tests/run.mjs`) otomatis:
1. menyalin `prisma/dev.db` ke folder sementara (`SOURCE_DB` untuk sumber lain),
2. membuat admin khusus tes dengan password acak di salinan itu,
3. menjalankan server di port `3457` (`TEST_PORT` untuk port lain),
4. menjalankan setiap `tests/e2e/NN-*.mjs`, lalu menghapus folder sementara.

| Suite | Isi |
|---|---|
| `01-alur-ujian` | Ujian, bagian, pool soal, penilaian, audit log, proteksi halaman |
| `02-perbaikan-bug` | Password tidak bocor, CSRF, upload, restore backup, monitoring |
| `03-sesi-server` | Timer server, simpan otomatis, waktu habis, bagian berwaktu, aksi pengawas, ganti password |
| `04-role` | Akses ADMIN / PENGAWAS / PESERTA, kelola akun |
| `05-data-diri` | Data diri & foto peserta oleh admin |
| `06-lms` | LMS: role GURU, kelas & mapel, materi, tugas & nilai, upload & akses lampiran, rekap nilai, agenda tugas, tugas per siswa, banyak lampiran, revisi, tolak terlambat, ZIP, salin tugas, notifikasi, diskusi, ujian per kelas, backup |
| `07-kuis` | Kuis per mapel: soal PG/BS/isian/esai, akses, percobaan & batas waktu server, nilai otomatis & esai, nilai ulang, rekap, notifikasi, backup |
| `08-presensi` | Presensi: pertemuan, presensi mandiri dengan kode, batas percobaan kode, isian guru H/I/S/A, rekap, akses, backup |
| `09-topik-jadwal` | Topik (buat, urut, pindah, hapus), terbit terjadwal materi & tugas, progres siswa, backup |
| `10-kalender-nilai` | Kalender (rentang, isi per peran), rubrik tugas, bobot nilai akhir & KKM |
| `11-ujian-manual` | Ujian offline / nilai manual: isi nilai, umumkan, rekap, kalender, notifikasi, akses, backup |
| `14-bank-soal-virtual` | Bank soal guru: simpan, bagikan, ubah/hapus hanya pemilik, label & cari, backup, hapus akun; tautan kelas virtual per pertemuan |
| `13-rapor` | Rapor lintas mapel: akses admin/guru/wali/siswa, nilai akhir & KKM, nilai belum diumumkan, kehadiran, peringkat, predikat & batasnya, deskripsi capaian, catatan wali kelas, semester |
| `12-ujian-cat-semester` | Semester aktif & filter per semester; ujian mapel UH/UTS/UAS mode CAT: token, 1 kesempatan, pelanggaran, monitoring (tambah waktu, kumpulkan, reset, token), nilai diumumkan, bobot per jenis ujian |
| `15-multi-ujian` | Ujian CAT sekolah per kelas: beberapa ujian aktif bersamaan (kelas tidak beririsan), status sudah per ujian, riwayat & review, Peserta Ujian (ruang/sesi per kelas/siswa, reset per ujian), ujian beririsan menonaktifkan yang lain |
| `16-akun-media-arsip` | Kehadiran siswa lintas mapel, wali kelas, lupa password (wali & kode WhatsApp via gateway tiruan), notifikasi admin, email data diri, media soal (gambar/audio, Range), arsip anggota kelas per semester setelah kenaikan kelas, panduan, backup |
| `17-jadwal-jurnal` | Jadwal pelajaran (bentrok kelas/guru, per kelas/guru/siswa, jadwal hari ini di beranda), jurnal mengajar (tautan presensi otomatis, siswa tidak hadir, akses, supervisi admin, filter) |
| `18-remedial-rapor` | Remedial/susulan/pengayaan tugas, ujian offline & CAT (akses siswa yang dituju, aturan nilai maksKkm/maks), data rapor lengkap (wali kelas, validasi, tampil di rapor siswa), rapor memakai nilai remedial |
| `19-berita-dapodik-notif` | Notifikasi WhatsApp terjadwal via gateway tiruan (tugas baru, tenggat, pengumuman, ujian, anti-ganda, opt-out), berita acara & daftar hadir (akses pengawas per ruang), impor Dapodik (xlsx & CSV, pratinjau, impor ulang), ekspor e-Rapor |
| `20-ortu-pesan` | Akun orang tua (buat/massal/ubah/hapus), portal & rapor anak (akses hanya anak sendiri, nilai belum diumumkan tersembunyi), routing role, pesan pribadi (aturan kontak per role, dibaca, balasan, backup) |
| `beban` | Login, mulai, simpan, submit serentak (hanya dengan `--beban`) |

Setiap baris hasil diawali `PASS` atau `FAIL`; runner keluar dengan kode 1 bila ada yang gagal.
