# Panduan Instalasi Server — CAT System

Panduan memasang aplikasi di satu server (PC/server lab) yang diakses peserta lewat jaringan lokal.

## 1. Kebutuhan

- Node.js **20 atau lebih baru** (diuji dengan v24)
- Windows 10/11, Windows Server, atau Linux; RAM ≥ 2 GB
- Satu alamat IP tetap di jaringan lab (mis. `192.168.1.10`)

## 2. Instalasi pertama

```bash
# di folder aplikasi (tanpa node_modules/ dan .next/ dari komputer lain)
npm ci

# konfigurasi
cp .env.example .env            # Windows: copy .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   -> tempel hasilnya ke SESSION_SECRET di .env

npm run db:push                 # membuat/menyesuaikan tabel database
npm run admin:buat -- admin "PasswordAdminYangKuat" "Administrator"
npm run build
npm start -- -p 3000            # atau: set PORT=3000 lalu npm start
```

> Skema dikelola dengan `prisma db push`. Folder `prisma/migrations` sudah usang — **jangan** pakai `prisma migrate deploy`.

## 3. Akses dari komputer peserta

Peserta membuka `http://192.168.1.10:3000`.

- **Tanpa HTTPS (paling umum di lab):** pastikan `.env` berisi `COOKIE_SECURE=false`.
  Tanpa ini semua orang gagal login diam-diam, karena browser menolak cookie *Secure* di HTTP.
- **Buka port di firewall Windows** (PowerShell sebagai Administrator):
  ```powershell
  New-NetFirewallRule -DisplayName "CAT System" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
  ```
- **Dengan HTTPS (disarankan bila ada domain/sertifikat):** pasang reverse proxy seperti
  [Caddy](https://caddyserver.com) di depan aplikasi, lalu set `COOKIE_SECURE=true`:
  ```
  cat.sekolah.sch.id {
      reverse_proxy localhost:3000
  }
  ```

### Catatan alamat IP

Aturan IP (whitelist/blacklist), pembatas login, dan log aktivitas membaca IP dari header
`X-Forwarded-For`. Bila aplikasi diakses **langsung tanpa reverse proxy**, header ini bisa dipalsukan klien,
jadi fitur aturan IP tidak bisa diandalkan. Dengan reverse proxy (Caddy/Nginx) header ditulis ulang oleh proxy.

## 4. Menjalankan sebagai layanan (otomatis hidup saat server menyala)

Jalankan **satu instance saja** — pembatas login dan cache disimpan di memori proses,
jangan pakai mode cluster / banyak instance.

**Windows** — dengan [NSSM](https://nssm.cc):
```powershell
nssm install CATSystem "C:\Program Files\nodejs\node.exe" "D:\cat\node_modules\next\dist\bin\next start -p 3000"
nssm set CATSystem AppDirectory D:\cat
nssm set CATSystem AppEnvironmentExtra NODE_ENV=production
nssm start CATSystem
```

**Linux** — `/etc/systemd/system/cat.service`:
```ini
[Unit]
Description=CAT System
After=network.target

[Service]
WorkingDirectory=/opt/cat
ExecStart=/usr/bin/npm start -- -p 3000
Environment=NODE_ENV=production
Restart=always
User=cat

[Install]
WantedBy=multi-user.target
```

## 5. Backup

Database memakai SQLite mode **WAL** (otomatis aktif). Saat aplikasi berjalan, data terbaru bisa
masih ada di `dev.db-wal`, jadi **jangan menyalin `dev.db` saja**.

- **Lewat aplikasi:** menu *Backup & Restore* → unduh file JSON (berisi semua data + foto + lampiran LMS `storage/lms`).
  Lampiran bisa membuat file backup besar (maks 10 MB per file); untuk server besar tetap salin folder `storage/` terpisah.
- **File database (terjadwal):** gunakan perintah `.backup` sqlite3, aman walau aplikasi berjalan:
  ```bash
  sqlite3 prisma/dev.db ".backup 'D:/cat-backup/cat-2026-11-02.db'"
  ```
  Salin juga folder foto (`STORAGE_DIR`, default `storage/`). Jadwalkan lewat Task Scheduler / cron,
  dan **selalu backup sesaat sebelum dan sesudah ujian**.

## 6. Memperbarui aplikasi

1. Backup (lihat di atas).
2. Ganti file aplikasi (jangan timpa `.env`, `prisma/dev.db*`, dan folder `storage/`).
3. `npm ci && npm run db:push && npm run build`
   Bila memperbarui dari versi sebelum *ujian CAT per kelas* (Phase 19), jalankan sekali setelah `db:push`:
   `node scripts/migrasi-status-ujian.mjs` (aman diulang).
4. Restart layanan. Jangan update saat ada ujian berlangsung.

## 7. Lupa password admin

```bash
npm run admin:buat -- admin "PasswordBaru123"
```
Perintah yang sama membuat admin baru bila username belum ada.

## 8. Kapasitas (hasil `npm run test:beban`)

150 peserta melakukan aksi pada detik yang sama, di satu PC Windows, 0 request gagal:

| Aksi serentak | Median | Terlama |
|---|---|---|
| Mulai ujian | ±0,7 dtk | ±1,4 dtk |
| Simpan jawaban | ±0,5 dtk | ±1,2 dtk |
| Submit | ±0,9 dtk | ±1,4 dtk |
| Login | ±12 dtk | ±13 dtk |

Login lambat bila **semua** peserta menekan tombol login pada detik yang sama (verifikasi password
sengaja berat). Dalam praktik login tersebar beberapa menit, jadi tidak bermasalah; bila perlu,
persilakan peserta login per ruang/baris.

## 9. Checklist sebelum ujian pertama

- [ ] `SESSION_SECRET` diisi string acak; `COOKIE_SECURE` sesuai (HTTP lab → `false`)
- [ ] Password admin diganti dan **tidak** tertulis di dokumen mana pun
- [ ] Akun pengawas dibuat per ruang (*Kelola Akun*)
- [ ] Peserta diimpor (ruang, sesi, kelas); akun uji coba dihapus
- [ ] Ujian dibuat & diaktifkan, jadwal dan durasi benar, jumlah soal sesuai
- [ ] Kop kartu diisi, kartu dicetak dan dibagikan
- [ ] `npm run test:e2e` lulus pada build yang akan dipakai
- [ ] **Simulasi dengan 5–10 peserta di lab:** login, mengerjakan, refresh di tengah ujian,
      pindah komputer, waktu habis, pengawas menambah waktu & mengumpulkan
- [ ] Backup database tepat sebelum ujian dimulai
