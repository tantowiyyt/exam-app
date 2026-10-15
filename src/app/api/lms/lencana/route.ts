import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRole } from '@/lib/admin-auth';
import { aksesMapel, teks, mapelPengguna } from '@/lib/lms';
import { semesterAktif, semesterDipilih, daftarSemester } from '@/lib/semester';
import { whereAnggota } from '@/lib/anggota';
import { anakMilik } from '@/lib/ortu';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { JENIS_LENCANA, lencanaOtomatis, lencanaGuru } from '@/lib/lencana';

// Lencana. GET siswa: miliknya | orang tua: ?anak=id | guru/admin: ?mapelId= (siswa kelas + lencana) atau daftar mapel.
// POST (pengelola mapel) { mapelId, siswa: id[], jenis, judul?, catatan? } | DELETE ?id= (pemberi / admin)

export async function GET(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU', 'PESERTA', 'ORANGTUA']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    const q = new URL(request.url).searchParams;
    const semester = await semesterDipilih(q.get('semester'));
    const semesterList = (await daftarSemester()).map((s) => ({ id: s.id, label: s.label, aktif: s.aktif }));
    const base = { semester: { id: semester.id, label: semester.label, aktif: semester.aktif }, semesterList, jenis: JENIS_LENCANA };

    if (user.role === 'PESERTA' || user.role === 'ORANGTUA') {
      let siswaId = user.id;
      if (user.role === 'ORANGTUA') {
        const anak = await anakMilik(user.id, Number(q.get('anak')));
        if (!anak) return NextResponse.json({ message: 'Data anak tidak ditemukan' }, { status: 404 });
        siswaId = anak.id;
      }
      const [otomatis, dariGuru] = await Promise.all([lencanaOtomatis(siswaId, semester), lencanaGuru([siswaId], semester.id)]);
      return NextResponse.json({ ...base, peran: 'siswa', otomatis, dariGuru });
    }

    const mapelId = Number(q.get('mapelId'));
    if (!mapelId) {
      const mapel = await mapelPengguna(user);
      return NextResponse.json({ ...base, peran: 'kelola', mapelList: mapel.map((m) => ({ id: m.id, nama: m.nama, kelas: m.kelas.nama })) });
    }
    const akses = await aksesMapel(user, mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan mapel Anda' }, { status: 404 });
    const siswa = await prisma.user.findMany({ where: await whereAnggota(akses.mapel.kelas.nama, semester), select: { id: true, nomorPeserta: true, nama: true }, orderBy: { nama: 'asc' } });
    const [dariGuru, otomatis] = await Promise.all([
      lencanaGuru(siswa.map((s) => s.id), semester.id),
      // Lencana otomatis versi ringan (tanpa "Tuntas Semua") agar cepat untuk satu kelas
      Promise.all(siswa.map(async (s) => [s.id, (await lencanaOtomatis(s.id, semester, false)).filter((l) => l.dapat).map((l) => ({ kode: l.kode, judul: l.judul, ikon: l.ikon }))] as const)),
    ]);
    const auto = new Map(otomatis);
    return NextResponse.json({
      ...base, peran: 'kelola',
      mapel: { id: akses.mapel.id, nama: akses.mapel.nama, kelas: akses.mapel.kelas.nama },
      siswa: siswa.map((s) => ({ ...s, otomatis: auto.get(s.id) ?? [], dariGuru: dariGuru.filter((l) => l.userId === s.id).map((l) => ({ ...l, bisaHapus: user.role === 'ADMIN' || l.olehId === user.id })) })),
    });
  } catch (error) {
    console.error('ERROR GET LENCANA:', error);
    return NextResponse.json({ message: 'Gagal memuat lencana' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan mapel Anda' }, { status: 404 });
    const jenis = String(body.jenis ?? '');
    if (!JENIS_LENCANA[jenis]) return NextResponse.json({ message: 'Jenis lencana tidak dikenal' }, { status: 400 });
    const judul = teks(body.judul, 60) || JENIS_LENCANA[jenis].judul;
    const ids = [...new Set((Array.isArray(body.siswa) ? body.siswa : []).map(Number).filter(Number.isInteger))] as number[];
    if (!ids.length || ids.length > 100) return NextResponse.json({ message: 'Pilih 1–100 siswa' }, { status: 400 });
    const semester = await semesterAktif();
    const anggota = await prisma.user.count({ where: { AND: [await whereAnggota(akses.mapel.kelas.nama, semester), { id: { in: ids } }] } });
    if (anggota !== ids.length) return NextResponse.json({ message: 'Siswa yang dipilih harus anggota kelas ini' }, { status: 400 });
    await prisma.lencanaSiswa.createMany({
      data: ids.map((userId) => ({ userId, mapelId: akses.mapel.id, semesterId: semester.id, jenis, judul, catatan: teks(body.catatan, 300), olehId: auth.user.id })),
    });
    await createAuditLog({ action: 'BERI_LENCANA', target: `${judul} · ${akses.mapel.nama}`, details: { siswa: ids.length }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `Lencana "${judul}" diberikan kepada ${ids.length} siswa` });
  } catch (error) {
    console.error('ERROR POST LENCANA:', error);
    return NextResponse.json({ message: 'Gagal memberi lencana' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const l = await prisma.lencanaSiswa.findUnique({ where: { id: Number(new URL(request.url).searchParams.get('id')) } });
    if (!l || (auth.user.role !== 'ADMIN' && l.olehId !== auth.user.id)) return NextResponse.json({ message: 'Lencana tidak ditemukan' }, { status: 404 });
    await prisma.lencanaSiswa.delete({ where: { id: l.id } });
    return NextResponse.json({ success: true, message: 'Lencana dicabut' });
  } catch (error) {
    console.error('ERROR DELETE LENCANA:', error);
    return NextResponse.json({ message: 'Gagal mencabut lencana' }, { status: 500 });
  }
}
