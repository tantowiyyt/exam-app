import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks } from '@/lib/lms';
import { semesterDipilih } from '@/lib/semester';
import { hitungRekapMapel } from '@/lib/rekap';
import { getInstansi } from '@/lib/pengaturan-aplikasi';
import { batasPredikat, predikat, saranDeskripsi } from '@/lib/rapor';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Deskripsi capaian rapor per siswa untuk satu mapel & semester (ditulis guru pengampu / admin).
// GET: nilai akhir, predikat, deskripsi tersimpan, dan saran otomatis. PUT: simpan banyak deskripsi.

async function siapkan(request: Request, ctx: RouteContext<'/api/lms/mapel/[id]/deskripsi'>, semesterParam: unknown) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return { error: NextResponse.json({ message: auth.message }, { status: auth.status }) };
  const akses = await aksesMapel(auth.user, Number((await ctx.params).id));
  if (akses?.peran !== 'kelola') return { error: NextResponse.json({ message: 'Mapel tidak ditemukan atau Anda tidak mengelolanya' }, { status: 404 }) };
  const semester = await semesterDipilih(semesterParam === undefined || semesterParam === null ? null : String(semesterParam));
  return { auth, akses, semester };
}

export async function GET(request: Request, ctx: RouteContext<'/api/lms/mapel/[id]/deskripsi'>) {
  try {
    const s = await siapkan(request, ctx, new URL(request.url).searchParams.get('semester'));
    if ('error' in s) return s.error;
    const { akses, semester } = s;
    const siswa = await prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true, nomorPeserta: true, nama: true }, orderBy: { nama: 'asc' } });
    const [rekap, tersimpan, instansi] = await Promise.all([
      hitungRekapMapel(akses.mapel, siswa, semester, { kelola: true }),
      prisma.deskripsiRapor.findMany({ where: { mapelId: akses.mapel.id, semesterId: semester.id } }),
      getInstansi(),
    ]);
    const batas = batasPredikat(instansi);
    const kolom = new Map(rekap.kolom.map((k) => [k.kunci, k]));
    return NextResponse.json({
      semester: { id: semester.id, label: semester.label, aktif: semester.aktif },
      batas,
      siswa: rekap.baris.map((b) => {
        const item = Object.entries(b.nilai)
          .filter((e): e is [string, number] => typeof e[1] === 'number')
          .map(([k, v]) => ({ judul: kolom.get(k)!.judul, persen: (v / kolom.get(k)!.maks) * 100 }));
        return {
          siswa: b.siswa,
          nilaiAkhir: b.rataRata,
          predikat: predikat(b.rataRata, batas),
          deskripsi: tersimpan.find((t) => t.userId === b.siswa.id)?.deskripsi ?? '',
          saran: saranDeskripsi(b.siswa.nama, b.rataRata, item, batas, akses.mapel.nama),
        };
      }),
    });
  } catch (error) {
    console.error('ERROR GET DESKRIPSI RAPOR:', error);
    return NextResponse.json({ message: 'Gagal memuat deskripsi rapor' }, { status: 500 });
  }
}

// { semester?, data: [{ userId, deskripsi }] } — deskripsi kosong = hapus
export async function PUT(request: Request, ctx: RouteContext<'/api/lms/mapel/[id]/deskripsi'>) {
  try {
    const body = await request.json();
    const s = await siapkan(request, ctx, body.semester);
    if ('error' in s) return s.error;
    const { akses, semester } = s;
    const list: unknown[] = Array.isArray(body.data) ? body.data : [];
    if (list.length > 1000) return NextResponse.json({ message: 'Terlalu banyak data' }, { status: 400 });
    const anggota = new Set((await prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true } })).map((u) => u.id));
    const ops = [];
    for (const raw of list) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const userId = Number(r.userId);
      if (!anggota.has(userId)) return NextResponse.json({ message: 'Ada siswa yang bukan anggota kelas ini' }, { status: 400 });
      const where = { mapelId_userId_semesterId: { mapelId: akses.mapel.id, userId, semesterId: semester.id } };
      const deskripsi = teks(r.deskripsi, 1000);
      ops.push(deskripsi
        ? prisma.deskripsiRapor.upsert({ where, update: { deskripsi }, create: { mapelId: akses.mapel.id, userId, semesterId: semester.id, deskripsi } })
        : prisma.deskripsiRapor.deleteMany({ where: { mapelId: akses.mapel.id, userId, semesterId: semester.id } }));
    }
    await prisma.$transaction(ops);
    await createAuditLog({ action: 'DESKRIPSI_RAPOR', target: `Mapel #${akses.mapel.id} ${akses.mapel.nama}`, details: { jumlah: ops.length, semester: semester.label }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `${ops.length} deskripsi disimpan` });
  } catch (error) {
    console.error('ERROR PUT DESKRIPSI RAPOR:', error);
    return NextResponse.json({ message: 'Gagal menyimpan deskripsi rapor' }, { status: 500 });
  }
}
