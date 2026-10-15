import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { ujianAktifUntuk } from '@/lib/ujian-peserta';

// Jadwal & durasi ujian CAT yang berlaku untuk kelas pengguna yang login (null bila tidak ada).
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { nomorPeserta: session.nomorPeserta }, select: { id: true, role: true, kelas: true } });
    if (!user) return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 401 });
    const { ujian } = await ujianAktifUntuk(user);
    return NextResponse.json({
      durasiMenit: ujian?.durasiMenit ?? 0,
      jadwalMulai: ujian?.jadwalMulai ?? null,
      jadwalSelesai: ujian?.jadwalSelesai ?? null,
      ujianId: ujian?.id ?? null,
      namaUjian: ujian?.nama ?? null,
    });
  } catch (error) {
    console.error('ERROR PADA GET PENGATURAN:', error);
    return NextResponse.json({ message: 'Gagal mengambil pengaturan' }, { status: 500 });
  }
}
