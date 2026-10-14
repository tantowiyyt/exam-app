import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { cache, CACHE_TTL, CACHE_KEYS } from '@/lib/cache';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Check cache first
    const cached = cache.get(CACHE_KEYS.PENGATURAN);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get the active ujian, or fall back to default
    let ujian = await prisma.ujian.findFirst({
      where: { isActive: true },
    });

    if (!ujian) {
      // Fallback: create default ujian if none exists
      ujian = await prisma.ujian.create({
        data: {
          nama: 'Ujian Default',
          durasiMenit: 60,
          isActive: true,
        },
      });
    }

    const result = {
      durasiMenit: ujian.durasiMenit,
      jadwalMulai: ujian.jadwalMulai,
      jadwalSelesai: ujian.jadwalSelesai,
      ujianId: ujian.id,
      namaUjian: ujian.nama,
    };

    // Cache the result
    cache.set(CACHE_KEYS.PENGATURAN, result, { ttl: CACHE_TTL.MEDIUM });

    return NextResponse.json(result);
  } catch (error) {
    console.error('ERROR PADA GET PENGATURAN:', error);
    return NextResponse.json({ message: 'Gagal mengambil pengaturan' }, { status: 500 });
  }
}
