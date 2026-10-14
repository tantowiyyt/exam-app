import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const rules = await prisma.iPRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('ERROR PADA GET IP RULES:', error);
    return NextResponse.json({ message: 'Gagal mengambil data IP rules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { ipAddress, type, keterangan } = body;

    if (!ipAddress || !type) {
      return NextResponse.json({ message: 'IP Address dan Type wajib diisi' }, { status: 400 });
    }

    if (!['WHITELIST', 'BLACKLIST'].includes(type)) {
      return NextResponse.json({ message: 'Type harus WHITELIST atau BLACKLIST' }, { status: 400 });
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(ipAddress)) {
      return NextResponse.json({ message: 'Format IP Address tidak valid' }, { status: 400 });
    }

    const rule = await prisma.iPRule.create({
      data: {
        ipAddress,
        type,
        keterangan,
        createdBy: auth.session?.nama || 'Admin',
      },
    });

    return NextResponse.json({ message: 'IP Rule berhasil ditambahkan', rule });
  } catch (error) {
    console.error('ERROR PADA POST IP RULE:', error);
    return NextResponse.json({ message: 'Gagal menambahkan IP rule' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: 'ID rule wajib diisi' }, { status: 400 });
    }

    await prisma.iPRule.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'IP Rule berhasil dihapus' });
  } catch (error) {
    console.error('ERROR PADA DELETE IP RULE:', error);
    return NextResponse.json({ message: 'Gagal menghapus IP rule' }, { status: 500 });
  }
}