import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, teks } from '@/lib/lms';
import { semesterDipilih, daftarSemester } from '@/lib/semester';
import { hitungRekapMapel, type Komponen } from '@/lib/rekap';
import { getInstansi } from '@/lib/pengaturan-aplikasi';
import { batasPredikat, predikat } from '@/lib/rapor';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Rapor (laporan hasil belajar) per siswa lintas mapel dalam satu semester.
// GET ?kelas=id&semester=id[&siswa=id]
//  - Admin: semua kelas. Guru: kelas yang ia ajar atau yang ia walikan (keterangan kelas memuat namanya).
//  - Siswa: hanya rapornya sendiri, berisi nilai yang sudah terlihat olehnya (draf/belum diumumkan tidak dihitung).
// Tanpa ?kelas (admin/guru): daftar kelas yang bisa dibuka.

const KOMPONEN: (keyof Komponen)[] = ['tugas', 'kuis', 'uh', 'uts', 'uas', 'ujian', 'presensi'];

/** Nama wali kelas dari keterangan kelas, mis. "Wali kelas: Siti Nurhaliza". */
function waliKelas(keterangan: string) {
  const m = /wali\s*kelas\s*:?\s*(.+)/i.exec(keterangan);
  return m ? m[1].trim() : '';
}

async function kelasBolehDibuka(user: { id: number; role: string; nama: string }) {
  const semua = await prisma.kelas.findMany({ orderBy: { nama: 'asc' }, include: { mapel: { select: { guruId: true } } } });
  if (user.role === 'ADMIN') return semua;
  if (user.role === 'GURU') {
    return semua.filter((k) => k.mapel.some((m) => m.guruId === user.id) || (user.nama && waliKelas(k.keterangan).toLowerCase() === user.nama.toLowerCase()));
  }
  return [];
}

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const q = new URL(request.url).searchParams;
    const semester = await semesterDipilih(q.get('semester'));
    const semesterList = (await daftarSemester()).map((s) => ({ id: s.id, label: s.label, aktif: s.aktif }));
    const staf = user.role === 'ADMIN' || user.role === 'GURU';

    // Kelas yang dibuka
    let kelas;
    let kelasList: { id: number; nama: string }[] = [];
    if (staf) {
      const boleh = await kelasBolehDibuka(user);
      kelasList = boleh.map((k) => ({ id: k.id, nama: k.nama }));
      if (!q.get('kelas')) return NextResponse.json({ peran: 'staf', semester, semesterList, kelasList });
      kelas = boleh.find((k) => k.id === Number(q.get('kelas')));
      if (!kelas) return NextResponse.json({ message: 'Kelas tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    } else {
      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true } });
      kelas = u?.kelas ? await prisma.kelas.findUnique({ where: { nama: u.kelas } }) : null;
      if (!kelas) return NextResponse.json({ message: 'Kelas Anda belum diatur. Hubungi admin.' }, { status: 404 });
    }

    const siswaWhere = staf
      ? { role: 'PESERTA', kelas: kelas.nama, ...(q.get('siswa') ? { id: Number(q.get('siswa')) } : {}) }
      : { id: user.id };
    const siswa = await prisma.user.findMany({
      where: siswaWhere,
      select: { id: true, nomorPeserta: true, nama: true, jenisKelamin: true },
      orderBy: { nama: 'asc' },
    });
    const mapel = await prisma.mapel.findMany({
      where: { kelasId: kelas.id },
      include: { guru: { select: { nama: true } } },
      orderBy: { nama: 'asc' },
    });

    // Rekap tiap mapel untuk semua siswa sekaligus
    const ids = siswa.map((x) => x.id);
    const [i, deskripsi, catatan] = await Promise.all([
      getInstansi(),
      prisma.deskripsiRapor.findMany({ where: { semesterId: semester.id, userId: { in: ids }, mapelId: { in: mapel.map((m) => m.id) } } }),
      prisma.catatanRapor.findMany({ where: { semesterId: semester.id, userId: { in: ids } } }),
    ]);
    const batas = batasPredikat(i);
    const hasil = await Promise.all(mapel.map(async (m) => ({ mapel: m, ...(await hitungRekapMapel(m, siswa, semester, { kelola: staf, userId: user.id })) })));

    // Komponen yang ditampilkan = yang dipakai (berbobot) atau punya nilai di salah satu mapel
    const komponen = KOMPONEN.filter((k) => hasil.some((h) => (h.berbobot ? h.bobot[k] > 0 : false) || h.baris.some((b) => b.komponen[k] !== null)));

    const rapor = siswa.map((s) => {
      const nilai = hasil.map((h) => {
        const b = h.baris.find((x) => x.siswa.id === s.id)!;
        return { mapelId: h.mapel.id, komponen: b.komponen, nilaiAkhir: b.rataRata, tuntas: b.tuntas, kehadiran: b.kehadiran };
      });
      const akhir = nilai.map((n) => n.nilaiAkhir).filter((x): x is number => x !== null);
      const hadir = nilai.reduce((a, n) => ({
        H: a.H + n.kehadiran.H, I: a.I + n.kehadiran.I, S: a.S + n.kehadiran.S, A: a.A + n.kehadiran.A,
        kosong: a.kosong + n.kehadiran.kosong, pertemuan: a.pertemuan + n.kehadiran.pertemuan,
      }), { H: 0, I: 0, S: 0, A: 0, kosong: 0, pertemuan: 0 });
      return {
        siswa: { id: s.id, nomorPeserta: s.nomorPeserta, nama: s.nama, jenisKelamin: s.jenisKelamin },
        nilai: nilai.map((n) => ({
          mapelId: n.mapelId, komponen: n.komponen, nilaiAkhir: n.nilaiAkhir, tuntas: n.tuntas, predikat: predikat(n.nilaiAkhir, batas),
          deskripsi: deskripsi.find((d) => d.userId === s.id && d.mapelId === n.mapelId)?.deskripsi ?? '',
        })),
        catatan: catatan.find((c) => c.userId === s.id)?.catatan ?? '',
        rataRata: akhir.length ? Math.round((akhir.reduce((a, b) => a + b, 0) / akhir.length) * 10) / 10 : null,
        jumlahTuntas: nilai.filter((n) => n.tuntas === true).length,
        jumlahBerKkm: nilai.filter((n) => n.tuntas !== null).length,
        kehadiran: { ...hadir, persen: hadir.pertemuan ? Math.round((hadir.H / hadir.pertemuan) * 1000) / 10 : null },
        peringkat: null as number | null,
      };
    });
    // Peringkat kelas (hanya untuk staf & bila rapor satu kelas penuh)
    if (staf && !q.get('siswa')) {
      const urut = rapor.filter((r) => r.rataRata !== null).sort((a, b) => b.rataRata! - a.rataRata!);
      urut.forEach((r, i) => { r.peringkat = i > 0 && urut[i - 1].rataRata === r.rataRata ? urut[i - 1].peringkat : i + 1; });
    }

    return NextResponse.json({
      batasPredikat: batas,
      peran: staf ? 'staf' : 'siswa',
      semester: { id: semester.id, label: semester.label, tahunAjaran: semester.tahunAjaran, semester: semester.semester, aktif: semester.aktif },
      semesterList,
      kelasList,
      kelas: { id: kelas.id, nama: kelas.nama, wali: waliKelas(kelas.keterangan) },
      sekolah: {
        nama: i.namaInstansi, alamat: i.alamat, kota: i.kota, logo: i.logo, namaAplikasi: i.namaAplikasi,
        penandatangan: { jabatan: i.jabatanPenandatangan, nama: i.namaPenandatangan, nip: i.nipPenandatangan },
      },
      komponen,
      mapel: hasil.map((h) => ({ id: h.mapel.id, nama: h.mapel.nama, guru: h.mapel.guru?.nama ?? '', kkm: h.mapel.kkm, berbobot: h.berbobot })),
      rapor,
    });
  } catch (error) {
    console.error('ERROR RAPOR:', error);
    return NextResponse.json({ message: 'Gagal memuat rapor' }, { status: 500 });
  }
}

// Catatan wali kelas untuk satu siswa: { siswa, semester?, catatan } — staf yang boleh membuka kelas siswa itu
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    if (user.role === 'PESERTA') return NextResponse.json({ message: 'Tidak diizinkan' }, { status: 403 });
    const body = await request.json();
    const siswa = await prisma.user.findFirst({ where: { id: Number(body.siswa), role: 'PESERTA' }, select: { id: true, nama: true, kelas: true } });
    const boleh = siswa && (await kelasBolehDibuka(user)).some((k) => k.nama === siswa.kelas);
    if (!siswa || !boleh) return NextResponse.json({ message: 'Siswa tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const semester = await semesterDipilih(body.semester === undefined ? null : String(body.semester));
    const catatan = teks(body.catatan, 1000);
    const where = { userId_semesterId: { userId: siswa.id, semesterId: semester.id } };
    if (catatan) await prisma.catatanRapor.upsert({ where, update: { catatan }, create: { userId: siswa.id, semesterId: semester.id, catatan } });
    else await prisma.catatanRapor.deleteMany({ where: { userId: siswa.id, semesterId: semester.id } });
    await createAuditLog({ action: 'CATATAN_RAPOR', target: `Siswa #${siswa.id} ${siswa.nama}`, details: { semester: semester.label }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: catatan ? 'Catatan wali kelas disimpan' : 'Catatan dihapus' });
  } catch (error) {
    console.error('ERROR CATATAN RAPOR:', error);
    return NextResponse.json({ message: 'Gagal menyimpan catatan' }, { status: 500 });
  }
}
