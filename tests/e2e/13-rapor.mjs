// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// Rapor siswa lintas mapel: akses (admin, guru pengajar, wali kelas, siswa), nilai akhir per mapel, KKM,
// nilai yang belum diumumkan, kehadiran, peringkat, filter siswa & semester.
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
const login = (who, u, p) => post(who, '/api/login', { nomorPeserta: u, password: p });
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

const akun = {};
for (const [k, nama] of [['ga', 'Guru A'], ['gb', 'Guru B'], ['gc', 'Guru Lain'], ['gw', `Wali ${t}`]]) {
  akun[k] = (await post('admin', '/api/admin/akun', { username: `${k}-${t}`, nama, password: 'guru1234', role: 'GURU' })).body.data.id;
}
const KLS = `KR-${t}`;
const sa = (await post('admin', '/api/admin/peserta', { nomorPeserta: `ra-${t}`, nama: 'Ani Rapor', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sb = (await post('admin', '/api/admin/peserta', { nomorPeserta: `rb-${t}`, nama: 'Budi Rapor', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
let kelasRow = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === KLS);
await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelasRow.id, nama: KLS, keterangan: `Wali kelas: Wali ${t}` });
const m1 = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelasRow.id, nama: 'Biologi', guruId: akun.ga })).body.data.id;
const m2 = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelasRow.id, nama: 'Kimia', guruId: akun.gb })).body.data.id;
for (const k of ['ga', 'gb', 'gc', 'gw']) await login(k, `${k}-${t}`, 'guru1234');
await login('a', `ra-${t}`, 'siswa123');
await login('b', `rb-${t}`, 'siswa123');

// Nilai Biologi: tugas 80 (a), 60 (b); UTS offline 90 (a), 70 (b) diumumkan; KKM 75
const tg = (await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Laporan', terbit: true })).body.data.id;
for (const [w, n] of [['a', 80], ['b', 60]]) {
  const p = (await post(w, '/api/lms/pengumpulan', { tugasId: tg, jawaban: 'jawaban' })).body.data.id;
  await put('ga', '/api/lms/pengumpulan', { id: p, nilai: n });
}
const uts = (await post('ga', '/api/lms/ujian-manual', { mapelId: m1, judul: 'UTS Biologi', jenis: 'UTS', mode: 'offline' })).body.data.id;
await put('ga', '/api/lms/ujian-manual', { id: uts, aksi: 'nilai', data: [{ userId: sa, nilai: 90 }, { userId: sb, nilai: 70 }] });
await put('ga', '/api/lms/ujian-manual', { id: uts, terbit: true });
await put('ga', `/api/lms/mapel/${m1}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, kkm: 75 });
// Kimia: UAS 70 (a) belum diumumkan
const uas = (await post('gb', '/api/lms/ujian-manual', { mapelId: m2, judul: 'UAS Kimia', jenis: 'UAS', mode: 'offline' })).body.data.id;
await put('gb', '/api/lms/ujian-manual', { id: uas, aksi: 'nilai', data: [{ userId: sa, nilai: 70 }] });
// Presensi Biologi: a hadir, b alpa
const ses = (await post('ga', '/api/lms/presensi', { mapelId: m1, judul: 'Pertemuan 1', tanggal: new Date(Date.now() - 3600000).toISOString() })).body.data.id;
await put('ga', '/api/lms/presensi', { aksi: 'isi', id: ses, data: [{ userId: sa, status: 'H' }, { userId: sb, status: 'A' }] });

// ---------- Akses ----------
let r = await req('admin', '/api/lms/rapor');
ok(r.status === 200 && r.body.peran === 'staf' && r.body.kelasList.some((k) => k.id === kelasRow.id) && !r.body.rapor, 'admin: daftar kelas untuk rapor');
r = await req('gc', '/api/lms/rapor');
ok(r.status === 200 && !r.body.kelasList.some((k) => k.id === kelasRow.id), 'guru yang tidak mengajar kelas itu tidak melihatnya');
ok((await req('gc', `/api/lms/rapor?kelas=${kelasRow.id}`)).status === 404, 'guru lain tidak bisa membuka rapor kelas itu');
ok((await req('ga', `/api/lms/rapor?kelas=${kelasRow.id}`)).status === 200, 'guru pengajar mapel di kelas bisa membuka rapor kelas');
r = await req('gw', '/api/lms/rapor');
ok(r.body.kelasList.some((k) => k.id === kelasRow.id), 'wali kelas (dari keterangan kelas) bisa membuka rapor kelasnya');

// ---------- Isi rapor (staf) ----------
r = await req('admin', `/api/lms/rapor?kelas=${kelasRow.id}`);
ok(r.status === 200 && r.body.rapor.length === 2 && r.body.mapel.length === 2 && r.body.kelas.wali === `Wali ${t}`, 'rapor kelas: 2 siswa, 2 mapel, wali kelas');
const ra = r.body.rapor.find((x) => x.siswa.id === sa);
const rb = r.body.rapor.find((x) => x.siswa.id === sb);
const bioA = ra.nilai.find((n) => n.mapelId === m1);
ok(bioA.nilaiAkhir === 85 && bioA.tuntas === true && bioA.komponen.tugas === 80 && bioA.komponen.uts === 90, 'Biologi siswa A: tugas 80, UTS 90, akhir 85, tuntas');
ok(rb.nilai.find((n) => n.mapelId === m1).tuntas === false, 'Biologi siswa B (65) belum tuntas KKM 75');
ok(ra.nilai.find((n) => n.mapelId === m2).nilaiAkhir === 70, 'staf melihat nilai UAS Kimia yang belum diumumkan');
ok(['tugas', 'uts', 'uas', 'presensi'].every((k) => r.body.komponen.includes(k)) && !r.body.komponen.includes('kuis'), 'kolom komponen hanya yang dipakai');
ok(ra.kehadiran.H === 1 && ra.kehadiran.pertemuan === 1 && ra.kehadiran.persen === 100 && rb.kehadiran.A === 1 && rb.kehadiran.persen === 0, 'kehadiran gabungan semua mapel: A hadir 1/1, B alpa 1');
ok(ra.peringkat === 1 && rb.peringkat === 2, 'peringkat kelas berdasarkan rata-rata');
ok(ra.jumlahTuntas === 1 && ra.jumlahBerKkm === 1, 'jumlah mapel tuntas dari mapel ber-KKM');
r = await req('admin', `/api/lms/rapor?kelas=${kelasRow.id}&siswa=${sb}`);
ok(r.body.rapor.length === 1 && r.body.rapor[0].siswa.id === sb && r.body.rapor[0].peringkat === null, 'filter satu siswa (tanpa peringkat)');

// ---------- Siswa ----------
r = await req('a', '/api/lms/rapor');
ok(r.status === 200 && r.body.peran === 'siswa' && r.body.rapor.length === 1 && r.body.rapor[0].siswa.id === sa && r.body.kelasList.length === 0, 'siswa hanya melihat rapornya sendiri');
ok(r.body.rapor[0].nilai.find((n) => n.mapelId === m2).nilaiAkhir === null, 'siswa: nilai yang belum diumumkan tidak masuk rapor');
ok(r.body.rapor[0].nilai.find((n) => n.mapelId === m1).nilaiAkhir === 85 && r.body.rapor[0].peringkat === null, 'siswa: nilai Biologi 85, tanpa peringkat');
r = await req('a', `/api/lms/rapor?kelas=${kelasRow.id}&siswa=${sb}`);
ok(r.body.rapor.length === 1 && r.body.rapor[0].siswa.id === sa, 'siswa tidak bisa membuka rapor siswa lain');
ok(r.body.sekolah && typeof r.body.sekolah.namaAplikasi === 'string', 'rapor memuat identitas sekolah untuk kop');

// ---------- Predikat, deskripsi capaian, catatan wali kelas ----------
ok((await req('gb', `/api/lms/mapel/${m1}/deskripsi`)).status === 404, 'guru mapel lain tidak bisa membuka deskripsi rapor mapel ini');
ok((await req('a', `/api/lms/mapel/${m1}/deskripsi`)).status === 404, 'siswa tidak bisa membuka deskripsi rapor');
r = await req('ga', `/api/lms/mapel/${m1}/deskripsi`);
const dA = r.body.siswa?.find((x) => x.siswa.id === sa);
ok(r.status === 200 && dA.nilaiAkhir === 85 && dA.predikat === 'B' && dA.deskripsi === '', 'deskripsi: nilai akhir 85 = predikat B (bawaan A≥90, B≥80, C≥70)');
ok(dA.saran.startsWith('Ani menunjukkan penguasaan yang baik') && dA.saran.includes('pada UTS') && !dA.saran.includes('Biologi'), 'saran deskripsi otomatis menyebut item terbaik (tanpa mengulang nama mapel)');
const dB = r.body.siswa.find((x) => x.siswa.id === sb);
ok(dB.predikat === 'D' && dB.saran.includes('Perlu peningkatan pada Laporan'), 'saran deskripsi siswa B menyebut yang perlu ditingkatkan');
ok((await put('ga', `/api/lms/mapel/${m1}/deskripsi`, { data: [{ userId: 999999, deskripsi: 'x' }] })).status === 400, 'siswa di luar kelas ditolak');
ok((await put('ga', `/api/lms/mapel/${m1}/deskripsi`, { data: [{ userId: sa, deskripsi: 'Ani menguasai sistem organ dengan baik.' }] })).status === 200, 'guru menyimpan deskripsi capaian');
r = await req('admin', `/api/lms/rapor?kelas=${kelasRow.id}`);
let nA = r.body.rapor.find((x) => x.siswa.id === sa).nilai.find((n) => n.mapelId === m1);
ok(nA.predikat === 'B' && nA.deskripsi === 'Ani menguasai sistem organ dengan baik.' && r.body.batasPredikat.A === 90, 'rapor memuat predikat & deskripsi capaian');
ok((await req('a', '/api/lms/rapor')).body.rapor[0].nilai.find((n) => n.mapelId === m1).deskripsi.startsWith('Ani menguasai'), 'siswa melihat deskripsi capaian di rapornya');
await put('ga', `/api/lms/mapel/${m1}/deskripsi`, { data: [{ userId: sa, deskripsi: '' }] });
ok((await req('ga', `/api/lms/mapel/${m1}/deskripsi`)).body.siswa.find((x) => x.siswa.id === sa).deskripsi === '', 'deskripsi kosong = dihapus');

ok((await put('admin', '/api/admin/instansi', { predikatA: '70', predikatB: '80', predikatC: '60' })).status === 400, 'batas predikat harus menurun');
ok((await put('admin', '/api/admin/instansi', { predikatA: '101', predikatB: '80', predikatC: '60' })).status === 400, 'batas predikat maksimal 100');
ok((await put('admin', '/api/admin/instansi', { predikatA: '85', predikatB: '75', predikatC: '60' })).status === 200, 'admin mengubah batas predikat');
r = await req('admin', `/api/lms/rapor?kelas=${kelasRow.id}`);
ok(r.body.rapor.find((x) => x.siswa.id === sa).nilai.find((n) => n.mapelId === m1).predikat === 'A' && r.body.rapor.find((x) => x.siswa.id === sb).nilai.find((n) => n.mapelId === m1).predikat === 'C', 'predikat mengikuti batas baru (85 = A, 65 = C)');
await put('admin', '/api/admin/instansi', { predikatA: '90', predikatB: '80', predikatC: '70' });

ok((await put('a', '/api/lms/rapor', { siswa: sa, catatan: 'x' })).status === 403, 'siswa tidak bisa menulis catatan wali kelas');
ok((await put('gc', '/api/lms/rapor', { siswa: sa, catatan: 'x' })).status === 404, 'guru yang tidak terkait kelas tidak bisa menulis catatan');
ok((await put('gw', '/api/lms/rapor', { siswa: sa, catatan: 'Pertahankan semangat belajar.' })).status === 200, 'wali kelas menulis catatan rapor');
r = await req('a', '/api/lms/rapor');
ok(r.body.rapor[0].catatan === 'Pertahankan semangat belajar.', 'catatan wali kelas tampil di rapor siswa');

// ---------- Semester ----------
const TA = `${2080 + (t % 9)}/${2081 + (t % 9)}`;
const semBaru = (await post('admin', '/api/admin/semester', { tahunAjaran: TA, semester: 'Genap' })).body.data.id;
r = await req('admin', `/api/lms/rapor?kelas=${kelasRow.id}&semester=${semBaru}`);
ok(r.body.semester.id === semBaru && r.body.rapor.every((x) => x.rataRata === null), 'rapor semester lain kosong (nilai per semester)');
await req('admin', `/api/admin/semester?id=${semBaru}`, { method: 'DELETE' });
