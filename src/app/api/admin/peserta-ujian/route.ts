import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { teks } from '@/lib/lms';
import { INCLUDE_TARGET, kelasPeserta, labelPeserta, statusPeserta, wherePeserta } from '@/lib/ujian-peserta';

// Peserta ujian CAT sekolah (admin): daftar siswa kelas target per ujian dengan ruang, sesi, status & nilai;
// atur ruang/sesi per kelas atau per siswa; reset ujian per siswa / semua peserta ujian itu.

async function muatUjian(id: unknown) {
  const pilih = Number(id);
  if (pilih) return prisma.ujian.findUnique({ where: { id: pilih }, include: INCLUDE_TARGET });
  return (await prisma.ujian.findFirst({ where: { isActive: true }, include: INCLUDE_TARGET, orderBy: { id: 'asc' } }))
    ?? prisma.ujian.findFirst({ include: INCLUDE_TARGET, orderBy: { id: 'desc' } });
}

export async function GET(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const semua = await prisma.ujian.findMany({ include: INCLUDE_TARGET, orderBy: [{ isActive: 'desc' }, { id: 'desc' }] });
    const daftarUjian = semua.map((u) => ({ id: u.id, nama: u.nama, aktif: u.isActive, peserta: labelPeserta(u) }));
    const ujian = await muatUjian(new URL(request.url).searchParams.get('ujian'));
    if (!ujian) return NextResponse.json({ daftarUjian, ujian: null, siswa: [], kelasList: [] });

    const siswa = await prisma.user.findMany({
      where: wherePeserta(ujian),
      select: { id: true, nomorPeserta: true, nama: true, kelas: true, ruang: true, sesi: true },
      orderBy: [{ kelas: 'asc' }, { nama: 'asc' }],
    });
    const ids = siswa.map((s) => s.id);
    const [status, histori] = await Promise.all([
      statusPeserta(ujian.id, ids),
      prisma.historiUjian.findMany({ where: { ujianId: ujian.id, userId: { in: ids } }, orderBy: { id: 'asc' }, select: { userId: true, nilaiAkhir: true } }),
    ]);
    const nilai = new Map(histori.map((h) => [h.userId, h.nilaiAkhir]));
    return NextResponse.json({
      daftarUjian,
      ujian: { id: ujian.id, nama: ujian.nama, aktif: ujian.isActive, peserta: labelPeserta(ujian), jadwalMulai: ujian.jadwalMulai, durasiMenit: ujian.durasiMenit },
      kelasList: kelasPeserta(ujian) ?? [...new Set(siswa.map((s) => s.kelas).filter(Boolean))].sort(),
      siswa: siswa.map((s) => {
        const st = status(s.id);
        return { ...s, status: st, nilai: st === 'selesai' ? nilai.get(s.id) ?? null : null };
      }),
    });
  } catch (error) {
    console.error('ERROR GET PESERTA UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memuat peserta ujian' }, { status: 500 });
  }
}

// { aksi: 'aturRuang', ujian, ids?: number[], kelas?: string, ruang?, sesi? }
// { aksi: 'reset', ujian, ids: number[] } | { aksi: 'resetSemua', ujian }
export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const ujian = await muatUjian(body.ujian);
    if (!ujian) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const peserta = wherePeserta(ujian);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((x: number) => Number.isInteger(x)) : null;
    const target = `Ujian #${ujian.id} ${ujian.nama}`;

    if (body.aksi === 'aturRuang') {
      const data: Record<string, string> = {};
      if (typeof body.ruang === 'string') data.ruang = teks(body.ruang, 50);
      if (typeof body.sesi === 'string') data.sesi = teks(body.sesi, 20);
      if (!Object.keys(data).length) return NextResponse.json({ message: 'Isi ruang dan/atau sesi' }, { status: 400 });
      const kelas = teks(body.kelas, 50);
      if (!ids?.length && !kelas) return NextResponse.json({ message: 'Pilih siswa atau kelas' }, { status: 400 });
      const where = { AND: [peserta, ids?.length ? { id: { in: ids } } : { kelas }] };
      const n = await prisma.user.updateMany({ where, data });
      await createAuditLog({ action: 'ATUR_RUANG_UJIAN', target, details: { ...data, kelas: kelas || undefined, jumlah: n.count }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `Ruang/sesi ${n.count} siswa diperbarui`, jumlah: n.count });
    }

    if (body.aksi === 'reset' || body.aksi === 'resetSemua') {
      if (body.aksi === 'reset' && !ids?.length) return NextResponse.json({ message: 'Pilih siswa' }, { status: 400 });
      const userIds = (await prisma.user.findMany({ where: { AND: [peserta, ...(body.aksi === 'reset' ? [{ id: { in: ids! } }] : [])] }, select: { id: true } })).map((u) => u.id);
      // Hasil (histori) tetap tersimpan sebagai riwayat; sesi & jawaban ujian ini dihapus agar bisa mengerjakan ulang
      const [sesi] = await prisma.$transaction([
        prisma.sesiUjian.deleteMany({ where: { ujianId: ujian.id, userId: { in: userIds } } }),
        prisma.jawabanUjian.deleteMany({ where: { ujianId: ujian.id, userId: { in: userIds } } }),
      ]);
      await createAuditLog({ action: 'RESET_PESERTA_UJIAN', target, details: { jumlahSiswa: userIds.length, sesi: sesi.count }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `Ujian direset untuk ${userIds.length} siswa`, jumlah: userIds.length });
    }
    return NextResponse.json({ message: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR POST PESERTA UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memproses' }, { status: 500 });
  }
}
