import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DB } } });
// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Phase 23: notifikasi WhatsApp terjadwal (tugas baru, tenggat, pengumuman, ujian), berita acara & daftar hadir ujian CAT,
// impor siswa dari Dapodik, ekspor nilai e-Rapor.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const DIR = dirname(fileURLToPath(import.meta.url));
const jar = {};
async function req(who, path, opts = {}) {
  const headers = opts.form ? {} : { 'Content-Type': 'application/json' };
  if (jar[who]) headers.cookie = jar[who];
  const res = await fetch(BASE + path, { method: opts.method, body: opts.form ?? opts.body, headers, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    jar[who] = [...(jar[who] || '').split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString()); } catch { body = buf; }
  return { status: res.status, body, headers: res.headers };
}
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
const J = (o) => JSON.stringify(o);
const post = (who, path, body) => req(who, path, { method: 'POST', body: J(body) });
const put = (who, path, body) => req(who, path, { method: 'PUT', body: J(body) });
const login = async (who, u, p) => { delete jar[who]; return post(who, '/api/login', { nomorPeserta: u, password: p }); };
const unggah = (who, path, name, bytes, extra = {}) => {
  const fd = new FormData();
  fd.append('file', new Blob([bytes]), name);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return req(who, path, { method: 'POST', form: fd });
};
const t = Date.now();
const jam = (h) => new Date(Date.now() + h * 3600000).toISOString();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);
const aktifSemula = (await req('admin', '/api/admin/ujian')).body.filter((u) => u.isActive).map((u) => u.id);

// ---------- Data ----------
const g = (await post('admin', '/api/admin/akun', { username: `ng-${t}`, nama: `Guru N ${t}`, password: 'guru12345', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `nl-${t}`, nama: `Guru L ${t}`, password: 'guru12345', role: 'GURU' });
const K = `NT-${t}`;
const hp = (n) => `0819${String(t).slice(-6)}${n}`;
const wa = (n) => `62${hp(n).slice(1)}`;
const sis = {};
for (const [n, i] of [['dian', 1], ['eko', 2], ['fina', 3]]) {
  sis[n] = (await post('admin', '/api/admin/peserta', { nomorPeserta: `nt-${n}-${t}`, nama: n, password: 'siswa123', kelas: K, noHp: hp(i), ruang: `BA-R-${t}`, sesi: '1' })).body.data.id;
}
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === K);
await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelas.id, nama: K, keterangan: '', waliId: g });
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.id, nama: 'Geografi', guruId: g })).body.data.id;
await login('g', `ng-${t}`, 'guru12345');
await login('gl', `nl-${t}`, 'guru12345');
for (const n of Object.keys(sis)) await login(n, `nt-${n}-${t}`, 'siswa123');

// ---------- Notifikasi WhatsApp terjadwal (gateway tiruan) ----------
const pesan = [];
const gateway = createServer((rq, rs) => { let s = ''; rq.on('data', (d) => (s += d)).on('end', () => { pesan.push(JSON.parse(s || '{}')); rs.end('{"status":true}'); }); });
await new Promise((res) => gateway.listen(0, '127.0.0.1', res));
const ke = (n) => pesan.filter((p) => p.target === wa(n));
await put('admin', '/api/admin/notifikasi', { waAktif: 'aktif', waPenyedia: 'lain', waUrl: `http://127.0.0.1:${gateway.address().port}/kirim`, waToken: 'tok', kirimTugas: 'aktif', pengingatTenggat: 'aktif', kirimPengumuman: 'aktif', kirimUjian: 'aktif' });
// eko mematikan pengingat di Data Diri
await put('eko', '/api/me', { nik: '1234567890123456', tempatLahir: 'X', tanggalLahir: '2010-01-01', jenisKelamin: 'L', alamat: 'Y', noHp: hp(2), notifWa: false });
const tg = (await post('g', '/api/lms/tugas', { mapelId: mapel, judul: `Peta Indonesia ${t}`, nilaiMaks: 100, tenggat: jam(10) })).body.data.id;
await post('fina', '/api/lms/pengumpulan', { tugasId: tg, jawaban: 'sudah' });
await post('g', '/api/lms/pengumuman', { mapelId: mapel, judul: `Bawa atlas ${t}`, isi: 'Besok bawa atlas.' });
await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: `UH Geografi ${t}`, jenis: 'UH', mode: 'offline', nilaiMaks: 100, tanggal: jam(20) });
await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: `UTS jauh ${t}`, jenis: 'UTS', mode: 'offline', nilaiMaks: 100, tanggal: jam(72) });
ok((await post('g', '/api/admin/notifikasi', { aksi: 'jalankan' })).status === 403, 'guru tidak bisa memicu pengiriman');
let r = await post('admin', '/api/admin/notifikasi', { aksi: 'jalankan' });
ok(r.status === 200 && r.body.dikirim >= 4, `pengingat dijalankan (${r.body.dikirim} pesan)`);
const judulDian = ke(1).map((p) => p.message.split('\n')[0]);
ok(judulDian.some((j) => j.includes(`Tugas baru: Peta Indonesia ${t}`)), 'siswa menerima notifikasi tugas baru');
ok(judulDian.some((j) => j.includes(`Pengingat tenggat: Peta Indonesia ${t}`)), 'siswa yang belum mengumpulkan menerima pengingat tenggat');
ok(judulDian.some((j) => j.includes(`Bawa atlas ${t}`)), 'siswa menerima pengumuman');
ok(judulDian.some((j) => j.includes(`Jadwal ujian: UH Geografi ${t}`)) && !judulDian.some((j) => j.includes(`UTS jauh ${t}`)), 'jadwal ujian dalam 24 jam dikirim, yang lebih jauh belum');
ok(!ke(3).some((p) => p.message.includes('Pengingat tenggat')) && ke(3).some((p) => p.message.includes('Tugas baru')), 'siswa yang sudah mengumpulkan tidak diingatkan tenggat');
ok(ke(2).length === 0, 'siswa yang mematikan pengingat tidak menerima pesan');
const jumlahDian = ke(1).length;
await post('admin', '/api/admin/notifikasi', { aksi: 'jalankan' });
ok(ke(1).length === jumlahDian, 'dijalankan ulang: tidak ada pesan ganda');
await put('admin', '/api/admin/notifikasi', { kirimTugas: 'nonaktif' });
await post('g', '/api/lms/tugas', { mapelId: mapel, judul: `Tanpa notif ${t}`, nilaiMaks: 100 });
await post('admin', '/api/admin/notifikasi', { aksi: 'jalankan' });
ok(!ke(1).some((p) => p.message.includes(`Tanpa notif ${t}`)), 'jenis notifikasi yang dimatikan tidak dikirim');
r = await req('admin', '/api/admin/notifikasi');
ok(r.body.log.some((l) => l.tujuan === wa(1) && l.status === 'terkirim'), 'pengiriman tercatat di log');
await put('admin', '/api/admin/notifikasi', { waAktif: 'nonaktif', kirimTugas: 'aktif' });
gateway.close();

// ---------- Berita acara & daftar hadir ----------
const RU = `BA-R-${t}`;
await post('admin', '/api/admin/akun', { username: `pw-${t}`, nama: `Pengawas ${t}`, password: 'awas12345', role: 'PENGAWAS', ruang: RU });
await post('admin', '/api/admin/akun', { username: `pl-${t}`, nama: `Pengawas Lain ${t}`, password: 'awas12345', role: 'PENGAWAS', ruang: `LAIN-${t}` });
await login('pw', `pw-${t}`, 'awas12345');
await login('pl', `pl-${t}`, 'awas12345');
r = await post('admin', '/api/admin/ujian', { nama: `PAS ${t}`, durasiMenit: 60, kelasTarget: [K] });
const uj = r.body.data.id;
await post('admin', '/api/admin/soal', { bulk: [{ pertanyaan: `BA ${t}`, opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', jawabanBenar: 'A', mataPelajaran: 'Geografi' }], ujianId: uj });
await put('admin', '/api/admin/ujian', { id: uj, isActive: true });
await req('dian', '/api/ujian');
await req('eko', '/api/ujian');
r = await req('pw', `/api/admin/berita-acara?ujian=${uj}`);
ok(r.status === 200 && r.body.ruang === RU && r.body.peserta.length === 3, 'pengawas membuka daftar hadir ruangnya');
ok(r.body.peserta.filter((p) => p.hadir).length === 2 && !r.body.peserta.find((p) => p.id === sis.fina).hadir, 'kehadiran otomatis dari sesi ujian');
ok((await req('pl', `/api/admin/berita-acara?ujian=${uj}&ruang=${RU}&sesi=1`)).status === 403, 'pengawas ruang lain tidak bisa membuka ruang ini');
ok((await req('dian', `/api/admin/berita-acara?ujian=${uj}`)).status === 403, 'siswa tidak bisa membuka berita acara');
ok((await put('pw', '/api/admin/berita-acara', { ujian: uj, ruang: RU, sesi: '1', mulai: jam(1), selesai: jam(0) })).status === 400, 'waktu selesai sebelum mulai ditolak');
ok((await put('pl', '/api/admin/berita-acara', { ujian: uj, ruang: RU, sesi: '1' })).status === 403, 'pengawas ruang lain tidak bisa mengisi');
r = await put('pw', '/api/admin/berita-acara', { ujian: uj, ruang: RU, sesi: '1', mulai: jam(-1), selesai: jam(0), catatan: 'Listrik padam 5 menit', tidakHadir: [{ userId: sis.fina, keterangan: 'Sakit' }] });
ok(r.status === 200, 'pengawas menyimpan berita acara');
r = await req('admin', `/api/admin/berita-acara?ujian=${uj}&ruang=${RU}&sesi=1`);
ok(r.body.beritaAcara?.catatan === 'Listrik padam 5 menit' && r.body.beritaAcara.namaPengawas === `Pengawas ${t}` && r.body.peserta.find((p) => p.id === sis.fina).keterangan === 'Sakit', 'admin melihat berita acara & keterangan tidak hadir');
ok((await req('pw', '/admin/berita-acara')).status === 200, 'pengawas bisa membuka halaman berita acara');
await put('admin', '/api/admin/ujian', { id: uj, isActive: false });
for (const id of aktifSemula) await put('admin', '/api/admin/ujian', { id, isActive: true });

// ---------- Impor Dapodik ----------
const fixture = readFileSync(join(DIR, '..', 'fixtures', 'dapodik-contoh.xlsx'));
ok((await unggah('g', '/api/admin/dapodik', 'd.xlsx', fixture)).status === 403, 'guru tidak bisa impor Dapodik');
ok((await unggah('admin', '/api/admin/dapodik', 'rusak.xlsx', Buffer.from('PKbukan zip'))).status === 400, 'file rusak ditolak');
ok((await unggah('admin', '/api/admin/dapodik', 'salah.csv', Buffer.from('a,b\n1,2'))).status === 400, 'file tanpa kolom Nama & NISN ditolak');
r = await unggah('admin', '/api/admin/dapodik', 'dapodik.xlsx', fixture, { mode: 'pratinjau' });
ok(r.status === 200 && r.body.jumlah === 3 && r.body.baru === 3 && r.body.contoh.length === 3, 'pratinjau membaca 3 siswa (baris judul & baris kosong dilewati)');
ok(['nama', 'nis', 'nisn', 'jk', 'tanggalLahir', 'kelas'].every((k) => r.body.dikenali.includes(k)), 'kolom Dapodik dikenali');
ok(r.body.contoh.find((c) => c.nama === 'CANDRA WIJAYA')?.nis === '0081234563', 'NIPD kosong: NIS memakai NISN');
ok(r.body.kelas.length === 2 && r.body.kelas.every((k) => !k.ada), 'rombel baru terdeteksi');
ok((await db.user.count({ where: { nomorPeserta: 'DPK001' } })) === 0, 'pratinjau tidak menyimpan apa pun');
r = await unggah('admin', '/api/admin/dapodik', 'dapodik.xlsx', fixture, { mode: 'impor', password: 'nisn', buatKelas: '1' });
ok(r.status === 200 && r.body.dibuat === 3 && r.body.kelasDibuat === 2, 'impor membuat 3 siswa & 2 kelas');
const adi = await db.user.findUnique({ where: { nomorPeserta: 'DPK001' } });
ok(adi?.nama === 'ADI PRATAMA' && adi.nisn === '0081234561' && adi.jenisKelamin === 'L' && adi.kelas === 'DPK X-1' && adi.nik === '3273011403090001' && adi.email === 'adi@contoh.id', 'data siswa dari Dapodik tersimpan');
ok(adi?.tanggalLahir?.toISOString().startsWith('2009-03-14'), 'tanggal lahir terbaca');
ok((await login('adi', 'DPK001', '0081234561')).status === 200, 'siswa login dengan password awal = NISN');
await put('admin', '/api/admin/peserta', { id: adi.id, nomorPeserta: 'DPK001', nama: 'ADI PRATAMA', kelas: 'DPK X-1', password: 'gantibaru1' });
r = await unggah('admin', '/api/admin/dapodik', 'dapodik.xlsx', fixture, { mode: 'impor', password: 'nisn' });
ok(r.body.dibuat === 0 && r.body.diperbarui === 3, 'impor ulang memperbarui data, tidak membuat ganda');
ok((await login('adi', 'DPK001', 'gantibaru1')).status === 200, 'impor ulang tidak mengubah password');
const csv = 'Nama;NIPD;NISN;JK;Tanggal Lahir;Rombel Saat Ini\nDEWI LESTARI;DPK004;0081234564;P;21/07/2009;DPK X-2\n';
r = await unggah('admin', '/api/admin/dapodik', 'dapodik.csv', Buffer.from(csv), { mode: 'impor', password: 'tanggal' });
ok(r.status === 200 && r.body.dibuat === 1, 'impor CSV (pemisah titik koma)');
ok((await login('dewi', 'DPK004', '21072009')).status === 200, 'password awal = tanggal lahir ddmmyyyy');

// ---------- Ekspor e-Rapor ----------
r = await req('g', `/api/lms/rapor/ekspor?kelas=${kelas.id}`);
ok(r.status === 200 && r.headers.get('content-type').includes('spreadsheetml') && r.body.subarray(0, 2).toString() === 'PK', 'guru wali mengekspor nilai e-Rapor (.xlsx)');
ok(/nilai-erapor-NT-/.test(r.headers.get('content-disposition') ?? '') && r.body.includes(Buffer.from('xl/worksheets/sheet3.xml')), 'file berisi lembar rekap, mapel, kehadiran');
ok((await req('gl', `/api/lms/rapor/ekspor?kelas=${kelas.id}`)).status === 404, 'guru yang tidak mengajar kelas itu tidak bisa mengekspor');
ok((await req('dian', `/api/lms/rapor/ekspor?kelas=${kelas.id}`)).status === 403, 'siswa tidak bisa mengekspor');
for (const [who, path] of [['admin', '/admin/dapodik'], ['admin', '/admin/notifikasi'], ['admin', '/admin/berita-acara']]) ok((await req(who, path)).status === 200, `halaman ${path} terbuka`);
r = await req('admin', '/api/admin/backup');
ok(r.body.data?.beritaAcara?.some((b) => b.ujianId === uj), 'backup memuat berita acara');
await db.$disconnect();
