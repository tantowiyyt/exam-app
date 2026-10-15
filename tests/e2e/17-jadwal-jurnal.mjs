// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Phase 21: jadwal pelajaran (roster) per kelas & guru dengan cek bentrok, jadwal hari ini di beranda, jurnal mengajar.
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

const guru = async (nama) => (await post('admin', '/api/admin/akun', { username: `${nama}-${t}`, nama: `${nama} ${t}`, password: 'guru12345', role: 'GURU' })).body.data.id;
const gA = await guru('jga');
const gB = await guru('jgb');
const KA = `JD-A-${t}`;
const KB = `JD-B-${t}`;
const sA = (await post('admin', '/api/admin/peserta', { nomorPeserta: `jd-s-${t}`, nama: 'Siswa Jadwal', password: 'siswa123', kelas: KA })).body.data.id;
await post('admin', '/api/admin/peserta', { nomorPeserta: `jd-s2-${t}`, nama: 'Siswa Dua', password: 'siswa123', kelas: KA });
await post('admin', '/api/admin/peserta', { nomorPeserta: `jd-s3-${t}`, nama: 'Siswa B', password: 'siswa123', kelas: KB });
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas;
const kA = kelas.find((k) => k.nama === KA).id;
const kB = kelas.find((k) => k.nama === KB).id;
const mapel = async (kelasId, nama, guruId) => (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId, nama, guruId })).body.data.id;
const mMat = await mapel(kA, 'Matematika', gA);
const mFis = await mapel(kA, 'Fisika', gB);
const mMatB = await mapel(kB, 'Matematika', gA);
await login('ga', `jga-${t}`, 'guru12345');
await login('gb', `jgb-${t}`, 'guru12345');
await login('s', `jd-s-${t}`, 'siswa123');

// ---------- Jadwal ----------
const hariIni = ((new Date().getDay() + 6) % 7) + 1;
let r = await post('admin', '/api/lms/jadwal', { mapelId: mMat, hari: hariIni, jamMulai: '07:00', jamSelesai: '08:30', ruang: 'R-12' });
ok(r.status === 200 && r.body.data.kelasId === kA, 'admin menambah jadwal (kelas diambil dari mapel)');
const j1 = r.body.data.id;
ok((await post('admin', '/api/lms/jadwal', { mapelId: mFis, hari: hariIni, jamMulai: '08:00', jamSelesai: '09:00' })).status === 400, 'jadwal bentrok di kelas yang sama ditolak');
r = await post('admin', '/api/lms/jadwal', { mapelId: mMatB, hari: hariIni, jamMulai: '08:00', jamSelesai: '09:00' });
ok(r.status === 400 && /Guru pengampu sudah mengajar/.test(r.body.message), 'guru yang sama tidak bisa dijadwalkan bentrok di kelas lain');
ok((await post('admin', '/api/lms/jadwal', { mapelId: mFis, hari: hariIni, jamMulai: '09:00', jamSelesai: '08:00' })).status === 400, 'jam selesai harus setelah jam mulai');
ok((await post('admin', '/api/lms/jadwal', { mapelId: mFis, hari: 9, jamMulai: '09:00', jamSelesai: '10:00' })).status === 400, 'hari tidak valid ditolak');
ok((await post('admin', '/api/lms/jadwal', { mapelId: mFis, hari: 1, jamMulai: '9.00', jamSelesai: '10:00' })).status === 400, 'format jam salah ditolak');
r = await post('admin', '/api/lms/jadwal', { mapelId: mFis, hari: hariIni, jamMulai: '08:30', jamSelesai: '10:00' });
ok(r.status === 200, 'jadwal bersambung (08:30 tepat setelah 08:30) diterima');
const j2 = r.body.data.id;
r = await post('admin', '/api/lms/jadwal', { mapelId: mMatB, hari: hariIni, jamMulai: '10:00', jamSelesai: '11:00' });
ok(r.status === 200, 'jadwal guru A di kelas B jam lain diterima');
ok((await post('ga', '/api/lms/jadwal', { mapelId: mMat, hari: 2, jamMulai: '07:00', jamSelesai: '08:00' })).status === 403, 'guru tidak bisa mengubah jadwal');
r = await put('admin', '/api/lms/jadwal', { id: j2, mapelId: mFis, hari: hariIni, jamMulai: '07:30', jamSelesai: '09:00' });
ok(r.status === 400, 'ubah jadwal menjadi bentrok ditolak');
r = await put('admin', '/api/lms/jadwal', { id: j2, mapelId: mFis, hari: hariIni, jamMulai: '08:30', jamSelesai: '09:30', ruang: 'Lab' });
ok(r.status === 200 && r.body.data.ruang === 'Lab', 'admin mengubah jadwal');

r = await req('s', '/api/lms/jadwal');
ok(r.status === 200 && r.body.peran === 'siswa' && r.body.judul === KA && r.body.jadwal.length === 2, 'siswa melihat jadwal kelasnya');
ok(r.body.jadwal[0].mapel.nama === 'Matematika' && r.body.jadwal[0].guru.nama === `jga ${t}`, 'jadwal berurutan dengan nama guru');
r = await req('ga', '/api/lms/jadwal');
ok(r.status === 200 && r.body.peran === 'guru' && r.body.jadwal.length === 2 && r.body.jadwal.every((j) => j.mapel.nama === 'Matematika'), 'guru melihat jadwal mengajarnya di semua kelas');
r = await req('gb', `/api/lms/jadwal?kelas=${kB}`);
ok(r.status === 404, 'guru tidak bisa membuka jadwal kelas yang tidak ia ajar');
r = await req('ga', `/api/lms/jadwal?kelas=${kA}`);
ok(r.status === 200 && r.body.jadwal.length === 2, 'guru membuka jadwal kelas yang ia ajar');
r = await req('admin', `/api/lms/jadwal?guru=${gA}`);
ok(r.status === 200 && r.body.peran === 'admin' && r.body.jadwal.length === 2, 'admin melihat jadwal per guru');
r = await req('admin', `/api/lms/jadwal?kelas=${kA}`);
ok(r.body.kelasList.find((k) => k.id === kA)?.mapel.length === 2, 'admin mendapat daftar mapel kelas untuk form');

r = await req('s', '/api/lms/kelas');
ok(r.body.jadwalHariIni?.length === 2 && r.body.jadwalHariIni[0].jamMulai === '07:00', 'beranda siswa menampilkan jadwal hari ini');
r = await req('ga', '/api/lms/kelas');
ok(r.body.jadwalHariIni?.length === 2, 'beranda guru menampilkan jadwal mengajar hari ini');
ok((await del('admin', `/api/lms/jadwal?id=${j1}`)).status === 200, 'admin menghapus jadwal');
ok((await req('s', '/api/lms/jadwal')).body.jadwal.length === 1, 'jadwal terhapus');

// ---------- Jurnal mengajar ----------
const tgl = new Date();
const tanggal = `${tgl.getFullYear()}-${String(tgl.getMonth() + 1).padStart(2, '0')}-${String(tgl.getDate()).padStart(2, '0')}`;
const sesi = (await post('ga', '/api/lms/presensi', { mapelId: mMat, judul: 'Pertemuan jurnal' })).body.data.id;
await put('ga', '/api/lms/presensi', { aksi: 'isi', id: sesi, data: [{ userId: sA, status: 'S', keterangan: 'flu' }] });
ok((await post('ga', '/api/lms/jurnal', { mapelId: mMat, tanggal, materi: '' })).status === 400, 'materi jurnal wajib');
ok((await post('ga', '/api/lms/jurnal', { mapelId: mFis, tanggal, materi: 'x' })).status === 404, 'guru tidak bisa mengisi jurnal mapel guru lain');
ok((await post('s', '/api/lms/jurnal', { mapelId: mMat, tanggal, materi: 'x' })).status === 403, 'siswa tidak bisa mengisi jurnal');
r = await post('ga', '/api/lms/jurnal', { mapelId: mMat, tanggal, jamKe: '1-2', materi: 'Persamaan kuadrat', kegiatan: 'Diskusi kelompok' });
ok(r.status === 200 && r.body.data.sesiPresensiId === sesi, 'jurnal tersimpan & otomatis tertaut ke presensi tanggal yang sama');
const jr = r.body.data.id;
r = await post('ga', '/api/lms/jurnal', { mapelId: mMatB, tanggal, materi: 'Fungsi' });
ok(r.status === 200 && r.body.data.sesiPresensiId === null, 'jurnal tanpa presensi di tanggal itu');
ok((await post('ga', '/api/lms/jurnal', { mapelId: mMat, tanggal, materi: 'x', sesiPresensiId: 99999999 })).status === 400, 'presensi milik mapel lain ditolak');
r = await req('ga', '/api/lms/jurnal');
const jMat = r.body.jurnal?.find((j) => j.id === jr);
ok(r.status === 200 && r.body.jurnal.length === 2 && r.body.admin === false, 'guru melihat jurnalnya');
ok(jMat?.tidakHadir.length === 1 && jMat.tidakHadir[0].status === 'S' && jMat.tidakHadir[0].nama === 'Siswa Jadwal', 'siswa tidak hadir diambil dari presensi');
ok(r.body.mapelList.length === 2, 'guru mendapat daftar mapelnya untuk form');
r = await req('ga', `/api/lms/jurnal?mapelId=${mMatB}`);
ok(r.body.jurnal.length === 1, 'filter jurnal per mapel');
r = await req('gb', '/api/lms/jurnal');
ok(r.body.jurnal.length === 0, 'guru lain tidak melihat jurnal guru ini');
ok((await put('gb', '/api/lms/jurnal', { id: jr, tanggal, materi: 'ubah' })).status === 404, 'guru lain tidak bisa mengubah jurnal');
r = await put('ga', '/api/lms/jurnal', { id: jr, tanggal, materi: 'Persamaan kuadrat (lanjutan)', catatan: 'LCD rusak' });
ok(r.status === 200 && r.body.data.catatan === 'LCD rusak', 'guru mengubah jurnalnya');
r = await req('admin', `/api/lms/jurnal?guru=${gA}`);
ok(r.status === 200 && r.body.admin === true && r.body.jurnal.length === 2 && r.body.jurnal[0].guru === `jga ${t}`, 'admin melihat jurnal per guru (supervisi)');
const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
r = await req('admin', `/api/lms/jurnal?guru=${gA}&dari=${besok}`);
ok(r.body.jurnal.length === 0, 'filter rentang tanggal');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${mMatB}`)).status === 400, 'mapel yang punya jurnal tidak bisa dihapus');
ok((await del('ga', `/api/lms/jurnal?id=${jr}`)).status === 200, 'guru menghapus jurnalnya');

// ---------- Halaman ----------
for (const [who, path] of [['s', '/kelas/jadwal'], ['ga', '/kelas/jadwal'], ['ga', '/kelas/jurnal'], ['admin', '/kelas/jurnal']]) {
  ok((await req(who, path)).status === 200, `halaman ${path} terbuka (${who})`);
}
r = await req('admin', '/api/admin/backup');
ok(r.body.data?.jadwalPelajaran?.some((j) => j.id === j2) && r.body.data.jurnalMengajar.length > 0, 'backup memuat jadwal & jurnal');
