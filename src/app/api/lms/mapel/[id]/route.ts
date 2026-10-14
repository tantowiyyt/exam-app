import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';

// Isi satu mapel: pengumuman, materi, tugas, ujian, (pengelola) daftar siswa
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/mapel/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const akses = await aksesMapel(user, Number((await ctx.params).id));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const { mapel, peran } = akses;
    const kelola = peran === 'kelola';
    const hanyaTerbit = kelola ? {} : { terbit: true };

    const [pengumuman, materi, tugas, ujian, siswa] = await Promise.all([
      prisma.pengumuman.findMany({
        where: { mapelId: mapel.id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nama: true } }, _count: { select: { komentar: true } } },
      }),
      prisma.materi.findMany({
        where: { mapelId: mapel.id, ...hanyaTerbit },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, judul: true, terbit: true, createdAt: true, lampiran: true, linkVideo: true,
          _count: { select: { dibaca: true, komentar: true } },
          dibaca: { where: { userId: user.id }, select: { userId: true } },
        },
      }),
      prisma.tugas.findMany({
        where: { mapelId: mapel.id, ...hanyaTerbit },
        orderBy: [{ tenggat: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, judul: true, terbit: true, tenggat: true, nilaiMaks: true, createdAt: true,
          _count: { select: { pengumpulan: true } },
          pengumpulan: { where: { userId: user.id }, select: { dikumpulkanAt: true, nilai: true } },
        },
      }),
      prisma.ujian.findMany({
        where: { mapelId: mapel.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, nama: true, isActive: true, durasiMenit: true, jadwalMulai: true, jadwalSelesai: true,
          histori: { where: { userId: user.id }, select: { nilaiAkhir: true, waktuSelesai: true }, orderBy: { id: 'desc' }, take: 1 },
        },
      }),
      prisma.user.findMany({
        where: { role: 'PESERTA', kelas: mapel.kelas.nama },
        select: { id: true, nomorPeserta: true, nama: true },
        orderBy: { nama: 'asc' },
      }),
    ]);

    return NextResponse.json({
      peran,
      mapel: { id: mapel.id, nama: mapel.nama, deskripsi: mapel.deskripsi, kelas: { id: mapel.kelas.id, nama: mapel.kelas.nama }, guru: mapel.guru },
      jumlahSiswa: siswa.length,
      siswa: kelola ? siswa : [],
      pengumuman: pengumuman.map((p) => ({
        id: p.id, judul: p.judul, isi: p.isi, createdAt: p.createdAt, penulis: p.user?.nama ?? '(akun dihapus)', jumlahKomentar: p._count.komentar,
      })),
      materi: materi.map((m) => ({
        id: m.id, judul: m.judul, terbit: m.terbit, createdAt: m.createdAt,
        adaLampiran: !!m.lampiran, adaVideo: !!m.linkVideo,
        jumlahKomentar: m._count.komentar,
        jumlahDibaca: kelola ? m._count.dibaca : undefined,
        sudahDibaca: m.dibaca.length > 0,
      })),
      tugas: tugas.map((t) => ({
        id: t.id, judul: t.judul, terbit: t.terbit, tenggat: t.tenggat, nilaiMaks: t.nilaiMaks, createdAt: t.createdAt,
        jumlahKumpul: kelola ? t._count.pengumpulan : undefined,
        pengumpulanSaya: kelola ? undefined : (t.pengumpulan[0] ?? null),
      })),
      ujian: ujian.map((u) => ({
        id: u.id, nama: u.nama, isActive: u.isActive, durasiMenit: u.durasiMenit, jadwalMulai: u.jadwalMulai, jadwalSelesai: u.jadwalSelesai,
        nilaiSaya: kelola ? undefined : (u.histori[0]?.nilaiAkhir ?? null),
      })),
    });
  } catch (error) {
    console.error('ERROR LMS MAPEL:', error);
    return NextResponse.json({ message: 'Gagal memuat mapel' }, { status: 500 });
  }
}
