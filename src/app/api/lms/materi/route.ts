import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, lampiranValid, linkValid } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

function dataMateri(body: Record<string, unknown>) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Judul materi wajib diisi' } as const;
  if (body.linkVideo && !linkValid(body.linkVideo)) return { error: 'Link video harus diawali http:// atau https://' } as const;
  if (body.lampiran && !lampiranValid(body.lampiran)) return { error: 'Lampiran tidak valid' } as const;
  return {
    data: {
      judul,
      isi: teks(body.isi, 50000),
      linkVideo: linkValid(body.linkVideo),
      lampiran: body.lampiran ? String(body.lampiran) : '',
      namaLampiran: body.lampiran ? teks(body.namaLampiran, 200) : '',
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
    const hasil = dataMateri(body);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    const materi = await prisma.materi.create({ data: { ...hasil.data, mapelId: akses.mapel.id } });
    await createAuditLog({ action: 'CREATE_MATERI', target: `Materi #${materi.id} ${materi.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: materi });
  } catch (error) {
    console.error('ERROR POST MATERI:', error);
    return NextResponse.json({ message: 'Gagal menyimpan materi' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const lama = await prisma.materi.findUnique({ where: { id: Number(body.id) } });
    if (!lama) return NextResponse.json({ message: 'Materi tidak ditemukan' }, { status: 404 });
    const akses = await aksesMapel(auth.user, lama.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = dataMateri(body);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    const materi = await prisma.materi.update({ where: { id: lama.id }, data: hasil.data });
    await createAuditLog({ action: 'UPDATE_MATERI', target: `Materi #${materi.id} ${materi.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: materi });
  } catch (error) {
    console.error('ERROR PUT MATERI:', error);
    return NextResponse.json({ message: 'Gagal menyimpan materi' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const materi = await prisma.materi.findUnique({ where: { id } });
    if (!materi) return NextResponse.json({ message: 'Materi tidak ditemukan' }, { status: 404 });
    const akses = await aksesMapel(auth.user, materi.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });

    await prisma.$transaction([
      prisma.komentar.deleteMany({ where: { materiId: id } }),
      prisma.materiDibaca.deleteMany({ where: { materiId: id } }),
      prisma.materi.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_MATERI', target: `Materi #${id} ${materi.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Materi dihapus' });
  } catch (error) {
    console.error('ERROR DELETE MATERI:', error);
    return NextResponse.json({ message: 'Gagal menghapus materi' }, { status: 500 });
  }
}
