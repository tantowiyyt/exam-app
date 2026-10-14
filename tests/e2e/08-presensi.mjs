// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// LMS presensi per pertemuan: sesi, presensi mandiri dengan kode, isian guru (H/I/S/A), rekap, akses, backup.
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
const login = (who, u, p) => post(who, '/api/login', { nomorPeserta: u, password: p });
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

const guru = (await post('admin', '/api/admin/akun', { username: `gp-${t}`, nama: 'Guru Presensi', password: 'guru1234', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `gp2-${t}`, nama: 'Guru Lain', password: 'guru1234', role: 'GURU' });
const KLS = `KP-${t}`;
const sa = (await post('admin', '/api/admin/peserta', { nomorPeserta: `pa-${t}`, nama: 'Ani', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sb = (await post('admin', '/api/admin/peserta', { nomorPeserta: `pb-${t}`, nama: 'Budi', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sc = (await post('admin', '/api/admin/peserta', { nomorPeserta: `pc-${t}`, nama: 'Cici', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const luar = (await post('admin', '/api/admin/peserta', { nomorPeserta: `px-${t}`, nama: 'Orang Luar', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: `LAIN-${t}` })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.find((k) => k.nama === KLS).id, nama: 'PKn', guruId: guru })).body.data.id;
await login('g', `gp-${t}`, 'guru1234');
await login('g2', `gp2-${t}`, 'guru1234');
await login('a', `pa-${t}`, 'siswa123');
await login('b', `pb-${t}`, 'siswa123');
await login('x', `px-${t}`, 'siswa123');

// ---------- Sesi ----------
ok((await post('g2', '/api/lms/presensi', { mapelId: mapel, judul: 'x' })).status === 404, 'guru lain tidak bisa membuat pertemuan');
ok((await post('a', '/api/lms/presensi', { mapelId: mapel, judul: 'x' })).status === 403, 'siswa tidak bisa membuat pertemuan');
ok((await post('g', '/api/lms/presensi', { mapelId: mapel, judul: '' })).status === 400, 'judul pertemuan wajib');
let r = await post('g', '/api/lms/presensi', { mapelId: mapel, judul: 'Pertemuan 1', bukaMenit: 15, catatan: 'Bab 1' });
ok(r.status === 200 && /^[A-Z2-9]{6}$/.test(r.body.data.kode) && r.body.data.bukaSampai, 'guru membuat pertemuan dengan presensi mandiri (kode 6 karakter)');
const p1 = r.body.data;
r = await post('g', '/api/lms/presensi', { mapelId: mapel, judul: 'Pertemuan 2', tanggal: new Date(Date.now() - 3600000).toISOString() });
ok(r.status === 200 && r.body.data.bukaSampai === null, 'pertemuan tanpa presensi mandiri');
const p2 = r.body.data;

// ---------- Presensi mandiri ----------
r = await req('a', `/api/lms/presensi?mapelId=${mapel}`);
ok(r.status === 200 && r.body.sesi.length === 2 && r.body.sesi.every((s) => s.kode === undefined), 'siswa melihat daftar pertemuan tanpa kode');
ok(r.body.sesi.find((s) => s.id === p1.id).dibuka === true, 'siswa melihat presensi sedang dibuka');
r = await req('a', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.jenis === 'presensi' && n.judul.includes('Pertemuan 1')), 'siswa mendapat notifikasi presensi dibuka');
ok((await post('x', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: p1.kode })).status === 404, 'siswa kelas lain tidak bisa presensi');
ok((await post('g', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: p1.kode })).status === 403, 'guru tidak presensi mandiri');
ok((await post('a', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: 'SALAH1' })).status === 400, 'kode salah ditolak');
r = await post('a', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: ` ${p1.kode.toLowerCase()} ` });
ok(r.status === 200 && r.body.data.status === 'H' && r.body.data.mandiri, 'siswa presensi mandiri (kode tidak peka huruf besar/spasi)');
r = await req('a', '/api/lms/notifikasi');
ok(!r.body.items.some((n) => n.jenis === 'presensi'), 'notifikasi presensi hilang setelah siswa hadir');

// Batas percobaan kode
let tolak = 0;
for (let i = 0; i < 6; i++) if ((await post('b', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: `XX${i}` })).status === 429) tolak++;
ok(tolak >= 1, 'percobaan kode berulang dibatasi');

// Tutup presensi mandiri -> kode tidak berlaku
ok((await put('g2', '/api/lms/presensi', { aksi: 'ubah', id: p1.id, judul: 'Pertemuan 1', bukaMenit: 0 })).status === 404, 'guru lain tidak bisa mengubah pertemuan');
r = await put('g', '/api/lms/presensi', { aksi: 'ubah', id: p1.id, judul: 'Pertemuan 1', bukaMenit: 0 });
ok(r.status === 200 && r.body.data.bukaSampai === null, 'guru menutup presensi mandiri');
r = await put('g', '/api/lms/presensi', { aksi: 'ubah', id: p2.id, judul: 'Pertemuan 2', tanggal: p2.tanggal, bukaMenit: 10, gantiKode: true });
ok(r.status === 200 && r.body.data.bukaSampai && r.body.data.kode !== p2.kode, 'guru membuka presensi mandiri & mengganti kode');
const kodeBaru = r.body.data.kode;
ok((await post('x', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: p1.kode })).status === 404, 'kode sesi yang ditutup tidak berlaku');

// ---------- Isian guru ----------
ok((await put('g', '/api/lms/presensi', { aksi: 'isi', id: p1.id, data: [{ userId: luar, status: 'H' }] })).status === 400, 'siswa kelas lain tidak bisa dicatat');
ok((await put('g', '/api/lms/presensi', { aksi: 'isi', id: p1.id, data: [{ userId: sb, status: 'X' }] })).status === 400, 'status tidak dikenal ditolak');
r = await put('g', '/api/lms/presensi', { aksi: 'isi', id: p1.id, data: [{ userId: sa, status: 'H' }, { userId: sb, status: 'S', keterangan: 'Demam' }, { userId: sc, status: 'A' }] });
ok(r.status === 200, 'guru mengisi presensi pertemuan 1');
r = await put('g', '/api/lms/presensi', { aksi: 'isi', id: p2.id, data: [{ userId: sa, status: 'I', keterangan: 'Lomba' }, { userId: sb, status: 'H' }] });
ok(r.status === 200, 'guru mengisi presensi pertemuan 2');

r = await req('g', `/api/lms/presensi?mapelId=${mapel}`);
const s1 = r.body.sesi.find((s) => s.id === p1.id);
ok(s1.jumlah.H === 1 && s1.jumlah.S === 1 && s1.jumlah.A === 1 && s1.presensi.find((p) => p.userId === sa).mandiri, 'jumlah per status benar; presensi mandiri Ani tetap tercatat mandiri');
ok(s1.presensi.find((p) => p.userId === sb).keterangan === 'Demam', 'keterangan izin/sakit tersimpan');
const rA = r.body.rekap.find((x) => x.userId === sa);
// Pertemuan 1 (sekarang) & 2 (1 jam lalu) sudah berlangsung: Ani H + I = 50%
ok(rA.H === 1 && rA.I === 1 && rA.persen === 50, 'rekap kehadiran per siswa (50%)');

r = await req('a', `/api/lms/presensi?mapelId=${mapel}`);
ok(r.body.rekap.H === 1 && r.body.rekap.I === 1 && r.body.rekap.persen === 50 && r.body.sesi.find((s) => s.id === p2.id).saya.status === 'I', 'siswa melihat rekap & status kehadirannya');

// Hapus status (kosongkan)
r = await put('g', '/api/lms/presensi', { aksi: 'isi', id: p1.id, data: [{ userId: sc, status: '' }] });
r = await req('g', `/api/lms/presensi?mapelId=${mapel}`);
ok(!r.body.sesi.find((s) => s.id === p1.id).presensi.some((p) => p.userId === sc), 'status bisa dikosongkan lagi');

// Budi presensi mandiri di pertemuan 2 (sudah Hadir dari guru) -> tetap H
r = await post('b', '/api/lms/presensi', { aksi: 'hadir', mapelId: mapel, kode: kodeBaru });
ok(r.status === 200 || r.status === 429, 'siswa yang sudah dicatat tetap bisa presensi (atau masih kena batas percobaan)');

// ---------- Backup & hapus ----------
r = await req('admin', '/api/admin/backup');
ok(r.body.data.sesiPresensi.some((s) => s.id === p1.id) && r.body.data.presensi.some((p) => p.sesiId === p1.id), 'backup memuat presensi');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${mapel}`)).status === 400, 'mapel yang punya presensi tidak bisa dihapus');
ok((await del('admin', `/api/admin/peserta?id=${sb}`)).status === 200, 'siswa yang punya catatan presensi bisa dihapus');
ok((await del('g2', `/api/lms/presensi?id=${p1.id}`)).status === 404, 'guru lain tidak bisa menghapus pertemuan');
ok((await del('g', `/api/lms/presensi?id=${p1.id}`)).status === 200, 'guru menghapus pertemuan beserta catatannya');
r = await req('g', `/api/lms/presensi?mapelId=${mapel}`);
ok(r.body.sesi.length === 1, 'pertemuan terhapus');
