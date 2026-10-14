import { prisma } from './prisma';

// Tahun ajaran & semester aktif (global). Tugas, kuis, pertemuan presensi, dan ujian mapel yang baru dibuat
// tercatat di semester aktif; daftar & rekap nilai mapel dipilih per semester.

export const NAMA_SEMESTER = ['Ganjil', 'Genap'] as const;

export type InfoSemester = { id: number; tahunAjaran: string; semester: string; aktif: boolean; label: string };
export const labelSemester = (s: { tahunAjaran: string; semester: string }) => `${s.tahunAjaran} ${s.semester}`;
const info = (s: { id: number; tahunAjaran: string; semester: string; aktif: boolean }): InfoSemester => ({ ...s, label: labelSemester(s) });

/** Tebakan semester dari tanggal: Juli–Desember = Ganjil, Januari–Juni = Genap. */
export function semesterDariTanggal(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 6
    ? { tahunAjaran: `${y}/${y + 1}`, semester: 'Ganjil' }
    : { tahunAjaran: `${y - 1}/${y}`, semester: 'Genap' };
}

/** Data yang dicatat per semester (kolom semesterId). */
const TABEL = ['tugas', 'kuis', 'sesiPresensi', 'ujianManual'] as const;

/**
 * Semester aktif. Bila belum ada sama sekali, dibuat otomatis dari tanggal hari ini dan semua data lama
 * (yang belum punya semester) dimasukkan ke semester itu.
 */
export async function semesterAktif(): Promise<InfoSemester> {
  const aktif = await prisma.semester.findFirst({ where: { aktif: true }, orderBy: { id: 'desc' } });
  if (aktif) return info(aktif);
  const ada = await prisma.semester.findFirst({ orderBy: { id: 'desc' } });
  if (ada) return info(await prisma.semester.update({ where: { id: ada.id }, data: { aktif: true } }));

  const baru = await prisma.semester.upsert({
    where: { tahunAjaran_semester: semesterDariTanggal() },
    update: { aktif: true },
    create: { ...semesterDariTanggal(), aktif: true },
  });
  await isiSemesterKosong(baru.id);
  return info(baru);
}

/** Data tanpa semester (dibuat sebelum fitur semester) dimasukkan ke semester id. */
export async function isiSemesterKosong(id: number) {
  await prisma.$transaction(TABEL.map((t) => (prisma[t] as unknown as { updateMany: (a: object) => Promise<unknown> })
    .updateMany({ where: { semesterId: null }, data: { semesterId: id } })) as never);
}

/** Semester dari ?semester= (id) atau semester aktif bila kosong/tidak dikenal. */
export async function semesterDipilih(param: string | null | undefined): Promise<InfoSemester> {
  const aktif = await semesterAktif();
  const id = Number(param);
  if (!param || !Number.isInteger(id) || id === aktif.id) return aktif;
  const s = await prisma.semester.findUnique({ where: { id } });
  return s ? info(s) : aktif;
}

export async function daftarSemester(): Promise<InfoSemester[]> {
  await semesterAktif();
  const list = await prisma.semester.findMany({ orderBy: [{ tahunAjaran: 'desc' }, { semester: 'desc' }] });
  return list.map(info);
}

export function validTahunAjaran(v: unknown): string | null {
  const m = /^(\d{4})\s*\/\s*(\d{4})$/.exec(String(v ?? '').trim());
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  return `${m[1]}/${m[2]}`;
}
