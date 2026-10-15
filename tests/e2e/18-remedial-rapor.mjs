// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// Phase 22: remedial / pengayaan / susulan (tugas, ujian offline, ujian CAT) & aturan nilai yang masuk rapor;
// data rapor lengkap (ekstrakurikuler, prestasi, kokurikuler, ketidakhadiran, keputusan naik kelas).
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

const guru = async (nama) => (await post('admin', '/api/admin/akun', { username: `${nama}-${t}`, nama: `${nama} ${t}`, password: 'guru12345', role: 'GURU' })).body.data.id;
const gM = await guru('rmg');
const gW = await guru('rmw');
const gL = await guru('rml');
const K = `RM-${t}`;
const sis = {};
for (const n of ['ana', 'beni', 'caca']) sis[n] = (await post('admin', '/api/admin/peserta', { nomorPeserta: `rm-${n}-${t}`, nama: n, password: 'siswa123', kelas: K })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === K);
await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: kelas.id, nama: K, keterangan: '', waliId: gW });
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.id, nama: 'Sejarah', guruId: gM })).body.data.id;
await login('g', `rmg-${t}`, 'guru12345');
await login('w', `rmw-${t}`, 'guru12345');
await login('l', `rml-${t}`, 'guru12345');
for (const n of Object.keys(sis)) await login(n, `rm-${n}-${t}`, 'siswa123');
await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, bobotUH: 0, bobotUTS: 0, bobotUAS: 0, kkm: 75 });

// ---------- Tugas induk: ana 60, beni 90, caca tidak mengumpulkan (lewat tenggat = 0) ----------
let r = await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'Esai Kemerdekaan', nilaiMaks: 100, tenggat: new Date(Date.now() + 3600000).toISOString() });
const tg = r.body.data.id;
const kumpul = async (who, tugasId) => (await post(who, '/api/lms/pengumpulan', { tugasId, jawaban: `jawaban ${who}` })).body.data.id;
const nilai = (id, n) => put('g', '/api/lms/pengumpulan', { id, nilai: n });
await nilai(await kumpul('ana', tg), 60);
await nilai(await kumpul('beni', tg), 90);
// Tenggat dimundurkan supaya caca dihitung 0
await put('g', '/api/lms/tugas', { id: tg, judul: 'Esai Kemerdekaan', nilaiMaks: 100, tenggat: new Date(Date.now() - 3600000).toISOString() });
const rekap = async () => (await req('g', `/api/lms/mapel/${mapel}/nilai`)).body;
const baris = (d, n) => d.baris.find((b) => b.siswa.id === sis[n]);
r = await rekap();
ok(baris(r, 'ana').komponen.tugas === 60 && baris(r, 'caca').komponen.tugas === 0, 'rekap awal: ana 60, caca 0 (lewat tenggat)');
ok(r.pengaturan.aturanRemedial === 'maksKkm', 'aturan remedial bawaan: tertinggi dibatasi KKM');

// ---------- Validasi ----------
ok((await post('g', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'ulang', siswa: [sis.ana] })).status === 400, 'jenis susulan tidak dikenal ditolak');
ok((await post('g', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'remedial', siswa: [] })).status === 400, 'tanpa siswa ditolak');
ok((await post('g', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'remedial', siswa: [999999999] })).status === 400, 'siswa di luar kelas ditolak');
ok((await post('l', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'remedial', siswa: [sis.ana] })).status === 403, 'guru lain tidak bisa membuat remedial');
ok((await post('ana', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'remedial', siswa: [sis.ana] })).status === 403, 'siswa tidak bisa membuat remedial');
ok((await post('g', '/api/lms/susulan', { kunci: 'x1', tipe: 'remedial', siswa: [sis.ana] })).status === 400, 'kunci induk tidak valid ditolak');

// ---------- Remedial tugas ----------
r = await post('g', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'remedial', siswa: [sis.ana], tenggat: new Date(Date.now() + 86400000).toISOString() });
ok(r.status === 200 && r.body.data.jenis === 'tugas', 'guru membuat tugas remedial untuk ana');
const tgRem = r.body.data.id;
ok((await post('g', '/api/lms/susulan', { kunci: `t${tgRem}`, tipe: 'remedial', siswa: [sis.ana] })).status === 400, 'tidak bisa membuat remedial dari tugas remedial');
r = await req('ana', `/api/lms/mapel/${mapel}`);
ok(r.body.tugas.some((x) => x.id === tgRem && x.tipeSusulan === 'remedial'), 'ana melihat tugas remedial');
r = await req('beni', `/api/lms/mapel/${mapel}`);
ok(!r.body.tugas.some((x) => x.id === tgRem), 'beni tidak melihat tugas remedial ana');
ok((await post('beni', '/api/lms/pengumpulan', { tugasId: tgRem, jawaban: 'x' })).status === 404, 'beni tidak bisa mengumpulkan tugas remedial ana');
await nilai(await kumpul('ana', tgRem), 85);
r = await rekap();
const kolRem = r.kolom.find((k) => k.kunci === `t${tgRem}`);
ok(kolRem?.turunan?.tipe === 'remedial' && kolRem.turunan.induk === `t${tg}`, 'kolom remedial ditandai turunan dari tugas induk');
ok(baris(r, 'ana').komponen.tugas === 75 && baris(r, 'ana').akhir[`t${tg}`] === 75, 'remedial 85 → nilai dipakai 75 (dibatasi KKM), tidak dihitung dua kali');
ok(baris(r, 'beni').nilai[`t${tgRem}`] === 'na', 'tugas remedial n/a untuk siswa lain');
await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, bobotUH: 0, bobotUTS: 0, bobotUAS: 0, kkm: 75, aturanRemedial: 'maks' });
ok(baris(await rekap(), 'ana').komponen.tugas === 85, 'aturan "tertinggi": nilai remedial 85 dipakai');
ok((await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, bobotUH: 0, bobotUTS: 0, bobotUAS: 0, kkm: 75, aturanRemedial: 'acak' })).status === 400, 'aturan remedial tidak dikenal ditolak');

// ---------- Susulan & pengayaan tugas ----------
r = await post('g', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'susulan', siswa: [sis.caca], judul: 'Esai susulan' });
const tgSus = r.body.data.id;
await nilai(await kumpul('caca', tgSus), 70);
r = await post('g', '/api/lms/susulan', { kunci: `t${tg}`, tipe: 'pengayaan', siswa: [sis.beni] });
await nilai(await kumpul('beni', r.body.data.id), 100);
r = await rekap();
ok(baris(r, 'caca').komponen.tugas === 70 && baris(r, 'caca').akhir[`t${tg}`] === 70, 'susulan 70 mengganti nilai 0 (lewat tenggat)');
ok(baris(r, 'beni').komponen.tugas === 90 && baris(r, 'beni').akhir[`t${tg}`] === undefined, 'pengayaan tidak mengubah nilai');
r = await req('ana', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.length === 1 && r.body.baris[0].akhir[`t${tg}`] === 85, 'siswa melihat nilai akhir setelah remedial');

// ---------- Remedial ujian offline ----------
r = await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'UTS Sejarah', jenis: 'UTS', mode: 'offline', nilaiMaks: 100 });
const uts = r.body.data.id;
await put('g', '/api/lms/ujian-manual', { id: uts, aksi: 'nilai', data: [{ userId: sis.ana, nilai: 50 }, { userId: sis.beni, nilai: 95 }] });
r = await post('g', '/api/lms/susulan', { kunci: `m${uts}`, tipe: 'remedial', siswa: [sis.ana] });
ok(r.status === 200 && r.body.data.jenis === 'ujian', 'guru membuat ujian remedial');
const utsRem = r.body.data.id;
ok((await put('g', '/api/lms/ujian-manual', { id: utsRem, aksi: 'nilai', data: [{ userId: sis.beni, nilai: 99 }] })).status === 400, 'nilai ujian remedial hanya untuk siswa yang dituju');
ok((await put('g', '/api/lms/ujian-manual', { id: utsRem, aksi: 'nilai', data: [{ userId: sis.ana, nilai: 80 }] })).status === 200, 'guru mengisi nilai ujian remedial');
await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, bobotUH: 0, bobotUTS: 0, bobotUAS: 0, kkm: 75, aturanRemedial: 'maksKkm' });
r = await rekap();
ok(baris(r, 'ana').komponen.uts === 75 && baris(r, 'ana').akhir[`m${uts}`] === 75, 'remedial UTS 80 → 75 (KKM) masuk komponen UTS');
r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
const um = r.body.ujian.find((u) => u.id === utsRem);
ok(um?.tipeSusulan === 'remedial' && um.untukSiswa.length === 1 && um.indukId === uts, 'daftar ujian guru memuat info remedial');
await put('g', '/api/lms/ujian-manual', { id: utsRem, aksi: 'umumkan' });
await put('g', '/api/lms/ujian-manual', { id: uts, aksi: 'umumkan' });
ok((await req('beni', `/api/lms/ujian-manual?mapelId=${mapel}`)).body.ujian.every((u) => u.id !== utsRem), 'siswa lain tidak melihat ujian remedial');
ok((await req('ana', `/api/lms/ujian-manual?mapelId=${mapel}`)).body.ujian.some((u) => u.id === utsRem), 'siswa yang dituju melihat ujian remedial');

// ---------- Remedial ujian CAT: soal disalin, hanya siswa yang dituju ----------
const mulai = new Date(Date.now() - 60000).toISOString();
const selesai = new Date(Date.now() + 3600000).toISOString();
r = await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'UH CAT', jenis: 'UH', mode: 'cat', mulai, selesai, durasiMenit: 30 });
const uhCat = r.body.data.id;
await put('g', `/api/lms/kuis/${r.body.data.kuisId}/soal`, { soal: [{ tipe: 'pg', pertanyaan: 'Tahun proklamasi?', opsi: ['1945', '1950'], kunci: 0, bobot: 1 }, { tipe: 'bs', pertanyaan: 'Jakarta ibu kota', kunci: 'B', bobot: 1 }] });
r = await post('g', '/api/lms/susulan', { kunci: `m${uhCat}`, tipe: 'susulan', siswa: [sis.caca] });
const catSus = (await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`)).body.ujian.find((u) => u.id === r.body.data.id);
ok(r.status === 200 && catSus?.mode === 'cat' && catSus.kuis?.jumlahSoal === 2 && catSus.kuis.terbit === false, 'ujian CAT susulan dibuat sebagai draf dengan soal disalin');
await put('g', '/api/lms/kuis', { id: catSus.kuis.id, judul: 'UH CAT susulan', terbit: true, mulai, selesai, durasiMenit: 30, maksPercobaan: 1 });
ok((await req('beni', `/api/lms/kuis/${catSus.kuis.id}`)).status === 404, 'siswa lain tidak bisa membuka kuis ujian susulan');
ok((await req('caca', `/api/lms/kuis/${catSus.kuis.id}`)).status === 200, 'siswa yang dituju bisa membuka kuis ujian susulan');

// ---------- Data rapor lengkap ----------
const dataRapor = {
  sakit: 2, izin: 1, alpa: '', ekskul: [{ nama: 'Pramuka', predikat: 'A', keterangan: 'Aktif' }, { nama: '', predikat: 'B' }],
  prestasi: [{ jenis: 'Juara 2 Lomba Pidato', keterangan: 'Tingkat kabupaten' }], kokurikuler: 'Projek kearifan lokal: sangat baik', keputusan: 'naik', keKelas: 'XI-1',
};
ok((await put('l', '/api/lms/rapor', { siswa: sis.ana, data: dataRapor })).status === 404, 'guru yang tidak mengajar kelas itu tidak bisa membuka rapor siswa');
ok((await put('g', '/api/lms/rapor', { siswa: sis.ana, data: dataRapor })).status === 403, 'guru mapel (bukan wali) tidak bisa mengisi data rapor');
ok((await put('w', '/api/lms/rapor', { siswa: sis.ana, data: { ...dataRapor, sakit: -1 } })).status === 400, 'jumlah ketidakhadiran negatif ditolak');
ok((await put('w', '/api/lms/rapor', { siswa: sis.ana, data: { ...dataRapor, keputusan: 'lompat' } })).status === 400, 'keputusan tidak dikenal ditolak');
r = await put('w', '/api/lms/rapor', { siswa: sis.ana, data: dataRapor });
ok(r.status === 200, 'wali kelas mengisi data rapor');
ok((await put('g', '/api/lms/rapor', { siswa: sis.ana, catatan: 'Catatan dari guru mapel' })).status === 200, 'guru mapel tetap bisa menulis catatan');
r = await req('w', `/api/lms/rapor?kelas=${kelas.id}`);
const rA = r.body.rapor?.find((x) => x.siswa.id === sis.ana);
ok(r.status === 200 && r.body.bisaIsiData === true, 'wali kelas boleh mengisi data rapor');
ok(rA?.lengkap.ekskul.length === 1 && rA.lengkap.ekskul[0].nama === 'Pramuka' && rA.lengkap.prestasi.length === 1, 'ekstrakurikuler (baris kosong dibuang) & prestasi tersimpan');
ok(rA.lengkap.ketidakhadiran.S === 2 && rA.lengkap.ketidakhadiran.I === 1 && rA.lengkap.ketidakhadiran.manual === true && rA.lengkap.alpa === null, 'ketidakhadiran isian wali (kosong = dari presensi)');
ok(rA.lengkap.keputusan === 'naik' && rA.lengkap.keKelas === 'XI-1' && rA.lengkap.kokurikuler.startsWith('Projek'), 'keputusan naik kelas & kokurikuler');
const nilaiSejarah = rA.nilai.find((n) => n.mapelId === mapel);
ok(nilaiSejarah.komponen.tugas === 75 && nilaiSejarah.komponen.uts === 75, 'rapor memakai nilai setelah remedial');
r = await req('g', `/api/lms/rapor?kelas=${kelas.id}`);
ok(r.status === 200 && r.body.bisaIsiData === false, 'guru mapel tidak mendapat form data rapor');
r = await req('ana', '/api/lms/rapor');
ok(r.body.rapor?.[0]?.lengkap.prestasi[0]?.jenis === 'Juara 2 Lomba Pidato', 'siswa melihat data rapor lengkapnya');
r = await req('admin', '/api/admin/backup');
ok(r.body.data?.dataRapor?.some((x) => x.userId === sis.ana), 'backup memuat data rapor');
