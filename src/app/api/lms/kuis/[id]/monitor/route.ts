import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';
import { bacaJson, batasWaktu, selesaikan, statusBuka, tokenBaru, tutupYangKedaluwarsa } from '@/lib/kuis';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Monitoring ujian CAT per mapel (kuis mode ujian) oleh pengelola mapel:
// status tiap siswa, jumlah terjawab, sisa waktu, pelanggaran; aksi tambah waktu / kumpulkan / reset / token.

async function muat(id: number, user: { id: number; role: string }) {
  const kuis = await prisma.kuis.findUnique({ where: { id } });
  const akses = kuis ? await aksesMapel(user, kuis.mapelId) : null;
  return kuis && kuis.modeUjian && akses?.peran === 'kelola' ? { kuis, akses } : null;
}

export async function GET(_request: Request, ctx: RouteContext<'/api/lms/kuis/[id]/monitor'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const m = await muat(Number((await ctx.params).id), auth.user);
    if (!m) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const { kuis, akses } = m;
    await tutupYangKedaluwarsa(kuis);

    const [siswa, percobaan, jumlahSoal] = await Promise.all([
      prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true, nomorPeserta: true, nama: true }, orderBy: { nama: 'asc' } }),
      prisma.percobaanKuis.findMany({ where: { kuisId: kuis.id }, orderBy: { ke: 'desc' } }),
      prisma.soalKuis.count({ where: { kuisId: kuis.id } }),
    ]);
    const now = Date.now();
    const baris = siswa.map((s) => {
      const p = percobaan.find((x) => x.userId === s.id);
      if (!p) return { siswa: s, status: 'belum' as const };
      const terjawab = Object.values(bacaJson<Record<string, unknown>>(p.jawaban, {})).filter((v) => String(v ?? '').trim() !== '').length;
      const batas = batasWaktu(kuis, p);
      return {
        siswa: s,
        status: p.selesaiAt ? ('selesai' as const) : ('mengerjakan' as const),
        percobaanId: p.id,
        mulaiAt: p.mulaiAt,
        selesaiAt: p.selesaiAt,
        terjawab,
        sisaMs: !p.selesaiAt && batas ? Math.max(0, batas.getTime() - now) : null,
        pelanggaran: p.pelanggaran,
        tambahanMenit: p.tambahanMenit,
        nilai: p.selesaiAt ? p.nilai : null,
        perluDinilai: p.perluDinilai,
      };
    });
    return NextResponse.json({
      kuis: { id: kuis.id, judul: kuis.judul, status: statusBuka(kuis), token: kuis.token, maksPelanggaran: kuis.maksPelanggaran, durasiMenit: kuis.durasiMenit, mulai: kuis.mulai, selesai: kuis.selesai },
      jumlahSoal,
      ringkasan: {
        siswa: siswa.length,
        mengerjakan: baris.filter((b) => b.status === 'mengerjakan').length,
        selesai: baris.filter((b) => b.status === 'selesai').length,
        belum: baris.filter((b) => b.status === 'belum').length,
      },
      siswa: baris,
      serverNow: new Date(),
    });
  } catch (error) {
    console.error('ERROR MONITOR UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memuat monitoring ujian' }, { status: 500 });
  }
}

// { aksi: 'tambahWaktu', userId, menit } | { aksi: 'kumpulkan', userId } | { aksi: 'reset', userId } | { aksi: 'gantiToken' } | { aksi: 'hapusToken' }
export async function POST(request: Request, ctx: RouteContext<'/api/lms/kuis/[id]/monitor'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const m = await muat(Number((await ctx.params).id), auth.user);
    if (!m) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const { kuis } = m;
    const body = await request.json();
    const target = `Ujian #${kuis.id} ${kuis.judul}`;

    if (body.aksi === 'gantiToken' || body.aksi === 'hapusToken') {
      const token = body.aksi === 'gantiToken' ? tokenBaru() : '';
      await prisma.kuis.update({ where: { id: kuis.id }, data: { token } });
      await createAuditLog({ action: 'TOKEN_UJIAN_MAPEL', target, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, token, message: token ? `Token baru: ${token}` : 'Token dihapus — siswa bisa mulai tanpa token' });
    }

    const userId = Number(body.userId);
    const aktif = await prisma.percobaanKuis.findFirst({ where: { kuisId: kuis.id, userId, selesaiAt: null } });

    if (body.aksi === 'tambahWaktu') {
      const menit = Number(body.menit);
      if (!Number.isInteger(menit) || menit < 1 || menit > 120) return NextResponse.json({ message: 'Tambahan waktu 1–120 menit' }, { status: 400 });
      if (!aktif) return NextResponse.json({ message: 'Siswa tidak sedang mengerjakan' }, { status: 409 });
      await prisma.percobaanKuis.update({ where: { id: aktif.id }, data: { tambahanMenit: { increment: menit } } });
      await createAuditLog({ action: 'TAMBAH_WAKTU_UJIAN_MAPEL', target, details: { userId, menit }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `Waktu ditambah ${menit} menit` });
    }
    if (body.aksi === 'kumpulkan') {
      if (!aktif) return NextResponse.json({ message: 'Siswa tidak sedang mengerjakan' }, { status: 409 });
      await selesaikan(aktif, kuis.id);
      await createAuditLog({ action: 'KUMPULKAN_UJIAN_MAPEL', target, details: { userId }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Jawaban siswa dikumpulkan' });
    }
    if (body.aksi === 'reset') {
      const n = await prisma.percobaanKuis.deleteMany({ where: { kuisId: kuis.id, userId } });
      if (!n.count) return NextResponse.json({ message: 'Siswa belum mengerjakan' }, { status: 409 });
      await createAuditLog({ action: 'RESET_UJIAN_MAPEL', target, details: { userId }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Ujian siswa direset — siswa bisa mengerjakan dari awal' });
    }
    return NextResponse.json({ message: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR AKSI MONITOR UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memproses aksi' }, { status: 500 });
  }
}
