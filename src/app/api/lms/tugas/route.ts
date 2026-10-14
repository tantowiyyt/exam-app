import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, lampiranValid } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

function dataTugas(body: Record<string, unknown>) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Judul tugas wajib diisi' } as const;
  if (body.lampiran && !lampiranValid(body.lampiran)) return { error: 'Lampiran tidak valid' } as const;
  let tenggat: Date | null = null;
  if (body.tenggat) {
    tenggat = new Date(String(body.tenggat));
    if (isNaN(tenggat.getTime())) return { error: 'Tenggat tidak valid' } as const;
  }
  const nilaiMaks = Math.floor(Number(body.nilaiMaks ?? 100));
  if (!Number.isFinite(nilaiMaks) || nilaiMaks < 1 || nilaiMaks > 1000) return { error: 'Nilai maksimal 1–1000' } as const;
  return {
    data: {
      judul,
      deskripsi: teks(body.deskripsi, 50000),
      lampiran: body.lampiran ? String(body.lampiran) : '',
      namaLampiran: body.lampiran ? teks(body.namaLampiran, 200) : '',
      tenggat,
      nilaiMaks,
      terbit: body.terbit !== false,
    },
  } as const;
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = dataTugas(body);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    const tugas = await prisma.tugas.create({ data: { ...hasil.data, mapelId: akses.mapel.id } });
    await createAuditLog({ action: 'CREATE_TUGAS', target: `Tugas #${tugas.id} ${tugas.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: tugas });
  } catch (error) {
    console.error('ERROR POST TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan tugas' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const lama = await prisma.tugas.findUnique({ where: { id: Number(body.id) } });
    if (!lama) return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    const akses = await aksesMapel(auth.user, lama.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = dataTugas(body);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    const tugas = await prisma.tugas.update({ where: { id: lama.id }, data: hasil.data });
    await createAuditLog({ action: 'UPDATE_TUGAS', target: `Tugas #${tugas.id} ${tugas.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: tugas });
  } catch (error) {
    console.error('ERROR PUT TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan tugas' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const tugas = await prisma.tugas.findUnique({ where: { id } });
    if (!tugas) return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    const akses = await aksesMapel(auth.user, tugas.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });

    // Pengumpulan & komentar siswa ikut terhapus (UI meminta konfirmasi)
    await prisma.$transaction([
      prisma.komentar.deleteMany({ where: { tugasId: id } }),
      prisma.pengumpulanTugas.deleteMany({ where: { tugasId: id } }),
      prisma.tugas.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_TUGAS', target: `Tugas #${id} ${tugas.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Tugas dihapus' });
  } catch (error) {
    console.error('ERROR DELETE TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menghapus tugas' }, { status: 500 });
  }
}
