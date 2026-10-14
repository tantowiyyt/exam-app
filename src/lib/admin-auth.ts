import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export type Role = 'ADMIN' | 'PENGAWAS' | 'PESERTA';
export const ROLES: Role[] = ['ADMIN', 'PENGAWAS', 'PESERTA'];

/**
 * Pastikan pengguna login dan role-nya (dibaca dari database, bukan dari token)
 * termasuk dalam `allowed`. Role dari database dipakai agar akun yang diturunkan
 * atau dihapus langsung kehilangan akses tanpa menunggu token kedaluwarsa.
 */
export async function verifyRole(allowed: Role[]) {
  const session = await getSession();

  if (!session) {
    return { ok: false as const, message: 'Tidak terautentikasi', status: 401 as const };
  }

  const user = await prisma.user.findUnique({
    where: { nomorPeserta: session.nomorPeserta },
    select: { id: true, nomorPeserta: true, nama: true, role: true, ruang: true },
  });

  if (!user) {
    return { ok: false as const, message: 'Tidak terautentikasi', status: 401 as const };
  }

  if (!allowed.includes(user.role as Role)) {
    return { ok: false as const, message: 'Tidak memiliki akses', status: 403 as const };
  }

  return { ok: true as const, session, user };
}

export function verifyAdminSession() {
  return verifyRole(['ADMIN']);
}

/** Admin atau pengawas ruang (monitoring & aksi sesi ujian). */
export function verifyStaffSession() {
  return verifyRole(['ADMIN', 'PENGAWAS']);
}

/** Ruang yang boleh diawasi: null = semua ruang (admin / pengawas tanpa ruang). */
export function ruangPengawas(user: { role: string; ruang: string }): string | null {
  return user.role === 'PENGAWAS' && user.ruang ? user.ruang : null;
}
