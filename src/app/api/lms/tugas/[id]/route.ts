import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, daftarBerkas, ditugaskan, idSiswa, sudahTerbit, bacaRubrik, bacaNilaiRubrik } from '@/lib/lms';

type BarisPengumpulan = Parameters<typeof daftarBerkas>[0] & Record<string, unknown>;
const denganBerkas = <T extends BarisPengumpulan & { nilaiRubrik: string }>(p: T | null) => (p ? { ...p, berkas: daftarBerkas(p), nilaiRubrik: bacaNilaiRubrik(p.nilaiRubrik) } : null);

// Detail tugas: siswa melihat pengumpulannya sendiri, pengelola melihat semua siswa yang ditugaskan
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/tugas/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const tugas = await prisma.tugas.findUnique({ where: { id: Number((await ctx.params).id) } });
    const akses = tugas ? await aksesMapel(auth.user, tugas.mapelId) : null;
    if (!tugas || !akses || (akses.peran === 'siswa' && (!sudahTerbit(tugas) || !ditugaskan(tugas, auth.user.id)))) {
      return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    }

    const mapel = { id: akses.mapel.id, nama: akses.mapel.nama, kelas: akses.mapel.kelas.nama };
    const untukSiswa = idSiswa(tugas.untukSiswa);
    const dataTugas = { ...tugas, rubrik: bacaRubrik(tugas.rubrik), berkas: daftarBerkas(tugas), untukSiswa: akses.peran === 'kelola' ? untukSiswa : [] };

    if (akses.peran === 'siswa') {
      const pengumpulan = await prisma.pengumpulanTugas.findUnique({
        where: { tugasId_userId: { tugasId: tugas.id, userId: auth.user.id } },
      });
      return NextResponse.json({ peran: akses.peran, mapel, tugas: dataTugas, pengumpulan: denganBerkas(pengumpulan) });
    }

    // Pengelola: siswa yang ditugaskan + pengumpulannya (yang belum mengumpulkan juga tampil)
    const [siswa, pengumpulan] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama, ...(untukSiswa.length ? { id: { in: untukSiswa } } : {}) },
        select: { id: true, nomorPeserta: true, nama: true },
        orderBy: { nama: 'asc' },
      }),
      prisma.pengumpulanTugas.findMany({ where: { tugasId: tugas.id } }),
    ]);
    const byUser = new Map(pengumpulan.map((p) => [p.userId, p]));
    // Siswa yang sudah pindah kelas / tidak lagi ditugaskan tetapi pernah mengumpulkan tetap ditampilkan
    const lain = pengumpulan.filter((p) => !siswa.some((s) => s.id === p.userId));
    const lainUser = lain.length
      ? await prisma.user.findMany({ where: { id: { in: lain.map((p) => p.userId) } }, select: { id: true, nomorPeserta: true, nama: true } })
      : [];

    return NextResponse.json({
      peran: akses.peran,
      mapel,
      tugas: dataTugas,
      daftar: [...siswa, ...lainUser].map((s) => ({ siswa: s, pengumpulan: denganBerkas(byUser.get(s.id) ?? null) })),
    });
  } catch (error) {
    console.error('ERROR GET TUGAS:', error);
    return NextResponse.json({ message: 'Gagal memuat tugas' }, { status: 500 });
  }
}
