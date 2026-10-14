import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';

// Detail materi. Siswa yang membuka otomatis tercatat "sudah dibaca".
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/materi/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const materi = await prisma.materi.findUnique({ where: { id: Number((await ctx.params).id) } });
    const akses = materi ? await aksesMapel(auth.user, materi.mapelId) : null;
    if (!materi || !akses || (akses.peran === 'siswa' && !materi.terbit)) {
      return NextResponse.json({ message: 'Materi tidak ditemukan' }, { status: 404 });
    }

    if (akses.peran === 'siswa') {
      await prisma.materiDibaca.upsert({
        where: { userId_materiId: { userId: auth.user.id, materiId: materi.id } },
        update: {},
        create: { userId: auth.user.id, materiId: materi.id },
      });
    }

    const pembaca = akses.peran === 'kelola'
      ? await prisma.materiDibaca.findMany({
          where: { materiId: materi.id },
          select: { createdAt: true, user: { select: { nama: true, nomorPeserta: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    return NextResponse.json({
      peran: akses.peran,
      mapel: { id: akses.mapel.id, nama: akses.mapel.nama, kelas: akses.mapel.kelas.nama },
      materi,
      pembaca: pembaca.map((p) => ({ nama: p.user.nama, nomorPeserta: p.user.nomorPeserta, waktu: p.createdAt })),
    });
  } catch (error) {
    console.error('ERROR GET MATERI:', error);
    return NextResponse.json({ message: 'Gagal memuat materi' }, { status: 500 });
  }
}
