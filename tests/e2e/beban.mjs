// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
// Uji beban: N peserta login, mulai ujian, lalu menyimpan jawaban bersamaan beberapa ronde, lalu submit bersamaan
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const N = Number(process.argv[2] || 150);
const RONDE = 5;

async function call(jar, path, method = 'GET', body, headers = {}) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', cookie: jar.c || '', ...headers }, body: body && JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie?.() || []) if (c.startsWith('session=')) jar.c = c.split(';')[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ms: performance.now() - t0 };
}
const stat = (label, rs) => {
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const gagal = rs.filter((r) => r.status >= 400);
  const kode = {};
  for (const g of gagal) kode[g.status] = (kode[g.status] || 0) + 1;
  console.log(`${label.padEnd(26)} n=${rs.length} gagal=${gagal.length} ${J(kode)} p50=${ms[Math.floor(ms.length / 2)].toFixed(0)}ms p95=${ms[Math.floor(ms.length * 0.95)].toFixed(0)}ms max=${ms[ms.length - 1].toFixed(0)}ms`);
  return gagal.length;
};
const J = (o) => JSON.stringify(o);

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
const admin = {};
await call(admin, '/api/login', 'POST', { nomorPeserta: ADMIN_USER, password: ADMIN_PASS });
const t = Date.now();
const bulk = Array.from({ length: N }, (_, i) => ({ nomorPeserta: `LOAD-${t}-${i}`, nama: `Load ${i}`, password: 'rahasia123', ruang: 'LOAD', sesi: '1' }));
const imp = await call(admin, '/api/admin/peserta', 'POST', { bulk });
console.log('impor peserta:', imp.data?.data?.successCount, `(${(imp.ms / 1000).toFixed(1)} dtk)`);

const jars = bulk.map(() => ({}));
let totalGagal = 0;
totalGagal += stat('login bersamaan', await Promise.all(bulk.map((b, i) => call(jars[i], '/api/login', 'POST', { nomorPeserta: b.nomorPeserta, password: 'rahasia123' }))));
const csrf = await Promise.all(jars.map((j) => call(j, '/api/csrf')));
const tokens = csrf.map((r) => r.data?.csrfToken);
const mulai = await Promise.all(jars.map((j) => call(j, '/api/ujian')));
totalGagal += stat('mulai ujian bersamaan', mulai);
const ids = mulai.map((r) => (r.data?.groups || []).flatMap((g) => g.soal.map((s) => s.id)));

for (let k = 1; k <= RONDE; k++) {
  const rs = await Promise.all(jars.map((j, i) => {
    const jawaban = Object.fromEntries(ids[i].slice(0, k * 5).map((id) => [id, 'A']));
    return call(j, '/api/ujian/jawaban', 'POST', { jawaban, ragu: [] }, { 'x-csrf-token': tokens[i] });
  }));
  totalGagal += stat(`simpan jawaban ronde ${k}`, rs);
}
totalGagal += stat('monitoring (1 admin)', [await call(admin, '/api/admin/monitoring')]);
totalGagal += stat('submit bersamaan', await Promise.all(jars.map((j, i) => call(j, '/api/ujian/submit', 'POST', { jawabanPeserta: {} }, { 'x-csrf-token': tokens[i] }))));
console.log('TOTAL GAGAL:', totalGagal);
