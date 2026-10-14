import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { verifyCsrfToken } from '@/lib/csrf';
import { muatKonteks, gabungJawaban } from '@/lib/sesi-ujian';

// Mode bagian berwaktu: akhiri bagian aktif lebih awal dan pindah ke bagian berikutnya
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

    if (!status.berbagian) {
      return NextResponse.json({ message: 'Ujian ini tidak memakai bagian berwaktu' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    // Hanya boleh melanjutkan dari bagian yang sedang aktif (cegah klik ganda melompati bagian)
    if (typeof body.dariTahap === 'number' && body.dariTahap !== status.tahap) {
      return NextResponse.json({ success: true, tahap: status.tahap });
    }
    if (status.tahap >= tahap.length - 1) {
      return NextResponse.json({ message: 'Ini bagian terakhir. Gunakan tombol Selesai Ujian.' }, { status: 400 });
    }

    const { jawaban, ragu } = status.habis ? { jawaban: undefined, ragu: undefined } : gabungJawaban(sesi, tahap, status, body);
    await prisma.sesiUjian.update({
      where: { id: sesi.id },
      data: {
        ...(jawaban ? { jawaban: JSON.stringify(jawaban), ragu: JSON.stringify(ragu) } : {}),
        tahap: status.tahap + 1,
        tahapMulai: new Date(),
        tambahanMenit: 0,
      },
    });

    return NextResponse.json({ success: true, tahap: status.tahap + 1 });
  } catch (error) {
    console.error('ERROR LANJUT BAGIAN:', error);
    return NextResponse.json({ message: 'Gagal pindah bagian' }, { status: 500 });
  }
}
