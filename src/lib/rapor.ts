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
