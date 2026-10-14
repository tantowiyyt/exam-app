import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, teks } from '@/lib/lms';
import { soalDariBody, opsiSoal } from '@/lib/kuis';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Bank soal guru (lintas kelas, per nama mapel). Guru melihat soal miliknya + soal "bersama" guru lain;
// hanya pemilik (atau admin) yang bisa mengubah/menghapus. Soal diambil ke editor kuis/ujian sebagai salinan.

const MAKS_SIMPAN = 200;

async function staf() {
  const auth = await verifyLmsSession();
  if (!auth.ok) return { error: NextResponse.json({ message: auth.message }, { status: auth.status }) };
  if (auth.user.role === 'PESERTA') return { error: NextResponse.json({ message: 'Bank soal hanya untuk guru' }, { status: 403 }) };
  return { user: auth.user };
}

const bentuk = (s: { id: number; pemilikId: number; mapel: string; label: string; tipe: string; pertanyaan: string; opsi: string; kunci: string; pembahasan: string; bobot: number; bersama: boolean; updatedAt: Date; pemilik?: { nama: string } }, userId: number) => ({
  id: s.id, mapel: s.mapel, label: s.label, tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: opsiSoal(s), kunci: s.kunci, pembahasan: s.pembahasan,
  bobot: s.bobot, bersama: s.bersama, milikSaya: s.pemilikId === userId, pemilik: s.pemilik?.nama ?? '', updatedAt: s.updatedAt,
});

export async function GET(request: Request) {
  const a = await staf();
  if ('error' in a) return a.error;
  try {
    const { user } = a;
    const q = new URL(request.url).searchParams;
    const mapel = teks(q.get('mapel'), 100);
    const cari = teks(q.get('cari'), 100);
    const label = teks(q.get('label'), 100);
    const hanyaSaya = q.get('milik') === 'saya';
    const terlihat = user.role === 'ADMIN' ? {} : hanyaSaya ? { pemilikId: user.id } : { OR: [{ pemilikId: user.id }, { bersama: true }] };

    const soal = await prisma.bankSoal.findMany({
      where: {
        AND: [
          terlihat,
          ...(user.role === 'ADMIN' && hanyaSaya ? [{ pemilikId: user.id }] : []),
          ...(mapel ? [{ mapel }] : []),
          ...(label ? [{ label }] : []),
          ...(cari ? [{ pertanyaan: { contains: cari } }] : []),
        ],
      },
      include: { pemilik: { select: { nama: true } } },
      orderBy: [{ mapel: 'asc' }, { label: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    // Pilihan filter: mapel yang diajar + mapel yang ada di bank; label per mapel
    const [diajar, semuaMapel, semuaLabel] = await Promise.all([
      prisma.mapel.findMany({ where: user.role === 'ADMIN' ? {} : { guruId: user.id }, select: { nama: true }, distinct: ['nama'], orderBy: { nama: 'asc' } }),
      prisma.bankSoal.findMany({ where: terlihat, select: { mapel: true }, distinct: ['mapel'], orderBy: { mapel: 'asc' } }),
      prisma.bankSoal.findMany({ where: { AND: [terlihat, ...(mapel ? [{ mapel }] : [])] }, select: { label: true }, distinct: ['label'], orderBy: { label: 'asc' } }),
    ]);
    return NextResponse.json({
      soal: soal.map((s) => bentuk(s, user.id)),
      mapelList: [...new Set([...diajar.map((m) => m.nama), ...semuaMapel.map((m) => m.mapel)])].sort(),
      mapelDiajar: diajar.map((m) => m.nama),
      labelList: semuaLabel.map((l) => l.label).filter(Boolean),
    });
  } catch (error) {
    console.error('ERROR GET BANK SOAL:', error);
    return NextResponse.json({ message: 'Gagal memuat bank soal' }, { status: 500 });
  }
}

// Simpan banyak soal sekaligus: { mapel, label, bersama, soal: [...] }
export async function POST(request: Request) {
  const a = await staf();
  if ('error' in a) return a.error;
  try {
    const body = await request.json();
    const mapel = teks(body.mapel, 100);
    if (!mapel) return NextResponse.json({ message: 'Nama mapel wajib diisi' }, { status: 400 });
    const list = Array.isArray(body.soal) ? body.soal : [];
    if (!list.length) return NextResponse.json({ message: 'Tidak ada soal untuk disimpan' }, { status: 400 });
    if (list.length > MAKS_SIMPAN) return NextResponse.json({ message: `Maksimal ${MAKS_SIMPAN} soal sekali simpan` }, { status: 400 });
    const hasil = soalDariBody(list);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    const label = teks(body.label, 100);
    const data = hasil.soal.map((s) => ({
      pemilikId: a.user.id, mapel, label, bersama: body.bersama === true,
      tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: s.opsi, kunci: s.kunci, pembahasan: s.pembahasan, bobot: s.bobot,
    }));
    await prisma.bankSoal.createMany({ data });
    await createAuditLog({ action: 'SIMPAN_BANK_SOAL', target: `Bank soal ${mapel}`, details: { jumlah: data.length }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `${data.length} soal disimpan ke bank soal ${mapel}`, jumlah: data.length });
  } catch (error) {
    console.error('ERROR POST BANK SOAL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan ke bank soal' }, { status: 500 });
  }
}

// Ubah satu soal milik sendiri: { id, mapel, label, bersama, tipe, pertanyaan, opsi, kunci, pembahasan, bobot }
// atau ubah massal { ids, bersama?, label? }
export async function PUT(request: Request) {
  const a = await staf();
  if ('error' in a) return a.error;
  try {
    const body = await request.json();
    const milik = a.user.role === 'ADMIN' ? {} : { pemilikId: a.user.id };

    if (Array.isArray(body.ids)) {
      const ids = body.ids.map(Number).filter((x: number) => Number.isInteger(x));
      const data: Record<string, unknown> = {};
      if (typeof body.bersama === 'boolean') data.bersama = body.bersama;
      if (typeof body.label === 'string') data.label = teks(body.label, 100);
      const n = await prisma.bankSoal.updateMany({ where: { id: { in: ids }, ...milik }, data });
      return NextResponse.json({ success: true, message: `${n.count} soal diperbarui`, jumlah: n.count });
    }

    const lama = await prisma.bankSoal.findFirst({ where: { id: Number(body.id), ...milik } });
    if (!lama) return NextResponse.json({ message: 'Soal tidak ditemukan atau bukan milik Anda' }, { status: 404 });
    const hasil = soalDariBody([body]);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error.replace('Soal 1: ', '') }, { status: 400 });
    const s = hasil.soal[0];
    const mapel = teks(body.mapel, 100) || lama.mapel;
    const baru = await prisma.bankSoal.update({
      where: { id: lama.id },
      data: {
        mapel, label: body.label === undefined ? lama.label : teks(body.label, 100), bersama: typeof body.bersama === 'boolean' ? body.bersama : lama.bersama,
        tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: s.opsi, kunci: s.kunci, pembahasan: s.pembahasan, bobot: s.bobot,
      },
    });
    return NextResponse.json({ success: true, message: 'Soal diperbarui', data: bentuk(baru, a.user.id) });
  } catch (error) {
    console.error('ERROR PUT BANK SOAL:', error);
    return NextResponse.json({ message: 'Gagal memperbarui soal' }, { status: 500 });
  }
}

// Hapus soal milik sendiri: ?ids=1,2,3
export async function DELETE(request: Request) {
  const a = await staf();
  if ('error' in a) return a.error;
  try {
    const ids = String(new URL(request.url).searchParams.get('ids') ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);
    if (!ids.length) return NextResponse.json({ message: 'Pilih soal yang akan dihapus' }, { status: 400 });
    const n = await prisma.bankSoal.deleteMany({ where: { id: { in: ids }, ...(a.user.role === 'ADMIN' ? {} : { pemilikId: a.user.id }) } });
    await createAuditLog({ action: 'HAPUS_BANK_SOAL', target: 'Bank soal', details: { jumlah: n.count }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `${n.count} soal dihapus`, jumlah: n.count });
  } catch (error) {
    console.error('ERROR DELETE BANK SOAL:', error);
    return NextResponse.json({ message: 'Gagal menghapus soal' }, { status: 500 });
  }
}
