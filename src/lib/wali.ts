import { prisma } from './prisma';

// Wali kelas: Kelas.waliId (akun guru). Data lama: "Wali kelas: Nama" di keterangan kelas.

/** Nama wali kelas dari keterangan kelas, mis. "Wali kelas: Siti Nurhaliza". */
export function waliDariKeterangan(keterangan: string) {
  const m = /wali\s*kelas\s*:?\s*(.+)/i.exec(keterangan);
  return m ? m[1].trim() : '';
}

type Kelas = { id: number; nama: string; keterangan: string; waliId: number | null };

/** Apakah guru ini wali kelas tsb. */
export function adalahWali(k: Kelas, user: { id: number; nama: string }) {
  if (k.waliId) return k.waliId === user.id;
  return !!user.nama && waliDariKeterangan(k.keterangan).toLowerCase() === user.nama.toLowerCase();
}

/** Nama wali untuk ditampilkan (akun wali bila ada, selain itu dari keterangan). */
export async function namaWali(k: Kelas) {
  if (k.waliId) return (await prisma.user.findUnique({ where: { id: k.waliId }, select: { nama: true } }))?.nama ?? '';
  return waliDariKeterangan(k.keterangan);
}

/** Kelas yang diwalikan guru ini. */
export async function kelasWalian(user: { id: number; nama: string }) {
  const semua = await prisma.kelas.findMany({ orderBy: { nama: 'asc' } });
  return semua.filter((k) => adalahWali(k, user));
}

/** Kelas yang boleh dibuka staf di rapor: admin semua; guru = kelas yang diajar atau diwalikan. */
export async function kelasBolehDibuka(user: { id: number; role: string; nama: string }) {
  const semua = await prisma.kelas.findMany({ orderBy: { nama: 'asc' }, include: { mapel: { select: { guruId: true } } } });
  if (user.role === 'ADMIN') return semua;
  if (user.role === 'GURU') return semua.filter((k) => k.mapel.some((m) => m.guruId === user.id) || adalahWali(k, user));
  return [];
}
