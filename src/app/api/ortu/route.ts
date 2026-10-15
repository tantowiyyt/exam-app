import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRole } from '@/lib/admin-auth';
import { whereTugasSiswa } from '@/lib/lms';
import { semesterAktif } from '@/lib/semester';
import { hitungRekapMapel } from '@/lib/rekap';
import { rekapKehadiran } from '@/lib/kehadiran';
import { anakDari, anakMilik } from '@/lib/ortu';

// Portal orang tua (hanya baca). GET: daftar anak + ringkasan. GET ?anak=id: rincian satu anak
// (nilai per mapel yang sudah terlihat siswa, tugas & statusnya, kehadiran, jadwal, pengumuman, ujian mendatang).

const HARI_MS = 86400000;

async function ringkas(anak: { id: number; nomorPeserta: string; nama: string; kelas: string }, semester: { id: number; aktif: boolean }) {
  const now = new Date();
  const mapel = anak.kelas ? await prisma.mapel.findMany({ where: { kelas: { nama: anak.kelas } }, select: { id: true } }) : [];
  const ids = mapel.map((m) => m.id);
  const [tugas, hadir] = await Promise.all([
    ids.length ? prisma.tugas.findMany({
      where: { mapelId: { in: ids }, semesterId: semester.id, ...whereTugasSiswa(anak.id) },
      select: { tenggat: true, pengumpulan: { where: { userId: anak.id }, select: { id: true } } },
    }) : Promise.resolve([]),
    rekapKehadiran(anak.id, semester),
  ]);
  const belum = tugas.filter((t) => !t.pengumpulan.length);
  return {
    siswa: anak,
    kehadiran: hadir.total,
    tugasMendatang: belum.filter((t) => t.tenggat && t.tenggat > now).length,
    tugasTerlambat: belum.filter((t) => t.tenggat && t.tenggat <= now).length,
  };
}

export async function GET(request: Request) {
  const auth = await verifyRole(['ORANGTUA']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    const semester = await semesterAktif();
    const idAnak = new URL(request.url).searchParams.get('anak');

    if (!idAnak) {
      const anak = await anakDari(user.id);
      return NextResponse.json({ semester: { id: semester.id, label: semester.label }, anak: await Promise.all(anak.map((a) => ringkas(a, semester))) });
    }

    const anak = await anakMilik(user.id, Number(idAnak));
    if (!anak) return NextResponse.json({ message: 'Data anak tidak ditemukan' }, { status: 404 });
    const now = new Date();
    const mapel = anak.kelas
      ? await prisma.mapel.findMany({ where: { kelas: { nama: anak.kelas } }, include: { guru: { select: { id: true, nama: true } } }, orderBy: { nama: 'asc' } })
      : [];
    const ids = mapel.map((m) => m.id);
    const siswa = [{ id: anak.id, nomorPeserta: anak.nomorPeserta, nama: anak.nama }];
    const kelasRow = anak.kelas ? await prisma.kelas.findUnique({ where: { nama: anak.kelas }, select: { id: true, waliId: true } }) : null;
    const hari = ((now.getDay() + 6) % 7) + 1;
    const [nilai, tugas, kehadiran, jadwal, pengumuman, ujian, wali] = await Promise.all([
      // Nilai seperti yang dilihat siswa (draf & nilai yang belum diumumkan tidak ikut)
      Promise.all(mapel.map(async (m) => {
        const r = await hitungRekapMapel(m, siswa, semester, { kelola: false, userId: anak.id });
        const b = r.baris[0];
        return { id: m.id, nama: m.nama, guru: m.guru, kkm: m.kkm, nilaiAkhir: b?.rataRata ?? null, tuntas: b?.tuntas ?? null, komponen: b?.komponen ?? null };
      })),
      ids.length ? prisma.tugas.findMany({
        where: { mapelId: { in: ids }, semesterId: semester.id, ...whereTugasSiswa(anak.id) },
        orderBy: [{ tenggat: 'desc' }], take: 50,
        select: { id: true, judul: true, tenggat: true, nilaiMaks: true, mapelId: true, pengumpulan: { where: { userId: anak.id }, select: { dikumpulkanAt: true, nilai: true, status: true } } },
      }) : Promise.resolve([]),
      rekapKehadiran(anak.id, semester),
      kelasRow ? prisma.jadwalPelajaran.findMany({ where: { kelasId: kelasRow.id, semesterId: semester.id }, orderBy: [{ hari: 'asc' }, { jamMulai: 'asc' }] }) : Promise.resolve([]),
      ids.length ? prisma.pengumuman.findMany({ where: { mapelId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, judul: true, isi: true, createdAt: true, mapelId: true } }) : Promise.resolve([]),
      ids.length ? prisma.ujianManual.findMany({
        where: { mapelId: { in: ids }, semesterId: semester.id, tanggal: { gte: new Date(now.getTime() - HARI_MS) }, OR: [{ untukSiswa: '' }, { untukSiswa: { contains: `,${anak.id},` } }] },
        orderBy: { tanggal: 'asc' }, take: 10, select: { id: true, judul: true, jenis: true, tanggal: true, mapelId: true },
      }) : Promise.resolve([]),
      kelasRow?.waliId ? prisma.user.findUnique({ where: { id: kelasRow.waliId }, select: { id: true, nama: true } }) : Promise.resolve(null),
    ]);
    const nama = new Map(mapel.map((m) => [m.id, m.nama]));
    return NextResponse.json({
      semester: { id: semester.id, label: semester.label },
      siswa: anak,
      wali,
      nilai,
      kehadiran,
      tugas: tugas.map((t) => {
        const p = t.pengumpulan[0];
        const status = p ? (p.nilai !== null ? 'dinilai' : p.status === 'revisi' ? 'revisi' : 'dikumpulkan') : t.tenggat && t.tenggat < now ? 'terlambat' : 'belum';
        return { id: t.id, judul: t.judul, mapel: nama.get(t.mapelId) ?? '', tenggat: t.tenggat, status, nilai: p?.nilai ?? null, nilaiMaks: t.nilaiMaks };
      }),
      jadwal: jadwal.map((j) => ({ id: j.id, hari: j.hari, jamMulai: j.jamMulai, jamSelesai: j.jamSelesai, ruang: j.ruang, mapel: nama.get(j.mapelId) ?? '', hariIni: j.hari === hari })),
      pengumuman: pengumuman.map((p) => ({ ...p, mapel: nama.get(p.mapelId) ?? '' })),
      ujian: ujian.map((u) => ({ ...u, mapel: nama.get(u.mapelId) ?? '' })),
    });
  } catch (error) {
    console.error('ERROR PORTAL ORTU:', error);
    return NextResponse.json({ message: 'Gagal memuat data' }, { status: 500 });
  }
}
