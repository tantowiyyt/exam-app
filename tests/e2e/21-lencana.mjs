import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DB } } });
// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Phase 26: lencana otomatis (kehadiran, tepat waktu, membaca, nilai sempurna, diskusi, tuntas) & lencana dari guru.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
async function req(who, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar[who]) headers.cookie = jar[who];
  const res = await fetch(BASE + path, { method: opts.method, body: opts.body, headers, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    jar[who] = [...(jar[who] || '').split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
const J = (o) => JSON.stringify(o);
const post = (who, path, body) => req(who, path, { method: 'POST', body: J(body) });
const put = (who, path, body) => req(who, path, { method: 'PUT', body: J(body) });
const del = (who, path) => req(who, path, { method: 'DELETE' });
const login = async (who, u, p) => { delete jar[who]; return post(who, '/api/login', { nomorPeserta: u, password: p }); };
const t = Date.now();
const jam = (h) => new Date(Date.now() + h * 3600000).toISOString();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);
const g = (await post('admin', '/api/admin/akun', { username: `lcg-${t}`, nama: `Guru L ${t}`, password: 'guru12345', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `lcl-${t}`, nama: `Guru Lain ${t}`, password: 'guru12345', role: 'GURU' });
const K = `LC-${t}`;
const sis = {};
for (const n of ['rina', 'sandi']) sis[n] = (await post('admin', '/api/admin/peserta', { nomorPeserta: `lc-${n}-${t}`, nama: n, password: 'siswa123', kelas: K })).body.data.id;
const luar = (await post('admin', '/api/admin/peserta', { nomorPeserta: `lc-luar-${t}`, nama: 'luar', password: 'siswa123', kelas: `LC2-${t}` })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === K);
const mapels = [];
for (const n of ['Seni', 'Musik', 'Tari']) mapels.push((await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.id, nama: n, guruId: g })).body.data.id);
const m = mapels[0];
await login('g', `lcg-${t}`, 'guru12345');
await login('gl', `lcl-${t}`, 'guru12345');
await login('rina', `lc-rina-${t}`, 'siswa123');
await login('sandi', `lc-sandi-${t}`, 'siswa123');

// ---------- Data belajar rina ----------
for (const id of mapels) await put('g', `/api/lms/mapel/${id}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, bobotUH: 0, bobotUTS: 0, bobotUAS: 0, kkm: 70 });
// 8 pertemuan, rina hadir semua, sandi alpa 2x
for (let i = 0; i < 8; i++) {
  const s = (await post('g', '/api/lms/presensi', { mapelId: m, judul: `P${i}`, tanggal: jam(-30 - i) })).body.data.id;
  await put('g', '/api/lms/presensi', { aksi: 'isi', id: s, data: [{ userId: sis.rina, status: 'H' }, { userId: sis.sandi, status: i < 2 ? 'A' : 'H' }] });
}
// 5 tugas: rina kumpul semua tepat waktu, nilai salah satu 100 (sempurna) & tuntas di 3 mapel
for (let i = 0; i < 5; i++) {
  const mid = mapels[i % 3];
  const tg = (await post('g', '/api/lms/tugas', { mapelId: mid, judul: `T${i}`, nilaiMaks: 100, tenggat: jam(48) })).body.data.id;
  const k = (await post('rina', '/api/lms/pengumpulan', { tugasId: tg, jawaban: 'ok' })).body.data.id;
  await put('g', '/api/lms/pengumpulan', { id: k, nilai: i === 0 ? 100 : 85 });
}
// 5 materi, rina membaca semua
for (let i = 0; i < 5; i++) {
  const mt = (await post('g', '/api/lms/materi', { mapelId: m, judul: `Materi ${i}`, isi: 'isi', terbit: true })).body.data.id;
  await req('rina', `/api/lms/materi/${mt}`);
}
// 10 komentar
const peng = (await post('g', '/api/lms/pengumuman', { mapelId: m, judul: 'Diskusi', isi: 'Silakan berdiskusi' })).body.data.id;
for (let i = 0; i < 10; i++) await post('rina', '/api/lms/komentar', { pengumumanId: peng, isi: `pendapat ${i}` });

// ---------- Lencana otomatis ----------
let r = await req('rina', '/api/lms/lencana');
ok(r.status === 200 && r.body.peran === 'siswa' && r.body.otomatis.length === 7, 'siswa melihat 7 jenis lencana otomatis');
const dapat = (b) => Object.fromEntries(b.otomatis.map((l) => [l.kode, l.dapat]));
const L = dapat(r.body);
ok(L.hadir && L.tepat && L.baca && L.sempurna && L.diskusi && L.tuntas, 'rina mendapat: rajin hadir, tepat waktu, pembaca setia, nilai sempurna, aktif diskusi, tuntas semua');
ok(!L.kuis && r.body.otomatis.find((l) => l.kode === 'kuis').progres.startsWith('0 kuis'), 'lencana yang belum didapat menampilkan progres');
r = await req('sandi', '/api/lms/lencana');
const S = dapat(r.body);
ok(!S.hadir && !S.tepat && !S.baca && !S.sempurna, 'sandi belum mendapat lencana (alpa 2x, tidak mengumpulkan)');
ok(r.body.otomatis.find((l) => l.kode === 'hadir').progres === '75% dari 8 pertemuan', 'progres kehadiran sandi');

// ---------- Lencana dari guru ----------
ok((await post('g', '/api/lms/lencana', { mapelId: m, jenis: 'hebat', siswa: [sis.rina] })).status === 400, 'jenis lencana tidak dikenal ditolak');
ok((await post('g', '/api/lms/lencana', { mapelId: m, jenis: 'kreatif', siswa: [luar] })).status === 400, 'siswa di luar kelas ditolak');
ok((await post('gl', '/api/lms/lencana', { mapelId: m, jenis: 'kreatif', siswa: [sis.rina] })).status === 404, 'guru lain tidak bisa memberi lencana di mapel ini');
ok((await post('rina', '/api/lms/lencana', { mapelId: m, jenis: 'kreatif', siswa: [sis.rina] })).status === 403, 'siswa tidak bisa memberi lencana');
r = await post('g', '/api/lms/lencana', { mapelId: m, jenis: 'kreatif', siswa: [sis.rina, sis.sandi], catatan: 'Karya poster terbaik' });
ok(r.status === 200, 'guru memberi lencana Kreatif ke 2 siswa');
await post('g', '/api/lms/lencana', { mapelId: m, jenis: 'lain', judul: 'Pelukis Cilik', siswa: [sis.rina] });
r = await req('rina', '/api/lms/lencana');
ok(r.body.dariGuru.length === 2 && r.body.dariGuru.some((l) => l.judul === 'Pelukis Cilik' && l.ikon === '⭐') && r.body.dariGuru.some((l) => l.judul === 'Kreatif' && l.catatan === 'Karya poster terbaik' && l.mapel === 'Seni'), 'siswa melihat penghargaan dari guru (judul bawaan & khusus)');
r = await req('rina', '/api/lms/notifikasi');
ok(r.body.items?.some((n) => n.jenis === 'lencana' && n.judul.includes('Pelukis Cilik') && n.href === '/kelas/lencana'), 'siswa mendapat notifikasi lencana');
r = await req('g', `/api/lms/lencana?mapelId=${m}`);
const rinaG = r.body.siswa?.find((s) => s.id === sis.rina);
ok(r.status === 200 && r.body.peran === 'kelola' && rinaG?.dariGuru.length === 2 && rinaG.otomatis.some((l) => l.kode === 'hadir'), 'guru melihat lencana siswa (otomatis & dari guru) per mapel');
ok(!rinaG.otomatis.some((l) => l.kode === 'tuntas'), 'tampilan guru memakai lencana otomatis versi ringan');
r = await req('g', '/api/lms/lencana');
ok(r.body.mapelList?.length === 3, 'guru mendapat daftar mapelnya');
const idLencana = rinaG.dariGuru.find((l) => l.judul === 'Pelukis Cilik').id;
ok((await del('gl', `/api/lms/lencana?id=${idLencana}`)).status === 404, 'guru lain tidak bisa mencabut lencana');
ok((await del('g', `/api/lms/lencana?id=${idLencana}`)).status === 200, 'pemberi mencabut lencana');
ok((await req('rina', '/api/lms/lencana')).body.dariGuru.length === 1, 'lencana tercabut');

// ---------- Orang tua ----------
await post('admin', '/api/admin/orangtua', { aksi: 'buat', username: `lco-${t}`, nama: 'Ortu Rina', password: 'ortu12345', anak: [`lc-rina-${t}`] });
await login('o', `lco-${t}`, 'ortu12345');
r = await req('o', `/api/lms/lencana?anak=${sis.rina}`);
ok(r.status === 200 && r.body.dariGuru.length === 1 && dapat(r.body).hadir, 'orang tua melihat lencana anaknya');
ok((await req('o', `/api/lms/lencana?anak=${sis.sandi}`)).status === 404, 'orang tua tidak bisa melihat lencana anak lain');
for (const [who, path] of [['rina', '/kelas/lencana'], ['g', '/kelas/lencana'], ['o', '/ortu/lencana']]) ok((await req(who, path)).status === 200, `halaman ${path} terbuka (${who})`);
r = await req('admin', '/api/admin/backup');
ok(r.body.data?.lencanaSiswa?.some((l) => l.userId === sis.rina), 'backup memuat lencana');
await db.$disconnect();
