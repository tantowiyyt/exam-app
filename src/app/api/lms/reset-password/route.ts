import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyRole } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { kelasWalian } from '@/lib/wali';

// Permintaan reset password (dari halaman Lupa Password) ditangani wali kelas (siswa kelasnya) atau admin (semua akun).
// Wali kelas juga bisa langsung mereset password siswa kelasnya. Password sementara ditampilkan sekali ke staf.

const HURUF = 'abcdefghjkmnpqrstuvwxyz23456789';
const passwordSementara = () => Array.from({ length: 8 }, () => HURUF[randomInt(HURUF.length)]).join('');

async function cakupan(user: { id: number; role: string; nama: string }) {
  if (user.role === 'ADMIN') return { semua: true, kelas: [] as string[] };
  return { semua: false, kelas: (await kelasWalian(user)).map((k) => k.nama) };
}

export async function GET() {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const c = await cakupan(auth.user);
    const permintaan = await prisma.permintaanReset.findMany({ where: { selesai: false }, orderBy: { createdAt: 'asc' } });
    const users = await prisma.user.findMany({
      where: { id: { in: permintaan.map((p) => p.userId) } },
      select: { id: true, nomorPeserta: true, nama: true, role: true, kelas: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const boleh = (u: { role: string; kelas: string } | undefined) => !!u && (c.semua || (u.role === 'PESERTA' && c.kelas.includes(u.kelas)));
    const siswa = c.kelas.length
      ? await prisma.user.findMany({ where: { role: 'PESERTA', kelas: { in: c.kelas } }, select: { id: true, nomorPeserta: true, nama: true, kelas: true }, orderBy: [{ kelas: 'asc' }, { nama: 'asc' }] })
      : [];
    return NextResponse.json({
      admin: c.semua,
      kelasWalian: c.kelas,
      permintaan: permintaan.filter((p) => boleh(byId.get(p.userId))).map((p) => ({ id: p.id, createdAt: p.createdAt, user: byId.get(p.userId) })),
      siswa,
    });
  } catch (error) {
    console.error('ERROR GET RESET PASSWORD:', error);
    return NextResponse.json({ message: 'Gagal memuat permintaan' }, { status: 500 });
  }
}

// { permintaanId } | { userId } -> password sementara; { aksi: 'tolak', permintaanId } -> tutup permintaan
export async function POST(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const c = await cakupan(auth.user);
    const req = body.permintaanId ? await prisma.permintaanReset.findUnique({ where: { id: Number(body.permintaanId) } }) : null;
    if (body.permintaanId && (!req || req.selesai)) return NextResponse.json({ message: 'Permintaan tidak ditemukan atau sudah ditangani' }, { status: 404 });
    const userId = req ? req.userId : Number(body.userId);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, nama: true, nomorPeserta: true, role: true, kelas: true } });
    const boleh = target && target.id !== auth.user.id && (c.semua || (target.role === 'PESERTA' && c.kelas.includes(target.kelas)));
    if (!boleh) return NextResponse.json({ message: 'Akun tidak ditemukan atau bukan siswa kelas perwalian Anda' }, { status: 404 });

    const selesai = { selesai: true, selesaiAt: new Date(), ditangani: auth.user.id };
    if (body.aksi === 'tolak') {
      await prisma.permintaanReset.updateMany({ where: { userId: target.id, selesai: false }, data: selesai });
      return NextResponse.json({ success: true, message: 'Permintaan ditutup' });
    }
    const password = passwordSementara();
    await prisma.$transaction([
      prisma.user.update({ where: { id: target.id }, data: { password: await bcrypt.hash(password, 10) } }),
      prisma.permintaanReset.updateMany({ where: { userId: target.id, selesai: false }, data: selesai }),
    ]);
    await createAuditLog({ action: 'RESET_PASSWORD_WALI', target: `User #${target.id} ${target.nama}`, details: { oleh: auth.user.nama }, ipAddress: getAuditIP(request) });
    return NextResponse.json({
      success: true, password, user: { nomorPeserta: target.nomorPeserta, nama: target.nama },
      message: `Password ${target.nama} direset. Berikan password sementara ini dan minta segera menggantinya.`,
    });
  } catch (error) {
    console.error('ERROR RESET PASSWORD:', error);
    return NextResponse.json({ message: 'Gagal mereset password' }, { status: 500 });
  }
}
