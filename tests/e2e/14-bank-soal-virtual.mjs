// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// Bank soal guru (simpan, bagikan, ubah, hapus, akses) & tautan kelas virtual per pertemuan.
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
const akun = {};
for (const [k, nama] of [['ga', 'Guru Bank A'], ['gb', 'Guru Bank B'], ['gc', 'Guru Bank C']]) {
  akun[k] = (await post('admin', '/api/admin/akun', { username: `${k}-${t}`, nama, password: 'guru1234', role: 'GURU' })).body.data.id;
  await login(k, `${k}-${t}`, 'guru1234');
}
const KLS = `KB-${t}`;
await post('admin', '/api/admin/peserta', { nomorPeserta: `bs-${t}`, nama: 'Siswa Bank', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS });
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelasRow = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === KLS);
const MAPEL = `Fisika ${t}`;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelasRow.id, nama: MAPEL, guruId: akun.ga })).body.data.id;
await login('s', `bs-${t}`, 'siswa123');

// ================= Bank soal =================
ok((await req('s', '/api/lms/bank-soal')).status === 403, 'siswa tidak bisa membuka bank soal');
ok((await post('ga', '/api/lms/bank-soal', { mapel: '', soal: [{ tipe: 'bs', pertanyaan: 'x', kunci: 'B' }] })).status === 400, 'nama mapel wajib');
ok((await post('ga', '/api/lms/bank-soal', { mapel: MAPEL, soal: [] })).status === 400, 'daftar soal kosong ditolak');
ok((await post('ga', '/api/lms/bank-soal', { mapel: MAPEL, soal: [{ tipe: 'pg', pertanyaan: 'x', opsi: ['a', 'b'], kunci: 9 }] })).status === 400, 'soal tidak valid ditolak');
const soal = [
  { tipe: 'pg', pertanyaan: 'Satuan gaya adalah ...', opsi: ['joule', 'newton', 'watt'], kunci: 1, bobot: 2, pembahasan: 'Newton' },
  { tipe: 'bs', pertanyaan: 'Kecepatan adalah besaran vektor.', kunci: 'B' },
  { tipe: 'isian', pertanyaan: 'Satuan SI massa?', kunci: 'kilogram | kg' },
];
let r = await post('ga', '/api/lms/bank-soal', { mapel: MAPEL, label: 'Bab 1', soal });
ok(r.status === 200 && r.body.jumlah === 3, 'guru menyimpan 3 soal ke bank');
r = await req('ga', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}`);
ok(r.body.soal.length === 3 && r.body.soal.every((s) => s.milikSaya && !s.bersama) && r.body.labelList.includes('Bab 1') && r.body.mapelDiajar.includes(MAPEL), 'guru melihat soal miliknya, label & mapel yang diajar');
const pg = r.body.soal.find((s) => s.tipe === 'pg');
ok(pg.opsi.length === 3 && pg.kunci === '1' && pg.bobot === 2 && pg.pembahasan === 'Newton', 'isi soal PG tersimpan lengkap');
ok((await req('ga', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}&cari=gaya`)).body.soal.length === 1, 'pencarian pertanyaan');
ok((await req('gb', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}`)).body.soal.length === 0, 'guru lain tidak melihat soal yang tidak dibagikan');

// Bagikan
const ids = r.body.soal.map((s) => s.id);
r = await put('ga', '/api/lms/bank-soal', { ids: ids.slice(0, 2), bersama: true });
ok(r.status === 200 && r.body.jumlah === 2, 'guru membagikan 2 soal');
r = await req('gb', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}`);
ok(r.body.soal.length === 2 && r.body.soal.every((s) => !s.milikSaya && s.pemilik === 'Guru Bank A'), 'guru lain melihat soal yang dibagikan (bukan miliknya)');
ok((await put('gb', '/api/lms/bank-soal', { id: ids[0], tipe: 'bs', pertanyaan: 'diubah', kunci: 'S' })).status === 404, 'guru lain tidak bisa mengubah soal orang lain');
r = await put('gb', '/api/lms/bank-soal', { ids, bersama: false });
ok(r.body.jumlah === 0, 'guru lain tidak bisa mengubah massal soal orang lain');
r = await del('gb', `/api/lms/bank-soal?ids=${ids.join(',')}`);
ok(r.body.jumlah === 0, 'guru lain tidak bisa menghapus soal orang lain');

// Ubah
ok((await put('ga', '/api/lms/bank-soal', { id: ids[0], tipe: 'pg', pertanyaan: 'x', opsi: ['a'], kunci: 0 })).status === 400, 'ubah soal tidak valid ditolak');
r = await put('ga', '/api/lms/bank-soal', { id: ids[1], tipe: 'bs', pertanyaan: 'Percepatan adalah besaran skalar.', kunci: 'S', bobot: 3 });
ok(r.status === 200 && r.body.data.pertanyaan.startsWith('Percepatan') && r.body.data.kunci === 'S' && r.body.data.bersama === true, 'pemilik mengubah soal (status bagikan tetap)');
r = await put('ga', '/api/lms/bank-soal', { ids: [ids[2]], label: 'Bab 2' });
ok(r.body.jumlah === 1, 'ubah label massal');
ok((await req('ga', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}&label=Bab%202`)).body.soal.length === 1, 'filter label');
ok((await req('admin', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}`)).body.soal.length === 3, 'admin melihat semua soal bank');

// Backup & hapus akun
r = await req('admin', '/api/admin/backup');
ok(r.body.data.bankSoal?.some((s) => s.id === ids[0]), 'backup memuat bank soal');
await post('gc', '/api/lms/bank-soal', { mapel: MAPEL, soal: [{ tipe: 'esai', pertanyaan: 'Jelaskan hukum Newton.' }] });
ok((await del('admin', `/api/admin/akun?id=${akun.gc}`)).status === 200, 'akun guru yang punya bank soal bisa dihapus');
ok((await req('admin', `/api/lms/bank-soal?mapel=${encodeURIComponent(MAPEL)}`)).body.soal.length === 3, 'bank soal milik akun yang dihapus ikut terhapus');
r = await del('ga', `/api/lms/bank-soal?ids=${ids.join(',')}`);
ok(r.status === 200 && r.body.jumlah === 3, 'pemilik menghapus soalnya');
ok((await del('ga', '/api/lms/bank-soal?ids=')).status === 400, 'hapus tanpa pilihan ditolak');

// ================= Tautan kelas virtual =================
const nanti = new Date(Date.now() + 3600000).toISOString();
ok((await post('ga', '/api/lms/presensi', { mapelId: mapel, judul: 'P1', tanggal: nanti, linkVirtual: 'javascript:alert(1)' })).status === 400, 'tautan bukan http(s) ditolak');
r = await post('ga', '/api/lms/presensi', { mapelId: mapel, judul: 'Pertemuan Daring', tanggal: nanti, linkVirtual: 'https://meet.google.com/abc-defg-hij' });
ok(r.status === 200 && r.body.data.linkVirtual === 'https://meet.google.com/abc-defg-hij', 'pertemuan dengan tautan kelas virtual');
const ses = r.body.data.id;
r = await req('s', `/api/lms/presensi?mapelId=${mapel}`);
ok(r.body.sesi.find((x) => x.id === ses)?.linkVirtual === 'https://meet.google.com/abc-defg-hij', 'siswa menerima tautan kelas virtual');
const hariIni = new Date(nanti).toDateString() === new Date().toDateString();
r = await req('s', '/api/lms/kelas');
ok(!hariIni || r.body.kelasVirtual.some((v) => v.id === ses && v.link.includes('meet.google.com') && v.mapel.id === mapel), 'beranda siswa: kelas virtual hari ini');
r = await req('ga', '/api/lms/kelas');
ok(!hariIni || r.body.kelasVirtual.some((v) => v.id === ses), 'beranda guru: kelas virtual hari ini');
await put('ga', '/api/lms/presensi', { aksi: 'ubah', id: ses, judul: 'Pertemuan Daring', tanggal: nanti, catatan: '' });
r = await req('ga', `/api/lms/presensi?mapelId=${mapel}`);
ok(r.body.sesi.find((x) => x.id === ses).linkVirtual.includes('meet.google.com'), 'ubah pertemuan tanpa field tautan tidak menghapus tautan');
await put('ga', '/api/lms/presensi', { aksi: 'ubah', id: ses, judul: 'Pertemuan Daring', tanggal: nanti, catatan: '', linkVirtual: '' });
r = await req('ga', `/api/lms/presensi?mapelId=${mapel}`);
ok(r.body.sesi.find((x) => x.id === ses).linkVirtual === '', 'tautan bisa dihapus');
