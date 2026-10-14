// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
let cookie = '';
async function req(path, method = 'GET', body, form) {
  const headers = { cookie, ...(form ? {} : { 'Content-Type': 'application/json' }) };
  const res = await fetch(BASE + path, { method, headers, body: form || (body && JSON.stringify(body)) });
  for (const c of res.headers.getSetCookie?.() || []) if (c.startsWith('session=')) cookie = c.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await req('/api/login', 'POST', { nomorPeserta: ADMIN_USER, password: ADMIN_PASS });

const np = 'T5-' + Date.now();
let r = await req('/api/admin/peserta', 'POST', { nomorPeserta: np, nama: 'Data Diri', password: 'rahasia123', ruang: 'R1', sesi: '1', nik: '123' });
ok(r.status === 400 && r.body.message.includes('NIK'), 'NIK tidak valid ditolak saat tambah');
r = await req('/api/admin/peserta', 'POST', { nomorPeserta: np, nama: 'Data Diri', password: 'rahasia123', ruang: 'R1', sesi: '1', nik: '3201010101010001', tempatLahir: 'Bandung', tanggalLahir: '2008-05-17', jenisKelamin: 'P', alamat: 'Jl. Mawar 1', noHp: '0812' });
ok(r.status === 200, 'tambah peserta dengan data diri');
const id = r.body.data.id;

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');
const fd = new FormData();
fd.append('file', new Blob([png], { type: 'image/png' }), 'f.png');
const up = await req('/api/upload', 'POST', null, fd);
ok(up.status === 200, 'admin unggah foto');

const base = { id, nomorPeserta: np, nama: 'Data Diri', ruang: 'R1', sesi: '1', kelas: 'XI' };
r = await req('/api/admin/peserta', 'PUT', { ...base, foto: 'https://evil.example/x.png' });
ok(r.status === 400, 'URL foto asing ditolak');
r = await req('/api/admin/peserta', 'PUT', { ...base, tanggalLahir: '2999-01-01' });
ok(r.status === 400, 'tanggal lahir di masa depan ditolak');
r = await req('/api/admin/peserta', 'PUT', { ...base, foto: up.body.url, jenisKelamin: 'L', nik: '3201010101010002' });
ok(r.status === 200, 'admin mengoreksi data diri + foto');
let p = (await req('/api/admin/peserta')).body.find((x) => x.id === id);
ok(p.foto === up.body.url && p.jenisKelamin === 'L' && p.nik === '3201010101010002' && p.tempatLahir === 'Bandung' && p.tanggalLahir.startsWith('2008-05-17'), 'data tersimpan; field yang tidak dikirim tetap');
r = await req('/api/admin/peserta', 'PUT', { ...base, nik: '', foto: '' });
p = (await req('/api/admin/peserta')).body.find((x) => x.id === id);
ok(r.status === 200 && p.nik === null && p.foto === null, 'mengosongkan field menghapus nilainya');
await req(`/api/admin/peserta?id=${id}`, 'DELETE');
