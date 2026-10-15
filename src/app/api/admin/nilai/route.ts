import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { INCLUDE_TARGET, statusPeserta, wherePeserta } from '@/lib/ujian-peserta';

// Hasil ujian CAT sekolah per ujian (?ujian=id; bawaan ujian aktif pertama, atau ujian terakhir).
// Peserta = siswa kelas target; nilai = hasil terakhir ujian itu.
export async function GET(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const pilih = Number(new URL(request.url).searchParams.get('ujian'));
    const ujian = pilih
      ? await prisma.ujian.findUnique({ where: { id: pilih }, include: INCLUDE_TARGET })
      : (await prisma.ujian.findFirst({ where: { isActive: true }, include: INCLUDE_TARGET, orderBy: { id: 'asc' } }))
        ?? await prisma.ujian.findFirst({ include: INCLUDE_TARGET, orderBy: { id: 'desc' } });
    if (!ujian) return NextResponse.json([]);

    const siswa = await prisma.user.findMany({
      where: wherePeserta(ujian),
      select: { id: true, nomorPeserta: true, nama: true, kelas: true, ruang: true, sesi: true, createdAt: true },
    });
    const ids = siswa.map((s) => s.id);
    const [status, histori] = await Promise.all([
      statusPeserta(ujian.id, ids),
      prisma.historiUjian.findMany({ where: { ujianId: ujian.id, userId: { in: ids } }, orderBy: { id: 'asc' }, select: { userId: true, nilaiAkhir: true } }),
    ]);
    const nilai = new Map(histori.map((h) => [h.userId, h.nilaiAkhir]));
    const hasil = siswa.map((s) => {
      const selesai = status(s.id) === 'selesai';
      return { ...s, ujianId: ujian.id, sudahUjian: selesai, nilai: selesai ? nilai.get(s.id) ?? null : null };
    });
    hasil.sort((a, b) => (b.nilai ?? -1) - (a.nilai ?? -1) || a.nama.localeCompare(b.nama));
    return NextResponse.json(hasil);
  } catch {
    return NextResponse.json({ message: 'Gagal memuat rekap nilai' }, { status: 500 });
  }
}
