import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { teks, opsHapusDataLms } from '@/lib/lms';

// Akun orang tua (role ORANGTUA) & tautan ke anak (admin).
// GET ?q=  | POST { aksi: 'buat', username, nama, password, anak: NIS[] } | { aksi: 'massal', kelas, password: 'nis'|'tanggal'|'acak' }
// PUT { id, nama?, password?, anak?: NIS[] } | DELETE ?id=

const HURUF = 'abcdefghjkmnpqrstuvwxyz23456789';
const acak = () => Array.from({ length: 8 }, () => HURUF[randomInt(HURUF.length)]).join('');
const ddmmyyyy = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}` : '');

/** NIS -> id siswa; error bila ada NIS yang tidak dikenal. */
async function idAnak(nisList: unknown): Promise<number[] | { error: string }> {
  const nis = [...new Set((Array.isArray(nisList) ? nisList : String(nisList ?? '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean))];
  if (nis.length > 10) return { error: 'Maksimal 10 anak per akun orang tua' };
  const siswa = await prisma.user.findMany({ where: { nomorPeserta: { in: nis }, role: 'PESERTA' }, select: { id: true, nomorPeserta: true } });
  const hilang = nis.filter((n) => !siswa.some((s) => s.nomorPeserta === n));
  if (hilang.length) return { error: `NIS siswa tidak ditemukan: ${hilang.join(', ')}` };
  return siswa.map((s) => s.id);
}

export async function GET(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const q = teks(new URL(request.url).searchParams.get('q'), 50);
    const [ortu, link, kelas] = await Promise.all([
      prisma.user.findMany({ where: { role: 'ORANGTUA' }, select: { id: true, nomorPeserta: true, nama: true, noHp: true, email: true, createdAt: true }, orderBy: { nama: 'asc' } }),
      prisma.orangTuaSiswa.findMany({ select: { orangTuaId: true, siswaId: true } }),
      prisma.kelas.findMany({ select: { nama: true }, orderBy: { nama: 'asc' } }),
    ]);
    const siswa = await prisma.user.findMany({ where: { id: { in: [...new Set(link.map((l) => l.siswaId))] } }, select: { id: true, nomorPeserta: true, nama: true, kelas: true } });
    const daftar = ortu.map((o) => ({ ...o, anak: link.filter((l) => l.orangTuaId === o.id).map((l) => siswa.find((s) => s.id === l.siswaId)).filter(Boolean) }));
    const cocok = (o: (typeof daftar)[number]) => !q || [o.nama, o.nomorPeserta, ...o.anak.map((a) => `${a!.nama} ${a!.nomorPeserta} ${a!.kelas}`)].join(' ').toLowerCase().includes(q.toLowerCase());
    // Jumlah siswa per kelas yang belum punya akun orang tua (untuk buat massal)
    const punya = new Set(link.map((l) => l.siswaId));
    const tanpa = await prisma.user.groupBy({ by: ['kelas'], where: { role: 'PESERTA', kelas: { not: '' }, id: { notIn: [...punya] } }, _count: true });
    return NextResponse.json({
      orangTua: daftar.filter(cocok),
      kelas: kelas.map((k) => ({ nama: k.nama, tanpaOrtu: tanpa.find((t) => t.kelas === k.nama)?._count ?? 0 })),
    });
  } catch (error) {
    console.error('ERROR GET ORTU:', error);
    return NextResponse.json({ message: 'Gagal memuat akun orang tua' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    if (body.aksi === 'massal') {
      const kelas = teks(body.kelas, 50);
      if (!kelas) return NextResponse.json({ message: 'Pilih kelas' }, { status: 400 });
      const pilih = ['nis', 'tanggal', 'acak'].includes(body.password) ? body.password : 'acak';
      const punya = new Set((await prisma.orangTuaSiswa.findMany({ select: { siswaId: true } })).map((l) => l.siswaId));
      const siswa = (await prisma.user.findMany({ where: { role: 'PESERTA', kelas }, select: { id: true, nomorPeserta: true, nama: true, tanggalLahir: true }, orderBy: { nama: 'asc' } }))
        .filter((s) => !punya.has(s.id));
      const dibuat: { username: string; nama: string; anak: string; password: string }[] = [];
      for (const s of siswa) {
        const username = `ortu-${s.nomorPeserta}`;
        if (await prisma.user.findUnique({ where: { nomorPeserta: username }, select: { id: true } })) continue;
        const password = (pilih === 'nis' ? s.nomorPeserta : pilih === 'tanggal' ? ddmmyyyy(s.tanggalLahir) : '') || acak();
        const o = await prisma.user.create({ data: { nomorPeserta: username, nama: `Orang tua ${s.nama}`, password: await bcrypt.hash(password, 8), role: 'ORANGTUA' } });
        await prisma.orangTuaSiswa.create({ data: { orangTuaId: o.id, siswaId: s.id } });
        dibuat.push({ username, nama: o.nama, anak: `${s.nama} (${s.nomorPeserta})`, password });
      }
      await createAuditLog({ action: 'BUAT_ORTU_MASSAL', target: `Kelas ${kelas}`, details: { jumlah: dibuat.length }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `${dibuat.length} akun orang tua dibuat untuk kelas ${kelas}`, dibuat });
    }

    const username = teks(body.username, 50);
    const nama = teks(body.nama, 200);
    const password = String(body.password ?? '');
    if (!username || !nama) return NextResponse.json({ message: 'Username dan nama wajib diisi' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ message: 'Password minimal 6 karakter' }, { status: 400 });
    if (await prisma.user.findUnique({ where: { nomorPeserta: username }, select: { id: true } })) return NextResponse.json({ message: 'Username sudah dipakai' }, { status: 400 });
    const anak = await idAnak(body.anak);
    if (!Array.isArray(anak)) return NextResponse.json({ message: anak.error }, { status: 400 });
    if (!anak.length) return NextResponse.json({ message: 'Isi minimal satu NIS anak' }, { status: 400 });
    const o = await prisma.user.create({ data: { nomorPeserta: username, nama, password: await bcrypt.hash(password, 10), role: 'ORANGTUA', noHp: teks(body.noHp, 30) || null } });
    await prisma.orangTuaSiswa.createMany({ data: anak.map((siswaId) => ({ orangTuaId: o.id, siswaId })) });
    await createAuditLog({ action: 'BUAT_ORTU', target: `Orang tua ${username}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: { id: o.id, nomorPeserta: o.nomorPeserta, nama: o.nama } });
  } catch (error) {
    console.error('ERROR POST ORTU:', error);
    return NextResponse.json({ message: 'Gagal membuat akun orang tua' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const o = await prisma.user.findUnique({ where: { id: Number(body.id) } });
    if (!o || o.role !== 'ORANGTUA') return NextResponse.json({ message: 'Akun orang tua tidak ditemukan' }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (body.nama !== undefined) { const nama = teks(body.nama, 200); if (!nama) return NextResponse.json({ message: 'Nama wajib diisi' }, { status: 400 }); data.nama = nama; }
    if (body.noHp !== undefined) data.noHp = teks(body.noHp, 30) || null;
    if (body.password) {
      if (String(body.password).length < 6) return NextResponse.json({ message: 'Password minimal 6 karakter' }, { status: 400 });
      data.password = await bcrypt.hash(String(body.password), 10);
    }
    const ops = [prisma.user.update({ where: { id: o.id }, data })];
    if (body.anak !== undefined) {
      const anak = await idAnak(body.anak);
      if (!Array.isArray(anak)) return NextResponse.json({ message: anak.error }, { status: 400 });
      if (!anak.length) return NextResponse.json({ message: 'Isi minimal satu NIS anak' }, { status: 400 });
      await prisma.$transaction([
        prisma.orangTuaSiswa.deleteMany({ where: { orangTuaId: o.id } }),
        prisma.orangTuaSiswa.createMany({ data: anak.map((siswaId) => ({ orangTuaId: o.id, siswaId })) }),
      ]);
    }
    await prisma.$transaction(ops);
    await createAuditLog({ action: 'UBAH_ORTU', target: `Orang tua ${o.nomorPeserta}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Akun orang tua disimpan' });
  } catch (error) {
    console.error('ERROR PUT ORTU:', error);
    return NextResponse.json({ message: 'Gagal menyimpan' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const o = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, nomorPeserta: true } });
    if (!o || o.role !== 'ORANGTUA') return NextResponse.json({ message: 'Akun orang tua tidak ditemukan' }, { status: 404 });
    await prisma.$transaction([
      ...opsHapusDataLms(id),
      prisma.userActivity.deleteMany({ where: { userId: id } }),
      prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null } }),
      prisma.user.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'HAPUS_ORTU', target: `Orang tua ${o.nomorPeserta}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Akun orang tua dihapus' });
  } catch (error) {
    console.error('ERROR DELETE ORTU:', error);
    return NextResponse.json({ message: 'Gagal menghapus' }, { status: 500 });
  }
}
