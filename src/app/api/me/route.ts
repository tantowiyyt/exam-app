import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { ujianAktifUntuk } from '@/lib/ujian-peserta';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { nomorPeserta: session.nomorPeserta },
      select: {
        id: true, nama: true, role: true, ruang: true, sesi: true, tanggalUjian: true, kelas: true,
        foto: true, nik: true, tempatLahir: true, tanggalLahir: true,
        jenisKelamin: true, alamat: true, noHp: true, email: true, notifWa: true,
      },
    });

    const profilLengkap = !!(user?.nik && user?.tempatLahir && user?.tanggalLahir && user?.jenisKelamin && user?.alamat && user?.noHp);

    return NextResponse.json({
      success: true,
      nomorPeserta: session.nomorPeserta,
      nama: user?.nama ?? session.nama,
      role: user?.role ?? session.role,
      // Status per ujian: sudah mengerjakan ujian CAT aktif untuk kelasnya
      sudahUjian: user?.role === 'PESERTA' ? (await ujianAktifUntuk(user)).sudah : false,
      ruang: user?.ruang ?? '',
      sesi: user?.sesi ?? '',
      tanggalUjian: user?.tanggalUjian ?? '',
      foto: user?.foto ?? '',
      kelas: user?.kelas ?? '',
      // Data diri milik sendiri (untuk mengisi ulang form Data Diri)
      nik: user?.nik ?? '',
      tempatLahir: user?.tempatLahir ?? '',
      tanggalLahir: user?.tanggalLahir ? user.tanggalLahir.toISOString().slice(0, 10) : '',
      jenisKelamin: user?.jenisKelamin ?? '',
      alamat: user?.alamat ?? '',
      noHp: user?.noHp ?? '',
      email: user?.email ?? '',
      notifWa: user?.notifWa ?? true,
      profilLengkap,
    });
  } catch (error) {
    console.error('ERROR PADA API ME:', error);
    return NextResponse.json({ message: 'Gagal mengambil data user' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { foto, nik, tempatLahir, tanggalLahir, jenisKelamin, alamat, noHp } = body;
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : undefined;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: 'Email tidak valid' }, { status: 400 });
    }

    if (!nik || !tempatLahir || !tanggalLahir || !jenisKelamin || !alamat || !noHp) {
      return NextResponse.json({ message: 'Semua field wajib diisi' }, { status: 400 });
    }

    const tglLahir = new Date(tanggalLahir);
    if (isNaN(tglLahir.getTime()) || tglLahir > new Date()) {
      return NextResponse.json({ message: 'Tanggal lahir tidak valid' }, { status: 400 });
    }
    if (!['L', 'P'].includes(jenisKelamin)) {
      return NextResponse.json({ message: 'Jenis kelamin tidak valid' }, { status: 400 });
    }
    if (!/^\d{16}$/.test(String(nik))) {
      return NextResponse.json({ message: 'NIK harus 16 digit angka' }, { status: 400 });
    }
    // Foto hanya boleh dari hasil upload aplikasi ini
    if (foto && !/^\/(api\/foto|uploads\/fotos)\/[\w-]+\.(jpg|jpeg|png|webp|jfif)$/i.test(foto)) {
      return NextResponse.json({ message: 'Foto tidak valid' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      foto: foto || null, nik: String(nik), tempatLahir, tanggalLahir: tglLahir,
      jenisKelamin, alamat, noHp,
      ...(email !== undefined ? { email } : {}),
      ...(typeof body.notifWa === 'boolean' ? { notifWa: body.notifWa } : {}),
    };

    const user = await prisma.user.findUnique({
      where: { nomorPeserta: session.nomorPeserta },
      select: { id: true, role: true, kelas: true, ruang: true, sesi: true },
    });

    // Ruang/sesi ujian CAT dibagi otomatis bila ada jadwal ujian aktif; bila belum ada, data diri tetap
    // disimpan (aplikasi LMS) dan ruang diatur admin kemudian.
    let catatan = '';
    if (user && (!user.ruang || !user.sesi)) {
      const assigned = await autoAssignRoom(user);
      if (assigned) {
        updateData.ruang = assigned.ruang;
        updateData.sesi = assigned.sesi;
        updateData.tanggalUjian = assigned.tanggal;
      } else {
        catatan = ' Ruang ujian akan diatur oleh admin.';
      }
    }

    await prisma.user.update({
      where: { nomorPeserta: session.nomorPeserta },
      data: updateData,
    });

    return NextResponse.json({ success: true, message: `Data diri disimpan.${catatan}` });
  } catch (error) {
    console.error('ERROR PUT PROFILE:', error);
    return NextResponse.json({ message: 'Gagal memperbarui profil' }, { status: 500 });
  }
}

const KAPASITAS_RUANG = 20;
const DAFTAR_RUANG = ['LAB CAT-01', 'LAB CAT-02', 'LAB CAT-03', 'LAB CAT-04', 'LAB CAT-05'];
const DAFTAR_SESI = ['1', '2', '3', '4'];

async function autoAssignRoom(user: { id: number; role: string; kelas: string }): Promise<{ ruang: string; sesi: string; tanggal: string } | null> {
  const activeExam = (await ujianAktifUntuk(user)).ujian;

  if (!activeExam?.jadwalMulai) return null;

  const tanggal = activeExam.jadwalMulai.toISOString().slice(0, 10);

  for (const sesi of DAFTAR_SESI) {
    for (const ruang of DAFTAR_RUANG) {
      const count = await prisma.user.count({
        where: { tanggalUjian: tanggal, sesi, ruang, role: 'PESERTA' },
      });
      if (count < KAPASITAS_RUANG) {
        return { ruang, sesi, tanggal };
      }
    }
  }
  return null;
}
