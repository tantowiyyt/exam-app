import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, whereTugasSiswa, ditugaskan, sudahTerbit, urutUjianManual } from '@/lib/lms';
import { nilaiTerbaik } from '@/lib/kuis';

// Rekap nilai satu mapel: nilai tugas + kuis + ujian (CAT & offline/manual) per siswa.
// Pengelola melihat semua siswa kelas; siswa hanya baris miliknya.
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/mapel/[id]/nilai'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const akses = await aksesMapel(user, Number((await ctx.params).id));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const { mapel, peran } = akses;
    const kelola = peran === 'kelola';

    const siswa = kelola
      ? await prisma.user.findMany({
        where: { role: 'PESERTA', kelas: mapel.kelas.nama },
        select: { id: true, nomorPeserta: true, nama: true },
        orderBy: { nama: 'asc' },
      })
      : await prisma.user.findMany({ where: { id: user.id }, select: { id: true, nomorPeserta: true, nama: true } });
    const ids = siswa.map((s) => s.id);

    const [tugas, ujian, kuis, ujianManual] = await Promise.all([
      prisma.tugas.findMany({
        where: { mapelId: mapel.id, ...(kelola ? {} : whereTugasSiswa(user.id)) },
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true, judul: true, nilaiMaks: true, tenggat: true, terbit: true, terbitPada: true, untukSiswa: true,
          pengumpulan: { where: { userId: { in: ids } }, select: { userId: true, nilai: true, dikumpulkanAt: true, status: true } },
        },
      }),
      prisma.ujian.findMany({
        where: { mapelId: mapel.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, nama: true,
          histori: { where: { userId: { in: ids } }, select: { userId: true, nilaiAkhir: true }, orderBy: { id: 'asc' } },
        },
      }),
      prisma.kuis.findMany({
        where: { mapelId: mapel.id, ...(kelola ? {} : { terbit: true }) },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, judul: true, terbit: true, selesai: true,
          percobaan: { where: { userId: { in: ids } }, select: { userId: true, selesaiAt: true, nilai: true, perluDinilai: true } },
        },
      }),
      prisma.ujianManual.findMany({
        where: { mapelId: mapel.id, ...(kelola ? {} : { terbit: true }) },
        select: { id: true, judul: true, tanggal: true, nilaiMaks: true, terbit: true, nilai: { where: { userId: { in: ids } }, select: { userId: true, nilai: true } } },
      }),
    ]);

    // Presensi: % hadir dari pertemuan yang sudah berlangsung
    const sesiPresensi = await prisma.sesiPresensi.findMany({
      where: { mapelId: mapel.id, tanggal: { lte: new Date() } },
      select: { presensi: { where: { userId: { in: ids }, status: 'H' }, select: { userId: true } } },
    });
    const presensiSiswa = (id: number) => (sesiPresensi.length
      ? Math.round((sesiPresensi.filter((x) => x.presensi.some((p) => p.userId === id)).length / sesiPresensi.length) * 1000) / 10
      : null);
    const bobot = { tugas: mapel.bobotTugas, kuis: mapel.bobotKuis, ujian: mapel.bobotUjian, presensi: mapel.bobotPresensi };
    const berbobot = Object.values(bobot).some((w) => w > 0);

    const kolom = [
      ...tugas.map((t) => ({ kunci: `t${t.id}`, jenis: 'tugas' as const, id: t.id, judul: t.judul, maks: t.nilaiMaks, terbit: t.terbit })),
      ...kuis.map((k) => ({ kunci: `k${k.id}`, jenis: 'kuis' as const, id: k.id, judul: k.judul, maks: 100, terbit: k.terbit })),
      ...ujian.map((u) => ({ kunci: `u${u.id}`, jenis: 'ujian' as const, id: u.id, judul: u.nama, maks: 100, terbit: true })),
      ...urutUjianManual(ujianManual).map((u) => ({ kunci: `m${u.id}`, jenis: 'ujian' as const, id: u.id, judul: u.judul, maks: u.nilaiMaks, terbit: u.terbit, offline: true })),
    ];

    const baris = siswa.map((s) => {
      // null = belum mengumpulkan; 'kumpul' = belum dinilai; 'revisi' = dikembalikan untuk diperbaiki;
      // 'na' = tugas tidak ditugaskan ke siswa ini (tidak dihitung di rata-rata)
      const nilai: Record<string, number | 'kumpul' | 'revisi' | 'na' | null> = {};
      const persen: number[] = [];
      // Per kategori untuk nilai akhir berbobot
      const kat: Record<'tugas' | 'kuis' | 'ujian', number[]> = { tugas: [], kuis: [], ujian: [] };
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
        // Nilai terakhir (bila ujian diulang setelah reset)
        const h = u.histori.filter((x) => x.userId === s.id).pop();
        nilai[`u${u.id}`] = h ? h.nilaiAkhir : null;
        if (h) kat.ujian.push(h.nilaiAkhir);
      }
      for (const u of ujianManual) {
        // Ujian offline: siswa tanpa nilai (mis. belum ikut susulan) tidak dihitung
        const n = u.nilai.find((x) => x.userId === s.id);
        nilai[`m${u.id}`] = n ? n.nilai : null;
        if (n) kat.ujian.push((n.nilai / u.nilaiMaks) * 100);
      }
      persen.push(...kat.tugas, ...kat.kuis, ...kat.ujian);
      const rataList = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
      const bulat = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
      const hadir = presensiSiswa(s.id);
      const komponen = { tugas: bulat(rataList(kat.tugas)), kuis: bulat(rataList(kat.kuis)), ujian: bulat(rataList(kat.ujian)), presensi: hadir };

      // Tanpa bobot: rata-rata semua nilai. Dengan bobot: rata-rata berbobot kategori yang sudah punya nilai.
      let rataRata: number | null;
      if (!berbobot) rataRata = bulat(rataList(persen));
      else {
        let jumlah = 0, total = 0;
        for (const [k, w] of Object.entries(bobot) as [keyof typeof komponen, number][]) {
          const v = komponen[k];
          if (w > 0 && v !== null) { jumlah += v * w; total += w; }
        }
        rataRata = total ? bulat(jumlah / total) : null;
      }
      return { siswa: s, nilai, komponen, rataRata, tuntas: mapel.kkm && rataRata !== null ? rataRata >= mapel.kkm : null };
    });

    const rata = baris.map((b) => b.rataRata).filter((x): x is number => x !== null);
    return NextResponse.json({
      peran,
      mapel: { id: mapel.id, nama: mapel.nama, kelas: mapel.kelas.nama },
      pengaturan: { ...bobot, kkm: mapel.kkm, berbobot },
      kolom,
      baris,
      ringkasan: {
        rataKelas: rata.length ? Math.round((rata.reduce((a, b) => a + b, 0) / rata.length) * 10) / 10 : null,
        tertinggi: rata.length ? Math.max(...rata) : null,
        terendah: rata.length ? Math.min(...rata) : null,
        tuntas: mapel.kkm ? baris.filter((b) => b.tuntas === true).length : null,
      },
    });
  } catch (error) {
    console.error('ERROR LMS NILAI:', error);
    return NextResponse.json({ message: 'Gagal memuat rekap nilai' }, { status: 500 });
  }
}
