import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { cache, CACHE_TTL, CACHE_KEYS } from '@/lib/cache';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    // Check cache first
    const cached = cache.get(CACHE_KEYS.STATS);
    if (cached) {
      return NextResponse.json(cached);
    }

    const totalPeserta = await prisma.user.count({
      where: { role: 'PESERTA' },
    });

    const totalSoal = await prisma.soal.count();

    const sudahUjian = await prisma.user.count({
      where: { role: 'PESERTA', sudahUjian: true },
    });

    const belumUjian = totalPeserta - sudahUjian;

    const rataNilai = await prisma.user.aggregate({
      where: { role: 'PESERTA', sudahUjian: true },
      _avg: { nilai: true },
    });

    const activeUjian = await prisma.ujian.findFirst({
      where: { isActive: true },
    });

    const result = {
      totalPeserta,
      totalSoal,
      sudahUjian,
      belumUjian,
      rataNilai: rataNilai._avg.nilai ? Math.round(rataNilai._avg.nilai) : 0,
      durasiMenit: activeUjian?.durasiMenit || 60,
    };

    // Cache the result
    cache.set(CACHE_KEYS.STATS, result, { ttl: CACHE_TTL.SHORT });

    return NextResponse.json(result);
  } catch (error) {
    console.error('ERROR PADA GET STATS:', error);
    return NextResponse.json({ message: 'Gagal mengambil statistik' }, { status: 500 });
  }
}
