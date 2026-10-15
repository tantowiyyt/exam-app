import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { daftarSemester, labelSemester, NAMA_SEMESTER, validTahunAjaran } from '@/lib/semester';
import { arsipkanSemesterAktif } from '@/lib/anggota';

// Tahun ajaran & semester (admin). Tepat satu semester aktif.

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const list = await daftarSemester();
    const ids = list.map((s) => s.id);
    // Jumlah data per semester (untuk info & larangan hapus)
    const [tugas, kuis, presensi, ujian] = await Promise.all([
      prisma.tugas.groupBy({ by: ['semesterId'], where: { semesterId: { in: ids } }, _count: true }),
      prisma.kuis.groupBy({ by: ['semesterId'], where: { semesterId: { in: ids } }, _count: true }),
      prisma.sesiPresensi.groupBy({ by: ['semesterId'], where: { semesterId: { in: ids } }, _count: true }),
      prisma.ujianManual.groupBy({ by: ['semesterId'], where: { semesterId: { in: ids } }, _count: true }),
    ]);
    const n = (rows: { semesterId: number | null; _count: number }[], id: number) => rows.find((r) => r.semesterId === id)?._count ?? 0;
    return NextResponse.json({
      semester: list.map((s) => ({ ...s, jumlah: { tugas: n(tugas, s.id), kuis: n(kuis, s.id), presensi: n(presensi, s.id), ujian: n(ujian, s.id) } })),
    });
  } catch (error) {
    console.error('ERROR GET SEMESTER:', error);
    return NextResponse.json({ message: 'Gagal memuat semester' }, { status: 500 });
  }
}

// Tambah semester {tahunAjaran, semester, aktif?}
export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const tahunAjaran = validTahunAjaran(body.tahunAjaran);
    if (!tahunAjaran) return NextResponse.json({ message: 'Tahun ajaran harus berformat 2026/2027' }, { status: 400 });
    if (!(NAMA_SEMESTER as readonly string[]).includes(body.semester)) return NextResponse.json({ message: 'Semester harus Ganjil atau Genap' }, { status: 400 });
    await daftarSemester(); // pastikan semester awal sudah ada (data lama sudah punya semester)
    if (await prisma.semester.findUnique({ where: { tahunAjaran_semester: { tahunAjaran, semester: body.semester } } })) {
      return NextResponse.json({ message: 'Semester itu sudah ada' }, { status: 400 });
    }
    if (body.aktif === true) await arsipkanSemesterAktif();
    const baru = await prisma.$transaction(async (tx) => {
      if (body.aktif === true) await tx.semester.updateMany({ data: { aktif: false } });
      return tx.semester.create({ data: { tahunAjaran, semester: body.semester, aktif: body.aktif === true } });
    });
    await createAuditLog({ action: 'CREATE_SEMESTER', target: labelSemester(baru), ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `Semester ${labelSemester(baru)} ditambahkan${baru.aktif ? ' dan diaktifkan' : ''}`, data: baru });
  } catch (error) {
    console.error('ERROR POST SEMESTER:', error);
    return NextResponse.json({ message: 'Gagal menambah semester' }, { status: 500 });
  }
}

// Aktifkan semester {id}
export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const s = await prisma.semester.findUnique({ where: { id: Number(body.id) } });
    if (!s) return NextResponse.json({ message: 'Semester tidak ditemukan' }, { status: 404 });
    // Keanggotaan kelas semester yang ditinggalkan diarsipkan (data tahun lalu tetap utuh setelah kenaikan kelas)
    await arsipkanSemesterAktif();
    await prisma.$transaction([
      prisma.semester.updateMany({ data: { aktif: false } }),
      prisma.semester.update({ where: { id: s.id }, data: { aktif: true } }),
    ]);
    await createAuditLog({ action: 'AKTIFKAN_SEMESTER', target: labelSemester(s), ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `Semester aktif: ${labelSemester(s)}` });
  } catch (error) {
    console.error('ERROR PUT SEMESTER:', error);
    return NextResponse.json({ message: 'Gagal mengaktifkan semester' }, { status: 500 });
  }
}

// Hapus semester yang belum berisi data & tidak aktif
export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const s = await prisma.semester.findUnique({ where: { id } });
    if (!s) return NextResponse.json({ message: 'Semester tidak ditemukan' }, { status: 404 });
    if (s.aktif) return NextResponse.json({ message: 'Semester aktif tidak bisa dihapus. Aktifkan semester lain dulu.' }, { status: 400 });
    const where = { semesterId: id };
    const isi = (await Promise.all([prisma.tugas.count({ where }), prisma.kuis.count({ where }), prisma.sesiPresensi.count({ where }), prisma.ujianManual.count({ where })])).reduce((a, b) => a + b, 0);
    if (isi) return NextResponse.json({ message: `Semester masih berisi ${isi} tugas/kuis/pertemuan/ujian` }, { status: 400 });
    await prisma.$transaction([
      prisma.anggotaKelas.deleteMany({ where }),
      prisma.dataRapor.deleteMany({ where }),
      prisma.semester.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_SEMESTER', target: labelSemester(s), ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Semester dihapus' });
  } catch (error) {
    console.error('ERROR DELETE SEMESTER:', error);
    return NextResponse.json({ message: 'Gagal menghapus semester' }, { status: 500 });
  }
}
