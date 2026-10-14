import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  try {
    const auth = await verifyAdminSession();
    if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

    const soalList = await prisma.soal.findMany({
      select: {
        id: true,
        pertanyaan: true,
        mataPelajaran: true,
        jawaban: {
          select: { benar: true },
        },
      },
    });

    const totalPeserta = await prisma.user.count({
      where: { sudahUjian: true },
    });

    const analisis = soalList.map((soal) => {
      const totalDijawab = soal.jawaban.length;
      const jumlahBenar = soal.jawaban.filter((j) => j.benar).length;
      const rasioBenar = totalDijawab > 0 ? jumlahBenar / totalDijawab : 0;

      let tingkatKesulitan: string;
      let warna: string;
      if (rasioBenar >= 0.8) {
        tingkatKesulitan = 'Mudah';
        warna = 'emerald';
      } else if (rasioBenar >= 0.6) {
        tingkatKesulitan = 'Sedang';
        warna = 'amber';
      } else if (rasioBenar >= 0.4) {
        tingkatKesulitan = 'Sulit';
        warna = 'orange';
      } else {
        tingkatKesulitan = 'Sangat Sulit';
        warna = 'red';
      }

      return {
        soalId: soal.id,
        pertanyaan: soal.pertanyaan.substring(0, 80) + (soal.pertanyaan.length > 80 ? '...' : ''),
        mataPelajaran: soal.mataPelajaran,
        totalDijawab,
        jumlahBenar,
        rasioBenar: Math.round(rasioBenar * 100),
        tingkatKesulitan,
        warna,
      };
    });

    // Sort by difficulty (hardest first)
    analisis.sort((a, b) => a.rasioBenar - b.rasioBenar);

    // Summary stats
    const stats = {
      totalSoal: soalList.length,
      totalPeserta,
      mudah: analisis.filter((a) => a.tingkatKesulitan === 'Mudah').length,
      sedang: analisis.filter((a) => a.tingkatKesulitan === 'Sedang').length,
      sulit: analisis.filter((a) => a.tingkatKesulitan === 'Sulit').length,
      sangatSulit: analisis.filter((a) => a.tingkatKesulitan === 'Sangat Sulit').length,
    };

    return NextResponse.json({ analisis, stats });
  } catch (error) {
    console.error('ERROR ANALISIS SOAL:', error);
    return NextResponse.json({ message: 'Gagal mengambil analisis soal' }, { status: 500 });
  }
}
