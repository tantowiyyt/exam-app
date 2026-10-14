import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Kelola akun staf (ADMIN & PENGAWAS). Akun peserta dikelola di /api/admin/peserta.
const STAFF_ROLES = ['ADMIN', 'PENGAWAS'];
const SELECT = { id: true, nomorPeserta: true, nama: true, role: true, ruang: true, createdAt: true } as const;

const jumlahAdmin = () => prisma.user.count({ where: { role: 'ADMIN' } });

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const [akun, ruangList] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: STAFF_ROLES } },
        select: SELECT,
        orderBy: [{ role: 'asc' }, { nama: 'asc' }],
      }),
      prisma.user.findMany({
        where: { role: 'PESERTA', ruang: { not: '' } },
        select: { ruang: true },
        distinct: ['ruang'],
        orderBy: { ruang: 'asc' },
      }),
    ]);
    return NextResponse.json({ akun, selfId: auth.user.id, ruangList: ruangList.map((r) => r.ruang) });
  } catch (error) {
    console.error('ERROR GET AKUN:', error);
    return NextResponse.json({ message: 'Gagal mengambil data akun' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { username, nama, password, role, ruang } = await request.json();
    if (typeof username !== 'string' || !/^[\w.-]{3,50}$/.test(username.trim())) {
      return NextResponse.json({ message: 'Username 3–50 karakter (huruf, angka, titik, minus, garis bawah)' }, { status: 400 });
    }
    if (!nama || typeof nama !== 'string' || !nama.trim()) {
      return NextResponse.json({ message: 'Nama wajib diisi' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ message: 'Password minimal 6 karakter' }, { status: 400 });
    }
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ message: 'Role tidak valid' }, { status: 400 });
    }

    const ada = await prisma.user.findUnique({ where: { nomorPeserta: username.trim() } });
    if (ada) return NextResponse.json({ message: 'Username sudah dipakai' }, { status: 400 });

    const akun = await prisma.user.create({
      data: {
        nomorPeserta: username.trim(),
        nama: nama.trim(),
        password: await bcrypt.hash(password, 10),
        role,
        ruang: role === 'PENGAWAS' && typeof ruang === 'string' ? ruang.trim() : '',
        sesi: '',
      },
      select: SELECT,
    });

    await createAuditLog({ action: 'CREATE_AKUN', target: `${role} ${akun.nomorPeserta}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: akun });
  } catch (error) {
    console.error('ERROR POST AKUN:', error);
    return NextResponse.json({ message: 'Gagal membuat akun' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { id, nama, role, ruang, password } = await request.json();
    const target = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!target || !STAFF_ROLES.includes(target.role)) {
      return NextResponse.json({ message: 'Akun tidak ditemukan' }, { status: 404 });
    }
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ message: 'Role tidak valid' }, { status: 400 });
    }
    if (!nama || typeof nama !== 'string' || !nama.trim()) {
      return NextResponse.json({ message: 'Nama wajib diisi' }, { status: 400 });
    }
    if (password && (typeof password !== 'string' || password.length < 6)) {
      return NextResponse.json({ message: 'Password minimal 6 karakter' }, { status: 400 });
    }

    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      if (target.id === auth.user.id) {
        return NextResponse.json({ message: 'Anda tidak dapat menurunkan role akun Anda sendiri' }, { status: 400 });
      }
      if ((await jumlahAdmin()) <= 1) {
        return NextResponse.json({ message: 'Harus ada minimal satu admin' }, { status: 400 });
      }
    }

    const akun = await prisma.user.update({
      where: { id: target.id },
      data: {
        nama: nama.trim(),
        role,
        ruang: role === 'PENGAWAS' && typeof ruang === 'string' ? ruang.trim() : '',
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
      select: SELECT,
    });

    await createAuditLog({
      action: 'UPDATE_AKUN',
      target: `${akun.role} ${akun.nomorPeserta}`,
      details: { roleLama: target.role, roleBaru: role, ruang: akun.ruang, gantiPassword: !!password },
      ipAddress: getAuditIP(request),
    });
    return NextResponse.json({ success: true, data: akun });
  } catch (error) {
    console.error('ERROR PUT AKUN:', error);
    return NextResponse.json({ message: 'Gagal memperbarui akun' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || !STAFF_ROLES.includes(target.role)) {
      return NextResponse.json({ message: 'Akun tidak ditemukan' }, { status: 404 });
    }
    if (target.id === auth.user.id) {
      return NextResponse.json({ message: 'Anda tidak dapat menghapus akun Anda sendiri' }, { status: 400 });
    }
    if (target.role === 'ADMIN' && (await jumlahAdmin()) <= 1) {
      return NextResponse.json({ message: 'Harus ada minimal satu admin' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.jawabanUjian.deleteMany({ where: { userId: id } }),
      prisma.historiUjian.deleteMany({ where: { userId: id } }),
      prisma.sesiUjian.deleteMany({ where: { userId: id } }),
      prisma.pelanggaran.deleteMany({ where: { userId: id } }),
      prisma.userActivity.deleteMany({ where: { userId: id } }),
      prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await createAuditLog({ action: 'DELETE_AKUN', target: `${target.role} ${target.nomorPeserta}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Akun berhasil dihapus' });
  } catch (error) {
    console.error('ERROR DELETE AKUN:', error);
    return NextResponse.json({ message: 'Gagal menghapus akun' }, { status: 500 });
  }
}
