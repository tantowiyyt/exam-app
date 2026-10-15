import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DB } } });
// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Phase 25: akun orang tua (portal pantau anak, rapor anak, kelola admin) & pesan pribadi (aturan kontak, dibaca, balasan).
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
  return { status: res.status, body, loc: res.headers.get('location') };
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

// ---------- Data ----------
const akun = async (u, role, extra = {}) => (await post('admin', '/api/admin/akun', { username: `${u}-${t}`, nama: `${u} ${t}`, password: 'rahasia123', role, ...extra })).body.data.id;
const gA = await akun('opa', 'GURU');
const gB = await akun('opb', 'GURU');
const gW = await akun('opw', 'GURU');
await akun('opp', 'PENGAWAS');
const K = `OP-${t}`;
const K2 = `OP2-${t}`;
const sis = {};
for (const [n, k] of [['s1', K], ['s2', K], ['s3', K2]]) sis[n] = (await post('admin', '/api/admin/peserta', { nomorPeserta: `op-${n}-${t}`, nama: `Siswa ${n}`, password: 'siswa123', kelas: k, tanggalLahir: '2010-02-03' })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kls = (await req('admin', '/api/admin/kelas')).body.kelas;
const kelas = kls.find((k) => k.nama === K);
await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelas.id, nama: K, keterangan: '', waliId: gW });
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.id, nama: 'Biologi', guruId: gA })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kls.find((k) => k.nama === K2).id, nama: 'Biologi', guruId: gB });
for (const [w, u] of [['ga', 'opa'], ['gb', 'opb'], ['gw', 'opw'], ['pw', 'opp']]) await login(w, `${u}-${t}`, 'rahasia123');
for (const n of Object.keys(sis)) await login(n, `op-${n}-${t}`, 'siswa123');

// ---------- Admin: akun orang tua ----------
ok((await post('admin', '/api/admin/orangtua', { aksi: 'buat', username: `ortu1-${t}`, nama: 'Ibu Satu', password: 'ortu1234', anak: ['tidak-ada'] })).status === 400, 'NIS anak yang tidak dikenal ditolak');
ok((await post('admin', '/api/admin/orangtua', { aksi: 'buat', username: `ortu1-${t}`, nama: 'Ibu Satu', password: '123', anak: [`op-s1-${t}`] })).status === 400, 'password terlalu pendek ditolak');
let r = await post('admin', '/api/admin/orangtua', { aksi: 'buat', username: `ortu1-${t}`, nama: 'Ibu Satu', password: 'ortu1234', anak: [`op-s1-${t}`] });
ok(r.status === 200, 'admin membuat akun orang tua untuk siswa 1');
const ortu1 = r.body.data.id;
ok((await post('admin', '/api/admin/orangtua', { aksi: 'buat', username: `ortu1-${t}`, nama: 'x', password: 'ortu1234', anak: [`op-s1-${t}`] })).status === 400, 'username ganda ditolak');
ok((await req('ga', '/api/admin/orangtua')).status === 403 && (await post('ga', '/api/admin/orangtua', { aksi: 'massal', kelas: K })).status === 403, 'guru tidak bisa mengelola akun orang tua');
r = await post('admin', '/api/admin/orangtua', { aksi: 'massal', kelas: K, password: 'nis' });
ok(r.status === 200 && r.body.dibuat.length === 1 && r.body.dibuat[0].username === `ortu-op-s2-${t}`, 'buat massal hanya untuk siswa yang belum punya akun orang tua');
r = await req('admin', `/api/admin/orangtua?q=OP-${t}`);
ok(r.body.orangTua.length === 2 && r.body.orangTua.every((o) => o.anak.length === 1), 'daftar orang tua beserta anaknya (cari per kelas)');
ok(r.body.kelas.find((k) => k.nama === K)?.tanpaOrtu === 0, 'jumlah siswa tanpa akun orang tua per kelas');
await login('o1', `ortu1-${t}`, 'ortu1234');
ok((await login('o2', `ortu-op-s2-${t}`, `op-s2-${t}`)).body.role === 'ORANGTUA', 'akun massal login dengan password awal = NIS');

// ---------- Routing & akses ----------
ok((await req('o1', '/ortu')).status === 200, 'orang tua membuka portal /ortu');
r = await req('o1', '/kelas');
ok([302, 303, 307, 308].includes(r.status) && r.loc?.includes('/ortu'), 'orang tua diarahkan dari /kelas ke /ortu');
ok([302, 303, 307, 308].includes((await req('o1', '/admin/peserta')).status), 'orang tua tidak bisa membuka halaman admin');
ok((await req('o1', '/api/lms/kelas')).status === 403, 'API LMS siswa/guru menolak orang tua');
ok((await req('s1', '/api/ortu')).status === 403, 'siswa tidak bisa membuka API portal orang tua');

// ---------- Portal: data anak ----------
const tLewat = (await post('ga', '/api/lms/tugas', { mapelId: mapel, judul: `Lewat ${t}`, nilaiMaks: 100, tenggat: jam(1) })).body.data.id;
await post('ga', '/api/lms/tugas', { mapelId: mapel, judul: `Berjalan ${t}`, nilaiMaks: 100, tenggat: jam(48) });
const tNilai = (await post('ga', '/api/lms/tugas', { mapelId: mapel, judul: `Dinilai ${t}`, nilaiMaks: 100 })).body.data.id;
const kumpul = (await post('s1', '/api/lms/pengumpulan', { tugasId: tNilai, jawaban: 'ok' })).body.data.id;
await put('ga', '/api/lms/pengumpulan', { id: kumpul, nilai: 88 });
await put('ga', '/api/lms/tugas', { id: tLewat, judul: `Lewat ${t}`, nilaiMaks: 100, tenggat: jam(-1) });
const sesi = (await post('ga', '/api/lms/presensi', { mapelId: mapel, judul: 'P1', tanggal: jam(-2) })).body.data.id;
await put('ga', '/api/lms/presensi', { aksi: 'isi', id: sesi, data: [{ userId: sis.s1, status: 'S', keterangan: 'demam' }] });
const ujian = (await post('ga', '/api/lms/ujian-manual', { mapelId: mapel, judul: `UTS ${t}`, jenis: 'UTS', mode: 'offline', nilaiMaks: 100, tanggal: jam(24) })).body.data.id;
await put('ga', '/api/lms/ujian-manual', { id: ujian, aksi: 'nilai', data: [{ userId: sis.s1, nilai: 40 }] });
r = await req('o1', '/api/ortu');
ok(r.status === 200 && r.body.anak.length === 1 && r.body.anak[0].siswa.id === sis.s1, 'orang tua hanya melihat anaknya');
ok(r.body.anak[0].tugasTerlambat === 1 && r.body.anak[0].tugasMendatang === 1 && r.body.anak[0].kehadiran.S === 1, 'ringkasan: tugas terlambat, tugas berjalan, kehadiran');
r = await req('o1', `/api/ortu?anak=${sis.s1}`);
ok(r.status === 200 && r.body.wali?.id === gW && r.body.nilai[0]?.guru?.id === gA, 'rincian anak memuat wali kelas & guru mapel');
const status = Object.fromEntries(r.body.tugas.map((x) => [x.judul, x.status]));
ok(status[`Lewat ${t}`] === 'terlambat' && status[`Berjalan ${t}`] === 'belum' && status[`Dinilai ${t}`] === 'dinilai', 'status tugas anak');
ok(r.body.nilai[0].nilaiAkhir !== null && r.body.nilai[0].komponen.uts === null, 'nilai ujian yang belum diumumkan tidak terlihat orang tua');
ok(r.body.kehadiran.riwayat.some((x) => x.status === 'S' && x.keterangan === 'demam') && r.body.ujian.some((u) => u.judul === `UTS ${t}`), 'kehadiran & ujian mendatang');
ok((await req('o1', `/api/ortu?anak=${sis.s2}`)).status === 404, 'orang tua tidak bisa melihat anak orang lain');
r = await req('o1', `/api/lms/rapor?anak=${sis.s1}`);
ok(r.status === 200 && r.body.peran === 'siswa' && r.body.kelas?.nama === K && r.body.rapor?.[0]?.siswa.id === sis.s1, 'orang tua membuka rapor anaknya');
ok((await req('o1', `/api/lms/rapor?anak=${sis.s3}`)).status === 404, 'orang tua tidak bisa membuka rapor siswa lain');
ok((await req('o1', '/ortu/rapor')).status === 200, 'halaman rapor anak terbuka');

// ---------- Pesan pribadi ----------
r = await req('o1', '/api/pesan?kontak=1');
const kontakO1 = r.body.kontak.map((k) => k.id);
ok(kontakO1.includes(gA) && kontakO1.includes(gW) && !kontakO1.includes(gB) && !kontakO1.includes(sis.s2), 'kontak orang tua: guru mapel & wali anak (bukan guru lain / siswa)');
ok((await post('o1', '/api/pesan', { ke: gB, isi: 'halo' })).status === 403, 'orang tua tidak bisa mengirim ke guru kelas lain');
ok((await post('o1', '/api/pesan', { ke: gW, isi: '  ' })).status === 400, 'pesan kosong ditolak');
r = await post('o1', '/api/pesan', { ke: gW, isi: 'Selamat pagi Bu, anak saya sakit hari ini.' });
ok(r.status === 200 && r.body.data.saya === true, 'orang tua mengirim pesan ke wali kelas');
ok((await req('gw', '/api/pesan?belum=1')).body.belum === 1, 'wali kelas mendapat 1 pesan belum dibaca');
r = await req('gw', '/api/pesan');
ok(r.body.percakapan[0]?.lawan.id === ortu1 && r.body.percakapan[0].lawan.peran === 'Orang tua' && r.body.percakapan[0].belum === 1, 'daftar percakapan wali kelas');
r = await req('gw', `/api/pesan?dengan=${ortu1}`);
ok(r.status === 200 && r.body.pesan.length === 1 && r.body.bolehBalas === true, 'wali membuka percakapan');
ok((await req('gw', '/api/pesan?belum=1')).body.belum === 0, 'pesan ditandai dibaca setelah dibuka');
await post('gw', '/api/pesan', { ke: ortu1, isi: 'Baik Pak, semoga lekas sembuh.' });
r = await req('o1', `/api/pesan?dengan=${gW}`);
ok(r.body.pesan.length === 2 && r.body.pesan[0].dibaca === true && r.body.pesan[1].saya === false, 'orang tua melihat balasan & status dibaca');
ok((await post('s1', '/api/pesan', { ke: sis.s2, isi: 'hai' })).status === 403, 'siswa tidak bisa mengirim pesan ke siswa lain');
ok((await post('s1', '/api/pesan', { ke: gB, isi: 'hai' })).status === 403, 'siswa tidak bisa mengirim ke guru yang tidak mengajarnya');
ok((await post('s1', '/api/pesan', { ke: gA, isi: 'Pak, tugas dikumpulkan di mana?' })).status === 200, 'siswa mengirim pesan ke guru mapelnya');
ok((await post('gb', '/api/pesan', { ke: sis.s1, isi: 'x' })).status === 403, 'guru tidak bisa mengirim ke siswa kelas yang tidak diajarnya');
ok((await post('ga', '/api/pesan', { ke: ortu1, isi: 'Mohon dampingi belajar di rumah.' })).status === 200, 'guru mengirim pesan ke orang tua siswanya');
ok((await post('ga', '/api/pesan', { ke: gB, isi: 'Rapat jam 2' })).status === 200, 'guru mengirim pesan ke guru lain');
ok((await post('pw', '/api/pesan', { ke: gA, isi: 'x' })).status === 403 && (await post('pw', '/api/pesan', { ke: (await db.user.findUnique({ where: { nomorPeserta: ADMIN_USER } })).id, isi: 'Lapor, ruang aman' })).status === 200, 'pengawas hanya bisa mengirim ke admin');
ok((await post('admin', '/api/pesan', { ke: sis.s3, isi: 'Mohon lengkapi data diri.' })).status === 200, 'admin bisa mengirim ke siapa saja');
// Membalas orang yang pernah mengirim pesan selalu boleh
await db.pesan.create({ data: { dariId: gB, keId: sis.s1, isi: 'Pesan dari guru lain' } });
ok((await post('s1', '/api/pesan', { ke: gB, isi: 'Terima kasih Pak' })).status === 200, 'siswa boleh membalas pesan yang diterimanya');
ok((await req('s2', `/api/pesan?dengan=${gB}`)).status === 404, 'tidak bisa membuka percakapan dengan akun di luar kontak');
for (const who of ['o1', 's1', 'ga', 'pw']) ok((await req(who, '/akun/pesan')).status === 200, `halaman pesan terbuka (${who})`);

// ---------- Ubah, backup, hapus ----------
r = await put('admin', '/api/admin/orangtua', { id: ortu1, anak: [`op-s1-${t}`, `op-s3-${t}`] });
ok(r.status === 200 && (await req('o1', '/api/ortu')).body.anak.length === 2, 'admin menautkan anak kedua');
r = await req('admin', '/api/admin/backup');
ok(r.body.data?.orangTuaSiswa?.some((x) => x.orangTuaId === ortu1) && r.body.data.pesan.length > 0, 'backup memuat tautan orang tua & pesan');
ok((await del('admin', `/api/admin/orangtua?id=${ortu1}`)).status === 200, 'admin menghapus akun orang tua');
ok((await db.orangTuaSiswa.count({ where: { orangTuaId: ortu1 } })) === 0 && (await db.pesan.count({ where: { OR: [{ dariId: ortu1 }, { keId: ortu1 }] } })) === 0, 'tautan & pesan akun yang dihapus ikut terhapus');
ok((await del('admin', `/api/admin/orangtua?id=${gA}`)).status === 404, 'endpoint orang tua tidak bisa menghapus akun guru');
await db.$disconnect();
