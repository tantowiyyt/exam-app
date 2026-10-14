import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, mapelPengguna, whereTugasSiswa } from '@/lib/lms';

// Daftar mapel yang bisa dibuka pengguna (beranda LMS)
export async function GET() {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const mapel = await mapelPengguna(user);

    // Siswa: tugas yang belum dikumpulkan / diminta revisi (jumlah per mapel + daftar terdekat tenggatnya)
    let tugasBelum: Record<number, number> = {};
    let agenda: { id: number; jenis: 'tugas' | 'kuis'; judul: string; tenggat: Date | null; revisi: boolean; mapel: { id: number; nama: string } }[] = [];
    if (user.role === 'PESERTA' && mapel.length) {
      const rows = await prisma.tugas.findMany({
        where: {
          mapelId: { in: mapel.map((m) => m.id) },
          AND: [
            whereTugasSiswa(user.id),
            { OR: [{ pengumpulan: { none: { userId: user.id } } }, { pengumpulan: { some: { userId: user.id, status: 'revisi' } } }] },
          ],
        },
        select: {
          id: true, judul: true, tenggat: true, mapel: { select: { id: true, nama: true } },
          pengumpulan: { where: { userId: user.id }, select: { status: true } },
        },
      });
      const tugas = rows.map(({ pengumpulan, ...t }) => ({ ...t, jenis: 'tugas' as const, revisi: pengumpulan[0]?.status === 'revisi' }));
      // Kuis yang sedang dibuka dan belum pernah dikerjakan (tenggat = waktu tutup)
      const now = new Date();
      const kuis = (await prisma.kuis.findMany({
        where: {
          mapelId: { in: mapel.map((m) => m.id) }, terbit: true,
          AND: [{ OR: [{ mulai: null }, { mulai: { lte: now } }] }, { OR: [{ selesai: null }, { selesai: { gt: now } }] }],
          percobaan: { none: { userId: user.id, selesaiAt: { not: null } } },
        },
        select: { id: true, judul: true, selesai: true, mapel: { select: { id: true, nama: true } } },
      })).map((k) => ({ id: k.id, jenis: 'kuis' as const, judul: k.judul, tenggat: k.selesai, revisi: false, mapel: k.mapel }));
      tugasBelum = [...tugas, ...kuis].reduce<Record<number, number>>((acc, t) => ({ ...acc, [t.mapel.id]: (acc[t.mapel.id] ?? 0) + 1 }), {});
      // Revisi dulu, lalu tenggat terdekat (yang sudah lewat paling atas), tanpa tenggat di akhir
      agenda = [...tugas, ...kuis]
        .sort((a, b) => Number(b.revisi) - Number(a.revisi) || (a.tenggat?.getTime() ?? Infinity) - (b.tenggat?.getTime() ?? Infinity))
        .slice(0, 8);
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
        jumlahKuis: m._count.kuis,
        tugasBelum: tugasBelum[m.id] ?? 0,
      })),
      agenda,
    });
  } catch (error) {
    console.error('ERROR LMS KELAS:', error);
    return NextResponse.json({ message: 'Gagal memuat kelas' }, { status: 500 });
  }
}
