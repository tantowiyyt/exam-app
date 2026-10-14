// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// LMS: topik (bagian mapel), terbit terjadwal materi & tugas, progres belajar siswa.
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

const guru = (await post('admin', '/api/admin/akun', { username: `gt-${t}`, nama: 'Guru Topik', password: 'guru1234', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `gt2-${t}`, nama: 'Guru Lain', password: 'guru1234', role: 'GURU' });
const KLS = `KT-${t}`;
const sa = (await post('admin', '/api/admin/peserta', { nomorPeserta: `ta-${t}`, nama: 'Ani', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sb = (await post('admin', '/api/admin/peserta', { nomorPeserta: `tb-${t}`, nama: 'Budi', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelasId = (await req('admin', '/api/admin/kelas')).body.kelas.find((k) => k.nama === KLS).id;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId, nama: 'Biologi', guruId: guru })).body.data.id;
const mapelLain = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId, nama: 'Kimia', guruId: guru })).body.data.id;
await login('g', `gt-${t}`, 'guru1234');
await login('g2', `gt2-${t}`, 'guru1234');
await login('a', `ta-${t}`, 'siswa123');
await login('b', `tb-${t}`, 'siswa123');

// ---------- Topik ----------
ok((await post('g2', '/api/lms/topik', { mapelId: mapel, judul: 'x' })).status === 403, 'guru lain tidak bisa membuat topik');
ok((await post('a', '/api/lms/topik', { mapelId: mapel, judul: 'x' })).status === 403, 'siswa tidak bisa membuat topik');
ok((await post('g', '/api/lms/topik', { mapelId: mapel, judul: '' })).status === 400, 'judul topik wajib');
const tp1 = (await post('g', '/api/lms/topik', { mapelId: mapel, judul: 'Bab 1 — Sel', deskripsi: 'Struktur sel' })).body.data.id;
const tp2 = (await post('g', '/api/lms/topik', { mapelId: mapel, judul: 'Bab 2 — Jaringan' })).body.data.id;
const tpLain = (await post('g', '/api/lms/topik', { mapelId: mapelLain, judul: 'Topik Kimia' })).body.data.id;
let r = await req('a', `/api/lms/topik?mapelId=${mapel}`);
ok(r.status === 200 && r.body.topik.map((x) => x.id).join() === `${tp1},${tp2}`, 'siswa melihat daftar topik berurutan');
ok((await put('g', '/api/lms/topik', { aksi: 'urut', id: tp2, arah: 'naik' })).status === 200, 'guru menaikkan urutan topik');
r = await req('g', `/api/lms/topik?mapelId=${mapel}`);
ok(r.body.topik[0].id === tp2, 'urutan topik berubah');
r = await put('g', '/api/lms/topik', { id: tp2, judul: 'Bab 2 — Jaringan Tumbuhan', deskripsi: '' });
ok(r.status === 200 && r.body.data.judul === 'Bab 2 — Jaringan Tumbuhan', 'guru mengubah judul topik');
ok((await put('g2', '/api/lms/topik', { id: tp2, judul: 'x' })).status === 404, 'guru lain tidak bisa mengubah topik');

// Item dengan topik
ok((await post('g', '/api/lms/materi', { mapelId: mapel, judul: 'x', topikId: tpLain })).status === 400, 'topik dari mapel lain ditolak');
const m1 = (await post('g', '/api/lms/materi', { mapelId: mapel, judul: 'Materi Sel', topikId: tp1 })).body.data;
ok(m1.topikId === tp1, 'materi dibuat di topik 1');
const tg1 = (await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'Tugas Sel', topikId: tp1 })).body.data;
ok(tg1.topikId === tp1, 'tugas dibuat di topik 1');
const kz = (await post('g', '/api/lms/kuis', { mapelId: mapel, judul: 'Kuis Sel', topikId: tp1 })).body.data;
ok(kz.topikId === tp1, 'kuis dibuat di topik 1');
await put('g', `/api/lms/kuis/${kz.id}/soal`, { soal: [{ tipe: 'bs', pertanyaan: 'Sel adalah unit terkecil kehidupan', kunci: 'B' }] });
await put('g', '/api/lms/kuis', { ...kz, terbit: true });

ok((await put('g', '/api/lms/topik', { aksi: 'pindah', jenis: 'materi', itemId: m1.id, topikId: tpLain })).status === 400, 'tidak bisa memindah ke topik mapel lain');
ok((await put('g2', '/api/lms/topik', { aksi: 'pindah', jenis: 'materi', itemId: m1.id, topikId: tp2 })).status === 404, 'guru lain tidak bisa memindah item');
ok((await put('g', '/api/lms/topik', { aksi: 'pindah', jenis: 'tugas', itemId: tg1.id, topikId: tp2 })).status === 200, 'guru memindah tugas ke topik 2');
r = await req('a', `/api/lms/mapel/${mapel}`);
ok(r.body.topik.length === 2 && r.body.tugas.find((x) => x.id === tg1.id)?.topikId === tp2 && r.body.materi.find((x) => x.id === m1.id)?.topikId === tp1, 'halaman mapel memuat topik & topikId tiap item');

ok((await del('g', `/api/lms/topik?id=${tp1}`)).status === 200, 'guru menghapus topik 1');
r = await req('g', `/api/lms/mapel/${mapel}`);
ok(r.body.materi.find((x) => x.id === m1.id)?.topikId === null && r.body.kuis.find((x) => x.id === kz.id)?.topikId === null, 'isi topik yang dihapus tetap ada (tanpa topik)');

// ---------- Terbit terjadwal ----------
const nanti = new Date(Date.now() + 3000).toISOString();
ok((await post('g', '/api/lms/materi', { mapelId: mapel, judul: 'x', terbitPada: 'bukan-tanggal' })).status === 400, 'jadwal terbit tidak valid ditolak');
const mJ = (await post('g', '/api/lms/materi', { mapelId: mapel, judul: 'Materi Terjadwal', terbitPada: nanti })).body.data;
ok(mJ.terbit === true && mJ.terbitPada, 'guru menjadwalkan materi');
const tJ = (await post('g', '/api/lms/tugas', { mapelId: mapel, judul: 'Tugas Terjadwal', terbitPada: nanti, tenggat: new Date(Date.now() - 1000).toISOString() })).body.data;
r = await req('a', `/api/lms/mapel/${mapel}`);
ok(!r.body.materi.some((x) => x.id === mJ.id) && !r.body.tugas.some((x) => x.id === tJ.id), 'materi & tugas terjadwal belum terlihat siswa');
ok((await req('a', `/api/lms/materi/${mJ.id}`)).status === 404 && (await req('a', `/api/lms/tugas/${tJ.id}`)).status === 404, 'detail terjadwal belum bisa dibuka siswa');
ok((await post('a', '/api/lms/pengumpulan', { tugasId: tJ.id, jawaban: 'x' })).status === 404, 'tugas terjadwal belum bisa dikumpulkan');
ok((await post('a', '/api/lms/komentar', { materiId: mJ.id, isi: 'x' })).status === 404, 'materi terjadwal belum bisa dikomentari');
r = await req('a', '/api/lms/notifikasi');
ok(!r.body.items.some((n) => n.href.endsWith(`/materi/${mJ.id}`)), 'belum ada notifikasi untuk materi terjadwal');
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.find((b) => b.siswa.id === sa).nilai[`t${tJ.id}`] === null && r.body.baris.find((b) => b.siswa.id === sa).rataRata === null, 'tugas terjadwal (walau tenggat lewat) belum dihitung 0');
r = await req('g', `/api/lms/mapel/${mapel}`);
ok(r.body.materi.find((x) => x.id === mJ.id)?.terbitPada, 'guru tetap melihat item terjadwal');

await sleep(3500);
r = await req('a', `/api/lms/mapel/${mapel}`);
ok(r.body.materi.some((x) => x.id === mJ.id) && r.body.tugas.some((x) => x.id === tJ.id), 'setelah waktunya, materi & tugas otomatis terlihat');
ok((await req('a', `/api/lms/materi/${mJ.id}`)).status === 200, 'siswa membuka materi yang sudah terbit (tercatat dibaca)');
r = await req('a', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.href.endsWith(`/materi/${mJ.id}`)), 'notifikasi materi muncul setelah terbit');

// ---------- Progres ----------
await req('a', `/api/lms/materi/${m1.id}`);
await post('a', '/api/lms/pengumpulan', { tugasId: tg1.id, jawaban: 'Jawaban' });
await post('a', `/api/lms/kuis/${kz.id}/kerjakan`, { aksi: 'mulai' });
await post('a', `/api/lms/kuis/${kz.id}/kerjakan`, { aksi: 'selesai', jawaban: {} });
r = await req('g', `/api/lms/mapel/${mapel}`);
const pA = r.body.progres.find((x) => x.userId === sa);
const pB = r.body.progres.find((x) => x.userId === sb);
// Terlihat: 2 materi, 2 tugas, 1 kuis = 5; Ani: 2 materi + 1 tugas + 1 kuis = 4 -> 80%
ok(pA && pA.materi === 2 && pA.tugas === 1 && pA.tugasTotal === 2 && pA.kuis === 1 && pA.persen === 80, 'progres Ani 80% (materi 2/2, tugas 1/2, kuis 1/1)');
ok(pB && pB.persen === 0, 'progres Budi 0%');
ok(r.body.jumlahMateriTampil === 2 && r.body.jumlahKuisTampil === 1, 'jumlah materi & kuis yang terlihat siswa');
ok((await req('a', `/api/lms/mapel/${mapel}`)).body.progres.length === 0, 'siswa tidak menerima progres teman');

// ---------- Backup & hapus mapel ----------
r = await req('admin', '/api/admin/backup');
ok(r.body.data.topik.some((x) => x.id === tp2), 'backup memuat topik');
ok((await del('g', `/api/lms/materi?id=${m1.id}`)).status === 200, 'materi bertopik bisa dihapus');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${mapelLain}`)).status === 200, 'mapel yang hanya berisi topik bisa dihapus (topik ikut terhapus)');
ok((await req('g', `/api/lms/topik?mapelId=${mapelLain}`)).status === 404, 'topik mapel yang dihapus ikut hilang');
