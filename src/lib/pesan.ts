import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { adalahWali } from './wali';

// Aturan pesan pribadi (siapa boleh memulai percakapan dengan siapa):
//  ADMIN    -> siapa saja
//  GURU     -> admin, guru lain, siswa di kelas yang ia ajar/walikan, orang tua siswa tsb
//  PESERTA  -> admin, guru pengampu mapel di kelasnya, wali kelasnya (siswa tidak bisa mengirim ke siswa lain)
//  ORANGTUA -> admin, guru pengampu & wali kelas anaknya
//  PENGAWAS -> admin
// Selain itu, siapa pun boleh membalas orang yang sudah pernah mengirim pesan kepadanya.

type U = { id: number; role: string; nama: string };

/** Nama kelas yang diajar atau diwalikan guru ini. */
async function kelasGuru(guru: U) {
  const [diajar, semua] = await Promise.all([
    prisma.mapel.findMany({ where: { guruId: guru.id }, select: { kelas: { select: { nama: true } } } }),
    prisma.kelas.findMany({ select: { id: true, nama: true, keterangan: true, waliId: true } }),
  ]);
  return [...new Set([...diajar.map((m) => m.kelas.nama), ...semua.filter((k) => adalahWali(k, guru)).map((k) => k.nama)])];
}

/** Guru (pengampu + wali) untuk sekumpulan kelas. */
async function guruKelas(kelas: string[]) {
  if (!kelas.length) return [] as number[];
  const k = await prisma.kelas.findMany({ where: { nama: { in: kelas } }, select: { id: true, nama: true, keterangan: true, waliId: true, mapel: { select: { guruId: true } } } });
  const ids = new Set<number>();
  for (const x of k) {
    for (const m of x.mapel) if (m.guruId) ids.add(m.guruId);
    if (x.waliId) ids.add(x.waliId);
  }
  return [...ids];
}

/** Filter Prisma akun yang boleh dihubungi pengguna ini. */
export async function whereKontak(user: U): Promise<Prisma.UserWhereInput> {
  const bukanSaya = { id: { not: user.id } };
  if (user.role === 'ADMIN') return bukanSaya;
  if (user.role === 'PENGAWAS') return { ...bukanSaya, role: 'ADMIN' };
  if (user.role === 'GURU') {
    const kelas = await kelasGuru(user);
    const siswa = kelas.length ? (await prisma.user.findMany({ where: { role: 'PESERTA', kelas: { in: kelas } }, select: { id: true } })).map((s) => s.id) : [];
    const ortu = siswa.length ? (await prisma.orangTuaSiswa.findMany({ where: { siswaId: { in: siswa } }, select: { orangTuaId: true } })).map((o) => o.orangTuaId) : [];
    return { ...bukanSaya, OR: [{ role: { in: ['ADMIN', 'GURU'] } }, { id: { in: [...siswa, ...ortu] } }] };
  }
  if (user.role === 'PESERTA') {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true } });
    return { ...bukanSaya, OR: [{ role: 'ADMIN' }, { id: { in: await guruKelas(u?.kelas ? [u.kelas] : []) } }] };
  }
  if (user.role === 'ORANGTUA') {
    const anak = await prisma.orangTuaSiswa.findMany({ where: { orangTuaId: user.id }, select: { siswaId: true } });
    const kelas = (await prisma.user.findMany({ where: { id: { in: anak.map((a) => a.siswaId) } }, select: { kelas: true } })).map((x) => x.kelas).filter(Boolean);
    return { ...bukanSaya, OR: [{ role: 'ADMIN' }, { id: { in: await guruKelas(kelas) } }] };
  }
  return { id: -1 };
}

/** Boleh mengirim pesan ke akun ini? */
export async function bolehKirim(user: U, keId: number) {
  if (keId === user.id) return false;
  const balasan = await prisma.pesan.findFirst({ where: { dariId: keId, keId: user.id }, select: { id: true } });
  if (balasan) return !!(await prisma.user.findUnique({ where: { id: keId }, select: { id: true } }));
  return !!(await prisma.user.findFirst({ where: { AND: [{ id: keId }, await whereKontak(user)] }, select: { id: true } }));
}

export const LABEL_PERAN: Record<string, string> = { ADMIN: 'Admin', GURU: 'Guru', PENGAWAS: 'Pengawas', PESERTA: 'Siswa', ORANGTUA: 'Orang tua' };
