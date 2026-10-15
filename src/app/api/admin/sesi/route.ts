import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStaffSession, ruangPengawas } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { getSoalPeserta } from '@/lib/ujian-soal';
import { ujianAktifUntuk } from '@/lib/ujian-peserta';
import { susunTahap, hitungStatus, sinkronStatus, cariSesiAktif, parseJawaban, nilaiDanSimpan } from '@/lib/sesi-ujian';

// Aksi pengawas terhadap sesi ujian peserta yang sedang berjalan
export async function POST(request: Request) {
  const auth = await verifyStaffSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { userId, action, menit } = await request.json();
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user || user.role !== 'PESERTA') return NextResponse.json({ message: 'Peserta tidak ditemukan' }, { status: 404 });
    const ruang = ruangPengawas(auth.user);
    if (ruang && user.ruang !== ruang) {
      return NextResponse.json({ message: `Peserta ini bukan di ruang ${ruang}` }, { status: 403 });
    }

    const { ujian } = await ujianAktifUntuk(user);
    let sesi = await cariSesiAktif(user.id, ujian?.id ?? null);
    if (!sesi) return NextResponse.json({ message: 'Peserta tidak sedang mengerjakan ujian' }, { status: 400 });

    const tahap = susunTahap(await getSoalPeserta(user.id, ujian));
    const status = hitungStatus(sesi, ujian, tahap);
    sesi = await sinkronStatus(sesi, status);
    const audit = (aksi: string, details?: Record<string, unknown>) => createAuditLog({
      action: aksi, target: `Peserta ${user.nomorPeserta}`, details, ipAddress: getAuditIP(request),
    });

    if (action === 'tambahWaktu') {
      const m = Math.floor(Number(menit));
      if (!(m >= 1 && m <= 180)) return NextResponse.json({ message: 'Tambahan waktu harus 1–180 menit' }, { status: 400 });
      await prisma.sesiUjian.update({ where: { id: sesi.id }, data: { tambahanMenit: status.tambahanMenit + m } });
      await audit('TAMBAH_WAKTU_UJIAN', { menit: m });
      return NextResponse.json({ success: true, message: `Waktu ${user.nama} ditambah ${m} menit` });
    }

    if (action === 'paksaKumpul') {
      const hasil = await nilaiDanSimpan({ user, ujian, jawaban: parseJawaban(sesi), waktuMulai: sesi.waktuMulai, sesiId: sesi.id });
      await audit('PAKSA_KUMPUL_UJIAN', { nilaiAkhir: hasil.nilaiAkhir });
      return NextResponse.json({ success: true, message: `Ujian ${user.nama} dikumpulkan (nilai ${hasil.nilaiAkhir})` });
    }

    if (action === 'reset') {
      await prisma.sesiUjian.delete({ where: { id: sesi.id } });
      await audit('RESET_SESI_UJIAN');
      return NextResponse.json({ success: true, message: `Sesi ${user.nama} direset; peserta mulai dari awal` });
    }

    return NextResponse.json({ message: 'Aksi tidak valid' }, { status: 400 });
  } catch (error) {
    console.error('ERROR AKSI SESI:', error);
    return NextResponse.json({ message: 'Gagal memproses aksi' }, { status: 500 });
  }
}
