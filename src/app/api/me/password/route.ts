import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Ganti password akun yang sedang login (admin maupun peserta)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });

    const key = `ganti-password:${session.nomorPeserta}`;
    if (!checkRateLimit(key).allowed) {
      return NextResponse.json({ message: 'Terlalu banyak percobaan. Coba lagi nanti.' }, { status: 429 });
    }

    const { passwordLama, passwordBaru } = await request.json();
    if (typeof passwordLama !== 'string' || typeof passwordBaru !== 'string' || !passwordLama || !passwordBaru) {
      return NextResponse.json({ message: 'Password lama dan baru wajib diisi' }, { status: 400 });
    }
    if (passwordBaru.length < 6) {
      return NextResponse.json({ message: 'Password baru minimal 6 karakter' }, { status: 400 });
    }
    if (passwordBaru === passwordLama) {
      return NextResponse.json({ message: 'Password baru harus berbeda dari password lama' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { nomorPeserta: session.nomorPeserta } });
    if (!user) return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 404 });

    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
    const cocok = isHashed ? await bcrypt.compare(passwordLama, user.password) : user.password === passwordLama;
    if (!cocok) {
      return NextResponse.json({ message: 'Password lama salah' }, { status: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(passwordBaru, 10) } });
    resetRateLimit(key);
    await createAuditLog({ action: 'CHANGE_PASSWORD', target: `User ${user.nomorPeserta}`, ipAddress: getAuditIP(request) });

    return NextResponse.json({ success: true, message: 'Password berhasil diubah' });
  } catch (error) {
    console.error('ERROR GANTI PASSWORD:', error);
    return NextResponse.json({ message: 'Gagal mengubah password' }, { status: 500 });
  }
}
