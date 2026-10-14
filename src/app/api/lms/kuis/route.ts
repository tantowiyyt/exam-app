import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { semesterAktif } from '@/lib/semester';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';
import { dataKuis } from '@/lib/kuis';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Pengaturan kuis (judul, waktu, percobaan). Soal disimpan lewat /api/lms/kuis/[id]/soal.

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = await dataKuis(body, akses.mapel.id);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    // Kuis baru belum punya soal -> selalu draf
    const kuis = await prisma.kuis.create({ data: { ...hasil.data, terbit: false, mapelId: akses.mapel.id, semesterId: (await semesterAktif()).id } });
    await createAuditLog({ action: 'CREATE_KUIS', target: `Kuis #${kuis.id} ${kuis.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: kuis });
  } catch (error) {
    console.error('ERROR POST KUIS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan kuis' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const lama = await prisma.kuis.findUnique({ where: { id: Number(body.id) }, include: { _count: { select: { soal: true } } } });
    const akses = lama ? await aksesMapel(auth.user, lama.mapelId) : null;
    if (!lama || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Kuis tidak ditemukan' }, { status: 404 });
    const hasil = await dataKuis(body, lama.mapelId);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    if (hasil.data.terbit && lama._count.soal === 0) {
      return NextResponse.json({ message: 'Tambahkan minimal satu soal sebelum menerbitkan kuis' }, { status: 400 });
    }

    // Mode ujian: satu kesempatan; token & batas pelanggaran bisa diatur
    const ujian: Record<string, unknown> = {};
    if (lama.modeUjian) {
      ujian.maksPercobaan = 1;
      if (typeof body.token === 'string') {
        const token = body.token.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (token.length > 10) return NextResponse.json({ message: 'Token maksimal 10 huruf/angka' }, { status: 400 });
        ujian.token = token;
      }
      if (body.maksPelanggaran !== undefined) {
        const n = Number(body.maksPelanggaran);
        if (!Number.isInteger(n) || n < 1 || n > 20) return NextResponse.json({ message: 'Batas pelanggaran 1–20' }, { status: 400 });
        ujian.maksPelanggaran = n;
      }
    }
    const kuis = await prisma.kuis.update({ where: { id: lama.id }, data: { ...hasil.data, ...ujian } });
    await createAuditLog({ action: 'UPDATE_KUIS', target: `Kuis #${kuis.id} ${kuis.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: kuis });
  } catch (error) {
    console.error('ERROR PUT KUIS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan kuis' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const kuis = await prisma.kuis.findUnique({ where: { id } });
    const akses = kuis ? await aksesMapel(auth.user, kuis.mapelId) : null;
    if (!kuis || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Kuis tidak ditemukan' }, { status: 404 });
    if (kuis.modeUjian) return NextResponse.json({ message: 'Ini kuis ujian CAT. Hapus lewat tab Ujian di halaman mapel.' }, { status: 400 });

    // Jawaban & nilai siswa ikut terhapus (UI meminta konfirmasi)
    await prisma.$transaction([
      prisma.percobaanKuis.deleteMany({ where: { kuisId: id } }),
      prisma.soalKuis.deleteMany({ where: { kuisId: id } }),
      prisma.kuis.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_KUIS', target: `Kuis #${id} ${kuis.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Kuis dihapus' });
  } catch (error) {
    console.error('ERROR DELETE KUIS:', error);
    return NextResponse.json({ message: 'Gagal menghapus kuis' }, { status: 500 });
  }
}
