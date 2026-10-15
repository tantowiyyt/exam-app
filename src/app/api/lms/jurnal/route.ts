import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRole } from '@/lib/admin-auth';
import { aksesMapel, teks } from '@/lib/lms';
import { semesterAktif, semesterDipilih, daftarSemester } from '@/lib/semester';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Jurnal / agenda mengajar guru per pertemuan (untuk supervisi). Siswa tidak hadir diambil dari pertemuan
// presensi yang ditautkan — bila tidak dipilih, otomatis pertemuan presensi mapel itu pada tanggal yang sama.
// GET ?semester&mapelId&guru(admin)&dari&sampai. Guru: jurnalnya sendiri. Admin: semua (supervisi).

const awalHari = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

async function tautPresensi(mapelId: number, tanggal: Date, pilihan: unknown) {
  if (pilihan) {
    const s = await prisma.sesiPresensi.findUnique({ where: { id: Number(pilihan) }, select: { id: true, mapelId: true } });
    return s?.mapelId === mapelId ? s.id : undefined;
  }
  const a = awalHari(tanggal);
  const s = await prisma.sesiPresensi.findFirst({ where: { mapelId, tanggal: { gte: a, lt: new Date(a.getTime() + 86400000) } }, orderBy: { tanggal: 'asc' }, select: { id: true } });
  return s?.id ?? null;
}

function dataJurnal(body: Record<string, unknown>) {
  const materi = teks(body.materi, 1000);
  if (!materi) return { error: 'Materi / kompetensi wajib diisi' } as const;
  const tanggal = new Date(String(body.tanggal ?? ''));
  if (isNaN(tanggal.getTime())) return { error: 'Tanggal tidak valid' } as const;
  return { data: { tanggal, materi, jamKe: teks(body.jamKe, 30), kegiatan: teks(body.kegiatan, 2000), catatan: teks(body.catatan, 2000) } } as const;
}

export async function GET(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    const admin = user.role === 'ADMIN';
    const q = new URL(request.url).searchParams;
    const semester = await semesterDipilih(q.get('semester'));
    const where: Record<string, unknown> = { semesterId: semester.id };
    if (!admin) where.guruId = user.id;
    else if (Number(q.get('guru'))) where.guruId = Number(q.get('guru'));
    if (Number(q.get('mapelId'))) where.mapelId = Number(q.get('mapelId'));
    const dari = q.get('dari') ? new Date(q.get('dari')!) : null;
    const sampai = q.get('sampai') ? new Date(q.get('sampai')!) : null;
    if ((dari && !isNaN(dari.getTime())) || (sampai && !isNaN(sampai.getTime()))) {
      where.tanggal = { ...(dari && !isNaN(dari.getTime()) ? { gte: awalHari(dari) } : {}), ...(sampai && !isNaN(sampai.getTime()) ? { lt: new Date(awalHari(sampai).getTime() + 86400000) } : {}) };
    }
    const list = await prisma.jurnalMengajar.findMany({ where, orderBy: [{ tanggal: 'desc' }, { id: 'desc' }], take: 1000 });

    const [mapel, guru, presensi] = await Promise.all([
      prisma.mapel.findMany({ where: admin ? {} : { guruId: user.id }, select: { id: true, nama: true, guruId: true, kelas: { select: { nama: true } } }, orderBy: [{ kelas: { nama: 'asc' } }, { nama: 'asc' }] }),
      prisma.user.findMany({ where: { id: { in: [...new Set(list.map((j) => j.guruId))] } }, select: { id: true, nama: true } }),
      prisma.presensi.findMany({
        where: { sesiId: { in: list.map((j) => j.sesiPresensiId).filter((x): x is number => !!x) }, status: { not: 'H' } },
        select: { sesiId: true, status: true, keterangan: true, user: { select: { nama: true } } },
      }),
    ]);
    const m = new Map(mapel.map((x) => [x.id, x]));
    const extra = list.filter((j) => !m.has(j.mapelId)).map((j) => j.mapelId);
    if (extra.length) for (const x of await prisma.mapel.findMany({ where: { id: { in: extra } }, select: { id: true, nama: true, guruId: true, kelas: { select: { nama: true } } } })) m.set(x.id, x);
    const g = new Map(guru.map((x) => [x.id, x.nama]));
    const semesterList = (await daftarSemester()).map((s) => ({ id: s.id, label: s.label, aktif: s.aktif }));

    return NextResponse.json({
      admin,
      semester: { id: semester.id, label: semester.label, aktif: semester.aktif },
      semesterList,
      mapelList: mapel.map((x) => ({ id: x.id, nama: x.nama, kelas: x.kelas.nama })),
      guruList: admin ? await prisma.user.findMany({ where: { role: 'GURU' }, select: { id: true, nama: true }, orderBy: { nama: 'asc' } }) : [],
      jurnal: list.map((j) => ({
        id: j.id, tanggal: j.tanggal, jamKe: j.jamKe, materi: j.materi, kegiatan: j.kegiatan, catatan: j.catatan, sesiPresensiId: j.sesiPresensiId,
        mapel: { id: j.mapelId, nama: m.get(j.mapelId)?.nama ?? '?', kelas: m.get(j.mapelId)?.kelas.nama ?? '' },
        guru: g.get(j.guruId) ?? '',
        tidakHadir: presensi.filter((p) => p.sesiId === j.sesiPresensiId).map((p) => ({ nama: p.user.nama, status: p.status, keterangan: p.keterangan })),
      })),
    });
  } catch (error) {
    console.error('ERROR GET JURNAL:', error);
    return NextResponse.json({ message: 'Gagal memuat jurnal' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan mapel Anda' }, { status: 404 });
    const v = dataJurnal(body);
    if ('error' in v) return NextResponse.json({ message: v.error }, { status: 400 });
    const sesi = await tautPresensi(akses.mapel.id, v.data.tanggal, body.sesiPresensiId);
    if (sesi === undefined) return NextResponse.json({ message: 'Pertemuan presensi bukan milik mapel ini' }, { status: 400 });
    const guruId = auth.user.role === 'GURU' ? auth.user.id : akses.mapel.guruId ?? auth.user.id;
    const data = await prisma.jurnalMengajar.create({ data: { ...v.data, mapelId: akses.mapel.id, guruId, sesiPresensiId: sesi, semesterId: (await semesterAktif()).id } });
    await createAuditLog({ action: 'CREATE_JURNAL', target: `Jurnal #${data.id} ${akses.mapel.nama}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR POST JURNAL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan jurnal' }, { status: 500 });
  }
}

async function milik(user: { id: number; role: string }, id: number) {
  const j = await prisma.jurnalMengajar.findUnique({ where: { id } });
  if (!j || (user.role !== 'ADMIN' && j.guruId !== user.id)) return null;
  return j;
}

export async function PUT(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const j = await milik(auth.user, Number(body.id));
    if (!j) return NextResponse.json({ message: 'Jurnal tidak ditemukan' }, { status: 404 });
    const v = dataJurnal(body);
    if ('error' in v) return NextResponse.json({ message: v.error }, { status: 400 });
    const sesi = await tautPresensi(j.mapelId, v.data.tanggal, body.sesiPresensiId);
    if (sesi === undefined) return NextResponse.json({ message: 'Pertemuan presensi bukan milik mapel ini' }, { status: 400 });
    const data = await prisma.jurnalMengajar.update({ where: { id: j.id }, data: { ...v.data, sesiPresensiId: sesi } });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR PUT JURNAL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan jurnal' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const j = await milik(auth.user, Number(new URL(request.url).searchParams.get('id')));
    if (!j) return NextResponse.json({ message: 'Jurnal tidak ditemukan' }, { status: 404 });
    await prisma.jurnalMengajar.delete({ where: { id: j.id } });
    return NextResponse.json({ success: true, message: 'Jurnal dihapus' });
  } catch (error) {
    console.error('ERROR DELETE JURNAL:', error);
    return NextResponse.json({ message: 'Gagal menghapus jurnal' }, { status: 500 });
  }
}
