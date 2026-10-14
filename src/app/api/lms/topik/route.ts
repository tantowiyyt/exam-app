import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, topikValid } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Topik = bagian mapel (mis. "Bab 1 — Limit" atau "Minggu 1") yang mengelompokkan materi, tugas, dan kuis.

async function kelolaTopik(user: { id: number; role: string }, id: unknown) {
  const topik = await prisma.topik.findUnique({ where: { id: Number(id) } });
  const akses = topik ? await aksesMapel(user, topik.mapelId) : null;
  return topik && akses?.peran === 'kelola' ? topik : null;
}

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  const akses = await aksesMapel(auth.user, Number(new URL(request.url).searchParams.get('mapelId')));
  if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan' }, { status: 404 });
  const topik = await prisma.topik.findMany({ where: { mapelId: akses.mapel.id }, orderBy: [{ urutan: 'asc' }, { id: 'asc' }] });
  return NextResponse.json({ topik: topik.map((t) => ({ id: t.id, judul: t.judul, deskripsi: t.deskripsi })) });
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const judul = teks(body.judul, 200);
    if (!judul) return NextResponse.json({ message: 'Judul topik wajib diisi' }, { status: 400 });
    const terakhir = await prisma.topik.findFirst({ where: { mapelId: akses.mapel.id }, orderBy: { urutan: 'desc' } });
    const topik = await prisma.topik.create({
      data: { mapelId: akses.mapel.id, judul, deskripsi: teks(body.deskripsi, 2000), urutan: (terakhir?.urutan ?? -1) + 1 },
    });
    await createAuditLog({ action: 'CREATE_TOPIK', target: `Topik #${topik.id} ${topik.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: topik });
  } catch (error) {
    console.error('ERROR POST TOPIK:', error);
    return NextResponse.json({ message: 'Gagal menyimpan topik' }, { status: 500 });
  }
}

/**
 * aksi "ubah": judul/deskripsi; aksi "urut": naik/turun satu posisi;
 * aksi "pindah": pindahkan materi/tugas/kuis ke topik lain (topikId null = tanpa topik).
 */
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();

    if (body.aksi === 'pindah') {
      const jenis = String(body.jenis);
      if (!['materi', 'tugas', 'kuis'].includes(jenis)) return NextResponse.json({ message: 'Jenis tidak dikenal' }, { status: 400 });
      const where = { where: { id: Number(body.itemId) }, select: { mapelId: true } };
      const item = jenis === 'materi' ? await prisma.materi.findUnique(where) : jenis === 'tugas' ? await prisma.tugas.findUnique(where) : await prisma.kuis.findUnique(where);
      const akses = item ? await aksesMapel(auth.user, item.mapelId) : null;
      if (!item || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Item tidak ditemukan' }, { status: 404 });
      const topikId = await topikValid(body.topikId, item.mapelId);
      if (topikId === undefined) return NextResponse.json({ message: 'Topik tidak ditemukan di mapel ini' }, { status: 400 });
      const ubah = { where: { id: Number(body.itemId) }, data: { topikId } };
      if (jenis === 'materi') await prisma.materi.update(ubah);
      else if (jenis === 'tugas') await prisma.tugas.update(ubah);
      else await prisma.kuis.update(ubah);
      return NextResponse.json({ success: true });
    }

    const topik = await kelolaTopik(auth.user, body.id);
    if (!topik) return NextResponse.json({ message: 'Topik tidak ditemukan' }, { status: 404 });

    if (body.aksi === 'urut') {
      // Susun ulang urutan 0..n lalu tukar dengan tetangganya
      const semua = await prisma.topik.findMany({ where: { mapelId: topik.mapelId }, orderBy: [{ urutan: 'asc' }, { id: 'asc' }] });
      const i = semua.findIndex((t) => t.id === topik.id);
      const j = body.arah === 'naik' ? i - 1 : i + 1;
      if (j >= 0 && j < semua.length) [semua[i], semua[j]] = [semua[j], semua[i]];
      await prisma.$transaction(semua.map((t, k) => prisma.topik.update({ where: { id: t.id }, data: { urutan: k } })));
      return NextResponse.json({ success: true });
    }

    const judul = teks(body.judul, 200);
    if (!judul) return NextResponse.json({ message: 'Judul topik wajib diisi' }, { status: 400 });
    const data = await prisma.topik.update({ where: { id: topik.id }, data: { judul, deskripsi: teks(body.deskripsi, 2000) } });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR PUT TOPIK:', error);
    return NextResponse.json({ message: 'Gagal menyimpan topik' }, { status: 500 });
  }
}

// Hapus topik: isinya tidak ikut terhapus, hanya menjadi "tanpa topik"
export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const topik = await kelolaTopik(auth.user, new URL(request.url).searchParams.get('id'));
    if (!topik) return NextResponse.json({ message: 'Topik tidak ditemukan' }, { status: 404 });
    const lepas = { where: { topikId: topik.id }, data: { topikId: null } };
    await prisma.$transaction([
      prisma.materi.updateMany(lepas),
      prisma.tugas.updateMany(lepas),
      prisma.kuis.updateMany(lepas),
      prisma.topik.delete({ where: { id: topik.id } }),
    ]);
    await createAuditLog({ action: 'DELETE_TOPIK', target: `Topik #${topik.id} ${topik.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Topik dihapus (isinya dipindah ke "Lainnya")' });
  } catch (error) {
    console.error('ERROR DELETE TOPIK:', error);
    return NextResponse.json({ message: 'Gagal menghapus topik' }, { status: 500 });
  }
}
