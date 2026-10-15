// Rapor: predikat dari nilai akhir & saran deskripsi capaian dari nilai per item (ujian/tugas/kuis).

export type BatasPredikat = { A: number; B: number; C: number };

export function batasPredikat(i: { predikatA: string; predikatB: string; predikatC: string }): BatasPredikat {
  return { A: Number(i.predikatA) || 90, B: Number(i.predikatB) || 80, C: Number(i.predikatC) || 70 };
}

export function predikat(nilai: number | null, b: BatasPredikat): string | null {
  if (nilai === null) return null;
  return nilai >= b.A ? 'A' : nilai >= b.B ? 'B' : nilai >= b.C ? 'C' : 'D';
}

const KATA: Record<string, string> = { A: 'sangat baik', B: 'baik', C: 'cukup' };

/** Judul item tanpa nama mapel, mis. "UH 2 Fisika" -> "UH 2" (deskripsi lebih ringkas). */
function ringkas(judul: string, mapel: string) {
  const j = judul.trim();
  if (!mapel || !j.toLowerCase().endsWith(mapel.toLowerCase())) return j;
  const r = j.slice(0, j.length - mapel.length).replace(/[\s\-–·]+$/, '').trim();
  return r || j;
}

/**
 * Saran deskripsi capaian: menyebut item dengan nilai tertinggi (kekuatan) & terendah di bawah batas C (perlu ditingkatkan).
 * item = judul + persen (0–100) dari tugas/kuis/ujian yang sudah dinilai.
 */
export function saranDeskripsi(namaSiswa: string, nilaiAkhir: number | null, item: { judul: string; persen: number }[], b: BatasPredikat, mapel = ''): string {
  if (nilaiAkhir === null || !item.length) return '';
  const nama = namaSiswa.trim().split(/\s+/)[0] || 'Ananda';
  const urut = [...item].sort((x, y) => y.persen - x.persen);
  const kuat = urut.filter((x) => x.persen >= b.B).slice(0, 2).map((x) => ringkas(x.judul, mapel));
  const lemah = urut.filter((x) => x.persen < b.C).slice(-2).reverse().map((x) => ringkas(x.judul, mapel));
  const daftar = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} dan ${l[l.length - 1]}` : l[0]);
  const p = predikat(nilaiAkhir, b)!;
  let teks: string;
  if (p === 'D') teks = `${nama} masih perlu bimbingan untuk menguasai materi${kuat.length ? `, namun sudah baik pada ${daftar(kuat)}` : ''}.`;
  else teks = `${nama} menunjukkan penguasaan yang ${KATA[p]}${kuat.length ? ` pada ${daftar(kuat)}` : ' secara keseluruhan'}.`;
  if (lemah.length) teks += ` Perlu peningkatan pada ${daftar(lemah)}.`;
  else if (p === 'A' || p === 'B') teks += ' Pertahankan prestasi belajar.';
  return teks;
}

// ---------- Data rapor tambahan (diisi wali kelas) ----------

export type Ekskul = { nama: string; predikat: string; keterangan: string };
export type Prestasi = { jenis: string; keterangan: string };
export const KEPUTUSAN = ['', 'naik', 'tinggal', 'lulus'] as const;

const teksBatas = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function json<T>(s: string | undefined, def: T): T {
  try { const v = JSON.parse(s || ''); return Array.isArray(v) ? (v as T) : def; } catch { return def; }
}

/** Data rapor siswa siap tampil. Ketidakhadiran: isian wali kelas, atau (null) jumlah pertemuan dari presensi. */
export function bacaDataRapor(
  row: { sakit: number | null; izin: number | null; alpa: number | null; ekskul: string; prestasi: string; kokurikuler: string; keputusan: string; keKelas: string } | undefined,
  hadir: { S: number; I: number; A: number },
) {
  return {
    sakit: row?.sakit ?? null, izin: row?.izin ?? null, alpa: row?.alpa ?? null,
    ketidakhadiran: { S: row?.sakit ?? hadir.S, I: row?.izin ?? hadir.I, A: row?.alpa ?? hadir.A, manual: row ? row.sakit !== null || row.izin !== null || row.alpa !== null : false },
    ekskul: json<Ekskul[]>(row?.ekskul, []),
    prestasi: json<Prestasi[]>(row?.prestasi, []),
    kokurikuler: row?.kokurikuler ?? '',
    keputusan: row?.keputusan ?? '',
    keKelas: row?.keKelas ?? '',
  };
}

/** Validasi isian data rapor dari body. */
export function dataRaporDariBody(v: unknown): { data: { sakit: number | null; izin: number | null; alpa: number | null; ekskul: string; prestasi: string; kokurikuler: string; keputusan: string; keKelas: string } } | { error: string } {
  const b = (v ?? {}) as Record<string, unknown>;
  const hari = (x: unknown) => (x === null || x === undefined || x === '' ? null : Number(x));
  const [sakit, izin, alpa] = [hari(b.sakit), hari(b.izin), hari(b.alpa)];
  if ([sakit, izin, alpa].some((x) => x !== null && (!Number.isInteger(x) || x < 0 || x > 366))) return { error: 'Jumlah ketidakhadiran harus bilangan bulat 0–366' };
  const ekskulRaw = Array.isArray(b.ekskul) ? b.ekskul : [];
  const prestasiRaw = Array.isArray(b.prestasi) ? b.prestasi : [];
  if (ekskulRaw.length > 10 || prestasiRaw.length > 10) return { error: 'Maksimal 10 ekstrakurikuler dan 10 prestasi' };
  const ekskul: Ekskul[] = [];
  for (const e of ekskulRaw) {
    const nama = teksBatas((e as Ekskul)?.nama, 100);
    if (!nama) continue;
    ekskul.push({ nama, predikat: teksBatas((e as Ekskul).predikat, 20), keterangan: teksBatas((e as Ekskul).keterangan, 300) });
  }
  const prestasi: Prestasi[] = [];
  for (const p of prestasiRaw) {
    const jenis = teksBatas((p as Prestasi)?.jenis, 100);
    if (!jenis) continue;
    prestasi.push({ jenis, keterangan: teksBatas((p as Prestasi).keterangan, 300) });
  }
  const keputusan = teksBatas(b.keputusan, 10);
  if (!(KEPUTUSAN as readonly string[]).includes(keputusan)) return { error: 'Keputusan harus naik, tinggal, atau lulus' };
  return {
    data: {
      sakit, izin, alpa, ekskul: JSON.stringify(ekskul), prestasi: JSON.stringify(prestasi),
      kokurikuler: teksBatas(b.kokurikuler, 2000), keputusan, keKelas: teksBatas(b.keKelas, 50),
    },
  };
}
