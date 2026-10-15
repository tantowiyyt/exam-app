import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { INCLUDE_TARGET, wherePeserta } from '@/lib/ujian-peserta';

// Statistik dasbor ujian: gabungan semua ujian aktif (peserta = siswa kelas target tiap ujian).
export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const aktif = await prisma.ujian.findMany({ where: { isActive: true }, include: INCLUDE_TARGET });
    let totalPeserta = 0;
    let sudahUjian = 0;
    const nilai: number[] = [];
    for (const u of aktif) {
      const ids = (await prisma.user.findMany({ where: wherePeserta(u), select: { id: true } })).map((x) => x.id);
      totalPeserta += ids.length;
      const selesai = await prisma.sesiUjian.findMany({ where: { ujianId: u.id, selesai: true, userId: { in: ids } }, select: { userId: true }, distinct: ['userId'] });
      sudahUjian += selesai.length;
      // Nilai terakhir tiap peserta yang selesai
      const histori = await prisma.historiUjian.findMany({ where: { ujianId: u.id, userId: { in: selesai.map((s) => s.userId) } }, orderBy: { id: 'asc' }, select: { userId: true, nilaiAkhir: true } });
      nilai.push(...new Map(histori.map((h) => [h.userId, h.nilaiAkhir])).values());
    }
    const totalSoal = await prisma.soal.count({ where: { ujianId: { in: aktif.map((u) => u.id) } } });
    return NextResponse.json({
      jumlahAktif: aktif.length,
      totalPeserta,
      totalSoal,
      sudahUjian,
      belumUjian: totalPeserta - sudahUjian,
      rataNilai: nilai.length ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length) : 0,
      durasiMenit: aktif[0]?.durasiMenit ?? 0,
    });
  } catch (error) {
    console.error('ERROR PADA GET STATS:', error);
    return NextResponse.json({ message: 'Gagal mengambil statistik' }, { status: 500 });
  }
}
