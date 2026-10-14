import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const rekapNilai = await prisma.user.findMany({
      where: { role: 'PESERTA' },
      orderBy: { nilai: 'desc' },
      select: { id: true, nomorPeserta: true, nama: true, ruang: true, sesi: true, nilai: true, sudahUjian: true, createdAt: true },
    });
    return NextResponse.json(rekapNilai);
  } catch {
    return NextResponse.json({ message: 'Gagal memuat rekap nilai' }, { status: 500 });
  }
}
