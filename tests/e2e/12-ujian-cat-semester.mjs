// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// Semester aktif & ujian per mapel (UH/UTS/UAS) dengan pelaksanaan CAT: token, satu kesempatan, pelanggaran,
// monitoring guru (tambah waktu, kumpulkan, reset), nilai diumumkan, rekap & bobot per jenis ujian.
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

const guru = (await post('admin', '/api/admin/akun', { username: `gc-${t}`, nama: 'Guru CAT', password: 'guru1234', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `gc2-${t}`, nama: 'Guru Lain', password: 'guru1234', role: 'GURU' });
const KLS = `KC-${t}`;
const sid = {};
for (const n of ['a', 'b', 'c', 'd']) sid[n] = (await post('admin', '/api/admin/peserta', { nomorPeserta: `c${n}-${t}`, nama: `Siswa ${n.toUpperCase()}`, password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.find((k) => k.nama === KLS).id, nama: 'Fisika', guruId: guru })).body.data.id;
await login('g', `gc-${t}`, 'guru1234');
await login('g2', `gc2-${t}`, 'guru1234');
for (const n of ['a', 'b', 'c', 'd']) await login(n, `c${n}-${t}`, 'siswa123');

// ================= Semester =================
let r = await req('admin', '/api/admin/semester');
const semAwal = r.body.semester?.find((s) => s.aktif);
ok(r.status === 200 && semAwal && /^\d{4}\/\d{4} (Ganjil|Genap)$/.test(semAwal.label), 'semester aktif tersedia (dibuat otomatis bila belum ada)');
ok((await req('g', '/api/admin/semester')).status === 403, 'guru tidak bisa mengelola semester');
ok((await post('admin', '/api/admin/semester', { tahunAjaran: '2030-2031', semester: 'Ganjil' })).status === 400, 'format tahun ajaran salah ditolak');
ok((await post('admin', '/api/admin/semester', { tahunAjaran: '2030/2032', semester: 'Ganjil' })).status === 400, 'tahun ajaran harus berurutan');
ok((await post('admin', '/api/admin/semester', { tahunAjaran: '2030/2031', semester: 'Tengah' })).status === 400, 'nama semester harus Ganjil/Genap');
const TA = `${2090 + (t % 9)}/${2091 + (t % 9)}`;
r = await post('admin', '/api/admin/semester', { tahunAjaran: TA, semester: 'Ganjil' });
ok(r.status === 200 && r.body.data.aktif === false, 'admin menambah semester (belum aktif)');
const semBaru = r.body.data.id;
ok((await post('admin', '/api/admin/semester', { tahunAjaran: TA, semester: 'Ganjil' })).status === 400, 'semester ganda ditolak');

// Data dibuat di semester aktif
r = await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'Tugas Semester Lama', terbit: true });
const tugasLama = r.body.data.id;
ok(r.status === 200 && r.body.data.semesterId === semAwal.id, 'tugas baru tercatat di semester aktif');
r = await req('g', `/api/lms/mapel/${mapel}`);
ok(r.body.semester.id === semAwal.id && r.body.tugas.some((x) => x.id === tugasLama) && r.body.daftarSemester.length >= 2, 'halaman mapel menampilkan semester aktif & daftar semester');

// Ganti semester aktif
ok((await put('admin', '/api/admin/semester', { id: semBaru })).status === 200, 'admin mengaktifkan semester baru');
r = await req('g', `/api/lms/mapel/${mapel}`);
ok(r.body.semester.id === semBaru && !r.body.tugas.some((x) => x.id === tugasLama), 'tugas semester lama tidak tampil di semester baru');
r = await req('g', `/api/lms/mapel/${mapel}?semester=${semAwal.id}`);
ok(r.body.semester.id === semAwal.id && r.body.tugas.some((x) => x.id === tugasLama), 'semester lama tetap bisa dilihat (?semester=)');
r = await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'Tugas Semester Baru', terbit: true });
ok(r.body.data.semesterId === semBaru, 'tugas berikutnya tercatat di semester baru');
r = await req('a', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.semester.id === semBaru && !r.body.kolom.some((k) => k.id === tugasLama && k.jenis === 'tugas'), 'rekap nilai mengikuti semester');
ok((await del('admin', `/api/admin/semester?id=${semBaru}`)).status === 400, 'semester aktif tidak bisa dihapus');
ok((await del('admin', `/api/admin/semester?id=${semAwal.id}`)).status === 400, 'semester berisi data tidak bisa dihapus');

// ================= Ujian CAT per mapel =================
const mulai = new Date(Date.now() - 60_000).toISOString();
const selesai = new Date(Date.now() + 2 * 3600_000).toISOString();
ok((await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'x', jenis: 'UJIAN', mode: 'cat' })).status === 400, 'jenis ujian tidak dikenal ditolak');
ok((await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'x', mode: 'cat', durasiMenit: 0 })).status === 400, 'durasi ujian CAT minimal 1 menit');
r = await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'UTS Fisika', jenis: 'UTS', mode: 'cat', mulai, selesai, durasiMenit: 60, keterangan: 'Bab 1-4' });
ok(r.status === 200 && r.body.data.mode === 'cat' && r.body.data.jenis === 'UTS' && r.body.data.kuisId && r.body.data.semesterId === semBaru, 'guru membuat UTS dengan pelaksanaan CAT');
const uts = r.body.data.id;
const kz = r.body.data.kuisId;
r = await req('g', `/api/lms/kuis/${kz}`);
ok(r.body.kuis.modeUjian && /^[A-Z2-9]{6}$/.test(r.body.kuis.token) && r.body.kuis.maksPercobaan === 1 && !r.body.kuis.terbit, 'kuis ujian: mode ujian, token acak, 1 kesempatan, draf');
let token = r.body.kuis.token;
ok(!(await req('g', `/api/lms/mapel/${mapel}`)).body.kuis.some((k) => k.id === kz), 'kuis ujian tidak tampil di tab Kuis');
ok((await del('g', `/api/lms/kuis?id=${kz}`)).status === 400, 'kuis ujian tidak bisa dihapus dari halaman kuis');

const soal = [
  { tipe: 'pg', pertanyaan: '1 + 1 = ?', opsi: ['1', '2', '3'], kunci: 1, bobot: 1 },
  { tipe: 'bs', pertanyaan: 'Bumi bulat.', kunci: 'B', bobot: 1 },
];
ok((await put('g', `/api/lms/kuis/${kz}/soal`, { soal })).status === 200, 'guru menyusun soal ujian');
r = await put('g', '/api/lms/kuis', { id: kz, judul: 'UTS Fisika', durasiMenit: 60, mulai, selesai, maksPercobaan: 3, terbit: true });
ok(r.status === 200 && r.body.data.terbit && r.body.data.maksPercobaan === 1, 'ujian diterbitkan; kesempatan tetap 1 walau diminta 3');

// Siswa
r = await req('a', `/api/lms/kuis/${kz}`);
ok(r.status === 200 && r.body.kuis.token === undefined && r.body.kuis.perluToken === true, 'token tidak terkirim ke siswa');
r = await req('a', `/api/lms/ujian-manual?mapelId=${mapel}`);
const ujA = r.body.ujian.find((u) => u.id === uts);
ok(ujA?.mode === 'cat' && ujA.status === 'belum' && ujA.kuis.id === kz && ujA.saya === null, 'siswa melihat UTS CAT di tab Ujian');
ok((await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' })).status === 403, 'mulai tanpa token ditolak');
ok((await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai', token: 'SALAH9' })).status === 403, 'token salah ditolak');
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai', token: ` ${token.toLowerCase()} ` });
ok(r.status === 200 && r.body.modeUjian === true && r.body.soal.length === 2 && r.body.maksPelanggaran === 5, 'token benar (tidak peka huruf besar/spasi) -> soal ujian');
const batasAwal = new Date(r.body.percobaan.batas).getTime();
const [s1, s2] = r.body.soal;
const jawab = { [s1.id]: s1.tipe === 'pg' ? '1' : 'B', [s2.id]: s2.tipe === 'pg' ? '1' : 'B' };
await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'simpan', jawaban: { [s1.id]: jawab[s1.id] } });
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'pelanggaran' });
ok(r.status === 200 && r.body.pelanggaran === 1 && !r.body.selesai, 'pelanggaran tercatat (1)');
await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'pelanggaran' });

// Monitoring guru
ok((await req('g2', `/api/lms/kuis/${kz}/monitor`)).status === 404, 'guru lain tidak bisa memantau');
ok((await req('a', `/api/lms/kuis/${kz}/monitor`)).status === 404, 'siswa tidak bisa memantau');
r = await req('g', `/api/lms/kuis/${kz}/monitor`);
const ma = r.body.siswa?.find((x) => x.siswa.id === sid.a);
ok(r.status === 200 && ma.status === 'mengerjakan' && ma.terjawab === 1 && ma.pelanggaran === 2 && ma.sisaMs > 0 && r.body.jumlahSoal === 2, 'monitor: status, terjawab, pelanggaran, sisa waktu');
ok(r.body.ringkasan.mengerjakan === 1 && r.body.ringkasan.belum === 3, 'monitor: ringkasan kelas');
ok((await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'tambahWaktu', userId: sid.a, menit: 0 })).status === 400, 'tambahan waktu 0 ditolak');
ok((await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'tambahWaktu', userId: sid.b, menit: 5 })).status === 409, 'tambah waktu siswa yang belum mulai ditolak');
ok((await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'tambahWaktu', userId: sid.a, menit: 10 })).status === 200, 'guru menambah waktu 10 menit');
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' });
ok(r.status === 200 && new Date(r.body.percobaan.batas).getTime() - batasAwal === 10 * 60000, 'batas waktu siswa bertambah 10 menit (lanjut tanpa token lagi)');

// Selesai: nilai disembunyikan sampai diumumkan
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'selesai', jawaban: jawab });
ok(r.status === 200 && r.body.data.nilai === null, 'setelah mengumpulkan, nilai belum terlihat siswa');
const pa = r.body.data.id;
r = await req('a', `/api/lms/kuis/${kz}`);
ok(r.body.terbaik === null && r.body.hasilDiumumkan === false && r.body.percobaan.every((p) => p.nilai === null), 'halaman kuis siswa menyembunyikan nilai');
ok((await req('a', `/api/lms/percobaan/${pa}`)).status === 403, 'rincian jawaban terkunci sebelum diumumkan');
ok((await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai', token })).status === 409, 'ujian hanya bisa dikerjakan sekali');

// Rekap guru: kolom UTS dari hasil CAT
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
const kol = r.body.kolom.find((k) => k.kunci === `m${uts}`);
const brA = r.body.baris.find((b) => b.siswa.id === sid.a);
ok(kol?.jenisUjian === 'UTS' && kol.mode === 'cat' && brA.nilai[`m${uts}`] === 100 && brA.komponen.uts === 100, 'rekap guru: nilai UTS dari hasil CAT masuk komponen UTS');
r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
const ujG = r.body.ujian.find((u) => u.id === uts);
ok(ujG.nilai.length === 1 && ujG.hasil.selesai === 1 && ujG.kuis.jumlahSoal === 2, 'tab Ujian guru: hasil CAT terhitung');
ok((await put('g', '/api/lms/ujian-manual', { id: uts, aksi: 'nilai', data: [{ userId: sid.b, nilai: 50 }] })).status === 400, 'nilai ujian CAT tidak bisa diisi manual');
ok((await put('g', '/api/lms/ujian-manual', { id: uts, judul: 'UTS Fisika', mode: 'offline' })).status === 400, 'cara pelaksanaan tidak bisa diubah');

// Umumkan
ok((await put('g', '/api/lms/ujian-manual', { id: uts, terbit: true })).status === 200, 'guru mengumumkan nilai UTS');
r = await req('a', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.body.ujian.find((u) => u.id === uts).saya?.nilai === 100, 'siswa melihat nilai UTS setelah diumumkan');
ok((await req('a', `/api/lms/percobaan/${pa}`)).status === 200, 'rincian jawaban terbuka setelah diumumkan');
r = await req('a', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris[0].nilai[`m${uts}`] === 100, 'rekap siswa memuat UTS');

// Batas pelanggaran -> kumpul otomatis
ok((await put('g', '/api/lms/kuis', { id: kz, judul: 'UTS Fisika', durasiMenit: 60, mulai, selesai, terbit: true, maksPelanggaran: 2 })).status === 200, 'guru mengatur batas pelanggaran 2');
await post('b', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai', token });
await post('b', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'pelanggaran' });
r = await post('b', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'pelanggaran' });
ok(r.body.selesai === true && r.body.pelanggaran === 2, 'pelanggaran ke-2 = jawaban dikumpulkan otomatis');
r = await req('g', `/api/lms/kuis/${kz}/monitor`);
ok(r.body.siswa.find((x) => x.siswa.id === sid.b).status === 'selesai', 'monitor: siswa B selesai otomatis');
// Reset -> boleh mengulang
ok((await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'reset', userId: sid.b })).status === 200, 'guru mereset ujian siswa B');
ok((await post('b', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai', token })).status === 200, 'siswa B bisa mengerjakan ulang setelah direset');
// Kumpulkan paksa
ok((await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'kumpulkan', userId: sid.b })).status === 200, 'guru mengumpulkan paksa jawaban siswa B');
r = await req('g', `/api/lms/kuis/${kz}/monitor`);
ok(r.body.siswa.find((x) => x.siswa.id === sid.b).status === 'selesai', 'monitor: siswa B selesai');
// Token
r = await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'gantiToken' });
ok(r.status === 200 && r.body.token && r.body.token !== token, 'guru mengganti token');
ok((await post('c', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai', token })).status === 403, 'token lama tidak berlaku');
await post('g', `/api/lms/kuis/${kz}/monitor`, { aksi: 'hapusToken' });
ok((await post('c', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' })).status === 200, 'tanpa token: siswa bisa langsung mulai');
ok((await post('c', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'pelanggaran' })).status === 200, 'aksi pelanggaran berjalan');
ok((await post('a', '/api/lms/kuis/999999/kerjakan', { aksi: 'pelanggaran' })).status === 404, 'kuis tidak dikenal ditolak');

// UH offline + bobot per jenis
r = await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'UH 1', jenis: 'UH', mode: 'offline', nilaiMaks: 100 });
const uh = r.body.data.id;
ok(r.status === 200 && r.body.data.jenis === 'UH' && !r.body.data.kuisId, 'guru membuat UH offline');
await put('g', '/api/lms/ujian-manual', { id: uh, aksi: 'nilai', data: [{ userId: sid.a, nilai: 60 }] });
ok((await put('g', `/api/lms/mapel/${mapel}`, { bobotUH: 101 })).status === 400, 'bobot UH di atas 100 ditolak');
ok((await put('g', `/api/lms/mapel/${mapel}`, { bobotTugas: 0, bobotKuis: 0, bobotUjian: 0, bobotPresensi: 0, bobotUH: 40, bobotUTS: 60, bobotUAS: 0, kkm: 75 })).status === 200, 'guru mengatur bobot UH 40 / UTS 60');
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
const brA2 = r.body.baris.find((b) => b.siswa.id === sid.a);
ok(brA2.komponen.uh === 60 && brA2.komponen.uts === 100 && brA2.rataRata === 84 && brA2.tuntas === true, 'nilai akhir berbobot: 60×40% + 100×60% = 84, tuntas');
ok(r.body.pengaturan.uh === 40 && r.body.pengaturan.uts === 60, 'pengaturan bobot per jenis ujian tersimpan');

// Kalender & agenda menyebut ujian
r = await req('c', `/api/lms/kalender?dari=${new Date(Date.now() - 86400000).toISOString()}&sampai=${new Date(Date.now() + 86400000).toISOString()}`);
ok(r.body.acara.some((a) => a.jenis === 'ujian' && a.judul.includes('UTS Fisika')), 'kalender menampilkan jadwal ujian CAT mapel');
r = await req('d', '/api/lms/kelas');
ok(r.body.agenda.some((a) => a.id === kz && a.ujian === true), 'agenda siswa menandai ujian CAT');

// Backup memuat semester & data ujian
r = await req('admin', '/api/admin/backup');
ok(r.body.data.semester?.some((s) => s.id === semBaru) && r.body.data.kuis.some((k) => k.id === kz && k.modeUjian), 'backup memuat semester & kuis ujian');

// Hapus ujian CAT -> kuis ujian ikut terhapus
ok((await del('g2', `/api/lms/ujian-manual?id=${uts}`)).status === 404, 'guru lain tidak bisa menghapus ujian');
ok((await del('g', `/api/lms/ujian-manual?id=${uts}`)).status === 200, 'guru menghapus UTS CAT');
ok((await req('g', `/api/lms/kuis/${kz}`)).status === 404, 'kuis ujian & jawabannya ikut terhapus');
await del('g', `/api/lms/ujian-manual?id=${uh}`);

// Kembalikan semester aktif semula; semester kosong bisa dihapus
ok((await put('admin', '/api/admin/semester', { id: semAwal.id })).status === 200, 'admin mengaktifkan kembali semester semula');
r = await post('admin', '/api/admin/semester', { tahunAjaran: TA, semester: 'Genap' });
ok((await del('admin', `/api/admin/semester?id=${r.body.data.id}`)).status === 200, 'semester kosong & tidak aktif bisa dihapus');
