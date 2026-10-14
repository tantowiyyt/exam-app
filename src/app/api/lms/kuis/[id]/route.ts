import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';
import { opsiSoal, statusBuka, tutupYangKedaluwarsa, batasWaktu, nilaiTerbaik } from '@/lib/kuis';

const pilihPercobaan = { id: true, userId: true, ke: true, mulaiAt: true, selesaiAt: true, nilai: true, skor: true, skorMaks: true, perluDinilai: true } as const;

// Detail kuis: pengelola melihat soal + kunci + hasil semua siswa; siswa melihat info & percobaannya sendiri
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/kuis/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const kuis = await prisma.kuis.findUnique({ where: { id: Number((await ctx.params).id) } });
    const akses = kuis ? await aksesMapel(user, kuis.mapelId) : null;
    if (!kuis || !akses || (akses.peran === 'siswa' && !kuis.terbit)) {
      return NextResponse.json({ message: 'Kuis tidak ditemukan' }, { status: 404 });
    }
    const kelola = akses.peran === 'kelola';
    await tutupYangKedaluwarsa(kuis, kelola ? {} : { userId: user.id });

    const mapel = { id: akses.mapel.id, nama: akses.mapel.nama, kelas: akses.mapel.kelas.nama };
    const soal = await prisma.soalKuis.findMany({ where: { kuisId: kuis.id }, orderBy: { urutan: 'asc' } });
    const info = {
      ...kuis,
      status: statusBuka(kuis),
      jumlahSoal: soal.length,
      totalBobot: soal.reduce((a, s) => a + s.bobot, 0),
      adaEsai: soal.some((s) => s.tipe === 'esai'),
    };

    if (!kelola) {
      const percobaan = await prisma.percobaanKuis.findMany({ where: { kuisId: kuis.id, userId: user.id }, orderBy: { ke: 'asc' }, select: pilihPercobaan });
      const aktif = percobaan.find((p) => !p.selesaiAt);
      return NextResponse.json({
        peran: akses.peran,
        mapel,
        kuis: info,
        percobaan,
        aktif: aktif ? { id: aktif.id, batas: batasWaktu(kuis, aktif) } : null,
        sisaPercobaan: Math.max(0, kuis.maksPercobaan - percobaan.length),
        terbaik: nilaiTerbaik(percobaan),
        // Kunci jawaban dibuka setelah kuis ditutup (bila ada waktu tutup)
        kunciTerbuka: kuis.tampilkanJawaban && (!kuis.selesai || kuis.selesai < new Date()),
      });
    }

    const [siswa, percobaan] = await Promise.all([
      prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true, nomorPeserta: true, nama: true }, orderBy: { nama: 'asc' } }),
      prisma.percobaanKuis.findMany({ where: { kuisId: kuis.id }, orderBy: { ke: 'asc' }, select: pilihPercobaan }),
    ]);
    // Siswa yang sudah pindah kelas tetapi pernah mengerjakan tetap ditampilkan
    const lainIds = [...new Set(percobaan.map((p) => p.userId))].filter((id) => !siswa.some((s) => s.id === id));
    const lain = lainIds.length ? await prisma.user.findMany({ where: { id: { in: lainIds } }, select: { id: true, nomorPeserta: true, nama: true } }) : [];

    return NextResponse.json({
      peran: akses.peran,
      mapel,
      kuis: info,
      soal: soal.map((s) => ({ ...s, opsi: opsiSoal(s) })),
      hasil: [...siswa, ...lain].map((s) => {
        const milik = percobaan.filter((p) => p.userId === s.id);
        return { siswa: s, percobaan: milik, terbaik: nilaiTerbaik(milik), sedang: milik.some((p) => !p.selesaiAt) };
      }),
    });
  } catch (error) {
    console.error('ERROR GET KUIS:', error);
    return NextResponse.json({ message: 'Gagal memuat kuis' }, { status: 500 });
  }
}
