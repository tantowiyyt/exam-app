import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks } from '@/lib/lms';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Presensi per pertemuan. Guru membuat sesi & mengisi status (H/I/S/A);
// siswa bisa presensi mandiri dengan kode selama sesi dibuka.

const STATUS = ['H', 'I', 'S', 'A'] as const;
const HURUF_KODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I agar tidak tertukar
const kodeBaru = () => Array.from({ length: 6 }, () => HURUF_KODE[randomInt(HURUF_KODE.length)]).join('');

type Rekap = Record<(typeof STATUS)[number], number> & { persen: number | null };
function rekap(statuses: string[], jumlahSesi: number): Rekap {
  const r = { H: 0, I: 0, S: 0, A: 0 } as Rekap;
  for (const s of statuses) if (s in r) r[s as (typeof STATUS)[number]]++;
  r.persen = jumlahSesi ? Math.round((r.H / jumlahSesi) * 1000) / 10 : null;
  return r;
}

function dataSesi(body: Record<string, unknown>) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Judul pertemuan wajib diisi' } as const;
  const tanggal = body.tanggal ? new Date(String(body.tanggal)) : new Date();
  if (isNaN(tanggal.getTime())) return { error: 'Tanggal tidak valid' } as const;
  const menit = Math.floor(Number(body.bukaMenit ?? 0));
  if (!Number.isFinite(menit) || menit < 0 || menit > 1440) return { error: 'Lama presensi mandiri 0–1440 menit' } as const;
  // bukaMenit tidak dikirim saat mengubah = status buka/tutup tidak berubah
  const buka = body.bukaMenit === undefined ? {} : { bukaSampai: menit ? new Date(Date.now() + menit * 60000) : null };
  return { data: { judul, tanggal, catatan: teks(body.catatan, 2000), ...buka } } as const;
}

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const akses = await aksesMapel(user, Number(new URL(request.url).searchParams.get('mapelId')));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const kelola = akses.peran === 'kelola';
    const now = new Date();

    const sesi = await prisma.sesiPresensi.findMany({
      where: { mapelId: akses.mapel.id },
      orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
      include: { presensi: { where: kelola ? {} : { userId: user.id } } },
    });
    // Persentase kehadiran dihitung dari pertemuan yang sudah berlangsung
    const berlangsung = sesi.filter((s) => s.tanggal <= now).length;

    if (!kelola) {
      const milik = sesi.flatMap((s) => s.presensi);
      return NextResponse.json({
        peran: akses.peran,
        sesi: sesi.map((s) => ({
          id: s.id, judul: s.judul, tanggal: s.tanggal, catatan: s.catatan,
          dibuka: !!s.bukaSampai && s.bukaSampai > now, bukaSampai: s.bukaSampai,
          saya: s.presensi[0] ? { status: s.presensi[0].status, waktu: s.presensi[0].waktu, mandiri: s.presensi[0].mandiri, keterangan: s.presensi[0].keterangan } : null,
        })),
        rekap: rekap(milik.filter((p) => sesi.find((s) => s.id === p.sesiId)!.tanggal <= now).map((p) => p.status), berlangsung),
      });
    }

    const siswa = await prisma.user.findMany({
      where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama },
      select: { id: true, nomorPeserta: true, nama: true },
      orderBy: { nama: 'asc' },
    });
    return NextResponse.json({
      peran: akses.peran,
      siswa,
      sesi: sesi.map((s) => ({
        id: s.id, judul: s.judul, tanggal: s.tanggal, catatan: s.catatan, kode: s.kode,
        dibuka: !!s.bukaSampai && s.bukaSampai > now, bukaSampai: s.bukaSampai,
        presensi: s.presensi.map((p) => ({ userId: p.userId, status: p.status, mandiri: p.mandiri, keterangan: p.keterangan, waktu: p.waktu })),
        jumlah: rekap(s.presensi.map((p) => p.status), 0),
      })),
      rekap: siswa.map((m) => ({
        userId: m.id,
        ...rekap(sesi.filter((s) => s.tanggal <= now).flatMap((s) => s.presensi.filter((p) => p.userId === m.id).map((p) => p.status)), berlangsung),
      })),
    });
  } catch (error) {
    console.error('ERROR GET PRESENSI:', error);
    return NextResponse.json({ message: 'Gagal memuat presensi' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const body = await request.json();
    const akses = await aksesMapel(user, Number(body.mapelId));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });

    // Siswa: presensi mandiri dengan kode
    if (body.aksi === 'hadir') {
      if (akses.peran !== 'siswa') return NextResponse.json({ message: 'Hanya siswa yang melakukan presensi' }, { status: 403 });
      const batas = checkRateLimit(`presensi:${user.id}`);
      if (!batas.allowed) {
        return NextResponse.json({ message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(batas.retryAfterMs / 60000)} menit.` }, { status: 429 });
      }
      const kode = teks(body.kode, 20).toUpperCase().replace(/\s+/g, '');
      const sesi = kode ? await prisma.sesiPresensi.findFirst({ where: { mapelId: akses.mapel.id, kode, bukaSampai: { gt: new Date() } } }) : null;
      if (!sesi) return NextResponse.json({ message: 'Kode salah atau presensi sudah ditutup' }, { status: 400 });
      resetRateLimit(`presensi:${user.id}`);
      const p = await prisma.presensi.upsert({
        where: { sesiId_userId: { sesiId: sesi.id, userId: user.id } },
        update: { status: 'H', mandiri: true, waktu: new Date() },
        create: { sesiId: sesi.id, userId: user.id, status: 'H', mandiri: true },
      });
      return NextResponse.json({ success: true, message: `Presensi ${sesi.judul} tercatat: Hadir`, data: p });
    }

    // Guru: buat sesi pertemuan
    if (akses.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = dataSesi(body);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    const sesi = await prisma.sesiPresensi.create({ data: { ...hasil.data, mapelId: akses.mapel.id, kode: kodeBaru() } });
    await createAuditLog({ action: 'CREATE_PRESENSI', target: `Presensi #${sesi.id} ${sesi.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: sesi });
  } catch (error) {
    console.error('ERROR POST PRESENSI:', error);
    return NextResponse.json({ message: 'Gagal menyimpan presensi' }, { status: 500 });
  }
}

// Guru: aksi "isi" = simpan status banyak siswa; aksi "ubah" = ubah sesi (buka/tutup presensi mandiri, ganti kode)
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const sesi = await prisma.sesiPresensi.findUnique({ where: { id: Number(body.id) } });
    const akses = sesi ? await aksesMapel(auth.user, sesi.mapelId) : null;
    if (!sesi || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Pertemuan tidak ditemukan' }, { status: 404 });

    if (body.aksi === 'isi') {
      const list = Array.isArray(body.data) ? body.data : [];
      const siswa = new Set((await prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true } })).map((u) => u.id));
      // Siswa yang sudah pindah kelas tetap boleh dikoreksi bila sudah punya catatan
      const ada = new Set((await prisma.presensi.findMany({ where: { sesiId: sesi.id }, select: { userId: true } })).map((p) => p.userId));
      const ops = [];
      for (const r of list) {
        const userId = Number(r?.userId);
        if (!siswa.has(userId) && !ada.has(userId)) return NextResponse.json({ message: 'Siswa tidak terdaftar di kelas ini' }, { status: 400 });
        const status = String(r?.status ?? '');
        const where = { sesiId_userId: { sesiId: sesi.id, userId } };
        if (!status) { if (ada.has(userId)) ops.push(prisma.presensi.delete({ where })); continue; }
        if (!(STATUS as readonly string[]).includes(status)) return NextResponse.json({ message: 'Status harus H, I, S, atau A' }, { status: 400 });
        const keterangan = teks(r?.keterangan, 300);
        ops.push(prisma.presensi.upsert({
          where,
          update: { status, keterangan },
          create: { sesiId: sesi.id, userId, status, keterangan },
        }));
      }
      await prisma.$transaction(ops);
      // Presensi mandiri (Hadir) yang diubah guru ke status lain bukan lagi "mandiri"
      await prisma.presensi.updateMany({ where: { sesiId: sesi.id, mandiri: true, status: { not: 'H' } }, data: { mandiri: false } });
      await createAuditLog({ action: 'ISI_PRESENSI', target: `Presensi #${sesi.id} ${sesi.judul}`, details: { jumlah: list.length }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: 'Presensi disimpan' });
    }

    if (body.aksi === 'ubah') {
      const hasil = dataSesi(body);
      if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
      const data = await prisma.sesiPresensi.update({
        where: { id: sesi.id },
        data: { ...hasil.data, ...(body.gantiKode ? { kode: kodeBaru() } : {}) },
      });
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ message: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR PUT PRESENSI:', error);
    return NextResponse.json({ message: 'Gagal menyimpan presensi' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const sesi = await prisma.sesiPresensi.findUnique({ where: { id } });
    const akses = sesi ? await aksesMapel(auth.user, sesi.mapelId) : null;
    if (!sesi || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Pertemuan tidak ditemukan' }, { status: 404 });
    await prisma.$transaction([
      prisma.presensi.deleteMany({ where: { sesiId: id } }),
      prisma.sesiPresensi.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_PRESENSI', target: `Presensi #${id} ${sesi.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Pertemuan dihapus' });
  } catch (error) {
    console.error('ERROR DELETE PRESENSI:', error);
    return NextResponse.json({ message: 'Gagal menghapus pertemuan' }, { status: 500 });
  }
}
