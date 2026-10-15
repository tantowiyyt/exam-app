import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStaffSession, ruangPengawas } from '@/lib/admin-auth';
import { muatSoalUjian, getSoalPeserta } from '@/lib/ujian-soal';
import { susunTahap, hitungStatus, parseJawaban } from '@/lib/sesi-ujian';
import { INCLUDE_TARGET, labelPeserta, wherePeserta } from '@/lib/ujian-peserta';

export const dynamic = 'force-dynamic';

// Monitoring ujian CAT sekolah. ?ujian=id memilih ujian aktif (bawaan: ujian aktif pertama).
// Peserta = siswa kelas target ujian (pengawas ruang: hanya ruangnya). Status per ujian dari sesi ujian.
export async function GET(request: Request) {
  const auth = await verifyStaffSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const aktifList = await prisma.ujian.findMany({ where: { isActive: true }, include: INCLUDE_TARGET, orderBy: [{ jadwalMulai: 'asc' }, { id: 'asc' }] });
    const dipilih = Number(new URL(request.url).searchParams.get('ujian'));
    const activeExam = aktifList.find((u) => u.id === dipilih) ?? aktifList[0] ?? null;
    const daftarUjian = aktifList.map((u) => ({ id: u.id, nama: u.nama, peserta: labelPeserta(u) }));

    // Pengawas ruang hanya melihat peserta di ruangnya
    const ruang = ruangPengawas(auth.user);
    if (!activeExam) {
      return NextResponse.json({
        ujian: null, daftarUjian, totalSoal: 0, serverNow: Date.now(), ruangPengawas: ruang, peserta: [], sudahSelesai: [],
        stats: { totalPeserta: 0, sedangUjian: 0, sudahSelesai: 0, belumMulai: 0 },
      });
    }

    const semuaPeserta = await prisma.user.findMany({
      where: { ...wherePeserta(activeExam), ...(ruang ? { ruang } : {}) },
      select: { id: true, nomorPeserta: true, nama: true, kelas: true, ruang: true, sesi: true, tanggalUjian: true, foto: true },
      orderBy: [{ ruang: 'asc' }, { sesi: 'asc' }, { nama: 'asc' }],
    });
    const semuaIds = semuaPeserta.length ? semuaPeserta.map((p) => p.id) : [0];
    const sesiList = await prisma.sesiUjian.findMany({ where: { userId: { in: semuaIds }, ujianId: activeExam.id } });
    const selesaiIds = new Set(sesiList.filter((s) => s.selesai).map((s) => s.userId));
    const pesertaList = semuaPeserta.filter((p) => !selesaiIds.has(p.id));
    const sudahUjian = semuaPeserta.filter((p) => selesaiIds.has(p.id));
    const userIds = pesertaList.length ? pesertaList.map((p) => p.id) : [0];

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
      by: ['userId'], where: { userId: { in: userIds }, ujianId: activeExam.id }, _count: { _all: true },
    })) percobaanMap.set(h.userId, h._count._all);

    const now = Date.now();
    const progresMap = new Map<number, { terjawab: number; total: number; tenggat: number; habis: boolean; bagian: string | null; tambahanMenit: number }>();
    for (const sesi of sesiList.filter((s) => !s.selesai)) {
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

    // Jumlah soal per peserta pada ujian ini (mempertimbangkan pool)
    const jumlahSoalUjian = semuaSoal.length;
    const totalSoal = activeExam.poolSize && activeExam.poolSize > 0 ? Math.min(activeExam.poolSize, jumlahSoalUjian) : jumlahSoalUjian;

    // Hasil yang sudah selesai: histori terakhir ujian ini
    const historiMap = new Map<number, { waktuMulai: Date; waktuSelesai: Date | null; nilaiAkhir: number }>();
    if (sudahUjian.length > 0) {
      const historiList = await prisma.historiUjian.findMany({
        where: { userId: { in: sudahUjian.map((p) => p.id) }, ujianId: activeExam.id },
        orderBy: { waktuSelesai: 'desc' },
      });
      for (const h of historiList) {
        if (!historiMap.has(h.userId)) historiMap.set(h.userId, { waktuMulai: h.waktuMulai, waktuSelesai: h.waktuSelesai, nilaiAkhir: h.nilaiAkhir });
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
      ujian: {
        id: activeExam.id,
        nama: activeExam.nama,
        peserta: labelPeserta(activeExam),
        durasiMenit: activeExam.durasiMenit,
        jadwalMulai: activeExam.jadwalMulai,
        jadwalSelesai: activeExam.jadwalSelesai,
      },
      daftarUjian,
      totalSoal,
      serverNow: now,
      ruangPengawas: ruang,
      peserta,
      sudahSelesai: sudahUjian.map((p) => ({
        ...p,
        nilai: historiMap.get(p.id)?.nilaiAkhir ?? null,
        waktuMulai: historiMap.get(p.id)?.waktuMulai || null,
        waktuSelesai: historiMap.get(p.id)?.waktuSelesai || null,
      })),
      stats: {
        totalPeserta: semuaPeserta.length,
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
