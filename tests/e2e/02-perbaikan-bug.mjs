// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
async function req(who, path, opts = {}) {
  const headers = { ...(opts.form ? {} : { 'Content-Type': 'application/json' }), ...(opts.headers || {}) };
  if (jar[who]) headers.cookie = jar[who];
  const res = await fetch(BASE + path, { method: opts.method, body: opts.form || opts.body, headers, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    jar[who] = [...(jar[who] || '').split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, type: res.headers.get('content-type') };
}
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
const J = (o) => JSON.stringify(o);

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

await req('admin', '/api/login', { method: 'POST', body: J({ nomorPeserta: ADMIN_USER, password: ADMIN_PASS }) });

// --- Peserta: buat, password tidak bocor, edit tanpa password tetap bisa login
const np = 'T2-' + Date.now();
let r = await req('admin', '/api/admin/peserta', { method: 'POST', body: J({ nomorPeserta: np, nama: 'Tes Dua', password: 'rahasia123', ruang: 'R1', sesi: '1' }) });
const pid = r.body.data.id;
ok(r.status === 200 && !('password' in r.body.data), 'create peserta tanpa bocor hash');
r = await req('admin', '/api/admin/peserta', { method: 'POST', body: J({ nomorPeserta: 'X' }) });
ok(r.status === 400, 'create peserta tanpa nama/password ditolak 400');
r = await req('admin', '/api/admin/peserta');
ok(r.body.every((p) => !('password' in p)), 'GET peserta tanpa hash password');
r = await req('admin', '/api/admin/nilai');
ok(r.body.every((p) => !('password' in p)), 'GET nilai tanpa hash password');
r = await req('admin', '/api/admin/peserta', { method: 'PUT', body: J({ id: pid, nomorPeserta: np, nama: 'Tes Dua Edit', password: '', ruang: 'R1', sesi: '1' }) });
ok(r.status === 200, 'edit peserta tanpa ganti password');
r = await req('admin', '/api/admin/peserta', { method: 'PUT', body: J({ id: pid, nomorPeserta: 'admin', nama: 'x', ruang: 'R1', sesi: '1' }) });
ok(r.status === 400, 'edit ke nomor peserta duplikat ditolak 400');
r = await req('p', '/api/login', { method: 'POST', body: J({ nomorPeserta: np, password: 'rahasia123' }) });
ok(r.status === 200, 'peserta masih bisa login setelah diedit');

// --- CSRF terikat ke user
const csrfAdmin = (await req('admin', '/api/csrf')).body.csrfToken;
const soal = await req('p', '/api/ujian');
const ids = soal.body.groups.flatMap((g) => g.soal.map((s) => s.id));
r = await req('p', '/api/ujian/submit', { method: 'POST', headers: { 'x-csrf-token': csrfAdmin }, body: J({ jawabanPeserta: {}, waktuMulai: Date.now() }) });
ok(r.status === 403, 'token CSRF milik user lain ditolak');
const sessionCookie = jar.p.split('; ').find((c) => c.startsWith('session=')).slice(8);
r = await req('p', '/api/ujian/submit', { method: 'POST', headers: { 'x-csrf-token': sessionCookie }, body: J({ jawabanPeserta: {}, waktuMulai: Date.now() }) });
ok(r.status === 403, 'JWT sesi tidak bisa dipakai sebagai token CSRF');

// --- Monitoring progres
await req('p', '/api/user-activity', { method: 'POST', body: J({ activity: 'START_UJIAN', details: { total: ids.length } }) });
const tokP = (await req('p', '/api/csrf')).body.csrfToken;
await req('p', '/api/ujian/jawaban', { method: 'POST', headers: { 'x-csrf-token': tokP }, body: J({ jawaban: { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'C' } }) });
r = await req('p', '/api/user-activity', { method: 'POST', body: J({ activity: 'HACK' }) });
ok(r.status === 400, 'aktivitas tidak dikenal ditolak');
r = await req('admin', '/api/admin/monitoring');
const mp = r.body.peserta.find((p) => p.nomorPeserta === np);
ok(mp?.sedangUjian === true && mp.jawabanTerjawab === 3, `monitoring menampilkan progres (${J(mp && { s: mp.sedangUjian, t: mp.jawabanTerjawab })})`);
ok(r.body.totalSoal === ids.length, `monitoring totalSoal = soal per peserta (${r.body.totalSoal} vs ${ids.length})`);

// --- Pelanggaran per percobaan
for (let i = 0; i < 2; i++) await req('p', '/api/ujian/pelanggaran', { method: 'POST', body: J({ jenis: 'TAB_SWITCH' }) });
const csrf = (await req('p', '/api/csrf')).body.csrfToken;
r = await req('p', '/api/ujian/submit', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: J({ jawabanPeserta: Object.fromEntries(ids.map((i) => [i, 'A'])), waktuMulai: Date.now() - 1000 }) });
ok(r.status === 200, 'submit dengan token CSRF yang benar');
r = await req('p', '/api/ujian/pelanggaran', { method: 'POST', body: J({ jenis: 'TAB_SWITCH' }) });
ok(r.status === 409, 'pelanggaran setelah selesai ditolak');
await req('admin', '/api/admin/peserta', { method: 'PATCH', body: J({ id: pid, action: 'resetUjian' }) });
await new Promise((res) => setTimeout(res, 20));
r = await req('p', '/api/ujian/pelanggaran', { method: 'POST', body: J({ jenis: 'TAB_SWITCH' }) });
ok(r.body.totalPelanggaran === 1, `pelanggaran dihitung ulang setelah reset (dapat ${r.body.totalPelanggaran})`);

// --- Upload
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');
let fd = new FormData();
fd.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.html');
r = await req('p', '/api/upload', { method: 'POST', form: fd });
ok(r.status === 400, 'upload HTML berkedok image/png ditolak');
fd = new FormData();
fd.append('file', new Blob([png], { type: 'image/png' }), 'evil.html');
r = await req('p', '/api/upload', { method: 'POST', form: fd });
ok(r.status === 200 && r.body.url.endsWith('.png'), `upload PNG asli, ekstensi dari MIME (${r.body.url})`);
const fotoUrl = r.body.url;
const served = await req('p', fotoUrl);
ok(served.status === 200 && served.type === 'image/png', `foto yang baru di-upload tersaji di mode produksi (${served.status} ${served.type})`);
ok((await req('anon', fotoUrl)).status === 401, 'foto tidak bisa diakses tanpa login');
r = await req('p', '/api/me', { method: 'PUT', body: J({ foto: 'javascript:alert(1)', nik: '1234567890123456', tempatLahir: 'X', tanggalLahir: '2000-01-01', jenisKelamin: 'L', alamat: 'A', noHp: '1' }) });
ok(r.status === 400, 'foto URL asing ditolak');
r = await req('p', '/api/me', { method: 'PUT', body: J({ foto: fotoUrl, nik: '1234567890123456', tempatLahir: 'X', tanggalLahir: 'bukan-tanggal', jenisKelamin: 'L', alamat: 'A', noHp: '1' }) });
ok(r.status === 400, 'tanggal lahir invalid ditolak 400 (bukan 500)');

// --- Daftar: ruang kosong agar auto-assign
r = await req('anon', '/api/daftar', { method: 'POST', body: J({ nama: 'Pendaftar', password: 'rahasia123' }) });
ok(r.status === 200, 'daftar mandiri');
const npBaru = r.body.data.nomorPeserta;
await req('d', '/api/login', { method: 'POST', body: J({ nomorPeserta: npBaru, password: 'rahasia123' }) });
r = await req('d', '/api/me');
ok(r.body.ruang === '' && r.body.sesi === '', 'peserta daftar mandiri belum punya ruang (siap auto-assign)');

// --- Hapus peserta yang punya data
r = await req('admin', `/api/admin/peserta?id=${pid}`, { method: 'DELETE' });
ok(r.status === 200, `hapus peserta yang punya histori/pelanggaran/aktivitas (${r.status} ${J(r.body)})`);

// --- Backup & restore (ganti semua) round-trip
const before = await req('admin', '/api/admin/backup');
const b = before.body;
ok(b.version === '2.0' && Array.isArray(b.data.bagianUjian) && Array.isArray(b.data.auditLogs), 'backup memuat semua tabel');
r = await req('admin', '/api/admin/backup', { method: 'POST', body: J({ data: b.data, replaceAll: true }) });
ok(r.status === 200, `restore ganti-semua berhasil (${r.status} ${J(r.body).slice(0, 120)})`);
const after = (await req('admin', '/api/admin/backup')).body;
const same = ['users', 'ujian', 'bagianUjian', 'soal', 'jawabanUjian', 'historiUjian', 'pelanggaran', 'userActivity', 'ipRules']
  .every((t) => J(after.data[t].map((x) => x.id)) === J(b.data[t].map((x) => x.id)));
ok(same, 'ID semua tabel identik setelah restore');
r = await req('admin', '/api/admin/backup', { method: 'POST', body: J({ data: { ...b.data, users: b.data.users.filter((u) => u.role !== 'ADMIN') }, replaceAll: true }) });
ok(r.status === 400, 'restore tanpa akun admin ditolak');
r = await req('admin', '/api/admin/backup', { method: 'POST', body: J({ data: { users: b.data.users, soal: [{ id: 999999, ujianId: 424242, pertanyaan: 'x', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', jawabanBenar: 'A' }] }, replaceAll: true }) });
const cnt = (await req('admin', '/api/admin/backup')).body.data.soal.length;
ok(r.status === 500 && cnt === b.data.soal.length, 'restore gagal di tengah => tidak ada data yang berubah (rollback)');
