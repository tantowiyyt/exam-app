import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { verifyCsrfToken } from '@/lib/csrf';
import { muatKonteks, gabungJawaban, GRACE_MS } from '@/lib/sesi-ujian';

// Simpan otomatis jawaban & tanda ragu ke server selama ujian berlangsung
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    if (!(await verifyCsrfToken(request))) {
      return NextResponse.json({ message: 'Token CSRF tidak valid' }, { status: 403 });
    }

    const ctx = await muatKonteks(session.nomorPeserta);
    if ('error' in ctx) return NextResponse.json({ message: ctx.error }, { status: ctx.httpStatus });
    const { sesi, tahap, status } = ctx;

    const serverNow = Date.now();
    if (status.habis || serverNow > status.tenggat + GRACE_MS) {
      return NextResponse.json({ message: 'Waktu sudah habis', habis: true, tahap: status.tahap, tenggat: status.tenggat, serverNow }, { status: 409 });
    }

    const body = await request.json();
    const { jawaban, ragu } = gabungJawaban(sesi, tahap, status, body);
    await prisma.sesiUjian.update({
      where: { id: sesi.id },
      data: { jawaban: JSON.stringify(jawaban), ragu: JSON.stringify(ragu) },
    });

    return NextResponse.json({
      success: true,
      tersimpan: Object.keys(jawaban).length,
      tahap: status.tahap,
      tenggat: status.tenggat,
      serverNow,
    });
  } catch (error) {
    console.error('ERROR SIMPAN JAWABAN:', error);
    return NextResponse.json({ message: 'Gagal menyimpan jawaban' }, { status: 500 });
  }
}
