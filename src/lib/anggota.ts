import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Arsip anggota kelas per semester. Anggota kelas "sekarang" = User.kelas; agar data semester lalu
// (rekap nilai, presensi, rapor) tetap utuh setelah kenaikan/pindah kelas massal, keanggotaan disalin ke
// AnggotaKelas saat semester diganti dan sebelum pindah kelas. Semester yang belum punya arsip memakai User.kelas.

type Sem = { id: number; aktif: boolean };

/** Salin keanggotaan kelas saat ini ke arsip semester (baris yang sudah ada tidak ditimpa). */
export async function arsipkanAnggota(semesterId: number) {
  const [siswa, ada] = await Promise.all([
    prisma.user.findMany({ where: { role: 'PESERTA', kelas: { not: '' } }, select: { id: true, kelas: true } }),
    prisma.anggotaKelas.findMany({ where: { semesterId }, select: { userId: true } }),
  ]);
  const sudah = new Set(ada.map((a) => a.userId));
  const baru = siswa.filter((s) => !sudah.has(s.id)).map((s) => ({ semesterId, userId: s.id, kelas: s.kelas }));
  for (let i = 0; i < baru.length; i += 500) await prisma.anggotaKelas.createMany({ data: baru.slice(i, i + 500) });
  return baru.length;
}

/** Arsipkan semester aktif (dipanggil sebelum pindah kelas massal & sebelum ganti semester). */
export async function arsipkanSemesterAktif() {
  const aktif = await prisma.semester.findFirst({ where: { aktif: true }, select: { id: true } });
  return aktif ? arsipkanAnggota(aktif.id) : 0;
}

async function adaArsip(semesterId: number) {
  return !!(await prisma.anggotaKelas.findFirst({ where: { semesterId }, select: { id: true } }));
}

/** Filter Prisma siswa anggota kelas pada semester tsb. Semester aktif / tanpa arsip = User.kelas. */
export async function whereAnggota(kelas: string, semester?: Sem | null): Promise<Prisma.UserWhereInput> {
  if (semester && !semester.aktif && (await adaArsip(semester.id))) {
    const rows = await prisma.anggotaKelas.findMany({ where: { semesterId: semester.id, kelas }, select: { userId: true } });
    return { role: 'PESERTA', id: { in: rows.map((r) => r.userId) } };
  }
  return { role: 'PESERTA', kelas };
}

/** Kelas seorang siswa pada semester tsb. */
export async function kelasSiswaDi(userId: number, semester?: Sem | null): Promise<string> {
  if (semester && !semester.aktif) {
    const a = await prisma.anggotaKelas.findUnique({ where: { semesterId_userId: { semesterId: semester.id, userId } }, select: { kelas: true } });
    if (a) return a.kelas;
  }
  return (await prisma.user.findUnique({ where: { id: userId }, select: { kelas: true } }))?.kelas ?? '';
}
