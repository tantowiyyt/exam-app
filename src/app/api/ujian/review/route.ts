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
    });

    if (!user) {
      return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 404 });
    }

    if (!user.sudahUjian) {
      return NextResponse.json({ message: 'Anda belum mengerjakan ujian' }, { status: 400 });
    }

    // Get jawaban with soal details
    const jawabanList = await prisma.jawabanUjian.findMany({
      where: { userId: user.id },
      include: {
        soal: {
          select: {
            pertanyaan: true,
            opsiA: true,
            opsiB: true,
            opsiC: true,
            opsiD: true,
            mataPelajaran: true,
            bobot: true,
          },
        },
      },
      orderBy: { soalId: 'asc' },
    });

    // Get histori
    const histori = await prisma.historiUjian.findFirst({
      where: { userId: user.id },
      orderBy: { waktuSelesai: 'desc' },
    });

    return NextResponse.json({
      jawaban: jawabanList.map((j) => ({
        soalId: j.soalId,
        pertanyaan: j.soal.pertanyaan,
        opsiA: j.soal.opsiA,
        opsiB: j.soal.opsiB,
        opsiC: j.soal.opsiC,
        opsiD: j.soal.opsiD,
        mataPelajaran: j.soal.mataPelajaran,
        bobot: j.soal.bobot,
        jawabanPeserta: j.jawabanPeserta,
        jawabanBenar: j.jawabanBenar,
        benar: j.benar,
      })),
      histori: histori ? {
        waktuMulai: histori.waktuMulai,
        waktuSelesai: histori.waktuSelesai,
        totalSoal: histori.totalSoal,
        jumlahBenar: histori.jumlahBenar,
        jumlahSalah: histori.jumlahSalah,
        nilaiAkhir: histori.nilaiAkhir,
        skorPerMapel: histori.skorPerMapel ? JSON.parse(histori.skorPerMapel) : null,
      } : null,
    });
  } catch (error) {
    console.error('ERROR REVIEW JAWABAN:', error);
    return NextResponse.json({ message: 'Gagal mengambil data review' }, { status: 500 });
  }
}
