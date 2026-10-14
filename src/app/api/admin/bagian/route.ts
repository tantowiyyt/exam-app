import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const bagian = await prisma.bagianUjian.findMany({
      include: { _count: { select: { soal: true } } },
      orderBy: [{ ujianId: 'asc' }, { urutan: 'asc' }],
    });

    const ujianList = await prisma.ujian.findMany({
      select: { id: true, nama: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ bagian, ujianList });
  } catch (error) {
    console.error('ERROR GET BAGIAN:', error);
    return NextResponse.json({ message: 'Gagal mengambil data bagian' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { ujianId, nama, urutan, durasiMenit, batasSoal } = await request.json();

    if (!ujianId || !nama) {
      return NextResponse.json({ message: 'Ujian dan Nama Bagian wajib diisi' }, { status: 400 });
    }

    const maxUrutan = await prisma.bagianUjian.aggregate({
      where: { ujianId: Number(ujianId) },
      _max: { urutan: true },
    });

    const newBagian = await prisma.bagianUjian.create({
      data: {
        ujianId: Number(ujianId),
        nama,
        urutan: urutan || (maxUrutan._max.urutan || 0) + 1,
        durasiMenit: durasiMenit || null,
        batasSoal: batasSoal || null,
      },
    });

    return NextResponse.json({ success: true, data: newBagian });
  } catch (error) {
    console.error('ERROR POST BAGIAN:', error);
    return NextResponse.json({ message: 'Gagal menambah bagian' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { id, nama, urutan, durasiMenit, batasSoal } = await request.json();

    if (!id) return NextResponse.json({ message: 'ID tidak valid' }, { status: 400 });

    const updated = await prisma.bagianUjian.update({
      where: { id: Number(id) },
      data: {
        nama,
        urutan: Number(urutan),
        durasiMenit: durasiMenit || null,
        batasSoal: batasSoal || null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('ERROR PUT BAGIAN:', error);
    return NextResponse.json({ message: 'Gagal mengubah bagian' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID tidak valid' }, { status: 400 });

    await prisma.soal.updateMany({ where: { bagianId: Number(id) }, data: { bagianId: null } });
    await prisma.bagianUjian.delete({ where: { id: Number(id) } });

    return NextResponse.json({ success: true, message: 'Bagian berhasil dihapus' });
  } catch (error) {
    console.error('ERROR DELETE BAGIAN:', error);
    return NextResponse.json({ message: 'Gagal menghapus bagian' }, { status: 500 });
  }
}
