import { prisma } from './prisma';
import { kelasSiswaDi } from './anggota';

// Rekap kehadiran satu siswa lintas mapel dalam satu semester (dipakai menu Kehadiran siswa & portal orang tua).
// Pertemuan yang sudah berlangsung tanpa isian dihitung "belum diisi".
export async function rekapKehadiran(userId: number, semester: { id: number; aktif: boolean }) {
  const kelas = await kelasSiswaDi(userId, semester);
  const mapel = kelas
    ? await prisma.mapel.findMany({ where: { kelas: { nama: kelas } }, include: { guru: { select: { nama: true } } }, orderBy: { nama: 'asc' } })
    : [];
  const now = new Date();
  const sesi = await prisma.sesiPresensi.findMany({
    where: { mapelId: { in: mapel.map((m) => m.id) }, semesterId: semester.id, tanggal: { lte: now } },
    orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
    select: { id: true, mapelId: true, judul: true, tanggal: true, presensi: { where: { userId: userId }, select: { status: true, keterangan: true } } },
  });

  const kosong = () => ({ H: 0, I: 0, S: 0, A: 0, belum: 0, pertemuan: 0 });
  const total = kosong();
  const per = new Map(mapel.map((m) => [m.id, kosong()]));
  for (const s of sesi) {
    const st = s.presensi[0]?.status as 'H' | 'I' | 'S' | 'A' | undefined;
    for (const r of [per.get(s.mapelId)!, total]) {
      r.pertemuan++;
      if (st && st in r) r[st]++;
      else r.belum++;
    }
  }
  const persen = (r: { H: number; pertemuan: number }) => (r.pertemuan ? Math.round((r.H / r.pertemuan) * 1000) / 10 : null);
  const namaMapel = new Map(mapel.map((m) => [m.id, m.nama]));

  return {
    kelas,
    total: { ...total, persen: persen(total) },
    perMapel: mapel.map((m) => {
      const r = per.get(m.id)!;
      return { id: m.id, nama: m.nama, guru: m.guru?.nama ?? '', ...r, persen: persen(r) };
    }),
    riwayat: sesi.map((s) => ({
      id: s.id, mapelId: s.mapelId, mapel: namaMapel.get(s.mapelId) ?? '', judul: s.judul, tanggal: s.tanggal,
      status: s.presensi[0]?.status ?? null, keterangan: s.presensi[0]?.keterangan ?? '',
    })),
  };
}
