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

// ---------- Penugasan tugas ke siswa tertentu ----------
// Tugas.untukSiswa: "" = semua siswa kelas, ",3,7," = hanya siswa id 3 & 7

export function kodeSiswa(ids: unknown): string {
  if (!Array.isArray(ids)) return '';
  const unik = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return unik.length ? `,${unik.join(',')},` : '';
}

export function idSiswa(kode: string): number[] {
  return kode.split(',').filter(Boolean).map(Number);
}

export function ditugaskan(t: { untukSiswa: string }, userId: number) {
  return !t.untukSiswa || t.untukSiswa.includes(`,${userId},`);
}

// ---------- Terbit terjadwal ----------
// Materi/tugas terlihat siswa bila terbit = true dan (terbitPada kosong atau sudah lewat)

/** Filter Prisma: materi/tugas yang sudah terlihat siswa. */
export function whereTerbit() {
  return { terbit: true, OR: [{ terbitPada: null }, { terbitPada: { lte: new Date() } }] };
}

export function sudahTerbit(row: { terbit: boolean; terbitPada?: Date | null }) {
  return row.terbit && (!row.terbitPada || row.terbitPada <= new Date());
}

/** Filter Prisma: tugas terbit yang ditugaskan ke siswa ini. */
export function whereTugasSiswa(userId: number) {
  return { AND: [whereTerbit(), { OR: [{ untukSiswa: '' }, { untukSiswa: { contains: `,${userId},` } }] }] };
}

/** Jadwal terbit dari body: null = langsung; undefined = tidak valid. */
export function jadwalTerbit(v: unknown): Date | null | undefined {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

/** Topik dari body: null = tanpa topik; undefined = bukan topik mapel ini. */
export async function topikValid(v: unknown, mapelId: number): Promise<number | null | undefined> {
  if (v === null || v === undefined || v === '' || v === 0) return null;
  const id = Number(v);
  if (!Number.isInteger(id)) return undefined;
  const t = await prisma.topik.findUnique({ where: { id }, select: { mapelId: true } });
  return t?.mapelId === mapelId ? id : undefined;
}

// ---------- Rubrik penilaian tugas ----------
// Tugas.rubrik: JSON [{kriteria, deskripsi, maks}]; PengumpulanTugas.nilaiRubrik: JSON number[] (poin per kriteria)

export type Kriteria = { kriteria: string; deskripsi: string; maks: number };
export const MAKS_KRITERIA = 20;

export function rubrikDariBody(v: unknown): { rubrik: Kriteria[] } | { error: string } {
  if (v === undefined || v === null) return { rubrik: [] };
  if (!Array.isArray(v) || v.length > MAKS_KRITERIA) return { error: `Rubrik maksimal ${MAKS_KRITERIA} kriteria` };
  const rubrik: Kriteria[] = [];
  for (const [i, r] of v.entries()) {
    const kriteria = teks(r?.kriteria, 200);
    const maks = Number(r?.maks);
    if (!kriteria) return { error: `Kriteria ${i + 1}: nama wajib diisi` };
    if (!Number.isInteger(maks) || maks < 1 || maks > 1000) return { error: `Kriteria ${i + 1}: skor maksimal 1–1000` };
    rubrik.push({ kriteria, deskripsi: teks(r?.deskripsi, 1000), maks });
  }
  return { rubrik };
}

export function bacaRubrik(s: string): Kriteria[] {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function bacaNilaiRubrik(s: string): number[] {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v.map(Number) : [];
  } catch {
    return [];
  }
}

// ---------- Banyak lampiran ----------
// Lampiran pertama di kolom lampiran/namaLampiran (kompatibel data lama), sisanya JSON di lampiranLain.

export type Berkas = { url: string; nama: string };
export const MAKS_BERKAS = 5;

/** Baca daftar lampiran dari body (berkas: [{url,nama}] atau lampiran/namaLampiran tunggal). */
export function berkasDariBody(body: Record<string, unknown>): { berkas: Berkas[] } | { error: string } {
  const mentah: unknown[] = Array.isArray(body.berkas)
    ? body.berkas
    : body.lampiran ? [{ url: body.lampiran, nama: body.namaLampiran }] : [];
  if (mentah.length > MAKS_BERKAS) return { error: `Maksimal ${MAKS_BERKAS} lampiran` };
  const berkas: Berkas[] = [];
  for (const b of mentah) {
    const url = (b as Berkas)?.url;
    if (!lampiranValid(url)) return { error: 'Lampiran tidak valid' };
    if (!berkas.some((x) => x.url === url)) berkas.push({ url, nama: teks((b as Berkas).nama, 200) || 'Lampiran' });
  }
  return { berkas };
}

/** Kolom DB dari daftar lampiran. */
export function kolomBerkas(berkas: Berkas[]) {
  return { lampiran: berkas[0]?.url ?? '', namaLampiran: berkas[0]?.nama ?? '', lampiranLain: JSON.stringify(berkas.slice(1)) };
}

/** Daftar lampiran dari baris DB. */
export function daftarBerkas(row: { lampiran: string; namaLampiran: string; lampiranLain?: string }): Berkas[] {
  const out: Berkas[] = row.lampiran ? [{ url: row.lampiran, nama: row.namaLampiran }] : [];
  try {
    const lain = JSON.parse(row.lampiranLain || '[]');
    if (Array.isArray(lain)) for (const b of lain) if (lampiranValid(b?.url)) out.push({ url: b.url, nama: String(b.nama ?? '') });
  } catch {
    // JSON rusak = abaikan lampiran tambahan
  }
  return out;
}

/** Daftar mapel yang bisa dibuka pengguna. */
export async function mapelPengguna(user: { id: number; role: string }) {
  // Siswa hanya menghitung materi & tugas yang sudah terbit (draf tidak terlihat olehnya) dan tugas yang ditugaskan kepadanya
  const siswa = user.role === 'PESERTA';
  const include = {
    kelas: { select: { id: true, nama: true } },
    guru: { select: { id: true, nama: true } },
    _count: { select: { materi: siswa ? { where: whereTerbit() } : true, tugas: siswa ? { where: whereTugasSiswa(user.id) } : true, kuis: siswa ? { where: { terbit: true } } : true } },
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

/** Urutkan ujian offline: tanggal terdekat dulu, tanpa tanggal di akhir. */
export function urutUjianManual<T extends { id: number; tanggal: Date | null }>(list: T[]): T[] {
  return list.sort((a, b) => (a.tanggal?.getTime() ?? Infinity) - (b.tanggal?.getTime() ?? Infinity) || a.id - b.id);
}

/** Operasi hapus/lepas data LMS milik user — disertakan di transaksi hapus akun/peserta. */
export function opsHapusDataLms(userId: number) {
  return [
    prisma.komentar.deleteMany({ where: { userId } }),
    prisma.materiDibaca.deleteMany({ where: { userId } }),
    prisma.pengumpulanTugas.deleteMany({ where: { userId } }),
    prisma.percobaanKuis.deleteMany({ where: { userId } }),
    prisma.presensi.deleteMany({ where: { userId } }),
    prisma.nilaiUjianManual.deleteMany({ where: { userId } }),
    prisma.bankSoal.deleteMany({ where: { pemilikId: userId } }),
    prisma.deskripsiRapor.deleteMany({ where: { userId } }),
    prisma.catatanRapor.deleteMany({ where: { userId } }),
    prisma.dataRapor.deleteMany({ where: { userId } }),
    prisma.anggotaKelas.deleteMany({ where: { userId } }),
    prisma.permintaanReset.deleteMany({ where: { userId } }),
    prisma.kodeReset.deleteMany({ where: { userId } }),
    prisma.jurnalMengajar.deleteMany({ where: { guruId: userId } }),
    prisma.kelas.updateMany({ where: { waliId: userId }, data: { waliId: null } }),
    prisma.pengumuman.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.mapel.updateMany({ where: { guruId: userId }, data: { guruId: null } }),
  ];
}

/**
 * Mapel pemilik materi/tugas/pengumuman — untuk memeriksa akses komentar.
 * terbit = terlihat oleh siswa userId (tugas yang tidak ditugaskan kepadanya dianggap tidak terlihat).
 */
export async function mapelDariTarget(t: { materiId?: number; tugasId?: number; pengumumanId?: number }, userId?: number) {
  if (t.materiId) {
    const m = await prisma.materi.findUnique({ where: { id: t.materiId }, select: { mapelId: true, terbit: true, terbitPada: true } });
    return m ? { mapelId: m.mapelId, terbit: sudahTerbit(m) } : null;
  }
  if (t.tugasId) {
    const tg = await prisma.tugas.findUnique({ where: { id: t.tugasId }, select: { mapelId: true, terbit: true, terbitPada: true, untukSiswa: true } });
    return tg ? { mapelId: tg.mapelId, terbit: sudahTerbit(tg) && (userId === undefined || ditugaskan(tg, userId)) } : null;
  }
  if (t.pengumumanId) {
    const p = await prisma.pengumuman.findUnique({ where: { id: t.pengumumanId }, select: { mapelId: true } });
    return p ? { ...p, terbit: true } : null;
  }
  return null;
}

/**
 * Boleh membuka lampiran? Lampiran materi/tugas: anggota mapel (draf hanya pengelola).
 * Lampiran jawaban tugas: siswa pemiliknya & pengelola mapel.
 * File yang belum ditautkan (baru diunggah, belum disimpan) boleh dibuka — namanya acak (UUID).
 */
export async function bolehBukaLampiran(user: { id: number; role: string }, url: string) {
  if (user.role === 'ADMIN') return true;
  // Lampiran ke-2 dst. tersimpan di JSON lampiranLain
  const diLain = { lampiranLain: { contains: `"${url}"` } };
  const [materi, tugas, kumpul] = await Promise.all([
    prisma.materi.findMany({ where: { lampiran: url }, select: { mapelId: true, terbit: true, terbitPada: true } }),
    prisma.tugas.findMany({ where: { OR: [{ lampiran: url }, diLain] }, select: { mapelId: true, terbit: true, terbitPada: true, untukSiswa: true } }),
    prisma.pengumpulanTugas.findMany({ where: { OR: [{ lampiran: url }, diLain] }, select: { userId: true, tugas: { select: { mapelId: true } } } }),
  ]);
  if (!materi.length && !tugas.length && !kumpul.length) return true;

  for (const m of [...materi.map((x) => ({ mapelId: x.mapelId, terbit: sudahTerbit(x) })), ...tugas.map((t) => ({ mapelId: t.mapelId, terbit: sudahTerbit(t) && ditugaskan(t, user.id) }))]) {
    const akses = await aksesMapel(user, m.mapelId);
    if (akses && (akses.peran === 'kelola' || m.terbit)) return true;
  }
  for (const k of kumpul) {
    if (k.userId === user.id) return true;
    if ((await aksesMapel(user, k.tugas.mapelId))?.peran === 'kelola') return true;
  }
  return false;
}
