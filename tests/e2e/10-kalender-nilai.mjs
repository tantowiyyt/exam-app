// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// LMS: kalender, bobot nilai akhir per kategori + KKM, rubrik penilaian tugas.
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
const hari = (n) => new Date(Date.now() + n * 86400000).toISOString();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

const guru = (await post('admin', '/api/admin/akun', { username: `gn-${t}`, nama: 'Guru Nilai', password: 'guru1234', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `gn2-${t}`, nama: 'Guru Lain', password: 'guru1234', role: 'GURU' });
const KLS = `KN-${t}`;
const sa = (await post('admin', '/api/admin/peserta', { nomorPeserta: `na-${t}`, nama: 'Ani', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sb = (await post('admin', '/api/admin/peserta', { nomorPeserta: `nb-${t}`, nama: 'Budi', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelasId = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === KLS).id;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId, nama: 'Bahasa', guruId: guru })).body.data.id;
const mapel2 = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId, nama: 'Seni', guruId: guru })).body.data.id;
await login('g', `gn-${t}`, 'guru1234');
await login('g2', `gn2-${t}`, 'guru1234');
await login('a', `na-${t}`, 'siswa123');
await login('b', `nb-${t}`, 'siswa123');

// ---------- Rubrik ----------
let r = await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'x', rubrik: [{ kriteria: '', maks: 10 }] });
ok(r.status === 400, 'kriteria rubrik tanpa nama ditolak');
ok((await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'x', rubrik: [{ kriteria: 'Isi', maks: 0 }] })).status === 400, 'skor maksimal kriteria 0 ditolak');
r = await post('g', '/api/lms/tugas', {
  mapelId: mapel, judul: 'Esai Argumentasi', nilaiMaks: 100, tenggat: hari(3),
  rubrik: [{ kriteria: 'Isi & argumen', deskripsi: 'Argumen logis', maks: 30 }, { kriteria: 'Bahasa', maks: 20 }],
});
ok(r.status === 200 && r.body.data.nilaiMaks === 50, 'tugas dengan rubrik: nilai maksimal = jumlah skor kriteria (50)');
const tR = r.body.data.id;
r = await req('a', `/api/lms/tugas/${tR}`);
ok(r.body.tugas.rubrik.length === 2 && r.body.tugas.rubrik[0].kriteria === 'Isi & argumen', 'siswa melihat rubrik penilaian');
const kA = (await post('a', '/api/lms/pengumpulan', { tugasId: tR, jawaban: 'Esai saya' })).body.data.id;
ok((await put('g', '/api/lms/pengumpulan', { id: kA, rubrik: [31, 10] })).status === 400, 'skor kriteria melebihi maksimal ditolak');
ok((await put('g', '/api/lms/pengumpulan', { id: kA, rubrik: [30] })).status === 400, 'skor rubrik harus lengkap');
r = await put('g', '/api/lms/pengumpulan', { id: kA, rubrik: [30, 10], catatanGuru: 'Bahasa perlu dirapikan' });
ok(r.status === 200 && r.body.data.nilai === 40, 'guru menilai dengan rubrik: nilai = 30 + 10 = 40');
r = await req('a', `/api/lms/tugas/${tR}`);
ok(r.body.pengumpulan.nilaiRubrik.join() === '30,10', 'siswa melihat skor per kriteria');
r = await post('g', '/api/lms/tugas', { salinDari: tR, mapelIds: [mapel2] });
ok(r.status === 200 && JSON.parse(r.body.data[0].rubrik).length === 2 && r.body.data[0].nilaiMaks === 50, 'salin tugas ikut menyalin rubrik');

// ---------- Kuis & presensi untuk nilai akhir ----------
const kz = (await post('g', '/api/lms/kuis', { mapelId: mapel, judul: 'Kuis Majas', selesai: hari(2), mulai: hari(-1) })).body.data;
await put('g', `/api/lms/kuis/${kz.id}/soal`, { soal: [{ tipe: 'bs', pertanyaan: 'Personifikasi adalah majas', kunci: 'B' }] });
await put('g', '/api/lms/kuis', { ...kz, terbit: true });
const sKuis = (await post('a', `/api/lms/kuis/${kz.id}/kerjakan`, { aksi: 'mulai' })).body.soal[0].id;
await post('a', `/api/lms/kuis/${kz.id}/kerjakan`, { aksi: 'selesai', jawaban: { [sKuis]: 'B' } });
const ps1 = (await post('g', '/api/lms/presensi', { mapelId: mapel, judul: 'P1', tanggal: hari(-2) })).body.data.id;
const ps2 = (await post('g', '/api/lms/presensi', { mapelId: mapel, judul: 'P2', tanggal: hari(-1) })).body.data.id;
await put('g', '/api/lms/presensi', { aksi: 'isi', id: ps1, data: [{ userId: sa, status: 'H' }, { userId: sb, status: 'A' }] });
await put('g', '/api/lms/presensi', { aksi: 'isi', id: ps2, data: [{ userId: sa, status: 'S' }] });

r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
let bA = r.body.baris.find((b) => b.siswa.id === sa);
ok(r.body.pengaturan.berbobot === false && bA.rataRata === 90, 'tanpa bobot: rata-rata biasa (tugas 80, kuis 100 -> 90)');
ok(bA.komponen.tugas === 80 && bA.komponen.kuis === 100 && bA.komponen.presensi === 50 && bA.komponen.ujian === null, 'komponen per kategori (presensi 50%)');

// ---------- Bobot & KKM ----------
ok((await put('g2', `/api/lms/mapel/${mapel}`, { bobotTugas: 50 })).status === 404, 'guru lain tidak bisa mengatur bobot');
ok((await put('a', `/api/lms/mapel/${mapel}`, { bobotTugas: 50 })).status === 404, 'siswa tidak bisa mengatur bobot');
ok((await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 150 })).status === 400, 'bobot di atas 100 ditolak');
r = await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 50, bobotKuis: 30, bobotUjian: 0, bobotPresensi: 20, kkm: 75 });
ok(r.status === 200 && r.body.data.kkm === 75, 'guru mengatur bobot (tugas 50, kuis 30, presensi 20) & KKM 75');
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
bA = r.body.baris.find((b) => b.siswa.id === sa);
const bB = r.body.baris.find((b) => b.siswa.id === sb);
// (80*50 + 100*30 + 50*20) / 100 = 80
ok(r.body.pengaturan.berbobot && bA.rataRata === 80 && bA.tuntas === true, 'nilai akhir berbobot Ani 80 -> tuntas');
// Budi: hanya presensi yang punya nilai (0%)
ok(bB.rataRata === 0 && bB.tuntas === false, 'Budi: nilai akhir 0 (hanya presensi) -> belum tuntas');
ok(r.body.ringkasan.tuntas === 1, 'ringkasan jumlah siswa tuntas');
r = await req('a', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.length === 1 && r.body.baris[0].rataRata === 80 && r.body.pengaturan.kkm === 75, 'siswa melihat nilai akhir & KKM');
await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, kkm: 0 });
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.find((b) => b.siswa.id === sa).rataRata === 90 && r.body.baris.find((b) => b.siswa.id === sa).tuntas === null, 'bobot dikosongkan: kembali rata-rata biasa, KKM tidak dipakai');

// Revisi mengosongkan skor rubrik
await put('g', '/api/lms/pengumpulan', { id: kA, aksi: 'revisi', catatanGuru: 'Perbaiki paragraf 2' });
r = await req('a', `/api/lms/tugas/${tR}`);
ok(r.body.pengumpulan.nilai === null && r.body.pengumpulan.nilaiRubrik.length === 0, 'minta revisi mengosongkan skor rubrik');

// ---------- Kalender ----------
ok((await req('a', '/api/lms/kalender?dari=x&sampai=y')).status === 400, 'kalender: rentang tidak valid ditolak');
ok((await req('a', `/api/lms/kalender?dari=${hari(-10)}&sampai=${hari(100)}`)).status === 400, 'kalender: rentang lebih dari 62 hari ditolak');
const tB = (await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'Khusus Budi', tenggat: hari(4), untukSiswa: [sb] })).body.data.id;
await post('g', '/api/lms/materi', { mapelId: mapel, judul: 'Materi Nanti', terbitPada: hari(5) });
r = await req('a', `/api/lms/kalender?dari=${hari(-5)}&sampai=${hari(20)}`);
const acA = r.body.acara;
ok(r.status === 200 && acA.some((x) => x.jenis === 'tugas' && x.id === `t${tR}`), 'kalender siswa: tenggat tugas');
ok(acA.some((x) => x.id === `qs${kz.id}` && x.selesai === true) && acA.some((x) => x.id === `qm${kz.id}`), 'kalender siswa: kuis dibuka & ditutup (sudah dikerjakan)');
ok(acA.some((x) => x.jenis === 'presensi' && x.id === `p${ps1}` && x.selesai === true), 'kalender siswa: pertemuan presensi');
ok(!acA.some((x) => x.id === `t${tB}`), 'kalender siswa: tugas siswa lain tidak tampil');
ok(!acA.some((x) => x.jenis === 'terbit'), 'kalender siswa: tidak melihat jadwal terbit');
ok(acA.every((x, i) => i === 0 || new Date(acA[i - 1].waktu) <= new Date(x.waktu)), 'kalender terurut menurut waktu');
r = await req('g', `/api/lms/kalender?dari=${hari(-5)}&sampai=${hari(20)}`);
ok(r.body.acara.some((x) => x.id === `t${tB}`) && r.body.acara.some((x) => x.jenis === 'terbit' && x.judul.includes('Materi Nanti')), 'kalender guru: semua tugas + jadwal terbit');
r = await req('g2', `/api/lms/kalender?dari=${hari(-5)}&sampai=${hari(20)}`);
ok(r.status === 200 && !r.body.acara.some((x) => x.id === `t${tR}`), 'kalender guru lain tidak memuat mapel ini');
