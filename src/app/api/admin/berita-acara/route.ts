import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyStaffSession, ruangPengawas } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { teks } from '@/lib/lms';
import { INCLUDE_TARGET, labelPeserta, wherePeserta } from '@/lib/ujian-peserta';

// Berita acara & daftar hadir ujian CAT sekolah per ruang & sesi (admin & pengawas; pengawas hanya ruangnya).
// GET ?ujian=id&ruang=&sesi= -> daftar ujian, ruang/sesi yang ada, peserta + kehadiran (punya sesi ujian = hadir), berita acara tersimpan.
// PUT { ujian, ruang, sesi, mulai?, selesai?, catatan, tidakHadir: [{userId, keterangan}] }

export async function GET(request: Request) {
  const auth = await verifyStaffSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const q = new URL(request.url).searchParams;
    const ruangSaya = ruangPengawas(auth.user);
    const semua = await prisma.ujian.findMany({ include: INCLUDE_TARGET, orderBy: [{ isActive: 'desc' }, { id: 'desc' }], take: 50 });
    const daftarUjian = semua.map((u) => ({ id: u.id, nama: u.nama, aktif: u.isActive, peserta: labelPeserta(u) }));
    const ujian = semua.find((u) => u.id === Number(q.get('ujian'))) ?? semua.find((u) => u.isActive) ?? semua[0];
    if (!ujian) return NextResponse.json({ daftarUjian, ujian: null, ruangSesi: [], peserta: [] });

    const peserta = await prisma.user.findMany({
      where: { AND: [wherePeserta(ujian), ...(ruangSaya ? [{ ruang: ruangSaya }] : [])] },
      select: { id: true, nomorPeserta: true, nama: true, kelas: true, ruang: true, sesi: true },
      orderBy: [{ ruang: 'asc' }, { sesi: 'asc' }, { nomorPeserta: 'asc' }],
    });
    const kombinasi = [...new Map(peserta.map((p) => [`${p.ruang}|${p.sesi}`, { ruang: p.ruang, sesi: p.sesi }])).values()];
    const ruang = q.get('ruang') ?? kombinasi[0]?.ruang ?? '';
    const sesi = q.get('sesi') ?? kombinasi.find((k) => k.ruang === ruang)?.sesi ?? '';
    if (ruangSaya && ruang !== ruangSaya) return NextResponse.json({ message: `Anda pengawas ruang ${ruangSaya}` }, { status: 403 });
    const diRuang = peserta.filter((p) => p.ruang === ruang && p.sesi === sesi);
    const [sesiUjian, ba] = await Promise.all([
      prisma.sesiUjian.findMany({ where: { ujianId: ujian.id, userId: { in: diRuang.map((p) => p.id) } }, select: { userId: true, waktuMulai: true, selesai: true } }),
      prisma.beritaAcara.findUnique({ where: { ujianId_ruang_sesi: { ujianId: ujian.id, ruang, sesi } } }),
    ]);
    let ket: { userId: number; keterangan: string }[] = [];
    try { ket = JSON.parse(ba?.tidakHadir || '[]'); } catch { ket = []; }
    const mulaiPertama = sesiUjian.map((s) => s.waktuMulai.getTime()).sort((a, b) => a - b)[0];
    return NextResponse.json({
      daftarUjian,
      ujian: { id: ujian.id, nama: ujian.nama, durasiMenit: ujian.durasiMenit, jadwalMulai: ujian.jadwalMulai, jadwalSelesai: ujian.jadwalSelesai, peserta: labelPeserta(ujian) },
      ruangSesi: kombinasi,
      ruang, sesi,
      peserta: diRuang.map((p) => {
        const s = sesiUjian.find((x) => x.userId === p.id);
        return { ...p, hadir: !!s, selesai: !!s?.selesai, waktuMulai: s?.waktuMulai ?? null, keterangan: ket.find((k) => k.userId === p.id)?.keterangan ?? '' };
      }),
      beritaAcara: ba ? { mulai: ba.mulai, selesai: ba.selesai, catatan: ba.catatan, namaPengawas: ba.namaPengawas, updatedAt: ba.updatedAt } : null,
      saranMulai: mulaiPertama ? new Date(mulaiPertama) : ujian.jadwalMulai,
      pengawas: auth.user.nama,
    });
  } catch (error) {
    console.error('ERROR GET BERITA ACARA:', error);
    return NextResponse.json({ message: 'Gagal memuat berita acara' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyStaffSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const ujian = await prisma.ujian.findUnique({ where: { id: Number(body.ujian) } });
    if (!ujian) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const ruang = teks(body.ruang, 50);
    const sesi = teks(body.sesi, 20);
    const ruangSaya = ruangPengawas(auth.user);
    if (ruangSaya && ruang !== ruangSaya) return NextResponse.json({ message: `Anda pengawas ruang ${ruangSaya}` }, { status: 403 });
    const waktu = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); return isNaN(d.getTime()) ? undefined : d; };
    const mulai = waktu(body.mulai);
    const selesai = waktu(body.selesai);
    if (mulai === undefined || selesai === undefined) return NextResponse.json({ message: 'Waktu tidak valid' }, { status: 400 });
    if (mulai && selesai && selesai < mulai) return NextResponse.json({ message: 'Waktu selesai harus setelah waktu mulai' }, { status: 400 });
    const tidakHadir = (Array.isArray(body.tidakHadir) ? body.tidakHadir : []).slice(0, 500)
      .map((x: { userId?: unknown; keterangan?: unknown }) => ({ userId: Number(x?.userId), keterangan: teks(x?.keterangan, 200) }))
      .filter((x: { userId: number; keterangan: string }) => Number.isInteger(x.userId) && x.keterangan);
    const data = { mulai, selesai, catatan: teks(body.catatan, 5000), tidakHadir: JSON.stringify(tidakHadir), pengawasId: auth.user.id, namaPengawas: auth.user.nama };
    await prisma.beritaAcara.upsert({
      where: { ujianId_ruang_sesi: { ujianId: ujian.id, ruang, sesi } },
      update: data,
      create: { ...data, ujianId: ujian.id, ruang, sesi },
    });
    await createAuditLog({ action: 'BERITA_ACARA', target: `Ujian #${ujian.id} ruang ${ruang} sesi ${sesi}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Berita acara disimpan' });
  } catch (error) {
    console.error('ERROR PUT BERITA ACARA:', error);
    return NextResponse.json({ message: 'Gagal menyimpan berita acara' }, { status: 500 });
  }
}
