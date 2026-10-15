import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { teks } from '@/lib/lms';


// Kelola Kelas & Mapel (LMS). Anggota kelas = peserta dengan User.kelas == Kelas.nama.

async function guruValid(guruId: unknown): Promise<number | null | false> {
  if (guruId === null || guruId === undefined || guruId === '') return null;
  const g = await prisma.user.findUnique({ where: { id: Number(guruId) }, select: { id: true, role: true } });
  return g && (g.role === 'GURU' || g.role === 'ADMIN') ? g.id : false;
}

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const [kelas, guru, kelasPeserta] = await Promise.all([
      prisma.kelas.findMany({
        orderBy: { nama: 'asc' },
        include: {
          mapel: {
            orderBy: { nama: 'asc' },
            include: {
              guru: { select: { id: true, nama: true } },
              _count: { select: { materi: true, tugas: true, pengumuman: true, ujian: true } },
            },
          },
        },
      }),
      prisma.user.findMany({ where: { role: 'GURU' }, select: { id: true, nama: true, nomorPeserta: true }, orderBy: { nama: 'asc' } }),
      prisma.user.groupBy({ by: ['kelas'], where: { role: 'PESERTA', kelas: { not: '' } }, _count: true }),
    ]);
    const jumlahSiswa = Object.fromEntries(kelasPeserta.map((k) => [k.kelas, k._count]));
    const terdaftar = new Set(kelas.map((k) => k.nama));
    return NextResponse.json({
      kelas: kelas.map((k) => ({ ...k, jumlahSiswa: jumlahSiswa[k.nama] ?? 0 })),
      guru,
      // Kelas yang tertulis di data peserta tetapi belum dibuat di LMS
      kelasBelumDibuat: kelasPeserta.filter((k) => !terdaftar.has(k.kelas)).map((k) => ({ nama: k.kelas, jumlahSiswa: k._count })),
    });
  } catch (error) {
    console.error('ERROR GET KELAS:', error);
    return NextResponse.json({ message: 'Gagal mengambil data kelas' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();

    if (body.jenis === 'kelasDariPeserta') {
      const ada = new Set((await prisma.kelas.findMany({ select: { nama: true } })).map((k) => k.nama));
      const dariPeserta = await prisma.user.findMany({ where: { role: 'PESERTA', kelas: { not: '' } }, select: { kelas: true }, distinct: ['kelas'] });
      const baru = dariPeserta.map((p) => p.kelas).filter((n) => !ada.has(n));
      if (baru.length) await prisma.kelas.createMany({ data: baru.map((nama) => ({ nama })) });
      await createAuditLog({ action: 'CREATE_KELAS', target: `${baru.length} kelas dari data peserta`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `${baru.length} kelas dibuat` });
    }

    if (body.jenis === 'kelas') {
      const nama = teks(body.nama, 50);
      if (!nama) return NextResponse.json({ message: 'Nama kelas wajib diisi' }, { status: 400 });
      if (await prisma.kelas.findUnique({ where: { nama } })) {
        return NextResponse.json({ message: 'Kelas dengan nama itu sudah ada' }, { status: 400 });
      }
      const waliId = await guruValid(body.waliId);
      if (waliId === false) return NextResponse.json({ message: 'Wali kelas tidak valid' }, { status: 400 });
      const kelas = await prisma.kelas.create({ data: { nama, keterangan: teks(body.keterangan, 200), waliId } });
      await createAuditLog({ action: 'CREATE_KELAS', target: `Kelas ${nama}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, data: kelas });
    }

    if (body.jenis === 'mapel') {
      const nama = teks(body.nama, 100);
      const kelasId = Number(body.kelasId);
      if (!nama) return NextResponse.json({ message: 'Nama mapel wajib diisi' }, { status: 400 });
      if (!Number.isInteger(kelasId) || !(await prisma.kelas.findUnique({ where: { id: kelasId } }))) {
        return NextResponse.json({ message: 'Kelas tidak ditemukan' }, { status: 400 });
      }
      const guruId = await guruValid(body.guruId);
      if (guruId === false) return NextResponse.json({ message: 'Guru tidak valid' }, { status: 400 });
      if (await prisma.mapel.findUnique({ where: { kelasId_nama: { kelasId, nama } } })) {
        return NextResponse.json({ message: 'Mapel itu sudah ada di kelas ini' }, { status: 400 });
      }
      const mapel = await prisma.mapel.create({ data: { kelasId, nama, guruId, deskripsi: teks(body.deskripsi, 1000) } });
      await createAuditLog({ action: 'CREATE_MAPEL', target: `Mapel #${mapel.id} ${nama}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, data: mapel });
    }

    return NextResponse.json({ message: 'Jenis tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR POST KELAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const id = Number(body.id);

    if (body.jenis === 'kelas') {
      const lama = await prisma.kelas.findUnique({ where: { id } });
      if (!lama) return NextResponse.json({ message: 'Kelas tidak ditemukan' }, { status: 404 });
      const nama = teks(body.nama, 50);
      if (!nama) return NextResponse.json({ message: 'Nama kelas wajib diisi' }, { status: 400 });
      if (nama !== lama.nama && (await prisma.kelas.findUnique({ where: { nama } }))) {
        return NextResponse.json({ message: 'Kelas dengan nama itu sudah ada' }, { status: 400 });
      }
      const waliId = body.waliId === undefined ? lama.waliId : await guruValid(body.waliId);
      if (waliId === false) return NextResponse.json({ message: 'Wali kelas tidak valid' }, { status: 400 });
      // Ganti nama kelas -> kelas peserta anggotanya ikut diganti
      const [kelas] = await prisma.$transaction([
        prisma.kelas.update({ where: { id }, data: { nama, keterangan: teks(body.keterangan, 200), waliId } }),
        prisma.user.updateMany({ where: { role: 'PESERTA', kelas: lama.nama }, data: { kelas: nama } }),
        // Arsip anggota semester lalu ikut berganti nama (mapel tetap milik kelas yang sama)
        prisma.anggotaKelas.updateMany({ where: { kelas: lama.nama }, data: { kelas: nama } }),
      ]);
      await createAuditLog({ action: 'UPDATE_KELAS', target: `Kelas ${lama.nama}`, details: { namaBaru: nama }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, data: kelas });
    }

    if (body.jenis === 'mapel') {
      const lama = await prisma.mapel.findUnique({ where: { id } });
      if (!lama) return NextResponse.json({ message: 'Mapel tidak ditemukan' }, { status: 404 });
      const nama = teks(body.nama, 100);
      if (!nama) return NextResponse.json({ message: 'Nama mapel wajib diisi' }, { status: 400 });
      const guruId = await guruValid(body.guruId);
      if (guruId === false) return NextResponse.json({ message: 'Guru tidak valid' }, { status: 400 });
      const bentrok = await prisma.mapel.findUnique({ where: { kelasId_nama: { kelasId: lama.kelasId, nama } } });
      if (bentrok && bentrok.id !== id) return NextResponse.json({ message: 'Mapel itu sudah ada di kelas ini' }, { status: 400 });
      const mapel = await prisma.mapel.update({ where: { id }, data: { nama, guruId, deskripsi: teks(body.deskripsi, 1000) } });
      await createAuditLog({ action: 'UPDATE_MAPEL', target: `Mapel #${id} ${nama}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, data: mapel });
    }

    return NextResponse.json({ message: 'Jenis tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR PUT KELAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const jenis = url.searchParams.get('jenis');
    const id = Number(url.searchParams.get('id'));

    if (jenis === 'kelas') {
      const kelas = await prisma.kelas.findUnique({ where: { id }, include: { _count: { select: { mapel: true } } } });
      if (!kelas) return NextResponse.json({ message: 'Kelas tidak ditemukan' }, { status: 404 });
      if (kelas._count.mapel > 0) {
        return NextResponse.json({ message: 'Hapus dulu semua mapel di kelas ini' }, { status: 400 });
      }
      await prisma.kelas.delete({ where: { id } });
      await createAuditLog({ action: 'DELETE_KELAS', target: `Kelas ${kelas.nama}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Kelas dihapus (data peserta tidak berubah)' });
    }

    if (jenis === 'mapel') {
      const mapel = await prisma.mapel.findUnique({
        where: { id },
        include: { _count: { select: { materi: true, tugas: true, pengumuman: true, ujian: true, kuis: true, sesiPresensi: true, ujianManual: true } } },
      });
      if (!mapel) return NextResponse.json({ message: 'Mapel tidak ditemukan' }, { status: 404 });
      const c = mapel._count;
      if (c.materi + c.tugas + c.pengumuman + c.ujian + c.kuis + c.sesiPresensi + c.ujianManual > 0) {
        return NextResponse.json({
          message: `Mapel masih berisi ${c.materi} materi, ${c.tugas} tugas, ${c.kuis} kuis, ${c.sesiPresensi} pertemuan presensi, ${c.pengumuman} pengumuman, ${c.ujian} ujian CAT, ${c.ujianManual} ujian offline. Hapus isinya dulu.`,
        }, { status: 400 });
      }
      await prisma.$transaction([prisma.topik.deleteMany({ where: { mapelId: id } }), prisma.deskripsiRapor.deleteMany({ where: { mapelId: id } }), prisma.mapel.delete({ where: { id } })]);
      await createAuditLog({ action: 'DELETE_MAPEL', target: `Mapel #${id} ${mapel.nama}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Mapel dihapus' });
    }

    return NextResponse.json({ message: 'Jenis tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR DELETE KELAS:', error);
    return NextResponse.json({ message: 'Gagal menghapus' }, { status: 500 });
  }
}
