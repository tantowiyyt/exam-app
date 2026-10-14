import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { nomorPeserta: session.nomorPeserta },
      select: { id: true, sudahUjian: true, nilai: true },
    });

    if (!user) {
      return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 404 });
    }

    if (!user.sudahUjian) {
      return NextResponse.json({ sudahUjian: false, histori: null });
    }

    const histori = await prisma.historiUjian.findFirst({
      where: { userId: user.id },
      orderBy: { waktuSelesai: 'desc' },
    });

    if (!histori) {
      return NextResponse.json({ sudahUjian: true, histori: null });
    }

    return NextResponse.json({
      sudahUjian: true,
      histori: {
        waktuMulai: histori.waktuMulai,
        waktuSelesai: histori.waktuSelesai,
        totalSoal: histori.totalSoal,
        jumlahBenar: histori.jumlahBenar,
        jumlahSalah: histori.jumlahSalah,
        nilaiAkhir: histori.nilaiAkhir,
        skorPerMapel: histori.skorPerMapel ? JSON.parse(histori.skorPerMapel) : null,
      },
    });
  } catch (error) {
    console.error('ERROR HISTORY:', error);
    return NextResponse.json({ message: 'Gagal mengambil data histori' }, { status: 500 });
  }
}
