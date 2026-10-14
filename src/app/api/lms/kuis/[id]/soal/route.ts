import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';
import { soalDariBody, nilaiUlang } from '@/lib/kuis';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Simpan seluruh daftar soal kuis (urutan = urutan di daftar).
// Soal ber-id lama diperbarui, yang tidak ada di daftar dihapus; nilai percobaan yang sudah selesai dihitung ulang.
export async function PUT(request: Request, ctx: RouteContext<'/api/lms/kuis/[id]/soal'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const kuis = await prisma.kuis.findUnique({ where: { id: Number((await ctx.params).id) } });
    const akses = kuis ? await aksesMapel(auth.user, kuis.mapelId) : null;
    if (!kuis || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Kuis tidak ditemukan' }, { status: 404 });

    const body = await request.json();
    const hasil = soalDariBody(body.soal);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    if (kuis.terbit && hasil.soal.length === 0) {
      return NextResponse.json({ message: 'Kuis yang sudah terbit harus punya minimal satu soal' }, { status: 400 });
    }

    const lama = new Set((await prisma.soalKuis.findMany({ where: { kuisId: kuis.id }, select: { id: true } })).map((s) => s.id));
    const dipakai = new Set(hasil.soal.map((s) => s.id).filter((id): id is number => !!id && lama.has(id)));

    await prisma.$transaction([
      prisma.soalKuis.deleteMany({ where: { kuisId: kuis.id, id: { notIn: [...dipakai] } } }),
      ...hasil.soal.map(({ id, ...data }) =>
        id && dipakai.has(id)
          ? prisma.soalKuis.update({ where: { id }, data })
          : prisma.soalKuis.create({ data: { ...data, kuisId: kuis.id } }),
      ),
    ]);
    await nilaiUlang(kuis.id);
    await createAuditLog({ action: 'UPDATE_SOAL_KUIS', target: `Kuis #${kuis.id} ${kuis.judul}`, details: { jumlah: hasil.soal.length }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `${hasil.soal.length} soal disimpan` });
  } catch (error) {
    console.error('ERROR SOAL KUIS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan soal' }, { status: 500 });
  }
}
