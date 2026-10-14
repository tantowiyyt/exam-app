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
const s2Id = (await post('admin', '/api/admin/peserta', { nomorPeserta: `s2-${t}`, nama: 'Siswa Dua', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: K2 })).body.data.id;

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
ok(r.body.agenda?.length === 1 && r.body.agenda[0].id === tg1 && r.body.agenda[0].mapel.id === m1, 'tugas belum dikumpulkan tampil di agenda siswa');
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
r = await req('s1', '/api/lms/kelas');
ok(r.body.agenda.length === 0, 'tugas yang sudah dikumpulkan hilang dari agenda');

// ---------- Akses lampiran ----------
const tgL = (await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Tugas Lampiran' })).body.data.id;
const fileJwb = (await upload('s1', 'jawaban.pdf', pdf)).body.url;
await post('s1', '/api/lms/pengumpulan', { tugasId: tgL, jawaban: 'terlampir', lampiran: fileJwb, namaLampiran: 'jawaban.pdf' });
ok((await req('s1', fileJwb)).status === 200, 'siswa membuka lampiran jawabannya sendiri');
ok((await req('ga', fileJwb)).status === 200, 'guru pengampu membuka lampiran jawaban siswa');
ok((await req('gb', fileJwb)).status === 404, 'guru lain tidak bisa membuka lampiran jawaban');
ok((await req('s2', fileJwb)).status === 404, 'siswa kelas lain tidak bisa membuka lampiran jawaban');
ok((await req('admin', fileJwb)).status === 200, 'admin membuka semua lampiran');
await del('ga', `/api/lms/tugas?id=${tgL}`);
const fileMat = (await upload('ga', 'modul.pdf', pdf)).body.url;
const matLamp = (await post('ga', '/api/lms/materi', { mapelId: m1, judul: 'Modul', lampiran: fileMat, namaLampiran: 'modul.pdf', terbit: false })).body.data.id;
ok((await req('s1', fileMat)).status === 404, 'lampiran materi draf tidak bisa dibuka siswa');
await put('ga', '/api/lms/materi', { id: matLamp, judul: 'Modul', lampiran: fileMat, namaLampiran: 'modul.pdf', terbit: true });
ok((await req('s1', fileMat)).status === 200, 'lampiran materi terbit bisa dibuka siswa kelasnya');
ok((await req('s2', fileMat)).status === 404, 'lampiran materi tidak bisa dibuka siswa kelas lain');
await del('ga', `/api/lms/materi?id=${matLamp}`);

// ---------- Rekap nilai ----------
await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Lewat Tenggat', tenggat: new Date(Date.now() - 86400000).toISOString(), nilaiMaks: 50 });
r = await req('ga', `/api/lms/mapel/${m1}/nilai`);
const bS1 = r.body.baris?.find((b) => b.siswa.id === s1Id);
ok(r.status === 200 && r.body.peran === 'kelola' && r.body.kolom.length === 2 && bS1?.nilai[`t${tg1}`] === 90, 'guru melihat rekap nilai mapel');
ok(bS1?.rataRata === 45, 'rata-rata = persen nilai, tugas lewat tenggat tanpa kumpul dihitung 0');
r = await req('s1', `/api/lms/mapel/${m1}/nilai`);
ok(r.status === 200 && r.body.peran === 'siswa' && r.body.baris.length === 1 && r.body.baris[0].siswa.id === s1Id, 'siswa hanya melihat nilainya sendiri');
ok((await req('s2', `/api/lms/mapel/${m1}/nilai`)).status === 404, 'siswa kelas lain tidak bisa melihat rekap nilai');
ok((await req('gb', `/api/lms/mapel/${m1}/nilai`)).status === 404, 'guru lain tidak bisa melihat rekap nilai');

// ---------- Penugasan ke siswa tertentu, banyak lampiran, revisi, terlambat, ZIP, salin, notifikasi ----------
const s3Id = (await post('admin', '/api/admin/peserta', { nomorPeserta: `s3-${t}`, nama: 'Siswa Tiga', password: 'siswa123', ruang: 'L1', sesi: '1', kelas: K1 })).body.data.id;
await login('s3', `s3-${t}`, 'siswa123');
ok((await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'x', untukSiswa: [s2Id] })).status === 400, 'tugas tidak bisa ditugaskan ke siswa kelas lain');
r = await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Remedial', untukSiswa: [s3Id] });
ok(r.status === 200 && r.body.data.untukSiswa === `,${s3Id},`, 'guru membuat tugas untuk siswa tertentu');
const tgS = r.body.data.id;
ok((await req('s1', `/api/lms/tugas/${tgS}`)).status === 404, 'siswa yang tidak ditugaskan tidak bisa membuka tugas');
ok((await post('s1', '/api/lms/pengumpulan', { tugasId: tgS, jawaban: 'x' })).status === 404, 'siswa yang tidak ditugaskan tidak bisa mengumpulkan');
ok((await post('s1', '/api/lms/komentar', { tugasId: tgS, isi: 'x' })).status === 404, 'siswa yang tidak ditugaskan tidak bisa berkomentar');
ok(!(await req('s1', `/api/lms/mapel/${m1}`)).body.tugas.some((x) => x.id === tgS), 'tugas siswa tertentu tidak tampil untuk siswa lain');
r = await req('s3', `/api/lms/mapel/${m1}`);
ok(r.body.tugas.some((x) => x.id === tgS), 'tugas tampil untuk siswa yang ditugaskan');
r = await req('ga', `/api/lms/tugas/${tgS}`);
ok(r.body.daftar.length === 1 && r.body.daftar[0].siswa.id === s3Id && r.body.tugas.untukSiswa[0] === s3Id, 'guru hanya melihat siswa yang ditugaskan');
r = await req('ga', `/api/lms/mapel/${m1}/nilai`);
ok(r.body.baris.find((b) => b.siswa.id === s1Id)?.nilai[`t${tgS}`] === 'na', 'rekap nilai: tugas yang tidak ditugaskan = n/a');

const f1 = (await upload('s3', 'hal1.pdf', pdf)).body.url;
const f2 = (await upload('s3', 'hal2.pdf', pdf)).body.url;
ok((await post('s3', '/api/lms/pengumpulan', { tugasId: tgS, berkas: Array.from({ length: 6 }, (_, i) => ({ url: f1.replace('.pdf', `${i}.pdf`), nama: 'a.pdf' })) })).status === 400, 'lebih dari 5 lampiran ditolak');
r = await post('s3', '/api/lms/pengumpulan', { tugasId: tgS, jawaban: 'Lihat lampiran', berkas: [{ url: f1, nama: 'hal1.pdf' }, { url: f2, nama: 'hal2.pdf' }] });
ok(r.status === 200, 'siswa mengumpulkan dengan 2 lampiran');
const kumpulS = r.body.data.id;
r = await req('s3', `/api/lms/tugas/${tgS}`);
ok(r.body.pengumpulan.berkas.length === 2 && r.body.pengumpulan.berkas[1].url === f2, 'kedua lampiran tersimpan');
ok((await req('ga', f2)).status === 200, 'guru membuka lampiran ke-2');
ok((await req('s1', f2)).status === 404, 'teman sekelas tidak bisa membuka lampiran jawaban ke-2');

r = await req('ga', `/api/lms/tugas/${tgS}/zip`);
ok(r.status === 200 && r.type === 'application/zip' && typeof r.body === 'string' && r.body.startsWith('PK'), 'guru mengunduh semua jawaban sebagai ZIP');
ok((await req('gb', `/api/lms/tugas/${tgS}/zip`)).status === 404 && (await req('s3', `/api/lms/tugas/${tgS}/zip`)).status === 404, 'ZIP hanya untuk pengelola mapel');

r = await req('ga', '/api/lms/notifikasi');
ok(r.status === 200 && r.body.items.some((n) => n.jenis === 'kumpul' && n.href.endsWith(`/tugas/${tgS}`)), 'guru mendapat notifikasi pengumpulan baru');
await post('ga', '/api/lms/notifikasi', {});
ok((await req('ga', '/api/lms/notifikasi')).body.jumlahBaru === 0, 'notifikasi bisa ditandai sudah dibaca');

ok((await put('ga', '/api/lms/pengumpulan', { id: kumpulS, aksi: 'revisi' })).status === 400, 'minta revisi tanpa catatan ditolak');
r = await put('ga', '/api/lms/pengumpulan', { id: kumpulS, aksi: 'revisi', catatanGuru: 'Halaman 2 buram, foto ulang' });
ok(r.status === 200 && r.body.data.status === 'revisi' && r.body.data.nilai === null, 'guru mengembalikan jawaban untuk revisi');
r = await req('s3', '/api/lms/kelas');
ok(r.body.agenda.some((x) => x.id === tgS && x.revisi), 'tugas revisi muncul di agenda siswa');
r = await req('s3', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.jenis === 'revisi') && r.body.jumlahBaru > 0, 'siswa mendapat notifikasi revisi');
r = await post('s3', '/api/lms/pengumpulan', { tugasId: tgS, jawaban: 'Sudah diperbaiki', berkas: [{ url: f1, nama: 'hal1.pdf' }] });
ok(r.status === 200 && r.body.data.status === 'dikumpulkan', 'siswa mengirim ulang setelah revisi');
r = await put('ga', '/api/lms/pengumpulan', { id: kumpulS, nilai: 80 });
ok(r.status === 200 && r.body.data.nilai === 80, 'guru menilai hasil revisi');
r = await req('s3', '/api/lms/notifikasi');
ok(r.body.items.some((n) => n.jenis === 'nilai' && n.judul.includes('80')), 'siswa mendapat notifikasi nilai');

const kemarin = new Date(Date.now() - 86400000).toISOString();
r = await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Tutup Tepat Waktu', tenggat: kemarin, terimaTerlambat: false });
ok(r.status === 200 && r.body.data.terimaTerlambat === false, 'guru membuat tugas yang tidak menerima terlambat');
ok((await post('s1', '/api/lms/pengumpulan', { tugasId: r.body.data.id, jawaban: 'telat' })).status === 409, 'pengumpulan setelah tenggat ditolak');
const tgTelat = (await post('ga', '/api/lms/tugas', { mapelId: m1, judul: 'Boleh Telat', tenggat: kemarin })).body.data.id;
ok((await post('s1', '/api/lms/pengumpulan', { tugasId: tgTelat, jawaban: 'telat' })).status === 200, 'pengumpulan terlambat diterima bila diizinkan');

const m3 = (await post('admin', '/api/admin/kelas', { jenis: 'mapel', kelasId: k2.id, nama: 'Matematika', guruId: guruA })).body.data.id;
ok((await post('ga', '/api/lms/tugas', { salinDari: tgS, mapelIds: [m2] })).status === 403, 'tidak bisa menyalin ke mapel guru lain');
ok((await post('gb', '/api/lms/tugas', { salinDari: tgS, mapelIds: [m2] })).status === 404, 'guru lain tidak bisa menyalin tugas');
r = await post('ga', '/api/lms/tugas', { salinDari: tgS, mapelIds: [m3] });
ok(r.status === 200 && r.body.data.length === 1 && r.body.data[0].mapelId === m3 && r.body.data[0].terbit === false && r.body.data[0].untukSiswa === '', 'guru menyalin tugas ke kelas lain sebagai draf');

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
// Beranda LMS: banner ujian CAT untuk kelasnya saja, ringkasan admin, perlu dinilai guru, saklar modul CAT
r = await req('s1', '/api/lms/kelas');
ok(r.body.ujianCat?.nama === `Ulangan Mat ${t}` && r.body.ujianCat.sudahUjian === false, 'beranda siswa menampilkan ujian CAT aktif kelasnya');
ok((await req('s2', '/api/lms/kelas')).body.ujianCat === null, 'ujian kelas lain tidak tampil di beranda siswa');
r = await req('admin', '/api/lms/kelas');
ok(r.body.ringkasan && r.body.ringkasan.kelas >= 2 && r.body.ringkasan.siswa >= 2 && Array.isArray(r.body.perluDinilai), 'beranda admin memuat ringkasan sekolah');
r = await req('ga', '/api/lms/kelas');
ok(r.body.ringkasan === null && Array.isArray(r.body.perluDinilai) && r.body.ujianCat === null, 'beranda guru memuat daftar perlu dinilai, tanpa ringkasan admin');
r = await fetch(BASE + '/api/identitas').then((x) => x.json());
ok(typeof r.namaAplikasi === 'string' && r.namaAplikasi && r.modulCat === true, 'identitas aplikasi bisa dibaca tanpa login');
ok((await put('admin', '/api/admin/instansi', { modulCat: 'salah' })).status === 400, 'status modul CAT tidak valid ditolak');
ok((await put('admin', '/api/admin/instansi', { namaAplikasi: '  ' })).status === 400, 'nama aplikasi kosong ditolak');
ok((await put('admin', '/api/admin/instansi', { modulCat: 'nonaktif', namaAplikasi: `Sekolah Uji ${t}` })).status === 200, 'admin menonaktifkan modul CAT');
r = await fetch(BASE + '/api/identitas').then((x) => x.json());
ok(r.modulCat === false && r.namaAplikasi === `Sekolah Uji ${t}`, 'identitas ikut berubah');
ok((await req('s1', '/api/lms/kelas')).body.ujianCat === null, 'banner ujian CAT hilang saat modul CAT nonaktif');
await put('admin', '/api/admin/instansi', { modulCat: 'aktif', namaAplikasi: 'E-Learning' });
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
ok(typeof r.body.lampiranLms?.[fileJwb.split('/').pop()] === 'string', 'backup memuat file lampiran LMS');

ok((await del('ga', `/api/lms/tugas?id=${tg1}`)).status === 200, 'guru menghapus tugas beserta pengumpulannya');
ok((await del('ga', `/api/lms/materi?id=${matDraf}`)).status === 200, 'guru menghapus materi');
ok((await del('ga', `/api/lms/pengumuman?id=${png}`)).status === 200, 'guru menghapus pengumuman');

r = await del('admin', `/api/admin/akun?id=${guruA}`);
ok(r.status === 200, 'akun guru bisa dihapus');
r = await req('admin', '/api/admin/kelas');
const m1Baru = r.body.kelas.flatMap((k) => k.mapel).find((m) => m.id === m1);
ok(m1Baru && m1Baru.guru === null, 'mapel guru yang dihapus menjadi tanpa guru');
ok((await del('admin', `/api/admin/kelas?jenis=mapel&id=${m2}`)).status === 200, 'mapel kosong bisa dihapus');
