import { prisma } from './prisma';
import { whereTerbit, whereTugasSiswa } from './lms';
import { kelasSiswaDi } from './anggota';
import { rekapKehadiran } from './kehadiran';
import { hitungRekapMapel } from './rekap';

// Lencana siswa per semester.
//  - Otomatis: dihitung dari data belajar saat dibuka (tidak disimpan), lengkap dengan progres untuk yang belum didapat.
//  - Dari guru: LencanaSiswa (guru pengampu memberi penghargaan di mapelnya).

export const JENIS_LENCANA: Record<string, { judul: string; ikon: string }> = {
  teraktif: { judul: 'Siswa Teraktif', ikon: '🔥' },
  kreatif: { judul: 'Kreatif', ikon: '🎨' },
  membantu: { judul: 'Suka Membantu', ikon: '🤝' },
  disiplin: { judul: 'Disiplin', ikon: '⏰' },
  kemajuan: { judul: 'Kemajuan Pesat', ikon: '📈' },
  juara: { judul: 'Juara Kelas', ikon: '🏆' },
  lain: { judul: 'Penghargaan', ikon: '⭐' },
};

export type LencanaOtomatis = { kode: string; judul: string; deskripsi: string; ikon: string; dapat: boolean; progres: string };
type Sem = { id: number; aktif: boolean };

/**
 * Lencana otomatis seorang siswa. lengkap = false melewati "Tuntas Semua" (butuh rekap semua mapel —
 * dipakai saat menampilkan banyak siswa sekaligus).
 */
export async function lencanaOtomatis(userId: number, semester: Sem, lengkap = true): Promise<LencanaOtomatis[]> {
  const kelas = await kelasSiswaDi(userId, semester);
  const mapel = kelas ? await prisma.mapel.findMany({ where: { kelas: { nama: kelas } } }) : [];
  const ids = mapel.map((m) => m.id);
  const now = new Date();
  const [hadir, tugas, materi, dibaca, komentar, percobaan, nilaiUjian] = await Promise.all([
    rekapKehadiran(userId, semester),
    ids.length ? prisma.tugas.findMany({
      where: { mapelId: { in: ids }, semesterId: semester.id, ...whereTugasSiswa(userId) },
      select: { id: true, tenggat: true, nilaiMaks: true, pengumpulan: { where: { userId }, select: { dikumpulkanAt: true, nilai: true } } },
    }) : Promise.resolve([]),
    ids.length ? prisma.materi.count({ where: { mapelId: { in: ids }, ...whereTerbit() } }) : Promise.resolve(0),
    ids.length ? prisma.materiDibaca.count({ where: { userId, materi: { mapelId: { in: ids }, ...whereTerbit() } } }) : Promise.resolve(0),
    prisma.komentar.count({ where: { userId } }),
    ids.length ? prisma.percobaanKuis.findMany({
      where: { userId, selesaiAt: { not: null }, kuis: { mapelId: { in: ids }, semesterId: semester.id, modeUjian: false } },
      select: { kuisId: true, nilai: true },
    }) : Promise.resolve([]),
    prisma.nilaiUjianManual.findMany({ where: { userId, ujian: { terbit: true, semesterId: semester.id, mapelId: { in: ids } } }, select: { nilai: true, ujian: { select: { nilaiMaks: true } } } }),
  ]);

  // Tepat waktu: tugas bertenggat yang sudah lewat atau sudah dikumpulkan
  const bertenggat = tugas.filter((t) => t.tenggat && (t.tenggat < now || t.pengumpulan.length));
  const tepat = bertenggat.filter((t) => t.pengumpulan[0] && t.pengumpulan[0].dikumpulkanAt <= t.tenggat!).length;
  // Kuis: nilai tertinggi per kuis
  const terbaik = new Map<number, number>();
  for (const p of percobaan) terbaik.set(p.kuisId, Math.max(terbaik.get(p.kuisId) ?? 0, p.nilai ?? 0));
  const rataKuis = terbaik.size ? [...terbaik.values()].reduce((a, b) => a + b, 0) / terbaik.size : 0;
  const sempurna = tugas.some((t) => t.pengumpulan[0]?.nilai === t.nilaiMaks) || [...terbaik.values()].some((v) => v >= 100) || nilaiUjian.some((n) => n.nilai >= n.ujian.nilaiMaks);
  const persenBaca = materi ? Math.round((dibaca / materi) * 100) : 0;

  const out: LencanaOtomatis[] = [
    { kode: 'hadir', judul: 'Rajin Hadir', ikon: '✅', deskripsi: 'Kehadiran minimal 95% dari 8 pertemuan atau lebih',
      dapat: hadir.total.pertemuan >= 8 && (hadir.total.persen ?? 0) >= 95, progres: `${hadir.total.persen ?? 0}% dari ${hadir.total.pertemuan} pertemuan` },
    { kode: 'tepat', judul: 'Tepat Waktu', ikon: '⏱️', deskripsi: 'Semua tugas dikumpulkan sebelum tenggat (minimal 5 tugas)',
      dapat: bertenggat.length >= 5 && tepat === bertenggat.length, progres: `${tepat}/${bertenggat.length} tugas tepat waktu` },
    { kode: 'baca', judul: 'Pembaca Setia', ikon: '📚', deskripsi: 'Membaca minimal 90% materi (minimal 5 materi)',
      dapat: materi >= 5 && persenBaca >= 90, progres: `${dibaca}/${materi} materi dibaca` },
    { kode: 'sempurna', judul: 'Nilai Sempurna', ikon: '💯', deskripsi: 'Mendapat nilai penuh di tugas, kuis, atau ujian',
      dapat: sempurna, progres: sempurna ? 'Tercapai' : 'Belum ada nilai penuh' },
    { kode: 'kuis', judul: 'Jago Kuis', ikon: '🧠', deskripsi: 'Mengerjakan minimal 5 kuis dengan rata-rata 85 atau lebih',
      dapat: terbaik.size >= 5 && rataKuis >= 85, progres: `${terbaik.size} kuis, rata-rata ${Math.round(rataKuis)}` },
    { kode: 'diskusi', judul: 'Aktif Berdiskusi', ikon: '💬', deskripsi: 'Menulis minimal 10 komentar di diskusi kelas',
      dapat: komentar >= 10, progres: `${komentar}/10 komentar` },
  ];
  if (lengkap) {
    const siswa = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, nomorPeserta: true, nama: true } });
    const berKkm = mapel.filter((m) => m.kkm > 0);
    let tuntas = 0;
    let dinilai = 0;
    if (siswa) {
      for (const m of berKkm) {
        const b = (await hitungRekapMapel(m, [siswa], semester, { kelola: false, userId })).baris[0];
        if (b?.tuntas !== null && b?.tuntas !== undefined) { dinilai++; if (b.tuntas) tuntas++; }
      }
    }
    out.push({ kode: 'tuntas', judul: 'Tuntas Semua', ikon: '🎯', deskripsi: 'Mencapai KKM di semua mata pelajaran (minimal 3 mapel ber-KKM)',
      dapat: dinilai >= 3 && tuntas === dinilai, progres: `${tuntas}/${dinilai} mapel tuntas` });
  }
  return out;
}

/** Lencana dari guru untuk siswa-siswa ini pada semester tsb (beserta nama mapel & pemberi). */
export async function lencanaGuru(userIds: number[], semesterId: number, mapelId?: number) {
  const list = await prisma.lencanaSiswa.findMany({
    where: { userId: { in: userIds }, semesterId, ...(mapelId ? { mapelId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const [mapel, oleh] = await Promise.all([
    prisma.mapel.findMany({ where: { id: { in: [...new Set(list.map((l) => l.mapelId))] } }, select: { id: true, nama: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(list.map((l) => l.olehId))] } }, select: { id: true, nama: true } }),
  ]);
  return list.map((l) => ({
    id: l.id, userId: l.userId, jenis: l.jenis, judul: l.judul, catatan: l.catatan, createdAt: l.createdAt, olehId: l.olehId,
    ikon: JENIS_LENCANA[l.jenis]?.ikon ?? '⭐', mapel: mapel.find((m) => m.id === l.mapelId)?.nama ?? '', oleh: oleh.find((o) => o.id === l.olehId)?.nama ?? '',
  }));
}
