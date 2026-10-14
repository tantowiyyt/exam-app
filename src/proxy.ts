import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/session';

const publicRoutes = ['/', '/login', '/daftar'];

// Halaman yang boleh dibuka tiap role (prefix). Role diperiksa ulang dari database di setiap API.
const aksesRole: Record<string, string[]> = {
  ADMIN: ['/admin', '/dashboard', '/ujian', '/profile', '/akun', '/kelas'],
  PENGAWAS: ['/admin/monitoring', '/akun'],
  GURU: ['/kelas', '/akun'],
  PESERTA: ['/dashboard', '/ujian', '/profile', '/akun', '/kelas'],
};
const protectedRoutes = ['/admin', '/dashboard', '/ujian', '/profile', '/akun', '/kelas'];

// Aplikasi LMS: semua role masuk ke beranda LMS (/kelas), kecuali pengawas (monitoring ujian)
function beranda(role: string) {
  if (role === 'PENGAWAS') return '/admin/monitoring';
  return '/kelas';
}

const cocok = (path: string, route: string) => path === route || path.startsWith(route + '/');

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const session = await decrypt(request.cookies.get('session')?.value);

  // Pengguna yang sudah login tidak perlu melihat halaman publik (landing, login, daftar)
  if (publicRoutes.includes(path)) {
    return session ? NextResponse.redirect(new URL(beranda(session.role), request.nextUrl)) : NextResponse.next();
  }

  if (!protectedRoutes.some((r) => cocok(path, r))) {
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  const izin = aksesRole[session.role];
  if (!izin) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }
  if (!izin.some((r) => cocok(path, r))) {
    return NextResponse.redirect(new URL(beranda(session.role), request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
