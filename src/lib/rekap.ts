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
        id: true, judul: true, nilaiMaks: true, tenggat: true, terbit: true, terbitPada: true, untukSiswa: true,
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
      where: { mapelId: mapel.id, ...diSemester, ...(kelola ? {} : { terbit: true }) },
      select: {
        id: true, judul: true, tanggal: true, nilaiMaks: true, terbit: true, jenis: true, mode: true, kuisId: true,
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

  const kolom = [
    ...tugas.map((t) => ({ kunci: `t${t.id}`, jenis: 'tugas' as const, id: t.id, judul: t.judul, maks: t.nilaiMaks, terbit: t.terbit })),
    ...kuis.map((k) => ({ kunci: `k${k.id}`, jenis: 'kuis' as const, id: k.id, judul: k.judul, maks: 100, terbit: k.terbit })),
    ...ujian.map((u) => ({ kunci: `u${u.id}`, jenis: 'ujian' as const, id: u.id, judul: u.nama, maks: 100, terbit: true, sekolah: true, jenisUjian: u.jenis, mode: 'cat' })),
    ...urutUjianManual(ujianManual).map((u) => ({
      kunci: `m${u.id}`, jenis: 'ujian' as const, id: u.id, judul: u.judul, maks: u.mode === 'cat' ? 100 : u.nilaiMaks, terbit: u.terbit,
      offline: u.mode !== 'cat', mapelUjian: true, jenisUjian: u.jenis, mode: u.mode,
    })),
  ];

  const baris = siswa.map((s) => {
    // null = belum mengumpulkan; 'kumpul' = belum dinilai; 'revisi' = dikembalikan untuk diperbaiki;
    // 'na' = tugas tidak ditugaskan ke siswa ini (tidak dihitung di rata-rata)
    const nilai: Record<string, NilaiSel> = {};
    const persen: number[] = [];
    // Per kategori untuk nilai akhir berbobot
    const kat: Record<'tugas' | 'kuis' | 'uh' | 'uts' | 'uas' | 'ujian', number[]> = { tugas: [], kuis: [], uh: [], uts: [], uas: [], ujian: [] };
    for (const t of tugas) {
      const p = t.pengumpulan.find((x) => x.userId === s.id);
      if (!p && !ditugaskan(t, s.id)) { nilai[`t${t.id}`] = 'na'; continue; }
      const v = p ? (p.nilai ?? (p.status === 'revisi' ? 'revisi' : 'kumpul')) : null;
      nilai[`t${t.id}`] = v;
      if (typeof v === 'number') kat.tugas.push((v / t.nilaiMaks) * 100);
      // Tugas lewat tenggat tanpa pengumpulan dihitung 0
      else if (!p && sudahTerbit(t) && t.tenggat && t.tenggat < new Date()) kat.tugas.push(0);
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
    for (const u of ujianManual) {
      // Siswa tanpa nilai (mis. belum ikut / susulan) tidak dihitung
      const k = ({ UH: 'uh', UTS: 'uts', UAS: 'uas' } as const)[u.jenis as 'UH' | 'UTS' | 'UAS'] ?? 'ujian';
      if (u.mode === 'cat') {
        const best = nilaiTerbaik(hasilCat.filter((x) => x.kuisId === u.kuisId && x.userId === s.id));
        if (best?.perluDinilai) { nilai[`m${u.id}`] = 'kumpul'; continue; }
        nilai[`m${u.id}`] = best ? best.nilai : null;
        if (best) kat[k].push(best.nilai);
        continue;
      }
      const n = u.nilai.find((x) => x.userId === s.id);
      nilai[`m${u.id}`] = n ? n.nilai : null;
      if (n) kat[k].push((n.nilai / u.nilaiMaks) * 100);
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
      siswa: s, nilai, komponen, rataRata, kehadiran: kehadiranSiswa(s.id),
      tuntas: mapel.kkm && rataRata !== null ? rataRata >= mapel.kkm : null,
    };
  });

  return { kolom, baris, bobot, berbobot };
}
