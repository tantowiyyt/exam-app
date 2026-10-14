import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks } from '@/lib/lms';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { bacaJson, batasWaktu, waktuHabis, selesaikan, soalTanpaKunci, statusBuka } from '@/lib/kuis';

/** Jawaban dari body: hanya id soal kuis ini, teks dibatasi. */
function bersihkan(raw: unknown, ids: Set<number>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ids.has(Number(k)) && (typeof v === 'string' || typeof v === 'number')) out[k] = String(v).slice(0, 10000);
  }
  return out;
}

/**
 * Siswa mengerjakan kuis.
 * aksi "mulai": buka percobaan baru (atau lanjutkan yang sedang berjalan) -> soal tanpa kunci.
 * aksi "simpan": simpan jawaban sementara. aksi "selesai": kumpulkan & nilai.
 * Waktu dihitung server; percobaan yang lewat batas dinilai dari jawaban tersimpan.
 * Mode ujian (CAT per mapel): mulai butuh token (bila diatur), aksi "pelanggaran" mencatat pindah tab /
 * keluar layar penuh — pelanggaran ke-N (maksPelanggaran) = jawaban dikumpulkan otomatis.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/lms/kuis/[id]/kerjakan'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const kuis = await prisma.kuis.findUnique({ where: { id: Number((await ctx.params).id) } });
    const akses = kuis ? await aksesMapel(user, kuis.mapelId) : null;
    if (!kuis || akses?.peran !== 'siswa' || !kuis.terbit) return NextResponse.json({ message: 'Kuis tidak ditemukan' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const semua = await prisma.percobaanKuis.findMany({ where: { kuisId: kuis.id, userId: user.id }, orderBy: { ke: 'asc' } });
    let aktif = semua.find((p) => !p.selesaiAt);
    if (aktif && waktuHabis(kuis, aktif, body.aksi !== 'mulai')) {
      // Waktu habis: nilai dari jawaban terakhir yang tersimpan
      await selesaikan(aktif, kuis.id);
      aktif = undefined;
      if (body.aksi !== 'mulai') return NextResponse.json({ message: 'Waktu mengerjakan sudah habis. Jawaban yang tersimpan sudah dinilai.' }, { status: 409 });
    }

    if (body.aksi === 'mulai') {
      if (!aktif) {
        const status = statusBuka(kuis);
        if (status === 'belum') return NextResponse.json({ message: 'Kuis belum dibuka' }, { status: 409 });
        if (status === 'tutup') return NextResponse.json({ message: 'Kuis sudah ditutup' }, { status: 409 });
        if (semua.length >= kuis.maksPercobaan) return NextResponse.json({ message: kuis.modeUjian ? 'Anda sudah mengerjakan ujian ini' : 'Kesempatan mengerjakan sudah habis' }, { status: 409 });
        if (kuis.modeUjian && kuis.token) {
          const batasCoba = checkRateLimit(`token-ujian:${user.id}`);
          if (!batasCoba.allowed) return NextResponse.json({ message: `Terlalu banyak percobaan token. Coba lagi dalam ${Math.ceil(batasCoba.retryAfterMs / 60000)} menit.` }, { status: 429 });
          if (teks(body.token, 20).toUpperCase().replace(/\s+/g, '') !== kuis.token) {
            return NextResponse.json({ message: 'Token ujian salah. Minta token kepada guru/pengawas.', perluToken: true }, { status: 403 });
          }
          resetRateLimit(`token-ujian:${user.id}`);
        }
        const ke = Math.max(0, ...semua.map((p) => p.ke)) + 1;
        try {
          aktif = await prisma.percobaanKuis.create({ data: { kuisId: kuis.id, userId: user.id, ke } });
        } catch (e) {
          // Klik ganda: percobaan yang sama sudah dibuat permintaan lain
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          aktif = (await prisma.percobaanKuis.findFirst({ where: { kuisId: kuis.id, userId: user.id, selesaiAt: null } }))!;
        }
      }
      const soal = await prisma.soalKuis.findMany({ where: { kuisId: kuis.id } });
      return NextResponse.json({
        percobaan: { id: aktif.id, ke: aktif.ke, mulaiAt: aktif.mulaiAt, batas: batasWaktu(kuis, aktif), pelanggaran: aktif.pelanggaran },
        modeUjian: kuis.modeUjian,
        maksPelanggaran: kuis.maksPelanggaran,
        soal: soalTanpaKunci(soal, kuis.acakSoal, aktif.id),
        jawaban: bacaJson(aktif.jawaban, {}),
        serverNow: new Date(),
      });
    }

    if (!aktif) return NextResponse.json({ message: 'Tidak ada kuis yang sedang dikerjakan' }, { status: 409 });

    if (body.aksi === 'pelanggaran') {
      if (!kuis.modeUjian) return NextResponse.json({ message: 'Aksi tidak dikenal' }, { status: 400 });
      const p = await prisma.percobaanKuis.update({ where: { id: aktif.id }, data: { pelanggaran: { increment: 1 } } });
      if (p.pelanggaran >= kuis.maksPelanggaran) {
        await selesaikan(p, kuis.id);
        return NextResponse.json({ success: true, pelanggaran: p.pelanggaran, selesai: true, message: `Batas pelanggaran (${kuis.maksPelanggaran}) tercapai. Jawaban dikumpulkan otomatis.` });
      }
      return NextResponse.json({ success: true, pelanggaran: p.pelanggaran, selesai: false });
    }
    const ids = new Set((await prisma.soalKuis.findMany({ where: { kuisId: kuis.id }, select: { id: true } })).map((s) => s.id));
    const jawaban = bersihkan(body.jawaban, ids);

    if (body.aksi === 'simpan') {
      await prisma.percobaanKuis.update({ where: { id: aktif.id }, data: { jawaban: JSON.stringify(jawaban) } });
      return NextResponse.json({ success: true });
    }
    if (body.aksi === 'selesai') {
      const hasil = await selesaikan(aktif, kuis.id, jawaban);
      // Mode ujian: nilai baru terlihat setelah guru mengumumkan
      const umum = !kuis.modeUjian || !!(await prisma.ujianManual.findFirst({ where: { kuisId: kuis.id, terbit: true } }));
      return NextResponse.json({ success: true, data: { id: hasil.id, nilai: umum ? hasil.nilai : null, perluDinilai: hasil.perluDinilai } });
    }
    return NextResponse.json({ message: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR KERJAKAN KUIS:', error);
    return NextResponse.json({ message: 'Gagal memproses kuis' }, { status: 500 });
  }
}
