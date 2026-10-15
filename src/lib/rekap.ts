import type { Mapel } from '@prisma/client';
import { prisma } from './prisma';
import { whereTugasSiswa, ditugaskan, sudahTerbit, urutUjianManual } from './lms';
import { nilaiTerbaik } from './kuis';

// Perhitungan rekap nilai satu mapel untuk sekelompok siswa dalam satu semester.
// Dipakai tab Nilai (per mapel) dan rapor siswa (lintas mapel).
// Komponen: tugas + kuis + presensi + ujian mapel (UH/UTS/UAS/lainnya, offline atau CAT) +
// ujian CAT sekolah (hanya di semester aktif).

export type NilaiSel = number | 'kumpul' | 'revisi' | 'na' | null;
export type Komponen = { tugas: number | null; kuis: number | null; presensi: number | null; uh: number | null; uts: number | null; uas: number | null; ujian: number | null };

type Siswa = { id: number; nomorPeserta: string; nama: string };
/** Nilai satu item dalam persen; nol = 0 karena lewat tenggat (boleh diganti susulan); na = tidak ditugaskan. */
type Persen = { v: number | null; nol: boolean; na: boolean };

export const ATURAN_REMEDIAL = ['maksKkm', 'maks', 'ganti'] as const;

/**
 * Gabungkan nilai asli dengan remedial/pengayaan/susulan (semua dalam persen).
 * Susulan mengisi nilai yang kosong (atau 0 karena lewat tenggat). Remedial: maksKkm = nilai tertinggi tetapi
 * nilai remedial dibatasi KKM (bila KKM diisi); maks = tertinggi; ganti = nilai remedial. Pengayaan tidak mengubah nilai.
 */
export function gabungRemedial(asli: { v: number | null; nol?: boolean }, anak: { tipe: string; v: number | null }[], kkm: number, aturan: string) {
  let v = asli.v;
  let kosong = v === null || !!asli.nol;
  for (const a of anak) if (a.tipe === 'susulan' && a.v !== null && kosong) { v = a.v; kosong = false; }
  for (const a of anak) {
    if (a.tipe !== 'remedial' || a.v === null) continue;
    if (aturan === 'ganti') v = a.v;
    else v = Math.max(v ?? 0, aturan === 'maksKkm' && kkm > 0 ? Math.min(a.v, kkm) : a.v);
  }
  return v;
}
type Semester = { id: number; aktif: boolean };

/**
 * lihat.kelola = pengelola mapel/admin (semua item, termasuk draf & nilai yang belum diumumkan);
 * selain itu hanya item yang terlihat oleh siswa lihat.userId.
 */
export async function hitungRekapMapel(mapel: Mapel, siswa: Siswa[], semester: Semester, lihat: { kelola: boolean; userId?: number }) {
  const { kelola } = lihat;
  const ids = siswa.map((s) => s.id);
  const diSemester = { semesterId: semester.id };

  // Ujian CAT sekolah semester ini yang berlaku untuk mapel ini: khusus mapel ini, atau ujian lintas mapel
  // yang pesertanya mencakup kelas ini (nilai diambil dari skor mata pelajaran yang namanya sama dengan mapel).
  const kelas = (await prisma.kelas.findUnique({ where: { id: mapel.kelasId }, select: { nama: true } }))?.nama ?? '';
  const ujianSekolah = await prisma.ujian.findMany({
    where: {
      OR: [{ semesterId: semester.id }, ...(semester.aktif ? [{ semesterId: null }] : [])],
      AND: [{ OR: [{ mapelId: mapel.id }, { mapelId: null, OR: [{ kelasTarget: '' }, { kelasTarget: { contains: `,${kelas},` } }] }] }],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, nama: true, mapelId: true, jenis: true,
      histori: { where: { userId: { in: ids } }, select: { userId: true, nilaiAkhir: true, skorPerMapel: true }, orderBy: { id: 'asc' } },
    },
  });
  // Ujian lintas mapel hanya dipakai bila punya soal mata pelajaran ini
  const namaMapel = mapel.nama.trim().toLowerCase();
  const lintas = ujianSekolah.filter((u) => u.mapelId === null).map((u) => u.id);
  const mapelSoal = lintas.length ? await prisma.soal.findMany({ where: { ujianId: { in: lintas } }, select: { ujianId: true, mataPelajaran: true }, distinct: ['ujianId', 'mataPelajaran'] }) : [];
  const ujian = ujianSekolah.filter((u) => u.mapelId === mapel.id || mapelSoal.some((m) => m.ujianId === u.id && m.mataPelajaran.trim().toLowerCase() === namaMapel));
  const skorMapel = (h: { nilaiAkhir: number; skorPerMapel: string | null }, khusus: boolean) => {
    if (khusus) return h.nilaiAkhir;
    try {
      const skor = JSON.parse(h.skorPerMapel ?? '{}') as Record<string, number>;
      const k = Object.keys(skor).find((x) => x.trim().toLowerCase() === namaMapel);
      return k === undefined ? null : Number(skor[k]);
    } catch { return null; }
  };

  const [tugas, kuis, ujianManual, sesiPresensi] = await Promise.all([
    prisma.tugas.findMany({
      where: { mapelId: mapel.id, ...diSemester, ...(kelola ? {} : whereTugasSiswa(lihat.userId!)) },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true, judul: true, nilaiMaks: true, tenggat: true, terbit: true, terbitPada: true, untukSiswa: true, indukId: true, tipeSusulan: true,
        pengumpulan: { where: { userId: { in: ids } }, select: { userId: true, nilai: true, dikumpulkanAt: true, status: true } },
      },
    }),
    prisma.kuis.findMany({
      where: { mapelId: mapel.id, ...diSemester, modeUjian: false, ...(kelola ? {} : { terbit: true }) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, judul: true, terbit: true, selesai: true,
        percobaan: { where: { userId: { in: ids } }, select: { userId: true, selesaiAt: true, nilai: true, perluDinilai: true } },
      },
    }),
    prisma.ujianManual.findMany({
      where: { mapelId: mapel.id, ...diSemester, ...(kelola ? {} : { terbit: true, OR: [{ untukSiswa: '' }, { untukSiswa: { contains: `,${lihat.userId},` } }] }) },
      select: {
        id: true, judul: true, tanggal: true, nilaiMaks: true, terbit: true, jenis: true, mode: true, kuisId: true, indukId: true, tipeSusulan: true, untukSiswa: true,
        nilai: { where: { userId: { in: ids } }, select: { userId: true, nilai: true } },
      },
    }),
    // Presensi: dari pertemuan yang sudah berlangsung
    prisma.sesiPresensi.findMany({
      where: { mapelId: mapel.id, ...diSemester, tanggal: { lte: new Date() } },
      select: { presensi: { where: { userId: { in: ids } }, select: { userId: true, status: true } } },
    }),
  ]);

  const presensiSiswa = (id: number) => (sesiPresensi.length
    ? Math.round((sesiPresensi.filter((x) => x.presensi.some((p) => p.userId === id && p.status === 'H')).length / sesiPresensi.length) * 1000) / 10
    : null);
  /** Jumlah H/I/S/A + pertemuan yang belum diisi (untuk rapor). */
  const kehadiranSiswa = (id: number) => {
    const r = { H: 0, I: 0, S: 0, A: 0, kosong: 0, pertemuan: sesiPresensi.length };
    for (const x of sesiPresensi) {
      const p = x.presensi.find((q) => q.userId === id);
      if (p && p.status in r) r[p.status as 'H' | 'I' | 'S' | 'A']++;
      else r.kosong++;
    }
    return r;
  };
  // Ujian mode CAT: nilai dari hasil mengerjakan kuis ujiannya
  const kuisUjian = ujianManual.filter((u) => u.mode === 'cat' && u.kuisId).map((u) => u.kuisId!);
  const hasilCat = kuisUjian.length
    ? await prisma.percobaanKuis.findMany({ where: { kuisId: { in: kuisUjian }, userId: { in: ids } }, select: { kuisId: true, userId: true, selesaiAt: true, nilai: true, perluDinilai: true } })
    : [];
  const bobot = {
    tugas: mapel.bobotTugas, kuis: mapel.bobotKuis, presensi: mapel.bobotPresensi,
    uh: mapel.bobotUH, uts: mapel.bobotUTS, uas: mapel.bobotUAS, ujian: mapel.bobotUjian,
  };
  const berbobot = Object.values(bobot).some((w) => w > 0);

  // Remedial / pengayaan / susulan (item turunan) digabung ke item induknya; induk di luar daftar = item biasa
  const idTugas = new Set(tugas.map((t) => t.id));
  const idUjian = new Set(ujianManual.map((u) => u.id));
  const punyaInduk = (pre: 't' | 'm', x: { indukId: number | null }) => !!x.indukId && (pre === 't' ? idTugas : idUjian).has(x.indukId);
  const turunan = (pre: 't' | 'm', x: { indukId: number | null; tipeSusulan: string }) =>
    (punyaInduk(pre, x) ? { turunan: { tipe: x.tipeSusulan, induk: `${pre}${x.indukId}` } } : {});
  const anakTugas = (id: number) => tugas.filter((t) => t.indukId === id && punyaInduk('t', t));
  const anakUjian = (id: number) => ujianManual.filter((u) => u.indukId === id && punyaInduk('m', u));

  const kolom = [
    ...tugas.map((t) => ({ kunci: `t${t.id}`, jenis: 'tugas' as const, id: t.id, judul: t.judul, maks: t.nilaiMaks, terbit: t.terbit, ...turunan('t', t) })),
    ...kuis.map((k) => ({ kunci: `k${k.id}`, jenis: 'kuis' as const, id: k.id, judul: k.judul, maks: 100, terbit: k.terbit })),
    ...ujian.map((u) => ({ kunci: `u${u.id}`, jenis: 'ujian' as const, id: u.id, judul: u.nama, maks: 100, terbit: true, sekolah: true, jenisUjian: u.jenis, mode: 'cat' })),
    ...urutUjianManual(ujianManual).map((u) => ({
      kunci: `m${u.id}`, jenis: 'ujian' as const, id: u.id, judul: u.judul, maks: u.mode === 'cat' ? 100 : u.nilaiMaks, terbit: u.terbit,
      offline: u.mode !== 'cat', mapelUjian: true, jenisUjian: u.jenis, mode: u.mode, ...turunan('m', u),
    })),
  ];

  const baris = siswa.map((s) => {
    // null = belum mengumpulkan; 'kumpul' = belum dinilai; 'revisi' = dikembalikan untuk diperbaiki;
    // 'na' = tugas tidak ditugaskan ke siswa ini (tidak dihitung di rata-rata)
    const nilai: Record<string, NilaiSel> = {};
    const persen: number[] = [];
    // Per kategori untuk nilai akhir berbobot
    const kat: Record<'tugas' | 'kuis' | 'uh' | 'uts' | 'uas' | 'ujian', number[]> = { tugas: [], kuis: [], uh: [], uts: [], uas: [], ujian: [] };
    // Nilai akhir induk setelah digabung remedial/susulan (skala nilai maks induk), hanya bila berbeda
    const akhir: Record<string, number> = {};
    const pctTugas = new Map<number, Persen>();
    for (const t of tugas) {
      const p = t.pengumpulan.find((x) => x.userId === s.id);
      if (!p && !ditugaskan(t, s.id)) { nilai[`t${t.id}`] = 'na'; pctTugas.set(t.id, { v: null, nol: false, na: true }); continue; }
      const v = p ? (p.nilai ?? (p.status === 'revisi' ? 'revisi' : 'kumpul')) : null;
      nilai[`t${t.id}`] = v;
      if (typeof v === 'number') pctTugas.set(t.id, { v: (v / t.nilaiMaks) * 100, nol: false, na: false });
      // Tugas lewat tenggat tanpa pengumpulan dihitung 0
      else if (!p && sudahTerbit(t) && t.tenggat && t.tenggat < new Date()) pctTugas.set(t.id, { v: 0, nol: true, na: false });
      else pctTugas.set(t.id, { v: null, nol: false, na: false });
    }
    for (const t of tugas) {
      if (punyaInduk('t', t)) continue;
      const asli = pctTugas.get(t.id)!;
      const anak = anakTugas(t.id).map((c) => ({ tipe: c.tipeSusulan, v: pctTugas.get(c.id)!.v }));
      if (asli.na && !anak.some((a) => a.v !== null)) continue;
      const v = gabungRemedial(asli, anak, mapel.kkm, mapel.aturanRemedial);
      if (v === null) continue;
      kat.tugas.push(v);
      if (v !== asli.v) akhir[`t${t.id}`] = Math.round((v * t.nilaiMaks) / 10) / 10;
    }
    for (const k of kuis) {
      // Nilai tertinggi dari percobaan yang selesai; esai belum dinilai = 'kumpul'
      const best = nilaiTerbaik(k.percobaan.filter((x) => x.userId === s.id));
      if (best?.perluDinilai) nilai[`k${k.id}`] = 'kumpul';
      else {
        nilai[`k${k.id}`] = best ? best.nilai : null;
        if (best) kat.kuis.push(best.nilai);
        // Kuis yang sudah ditutup tanpa dikerjakan dihitung 0
        else if (k.terbit && k.selesai && k.selesai < new Date()) kat.kuis.push(0);
      }
    }
    for (const u of ujian) {
      // Nilai terakhir (bila ujian diulang setelah reset); ujian lintas mapel = skor mata pelajaran ini
      const h = u.histori.filter((x) => x.userId === s.id).pop();
      const v = h ? skorMapel(h, u.mapelId === mapel.id) : null;
      nilai[`u${u.id}`] = v;
      const k = ({ UH: 'uh', UTS: 'uts', UAS: 'uas' } as const)[u.jenis as 'UH' | 'UTS' | 'UAS'] ?? 'ujian';
      if (v !== null) kat[k].push(v);
    }
    const pctUjian = new Map<number, Persen>();
    for (const u of ujianManual) {
      // Siswa tanpa nilai (mis. belum ikut / susulan) tidak dihitung
      if (u.untukSiswa && !u.untukSiswa.includes(`,${s.id},`)) { nilai[`m${u.id}`] = 'na'; pctUjian.set(u.id, { v: null, nol: false, na: true }); continue; }
      if (u.mode === 'cat') {
        const best = nilaiTerbaik(hasilCat.filter((x) => x.kuisId === u.kuisId && x.userId === s.id));
        nilai[`m${u.id}`] = best?.perluDinilai ? 'kumpul' : best ? best.nilai : null;
        pctUjian.set(u.id, { v: best && !best.perluDinilai ? best.nilai : null, nol: false, na: false });
        continue;
      }
      const n = u.nilai.find((x) => x.userId === s.id);
      nilai[`m${u.id}`] = n ? n.nilai : null;
      pctUjian.set(u.id, { v: n ? (n.nilai / u.nilaiMaks) * 100 : null, nol: false, na: false });
    }
    for (const u of ujianManual) {
      if (punyaInduk('m', u)) continue;
      const asli = pctUjian.get(u.id)!;
      const anak = anakUjian(u.id).map((c) => ({ tipe: c.tipeSusulan, v: pctUjian.get(c.id)!.v }));
      const v = gabungRemedial(asli, anak, mapel.kkm, mapel.aturanRemedial);
      if (v === null) continue;
      const k = ({ UH: 'uh', UTS: 'uts', UAS: 'uas' } as const)[u.jenis as 'UH' | 'UTS' | 'UAS'] ?? 'ujian';
      kat[k].push(v);
      const maks = u.mode === 'cat' ? 100 : u.nilaiMaks;
      if (v !== asli.v) akhir[`m${u.id}`] = Math.round((v * maks) / 10) / 10;
    }
    persen.push(...kat.tugas, ...kat.kuis, ...kat.uh, ...kat.uts, ...kat.uas, ...kat.ujian);
    const rataList = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
    const bulat = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
    const komponen: Komponen = {
      tugas: bulat(rataList(kat.tugas)), kuis: bulat(rataList(kat.kuis)), presensi: presensiSiswa(s.id),
      uh: bulat(rataList(kat.uh)), uts: bulat(rataList(kat.uts)), uas: bulat(rataList(kat.uas)), ujian: bulat(rataList(kat.ujian)),
    };

    // Tanpa bobot: rata-rata semua nilai. Dengan bobot: rata-rata berbobot kategori yang sudah punya nilai.
    let rataRata: number | null;
    if (!berbobot) rataRata = bulat(rataList(persen));
    else {
      let jumlah = 0, total = 0;
      for (const [k, w] of Object.entries(bobot) as [keyof Komponen, number][]) {
        const v = komponen[k];
        if (w > 0 && v !== null) { jumlah += v * w; total += w; }
      }
      rataRata = total ? bulat(jumlah / total) : null;
    }
    return {
      siswa: s, nilai, akhir, komponen, rataRata, kehadiran: kehadiranSiswa(s.id),
      tuntas: mapel.kkm && rataRata !== null ? rataRata >= mapel.kkm : null,
    };
  });

  return { kolom, baris, bobot, berbobot };
}
