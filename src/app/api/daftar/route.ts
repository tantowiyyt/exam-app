import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/ip-check';

function generateNomorPeserta(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PS-${date}-${random}`;
}

export async function POST(request: Request) {
  try {
    // Batasi pendaftaran massal dari satu IP
    const { allowed } = checkRateLimit(`daftar:${getClientIP(request)}`);
    if (!allowed) {
      return NextResponse.json({ message: 'Terlalu banyak pendaftaran dari perangkat ini. Coba lagi nanti.' }, { status: 429 });
    }

    const { nama, password } = await request.json();

    if (typeof nama !== 'string' || typeof password !== 'string' || !nama.trim() || !password) {
      return NextResponse.json({ message: 'Nama dan Password wajib diisi' }, { status: 400 });
    }

    if (nama.trim().length > 100) {
      return NextResponse.json({ message: 'Nama terlalu panjang' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ message: 'Password minimal 6 karakter' }, { status: 400 });
    }

    let nomorPeserta = generateNomorPeserta();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.user.findUnique({ where: { nomorPeserta } });
      if (!existing) break;
      nomorPeserta = generateNomorPeserta();
      attempts++;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        nomorPeserta,
        nama: nama.trim(),
        password: hashedPassword,
        role: 'PESERTA',
        // Ruang & sesi dibagikan otomatis saat peserta melengkapi profil
        ruang: '',
        sesi: '',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Registrasi berhasil!',
      data: { id: newUser.id, nomorPeserta: newUser.nomorPeserta, nama: newUser.nama },
    });
  } catch (error) {
    console.error('ERROR PADA POST DAFTAR:', error);
    return NextResponse.json({ message: 'Gagal melakukan registrasi' }, { status: 500 });
  }
}
