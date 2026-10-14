import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, urutUjianManual } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Ujian offline / nilai manual per mapel (alternatif ujian CAT, mis. ujian kertas).
// Guru membuat ujian lalu mengisi nilai siswa. Siswa melihat jadwal ujian, nilainya baru terlihat setelah diumumkan (terbit).

function dataUjian(body: Record<string, unknown>) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Nama ujian wajib diisi' } as const;
  let tanggal: Date | null = null;
  if (body.tanggal) {
    tanggal = new Date(String(body.tanggal));
    if (isNaN(tanggal.getTime())) return { error: 'Tanggal tidak valid' } as const;
  }
  const nilaiMaks = Math.floor(Number(body.nilaiMaks ?? 100));
  if (!Number.isFinite(nilaiMaks) || nilaiMaks < 1 || nilaiMaks > 1000) return { error: 'Nilai maksimal 1–1000' } as const;
  return { data: { judul, tanggal, nilaiMaks, keterangan: teks(body.keterangan, 2000) } } as const;
}

async function ujianKelola(id: unknown, user: { id: number; role: string }) {
  const ujian = await prisma.ujianManual.findUnique({ where: { id: Number(id) } });
  const akses = ujian ? await aksesMapel(user, ujian.mapelId) : null;
  return ujian && akses?.peran === 'kelola' ? { ujian, akses } : null;
}

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const akses = await aksesMapel(user, Number(new URL(request.url).searchParams.get('mapelId')));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const kelola = akses.peran === 'kelola';

    const ujian = urutUjianManual(await prisma.ujianManual.findMany({
      where: { mapelId: akses.mapel.id },
      include: { nilai: { where: kelola ? {} : { userId: user.id }, select: { userId: true, nilai: true, catatan: true } } },
    }));

    if (!kelola) {
      return NextResponse.json({
        peran: akses.peran,
        ujian: ujian.map((u) => ({
          id: u.id, judul: u.judul, tanggal: u.tanggal, nilaiMaks: u.nilaiMaks, keterangan: u.keterangan, diumumkan: u.terbit,
          saya: u.terbit && u.nilai[0] ? { nilai: u.nilai[0].nilai, catatan: u.nilai[0].catatan } : null,
        })),
      });
    }

    const siswa = await prisma.user.findMany({
      where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama },
      select: { id: true, nomorPeserta: true, nama: true },
      orderBy: { nama: 'asc' },
    });
    return NextResponse.json({
      peran: akses.peran,
      siswa,
      ujian: ujian.map((u) => {
        const n = u.nilai.map((x) => x.nilai);
        return {
          id: u.id, judul: u.judul, tanggal: u.tanggal, nilaiMaks: u.nilaiMaks, keterangan: u.keterangan, terbit: u.terbit,
          nilai: u.nilai,
          rataRata: n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null,
        };
      }),
    });
  } catch (error) {
    console.error('ERROR GET UJIAN MANUAL:', error);
    return NextResponse.json({ message: 'Gagal memuat ujian offline' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Mapel tidak ditemukan atau Anda tidak mengelolanya' }, { status: 404 });
    const hasil = dataUjian(body);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    const ujian = await prisma.ujianManual.create({ data: { ...hasil.data, mapelId: akses.mapel.id } });
    await createAuditLog({ action: 'CREATE_UJIAN_MANUAL', target: `Ujian offline #${ujian.id} ${ujian.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Ujian dibuat. Isi nilainya lalu umumkan ke siswa.', data: ujian });
  } catch (error) {
    console.error('ERROR POST UJIAN MANUAL:', error);
    return NextResponse.json({ message: 'Gagal membuat ujian' }, { status: 500 });
  }
}

// aksi "ubah" = data ujian / umumkan (terbit); aksi "nilai" = simpan nilai banyak siswa
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const ada = await ujianKelola(body.id, auth.user);
    if (!ada) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const { ujian, akses } = ada;

    if (body.aksi === 'nilai') {
      const list: unknown[] = Array.isArray(body.data) ? body.data : [];
      if (list.length > 1000) return NextResponse.json({ message: 'Terlalu banyak data' }, { status: 400 });
      const siswa = new Set((await prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true } })).map((u) => u.id));
      // Siswa yang sudah pindah kelas tetap boleh dikoreksi/dihapus bila sudah punya nilai
      const sudah = new Set((await prisma.nilaiUjianManual.findMany({ where: { ujianId: ujian.id }, select: { userId: true } })).map((n) => n.userId));
      const ops = [];
      for (const raw of list) {
        const r = (raw ?? {}) as Record<string, unknown>;
        const userId = Number(r.userId);
        if (!siswa.has(userId) && !sudah.has(userId)) return NextResponse.json({ message: 'Ada siswa yang bukan anggota kelas ini' }, { status: 400 });
        const where = { ujianId_userId: { ujianId: ujian.id, userId } };
        // Nilai kosong = hapus nilai siswa itu
        if (r.nilai === null || r.nilai === '' || r.nilai === undefined) {
          if (sudah.has(userId)) ops.push(prisma.nilaiUjianManual.delete({ where }));
          continue;
        }
        const nilai = Number(r.nilai);
        if (!Number.isFinite(nilai) || nilai < 0 || nilai > ujian.nilaiMaks) {
          return NextResponse.json({ message: `Nilai harus 0–${ujian.nilaiMaks}` }, { status: 400 });
        }
        const v = { nilai: Math.round(nilai * 100) / 100, catatan: teks(r.catatan, 500) };
        ops.push(prisma.nilaiUjianManual.upsert({ where, update: v, create: { ...v, ujianId: ujian.id, userId } }));
      }
      await prisma.$transaction(ops);
      await createAuditLog({ action: 'NILAI_UJIAN_MANUAL', target: `Ujian offline #${ujian.id} ${ujian.judul}`, details: { perubahan: ops.length }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `${ops.length} nilai disimpan` });
    }

    // Ubah data ujian dan/atau status umumkan
    const data: Record<string, unknown> = {};
    if (body.judul !== undefined) {
      const hasil = dataUjian(body);
      if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
      const tertinggi = await prisma.nilaiUjianManual.aggregate({ where: { ujianId: ujian.id }, _max: { nilai: true } });
      if ((tertinggi._max.nilai ?? 0) > hasil.data.nilaiMaks) {
        return NextResponse.json({ message: `Sudah ada nilai ${tertinggi._max.nilai}; nilai maksimal tidak boleh lebih kecil` }, { status: 400 });
      }
      Object.assign(data, hasil.data);
    }
    if (typeof body.terbit === 'boolean') {
      data.terbit = body.terbit;
      if (body.terbit && !ujian.terbit) data.diumumkanAt = new Date();
    }
    const hasil = await prisma.ujianManual.update({ where: { id: ujian.id }, data });
    return NextResponse.json({ success: true, message: body.terbit === true ? 'Nilai diumumkan ke siswa' : body.terbit === false ? 'Nilai disembunyikan dari siswa' : 'Ujian diperbarui', data: hasil });
  } catch (error) {
    console.error('ERROR PUT UJIAN MANUAL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const ada = await ujianKelola(new URL(request.url).searchParams.get('id'), auth.user);
    if (!ada) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    await prisma.$transaction([
      prisma.nilaiUjianManual.deleteMany({ where: { ujianId: ada.ujian.id } }),
      prisma.ujianManual.delete({ where: { id: ada.ujian.id } }),
    ]);
    await createAuditLog({ action: 'DELETE_UJIAN_MANUAL', target: `Ujian offline #${ada.ujian.id} ${ada.ujian.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Ujian dan nilainya dihapus' });
  } catch (error) {
    console.error('ERROR DELETE UJIAN MANUAL:', error);
    return NextResponse.json({ message: 'Gagal menghapus ujian' }, { status: 500 });
  }
}
