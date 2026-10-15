import { createServer } from 'http';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DB } } });
// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Phase 20: rekap kehadiran siswa, lupa password (wali kelas & kode WhatsApp), media soal (gambar/audio),
// arsip anggota kelas per semester, panduan, backup.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
async function req(who, path, opts = {}) {
  const headers = opts.form ? {} : { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (jar[who]) headers.cookie = jar[who];
  const res = await fetch(BASE + path, { method: opts.method, body: opts.form ?? opts.body, headers, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    jar[who] = [...(jar[who] || '').split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString()); } catch { body = buf; }
  return { status: res.status, body, type, headers: res.headers };
}
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
const J = (o) => JSON.stringify(o);
const post = (who, path, body) => req(who, path, { method: 'POST', body: J(body) });
const put = (who, path, body) => req(who, path, { method: 'PUT', body: J(body) });
const patch = (who, path, body) => req(who, path, { method: 'PATCH', body: J(body) });
const login = async (who, u, p) => { delete jar[who]; return post(who, '/api/login', { nomorPeserta: u, password: p }); };
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

// ---------- Data awal: guru wali, guru lain, kelas, mapel, siswa ----------
const guru = async (nama) => (await post('admin', '/api/admin/akun', { username: `${nama}-${t}`, nama: `${nama} ${t}`, password: 'guru12345', role: 'GURU' })).body.data.id;
const gWali = await guru('wali');
const gLain = await guru('lain');
const K = `AR-${t}`;
const K2 = `AR2-${t}`;
const siswa = {};
for (const [nama, kelas] of [['sari', K], ['tono', K], ['uli', K2]]) {
  siswa[nama] = (await post('admin', '/api/admin/peserta', { nomorPeserta: `ar-${nama}-${t}`, nama, password: 'siswa123', kelas })).body.data.id;
}
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelasList = (await req('admin', '/api/admin/kelas')).body.kelas;
const kelas = kelasList.find((k) => k.nama === K);
let r = await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelas.id, nama: K, keterangan: '', waliId: 999999999 });
ok(r.status === 400, 'wali kelas harus akun guru');
r = await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelas.id, nama: K, keterangan: '', waliId: gWali });
ok(r.status === 200 && r.body.data.waliId === gWali, 'admin menetapkan wali kelas');
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.id, nama: 'Biologi', guruId: gLain })).body.data.id;
const mapel2 = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.id, nama: 'Kimia', guruId: gLain })).body.data.id;
await login('gw', `wali-${t}`, 'guru12345');
await login('gl', `lain-${t}`, 'guru12345');
await login('sari', `ar-sari-${t}`, 'siswa123');
await login('tono', `ar-tono-${t}`, 'siswa123');

// ---------- Kehadiran siswa lintas mapel ----------
const lalu = (jam) => new Date(Date.now() - jam * 3600000).toISOString();
const p1 = (await post('gl', '/api/lms/presensi', { mapelId: mapel, judul: 'P1', tanggal: lalu(5) })).body.data.id;
const p2 = (await post('gl', '/api/lms/presensi', { mapelId: mapel, judul: 'P2', tanggal: lalu(3) })).body.data.id;
const p3 = (await post('gl', '/api/lms/presensi', { mapelId: mapel2, judul: 'K1', tanggal: lalu(2) })).body.data.id;
await post('gl', '/api/lms/presensi', { mapelId: mapel2, judul: 'Besok', tanggal: new Date(Date.now() + 86400000).toISOString() });
await put('gl', '/api/lms/presensi', { aksi: 'isi', id: p1, data: [{ userId: siswa.sari, status: 'H' }, { userId: siswa.tono, status: 'A' }] });
await put('gl', '/api/lms/presensi', { aksi: 'isi', id: p2, data: [{ userId: siswa.sari, status: 'S', keterangan: 'demam' }] });
await put('gl', '/api/lms/presensi', { aksi: 'isi', id: p3, data: [{ userId: siswa.sari, status: 'H' }] });
r = await req('sari', '/api/lms/kehadiran');
ok(r.status === 200 && r.body.kelas === K, 'siswa membuka rekap kehadiran');
ok(r.body.total.pertemuan === 3 && r.body.total.H === 2 && r.body.total.S === 1 && r.body.total.persen === 66.7, 'total kehadiran lintas mapel (pertemuan mendatang tidak dihitung)');
const bio = r.body.perMapel.find((m) => m.id === mapel);
ok(bio.pertemuan === 2 && bio.H === 1 && bio.S === 1 && bio.persen === 50, 'rekap per mapel');
ok(r.body.riwayat.length === 3 && r.body.riwayat.find((x) => x.id === p2).keterangan === 'demam', 'riwayat per pertemuan dengan keterangan');
r = await req('tono', '/api/lms/kehadiran');
ok(r.body.total.A === 1 && r.body.total.belum === 2, 'pertemuan tanpa isian dihitung belum diisi');
ok((await req('gl', '/api/lms/kehadiran')).status === 403, 'halaman kehadiran hanya untuk siswa');

// ---------- Lupa password lewat wali kelas ----------
r = await post('anon', '/api/lupa-password', { aksi: 'minta', nomorPeserta: `tidak-ada-${t}` });
ok(r.status === 200 && r.body.langkah === 'wali', 'akun tidak dikenal dijawab sama seperti jalur wali (tidak membocorkan akun)');
r = await post('anon', '/api/lupa-password', { aksi: 'minta', nomorPeserta: `ar-tono-${t}` });
ok(r.status === 200 && r.body.langkah === 'wali', 'tanpa email/WA: permintaan diteruskan ke wali kelas');
await post('anon', '/api/lupa-password', { aksi: 'minta', nomorPeserta: `ar-tono-${t}` });
ok((await db.permintaanReset.count({ where: { userId: siswa.tono, selesai: false } })) === 1, 'permintaan ganda tidak dibuat dua kali');
r = await req('gw', '/api/lms/reset-password');
ok(r.status === 200 && r.body.kelasWalian.includes(K) && r.body.permintaan.some((p) => p.user.id === siswa.tono), 'wali kelas melihat permintaan siswanya');
ok(r.body.siswa.length === 2, 'wali kelas melihat daftar siswa perwaliannya');
const reqId = r.body.permintaan.find((p) => p.user.id === siswa.tono).id;
r = await req('gl', '/api/lms/reset-password');
ok(r.status === 200 && r.body.permintaan.length === 0 && r.body.kelasWalian.length === 0, 'guru bukan wali tidak melihat permintaan');
ok((await post('gl', '/api/lms/reset-password', { permintaanId: reqId })).status === 404, 'guru bukan wali tidak bisa mereset');
ok((await post('gw', '/api/lms/reset-password', { userId: siswa.uli })).status === 404, 'wali tidak bisa mereset siswa kelas lain');
ok((await req('tono', '/api/lms/reset-password')).status === 403, 'siswa tidak bisa membuka halaman reset');
r = await post('gw', '/api/lms/reset-password', { permintaanId: reqId });
ok(r.status === 200 && /^[a-z2-9]{8}$/.test(r.body.password), 'wali mereset password dan mendapat password sementara');
ok((await login('tono2', `ar-tono-${t}`, r.body.password)).status === 200, 'siswa login dengan password sementara');
ok((await db.permintaanReset.count({ where: { userId: siswa.tono, selesai: false } })) === 0, 'permintaan ditandai selesai');
r = await req('admin', '/api/lms/reset-password');
ok(r.status === 200 && r.body.admin === true, 'admin membuka halaman reset password');

// ---------- Lupa password dengan kode WhatsApp (gateway tiruan) ----------
const pesanWa = [];
const gateway = createServer((rq, rs) => {
  let s = '';
  rq.on('data', (d) => (s += d)).on('end', () => { pesanWa.push({ auth: rq.headers.authorization, body: JSON.parse(s || '{}') }); rs.end('{"status":true}'); });
});
await new Promise((res) => gateway.listen(0, '127.0.0.1', res));
const portWa = gateway.address().port;
ok((await put('admin', '/api/admin/notifikasi', { waPenyedia: 'lain', waUrl: 'ftp://x' })).status === 400, 'URL gateway harus http(s)');
ok((await put('admin', '/api/admin/notifikasi', { waAktif: 'ya' })).status === 400, 'status kanal tidak valid ditolak');
r = await put('admin', '/api/admin/notifikasi', { waAktif: 'aktif', waPenyedia: 'lain', waUrl: `http://127.0.0.1:${portWa}/send`, waToken: 'rahasia-wa' });
ok(r.status === 200 && r.body.pengaturan.waToken === '' && r.body.pengaturan.adaRahasia.waToken === true, 'pengaturan WA disimpan; token tidak dikirim balik');
ok((await req('gw', '/api/admin/notifikasi')).status === 403, 'guru tidak bisa membuka pengaturan notifikasi');
r = await post('admin', '/api/admin/notifikasi', { kanal: 'wa', tujuan: '081234567890' });
ok(r.status === 200 && pesanWa.at(-1)?.body.target === '6281234567890' && pesanWa.at(-1).auth === 'rahasia-wa', 'pesan uji WA terkirim ke gateway dengan nomor 62...');
r = await put('admin', '/api/admin/peserta', { id: siswa.sari, nomorPeserta: `ar-sari-${t}`, nama: 'sari', kelas: K, noHp: '0812-1111-2222', email: 'bukan-email' });
ok(r.status === 400, 'email tidak valid ditolak');
await put('admin', '/api/admin/peserta', { id: siswa.sari, nomorPeserta: `ar-sari-${t}`, nama: 'sari', kelas: K, noHp: '0812-1111-2222' });
const sebelum = pesanWa.length;
r = await post('anon', '/api/lupa-password', { aksi: 'minta', nomorPeserta: `ar-sari-${t}` });
ok(r.status === 200 && r.body.langkah === 'kode' && /62812\*{4}22/.test(r.body.message), 'akun dengan No. HP: kode dikirim lewat WA (nomor disamarkan)');
const kodeMsg = pesanWa.slice(sebelum).find((p) => p.body.target === '6281211112222')?.body.message ?? '';
const kode = /(\d{6})/.exec(kodeMsg)?.[1];
ok(!!kode, 'pesan WA berisi kode 6 angka');
ok((await post('anon', '/api/lupa-password', { aksi: 'kode', nomorPeserta: `ar-sari-${t}`, kode: '000000' === kode ? '111111' : '000000', passwordBaru: 'barusari1' })).status === 400, 'kode salah ditolak');
ok((await post('anon', '/api/lupa-password', { aksi: 'kode', nomorPeserta: `ar-sari-${t}`, kode, passwordBaru: '123' })).status === 400, 'password baru terlalu pendek ditolak');
r = await post('anon', '/api/lupa-password', { aksi: 'kode', nomorPeserta: `ar-sari-${t}`, kode, passwordBaru: 'barusari1' });
ok(r.status === 200, 'password diganti dengan kode');
ok((await post('anon', '/api/lupa-password', { aksi: 'kode', nomorPeserta: `ar-sari-${t}`, kode, passwordBaru: 'lagi12345' })).status === 400, 'kode hanya sekali pakai');
ok((await login('sari', `ar-sari-${t}`, 'barusari1')).status === 200, 'login dengan password baru');
const log = (await req('admin', '/api/admin/notifikasi')).body.log;
ok(log.some((l) => l.kanal === 'wa' && l.status === 'terkirim'), 'kiriman tercatat di log notifikasi');
await put('admin', '/api/admin/notifikasi', { waAktif: 'nonaktif' });
gateway.close();

// ---------- Data diri: email & pilihan notifikasi ----------
r = await req('sari', '/api/me');
ok(r.body.email === '' && r.body.notifWa === true, 'data diri memuat email & pilihan notifikasi');
const diri = { nik: '1234567890123456', tempatLahir: 'Bandung', tanggalLahir: '2010-01-02', jenisKelamin: 'P', alamat: 'Jl. Uji', noHp: '081211112222' };
ok((await put('sari', '/api/me', { ...diri, email: 'salah@' })).status === 400, 'siswa: email tidak valid ditolak');
await put('sari', '/api/me', { ...diri, email: 'sari@contoh.sch.id', notifWa: false });
r = await req('sari', '/api/me');
ok(r.body.email === 'sari@contoh.sch.id' && r.body.notifWa === false, 'siswa menyimpan email & mematikan notifikasi');

// ---------- Media soal (gambar & audio) ----------
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const mp3 = Buffer.concat([Buffer.from('494433', 'hex'), Buffer.alloc(2000, 7)]);
const unggah = (who, name, bytes) => { const fd = new FormData(); fd.append('file', new Blob([bytes]), name); return req(who, '/api/media', { method: 'POST', form: fd }); };
r = await unggah('gl', 'grafik.png', png);
ok(r.status === 200 && r.body.jenis === 'gambar' && /^\[gambar:\/api\/media\/[\w-]+\.png\]$/.test(r.body.sisip), 'guru mengunggah gambar soal');
const urlPng = r.body.url;
r = await unggah('gl', 'listening.mp3', mp3);
ok(r.status === 200 && r.body.jenis === 'audio', 'guru mengunggah audio listening');
const urlMp3 = r.body.url;
ok((await unggah('gl', 'palsu.png', Buffer.from('bukan gambar'))).status === 400, 'isi file tidak sesuai format ditolak');
ok((await unggah('gl', 'skrip.svg', png)).status === 400, 'format selain gambar/audio ditolak');
ok((await unggah('sari', 'a.png', png)).status === 403, 'siswa tidak bisa mengunggah media soal');
r = await req('sari', urlPng);
ok(r.status === 200 && r.type === 'image/png' && r.body.length === png.length, 'siswa membuka gambar soal');
r = await req('sari', urlMp3, { headers: { Range: 'bytes=0-99' } });
ok(r.status === 206 && r.body.length === 100 && r.headers.get('content-range') === `bytes 0-99/${mp3.length}`, 'audio mendukung Range (bisa diputar & digeser)');
ok((await req('anon2', urlPng)).status === 401, 'media butuh login');
ok((await req('sari', '/api/media/..%2F..%2Fpackage.json')).status === 404, 'nama file tidak valid ditolak');
// Soal kuis bergambar & berumus tersimpan apa adanya
const teksSoal = `Perhatikan grafik:\n[gambar:${urlPng}]\nNilai $x^2 + 1$ untuk x = 2?`;
r = await post('gl', '/api/lms/kuis', { mapelId: mapel, judul: `Kuis media ${t}` });
const kuisId = r.body.data?.id;
r = await put('gl', `/api/lms/kuis/${kuisId}/soal`, { soal: [{ tipe: 'pg', pertanyaan: teksSoal, opsi: ['$4$', '$5$'], kunci: 1, bobot: 1 }] });
ok(r.status === 200, 'soal kuis bergambar & berumus disimpan');
r = await req('gl', `/api/lms/kuis/${kuisId}`);
ok(r.body.soal?.[0]?.pertanyaan === teksSoal, 'teks soal (gambar & rumus) tersimpan utuh');

// ---------- Arsip anggota kelas per semester ----------
const semAwal = (await req('admin', '/api/admin/semester')).body.semester.find((s) => s.aktif);
await post('gl', '/api/lms/tugas', { mapelId: mapel, judul: 'Tugas arsip', nilaiMaks: 100 });
r = await req('admin', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.some((b) => b.siswa.id === siswa.sari), 'sebelum kenaikan: siswa ada di rekap kelas');
r = await post('admin', '/api/admin/semester', { tahunAjaran: '2091/2092', semester: 'Ganjil' });
const semBaru = r.body.data.id;
r = await put('admin', '/api/admin/semester', { id: semBaru });
ok(r.status === 200, 'admin mengaktifkan semester baru');
ok((await db.anggotaKelas.count({ where: { semesterId: semAwal.id, userId: { in: [siswa.sari, siswa.tono] }, kelas: K } })) === 2, 'keanggotaan semester lama diarsipkan otomatis');
r = await patch('admin', '/api/admin/peserta', { action: 'pindahKelas', ids: [siswa.sari, siswa.tono], kelas: K2 });
ok(r.status === 200 && r.body.jumlah === 2, 'kenaikan kelas massal');
r = await req('admin', `/api/lms/mapel/${mapel}/nilai?semester=${semAwal.id}`);
ok(r.body.baris.some((b) => b.siswa.id === siswa.sari) && r.body.baris.some((b) => b.siswa.id === siswa.tono), 'rekap semester lalu tetap berisi siswa lama');
r = await req('admin', `/api/lms/mapel/${mapel}/nilai`);
ok(!r.body.baris.some((b) => b.siswa.id === siswa.sari), 'semester aktif mengikuti kelas baru');
r = await req('admin', `/api/lms/presensi?mapelId=${mapel}&semester=${semAwal.id}`);
ok(r.body.siswa.some((s) => s.id === siswa.sari) && r.body.rekap.find((x) => x.userId === siswa.sari)?.S === 1, 'rekap presensi semester lalu tetap utuh');
r = await req('sari', `/api/lms/kehadiran?semester=${semAwal.id}`);
ok(r.body.kelas === K && r.body.total.pertemuan === 3, 'siswa melihat kehadiran semester lalu di kelas lamanya');
r = await req('sari', `/api/lms/rapor?semester=${semAwal.id}`);
ok(r.status === 200 && r.body.kelas?.nama === K, 'rapor semester lalu memakai kelas lama');
r = await req('gw', `/api/lms/rapor?kelas=${kelas.id}&semester=${semAwal.id}`);
ok(r.status === 200 && r.body.rapor?.length === 2 && r.body.kelas.wali === `wali ${t}`, 'wali kelas membuka rapor semester lalu (nama wali dari akun)');
r = await put('gw', '/api/lms/rapor', { siswa: siswa.sari, semester: semAwal.id, catatan: 'Pertahankan prestasi' });
ok(r.status === 200, 'wali menulis catatan rapor semester lalu setelah siswa naik kelas');
// Ganti nama kelas ikut mengganti arsip
await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelas.id, nama: `${K}-X`, keterangan: '', waliId: gWali });
ok((await db.anggotaKelas.count({ where: { semesterId: semAwal.id, kelas: `${K}-X` } })) >= 2, 'ganti nama kelas ikut mengganti arsip anggota');
r = await req('admin', `/api/lms/mapel/${mapel}/nilai?semester=${semAwal.id}`);
ok(r.body.baris.some((b) => b.siswa.id === siswa.sari), 'rekap semester lalu tetap utuh setelah ganti nama kelas');
await put('admin', '/api/admin/semester', { id: semAwal.id });

// ---------- Panduan & halaman baru ----------
for (const [who, path] of [['sari', '/akun/panduan'], ['gl', '/akun/panduan'], ['sari', '/kelas/kehadiran'], ['gw', '/kelas/reset-password'], ['anon', '/lupa-password']]) {
  r = await req(who, path);
  ok(r.status === 200, `halaman ${path} terbuka (${who})`);
}

// ---------- Backup memuat tabel & media baru ----------
r = await req('admin', '/api/admin/backup');
ok(r.body.data?.anggotaKelas?.length > 0 && Array.isArray(r.body.data.dataRapor) && Object.keys(r.body.mediaSoal ?? {}).some((n) => urlPng.endsWith(n)), 'backup memuat arsip anggota, data rapor, dan media soal');

// ---------- Hapus akun membersihkan data baru ----------
await req('admin', `/api/admin/akun?id=${gWali}`, { method: 'DELETE' });
ok((await db.kelas.findUnique({ where: { id: kelas.id } })).waliId === null, 'hapus akun wali mengosongkan wali kelas');
await db.$disconnect();
