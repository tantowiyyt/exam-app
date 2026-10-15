import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, teks } from '@/lib/lms';
import { verifyAdminSession } from '@/lib/admin-auth';
import { semesterAktif, semesterDipilih, daftarSemester } from '@/lib/semester';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Jadwal pelajaran mingguan (roster) per semester. Hari 1 = Senin ... 7 = Minggu, jam "HH:MM".
// GET: siswa = kelasnya; guru = jadwal mengajarnya (atau ?kelas=id kelas yang ia ajar); admin = ?kelas=id atau ?guru=id.
// POST/PUT/DELETE: admin. Ditolak bila bentrok dengan jadwal lain di kelas yang sama atau guru yang sama.

const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function isiJadwal(where: object, semesterId: number) {
  const list = await prisma.jadwalPelajaran.findMany({ where: { ...where, semesterId }, orderBy: [{ hari: 'asc' }, { jamMulai: 'asc' }] });
  const mapel = await prisma.mapel.findMany({
    where: { id: { in: [...new Set(list.map((j) => j.mapelId))] } },
    select: { id: true, nama: true, kelas: { select: { id: true, nama: true } }, guru: { select: { id: true, nama: true } } },
  });
  const m = new Map(mapel.map((x) => [x.id, x]));
  return list.filter((j) => m.has(j.mapelId)).map((j) => {
    const x = m.get(j.mapelId)!;
    return { id: j.id, hari: j.hari, jamMulai: j.jamMulai, jamSelesai: j.jamSelesai, ruang: j.ruang, mapel: { id: x.id, nama: x.nama }, kelas: x.kelas, guru: x.guru };
  });
}

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    const q = new URL(request.url).searchParams;
    const semester = await semesterDipilih(q.get('semester'));
    const semesterList = (await daftarSemester()).map((s) => ({ id: s.id, label: s.label, aktif: s.aktif }));
    const base = { semester: { id: semester.id, label: semester.label, aktif: semester.aktif }, semesterList };

    if (user.role === 'PESERTA') {
      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { kelas: true } });
      const kelas = u?.kelas ? await prisma.kelas.findUnique({ where: { nama: u.kelas } }) : null;
      return NextResponse.json({ ...base, peran: 'siswa', judul: kelas?.nama ?? '', jadwal: kelas ? await isiJadwal({ kelasId: kelas.id }, semester.id) : [] });
    }

    const admin = user.role === 'ADMIN';
    const [kelasList, guruList] = await Promise.all([
      prisma.kelas.findMany({ orderBy: { nama: 'asc' }, select: { id: true, nama: true, mapel: { select: { id: true, nama: true, guruId: true, guru: { select: { nama: true } } }, orderBy: { nama: 'asc' } } } }),
      admin ? prisma.user.findMany({ where: { role: 'GURU' }, select: { id: true, nama: true }, orderBy: { nama: 'asc' } }) : Promise.resolve([]),
    ]);
    const kelasBoleh = admin ? kelasList : kelasList.filter((k) => k.mapel.some((m) => m.guruId === user.id));
    const kelasId = Number(q.get('kelas'));
    const guruId = admin ? Number(q.get('guru')) : 0;
    let jadwal;
    let judul;
    if (kelasId) {
      const k = kelasBoleh.find((x) => x.id === kelasId);
      if (!k) return NextResponse.json({ message: 'Kelas tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
      jadwal = await isiJadwal({ kelasId }, semester.id);
      judul = `Kelas ${k.nama}`;
    } else {
      const id = guruId || (admin ? 0 : user.id);
      const mapelIds = kelasList.flatMap((k) => k.mapel).filter((m) => m.guruId === id).map((m) => m.id);
      jadwal = id ? await isiJadwal({ mapelId: { in: mapelIds } }, semester.id) : [];
      judul = id ? (id === user.id ? 'Jadwal Mengajar Saya' : `Guru ${guruList.find((g) => g.id === id)?.nama ?? ''}`) : '';
    }
    return NextResponse.json({
      ...base, peran: admin ? 'admin' : 'guru', judul, jadwal,
      kelasList: kelasBoleh.map((k) => ({ id: k.id, nama: k.nama, mapel: admin ? k.mapel.map((m) => ({ id: m.id, nama: m.nama, guru: m.guru?.nama ?? '' })) : [] })),
      guruList,
    });
  } catch (error) {
    console.error('ERROR GET JADWAL:', error);
    return NextResponse.json({ message: 'Gagal memuat jadwal' }, { status: 500 });
  }
}

async function validasi(body: Record<string, unknown>, abaikanId?: number) {
  const mapel = await prisma.mapel.findUnique({ where: { id: Number(body.mapelId) }, select: { id: true, kelasId: true, guruId: true, nama: true } });
  if (!mapel) return { error: 'Mapel tidak ditemukan' };
  const hari = Number(body.hari);
  if (!Number.isInteger(hari) || hari < 1 || hari > 7) return { error: 'Hari tidak valid' };
  const jamMulai = String(body.jamMulai ?? '');
  const jamSelesai = String(body.jamSelesai ?? '');
  if (!JAM.test(jamMulai) || !JAM.test(jamSelesai)) return { error: 'Jam harus berformat JJ:MM, mis. 07:30' };
  if (jamMulai >= jamSelesai) return { error: 'Jam selesai harus setelah jam mulai' };
  const semester = await semesterAktif();
  const idBeda = abaikanId ? { id: { not: abaikanId } } : {};
  const irisan = { hari, semesterId: semester.id, jamMulai: { lt: jamSelesai }, jamSelesai: { gt: jamMulai }, ...idBeda };
  const bentrokKelas = await prisma.jadwalPelajaran.findFirst({ where: { ...irisan, kelasId: mapel.kelasId } });
  if (bentrokKelas) return { error: `Bentrok dengan jadwal lain di kelas ini (${bentrokKelas.jamMulai}–${bentrokKelas.jamSelesai})` };
  if (mapel.guruId) {
    const mapelGuru = (await prisma.mapel.findMany({ where: { guruId: mapel.guruId }, select: { id: true } })).map((m) => m.id);
    const bentrokGuru = await prisma.jadwalPelajaran.findFirst({ where: { ...irisan, mapelId: { in: mapelGuru } } });
    if (bentrokGuru) {
      const k = await prisma.mapel.findUnique({ where: { id: bentrokGuru.mapelId }, select: { nama: true, kelas: { select: { nama: true } } } });
      return { error: `Guru pengampu sudah mengajar ${k?.nama ?? ''} di ${k?.kelas.nama ?? ''} pada ${bentrokGuru.jamMulai}–${bentrokGuru.jamSelesai}` };
    }
  }
  return { data: { mapelId: mapel.id, kelasId: mapel.kelasId, hari, jamMulai, jamSelesai, ruang: teks(body.ruang, 50), semesterId: semester.id } };
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const v = await validasi(body);
    if ('error' in v) return NextResponse.json({ message: v.error }, { status: 400 });
    const data = await prisma.jadwalPelajaran.create({ data: v.data });
    await createAuditLog({ action: 'CREATE_JADWAL', target: `Jadwal #${data.id}`, details: v.data, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR POST JADWAL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan jadwal' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!(await prisma.jadwalPelajaran.findUnique({ where: { id } }))) return NextResponse.json({ message: 'Jadwal tidak ditemukan' }, { status: 404 });
    const v = await validasi(body, id);
    if ('error' in v) return NextResponse.json({ message: v.error }, { status: 400 });
    const data = await prisma.jadwalPelajaran.update({ where: { id }, data: v.data });
    await createAuditLog({ action: 'UPDATE_JADWAL', target: `Jadwal #${id}`, details: v.data, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR PUT JADWAL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan jadwal' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const n = await prisma.jadwalPelajaran.deleteMany({ where: { id } });
    if (!n.count) return NextResponse.json({ message: 'Jadwal tidak ditemukan' }, { status: 404 });
    await createAuditLog({ action: 'DELETE_JADWAL', target: `Jadwal #${id}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Jadwal dihapus' });
  } catch (error) {
    console.error('ERROR DELETE JADWAL:', error);
    return NextResponse.json({ message: 'Gagal menghapus jadwal' }, { status: 500 });
  }
}
