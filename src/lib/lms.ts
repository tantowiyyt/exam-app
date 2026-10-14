import { prisma } from './prisma';
import { verifyRole } from './admin-auth';

/** Pengguna LMS: admin & guru mengelola, peserta (siswa) belajar. */
export function verifyLmsSession() {
  return verifyRole(['ADMIN', 'GURU', 'PESERTA']);
}

export type PeranMapel = 'kelola' | 'siswa';

/**
 * Hak akses ke satu mapel: admin & guru pengampu = "kelola", peserta di kelas itu = "siswa".
 * null = tidak boleh mengakses.
 */
export async function aksesMapel(user: { id: number; role: string }, mapelId: number) {
  if (!Number.isInteger(mapelId) || mapelId <= 0) return null;
  const mapel = await prisma.mapel.findUnique({
    where: { id: mapelId },
    include: { kelas: true, guru: { select: { id: true, nama: true } } },
  });
  if (!mapel) return null;

  if (user.role === 'ADMIN' || (user.role === 'GURU' && mapel.guruId === user.id)) {
    return { mapel, peran: 'kelola' as PeranMapel };
  }
  if (user.role === 'PESERTA') {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true } });
    if (u?.kelas && u.kelas === mapel.kelas.nama) return { mapel, peran: 'siswa' as PeranMapel };
  }
  return null;
}

/** Daftar mapel yang bisa dibuka pengguna. */
export async function mapelPengguna(user: { id: number; role: string }) {
  // Siswa hanya menghitung materi & tugas yang sudah terbit (draf tidak terlihat olehnya)
  const terbit = user.role === 'PESERTA' ? { where: { terbit: true } } : true;
  const include = {
    kelas: { select: { id: true, nama: true } },
    guru: { select: { id: true, nama: true } },
    _count: { select: { materi: terbit, tugas: terbit } },
  } as const;
  if (user.role === 'ADMIN') {
    return prisma.mapel.findMany({ include, orderBy: [{ kelas: { nama: 'asc' } }, { nama: 'asc' }] });
  }
  if (user.role === 'GURU') {
    return prisma.mapel.findMany({ where: { guruId: user.id }, include, orderBy: [{ kelas: { nama: 'asc' } }, { nama: 'asc' }] });
  }
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true } });
  if (!u?.kelas) return [];
  return prisma.mapel.findMany({ where: { kelas: { nama: u.kelas } }, include, orderBy: { nama: 'asc' } });
}

/** Teks bebas: dipangkas & dibatasi panjangnya. */
export function teks(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Hanya URL lampiran hasil upload LMS yang diterima. */
export function lampiranValid(url: unknown): url is string {
  return typeof url === 'string' && /^\/api\/lms\/file\/[\w-]+\.[a-z0-9]+$/i.test(url);
}

/** Link video: hanya http(s). */
export function linkValid(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString().slice(0, 500) : '';
  } catch {
    return '';
  }
}

/** Operasi hapus/lepas data LMS milik user — disertakan di transaksi hapus akun/peserta. */
export function opsHapusDataLms(userId: number) {
  return [
    prisma.komentar.deleteMany({ where: { userId } }),
    prisma.materiDibaca.deleteMany({ where: { userId } }),
    prisma.pengumpulanTugas.deleteMany({ where: { userId } }),
    prisma.pengumuman.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.mapel.updateMany({ where: { guruId: userId }, data: { guruId: null } }),
  ];
}

/** Mapel pemilik materi/tugas/pengumuman — untuk memeriksa akses komentar. */
export async function mapelDariTarget(t: { materiId?: number; tugasId?: number; pengumumanId?: number }) {
  if (t.materiId) return (await prisma.materi.findUnique({ where: { id: t.materiId }, select: { mapelId: true, terbit: true } })) ?? null;
  if (t.tugasId) return (await prisma.tugas.findUnique({ where: { id: t.tugasId }, select: { mapelId: true, terbit: true } })) ?? null;
  if (t.pengumumanId) {
    const p = await prisma.pengumuman.findUnique({ where: { id: t.pengumumanId }, select: { mapelId: true } });
    return p ? { ...p, terbit: true } : null;
  }
  return null;
}
