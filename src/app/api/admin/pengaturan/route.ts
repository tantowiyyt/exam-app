import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    // Ujian aktif pertama (tidak lagi membuat "Ujian Default" otomatis). Jadwal per ujian diatur di Kelola Ujian.
    const ujian = await prisma.ujian.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
    return NextResponse.json(ujian);
  } catch (error) {
    console.error('ERROR PADA GET PENGATURAN ADMIN:', error);
    return NextResponse.json({ message: 'Gagal mengambil pengaturan' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { durasiMenit, jadwalMulai, jadwalSelesai, resetJadwal } = body;

    const ujian = await prisma.ujian.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
    if (!ujian) return NextResponse.json({ message: 'Tidak ada ujian aktif. Atur jadwal di Kelola Ujian.' }, { status: 404 });

    const updateData: Record<string, unknown> = {};

    if (typeof durasiMenit === 'number' && durasiMenit >= 1) {
      updateData.durasiMenit = durasiMenit;
    }

    if (resetJadwal) {
      updateData.jadwalMulai = null;
      updateData.jadwalSelesai = null;
    } else {
      if (jadwalMulai !== undefined) {
        updateData.jadwalMulai = jadwalMulai ? new Date(jadwalMulai) : null;
      }
      if (jadwalSelesai !== undefined) {
        updateData.jadwalSelesai = jadwalSelesai ? new Date(jadwalSelesai) : null;
      }
    }

    const updated = await prisma.ujian.update({
      where: { id: ujian.id },
      data: updateData,
    });

    cache.delete(CACHE_KEYS.PENGATURAN);
    await createAuditLog({
      action: AUDIT_ACTIONS.UPDATE_PENGATURAN,
      target: `Ujian #${updated.id} ${updated.nama}`,
      details: updateData,
      ipAddress: getAuditIP(request),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('ERROR PADA PUT PENGATURAN ADMIN:', error);
    return NextResponse.json({ message: 'Gagal memperbarui pengaturan' }, { status: 500 });
  }
}
