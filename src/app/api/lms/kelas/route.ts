import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, mapelPengguna } from '@/lib/lms';

// Daftar mapel yang bisa dibuka pengguna (beranda LMS)
export async function GET() {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const mapel = await mapelPengguna(user);

    // Siswa: jumlah tugas yang belum dikumpulkan per mapel
    let tugasBelum: Record<number, number> = {};
    if (user.role === 'PESERTA' && mapel.length) {
      const tugas = await prisma.tugas.findMany({
        where: { mapelId: { in: mapel.map((m) => m.id) }, terbit: true, pengumpulan: { none: { userId: user.id } } },
        select: { mapelId: true },
      });
      tugasBelum = tugas.reduce<Record<number, number>>((acc, t) => ({ ...acc, [t.mapelId]: (acc[t.mapelId] ?? 0) + 1 }), {});
    }

    const kelasSaya = user.role === 'PESERTA'
      ? (await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true } }))?.kelas ?? ''
      : '';

    return NextResponse.json({
      role: user.role,
      nama: user.nama,
      kelasSaya,
      mapel: mapel.map((m) => ({
        id: m.id,
        nama: m.nama,
        deskripsi: m.deskripsi,
        kelas: m.kelas,
        guru: m.guru,
        jumlahMateri: m._count.materi,
        jumlahTugas: m._count.tugas,
        tugasBelum: tugasBelum[m.id] ?? 0,
      })),
    });
  } catch (error) {
    console.error('ERROR LMS KELAS:', error);
    return NextResponse.json({ message: 'Gagal memuat kelas' }, { status: 500 });
  }
}
