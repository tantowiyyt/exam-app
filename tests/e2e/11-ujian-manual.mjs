// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS.
// LMS ujian offline / nilai manual: buat ujian, isi nilai, umumkan, rekap nilai, kalender, notifikasi, akses, backup, hapus.
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

const guru = (await post('admin', '/api/admin/akun', { username: `gm-${t}`, nama: 'Guru Ujian', password: 'guru1234', role: 'GURU' })).body.data.id;
await post('admin', '/api/admin/akun', { username: `gm2-${t}`, nama: 'Guru Lain', password: 'guru1234', role: 'GURU' });
const KLS = `KM-${t}`;
const sa = (await post('admin', '/api/admin/peserta', { nomorPeserta: `ma-${t}`, nama: 'Ani', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sb = (await post('admin', '/api/admin/peserta', { nomorPeserta: `mb-${t}`, nama: 'Budi', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const sc = (await post('admin', '/api/admin/peserta', { nomorPeserta: `mc-${t}`, nama: 'Cici', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: KLS })).body.data.id;
const luar = (await post('admin', '/api/admin/peserta', { nomorPeserta: `mx-${t}`, nama: 'Orang Luar', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: `LAIN-${t}` })).body.data.id;
await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
const kelas = (await req('admin', '/api/admin/kelas')).body.kelas;
const mapel = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: kelas.find((k) => k.nama === KLS).id, nama: 'Sejarah', guruId: guru })).body.data.id;
await login('g', `gm-${t}`, 'guru1234');
await login('g2', `gm2-${t}`, 'guru1234');
await login('a', `ma-${t}`, 'siswa123');
await login('b', `mb-${t}`, 'siswa123');
await login('x', `mx-${t}`, 'siswa123');

// ---------- Buat ujian ----------
const besok = new Date(Date.now() + 86400000).toISOString();
ok((await post('g2', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'x' })).status === 404, 'guru lain tidak bisa membuat ujian offline');
ok((await post('a', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'x' })).status === 404, 'siswa tidak bisa membuat ujian offline');
ok((await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: '' })).status === 400, 'nama ujian wajib');
ok((await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'x', nilaiMaks: 0 })).status === 400, 'nilai maksimal minimal 1');
ok((await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'x', tanggal: 'bukan-tanggal' })).status === 400, 'tanggal tidak valid ditolak');
let r = await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'UTS Ganjil', tanggal: besok, nilaiMaks: 100, keterangan: 'Bab 1-3' });
ok(r.status === 200 && r.body.data.terbit === false, 'guru membuat ujian offline (belum diumumkan)');
const u1 = r.body.data.id;
r = await post('g', '/api/lms/ujian-manual', { mapelId: mapel, judul: 'Ujian Praktik', nilaiMaks: 50 });
const u2 = r.body.data.id;

r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.status === 200 && r.body.ujian.length === 2 && r.body.siswa.length === 3, 'guru melihat daftar ujian & siswa kelas');
r = await req('g', `/api/lms/mapel/${mapel}`);
ok(r.body.jumlahUjianManual === 2, 'mapel menghitung jumlah ujian offline');

// ---------- Isi nilai ----------
ok((await put('g2', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sa, nilai: 80 }] })).status === 404, 'guru lain tidak bisa mengisi nilai');
ok((await put('a', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sa, nilai: 100 }] })).status === 404, 'siswa tidak bisa mengisi nilai');
ok((await put('g', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sa, nilai: 101 }] })).status === 400, 'nilai di atas maksimal ditolak');
ok((await put('g', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sa, nilai: -1 }] })).status === 400, 'nilai negatif ditolak');
ok((await put('g', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: luar, nilai: 50 }] })).status === 400, 'siswa kelas lain ditolak');
r = await put('g', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sa, nilai: 80, catatan: 'Bagus' }, { userId: sb, nilai: 60.5 }] });
ok(r.status === 200, 'guru mengisi nilai beberapa siswa sekaligus');
r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
let ujian = r.body.ujian.find((u) => u.id === u1);
ok(ujian.nilai.length === 2 && ujian.rataRata === 70.3 && ujian.nilai.find((n) => n.userId === sa).catatan === 'Bagus', 'nilai, catatan & rata-rata tersimpan');
r = await put('g', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sb, nilai: 65 }] });
r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.body.ujian.find((u) => u.id === u1).nilai.find((n) => n.userId === sb).nilai === 65, 'nilai bisa dikoreksi');

// ---------- Siswa sebelum diumumkan ----------
r = await req('a', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.status === 200 && r.body.ujian.length === 2 && r.body.ujian.every((u) => u.saya === null && u.diumumkan === false), 'siswa melihat jadwal ujian, nilai belum terlihat');
ok(r.body.siswa === undefined && r.body.ujian.every((u) => u.nilai === undefined), 'siswa tidak menerima nilai siswa lain');
r = await req('a', `/api/lms/mapel/${mapel}/nilai`);
ok(!r.body.kolom.some((k) => k.kunci === `m${u1}`), 'ujian belum diumumkan tidak muncul di rekap siswa');
ok((await req('x', `/api/lms/ujian-manual?mapelId=${mapel}`)).status === 404, 'siswa kelas lain tidak bisa melihat');

// ---------- Rekap guru ----------
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
const kol = r.body.kolom.find((k) => k.kunci === `m${u1}`);
ok(kol && kol.jenis === 'ujian' && kol.offline === true && kol.terbit === false, 'rekap guru memuat kolom ujian offline');
const barisA = r.body.baris.find((b) => b.siswa.id === sa);
const barisC = r.body.baris.find((b) => b.siswa.id === sc);
ok(barisA.nilai[`m${u1}`] === 80 && barisA.komponen.ujian === 80, 'nilai ujian offline masuk komponen ujian');
ok(barisC.nilai[`m${u1}`] === null && barisC.komponen.ujian === null, 'siswa tanpa nilai tidak dihitung 0');

// Nilai maks 50 -> dipersenkan
await put('g', '/api/lms/ujian-manual', { id: u2, aksi: 'nilai', data: [{ userId: sa, nilai: 40 }] });
r = await req('g', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.baris.find((b) => b.siswa.id === sa).komponen.ujian === 80, 'nilai berskala maks 50 dipersenkan (40/50 = 80)');

// ---------- Umumkan ----------
r = await put('g', '/api/lms/ujian-manual', { id: u1, terbit: true });
ok(r.status === 200 && r.body.data.terbit && r.body.data.diumumkanAt, 'guru mengumumkan nilai');
r = await req('a', `/api/lms/ujian-manual?mapelId=${mapel}`);
let saya = r.body.ujian.find((u) => u.id === u1);
ok(saya.diumumkan && saya.saya.nilai === 80 && saya.saya.catatan === 'Bagus', 'siswa melihat nilai & catatannya setelah diumumkan');
ok(r.body.ujian.find((u) => u.id === u2).saya === null, 'ujian lain yang belum diumumkan tetap tersembunyi');
r = await req('a', `/api/lms/mapel/${mapel}/nilai`);
ok(r.body.kolom.some((k) => k.kunci === `m${u1}`) && !r.body.kolom.some((k) => k.kunci === `m${u2}`) && r.body.baris[0].nilai[`m${u1}`] === 80, 'rekap siswa memuat ujian yang sudah diumumkan saja');
r = await req('a', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.jenis === 'nilai' && n.judul.includes('UTS Ganjil') && n.judul.includes('80/100')), 'siswa mendapat notifikasi nilai ujian');
r = await req('b', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.body.ujian.find((u) => u.id === u1).saya.nilai === 65, 'siswa lain melihat nilainya sendiri');

// Kalender
const dari = new Date(Date.now() - 86400000).toISOString();
const sampai = new Date(Date.now() + 3 * 86400000).toISOString();
r = await req('a', `/api/lms/kalender?dari=${dari}&sampai=${sampai}`);
ok(r.body.acara.some((a) => a.id === `um${u1}` && a.jenis === 'ujian'), 'jadwal ujian offline muncul di kalender');

// ---------- Ubah ----------
ok((await put('g', '/api/lms/ujian-manual', { id: u1, judul: 'UTS Ganjil', nilaiMaks: 70 })).status === 400, 'nilai maks tidak bisa lebih kecil dari nilai yang sudah ada');
r = await put('g', '/api/lms/ujian-manual', { id: u1, judul: 'UTS Ganjil 2026', nilaiMaks: 100, tanggal: besok });
ok(r.status === 200 && r.body.data.judul === 'UTS Ganjil 2026' && r.body.data.terbit === true, 'guru mengubah data ujian (status umumkan tetap)');
r = await put('g', '/api/lms/ujian-manual', { id: u1, terbit: false });
ok(r.status === 200 && !r.body.data.terbit, 'guru menyembunyikan nilai lagi');
r = await req('a', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.body.ujian.find((u) => u.id === u1).saya === null, 'nilai tersembunyi lagi dari siswa');

// Hapus nilai satu siswa dengan nilai kosong
r = await put('g', '/api/lms/ujian-manual', { id: u1, aksi: 'nilai', data: [{ userId: sb, nilai: null }] });
r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.body.ujian.find((u) => u.id === u1).nilai.length === 1, 'nilai kosong menghapus nilai siswa');

// ---------- Backup & hapus ----------
r = await req('admin', '/api/admin/backup');
ok(r.body.data.ujianManual.some((u) => u.id === u1) && r.body.data.nilaiUjianManual.some((n) => n.ujianId === u1), 'backup memuat ujian offline & nilainya');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${mapel}`)).status === 400, 'mapel yang punya ujian offline tidak bisa dihapus');
ok((await del('admin', `/api/admin/peserta?id=${sa}`)).status === 200, 'siswa yang punya nilai ujian offline bisa dihapus');
ok((await del('g2', `/api/lms/ujian-manual?id=${u1}`)).status === 404, 'guru lain tidak bisa menghapus ujian');
ok((await del('g', `/api/lms/ujian-manual?id=${u1}`)).status === 200, 'guru menghapus ujian beserta nilainya');
ok((await del('g', `/api/lms/ujian-manual?id=${u2}`)).status === 200, 'guru menghapus ujian kedua');
r = await req('g', `/api/lms/ujian-manual?mapelId=${mapel}`);
ok(r.body.ujian.length === 0, 'ujian terhapus');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${mapel}`)).status === 200, 'mapel kosong bisa dihapus');
void luar;
