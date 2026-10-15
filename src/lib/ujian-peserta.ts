import type { Prisma, Ujian } from '@prisma/client';
import { prisma } from './prisma';

// Ujian CAT sekolah per kelas: siapa pesertanya, ujian aktif mana yang berlaku untuk seorang siswa,
// dan apakah ia sudah mengerjakannya. Status "sudah" = ada SesiUjian selesai untuk (siswa, ujian) —
// tidak lagi memakai User.sudahUjian global, sehingga tiap ujian punya status sendiri dan tidak perlu "reset semua".

export type UjianTarget = Ujian & { mapel: { nama: string; kelas: { nama: string } } | null };
export const INCLUDE_TARGET = { mapel: { include: { kelas: { select: { nama: true } } } } } as const;

/** ",A,B," -> ["A","B"] */
export const bacaKelas = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
export const tulisKelas = (l: string[]) => (l.length ? `,${[...new Set(l.map((x) => x.trim()).filter(Boolean))].join(',')},` : '');

/** Daftar kelas peserta; null = semua siswa. */
export function kelasPeserta(u: UjianTarget): string[] | null {
  const daftar = bacaKelas(u.kelasTarget);
  if (daftar.length) return daftar;
  if (u.mapel) return [u.mapel.kelas.nama];
  return null;
}

export function untukKelas(u: UjianTarget, kelas: string) {
  const d = kelasPeserta(u);
  return d === null || d.includes(kelas);
}

/** Dua ujian beririsan pesertanya (tidak boleh aktif bersamaan). */
export function beririsan(a: UjianTarget, b: UjianTarget) {
  const ka = kelasPeserta(a);
  const kb = kelasPeserta(b);
  if (ka === null || kb === null) return true;
  return ka.some((k) => kb.includes(k));
}

/** Filter Prisma untuk siswa peserta ujian. */
export function wherePeserta(u: UjianTarget): Prisma.UserWhereInput {
  const d = kelasPeserta(u);
  return { role: 'PESERTA', ...(d ? { kelas: { in: d } } : {}) };
}

export function labelPeserta(u: UjianTarget) {
  const d = kelasPeserta(u);
  return d ? d.join(', ') : 'Semua siswa';
}

export async function sudahMengerjakan(userId: number, ujianId: number) {
  return !!(await prisma.sesiUjian.findFirst({ where: { userId, ujianId, selesai: true }, select: { id: true } }));
}

/**
 * Ujian aktif yang berlaku untuk pengguna ini. Siswa: ujian aktif yang menargetkan kelasnya
 * (aktif bersamaan tidak beririsan, jadi paling banyak satu). Admin (mencoba ujian): ujian aktif pertama.
 * lain = nama kelas peserta ujian aktif lain (untuk pesan "ujian bukan untuk kelas Anda").
 */
export async function ujianAktifUntuk(user: { id: number; role: string; kelas: string }) {
  const aktif = await prisma.ujian.findMany({ where: { isActive: true }, include: INCLUDE_TARGET, orderBy: [{ jadwalMulai: 'asc' }, { id: 'asc' }] });
  const ujian = user.role === 'ADMIN' ? aktif[0] ?? null : aktif.find((u) => untukKelas(u, user.kelas)) ?? null;
  const sudah = ujian && user.role !== 'ADMIN' ? await sudahMengerjakan(user.id, ujian.id) : false;
  return { ujian, sudah, adaAktif: aktif.length > 0, kelasLain: aktif.flatMap((u) => kelasPeserta(u) ?? []) };
}

/** Status per siswa untuk satu ujian: belum | mengerjakan | selesai. */
export async function statusPeserta(ujianId: number, userIds: number[]) {
  const sesi = await prisma.sesiUjian.findMany({ where: { ujianId, userId: { in: userIds } }, select: { userId: true, selesai: true } });
  const map = new Map<number, 'mengerjakan' | 'selesai'>();
  for (const s of sesi) if (s.selesai || !map.has(s.userId)) map.set(s.userId, s.selesai ? 'selesai' : map.get(s.userId) ?? 'mengerjakan');
  return (id: number) => map.get(id) ?? 'belum';
}
