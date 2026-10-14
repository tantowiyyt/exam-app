import { prisma } from './prisma';
import { teks, topikValid } from './lms';

// ---------- Kuis per mapel ----------
// Tipe soal: pg (pilihan ganda), bs (benar/salah), isian (jawaban singkat), esai (dinilai guru)

export const TIPE_SOAL = ['pg', 'bs', 'isian', 'esai'] as const;
export type TipeSoal = (typeof TIPE_SOAL)[number];
export const MAKS_SOAL = 200;
/** Kelonggaran kirim setelah waktu habis (latensi jaringan). */
const TOLERANSI_MS = 30_000;

type Soal = { id: number; tipe: string; pertanyaan: string; opsi: string; kunci: string; pembahasan: string; bobot: number; urutan: number };
type Kuis = { durasiMenit: number; selesai: Date | null };
type Percobaan = { id: number; mulaiAt: Date; selesaiAt: Date | null; jawaban: string; skorEsai: string; tambahanMenit?: number };

export function bacaJson<T>(s: string, cadangan: T): T {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : cadangan;
  } catch {
    return cadangan;
  }
}

export const opsiSoal = (s: { opsi: string }) => {
  const o = bacaJson<unknown[]>(s.opsi, []);
  return Array.isArray(o) ? o.map(String) : [];
};

/** Validasi daftar soal dari body. Soal dengan id lama dipertahankan (agar nilai esai tidak hilang). */
export function soalDariBody(list: unknown): { soal: (Omit<Soal, 'id'> & { id?: number })[] } | { error: string } {
  if (!Array.isArray(list)) return { error: 'Daftar soal tidak valid' };
  if (list.length > MAKS_SOAL) return { error: `Maksimal ${MAKS_SOAL} soal` };
  const out: (Omit<Soal, 'id'> & { id?: number })[] = [];
  for (const [i, raw] of list.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const no = i + 1;
    const tipe = String(r.tipe) as TipeSoal;
    if (!TIPE_SOAL.includes(tipe)) return { error: `Soal ${no}: tipe tidak dikenal` };
    const pertanyaan = teks(r.pertanyaan, 10000);
    if (!pertanyaan) return { error: `Soal ${no}: pertanyaan wajib diisi` };
    const bobot = Math.floor(Number(r.bobot ?? 1));
    if (!Number.isFinite(bobot) || bobot < 1 || bobot > 100) return { error: `Soal ${no}: bobot 1–100` };

    let opsi: string[] = [];
    let kunci = '';
    if (tipe === 'pg') {
      opsi = (Array.isArray(r.opsi) ? r.opsi : []).map((o) => teks(o, 2000));
      if (opsi.length < 2 || opsi.length > 6 || opsi.some((o) => !o)) return { error: `Soal ${no}: isi 2–6 pilihan jawaban` };
      const k = Number(r.kunci);
      if (!Number.isInteger(k) || k < 0 || k >= opsi.length) return { error: `Soal ${no}: pilih kunci jawaban` };
      kunci = String(k);
    } else if (tipe === 'bs') {
      kunci = r.kunci === 'S' ? 'S' : r.kunci === 'B' ? 'B' : '';
      if (!kunci) return { error: `Soal ${no}: pilih kunci Benar atau Salah` };
    } else if (tipe === 'isian') {
      kunci = teks(r.kunci, 1000).split('|').map((x) => x.trim()).filter(Boolean).join('|');
      if (!kunci) return { error: `Soal ${no}: isi jawaban yang diterima` };
    }
    const id = Number(r.id);
    out.push({
      ...(Number.isInteger(id) && id > 0 ? { id } : {}),
      tipe, pertanyaan, opsi: JSON.stringify(opsi), kunci, pembahasan: teks(r.pembahasan, 5000), bobot, urutan: i,
    });
  }
  return { soal: out };
}

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Poin satu soal; null = esai belum dinilai. */
export function poinSoal(s: Soal, jawaban: unknown, skorEsai: Record<string, number>): number | null {
  if (s.tipe === 'esai') {
    const v = skorEsai[s.id];
    if (typeof v === 'number') return v;
    // Esai kosong tidak perlu dinilai guru
    return typeof jawaban === 'string' && jawaban.trim() ? null : 0;
  }
  if (jawaban === undefined || jawaban === null || jawaban === '') return 0;
  if (s.tipe === 'isian') return s.kunci.split('|').some((k) => normal(k) === normal(String(jawaban))) ? s.bobot : 0;
  return String(jawaban) === s.kunci ? s.bobot : 0;
}

/** Hitung nilai percobaan dari jawaban + nilai esai. */
export function hitungNilai(soal: Soal[], jawaban: Record<string, unknown>, skorEsai: Record<string, number>) {
  let skor = 0;
  let skorMaks = 0;
  let perluDinilai = false;
  for (const s of soal) {
    skorMaks += s.bobot;
    const p = poinSoal(s, jawaban[s.id], skorEsai);
    if (p === null) perluDinilai = true;
    else skor += p;
  }
  const nilai = skorMaks ? Math.round((skor / skorMaks) * 1000) / 10 : 0;
  return { skor, skorMaks, nilai, perluDinilai };
}

/**
 * Batas waktu percobaan: durasi kuis & waktu tutup kuis (mana yang lebih dulu). null = tanpa batas.
 * Tambahan waktu dari guru/pengawas (mode ujian) memperpanjang keduanya.
 */
export function batasWaktu(kuis: Kuis, p: { mulaiAt: Date; tambahanMenit?: number }): Date | null {
  const tambah = (p.tambahanMenit ?? 0) * 60000;
  const batas: number[] = [];
  if (kuis.durasiMenit > 0) batas.push(p.mulaiAt.getTime() + kuis.durasiMenit * 60000 + tambah);
  if (kuis.selesai) batas.push(kuis.selesai.getTime() + tambah);
  return batas.length ? new Date(Math.min(...batas)) : null;
}

export function waktuHabis(kuis: Kuis, p: { mulaiAt: Date; tambahanMenit?: number }, toleransi = false) {
  const b = batasWaktu(kuis, p);
  return !!b && Date.now() > b.getTime() + (toleransi ? TOLERANSI_MS : 0);
}

/** Tutup percobaan & simpan nilainya. */
export async function selesaikan(p: Percobaan, kuisId: number, jawaban?: Record<string, unknown>) {
  const soal = await prisma.soalKuis.findMany({ where: { kuisId } });
  const j = jawaban ?? bacaJson<Record<string, unknown>>(p.jawaban, {});
  const n = hitungNilai(soal, j, bacaJson(p.skorEsai, {}));
  return prisma.percobaanKuis.update({
    where: { id: p.id },
    data: { jawaban: JSON.stringify(j), selesaiAt: p.selesaiAt ?? new Date(), ...n },
  });
}

/** Percobaan yang waktunya habis tapi belum dikumpulkan = dinilai dari jawaban tersimpan. */
export async function tutupYangKedaluwarsa(kuis: Kuis & { id: number }, where: { userId?: number } = {}) {
  const aktif = await prisma.percobaanKuis.findMany({ where: { kuisId: kuis.id, selesaiAt: null, ...where } });
  for (const p of aktif) if (waktuHabis(kuis, p)) await selesaikan(p, kuis.id);
}

/** Hitung ulang nilai semua percobaan yang sudah selesai (setelah soal/kunci diubah). */
export async function nilaiUlang(kuisId: number) {
  const [soal, list] = await Promise.all([
    prisma.soalKuis.findMany({ where: { kuisId } }),
    prisma.percobaanKuis.findMany({ where: { kuisId, selesaiAt: { not: null } } }),
  ]);
  const ids = new Set(soal.map((s) => String(s.id)));
  for (const p of list) {
    // Nilai esai untuk soal yang sudah dihapus dibuang
    const esai = Object.fromEntries(Object.entries(bacaJson<Record<string, number>>(p.skorEsai, {})).filter(([k]) => ids.has(k)));
    const n = hitungNilai(soal, bacaJson(p.jawaban, {}), esai);
    await prisma.percobaanKuis.update({ where: { id: p.id }, data: { ...n, skorEsai: JSON.stringify(esai) } });
  }
}

/** Urutan acak yang tetap untuk satu percobaan (refresh tidak mengubah urutan). */
export function acakTetap<T>(list: T[], seed: number): T[] {
  const a = [...list];
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Soal untuk siswa yang sedang mengerjakan — tanpa kunci & pembahasan. */
export function soalTanpaKunci(soal: Soal[], acak: boolean, seed: number) {
  const urut = [...soal].sort((a, b) => a.urutan - b.urutan);
  return (acak ? acakTetap(urut, seed) : urut).map((s) => ({
    id: s.id, tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: opsiSoal(s), bobot: s.bobot,
  }));
}

/** Status kuis bagi siswa saat ini. */
export function statusBuka(k: { terbit: boolean; mulai: Date | null; selesai: Date | null }) {
  const now = Date.now();
  if (!k.terbit) return 'draf' as const;
  if (k.mulai && now < k.mulai.getTime()) return 'belum' as const;
  if (k.selesai && now > k.selesai.getTime()) return 'tutup' as const;
  return 'buka' as const;
}

/** Nilai yang dipakai di rekap: nilai tertinggi dari percobaan yang sudah selesai. */
export function nilaiTerbaik(list: { selesaiAt: Date | null; nilai: number | null; perluDinilai: boolean }[]) {
  const selesai = list.filter((p) => p.selesaiAt && p.nilai !== null);
  if (!selesai.length) return null;
  const best = selesai.reduce((a, b) => ((b.nilai ?? 0) > (a.nilai ?? 0) ? b : a));
  return { nilai: best.nilai as number, perluDinilai: selesai.some((p) => p.perluDinilai) };
}

/** Mode ujian: nilai & jawaban baru terlihat siswa setelah guru mengumumkan ujiannya (tab Ujian). */
export async function hasilDiumumkan(kuis: { id: number; modeUjian: boolean }) {
  if (!kuis.modeUjian) return true;
  return !!(await prisma.ujianManual.findFirst({ where: { kuisId: kuis.id, terbit: true }, select: { id: true } }));
}

const HURUF_TOKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Token ujian 6 karakter (tanpa 0/O/1/I agar tidak tertukar). */
export function tokenBaru() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => HURUF_TOKEN[x % HURUF_TOKEN.length]).join('');
}

/** Data kuis (pengaturan) dari body. */
export async function dataKuis(body: Record<string, unknown>, mapelId: number) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Judul kuis wajib diisi' } as const;
  const tanggal = (v: unknown) => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? undefined : d;
  };
  const mulai = tanggal(body.mulai);
  const selesai = tanggal(body.selesai);
  if (mulai === undefined || selesai === undefined) return { error: 'Tanggal tidak valid' } as const;
  if (mulai && selesai && selesai <= mulai) return { error: 'Waktu tutup harus setelah waktu buka' } as const;
  const durasiMenit = Math.floor(Number(body.durasiMenit ?? 0));
  if (!Number.isFinite(durasiMenit) || durasiMenit < 0 || durasiMenit > 600) return { error: 'Durasi 0–600 menit' } as const;
  const maksPercobaan = Math.floor(Number(body.maksPercobaan ?? 1));
  if (!Number.isFinite(maksPercobaan) || maksPercobaan < 1 || maksPercobaan > 10) return { error: 'Jumlah percobaan 1–10' } as const;
  const topikId = await topikValid(body.topikId, mapelId);
  if (topikId === undefined) return { error: 'Topik tidak ditemukan di mapel ini' } as const;
  return {
    data: {
      topikId, judul, deskripsi: teks(body.deskripsi, 10000), durasiMenit, mulai, selesai, maksPercobaan,
      acakSoal: body.acakSoal !== false, tampilkanJawaban: body.tampilkanJawaban !== false, terbit: body.terbit === true,
    },
  } as const;
}
