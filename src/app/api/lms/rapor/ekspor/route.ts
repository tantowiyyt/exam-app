import { prisma } from '@/lib/prisma';
import { verifyRole } from '@/lib/admin-auth';
import { semesterDipilih } from '@/lib/semester';
import { hitungRekapMapel } from '@/lib/rekap';
import { getInstansi } from '@/lib/pengaturan-aplikasi';
import { batasPredikat, predikat, bacaDataRapor } from '@/lib/rapor';
import { whereAnggota } from '@/lib/anggota';
import { kelasBolehDibuka } from '@/lib/wali';
import { tulisXlsx } from '@/lib/xlsx';

// Ekspor nilai satu kelas untuk diunggah/disalin ke e-Rapor (.xlsx). GET ?kelas=id&semester=id
// Lembar "Rekap" (semua mapel), satu lembar per mapel (NISN, NIS, Nama, Nilai Akhir, Predikat, Capaian Kompetensi),
// dan "Kehadiran & Ekskul". Kolom NISN dipakai e-Rapor untuk mencocokkan siswa; urutan kolom template e-Rapor
// bisa berbeda per versi — salin kolom yang sesuai.
export async function GET(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  try {
    const q = new URL(request.url).searchParams;
    const kelas = (await kelasBolehDibuka(auth.user)).find((k) => k.id === Number(q.get('kelas')));
    if (!kelas) return new Response('Kelas tidak ditemukan atau bukan kelas Anda', { status: 404 });
    const semester = await semesterDipilih(q.get('semester'));
    const siswa = await prisma.user.findMany({
      where: await whereAnggota(kelas.nama, semester),
      select: { id: true, nomorPeserta: true, nama: true, nisn: true, jenisKelamin: true },
      orderBy: { nama: 'asc' },
    });
    const mapel = await prisma.mapel.findMany({ where: { kelasId: kelas.id }, orderBy: { nama: 'asc' } });
    const ids = siswa.map((s) => s.id);
    const [instansi, deskripsi, catatan, dataRapor] = await Promise.all([
      getInstansi(),
      prisma.deskripsiRapor.findMany({ where: { semesterId: semester.id, userId: { in: ids } } }),
      prisma.catatanRapor.findMany({ where: { semesterId: semester.id, userId: { in: ids } } }),
      prisma.dataRapor.findMany({ where: { semesterId: semester.id, userId: { in: ids } } }),
    ]);
    const batas = batasPredikat(instansi);
    const rekap = await Promise.all(mapel.map(async (m) => ({ m, r: await hitungRekapMapel(m, siswa, semester, { kelola: true }) })));
    const nilai = (mapelIdx: number, userId: number) => rekap[mapelIdx].r.baris.find((b) => b.siswa.id === userId);

    const kepala = ['No', 'NISN', 'NIS', 'Nama', 'L/P'];
    const lembarRekap = [
      [...kepala, ...mapel.map((m) => m.nama), 'Rata-rata'],
      ...siswa.map((s, i) => {
        const akhir = mapel.map((_, j) => nilai(j, s.id)?.rataRata ?? null);
        const ada = akhir.filter((x): x is number => x !== null);
        return [i + 1, s.nisn, s.nomorPeserta, s.nama, s.jenisKelamin ?? '', ...akhir, ada.length ? Math.round((ada.reduce((a, b) => a + b, 0) / ada.length) * 10) / 10 : null];
      }),
    ];
    const lembarMapel = mapel.map((m, j) => ({
      nama: m.nama,
      baris: [
        [...kepala, 'Nilai Akhir', 'Predikat', 'Capaian Kompetensi'],
        ...siswa.map((s, i) => {
          const v = nilai(j, s.id)?.rataRata ?? null;
          return [i + 1, s.nisn, s.nomorPeserta, s.nama, s.jenisKelamin ?? '', v === null ? null : Math.round(v), predikat(v, batas) ?? '',
            deskripsi.find((d) => d.userId === s.id && d.mapelId === m.id)?.deskripsi ?? ''];
        }),
      ],
    }));
    const lembarLain = [
      ['No', 'NISN', 'NIS', 'Nama', 'Sakit', 'Izin', 'Tanpa Keterangan', 'Ekstrakurikuler', 'Prestasi', 'Kokurikuler', 'Catatan Wali Kelas', 'Keputusan'],
      ...siswa.map((s, i) => {
        // Ketidakhadiran: isian wali kelas, atau jumlah pertemuan dari presensi semua mapel
        const hadir = rekap.reduce((a, { r }) => {
          const k = r.baris.find((b) => b.siswa.id === s.id)?.kehadiran;
          return k ? { S: a.S + k.S, I: a.I + k.I, A: a.A + k.A } : a;
        }, { S: 0, I: 0, A: 0 });
        const d = bacaDataRapor(dataRapor.find((x) => x.userId === s.id), hadir);
        const keputusan = d.keputusan === 'naik' ? `Naik ke kelas ${d.keKelas}` : d.keputusan === 'tinggal' ? `Tinggal di kelas ${d.keKelas || kelas.nama}` : d.keputusan === 'lulus' ? 'Lulus' : '';
        return [i + 1, s.nisn, s.nomorPeserta, s.nama, d.ketidakhadiran.S, d.ketidakhadiran.I, d.ketidakhadiran.A,
          d.ekskul.map((e) => `${e.nama}${e.predikat ? ` (${e.predikat})` : ''}${e.keterangan ? `: ${e.keterangan}` : ''}`).join('; '),
          d.prestasi.map((p) => `${p.jenis}${p.keterangan ? ` (${p.keterangan})` : ''}`).join('; '),
          d.kokurikuler, catatan.find((c) => c.userId === s.id)?.catatan ?? '', keputusan];
      }),
    ];
    const buf = tulisXlsx([{ nama: 'Rekap', baris: lembarRekap }, ...lembarMapel, { nama: 'Kehadiran & Ekskul', baris: lembarLain }]);
    const namaFile = `nilai-erapor-${kelas.nama}-${semester.label}.xlsx`.replace(/[^\w.-]+/g, '_');
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${namaFile}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('ERROR EKSPOR ERAPOR:', error);
    return new Response('Gagal membuat file ekspor', { status: 500 });
  }
}
