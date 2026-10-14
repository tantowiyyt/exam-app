# Tes End-to-End

Tes menjalankan **server produksi sungguhan** (`next start`) terhadap **salinan** database,
lalu memanggil API seperti browser. Database asli (`prisma/dev.db`) dan folder upload tidak disentuh.

```bash
npm run build        # wajib, tes memakai hasil build terbaru
npm run test:e2e     # semua suite fungsional (±1–2 menit)
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
| `beban` | Login, mulai, simpan, submit serentak (hanya dengan `--beban`) |

Setiap baris hasil diawali `PASS` atau `FAIL`; runner keluar dengan kode 1 bila ada yang gagal.
