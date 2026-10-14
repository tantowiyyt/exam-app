// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
async function req(who, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (jar[who]) headers.cookie = jar[who];
  const res = await fetch(BASE + path, { ...opts, headers, redirect: 'manual' });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) {
    const kv = c.split(';')[0];
    const [k] = kv.split('=');
    const rest = (jar[who] || '').split('; ').filter((x) => x && !x.startsWith(k + '='));
    jar[who] = [...rest, kv].join('; ');
  }
  let body; try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

let r = await req('admin', '/api/login', { method: 'POST', body: JSON.stringify({ nomorPeserta: ADMIN_USER, password: ADMIN_PASS }) });
ok(r.status === 200, `admin login (${r.status} ${JSON.stringify(r.body).slice(0, 80)})`);

// Ujian baru dengan pool 5
r = await req('admin', '/api/admin/ujian', { method: 'POST', body: JSON.stringify({ nama: 'E2E Test', durasiMenit: 30, poolSize: 5 }) });
ok(r.status === 200, 'create ujian');
const ujianId = r.body.data.id;
r = await req('admin', '/api/admin/bagian', { method: 'POST', body: JSON.stringify({ ujianId, nama: 'Bagian Satu', batasSoal: 2 }) });
const bagianId = r.body.data.id;
ok(r.status === 200, 'create bagian');

// 4 soal di bagian (batas 2) + 6 soal tanpa bagian
const mk = (i, extra) => ({ pertanyaan: `Q${i}`, opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', jawabanBenar: 'A', mataPelajaran: 'TIK', ...extra });
r = await req('admin', '/api/admin/soal', { method: 'POST', body: JSON.stringify({ bulk: [1, 2, 3, 4].map((i) => mk(i)), ujianId, bagianId }) });
ok(r.body?.data?.successCount === 4, 'bulk import ke bagian');
r = await req('admin', '/api/admin/soal', { method: 'POST', body: JSON.stringify({ bulk: [5, 6, 7, 8, 9, 10].map((i) => mk(i, { mataPelajaran: 'Matematika' })), ujianId }) });
ok(r.body?.data?.successCount === 6, 'bulk import ke ujian');
r = await req('admin', '/api/admin/soal', { method: 'POST', body: JSON.stringify(mk(99, { jawabanBenar: 'E' })) });
ok(r.status === 400, 'tolak kunci jawaban invalid');

r = await req('admin', '/api/admin/ujian', { method: 'PUT', body: JSON.stringify({ id: ujianId, isActive: true }) });
ok(r.status === 200, 'aktifkan ujian');
r = await req('admin', '/api/admin/ujian');
ok(r.body.filter((u) => u.isActive).length === 1, 'hanya satu ujian aktif');
r = await req('admin', `/api/admin/ujian?id=${ujianId}`, { method: 'DELETE' });
ok(r.status === 400, 'tidak bisa hapus ujian aktif');

// Peserta baru
const np = 'E2E-' + Date.now();
r = await req('admin', '/api/admin/peserta', { method: 'POST', body: JSON.stringify({ nomorPeserta: np, nama: 'Peserta E2E', password: 'rahasia123' }) });
ok(r.status === 200, `create peserta (${r.status} ${JSON.stringify(r.body).slice(0, 80)})`);
r = await req('p', '/api/login', { method: 'POST', body: JSON.stringify({ nomorPeserta: np, password: 'rahasia123' }) });
ok(r.status === 200, 'peserta login');

r = await req('p', '/api/pengaturan');
ok(r.body.ujianId === ujianId && r.body.durasiMenit === 30, 'pengaturan langsung ikut ujian aktif (cache di-invalidasi)');

const g1 = await req('p', '/api/ujian');
const ids1 = g1.body.groups.flatMap((g) => g.soal.map((s) => s.id));
ok(ids1.length === 5, `pool 5 soal (dapat ${ids1.length})`);
const bagianCount = g1.body.groups.find((g) => g.nama === 'Bagian Satu')?.soal.length ?? 0;
ok(bagianCount <= 2, `batas soal bagian <= 2 (dapat ${bagianCount})`);
ok(g1.body.groups.every((g) => g.soal.every((s) => !('jawabanBenar' in s))), 'kunci jawaban tidak bocor');
const g2 = await req('p', '/api/ujian');
const ids2 = g2.body.groups.flatMap((g) => g.soal.map((s) => s.id));
ok(JSON.stringify(ids1) === JSON.stringify(ids2), 'soal & urutan stabil antar-request (refresh)');

const csrf = await req('p', '/api/csrf');
const jawaban = Object.fromEntries(ids1.map((id) => [id, 'A']));
r = await req('p', '/api/ujian/submit', { method: 'POST', headers: { 'x-csrf-token': csrf.body.csrfToken }, body: JSON.stringify({ jawabanPeserta: jawaban, waktuMulai: Date.now() - 60000 }) });
ok(r.status === 200 && r.body.totalSoal === 5 && r.body.nilaiAkhir === 100, `semua benar => nilai 100 dari 5 soal (${JSON.stringify(r.body)})`);
ok(!bagianCount || r.body.skorPerBagian?.['Bagian Satu'] === 100, 'skor per bagian');

r = await req('p', '/api/ujian/submit', { method: 'POST', headers: { 'x-csrf-token': csrf.body.csrfToken }, body: JSON.stringify({ jawabanPeserta: jawaban, waktuMulai: Date.now() }) });
ok(r.status === 409, 'submit ulang ditolak');
r = await req('p', '/api/ujian');
ok(r.status === 409, 'ambil soal setelah selesai ditolak');
r = await req('p', '/api/ujian/review');
ok(r.status === 200, 'review jawaban tersedia');

r = await req('admin', '/api/admin/audit-logs');
const actions = JSON.stringify(r.body);
ok(actions.includes('SUBMIT_UJIAN') && actions.includes('CREATE_UJIAN') && actions.includes('BULK_IMPORT_SOAL'), 'audit log mencatat aksi');

r = await req('anon', '/profile');
ok(r.status === 307 || r.status === 308, `/profile tanpa login diarahkan (${r.status})`);
