import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const activeExam = await prisma.ujian.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const ruangList = await prisma.user.groupBy({
      by: ['ruang', 'sesi', 'tanggalUjian'],
      where: { role: 'PESERTA', ruang: { not: '' } },
      _count: { id: true },
    });

    const totalPeserta = await prisma.user.count({
      where: { role: 'PESERTA' },
    });

    const totalSoal = await prisma.soal.count();

    const mapelResult = await prisma.soal.groupBy({
      by: ['mataPelajaran'],
      _count: { id: true },
    });

    const totalUjian = await prisma.ujian.count();

    return NextResponse.json({
      ujian: activeExam ? {
        nama: activeExam.nama,
        durasiMenit: activeExam.durasiMenit,
        jadwalMulai: activeExam.jadwalMulai,
        jadwalSelesai: activeExam.jadwalSelesai,
      } : null,
      ruang: ruangList.map(r => ({
        ruang: r.ruang,
        sesi: r.sesi,
        tanggal: r.tanggalUjian,
        terisi: r._count.id,
        kapasitas: 20,
      })),
      stats: {
        totalPeserta,
        totalSoal,
        totalMapel: mapelResult.length,
        totalUjian,
        mapel: mapelResult.map(m => ({
          nama: m.mataPelajaran,
          jumlah: m._count.id,
        })),
      },
    });
  } catch (error) {
    console.error('ERROR PUBLIC INFO:', error);
    return NextResponse.json({ message: 'Gagal mengambil data' }, { status: 500 });
  }
}
