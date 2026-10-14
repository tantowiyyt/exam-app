import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';

const OPSI = ['A', 'B', 'C', 'D'];

function toId(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== '' && value !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Tentukan ujianId & bagianId akhir. Tanpa ujianId eksplisit, soal masuk ke ujian aktif
 * (agar langsung muncul saat peserta ujian). Bagian harus milik ujian yang sama.
 */
async function resolveTarget(ujianIdRaw: unknown, bagianIdRaw: unknown): Promise<{ ujianId: number | null; bagianId: number | null } | { error: string }> {
  let ujianId = toId(ujianIdRaw);
  const bagianId = toId(bagianIdRaw);

  if (bagianId) {
    const bagian = await prisma.bagianUjian.findUnique({ where: { id: bagianId } });
    if (!bagian) return { error: 'Bagian ujian tidak ditemukan' };
    if (ujianId && bagian.ujianId !== ujianId) return { error: 'Bagian tidak termasuk dalam ujian yang dipilih' };
    ujianId = bagian.ujianId;
  }

  if (!ujianId && ujianIdRaw === undefined) {
    const aktif = await prisma.ujian.findFirst({ where: { isActive: true }, select: { id: true } });
    ujianId = aktif?.id ?? null;
  }

  return { ujianId, bagianId };
}

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const [soal, ujianList] = await Promise.all([
      prisma.soal.findMany({
        orderBy: { id: 'desc' },
        include: { bagian: { select: { id: true, nama: true } }, ujian: { select: { id: true, nama: true } } },
      }),
      prisma.ujian.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, nama: true, isActive: true, bagian: { select: { id: true, nama: true }, orderBy: { urutan: 'asc' } } },
      }),
    ]);
    return NextResponse.json({ soal, ujianList });
  } catch (error) {
    console.error('ERROR PADA GET SOAL:', error);
    return NextResponse.json({ message: 'Gagal mengambil data soal' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();

    // Bulk import
    if (body.bulk && Array.isArray(body.bulk)) {
      const target = await resolveTarget(body.ujianId, body.bagianId);
      if ('error' in target) return NextResponse.json({ message: target.error }, { status: 400 });

      const results = { successCount: 0, failedCount: 0, errors: [] as string[] };
      const data = body.bulk.map((s: Record<string, string | number>) => ({
        pertanyaan: String(s.pertanyaan || '').trim(),
        opsiA: String(s.opsiA || '').trim(),
        opsiB: String(s.opsiB || '').trim(),
        opsiC: String(s.opsiC || '').trim(),
        opsiD: String(s.opsiD || '').trim(),
        jawabanBenar: String(s.jawabanBenar || 'A').trim().toUpperCase(),
        mataPelajaran: String(s.mataPelajaran || 'Umum').trim() || 'Umum',
        bobot: Number(s.bobot) > 0 ? Number(s.bobot) : 1,
        ujianId: target.ujianId,
        bagianId: target.bagianId,
      })).filter((s: Record<string, string | number | null>, i: number) => {
        if (!s.pertanyaan || !s.opsiA || !s.opsiB || !s.opsiC || !s.opsiD) {
          results.failedCount++;
          results.errors.push(`Data ke-${i + 1}: ada kolom yang kosong`);
          return false;
        }
        if (!OPSI.includes(String(s.jawabanBenar))) {
          results.failedCount++;
          results.errors.push(`Data ke-${i + 1}: kunci jawaban harus A/B/C/D`);
          return false;
        }
        return true;
      });

      if (data.length > 0) {
        await prisma.soal.createMany({ data });
        results.successCount = data.length;
      }

      await createAuditLog({
        action: AUDIT_ACTIONS.BULK_IMPORT_SOAL,
        target: `${results.successCount} soal`,
        details: { ujianId: target.ujianId, bagianId: target.bagianId, gagal: results.failedCount },
        ipAddress: getAuditIP(request),
      });
      return NextResponse.json({ success: true, data: results });
    }

    // Single insert
    const { pertanyaan, opsiA, opsiB, opsiC, opsiD, jawabanBenar, mataPelajaran, bobot } = body;
    if (!pertanyaan || !opsiA || !opsiB || !opsiC || !opsiD) {
      return NextResponse.json({ message: 'Pertanyaan dan semua opsi wajib diisi' }, { status: 400 });
    }
    if (!OPSI.includes(String(jawabanBenar).toUpperCase())) {
      return NextResponse.json({ message: 'Kunci jawaban harus A/B/C/D' }, { status: 400 });
    }

    const target = await resolveTarget(body.ujianId, body.bagianId);
    if ('error' in target) return NextResponse.json({ message: target.error }, { status: 400 });

    const newSoal = await prisma.soal.create({
      data: {
        pertanyaan, opsiA, opsiB, opsiC, opsiD,
        jawabanBenar: String(jawabanBenar).toUpperCase(),
        mataPelajaran: mataPelajaran || 'Umum',
        bobot: typeof bobot === 'number' && bobot > 0 ? bobot : 1,
        ujianId: target.ujianId,
        bagianId: target.bagianId,
      },
    });

    await createAuditLog({ action: AUDIT_ACTIONS.CREATE_SOAL, target: `Soal #${newSoal.id}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: newSoal });
  } catch (error) {
    console.error('ERROR PADA POST SOAL:', error);
    return NextResponse.json({ message: 'Gagal menambah soal' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { id, pertanyaan, opsiA, opsiB, opsiC, opsiD, jawabanBenar, mataPelajaran, bobot } = body;

    if (!toId(id)) return NextResponse.json({ message: 'ID tidak valid' }, { status: 400 });
    if (!OPSI.includes(String(jawabanBenar).toUpperCase())) {
      return NextResponse.json({ message: 'Kunci jawaban harus A/B/C/D' }, { status: 400 });
    }

    // Pada edit, ujianId kosong berarti soal global (tidak diisi otomatis ke ujian aktif)
    const target = await resolveTarget(body.ujianId ?? null, body.bagianId);
    if ('error' in target) return NextResponse.json({ message: target.error }, { status: 400 });

    const updatedSoal = await prisma.soal.update({
      where: { id: Number(id) },
      data: {
        pertanyaan, opsiA, opsiB, opsiC, opsiD,
        jawabanBenar: String(jawabanBenar).toUpperCase(),
        mataPelajaran: mataPelajaran || 'Umum',
        bobot: typeof bobot === 'number' && bobot > 0 ? bobot : 1,
        ujianId: target.ujianId,
        bagianId: target.bagianId,
      },
    });

    await createAuditLog({ action: AUDIT_ACTIONS.UPDATE_SOAL, target: `Soal #${updatedSoal.id}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: updatedSoal });
  } catch (error) {
    console.error('ERROR PADA PUT SOAL:', error);
    return NextResponse.json({ message: 'Gagal memperbarui soal' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // comma-separated IDs for bulk delete

    const idArray = ids
      ? ids.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : id ? [Number(id)].filter((n) => Number.isInteger(n) && n > 0) : [];

    if (idArray.length === 0) {
      return NextResponse.json({ message: 'ID tidak valid' }, { status: 400 });
    }

    // Soal yang sudah pernah dijawab tidak bisa dihapus (FK ke JawabanUjian)
    const dipakai = await prisma.jawabanUjian.findMany({
      where: { soalId: { in: idArray } },
      select: { soalId: true },
      distinct: ['soalId'],
    });
    if (dipakai.length > 0) {
      return NextResponse.json({
        message: `${dipakai.length} soal sudah memiliki jawaban peserta dan tidak dapat dihapus. Reset data ujian peserta terlebih dahulu.`,
      }, { status: 400 });
    }

    await prisma.soal.deleteMany({ where: { id: { in: idArray } } });

    await createAuditLog({
      action: idArray.length > 1 ? AUDIT_ACTIONS.BULK_DELETE_SOAL : AUDIT_ACTIONS.DELETE_SOAL,
      target: idArray.length > 1 ? `${idArray.length} soal` : `Soal #${idArray[0]}`,
      details: { ids: idArray },
      ipAddress: getAuditIP(request),
    });
    return NextResponse.json({ success: true, message: `${idArray.length} soal berhasil dihapus` });
  } catch (error) {
    console.error('ERROR PADA DELETE SOAL:', error);
    return NextResponse.json({ message: 'Gagal menghapus soal' }, { status: 500 });
  }
}
