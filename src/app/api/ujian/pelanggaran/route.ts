import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { ujianAktifUntuk } from '@/lib/ujian-peserta';
import { verifyStaffSession, ruangPengawas } from '@/lib/admin-auth';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { nomorPeserta: session.nomorPeserta },
    });
    if (!user) {
      return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 404 });
    }

    if (user.role !== 'ADMIN' && (await ujianAktifUntuk(user)).sudah) {
      return NextResponse.json({ message: 'Ujian sudah selesai' }, { status: 409 });
    }

    const body = await request.json();
    const { jenis, keterangan } = body;

    if (!jenis || typeof jenis !== 'string') {
      return NextResponse.json({ message: 'jenis pelanggaran wajib diisi' }, { status: 400 });
    }

    await prisma.pelanggaran.create({
      data: {
        userId: user.id,
        jenis: jenis.slice(0, 50),
        keterangan: typeof keterangan === 'string' ? keterangan.slice(0, 255) : null,
      },
    });

    // Hitung pelanggaran pada percobaan ini saja (sejak ujian terakhir selesai),
    // agar peserta yang di-reset tidak langsung terkena auto-submit.
    const historiTerakhir = await prisma.historiUjian.findFirst({
      where: { userId: user.id },
      orderBy: { waktuSelesai: 'desc' },
      select: { waktuSelesai: true },
    });
    const totalPelanggaran = await prisma.pelanggaran.count({
      where: {
        userId: user.id,
        ...(historiTerakhir ? { createdAt: { gt: historiTerakhir.waktuSelesai } } : {}),
      },
    });

    return NextResponse.json({ success: true, totalPelanggaran });
  } catch (error) {
    console.error('ERROR LOG PELANGGARAN:', error);
    return NextResponse.json({ message: 'Gagal mencatat pelanggaran' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const auth = await verifyStaffSession();
    if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

    const ruang = ruangPengawas(auth.user);
    const pelanggaran = await prisma.pelanggaran.findMany({
      where: ruang ? { user: { ruang } } : {},
      include: { user: { select: { nomorPeserta: true, nama: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json(pelanggaran);
  } catch (error) {
    console.error('ERROR GET PELANGGARAN:', error);
    return NextResponse.json({ message: 'Gagal mengambil data pelanggaran' }, { status: 500 });
  }
}
