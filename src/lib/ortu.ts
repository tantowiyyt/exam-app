import { prisma } from './prisma';

// Akun orang tua (role ORANGTUA) memantau anaknya (hanya baca). Tautan di tabel OrangTuaSiswa.

export async function anakDari(orangTuaId: number) {
  const link = await prisma.orangTuaSiswa.findMany({ where: { orangTuaId }, select: { siswaId: true } });
  if (!link.length) return [];
  return prisma.user.findMany({
    where: { id: { in: link.map((l) => l.siswaId) }, role: 'PESERTA' },
    select: { id: true, nomorPeserta: true, nama: true, kelas: true, foto: true },
    orderBy: { nama: 'asc' },
  });
}

/** Siswa ini anak dari orang tua tsb? Mengembalikan data siswa atau null. */
export async function anakMilik(orangTuaId: number, siswaId: number) {
  if (!Number.isInteger(siswaId)) return null;
  const ada = await prisma.orangTuaSiswa.findUnique({ where: { orangTuaId_siswaId: { orangTuaId, siswaId } } });
  if (!ada) return null;
  return prisma.user.findFirst({ where: { id: siswaId, role: 'PESERTA' }, select: { id: true, nomorPeserta: true, nama: true, kelas: true, role: true } });
}
