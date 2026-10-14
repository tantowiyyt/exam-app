import type { Soal, Ujian, BagianUjian } from '@prisma/client';
import { prisma } from './prisma';

export type SoalWithBagian = Soal & { bagian: BagianUjian | null };

export const MAPEL_ORDER = ['TIK', 'Matematika', 'Bahasa Indonesia', 'Pengetahuan Umum'];

/** PRNG deterministik (mulberry32) — seed sama menghasilkan urutan sama. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Nama grup soal: nama bagian bila soal masuk bagian, selain itu mata pelajaran. */
export function groupName(s: SoalWithBagian): string {
  return s.bagian?.nama || s.mataPelajaran || 'Umum';
}

/**
 * Ambil himpunan soal untuk satu peserta pada ujian tertentu.
 *
 * Pemilihan (pool & batas soal per bagian) dan pengacakan memakai seed dari
 * userId + ujianId + jumlah percobaan, sehingga GET soal dan submit selalu
 * melihat soal yang sama — dan refresh halaman tidak mengubah soal.
 * Setelah admin me-reset peserta, jumlah histori bertambah sehingga soal diacak ulang.
 */
export function muatSoalUjian(ujian: Ujian | null): Promise<SoalWithBagian[]> {
  return prisma.soal.findMany({
    where: ujian ? { ujianId: ujian.id } : {},
    include: { bagian: true },
    orderBy: { id: 'asc' },
  });
}

export async function getSoalPeserta(
  userId: number,
  ujian: Ujian | null,
  preload?: { all?: SoalWithBagian[]; percobaan?: number },
): Promise<SoalWithBagian[]> {
  const all = preload?.all ?? await muatSoalUjian(ujian);
  const percobaan = preload?.percobaan ?? await prisma.historiUjian.count({ where: { userId, ujianId: ujian?.id ?? null } });
  const rand = seededRandom(userId * 100003 + (ujian?.id ?? 0) * 7919 + percobaan * 104729);

  // 1. Batas soal per bagian
  const bagianMap = new Map<number, SoalWithBagian[]>();
  const tanpaBagian: SoalWithBagian[] = [];
  for (const s of all) {
    if (s.bagianId && s.bagian) {
      if (!bagianMap.has(s.bagianId)) bagianMap.set(s.bagianId, []);
      bagianMap.get(s.bagianId)!.push(s);
    } else {
      tanpaBagian.push(s);
    }
  }
  let selected: SoalWithBagian[] = [...tanpaBagian];
  for (const list of bagianMap.values()) {
    const batas = list[0].bagian?.batasSoal;
    selected.push(...(batas && batas > 0 && list.length > batas ? shuffle(list, rand).slice(0, batas) : list));
  }

  // 2. Question pooling (proporsional per grup)
  const poolSize = ujian?.poolSize;
  if (poolSize && poolSize > 0 && selected.length > poolSize) {
    const byGroup: Record<string, SoalWithBagian[]> = {};
    for (const s of selected) (byGroup[groupName(s)] ??= []).push(s);

    const total = selected.length;
    const picked: SoalWithBagian[] = [];
    const sisa: SoalWithBagian[] = [];
    for (const list of Object.values(byGroup)) {
      const acak = shuffle(list, rand);
      const n = Math.min(acak.length, Math.max(1, Math.floor((poolSize * list.length) / total)));
      picked.push(...acak.slice(0, n));
      sisa.push(...acak.slice(n));
    }
    // Lengkapi/kurangi agar tepat poolSize
    const tambahan = shuffle(sisa, rand);
    while (picked.length < poolSize && tambahan.length > 0) picked.push(tambahan.pop()!);
    selected = picked.length > poolSize ? shuffle(picked, rand).slice(0, poolSize) : picked;
  }

  // 3. Urutkan grup (bagian.urutan, lalu urutan mapel standar), acak soal di dalam grup
  const groups: Record<string, SoalWithBagian[]> = {};
  for (const s of selected) (groups[groupName(s)] ??= []).push(s);

  const rank = (list: SoalWithBagian[], name: string) => {
    const bagian = list[0].bagian;
    if (bagian) return bagian.urutan;
    const i = MAPEL_ORDER.indexOf(name);
    return 1000 + (i === -1 ? MAPEL_ORDER.length : i);
  };
  const ordered = Object.entries(groups).sort(([a, la], [b, lb]) => rank(la, a) - rank(lb, b) || a.localeCompare(b));

  return ordered.flatMap(([, list]) => shuffle(list.sort((x, y) => x.id - y.id), rand));
}
