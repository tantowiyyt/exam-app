import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStaffSession, ruangPengawas } from '@/lib/admin-auth';
import { muatSoalUjian, getSoalPeserta } from '@/lib/ujian-soal';
import { susunTahap, hitungStatus, parseJawaban } from '@/lib/sesi-ujian';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await verifyStaffSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const activeExam = await prisma.ujian.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    // Pengawas ruang hanya melihat peserta di ruangnya
    const ruang = ruangPengawas(auth.user);
    const filterRuang = ruang ? { ruang } : { ruang: { not: '' } };

    const pesertaList = await prisma.user.findMany({
      where: { role: 'PESERTA', sudahUjian: false, ...filterRuang },
      select: {
        id: true, nomorPeserta: true, nama: true, ruang: true, sesi: true,
        tanggalUjian: true, foto: true,
      },
      orderBy: [{ ruang: 'asc' }, { sesi: 'asc' }, { nama: 'asc' }],
    });
    const userIds = pesertaList.length > 0 ? pesertaList.map((p) => p.id) : [0];

    // Awal percobaan saat ini = selesainya ujian terakhir (atau sejak awal bila belum pernah)
    const historiTerakhir = await prisma.historiUjian.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { waktuSelesai: true },
    });
    const sejakMap = new Map(historiTerakhir.map((h) => [h.userId, h._max.waktuSelesai ?? new Date(0)]));
    const sejak = (userId: number) => sejakMap.get(userId) ?? new Date(0);

    // Progres dari sesi ujian di server
    const semuaSoal = await muatSoalUjian(activeExam);
    const percobaanMap = new Map<number, number>();
    for (const h of await prisma.historiUjian.groupBy({
      by: ['userId'], where: { userId: { in: userIds }, ujianId: activeExam?.id ?? null }, _count: { _all: true },
    })) percobaanMap.set(h.userId, h._count._all);

    const sesiList = await prisma.sesiUjian.findMany({
      where: { userId: { in: userIds }, ujianId: activeExam?.id ?? null, selesai: false },
    });
    const now = Date.now();
    const progresMap = new Map<number, { terjawab: number; total: number; tenggat: number; habis: boolean; bagian: string | null; tambahanMenit: number }>();
    for (const sesi of sesiList) {
      const soal = await getSoalPeserta(sesi.userId, activeExam, { all: semuaSoal, percobaan: percobaanMap.get(sesi.userId) ?? 0 });
      const tahap = susunTahap(soal);
      const st = hitungStatus(sesi, activeExam, tahap, now);
      progresMap.set(sesi.userId, {
        terjawab: Object.keys(parseJawaban(sesi)).length,
        total: soal.length,
        tenggat: st.tenggat,
        habis: st.habis,
        bagian: st.berbagian ? (tahap[st.tahap]?.nama ?? null) : null,
        tambahanMenit: sesi.tambahanMenit,
      });
    }

    const pelanggaranList = await prisma.pelanggaran.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, createdAt: true },
    });
    const pelanggaranMap = new Map<number, number>();
    for (const p of pelanggaranList) {
      if (p.createdAt > sejak(p.userId)) pelanggaranMap.set(p.userId, (pelanggaranMap.get(p.userId) ?? 0) + 1);
    }

    // Jumlah soal per peserta pada ujian aktif (mempertimbangkan pool)
    const jumlahSoalUjian = semuaSoal.length;
    const totalSoal = activeExam?.poolSize && activeExam.poolSize > 0
      ? Math.min(activeExam.poolSize, jumlahSoalUjian)
      : jumlahSoalUjian;

    const sudahUjian = await prisma.user.findMany({
      where: { role: 'PESERTA', sudahUjian: true, ...(ruang ? { ruang } : {}) },
      select: {
        id: true, nomorPeserta: true, nama: true, ruang: true, sesi: true,
        nilai: true, foto: true,
      },
      orderBy: [{ ruang: 'asc' }, { nama: 'asc' }],
    });

    const historiMap = new Map<number, { waktuMulai: Date; waktuSelesai: Date | null }>();
    if (sudahUjian.length > 0) {
      const historiList = await prisma.historiUjian.findMany({
        where: { userId: { in: sudahUjian.map((p) => p.id) } },
        orderBy: { waktuSelesai: 'desc' },
      });
      for (const h of historiList) {
        if (!historiMap.has(h.userId)) {
          historiMap.set(h.userId, { waktuMulai: h.waktuMulai, waktuSelesai: h.waktuSelesai });
        }
      }
    }

    const peserta = pesertaList.map((p) => {
      const progres = progresMap.get(p.id);
      return {
        ...p,
        sedangUjian: !!progres,
        jawabanTerjawab: progres?.terjawab ?? 0,
        totalSoalPeserta: progres?.total ?? totalSoal,
        tenggat: progres?.tenggat ?? null,
        waktuHabis: progres?.habis ?? false,
        bagianAktif: progres?.bagian ?? null,
        tambahanMenit: progres?.tambahanMenit ?? 0,
        pelanggaran: pelanggaranMap.get(p.id) || 0,
      };
    });
    const sedang = peserta.filter((p) => p.sedangUjian).length;

    return NextResponse.json({
      ujian: activeExam ? {
        nama: activeExam.nama,
        durasiMenit: activeExam.durasiMenit,
        jadwalMulai: activeExam.jadwalMulai,
        jadwalSelesai: activeExam.jadwalSelesai,
      } : null,
      totalSoal,
      serverNow: now,
      ruangPengawas: ruang,
      peserta,
      sudahSelesai: sudahUjian.map((p) => ({
        ...p,
        waktuMulai: historiMap.get(p.id)?.waktuMulai || null,
        waktuSelesai: historiMap.get(p.id)?.waktuSelesai || null,
      })),
      stats: {
        totalPeserta: pesertaList.length + sudahUjian.length,
        sedangUjian: sedang,
        sudahSelesai: sudahUjian.length,
        belumMulai: pesertaList.length - sedang,
      },
    });
  } catch (error) {
    console.error('ERROR MONITORING:', error);
    return NextResponse.json({ message: 'Gagal mengambil data monitoring' }, { status: 500 });
  }
}
