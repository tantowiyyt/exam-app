import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const judul = teks(body.judul, 200);
    const isi = teks(body.isi, 10000);
    if (!judul || !isi) return NextResponse.json({ message: 'Judul dan isi pengumuman wajib diisi' }, { status: 400 });

    const p = await prisma.pengumuman.create({ data: { mapelId: akses.mapel.id, userId: auth.user.id, judul, isi } });
    await createAuditLog({ action: 'CREATE_PENGUMUMAN', target: `Pengumuman #${p.id} ${judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: p });
  } catch (error) {
    console.error('ERROR POST PENGUMUMAN:', error);
    return NextResponse.json({ message: 'Gagal menyimpan pengumuman' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const p = await prisma.pengumuman.findUnique({ where: { id } });
    const akses = p ? await aksesMapel(auth.user, p.mapelId) : null;
    if (!p || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Pengumuman tidak ditemukan' }, { status: 404 });

    await prisma.$transaction([
      prisma.komentar.deleteMany({ where: { pengumumanId: id } }),
      prisma.pengumuman.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_PENGUMUMAN', target: `Pengumuman #${id} ${p.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Pengumuman dihapus' });
  } catch (error) {
    console.error('ERROR DELETE PENGUMUMAN:', error);
    return NextResponse.json({ message: 'Gagal menghapus pengumuman' }, { status: 500 });
  }
}
