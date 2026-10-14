// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
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
const login = (who, u, p) => post(who, '/api/login', { nomorPeserta: u, password: p });
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

// Akun pengawas
let r = await post('admin', '/api/admin/akun', { username: `pgw1-${t}`, nama: 'Pengawas R1', password: 'pengawas1', role: 'PENGAWAS', ruang: `R1-${t}` });
ok(r.status === 200 && r.body.data.role === 'PENGAWAS' && !('password' in r.body.data), 'admin membuat akun pengawas ruang R1');
r = await post('admin', '/api/admin/akun', { username: `pgw2-${t}`, nama: 'Pengawas Semua', password: 'pengawas2', role: 'PENGAWAS', ruang: '' });
r = await post('admin', '/api/admin/akun', { username: `pgw1-${t}`, nama: 'x', password: 'xxxxxx', role: 'PENGAWAS' });
ok(r.status === 400, 'username duplikat ditolak');
r = await post('admin', '/api/admin/akun', { username: `p-${t}`, nama: 'x', password: 'xxxxxx', role: 'PESERTA' });
ok(r.status === 400, 'akun staf tidak bisa dibuat dengan role PESERTA');

// Peserta di R1 dan R2 yang sedang ujian
const mkPeserta = async (who, ruang) => {
  const np = `${who}-${t}`;
  const c = await post('admin', '/api/admin/peserta', { nomorPeserta: np, nama: who, password: 'rahasia123', ruang, sesi: '1' });
  await login(who, np, 'rahasia123');
  await req(who, '/api/ujian');
  return c.body.data.id;
};
const pa = await mkPeserta('pa', `R1-${t}`);
const pb = await mkPeserta('pb', `R2-${t}`);

// Login & routing pengawas
r = await login('pg1', `pgw1-${t}`, 'pengawas1');
ok(r.status === 200 && r.body.role === 'PENGAWAS', 'pengawas login');
const routes = { '/admin/monitoring': 200, '/akun/password': 200 };
for (const [p, code] of Object.entries(routes)) ok((await req('pg1', p)).status === code, `pengawas boleh buka ${p}`);
for (const p of ['/admin', '/admin/soal', '/admin/akun', '/dashboard', '/ujian', '/login']) {
  r = await req('pg1', p);
  ok(r.status === 307 && r.loc?.endsWith('/admin/monitoring'), `pengawas di ${p} diarahkan ke monitoring`);
}
for (const p of ['/api/admin/soal', '/api/admin/peserta', '/api/admin/akun', '/api/admin/backup', '/api/admin/nilai', '/api/admin/histori']) {
  ok((await req('pg1', p)).status === 403, `pengawas ditolak di ${p}`);
}
ok((await req('pg1', '/api/ujian')).status === 403, 'pengawas tidak bisa mengerjakan ujian');

r = await req('pg1', '/api/admin/monitoring');
const ids = r.body.peserta.map((p) => p.id);
ok(r.status === 200 && ids.includes(pa) && !ids.includes(pb) && r.body.ruangPengawas === `R1-${t}`, 'pengawas R1 hanya melihat peserta R1');
r = await post('pg1', '/api/admin/sesi', { userId: pa, action: 'tambahWaktu', menit: 5 });
ok(r.status === 200, 'pengawas menambah waktu peserta di ruangnya');
r = await post('pg1', '/api/admin/sesi', { userId: pb, action: 'tambahWaktu', menit: 5 });
ok(r.status === 403, 'pengawas tidak bisa mengatur peserta ruang lain');

await login('pg2', `pgw2-${t}`, 'pengawas2');
r = await req('pg2', '/api/admin/monitoring');
ok(r.body.peserta.some((p) => p.id === pa) && r.body.peserta.some((p) => p.id === pb), 'pengawas tanpa ruang melihat semua ruang');

// Peserta tidak bisa akses staf
for (const p of ['/admin/monitoring', '/admin']) {
  r = await req('pa', p);
  ok(r.status === 307 && r.loc?.endsWith('/dashboard'), `peserta di ${p} diarahkan ke dashboard`);
}
ok((await req('pa', '/api/admin/monitoring')).status === 403, 'peserta ditolak di API monitoring');
ok((await post('pa', '/api/admin/sesi', { userId: pa, action: 'tambahWaktu', menit: 60 })).status === 403, 'peserta tidak bisa menambah waktunya sendiri');

// Admin kedua & penurunan role langsung berlaku
r = await post('admin', '/api/admin/akun', { username: `adm2-${t}`, nama: 'Admin Dua', password: 'admin2pw', role: 'ADMIN' });
const adm2 = r.body.data.id;
await login('adm2', `adm2-${t}`, 'admin2pw');
ok((await req('adm2', '/api/admin/soal')).status === 200, 'admin kedua punya akses penuh');
ok((await req('admin', '/api/admin/peserta', { method: 'PUT', body: J({ id: adm2, nomorPeserta: `adm2-${t}`, nama: 'x', ruang: '', sesi: '' }) })).status === 400, 'endpoint peserta tidak bisa mengubah akun admin');
r = await req('admin', '/api/admin/akun', { method: 'PUT', body: J({ id: adm2, nama: 'Admin Dua', role: 'PENGAWAS', ruang: '' }) });
ok(r.status === 200, 'admin menurunkan admin kedua menjadi pengawas');
ok((await req('adm2', '/api/admin/soal')).status === 403, 'akses admin dicabut seketika (tanpa menunggu token kedaluwarsa)');

// Pengaman admin terakhir / akun sendiri
r = await req('admin', '/api/admin/akun');
const selfId = r.body.selfId;
ok((await req('admin', '/api/admin/akun', { method: 'PUT', body: J({ id: selfId, nama: 'Administrator', role: 'PENGAWAS' }) })).status === 400, 'admin tidak bisa menurunkan role sendiri');
ok((await req('admin', `/api/admin/akun?id=${selfId}`, { method: 'DELETE' })).status === 400, 'admin tidak bisa menghapus akun sendiri');
r = await req('admin', `/api/admin/akun?id=${adm2}`, { method: 'DELETE' });
ok(r.status === 200, 'hapus akun staf (yang punya riwayat login)');
ok((await req('adm2', '/api/admin/monitoring')).status === 401, 'akun yang dihapus langsung kehilangan akses');

// Pengawas ganti password sendiri
r = await post('pg1', '/api/me/password', { passwordLama: 'pengawas1', passwordBaru: 'pengawasBaru1' });
ok(r.status === 200, 'pengawas bisa ganti password');
