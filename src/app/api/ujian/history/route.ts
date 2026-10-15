import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { ujianAktifUntuk } from '@/lib/ujian-peserta';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { nomorPeserta: session.nomorPeserta },
      select: { id: true, role: true, kelas: true },
    });

    if (!user) {
      return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 404 });
    }

    // Status per ujian: ujian aktif untuk kelasnya yang belum dikerjakan = belum ada hasil
    const { ujian, sudah } = await ujianAktifUntuk(user);
    if (ujian && !sudah) {
      return NextResponse.json({ sudahUjian: false, histori: null });
    }

    const histori = await prisma.historiUjian.findFirst({
      where: { userId: user.id, ...(ujian ? { ujianId: ujian.id } : {}) },
      orderBy: { waktuSelesai: 'desc' },
    });
    if (!ujian && !histori) return NextResponse.json({ sudahUjian: false, histori: null });

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
