import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/session';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { checkIPAccess, getClientIP } from '@/lib/ip-check';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    // Check IP access first
    const clientIP = getClientIP(request);
    const ipCheck = await checkIPAccess(clientIP);
    if (!ipCheck.allowed) {
      await createAuditLog({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        details: { reason: 'IP blocked', ip: clientIP },
        ipAddress: clientIP,
      });
      return NextResponse.json({ message: ipCheck.reason || 'Akses ditolak' }, { status: 403 });
    }

    const body = await request.json();
    const { nomorPeserta, password } = body;

    if (!nomorPeserta || !password) {
      return NextResponse.json({ message: 'Nomor peserta dan password wajib diisi' }, { status: 400 });
    }

    // Rate limit check
    const rateLimitKey = `login:${nomorPeserta}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey);
    if (!allowed) {
      const retryAfterMenit = Math.ceil(retryAfterMs / 60000);
      return NextResponse.json(
        { message: `Terlalu banyak percobaan login. Coba lagi dalam ${retryAfterMenit} menit.` },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { nomorPeserta: nomorPeserta },
    });

    if (!user) {
      return NextResponse.json({ message: 'Nomor peserta tidak terdaftar!' }, { status: 401 });
    }

    // Check if password is hashed (starts with $2a$ or $2b$)
    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');

    let passwordMatch = false;
    if (isHashed) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      // Plain text comparison for legacy passwords
      passwordMatch = user.password === password;
      // Hash and update the password for next time
      if (passwordMatch) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
      }
    }

    if (!passwordMatch) {
      return NextResponse.json({ message: 'Password yang Anda masukkan salah!' }, { status: 401 });
    }

    // Reset rate limit on successful login
    resetRateLimit(rateLimitKey);

    // Create session cookie
    await createSession(user.nomorPeserta, user.nama, user.role);

    // Log user activity
    const userAgent = request.headers.get('user-agent') || '';
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0] || '127.0.0.1';

    await prisma.userActivity.create({
      data: {
        userId: user.id,
        activity: 'LOGIN',
        ipAddress,
        userAgent,
      },
    });

    // Create audit log
    await createAuditLog({
      action: AUDIT_ACTIONS.LOGIN,
      target: `User ${user.nama}`,
      details: { nomorPeserta: user.nomorPeserta, role: user.role },
      ipAddress: clientIP,
    });

    return NextResponse.json({
      success: true,
      nomorPeserta: user.nomorPeserta,
      nama: user.nama,
      role: user.role,
    });
  } catch (error) {
    console.error('ERROR PADA API LOGIN:', error);
    return NextResponse.json({ message: 'Gagal terhubung ke server database' }, { status: 500 });
  }
}
