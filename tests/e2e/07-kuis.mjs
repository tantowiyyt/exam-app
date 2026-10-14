// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// LMS kuis per mapel: soal PG/BS/isian/esai, percobaan, waktu dari server, nilai otomatis & esai, rekap nilai, notifikasi.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await sleep(1000); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

// ---------- Persiapan: guru, kelas, mapel, siswa ----------
const guru = (await post('admin', '/api/admin/akun', { username: `gq-${t}`, nama: 'Guru Kuis', password: 'guru1234', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `gq2-${t}`, nama: 'Guru Lain', password: 'guru1234', role: 'GURU' });
const KLS = `KQ-${t}`;
const KLS2 = `KQ2-${t}`;
const sa = (await post('admin', '/api/admin/peserta', { nomorPeserta: `qa-${t}`, nama: 'Ani', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sb = (await post('admin', '/api/admin/peserta', { nomorPeserta: `qb-${t}`, nama: 'Budi', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
await post('admin', '/api/admin/peserta', { nomorPeserta: `qc-${t}`, nama: 'Cici', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS2 });
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.find((k) => k.nama === KLS).id, nama: 'IPA', guruId: guru })).body.data.id;
await login('g', `gq-${t}`, 'guru1234');
await login('g2', `gq2-${t}`, 'guru1234');
await login('a', `qa-${t}`, 'siswa123');
await login('b', `qb-${t}`, 'siswa123');
await login('c', `qc-${t}`, 'siswa123');

// ---------- Membuat kuis ----------
let r = await post('g2', '/api/lms/kuis', { mapelId: mapel, judul: 'x' });
ok(r.status === 403, 'guru lain tidak bisa membuat kuis di mapel ini');
ok((await post('g', '/api/lms/kuis', { mapelId: mapel, judul: '' })).status === 400, 'judul kuis wajib');
ok((await post('g', '/api/lms/kuis', { mapelId: mapel, judul: 'x', mulai: '2026-01-02', selesai: '2026-01-01' })).status === 400, 'waktu tutup sebelum waktu buka ditolak');
r = await post('g', '/api/lms/kuis', { mapelId: mapel, judul: 'Kuis Bab 1', durasiMenit: 30, maksPercobaan: 2, terbit: true, acakSoal: true });
ok(r.status === 200 && r.body.data.terbit === false, 'guru membuat kuis (selalu draf dulu)');
const kz = r.body.data.id;
ok((await put('g', '/api/lms/kuis', { id: kz, judul: 'Kuis Bab 1', durasiMenit: 30, maksPercobaan: 2, terbit: true })).status === 400, 'kuis tanpa soal tidak bisa diterbitkan');

// Soal tidak valid
ok((await put('g', `/api/lms/kuis/${kz}/soal`, { soal: [{ tipe: 'pg', pertanyaan: 'a', opsi: ['x'], kunci: 0 }] })).status === 400, 'PG dengan 1 pilihan ditolak');
ok((await put('g', `/api/lms/kuis/${kz}/soal`, { soal: [{ tipe: 'pg', pertanyaan: 'a', opsi: ['x', 'y'], kunci: 5 }] })).status === 400, 'PG dengan kunci di luar pilihan ditolak');
ok((await put('g', `/api/lms/kuis/${kz}/soal`, { soal: [{ tipe: 'isian', pertanyaan: 'a', kunci: '' }] })).status === 400, 'isian tanpa jawaban diterima ditolak');
ok((await put('g', `/api/lms/kuis/${kz}/soal`, { soal: [{ tipe: 'xx', pertanyaan: 'a' }] })).status === 400, 'tipe soal tak dikenal ditolak');
ok((await put('g2', `/api/lms/kuis/${kz}/soal`, { soal: [] })).status === 404, 'guru lain tidak bisa mengubah soal');

const soal = [
  { tipe: 'pg', pertanyaan: 'Planet terdekat dari matahari?', opsi: ['Venus', 'Merkurius', 'Mars'], kunci: 1, bobot: 2, pembahasan: 'Merkurius paling dekat.' },
  { tipe: 'bs', pertanyaan: 'Air membeku pada 0°C.', kunci: 'B', bobot: 1 },
  { tipe: 'isian', pertanyaan: 'Rumus kimia air?', kunci: 'H2O | h₂o', bobot: 1 },
  { tipe: 'esai', pertanyaan: 'Jelaskan fotosintesis.', bobot: 6 },
];
r = await put('g', `/api/lms/kuis/${kz}/soal`, { soal });
ok(r.status === 200, 'guru menyimpan 4 soal (PG, B/S, isian, esai)');
r = await req('g', `/api/lms/kuis/${kz}`);
ok(r.status === 200 && r.body.soal.length === 4 && r.body.soal[0].kunci === '1' && r.body.kuis.totalBobot === 10, 'guru melihat soal beserta kunci');
const [sPg, sBs, sIs, sEs] = r.body.soal;

ok((await req('a', `/api/lms/kuis/${kz}`)).status === 404, 'siswa tidak melihat kuis draf');
ok(!(await req('a', `/api/lms/mapel/${mapel}`)).body.kuis.some((k) => k.id === kz), 'kuis draf tidak tampil di daftar siswa');
r = await put('g', '/api/lms/kuis', { id: kz, judul: 'Kuis Bab 1', durasiMenit: 30, maksPercobaan: 2, terbit: true });
ok(r.status === 200 && r.body.data.terbit, 'guru menerbitkan kuis');

// ---------- Akses ----------
ok((await req('c', `/api/lms/kuis/${kz}`)).status === 404, 'siswa kelas lain tidak bisa membuka kuis');
ok((await post('c', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' })).status === 404, 'siswa kelas lain tidak bisa mengerjakan');
ok((await post('g', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' })).status === 404, 'guru tidak mengerjakan kuis');
r = await req('a', `/api/lms/mapel/${mapel}`);
ok(r.body.kuis.some((k) => k.id === kz && k.status === 'buka' && k.saya.jumlah === 0), 'kuis terbit tampil di mapel siswa');
r = await req('a', '/api/lms/kelas');
ok(r.body.agenda.some((x) => x.jenis === 'kuis' && x.id === kz), 'kuis yang dibuka muncul di agenda siswa');
r = await req('a', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.jenis === 'kuis' && n.href.endsWith(`/kuis/${kz}`)), 'siswa mendapat notifikasi kuis dibuka');

// ---------- Mengerjakan ----------
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' });
ok(r.status === 200 && r.body.soal.length === 4 && r.body.percobaan.ke === 1 && r.body.percobaan.batas, 'siswa memulai percobaan 1 (ada batas waktu)');
ok(r.body.soal.every((s) => s.kunci === undefined && s.pembahasan === undefined), 'soal untuk siswa tanpa kunci & pembahasan');
const urut1 = r.body.soal.map((s) => s.id).join();
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' });
ok(r.body.percobaan.ke === 1 && r.body.soal.map((s) => s.id).join() === urut1, 'mulai lagi = melanjutkan percobaan yang sama, urutan soal tetap');

r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'simpan', jawaban: { [sPg.id]: '1', [sBs.id]: 'B', 999999: 'x' } });
ok(r.status === 200, 'jawaban tersimpan sementara');
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' });
ok(r.body.jawaban[sPg.id] === '1' && r.body.jawaban[999999] === undefined, 'jawaban tersimpan dipulihkan; id soal asing dibuang');

r = await req('g', `/api/lms/kuis/${kz}`);
ok(r.body.hasil.find((h) => h.siswa.id === sa)?.sedang === true, 'guru melihat siswa sedang mengerjakan');

r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'selesai', jawaban: { [sPg.id]: '1', [sBs.id]: 'B', [sIs.id]: '  h2o ', [sEs.id]: 'Tumbuhan membuat makanan dari cahaya.' } });
// PG 2 + BS 1 + isian 1 = 4 dari 10 (esai belum dinilai)
ok(r.status === 200 && r.body.data.nilai === 40 && r.body.data.perluDinilai === true, 'nilai otomatis 40 (isian tidak peka huruf besar/spasi), esai menunggu dinilai');
const pa1 = r.body.data.id;
ok((await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'simpan', jawaban: {} })).status === 409, 'tidak bisa menyimpan setelah dikumpulkan');

r = await req('a', `/api/lms/percobaan/${pa1}`);
ok(r.status === 200 && r.body.kunciTerbuka === true && r.body.soal[0].kunci === '1' && r.body.soal[0].pembahasan, 'siswa melihat kunci & pembahasan setelah selesai');
ok((await req('b', `/api/lms/percobaan/${pa1}`)).status === 404, 'siswa lain tidak bisa melihat jawaban Ani');
ok((await put('a', `/api/lms/percobaan/${pa1}`, { skorEsai: { [sEs.id]: 6 } })).status === 404, 'siswa tidak bisa menilai esai');

r = await req('g', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.jenis === 'kuis' && n.judul.includes('Ani')), 'guru mendapat notifikasi esai perlu dinilai');
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.kolom.some((k) => k.jenis === 'kuis' && k.id === kz) && r.body.baris.find((b) => b.siswa.id === sa).nilai[`k${kz}`] === 'kumpul', 'rekap: kuis dengan esai belum dinilai = belum dinilai');

ok((await put('g', `/api/lms/percobaan/${pa1}`, { skorEsai: { [sEs.id]: 7 } })).status === 400, 'nilai esai melebihi bobot ditolak');
r = await put('g', `/api/lms/percobaan/${pa1}`, { skorEsai: { [sEs.id]: 5 } });
ok(r.status === 200 && r.body.data.nilai === 90 && r.body.data.perluDinilai === false, 'guru menilai esai 5/6 -> nilai 90');
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.find((b) => b.siswa.id === sa).nilai[`k${kz}`] === 90, 'rekap nilai memakai nilai kuis');
r = await req('a', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.length === 1 && r.body.baris[0].nilai[`k${kz}`] === 90, 'siswa melihat nilai kuisnya di tab Nilai');

// Percobaan ke-2 lebih rendah -> nilai tertinggi tetap dipakai
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' });
ok(r.status === 200 && r.body.percobaan.ke === 2 && Object.keys(r.body.jawaban).length === 0, 'siswa memulai percobaan ke-2 dengan lembar kosong');
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'selesai', jawaban: { [sBs.id]: 'S' } });
ok(r.status === 200 && r.body.data.nilai === 0 && r.body.data.perluDinilai === false, 'percobaan ke-2: nilai 0 (esai kosong tidak perlu dinilai)');
r = await req('a', `/api/lms/kuis/${kz}`);
ok(r.body.terbaik.nilai === 90 && r.body.sisaPercobaan === 0, 'nilai tertinggi 90 dipakai; kesempatan habis');
ok((await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' })).status === 409, 'tidak bisa mulai lagi setelah kesempatan habis');
r = await req('a', '/api/lms/kelas');
ok(!r.body.agenda.some((x) => x.jenis === 'kuis' && x.id === kz), 'kuis yang sudah dikerjakan hilang dari agenda');

// ---------- Ubah kunci -> nilai dihitung ulang ----------
r = await put('g', `/api/lms/kuis/${kz}/soal`, {
  soal: [{ ...sPg, kunci: 0 }, { ...sBs }, { ...sIs }, { ...sEs }],
});
ok(r.status === 200, 'guru mengubah kunci soal PG');
r = await req('a', `/api/lms/percobaan/${pa1}`);
// PG kini salah: 0 + 1 + 1 + esai 5 = 7/10
ok(r.body.percobaan.nilai === 70 && r.body.soal.find((s) => s.tipe === 'esai').poin === 5, 'nilai dihitung ulang (70), nilai esai tetap');

// ---------- Hapus percobaan (kerjakan ulang) ----------
r = await req('g', `/api/lms/kuis/${kz}`);
const pa2 = r.body.hasil.find((h) => h.siswa.id === sa).percobaan[1].id;
ok((await del('g2', `/api/lms/percobaan/${pa2}`)).status === 404, 'guru lain tidak bisa menghapus percobaan');
ok((await del('g', `/api/lms/percobaan/${pa2}`)).status === 200, 'guru menghapus percobaan ke-2');
r = await req('a', `/api/lms/kuis/${kz}`);
ok(r.body.sisaPercobaan === 1, 'siswa mendapat kesempatan lagi');
r = await post('a', `/api/lms/kuis/${kz}/kerjakan`, { aksi: 'mulai' });
ok(r.status === 200 && r.body.percobaan.ke === 2, 'percobaan baru menggantikan nomor yang dihapus');

// ---------- Jadwal & batas waktu dari server ----------
const besok = new Date(Date.now() + 86400000).toISOString();
const kBelum = (await post('g', '/api/lms/kuis', { mapelId: mapel, judul: 'Belum Buka', mulai: besok })).body.data.id;
await put('g', `/api/lms/kuis/${kBelum}/soal`, { soal: [soal[1]] });
await put('g', '/api/lms/kuis', { id: kBelum, judul: 'Belum Buka', mulai: besok, terbit: true });
r = await post('b', `/api/lms/kuis/${kBelum}/kerjakan`, { aksi: 'mulai' });
ok(r.status === 409, 'kuis yang belum dibuka tidak bisa dikerjakan');
r = await req('b', '/api/lms/notifikasi');
ok(!r.body.items.some((n) => n.href.endsWith(`/kuis/${kBelum}`)), 'kuis yang belum dibuka belum masuk notifikasi');

const tutup = new Date(Date.now() + 4000).toISOString();
const kCepat = (await post('g', '/api/lms/kuis', { mapelId: mapel, judul: 'Kilat', selesai: tutup, tampilkanJawaban: true })).body.data.id;
await put('g', `/api/lms/kuis/${kCepat}/soal`, { soal: [soal[0], soal[1]] });
await put('g', '/api/lms/kuis', { id: kCepat, judul: 'Kilat', selesai: tutup, terbit: true });
r = await post('b', `/api/lms/kuis/${kCepat}/kerjakan`, { aksi: 'mulai' });
ok(r.status === 200 && new Date(r.body.percobaan.batas).getTime() === new Date(tutup).getTime(), 'batas waktu = waktu tutup kuis');
const kSoal = r.body.soal;
await post('b', `/api/lms/kuis/${kCepat}/kerjakan`, { aksi: 'simpan', jawaban: { [kSoal.find((s) => s.tipe === 'bs').id]: 'B' } });
r = await req('b', `/api/lms/kuis/${kCepat}`);
ok(r.body.kunciTerbuka === false, 'kunci belum terbuka selama kuis masih dibuka');
await sleep(4500);
r = await req('b', `/api/lms/kuis/${kCepat}`);
// B/S benar (1) dari total 3 = 33.3
ok(r.body.aktif === null && r.body.percobaan[0].selesaiAt && r.body.percobaan[0].nilai === 33.3, 'waktu habis: percobaan dinilai otomatis dari jawaban tersimpan');
ok(r.body.kuis.status === 'tutup' && r.body.kunciTerbuka === true, 'kuis ditutup & kunci terbuka');
ok((await post('a', `/api/lms/kuis/${kCepat}/kerjakan`, { aksi: 'mulai' })).status === 409, 'kuis yang ditutup tidak bisa dimulai');
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
const barisA = r.body.baris.find((b) => b.siswa.id === sa);
ok(barisA.nilai[`k${kCepat}`] === null && barisA.rataRata === 35, 'kuis ditutup tanpa dikerjakan dihitung 0 di rata-rata');

// ---------- Backup, hapus ----------
r = await req('admin', '/api/admin/backup');
ok(r.body.data.kuis.some((k) => k.id === kz) && r.body.data.soalKuis.some((s) => s.kuisId === kz) && r.body.data.percobaanKuis.some((p) => p.id === pa1), 'backup memuat kuis, soal, dan percobaan');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${mapel}`)).status === 400, 'mapel yang berisi kuis tidak bisa dihapus');
ok((await del('g2', `/api/lms/kuis?id=${kz}`)).status === 404, 'guru lain tidak bisa menghapus kuis');
ok((await del('g', `/api/lms/kuis?id=${kz}`)).status === 200, 'guru menghapus kuis beserta soal & jawaban');
ok((await req('g', `/api/lms/percobaan/${pa1}`)).status === 404, 'percobaan ikut terhapus');
ok((await del('admin', `/api/admin/peserta?id=${sb}`)).status === 200, 'siswa yang punya percobaan kuis bisa dihapus');
