import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';
import { semesterDipilih } from '@/lib/semester';
import { hitungRekapMapel } from '@/lib/rekap';
import { whereAnggota } from '@/lib/anggota';

// Rekap nilai satu mapel per semester (?semester=id, bawaan semester aktif) — perhitungan di lib/rekap.ts.
// Pengelola melihat semua siswa kelas; siswa hanya baris miliknya.
export async function GET(request: Request, ctx: RouteContext<'/api/lms/mapel/[id]/nilai'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const akses = await aksesMapel(user, Number((await ctx.params).id));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const { mapel, peran } = akses;
    const kelola = peran === 'kelola';

    const semester = await semesterDipilih(new URL(request.url).searchParams.get('semester'));
    const siswa = kelola
      ? await prisma.user.findMany({
        where: await whereAnggota(mapel.kelas.nama, semester),
        select: { id: true, nomorPeserta: true, nama: true },
        orderBy: { nama: 'asc' },
      })
      : await prisma.user.findMany({ where: { id: user.id }, select: { id: true, nomorPeserta: true, nama: true } });
    const { kolom, baris, bobot, berbobot } = await hitungRekapMapel(mapel, siswa, semester, { kelola, userId: user.id });

    const rata = baris.map((b) => b.rataRata).filter((x): x is number => x !== null);
    return NextResponse.json({
      peran,
      mapel: { id: mapel.id, nama: mapel.nama, kelas: mapel.kelas.nama },
      semester: { id: semester.id, label: semester.label, aktif: semester.aktif },
      pengaturan: { ...bobot, kkm: mapel.kkm, aturanRemedial: mapel.aturanRemedial, berbobot },
      kolom,
      baris,
      ringkasan: {
        rataKelas: rata.length ? Math.round((rata.reduce((a, b) => a + b, 0) / rata.length) * 10) / 10 : null,
        tertinggi: rata.length ? Math.max(...rata) : null,
        terendah: rata.length ? Math.min(...rata) : null,
        tuntas: mapel.kkm ? baris.filter((b) => b.tuntas === true).length : null,
      },
    });
  } catch (error) {
    console.error('ERROR LMS NILAI:', error);
    return NextResponse.json({ message: 'Gagal memuat rekap nilai' }, { status: 500 });
  }
}
