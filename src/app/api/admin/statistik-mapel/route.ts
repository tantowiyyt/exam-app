import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  try {
    const auth = await verifyAdminSession();
    if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

    const historiList = await prisma.historiUjian.findMany({
      select: { skorPerMapel: true },
    });

    // Aggregate scores per mapel
    const mapelData: Record<string, { total: number; count: number }> = {};

    for (const h of historiList) {
      if (!h.skorPerMapel) continue;
      try {
        const skor = JSON.parse(h.skorPerMapel) as Record<string, number>;
        for (const [mapel, nilai] of Object.entries(skor)) {
          if (!mapelData[mapel]) mapelData[mapel] = { total: 0, count: 0 };
          mapelData[mapel].total += nilai;
          mapelData[mapel].count++;
        }
      } catch {}
    }

    const statistik = Object.entries(mapelData).map(([nama, data]) => ({
      nama,
      rataRata: data.count > 0 ? Math.round(data.total / data.count) : 0,
      totalUjian: data.count,
    }));

    // Sort by total participants
    statistik.sort((a, b) => b.totalUjian - a.totalUjian);

    return NextResponse.json({ statistik, totalHistori: historiList.length });
  } catch (error) {
    console.error('ERROR STATISTIK:', error);
    return NextResponse.json({ message: 'Gagal mengambil statistik' }, { status: 500 });
  }
}
