// Dijalankan oleh tests/run.mjs (lihat tests/README.md). Variabel: BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB.
// LMS: role GURU, kelas & mapel, materi, tugas, pengumpulan & nilai, pengumuman, diskusi, upload, ujian per kelas.
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const BASE = process.env.BASE_URL || 'http://localhost:3457';
const jar = {};
async function req(who, path, opts = {}) {
  const headers = opts.form ? {} : { 'Content-Type': 'application/json' };
  if (jar[who]) headers.cookie = jar[who];
  const res = await fetch(BASE + path, { method: opts.method, body: opts.form ?? opts.body, headers, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(';')[0];
    const k = kv.split('=')[0];
    jar[who] = [...(jar[who] || '').split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, loc: res.headers.get('location'), type, disp: res.headers.get('content-disposition') };
}
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
const J = (o) => JSON.stringify(o);
const post = (who, path, body) => req(who, path, { method: 'POST', body: J(body) });
const put = (who, path, body) => req(who, path, { method: 'PUT', body: J(body) });
const del = (who, path) => req(who, path, { method: 'DELETE' });
const login = (who, u, p) => post(who, '/api/login', { nomorPeserta: u, password: p });
const upload = (who, name, bytes) => {
  const fd = new FormData();
  fd.append('file', new Blob([bytes]), name);
  return req(who, '/api/lms/upload', { method: 'POST', form: fd });
};
const t = Date.now();

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/login'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
await login('admin', ADMIN_USER, ADMIN_PASS);

// ---------- Akun guru & kelas ----------
let r = await post('admin', '/api/admin/akun', { username: `guruA-${t}`, nama: 'Guru A', password: 'guruA123', role: 'GURU' });
ok(r.status === 200 && r.body.data.role === 'GURU', 'admin membuat akun guru');
const guruA = r.body.data.id;
r = await post('admin', '/api/admin/akun', { username: `guruB-${t}`, nama: 'Guru B', password: 'guruB123', role: 'GURU' });
const guruB = r.body.data.id;

const K1 = `X-A-${t}`;
const K2 = `X-B-${t}`;
const s1Id = (await post('admin', '/api/admin/peserta', { nomorPeserta: `s1-${t}`, nama: 'Siswa Satu', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: K1 })).body.data.id;
await post('admin', '/api/admin/peserta', { nomorPeserta: `s2-${t}`, nama: 'Siswa Dua', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: K2 });

r = await req('admin', '/api/admin/kelas');
ok(r.status === 200 && r.body.kelasBelumDibuat.some((k) => k.nama === K1), 'kelas dari data peserta terdeteksi belum dibuat');
r = await post('admin', '/api/admin/kelas', { jenis: 'kelasDariPeserta' });
ok(r.status === 200, 'buat kelas dari data peserta');
r = await req('admin', '/api/admin/kelas');
const k1 = r.body.kelas.find((k) => k.nama === K1);
const k2 = r.body.kelas.find((k) => k.nama === K2);
ok(k1 && k2 && k1.jumlahSiswa === 1, 'kelas K1 & K2 dibuat, K1 berisi 1 siswa');
r = await post('admin', '/api/admin/kelas', { jenis: 'kelas', nama: K1 });
ok(r.status === 400, 'nama kelas duplikat ditolak');

r = await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: k1.id, nama: 'Matematika', guruId: guruA });
ok(r.status === 200, 'admin membuat mapel Matematika K1 dengan guru A');
const m1 = r.body.data.id;
r = await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: k1.id, nama: 'Matematika' });
ok(r.status === 400, 'mapel duplikat di kelas sama ditolak');
r = await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: k2.id, nama: 'Fisika', guruId: s1Id });
ok(r.status === 400, 'akun peserta tidak bisa dijadikan guru pengampu');
r = await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: k2.id, nama: 'Fisika', guruId: guruB });
const m2 = r.body.data?.id;
ok(r.status === 200, 'admin membuat mapel Fisika K2 dengan guru B');

// ---------- Login & routing ----------
r = await login('ga', `guruA-${t}`, 'guruA123');
ok(r.status === 200 && r.body.role === 'GURU', 'guru login');
await login('gb', `guruB-${t}`, 'guruB123');
await login('s1', `s1-${t}`, 'siswa123');
await login('s2', `s2-${t}`, 'siswa123');
ok((await req('ga', '/kelas')).status === 200, 'guru boleh buka /kelas');
for (const p of ['/admin', '/dashboard', '/ujian', '/login']) {
  r = await req('ga', p);
  ok(r.status === 307 && r.loc?.endsWith('/kelas'), `guru di ${p} diarahkan ke /kelas`);
}
ok((await req('s1', '/kelas')).status === 200 && (await req('s1', `/kelas/${m1}`)).status === 200, 'siswa boleh buka /kelas');
for (const p of ['/api/admin/kelas', '/api/admin/peserta', '/api/admin/ujian']) ok((await req('ga', p)).status === 403, `guru ditolak di ${p}`);
ok((await req('ga', '/api/ujian')).status === 403, 'guru tidak bisa mengerjakan ujian');
ok((await req('anon', '/api/lms/kelas')).status === 401, 'LMS butuh login');

r = await req('ga', '/api/lms/kelas');
ok(r.status === 200 && r.body.mapel.some((m) => m.id === m1), 'guru A melihat mapel yang diampu');
r = await req('gb', '/api/lms/kelas');
ok(!r.body.mapel.some((m) => m.id === m1), 'guru B tidak melihat mapel guru A');
ok((await req('gb', `/api/lms/mapel/${m1}`)).status === 404, 'guru B tidak bisa membuka mapel guru A');
r = await req('s1', '/api/lms/kelas');
ok(r.body.kelasSaya === K1 && r.body.mapel.length === 1 && r.body.mapel[0].id === m1, 'siswa K1 hanya melihat mapel kelasnya');
ok((await req('s2', `/api/lms/mapel/${m1}`)).status === 404, 'siswa kelas lain tidak bisa membuka mapel');

// ---------- Materi ----------
r = await post('gb', '/api/lms/materi', { mapelId: m1, judul: 'x' });
ok(r.status === 403, 'guru lain tidak bisa menambah materi');
r = await post('s1', '/api/lms/materi', { mapelId: m1, judul: 'x' });
ok(r.status === 403, 'siswa tidak bisa menambah materi');
r = await post('ga', '/api/lms/materi', { mapelId: m1, judul: 'Bab 1', isi: 'Isi materi', linkVideo: 'javascript:alert(1)' });
ok(r.status === 400, 'link video javascript: ditolak');
r = await post('ga', '/api/lms/materi', { mapelId: m1, judul: 'Bab 1', isi: 'Isi materi bab 1', linkVideo: 'https://youtu.be/dQw4w9WgXcQ', lampiran: '/etc/passwd' });
ok(r.status === 400, 'lampiran bukan hasil upload ditolak');
r = await post('ga', '/api/lms/materi', { mapelId: m1, judul: 'Bab 1', isi: 'Isi materi bab 1', linkVideo: 'https://youtu.be/dQw4w9WgXcQ' });
ok(r.status === 200, 'guru menambah materi');
const mat1 = r.body.data.id;
r = await post('ga', '/api/lms/materi', { mapelId: m1, judul: 'Draf Bab 2', terbit: false });
const matDraf = r.body.data.id;

r = await req('s1', '/api/lms/kelas');
ok(r.body.mapel[0].jumlahMateri === 1, 'jumlah materi di kartu siswa tidak menghitung draf');
r = await req('s1', `/api/lms/mapel/${m1}`);
ok(r.status === 200 && r.body.peran === 'siswa' && r.body.materi.length === 1 && r.body.materi[0].sudahDibaca === false, 'siswa hanya melihat materi terbit, belum dibaca');
ok((await req('s1', `/api/lms/materi/${matDraf}`)).status === 404, 'siswa tidak bisa membuka materi draf');
r = await req('s1', `/api/lms/materi/${mat1}`);
ok(r.status === 200 && r.body.materi.isi === 'Isi materi bab 1', 'siswa membuka materi');
r = await req('s1', `/api/lms/mapel/${m1}`);
ok(r.body.materi[0].sudahDibaca === true, 'materi tercatat sudah dibaca');
r = await req('ga', `/api/lms/materi/${mat1}`);
ok(r.body.pembaca.length === 1 && r.body.pembaca[0].nama === 'Siswa Satu', 'guru melihat siapa yang sudah membaca');
r = await put('ga', '/api/lms/materi', { id: mat1, judul: 'Bab 1 (revisi)', isi: 'Isi baru' });
ok(r.status === 200 && r.body.data.judul === 'Bab 1 (revisi)', 'guru mengedit materi');

// ---------- Upload ----------
const pdf = new TextEncoder().encode('%PDF-1.4\n% dummy\n');
r = await upload('s1', 'tugas saya.pdf', pdf);
ok(r.status === 200 && /^\/api\/lms\/file\/[\w-]+\.pdf$/.test(r.body.url) && r.body.nama === 'tugas saya.pdf', 'siswa mengunggah PDF');
const filePdf = r.body.url;
ok((await upload('s1', 'virus.exe', pdf)).status === 400, 'ekstensi .exe ditolak');
ok((await upload('s1', 'palsu.pdf', new TextEncoder().encode('<script>alert(1)</script>'))).status === 400, 'isi tidak cocok dengan ekstensi ditolak');
ok((await upload('anon', 'a.pdf', pdf)).status === 401, 'upload butuh login');
r = await req('ga', filePdf);
ok(r.status === 200 && r.type.startsWith('application/pdf'), 'file lampiran bisa dibuka');
ok((await req('anon', filePdf)).status === 401, 'file lampiran butuh login');
r = await upload('ga', 'soal.docx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
ok(r.status === 200, 'guru mengunggah DOCX');
const docx = await req('ga', r.body.url);
ok(docx.status === 200 && docx.disp?.startsWith('attachment'), 'DOCX disajikan sebagai unduhan');

// ---------- Tugas ----------
const lusa = new Date(Date.now() + 2 * 86400000).toISOString();
r = await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Latihan 1', deskripsi: 'Kerjakan', tenggat: lusa, nilaiMaks: 100 });
ok(r.status === 200, 'guru membuat tugas');
const tg1 = r.body.data.id;
ok((await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'x', nilaiMaks: 0 })).status === 400, 'nilai maksimal 0 ditolak');

r = await req('s1', '/api/lms/kelas');
ok(r.body.mapel[0].tugasBelum === 1, 'siswa melihat 1 tugas belum dikumpulkan');
ok((await post('s1', '/api/lms/pengumpulan', { tugasId: tg1 })).status === 400, 'pengumpulan kosong ditolak');
r = await post('s1', '/api/lms/pengumpulan', { tugasId: tg1, jawaban: 'Jawaban pertama', lampiran: filePdf, namaLampiran: 'tugas saya.pdf' });
ok(r.status === 200, 'siswa mengumpulkan tugas');
const kumpul = r.body.data.id;
r = await post('s1', '/api/lms/pengumpulan', { tugasId: tg1, jawaban: 'Jawaban revisi' });
ok(r.status === 200 && r.body.data.id === kumpul && r.body.data.jawaban === 'Jawaban revisi', 'siswa memperbarui jawaban sebelum dinilai');
ok((await post('s2', '/api/lms/pengumpulan', { tugasId: tg1, jawaban: 'x' })).status === 404, 'siswa kelas lain tidak bisa mengumpulkan');
ok((await put('s1', '/api/lms/pengumpulan', { id: kumpul, nilai: 100 })).status === 404, 'siswa tidak bisa memberi nilai');
ok((await put('gb', '/api/lms/pengumpulan', { id: kumpul, nilai: 100 })).status === 404, 'guru lain tidak bisa memberi nilai');

r = await req('ga', `/api/lms/tugas/${tg1}`);
const baris = r.body.daftar?.find((x) => x.siswa.nomorPeserta === `s1-${t}`);
ok(r.status === 200 && baris?.pengumpulan?.jawaban === 'Jawaban revisi', 'guru melihat pengumpulan siswa');
ok((await put('ga', '/api/lms/pengumpulan', { id: kumpul, nilai: 101 })).status === 400, 'nilai di atas maksimal ditolak');
r = await put('ga', '/api/lms/pengumpulan', { id: kumpul, nilai: 90, catatanGuru: 'Bagus' });
ok(r.status === 200 && r.body.data.nilai === 90, 'guru memberi nilai');
r = await req('s1', `/api/lms/tugas/${tg1}`);
ok(r.body.pengumpulan.nilai === 90 && r.body.pengumpulan.catatanGuru === 'Bagus' && !('daftar' in r.body), 'siswa melihat nilai & catatan, bukan data siswa lain');
ok((await post('s1', '/api/lms/pengumpulan', { tugasId: tg1, jawaban: 'ubah' })).status === 409, 'jawaban tidak bisa diubah setelah dinilai');

// ---------- Pengumuman & diskusi ----------
ok((await post('s1', '/api/lms/pengumuman', { mapelId: m1, judul: 'x', isi: 'y' })).status === 403, 'siswa tidak bisa membuat pengumuman');
r = await post('ga', '/api/lms/pengumuman', { mapelId: m1, judul: 'Ulangan', isi: 'Ulangan hari Senin' });
ok(r.status === 200, 'guru membuat pengumuman');
const png = r.body.data.id;

r = await post('s1', '/api/lms/komentar', { materiId: mat1, isi: 'Pak, bagian 2 maksudnya apa?' });
ok(r.status === 200, 'siswa berkomentar di materi');
const kom1 = r.body.data.id;
ok((await post('s2', '/api/lms/komentar', { materiId: mat1, isi: 'x' })).status === 404, 'siswa kelas lain tidak bisa berkomentar');
ok((await post('s1', '/api/lms/komentar', { materiId: matDraf, isi: 'x' })).status === 404, 'tidak bisa berkomentar di materi draf');
ok((await post('s1', '/api/lms/komentar', { materiId: mat1, tugasId: tg1, isi: 'x' })).status === 404, 'komentar dengan dua target ditolak');
r = await post('ga', '/api/lms/komentar', { materiId: mat1, isi: 'Maksudnya begini...' });
const komGuru = r.body.data.id;
await post('s1', '/api/lms/komentar', { pengumumanId: png, isi: 'Siap pak' });
r = await req('s1', `/api/lms/komentar?materiId=${mat1}`);
ok(r.status === 200 && r.body.komentar.length === 2 && r.body.komentar[1].peranPenulis === 'GURU', 'diskusi materi tampil berurutan');
ok(r.body.komentar[0].bolehHapus === true && r.body.komentar[1].bolehHapus === false, 'siswa hanya boleh menghapus komentarnya sendiri');
ok((await del('s1', `/api/lms/komentar?id=${komGuru}`)).status === 403, 'siswa tidak bisa menghapus komentar guru');
ok((await del('ga', `/api/lms/komentar?id=${kom1}`)).status === 200, 'guru menghapus komentar siswa');
r = await req('s1', `/api/lms/mapel/${m1}`);
ok(r.body.pengumuman[0]?.jumlahKomentar === 1, 'jumlah komentar pengumuman tampil');

// ---------- Ujian per kelas ----------
const daftarUjian = (await req('admin', '/api/admin/ujian')).body;
const aktifSemula = daftarUjian.find((u) => u.isActive);
r = await post('admin', '/api/admin/ujian', { nama: `Ulangan Mat ${t}`, durasiMenit: 30, mapelId: m1 });
ok(r.status === 200 && r.body.data.mapelId === m1, 'admin membuat ujian untuk mapel');
const ujianKelas = r.body.data.id;
ok((await post('admin', '/api/admin/ujian', { nama: 'x', mapelId: 99999999 })).status === 400, 'mapel ujian tidak dikenal ditolak');
await post('admin', '/api/admin/soal', { pertanyaan: `Soal LMS ${t}`, opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', jawabanBenar: 'A', mataPelajaran: 'Matematika', ujianId: ujianKelas });
await put('admin', '/api/admin/ujian', { id: ujianKelas, isActive: true });
r = await req('s2', '/api/ujian');
ok(r.status === 200 && r.body.status === 'bukan_kelas' && r.body.kelas === K1, 'siswa kelas lain tidak bisa mengerjakan ujian kelas');
r = await req('s1', '/api/ujian');
ok(r.status === 200 && r.body.status === 'ok', 'siswa kelasnya bisa mengerjakan ujian kelas');
r = await req('s1', `/api/lms/mapel/${m1}`);
ok(r.body.ujian.some((u) => u.id === ujianKelas && u.isActive), 'ujian tampil di halaman mapel');
// Kembalikan ujian aktif semula agar suite lain tidak terpengaruh
if (aktifSemula) await put('admin', '/api/admin/ujian', { id: aktifSemula.id, isActive: true });

// ---------- Hapus, ganti nama, backup ----------
r = await del('admin', `/api/admin/kelas?jenis=mapel&id=${m1}`);
ok(r.status === 400, 'mapel yang masih berisi tidak bisa dihapus');
ok((await del('admin', `/api/admin/kelas?jenis=kelas&id=${k1.id}`)).status === 400, 'kelas yang masih punya mapel tidak bisa dihapus');
r = await put('admin', '/api/admin/kelas', { jenis: 'kelas', id: k1.id, nama: `${K1}-baru` });
ok(r.status === 200, 'admin mengganti nama kelas');
r = await req('s1', '/api/lms/kelas');
ok(r.body.kelasSaya === `${K1}-baru` && r.body.mapel.some((m) => m.id === m1), 'kelas siswa ikut berganti & tetap anggota');

r = await req('admin', '/api/admin/backup');
ok(r.status === 200 && r.body.data.mapel.some((m) => m.id === m1) && r.body.data.pengumpulanTugas.some((p) => p.id === kumpul)
  && r.body.data.materiDibaca.some((d) => d.materiId === mat1), 'backup memuat data LMS');

ok((await del('ga', `/api/lms/tugas?id=${tg1}`)).status === 200, 'guru menghapus tugas beserta pengumpulannya');
ok((await del('ga', `/api/lms/materi?id=${matDraf}`)).status === 200, 'guru menghapus materi');
ok((await del('ga', `/api/lms/pengumuman?id=${png}`)).status === 200, 'guru menghapus pengumuman');

r = await del('admin', `/api/admin/akun?id=${guruA}`);
ok(r.status === 200, 'akun guru bisa dihapus');
r = await req('admin', '/api/admin/kelas');
const m1Baru = r.body.kelas.flatMap((k) => k.mapel).find((m) => m.id === m1);
ok(m1Baru && m1Baru.guru === null, 'mapel guru yang dihapus menjadi tanpa guru');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${m2}`)).status === 200, 'mapel kosong bisa dihapus');
