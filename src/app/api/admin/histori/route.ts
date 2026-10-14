import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  try {
    const auth = await verifyAdminSession();
    if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

    const histori = await prisma.historiUjian.findMany({
      include: { user: { select: { id: true, nomorPeserta: true, nama: true, ruang: true, sesi: true } } },
      orderBy: { waktuSelesai: 'desc' },
    });

    return NextResponse.json(histori);
  } catch (error) {
    console.error('ERROR HISTORI:', error);
    return NextResponse.json({ message: 'Gagal mengambil data histori' }, { status: 500 });
  }
}
