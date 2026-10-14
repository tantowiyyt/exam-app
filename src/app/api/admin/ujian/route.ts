import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';

function parsePoolSize(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || Number(value) <= 0) return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : null;
}

/** mapelId: undefined = tidak diubah, null = ujian umum, angka = harus mapel yang ada. */
async function parseMapelId(value: unknown): Promise<number | null | undefined | false> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const mapel = await prisma.mapel.findUnique({ where: { id: Number(value) }, select: { id: true } });
  return mapel ? mapel.id : false;
}

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const ujianList = await prisma.ujian.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { soal: true, histori: true, bagian: true } },
        mapel: { select: { id: true, nama: true, kelas: { select: { nama: true } } } },
      },
    });
    return NextResponse.json(ujianList);
  } catch (error) {
    console.error('ERROR GET UJIAN:', error);
    return NextResponse.json({ message: 'Gagal mengambil data ujian' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { nama, durasiMenit, jadwalMulai, jadwalSelesai, poolSize } = body;
    const mapelId = await parseMapelId(body.mapelId);
    if (mapelId === false) {
      return NextResponse.json({ message: 'Mapel tidak ditemukan' }, { status: 400 });
    }

    if (!nama || !String(nama).trim()) {
      return NextResponse.json({ message: 'Nama ujian wajib diisi' }, { status: 400 });
    }
    if (jadwalMulai && jadwalSelesai && new Date(jadwalMulai) >= new Date(jadwalSelesai)) {
      return NextResponse.json({ message: 'Jadwal selesai harus setelah jadwal mulai' }, { status: 400 });
    }

    const ujian = await prisma.ujian.create({
      data: {
        nama: String(nama).trim(),
        durasiMenit: Number(durasiMenit) > 0 ? Number(durasiMenit) : 60,
        jadwalMulai: jadwalMulai ? new Date(jadwalMulai) : null,
        jadwalSelesai: jadwalSelesai ? new Date(jadwalSelesai) : null,
        poolSize: parsePoolSize(poolSize) ?? null,
        mapelId: mapelId ?? null,
      },
    });

    await createAuditLog({ action: AUDIT_ACTIONS.CREATE_UJIAN, target: `Ujian #${ujian.id} ${ujian.nama}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: ujian });
  } catch (error) {
    console.error('ERROR POST UJIAN:', error);
    return NextResponse.json({ message: 'Gagal membuat ujian' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { id, nama, durasiMenit, jadwalMulai, jadwalSelesai, isActive, poolSize } = body;

    if (!id) {
      return NextResponse.json({ message: 'ID ujian wajib diisi' }, { status: 400 });
    }
    if (jadwalMulai && jadwalSelesai && new Date(jadwalMulai) >= new Date(jadwalSelesai)) {
      return NextResponse.json({ message: 'Jadwal selesai harus setelah jadwal mulai' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (nama !== undefined) updateData.nama = String(nama).trim();
    if (Number(durasiMenit) > 0) updateData.durasiMenit = Number(durasiMenit);
    if (jadwalMulai !== undefined) updateData.jadwalMulai = jadwalMulai ? new Date(jadwalMulai) : null;
    if (jadwalSelesai !== undefined) updateData.jadwalSelesai = jadwalSelesai ? new Date(jadwalSelesai) : null;
    if (isActive !== undefined) updateData.isActive = !!isActive;
    const pool = parsePoolSize(poolSize);
    if (pool !== undefined) updateData.poolSize = pool;
    const mapelId = await parseMapelId(body.mapelId);
    if (mapelId === false) {
      return NextResponse.json({ message: 'Mapel tidak ditemukan' }, { status: 400 });
    }
    if (mapelId !== undefined) updateData.mapelId = mapelId;

    // Hanya satu ujian yang boleh aktif
    const ujian = await prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.ujian.updateMany({ where: { id: { not: Number(id) } }, data: { isActive: false } });
      }
      return tx.ujian.update({ where: { id: Number(id) }, data: updateData });
    });

    cache.delete(CACHE_KEYS.PENGATURAN);
    await createAuditLog({
      action: AUDIT_ACTIONS.UPDATE_UJIAN,
      target: `Ujian #${ujian.id} ${ujian.nama}`,
      details: updateData,
      ipAddress: getAuditIP(request),
    });
    return NextResponse.json({ success: true, data: ujian });
  } catch (error) {
    console.error('ERROR PUT UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memperbarui ujian' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));

    if (!id) {
      return NextResponse.json({ message: 'ID ujian wajib diisi' }, { status: 400 });
    }

    const ujian = await prisma.ujian.findUnique({
      where: { id },
      include: { _count: { select: { histori: true, jawaban: true } } },
    });
    if (!ujian) {
      return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    }
    if (ujian.isActive) {
      return NextResponse.json({ message: 'Ujian yang sedang aktif tidak dapat dihapus. Aktifkan ujian lain terlebih dahulu.' }, { status: 400 });
    }
    if (ujian._count.histori > 0 || ujian._count.jawaban > 0) {
      return NextResponse.json({ message: 'Ujian sudah memiliki hasil peserta sehingga tidak dapat dihapus.' }, { status: 400 });
    }

    // Soal dilepas (jadi soal global), bagian ikut dihapus
    await prisma.$transaction([
      prisma.soal.updateMany({ where: { ujianId: id }, data: { ujianId: null, bagianId: null } }),
      prisma.bagianUjian.deleteMany({ where: { ujianId: id } }),
      prisma.sesiUjian.deleteMany({ where: { ujianId: id } }),
      prisma.ujian.delete({ where: { id } }),
    ]);

    await createAuditLog({ action: AUDIT_ACTIONS.DELETE_UJIAN, target: `Ujian #${id} ${ujian.nama}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Ujian berhasil dihapus' });
  } catch (error) {
    console.error('ERROR DELETE UJIAN:', error);
    return NextResponse.json({ message: 'Gagal menghapus ujian' }, { status: 500 });
  }
}
