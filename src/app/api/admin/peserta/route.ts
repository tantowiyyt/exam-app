import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import bcrypt from 'bcryptjs';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';

/**
 * Data diri opsional yang boleh diisi/dikoreksi admin (biasanya diisi peserta di /profile).
 * Mengembalikan pesan error, atau objek data siap simpan (string kosong -> null).
 */
function parseDataDiri(body: Record<string, unknown>): { error: string } | { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : undefined);

  const nik = str('nik');
  if (nik !== undefined) {
    if (nik && !/^\d{16}$/.test(nik)) return { error: 'NIK harus 16 digit angka' };
    data.nik = nik || null;
  }
  for (const k of ['tempatLahir', 'alamat', 'noHp']) {
    const v = str(k);
    if (v !== undefined) data[k] = v ? v.slice(0, 255) : null;
  }
  const tgl = str('tanggalLahir');
  if (tgl !== undefined) {
    if (tgl) {
      const d = new Date(tgl);
      if (isNaN(d.getTime()) || d > new Date()) return { error: 'Tanggal lahir tidak valid' };
      data.tanggalLahir = d;
    } else {
      data.tanggalLahir = null;
    }
  }
  const jk = str('jenisKelamin');
  if (jk !== undefined) {
    if (jk && !['L', 'P'].includes(jk)) return { error: 'Jenis kelamin tidak valid' };
    data.jenisKelamin = jk || null;
  }
  const foto = str('foto');
  if (foto !== undefined) {
    if (foto && !/^\/(api\/foto|uploads\/fotos)\/[\w-]+\.(jpg|jpeg|png|webp|jfif)$/i.test(foto)) return { error: 'Foto tidak valid' };
    data.foto = foto || null;
  }
  return { data };
}

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const peserta = await prisma.user.findMany({
      where: { role: 'PESERTA' },
      orderBy: { id: 'desc' },
    });
    // Jangan kirim hash password ke browser
    return NextResponse.json(peserta.map(({ password: _pw, ...p }) => { void _pw; return p; }));
  } catch (error) {
    console.error('ERROR PADA GET PESERTA:', error);
    return NextResponse.json({ message: 'Gagal mengambil data peserta' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { nomorPeserta, nama, password, ruang, sesi, kelas, bulk } = body;

    // Bulk import
    if (bulk && Array.isArray(bulk)) {
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const p of bulk) {
        if (!p?.nomorPeserta || !p?.nama || !p?.password) {
          errors.push(`${p?.nomorPeserta || '(tanpa nomor)'}: nomor peserta, nama, dan password wajib diisi`);
          failedCount++;
          continue;
        }
        try {
          const existing = await prisma.user.findUnique({ where: { nomorPeserta: p.nomorPeserta } });
          if (existing) {
            errors.push(`${p.nomorPeserta}: sudah terdaftar`);
            failedCount++;
            continue;
          }
          const hashedPassword = await bcrypt.hash(String(p.password), 10);
          await prisma.user.create({
            data: {
              nomorPeserta: String(p.nomorPeserta).trim(),
              nama: String(p.nama).trim(),
              password: hashedPassword,
              role: 'PESERTA',
              ruang: p.ruang || 'LAB CAT-01',
              sesi: p.sesi || '1',
              kelas: typeof p.kelas === 'string' ? p.kelas.trim() : '',
            },
          });
          successCount++;
        } catch {
          errors.push(`${p.nomorPeserta}: gagal disimpan`);
          failedCount++;
        }
      }

      await createAuditLog({
        action: AUDIT_ACTIONS.BULK_IMPORT_PESERTA,
        target: `${successCount} peserta`,
        details: { gagal: failedCount },
        ipAddress: getAuditIP(request),
      });
      return NextResponse.json({ success: true, data: { successCount, failedCount, errors } });
    }

    // Single insert
    if (!nomorPeserta || !nama || !password) {
      return NextResponse.json({ message: 'Nomor peserta, nama, dan password wajib diisi' }, { status: 400 });
    }
    const dataDiri = parseDataDiri(body);
    if ('error' in dataDiri) return NextResponse.json({ message: dataDiri.error }, { status: 400 });

    const existingUser = await prisma.user.findUnique({
      where: { nomorPeserta },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Nomor Peserta sudah terdaftar!' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newPeserta = await prisma.user.create({
      data: {
        nomorPeserta,
        nama,
        password: hashedPassword,
        role: 'PESERTA',
        ruang: ruang || 'LAB CAT-01',
        sesi: sesi || '1',
        kelas: typeof kelas === 'string' ? kelas.trim() : '',
        ...dataDiri.data,
      },
    });

    await createAuditLog({ action: AUDIT_ACTIONS.CREATE_PESERTA, target: `Peserta ${nomorPeserta}`, ipAddress: getAuditIP(request) });
    const { password: _pw, ...data } = newPeserta;
    void _pw;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR PADA POST PESERTA:', error);
    return NextResponse.json({ message: 'Gagal menambah peserta' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { id, nomorPeserta, nama, password, ruang, sesi, kelas } = body;

    if (!id || !nomorPeserta || !nama) {
      return NextResponse.json({ message: 'Nomor peserta dan nama wajib diisi' }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: Number(id) }, select: { role: true } });
    if (target?.role !== 'PESERTA') {
      return NextResponse.json({ message: 'Akun admin/pengawas dikelola di menu Kelola Akun' }, { status: 400 });
    }

    const duplikat = await prisma.user.findFirst({
      where: { nomorPeserta, id: { not: Number(id) } },
      select: { id: true },
    });
    if (duplikat) {
      return NextResponse.json({ message: 'Nomor Peserta sudah dipakai peserta lain!' }, { status: 400 });
    }

    const dataDiri = parseDataDiri(body);
    if ('error' in dataDiri) return NextResponse.json({ message: dataDiri.error }, { status: 400 });

    const updateData: Record<string, unknown> = { nomorPeserta, nama, ruang, sesi, kelas: typeof kelas === 'string' ? kelas.trim() : '', ...dataDiri.data };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedPeserta = await prisma.user.update({
      where: { id: Number(id) },
      data: updateData,
      select: { id: true, nomorPeserta: true, nama: true, kelas: true, ruang: true, sesi: true },
    });

    await createAuditLog({ action: AUDIT_ACTIONS.UPDATE_PESERTA, target: `Peserta ${nomorPeserta}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: updatedPeserta });
  } catch (error) {
    console.error('ERROR PADA PUT PESERTA:', error);
    return NextResponse.json({ message: 'Gagal memperbarui data peserta' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'ID tidak valid' }, { status: 400 });
    }

    const userId = Number(id);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, nomorPeserta: true } });
    if (!user) {
      return NextResponse.json({ message: 'Peserta tidak ditemukan' }, { status: 404 });
    }
    if (user.role !== 'PESERTA') {
      return NextResponse.json({ message: 'Akun admin/pengawas dikelola di menu Kelola Akun' }, { status: 400 });
    }

    // Hapus data terkait dulu agar tidak melanggar relasi (FK)
    await prisma.$transaction([
      prisma.jawabanUjian.deleteMany({ where: { userId } }),
      prisma.historiUjian.deleteMany({ where: { userId } }),
      prisma.pelanggaran.deleteMany({ where: { userId } }),
      prisma.userActivity.deleteMany({ where: { userId } }),
      prisma.sesiUjian.deleteMany({ where: { userId } }),
      prisma.auditLog.updateMany({ where: { userId }, data: { userId: null } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    await createAuditLog({ action: AUDIT_ACTIONS.DELETE_PESERTA, target: `Peserta ${user.nomorPeserta}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Peserta berhasil dihapus' });
  } catch (error) {
    console.error('ERROR PADA DELETE PESERTA:', error);
    return NextResponse.json({ message: 'Gagal menghapus peserta' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { id, action } = body;

    if (action === 'resetUjian') {
      if (!id) {
        return NextResponse.json({ message: 'ID tidak valid' }, { status: 400 });
      }
      const target = await prisma.user.findUnique({ where: { id: Number(id) }, select: { role: true } });
      if (target?.role !== 'PESERTA') {
        return NextResponse.json({ message: 'Peserta tidak ditemukan' }, { status: 404 });
      }

      await prisma.$transaction([
        prisma.jawabanUjian.deleteMany({ where: { userId: Number(id) } }),
        prisma.sesiUjian.deleteMany({ where: { userId: Number(id), selesai: false } }),
        prisma.user.update({
          where: { id: Number(id) },
          data: { nilai: null, sudahUjian: false },
        }),
      ]);

      await createAuditLog({ action: AUDIT_ACTIONS.RESET_PESERTA, target: `Peserta #${id}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Ujian peserta berhasil direset' });
    }

    if (action === 'resetAll') {
      await prisma.$transaction([
        prisma.jawabanUjian.deleteMany({}),
        prisma.sesiUjian.deleteMany({ where: { selesai: false } }),
        prisma.user.updateMany({
          where: { role: 'PESERTA' },
          data: { sudahUjian: false, nilai: null },
        }),
      ]);
      await createAuditLog({ action: AUDIT_ACTIONS.RESET_ALL_PESERTA, target: 'Semua peserta', ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Semua data ujian peserta berhasil direset' });
    }

    return NextResponse.json({ message: 'Action tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('ERROR PADA PATCH PESERTA:', error);
    return NextResponse.json({ message: 'Gagal memproses permintaan' }, { status: 500 });
  }
}
