import { NextResponse } from 'next/server';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, whereTugasSiswa, whereTerbit, idSiswa, ditugaskan } from '@/lib/lms';
import { statusBuka, nilaiTerbaik, tutupYangKedaluwarsa } from '@/lib/kuis';
import { semesterDipilih, daftarSemester } from '@/lib/semester';
import { whereAnggota } from '@/lib/anggota';

// Isi satu mapel: pengumuman, materi, tugas, ujian, (pengelola) daftar siswa
export async function GET(request: Request, ctx: RouteContext<'/api/lms/mapel/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const akses = await aksesMapel(user, Number((await ctx.params).id));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const { mapel, peran } = akses;
    const kelola = peran === 'kelola';
    const hanyaTerbit = kelola ? {} : { terbit: true };
    // Tugas, kuis, & ujian ditampilkan per semester (?semester=id, bawaan = semester aktif)
    const semester = await semesterDipilih(new URL(request.url).searchParams.get('semester'));
    const diSemester = { semesterId: semester.id };
    const materiTerlihat = kelola ? {} : whereTerbit();

    // Percobaan siswa ini yang waktunya habis dinilai dulu agar statusnya benar
    if (!kelola) {
      const kuisAktif = await prisma.kuis.findMany({ where: { mapelId: mapel.id, terbit: true, percobaan: { some: { userId: user.id, selesaiAt: null } } } });
      for (const k of kuisAktif) await tutupYangKedaluwarsa(k, { userId: user.id });
    }

    const [pengumuman, materi, tugas, ujian, siswa, kuis, topik] = await Promise.all([
      prisma.pengumuman.findMany({
        where: { mapelId: mapel.id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nama: true } }, _count: { select: { komentar: true } } },
      }),
      prisma.materi.findMany({
        where: { mapelId: mapel.id, ...materiTerlihat },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, judul: true, terbit: true, terbitPada: true, topikId: true, createdAt: true, lampiran: true, linkVideo: true,
          _count: { select: { dibaca: true, komentar: true } },
          dibaca: { where: { userId: user.id }, select: { userId: true } },
        },
      }),
      prisma.tugas.findMany({
        where: { mapelId: mapel.id, ...diSemester, ...(kelola ? {} : whereTugasSiswa(user.id)) },
        orderBy: [{ tenggat: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, judul: true, terbit: true, terbitPada: true, topikId: true, tenggat: true, nilaiMaks: true, createdAt: true, untukSiswa: true, terimaTerlambat: true,
          _count: { select: { pengumpulan: true } },
          pengumpulan: { where: { userId: user.id }, select: { dikumpulkanAt: true, nilai: true, status: true } },
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
        where: await whereAnggota(mapel.kelas.nama, semester),
        select: { id: true, nomorPeserta: true, nama: true },
        orderBy: { nama: 'asc' },
      }),
      prisma.kuis.findMany({
        // Kuis mode ujian (CAT per mapel) tampil di tab Ujian, bukan di tab Kuis
        where: { mapelId: mapel.id, ...diSemester, modeUjian: false, ...hanyaTerbit },
        orderBy: [{ mulai: 'asc' }, { createdAt: 'asc' }],
        include: {
          _count: { select: { soal: true } },
          percobaan: { where: kelola ? {} : { userId: user.id }, select: { userId: true, selesaiAt: true, nilai: true, perluDinilai: true } },
        },
      }),
      prisma.topik.findMany({ where: { mapelId: mapel.id }, orderBy: [{ urutan: 'asc' }, { id: 'asc' }] }),
    ]);
    const jumlahUjianManual = await prisma.ujianManual.count({ where: { mapelId: mapel.id, ...diSemester } });

    // Pengelola: progres tiap siswa (materi dibaca, tugas dikumpulkan, kuis selesai) atas item yang terlihat siswa
    let progres: { userId: number; materi: number; tugas: number; tugasTotal: number; kuis: number; persen: number | null }[] = [];
    if (kelola && siswa.length) {
      const now = new Date();
      const materiTampil = materi.filter((m) => m.terbit && (!m.terbitPada || m.terbitPada <= now)).map((m) => m.id);
      const tugasTampil = tugas.filter((t) => t.terbit && (!t.terbitPada || t.terbitPada <= now));
      const kuisTampil = kuis.filter((k) => k.terbit);
      const [dibaca, kumpul] = await Promise.all([
        prisma.materiDibaca.findMany({ where: { materiId: { in: materiTampil } }, select: { userId: true } }),
        prisma.pengumpulanTugas.findMany({ where: { tugasId: { in: tugasTampil.map((t) => t.id) }, status: 'dikumpulkan' }, select: { userId: true, tugasId: true } }),
      ]);
      progres = siswa.map((s) => {
        const tugasSaya = tugasTampil.filter((t) => ditugaskan(t, s.id));
        const nMateri = dibaca.filter((d) => d.userId === s.id).length;
        const nTugas = kumpul.filter((k) => k.userId === s.id && tugasSaya.some((t) => t.id === k.tugasId)).length;
        const nKuis = kuisTampil.filter((k) => k.percobaan.some((p) => p.userId === s.id && p.selesaiAt)).length;
        const total = materiTampil.length + tugasSaya.length + kuisTampil.length;
        return {
          userId: s.id, materi: nMateri, tugas: nTugas, tugasTotal: tugasSaya.length, kuis: nKuis,
          persen: total ? Math.round(((nMateri + nTugas + nKuis) / total) * 100) : null,
        };
      });
    }

    return NextResponse.json({
      peran,
      mapel: { id: mapel.id, nama: mapel.nama, deskripsi: mapel.deskripsi, kelas: { id: mapel.kelas.id, nama: mapel.kelas.nama }, guru: mapel.guru },
      jumlahSiswa: siswa.length,
      jumlahUjianManual,
      semester: { id: semester.id, label: semester.label, aktif: semester.aktif },
      daftarSemester: (await daftarSemester()).map((s) => ({ id: s.id, label: s.label, aktif: s.aktif })),
      siswa: kelola ? siswa : [],
      topik: topik.map((t) => ({ id: t.id, judul: t.judul, deskripsi: t.deskripsi })),
      progres,
      jumlahMateriTampil: kelola ? materi.filter((m) => m.terbit && (!m.terbitPada || m.terbitPada <= new Date())).length : undefined,
      jumlahKuisTampil: kelola ? kuis.filter((k) => k.terbit).length : undefined,
      pengumuman: pengumuman.map((p) => ({
        id: p.id, judul: p.judul, isi: p.isi, createdAt: p.createdAt, penulis: p.user?.nama ?? '(akun dihapus)', jumlahKomentar: p._count.komentar,
      })),
      materi: materi.map((m) => ({
        id: m.id, judul: m.judul, terbit: m.terbit, createdAt: m.createdAt, topikId: m.topikId,
        terbitPada: kelola ? m.terbitPada : undefined,
        adaLampiran: !!m.lampiran, adaVideo: !!m.linkVideo,
        jumlahKomentar: m._count.komentar,
        jumlahDibaca: kelola ? m._count.dibaca : undefined,
        sudahDibaca: m.dibaca.length > 0,
      })),
      tugas: tugas.map((t) => ({
        id: t.id, judul: t.judul, terbit: t.terbit, tenggat: t.tenggat, nilaiMaks: t.nilaiMaks, createdAt: t.createdAt, topikId: t.topikId,
        terbitPada: kelola ? t.terbitPada : undefined,
        terimaTerlambat: t.terimaTerlambat,
        jumlahKumpul: kelola ? t._count.pengumpulan : undefined,
        // Jumlah siswa yang ditugaskan (null = semua siswa kelas)
        jumlahDitugaskan: kelola && t.untukSiswa ? idSiswa(t.untukSiswa).length : null,
        pengumpulanSaya: kelola ? undefined : (t.pengumpulan[0] ?? null),
      })),
      kuis: kuis.map((k) => ({
        id: k.id, judul: k.judul, terbit: k.terbit, topikId: k.topikId, mulai: k.mulai, selesai: k.selesai, durasiMenit: k.durasiMenit,
        maksPercobaan: k.maksPercobaan, jumlahSoal: k._count.soal, status: statusBuka(k),
        // Pengelola: jumlah siswa yang sudah selesai & jumlah jawaban esai yang menunggu dinilai
        jumlahSelesai: kelola ? new Set(k.percobaan.filter((p) => p.selesaiAt).map((p) => p.userId)).size : undefined,
        perluDinilai: kelola ? k.percobaan.filter((p) => p.perluDinilai).length : undefined,
        saya: kelola ? undefined : {
          jumlah: k.percobaan.length,
          sedang: k.percobaan.some((p) => !p.selesaiAt),
          terbaik: nilaiTerbaik(k.percobaan),
        },
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

// Pengelola mengatur bobot nilai akhir per kategori & KKM mapel
export async function PUT(request: Request, ctx: RouteContext<'/api/lms/mapel/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const akses = await aksesMapel(auth.user, Number((await ctx.params).id));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Mapel tidak ditemukan' }, { status: 404 });
    const body = await request.json();
    const angka = (v: unknown, maks: number) => { const n = Number(v ?? 0); return Number.isInteger(n) && n >= 0 && n <= maks ? n : null; };
    const data = {
      bobotTugas: angka(body.bobotTugas, 100), bobotKuis: angka(body.bobotKuis, 100),
      bobotUjian: angka(body.bobotUjian, 100), bobotPresensi: angka(body.bobotPresensi, 100), kkm: angka(body.kkm, 100),
      bobotUH: angka(body.bobotUH, 100), bobotUTS: angka(body.bobotUTS, 100), bobotUAS: angka(body.bobotUAS, 100),
    };
    if (Object.values(data).some((v) => v === null)) return NextResponse.json({ message: 'Bobot & KKM harus bilangan bulat 0–100' }, { status: 400 });
    const mapel = await prisma.mapel.update({ where: { id: akses.mapel.id }, data: data as Record<string, number> });
    await createAuditLog({ action: 'PENGATURAN_NILAI', target: `Mapel #${mapel.id} ${mapel.nama}`, details: data, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: mapel });
  } catch (error) {
    console.error('ERROR PENGATURAN NILAI:', error);
    return NextResponse.json({ message: 'Gagal menyimpan pengaturan nilai' }, { status: 500 });
  }
}
