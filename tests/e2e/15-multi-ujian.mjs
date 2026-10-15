import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DB } } });
// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Ujian CAT sekolah per kelas: beberapa ujian aktif bersamaan untuk kelas berbeda, status "sudah" per ujian,
// halaman Peserta Ujian (ruang/sesi per kelas, reset per ujian).
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
const csrf = {};
async function req(who, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
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
const put = (who, path, body) => req(who, path, { method: 'PUT', body: J(body) });
async function login(who, np, pw) {
  await post(who, '/api/login', { nomorPeserta: np, password: pw }, false);
  csrf[who] = (await req(who, '/api/csrf')).body.csrfToken;
}
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);
const aktifSemula = (await req('admin', '/api/admin/ujian')).body.filter((u) => u.isActive).map((u) => u.id);

// ---------- Kelas & siswa ----------
const KA = `MU-A-${t}`;
const KB = `MU-B-${t}`;
const siswa = {};
for (const [nama, kelas] of [['ani', KA], ['cici', KA], ['budi', KB]]) {
  const np = `MU-${nama}-${t}`;
  siswa[nama] = (await post('admin', '/api/admin/peserta', { nomorPeserta: np, nama, password: 'rahasia123', ruang: 'R0', sesi: '1', kelas }, false)).body.data.id;
  await login(nama, np, 'rahasia123');
}
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' }, false);

// ---------- Dua ujian aktif bersamaan untuk kelas berbeda ----------
const mk = (i, mapel) => ({ pertanyaan: `MU ${mapel} ${i} ${t}`, opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', jawabanBenar: 'A', mataPelajaran: mapel });
let r = await post('admin', '/api/admin/ujian', { nama: `MU Ujian A ${t}`, durasiMenit: 30, kelasTarget: [KA], jenis: 'UTS' }, false);
ok(r.status === 200 && r.body.data.kelasTarget === `,${KA},` && r.body.data.jenis === 'UTS' && r.body.data.semesterId, 'ujian dibuat dengan kelas peserta, jenis, & semester aktif');
const uA = r.body.data.id;
r = await post('admin', '/api/admin/ujian', { nama: `MU Ujian B ${t}`, durasiMenit: 30, kelasTarget: [KB] }, false);
const uB = r.body.data.id;
ok((await post('admin', '/api/admin/ujian', { nama: 'x', kelasTarget: ['kelas-tidak-ada'] }, false)).status === 400, 'kelas peserta yang tidak dikenal ditolak');
ok((await post('admin', '/api/admin/ujian', { nama: 'x', jenis: 'ABC' }, false)).status === 400, 'jenis ujian tidak dikenal ditolak');
await post('admin', '/api/admin/soal', { bulk: [1, 2].map((i) => mk(i, 'TIK')), ujianId: uA }, false);
await post('admin', '/api/admin/soal', { bulk: [1, 2, 3].map((i) => mk(i, 'Matematika')), ujianId: uB }, false);

r = await put('admin', '/api/admin/ujian', { id: uA, isActive: true });
ok(r.status === 200, 'ujian A diaktifkan');
r = await put('admin', '/api/admin/ujian', { id: uB, isActive: true });
ok(r.status === 200 && r.body.dinonaktifkan.length === 0, 'ujian B diaktifkan tanpa menonaktifkan ujian A (kelas tidak beririsan)');
r = await req('admin', '/api/admin/ujian');
const ringkas = (id) => r.body.find((u) => u.id === id);
ok(ringkas(uA).isActive && ringkas(uB).isActive, 'ujian A & B aktif bersamaan');
ok(ringkas(uA).jumlahPeserta === 2 && ringkas(uA).labelPeserta === KA && ringkas(uB).jumlahPeserta === 1, 'jumlah & label peserta per ujian');

r = await req('ani', '/api/ujian');
const soalAni = r.body.groups?.flatMap((g) => g.soal.map((s) => s.id)) ?? [];
ok(r.body.status === 'ok' && soalAni.length === 2, 'siswa kelas A mendapat soal ujian A');
r = await req('budi', '/api/ujian');
ok(r.body.status === 'ok' && r.body.groups.flatMap((g) => g.soal).length === 3, 'siswa kelas B mendapat soal ujian B');

// ---------- Status "sudah" per ujian ----------
r = await post('ani', '/api/ujian/submit', { jawabanPeserta: { [soalAni[0]]: 'A', [soalAni[1]]: 'B' } });
ok(r.status === 200 && r.body.jumlahBenar === 1, 'siswa A mengumpulkan ujian A');
ok((await post('ani', '/api/ujian/submit', { jawabanPeserta: {} })).status === 409, 'kumpul ulang ditolak');
ok((await req('ani', '/api/ujian')).status === 409, 'ujian A tidak bisa dibuka lagi setelah selesai');
ok((await req('ani', '/api/me')).body.sudahUjian === true && (await req('budi', '/api/me')).body.sudahUjian === false, 'status sudah ujian per siswa per ujian');
r = await req('ani', '/api/ujian/history');
ok(r.body.sudahUjian === true && r.body.histori?.nilaiAkhir === 50, 'riwayat menampilkan nilai ujian A');
r = await req('ani', '/api/ujian/review');
ok(r.status === 200 && JSON.stringify(r.body).includes(`MU TIK 1 ${t}`), 'review jawaban ujian A');
ok((await req('budi', '/api/ujian/review')).status === 400, 'siswa B belum bisa review');
r = await req('budi', '/api/lms/kelas');
ok(r.body.ujianCat?.nama === `MU Ujian B ${t}` && r.body.ujianCat.sudahUjian === false, 'beranda siswa B menampilkan ujian B');
const sesiB = r.body;

// Pengawas/monitoring hanya melihat peserta ujian yang berlaku
r = await req('admin', `/api/admin/peserta-ujian?ujian=${uA}`);
ok(r.status === 200 && r.body.ujian.id === uA && r.body.daftarUjian.some((u) => u.id === uB), 'peserta ujian: daftar ujian & ujian terpilih');
const st = (nama) => r.body.siswa.find((s) => s.id === siswa[nama]);
ok(r.body.siswa.length === 2 && !st('budi'), 'peserta ujian A hanya siswa kelas A');
ok(st('ani')?.status === 'selesai' && st('ani').nilai === 50 && st('cici')?.status === 'belum' && st('cici').nilai === null, 'status & nilai per siswa');
ok(r.body.kelasList.length === 1 && r.body.kelasList[0] === KA, 'daftar kelas peserta');
r = await req('admin', `/api/admin/peserta-ujian?ujian=${uB}`);
ok(r.body.siswa.length === 1 && r.body.siswa[0].status === 'mengerjakan', 'siswa B tercatat sedang mengerjakan ujian B');
ok((await req('budi', `/api/admin/peserta-ujian?ujian=${uA}`)).status === 403, 'siswa tidak bisa membuka peserta ujian');

// ---------- Ruang & sesi per kelas / per siswa ----------
r = await post('admin', '/api/admin/peserta-ujian', { aksi: 'aturRuang', ujian: uA, kelas: KA, ruang: 'LAB MU', sesi: '2' }, false);
ok(r.status === 200 && r.body.jumlah === 2, 'atur ruang & sesi satu kelas');
r = await post('admin', '/api/admin/peserta-ujian', { aksi: 'aturRuang', ujian: uA, ids: [siswa.budi], ruang: 'LAB SALAH' }, false);
ok(r.status === 200 && r.body.jumlah === 0, 'siswa di luar peserta ujian tidak ikut diubah');
r = await post('admin', '/api/admin/peserta-ujian', { aksi: 'aturRuang', ujian: uA, ids: [siswa.cici], sesi: '3' }, false);
ok(r.body.jumlah === 1, 'atur sesi satu siswa');
const u = await db.user.findMany({ where: { id: { in: Object.values(siswa) } } });
const by = (nama) => u.find((x) => x.id === siswa[nama]);
ok(by('ani').ruang === 'LAB MU' && by('ani').sesi === '2' && by('cici').sesi === '3' && by('budi').ruang === 'R0', 'ruang/sesi tersimpan sesuai');
ok((await post('admin', '/api/admin/peserta-ujian', { aksi: 'aturRuang', ujian: uA, kelas: KA }, false)).status === 400, 'atur ruang tanpa isian ditolak');
ok((await post('admin', '/api/admin/peserta-ujian', { aksi: 'reset', ujian: uA }, false)).status === 400, 'reset tanpa siswa ditolak');

// ---------- Reset per ujian ----------
r = await post('admin', '/api/admin/peserta-ujian', { aksi: 'reset', ujian: uA, ids: [siswa.ani] }, false);
ok(r.status === 200 && r.body.jumlah === 1, 'admin mereset ujian A untuk satu siswa');
r = await req('ani', '/api/ujian');
ok(r.status === 200 && r.body.status === 'ok', 'siswa bisa mengerjakan ujian A lagi setelah reset');
ok((await db.historiUjian.count({ where: { userId: siswa.ani, ujianId: uA } })) === 1, 'riwayat nilai lama tetap tersimpan');
ok((await db.sesiUjian.count({ where: { userId: siswa.budi, ujianId: uB } })) === 1, 'sesi ujian B siswa lain tidak tersentuh');
r = await post('admin', '/api/admin/peserta-ujian', { aksi: 'resetSemua', ujian: uB }, false);
ok(r.status === 200 && r.body.jumlah === 1 && (await db.sesiUjian.count({ where: { ujianId: uB } })) === 0, 'reset semua peserta satu ujian');

// ---------- Ujian yang pesertanya beririsan ----------
r = await post('admin', '/api/admin/ujian', { nama: `MU Ujian AB ${t}`, durasiMenit: 30, kelasTarget: [KA, KB] }, false);
const uAB = r.body.data.id;
await post('admin', '/api/admin/soal', { bulk: [1].map((i) => mk(i, 'IPA')), ujianId: uAB }, false);
r = await put('admin', '/api/admin/ujian', { id: uAB, isActive: true });
ok(r.status === 200 && r.body.dinonaktifkan.length === 2, 'mengaktifkan ujian beririsan menonaktifkan ujian A & B');
r = await req('admin', '/api/admin/ujian');
ok(ringkas(uAB).isActive && !ringkas(uA).isActive && !ringkas(uB).isActive, 'hanya ujian gabungan yang aktif');
r = await req('budi', '/api/ujian');
ok(r.status === 200 && r.body.status === 'ok', 'siswa kelas B kini mengerjakan ujian gabungan');
ok((await req('admin', '/api/admin/analisis-soal')).status === 200, 'analisis soal tetap jalan');
ok(sesiB && (await req('admin', '/api/admin/stats')).status === 200, 'statistik dasbor tetap jalan');

// Bersihkan: nonaktifkan ujian tes, aktifkan kembali ujian semula
await put('admin', '/api/admin/ujian', { id: uAB, isActive: false });
for (const id of aktifSemula) await put('admin', '/api/admin/ujian', { id, isActive: true });
await db.$disconnect();
