import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, mapelPengguna, whereTugasSiswa } from '@/lib/lms';
import { getIdentitas } from '@/lib/pengaturan-aplikasi';

// Beranda LMS: daftar mapel yang bisa dibuka pengguna + ringkasan per role
// (siswa: agenda & ujian CAT aktif; guru/admin: yang perlu dinilai; admin: ringkasan sekolah)
export async function GET() {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const mapel = await mapelPengguna(user);

    // Siswa: tugas yang belum dikumpulkan / diminta revisi (jumlah per mapel + daftar terdekat tenggatnya)
    let tugasBelum: Record<number, number> = {};
    let agenda: { id: number; jenis: 'tugas' | 'kuis'; judul: string; tenggat: Date | null; revisi: boolean; mapel: { id: number; nama: string } }[] = [];
    if (user.role === 'PESERTA' && mapel.length) {
      const rows = await prisma.tugas.findMany({
        where: {
          mapelId: { in: mapel.map((m) => m.id) },
          AND: [
            whereTugasSiswa(user.id),
            { OR: [{ pengumpulan: { none: { userId: user.id } } }, { pengumpulan: { some: { userId: user.id, status: 'revisi' } } }] },
          ],
        },
        select: {
          id: true, judul: true, tenggat: true, mapel: { select: { id: true, nama: true } },
          pengumpulan: { where: { userId: user.id }, select: { status: true } },
        },
      });
      const tugas = rows.map(({ pengumpulan, ...t }) => ({ ...t, jenis: 'tugas' as const, revisi: pengumpulan[0]?.status === 'revisi' }));
      // Kuis yang sedang dibuka dan belum pernah dikerjakan (tenggat = waktu tutup)
      const now = new Date();
      const kuis = (await prisma.kuis.findMany({
        where: {
          mapelId: { in: mapel.map((m) => m.id) }, terbit: true,
          AND: [{ OR: [{ mulai: null }, { mulai: { lte: now } }] }, { OR: [{ selesai: null }, { selesai: { gt: now } }] }],
          percobaan: { none: { userId: user.id, selesaiAt: { not: null } } },
        },
        select: { id: true, judul: true, selesai: true, mapel: { select: { id: true, nama: true } } },
      })).map((k) => ({ id: k.id, jenis: 'kuis' as const, judul: k.judul, tenggat: k.selesai, revisi: false, mapel: k.mapel }));
      tugasBelum = [...tugas, ...kuis].reduce<Record<number, number>>((acc, t) => ({ ...acc, [t.mapel.id]: (acc[t.mapel.id] ?? 0) + 1 }), {});
      // Revisi dulu, lalu tenggat terdekat (yang sudah lewat paling atas), tanpa tenggat di akhir
      agenda = [...tugas, ...kuis]
        .sort((a, b) => Number(b.revisi) - Number(a.revisi) || (a.tenggat?.getTime() ?? Infinity) - (b.tenggat?.getTime() ?? Infinity))
        .slice(0, 8);
    }

    const saya = user.role === 'PESERTA'
      ? await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true, sudahUjian: true } })
      : null;
    const kelasSaya = saya?.kelas ?? '';
    const { modulCat } = await getIdentitas();

    // Siswa: ujian CAT yang sedang aktif & berlaku untuk kelasnya (banner di beranda)
    let ujianCat = null;
    if (saya && modulCat) {
      const u = await prisma.ujian.findFirst({
        where: { isActive: true },
        select: { nama: true, durasiMenit: true, jadwalMulai: true, jadwalSelesai: true, mapel: { select: { nama: true, kelas: { select: { nama: true } } } }, _count: { select: { soal: true } } },
      });
      const lewat = u?.jadwalSelesai && u.jadwalSelesai < new Date();
      if (u && u._count.soal > 0 && !lewat && (!u.mapel || u.mapel.kelas.nama === kelasSaya)) {
        ujianCat = { nama: u.nama, durasiMenit: u.durasiMenit, jadwalMulai: u.jadwalMulai, jadwalSelesai: u.jadwalSelesai, mapel: u.mapel?.nama ?? null, sudahUjian: saya.sudahUjian };
      }
    }

    // Guru/admin: tugas & kuis yang menunggu dinilai
    let perluDinilai: { jenis: 'tugas' | 'kuis'; id: number; judul: string; jumlah: number; mapel: { id: number; nama: string; kelas: string } }[] = [];
    if (user.role !== 'PESERTA' && mapel.length) {
      const ids = mapel.map((m) => m.id);
      const info = new Map(mapel.map((m) => [m.id, { id: m.id, nama: m.nama, kelas: m.kelas.nama }]));
      const [kumpul, esai] = await Promise.all([
        prisma.pengumpulanTugas.groupBy({ by: ['tugasId'], where: { tugas: { mapelId: { in: ids } }, nilai: null, status: 'dikumpulkan' }, _count: true }),
        prisma.percobaanKuis.groupBy({ by: ['kuisId'], where: { kuis: { mapelId: { in: ids } }, perluDinilai: true, selesaiAt: { not: null } }, _count: true }),
      ]);
      const [tugasN, kuisN] = await Promise.all([
        prisma.tugas.findMany({ where: { id: { in: kumpul.map((k) => k.tugasId) } }, select: { id: true, judul: true, mapelId: true } }),
        prisma.kuis.findMany({ where: { id: { in: esai.map((k) => k.kuisId) } }, select: { id: true, judul: true, mapelId: true } }),
      ]);
      perluDinilai = [
        ...tugasN.map((t) => ({ jenis: 'tugas' as const, id: t.id, judul: t.judul, jumlah: kumpul.find((k) => k.tugasId === t.id)!._count, mapel: info.get(t.mapelId)! })),
        ...kuisN.map((k) => ({ jenis: 'kuis' as const, id: k.id, judul: k.judul, jumlah: esai.find((e) => e.kuisId === k.id)!._count, mapel: info.get(k.mapelId)! })),
      ].sort((a, b) => b.jumlah - a.jumlah).slice(0, 8);
    }

    // Admin: ringkasan sekolah
    let ringkasan = null;
    if (user.role === 'ADMIN') {
      const [kelas, guru, siswa, siswaTanpaKelas, mapelTanpaGuru] = await Promise.all([
        prisma.kelas.count(),
        prisma.user.count({ where: { role: 'GURU' } }),
        prisma.user.count({ where: { role: 'PESERTA' } }),
        prisma.user.count({ where: { role: 'PESERTA', kelas: '' } }),
        prisma.mapel.count({ where: { guruId: null } }),
      ]);
      ringkasan = { kelas, mapel: mapel.length, guru, siswa, siswaTanpaKelas, mapelTanpaGuru };
    }

    return NextResponse.json({
      role: user.role,
      nama: user.nama,
      kelasSaya,
      mapel: mapel.map((m) => ({
        id: m.id,
        nama: m.nama,
        deskripsi: m.deskripsi,
        kelas: m.kelas,
        guru: m.guru,
        jumlahMateri: m._count.materi,
        jumlahTugas: m._count.tugas,
        jumlahKuis: m._count.kuis,
        tugasBelum: tugasBelum[m.id] ?? 0,
      })),
      agenda,
      ujianCat,
      perluDinilai,
      ringkasan,
    });
  } catch (error) {
    console.error('ERROR LMS KELAS:', error);
    return NextResponse.json({ message: 'Gagal memuat kelas' }, { status: 500 });
  }
}
