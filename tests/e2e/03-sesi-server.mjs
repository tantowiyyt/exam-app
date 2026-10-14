import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DB } } });
// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
const csrf = {};
async function req(who, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (jar[who]) headers.cookie = jar[who];
  if (opts.csrf) headers['x-csrf-token'] = csrf[who];
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
const post = (who, path, body, useCsrf = true) => req(who, path, { method: 'POST', body: J(body), csrf: useCsrf });
async function login(who, np, pw) {
  await post(who, '/api/login', { nomorPeserta: np, password: pw }, false);
  csrf[who] = (await req(who, '/api/csrf')).body.csrfToken;
}
async function pesertaBaru(nama) {
  const np = `T3-${nama}-${Date.now()}`;
  await post('admin', '/api/admin/peserta', { nomorPeserta: np, nama, password: 'rahasia123', ruang: 'R1', sesi: '1' }, false);
  await login(nama, np, 'rahasia123');
  return (await db.user.findUnique({ where: { nomorPeserta: np } })).id;
}

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

// ====== Ujian normal (tanpa bagian berwaktu), 30 menit
const mk = (i) => ({ pertanyaan: `S${i}`, opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', jawabanBenar: 'A', mataPelajaran: 'TIK' });
let r = await post('admin', '/api/admin/ujian', { nama: 'T3 Normal', durasiMenit: 30 }, false);
const u1 = r.body.data.id;
await post('admin', '/api/admin/soal', { bulk: [1, 2, 3, 4].map(mk), ujianId: u1 }, false);
await req('admin', '/api/admin/ujian', { method: 'PUT', body: J({ id: u1, isActive: true }) });

const a = await pesertaBaru('ani');
r = await req('ani', '/api/ujian');
ok(r.body.status === 'ok' && r.body.sesi, 'GET membuat sesi di server');
const ids = r.body.groups.flatMap((g) => g.soal.map((s) => s.id));
const tenggat1 = r.body.sesi.tenggat;
ok(Math.abs(tenggat1 - (r.body.sesi.serverNow + 30 * 60000)) < 5000, 'tenggat = mulai + 30 menit (dari server)');

r = await post('ani', '/api/ujian/jawaban', { jawaban: { [ids[0]]: 'A', [ids[1]]: 'B', 999999: 'A' }, ragu: [ids[1]] });
ok(r.status === 200 && r.body.tersimpan === 2, `simpan otomatis 2 jawaban, soal asing diabaikan (${J(r.body)})`);
r = await req('ani', '/api/ujian');
ok(r.body.sesi.jawaban[ids[0]] === 'A' && r.body.sesi.jawaban[ids[1]] === 'B' && r.body.sesi.ragu.includes(ids[1]), 'jawaban & ragu dipulihkan setelah muat ulang (pindah perangkat)');
ok(r.body.sesi.tenggat === tenggat1, 'muat ulang tidak me-reset timer');

// Pengawas: tambah waktu, monitoring
r = await post('admin', '/api/admin/sesi', { userId: a, action: 'tambahWaktu', menit: 10 }, false);
ok(r.status === 200, 'pengawas menambah waktu 10 menit');
r = await req('ani', '/api/ujian');
ok(r.body.sesi.tenggat === tenggat1 + 10 * 60000, 'tenggat bertambah 10 menit');
r = await req('admin', '/api/admin/monitoring');
const ma = r.body.peserta.find((p) => p.id === a);
ok(ma?.sedangUjian && ma.jawabanTerjawab === 2 && ma.tambahanMenit === 10 && ma.tenggat === tenggat1 + 600000, `monitoring dari sesi server (${J(ma && { s: ma.sedangUjian, t: ma.jawabanTerjawab, m: ma.tambahanMenit })})`);

// Waktu habis saat browser tertutup -> dinilai otomatis dari jawaban tersimpan
await db.sesiUjian.updateMany({ where: { userId: a, selesai: false }, data: { waktuMulai: new Date(Date.now() - 2 * 3600000) } });
r = await req('ani', '/api/ujian');
ok(r.body.status === 'selesai_otomatis' && r.body.hasil.jumlahBenar === 1 && r.body.hasil.totalSoal === 4, `waktu habis -> dinilai otomatis (${J(r.body.hasil)})`);

// Klien tidak bisa memperpanjang waktu lewat waktuMulai palsu
const b = await pesertaBaru('budi');
r = await req('budi', '/api/ujian');
const idsB = r.body.groups.flatMap((g) => g.soal.map((s) => s.id));
await db.sesiUjian.updateMany({ where: { userId: b, selesai: false }, data: { waktuMulai: new Date(Date.now() - 2 * 3600000) } });
r = await post('budi', '/api/ujian/jawaban', { jawaban: { [idsB[0]]: 'A' } });
ok(r.status === 409 && r.body.habis, 'simpan setelah waktu habis ditolak');
r = await post('budi', '/api/ujian/submit', { jawabanPeserta: Object.fromEntries(idsB.map((i) => [i, 'A'])), waktuMulai: Date.now() });
ok(r.status === 200 && r.body.jumlahBenar === 0, `submit terlambat dgn waktuMulai palsu: jawaban baru diabaikan (benar=${r.body.jumlahBenar})`);

// Paksa kumpulkan & reset sesi
const c = await pesertaBaru('citra');
r = await req('citra', '/api/ujian');
const idsC = r.body.groups.flatMap((g) => g.soal.map((s) => s.id));
await post('citra', '/api/ujian/jawaban', { jawaban: { [idsC[0]]: 'A', [idsC[1]]: 'A' } });
r = await post('admin', '/api/admin/sesi', { userId: c, action: 'paksaKumpul' }, false);
ok(r.status === 200 && r.body.message.includes('nilai 50'), `paksa kumpulkan menilai jawaban tersimpan (${r.body.message})`);
r = await req('citra', '/api/ujian');
ok(r.status === 409, 'peserta yang dikumpulkan paksa tidak bisa lanjut');

const d = await pesertaBaru('dodi');
await req('dodi', '/api/ujian');
const idsD = (await req('dodi', '/api/ujian')).body.groups.flatMap((g) => g.soal.map((s) => s.id));
await post('dodi', '/api/ujian/jawaban', { jawaban: { [idsD[0]]: 'A' } });
r = await post('admin', '/api/admin/sesi', { userId: d, action: 'reset' }, false);
ok(r.status === 200, 'reset sesi');
r = await req('dodi', '/api/ujian');
ok(r.body.status === 'ok' && Object.keys(r.body.sesi.jawaban).length === 0, 'setelah reset, sesi baru kosong');

// Jadwal belum mulai -> soal tidak dikirim
await req('admin', '/api/admin/ujian', { method: 'PUT', body: J({ id: u1, jadwalMulai: new Date(Date.now() + 3600000).toISOString(), jadwalSelesai: new Date(Date.now() + 7200000).toISOString() }) });
await pesertaBaru('eka');
r = await req('eka', '/api/ujian');
ok(r.body.status === 'belum' && !r.body.groups, 'sebelum jadwal: status belum, soal tidak dikirim');

// ====== Ujian berbagian berwaktu: 2 bagian @10 menit
r = await post('admin', '/api/admin/ujian', { nama: 'T3 Bagian', durasiMenit: 60 }, false);
const u2 = r.body.data.id;
const b1 = (await post('admin', '/api/admin/bagian', { ujianId: u2, nama: 'Bagian A', urutan: 1, durasiMenit: 10 }, false)).body.data.id;
const b2 = (await post('admin', '/api/admin/bagian', { ujianId: u2, nama: 'Bagian B', urutan: 2, durasiMenit: 10 }, false)).body.data.id;
await post('admin', '/api/admin/soal', { bulk: [1, 2].map(mk), ujianId: u2, bagianId: b1 }, false);
await post('admin', '/api/admin/soal', { bulk: [3, 4].map(mk), ujianId: u2, bagianId: b2 }, false);
await req('admin', '/api/admin/ujian', { method: 'PUT', body: J({ id: u2, isActive: true }) });

const f = await pesertaBaru('fani');
r = await req('fani', '/api/ujian');
ok(r.body.sesi.berbagian && r.body.sesi.tahap === 0, 'mode bagian berwaktu aktif, mulai di bagian 1');
ok(r.body.groups[0].soal.length === 2 && r.body.groups[1].terkunci && r.body.groups[1].soal.length === 0, 'bagian 2 terkunci & isi soalnya tidak dikirim');
ok(Math.abs(r.body.sesi.tenggat - (r.body.sesi.serverNow + 10 * 60000)) < 5000, 'tenggat = durasi bagian (10 menit)');
const idsA = r.body.groups[0].soal.map((s) => s.id);
const idsBagB = (await db.soal.findMany({ where: { bagianId: b2 } })).map((s) => s.id);
r = await post('fani', '/api/ujian/jawaban', { jawaban: { [idsA[0]]: 'A', [idsBagB[0]]: 'A' } });
ok(r.body.tersimpan === 1, 'jawaban untuk bagian yang belum dibuka ditolak');
r = await post('fani', '/api/ujian/lanjut', { dariTahap: 0, jawaban: { [idsA[0]]: 'A', [idsA[1]]: 'A' } });
ok(r.status === 200 && r.body.tahap === 1, 'lanjut ke bagian 2 (jawaban terakhir bagian 1 ikut tersimpan)');
r = await post('fani', '/api/ujian/lanjut', { dariTahap: 0 });
ok(r.body.tahap === 1, 'klik ganda "lanjut" tidak melompati bagian');
r = await req('fani', '/api/ujian');
ok(r.body.sesi.tahap === 1 && r.body.groups[0].selesai && r.body.groups[0].soal.length === 0 && r.body.groups[1].soal.length === 2, 'bagian 1 tertutup, bagian 2 terbuka');
r = await post('fani', '/api/ujian/jawaban', { jawaban: { [idsA[0]]: 'B' } });
const sesiF = await db.sesiUjian.findFirst({ where: { userId: f, selesai: false } });
ok(JSON.parse(sesiF.jawaban)[idsA[0]] === 'A', 'jawaban bagian yang sudah ditutup tidak bisa diubah');

// Bagian kedaluwarsa otomatis berpindah
const g = await pesertaBaru('gita');
await req('gita', '/api/ujian');
await db.sesiUjian.updateMany({ where: { userId: g, selesai: false }, data: { tahapMulai: new Date(Date.now() - 11 * 60000) } });
r = await req('gita', '/api/ujian');
ok(r.body.sesi.tahap === 1 && Math.abs(r.body.sesi.tenggat - (Date.now() + 9 * 60000)) < 10000, 'bagian 1 habis -> otomatis pindah ke bagian 2, waktunya dihitung sejak bagian 1 berakhir');
r = await post('gita', '/api/ujian/submit', { jawabanPeserta: {} });
ok(r.status === 200 && r.body.skorPerBagian && 'Bagian A' in r.body.skorPerBagian, 'submit mode berbagian + skor per bagian');

// ====== Ganti password
await login('h', (await db.user.findUnique({ where: { id: f } })).nomorPeserta, 'rahasia123');
const npF = (await db.user.findUnique({ where: { id: f } })).nomorPeserta;
r = await post('h', '/api/me/password', { passwordLama: 'salah', passwordBaru: 'baru12345' }, false);
ok(r.status === 400, 'ganti password dengan password lama salah ditolak');
r = await post('h', '/api/me/password', { passwordLama: 'rahasia123', passwordBaru: 'baru12345' }, false);
ok(r.status === 200, 'ganti password berhasil');
r = await post('x', '/api/login', { nomorPeserta: npF, password: 'baru12345' }, false);
ok(r.status === 200, 'login dengan password baru');

// ====== Backup memuat sesi & foto
r = await req('admin', '/api/admin/backup');
ok(Array.isArray(r.body.data.sesiUjian) && r.body.data.sesiUjian.length > 0 && typeof r.body.fotos === 'object', 'backup memuat sesiUjian & foto');
const rr = await post('admin', '/api/admin/backup', { data: r.body.data, fotos: r.body.fotos, replaceAll: true }, false);
ok(rr.status === 200 && rr.body.counts.sesiUjian === r.body.data.sesiUjian.length, 'restore memuat sesiUjian');

await db.$disconnect();
