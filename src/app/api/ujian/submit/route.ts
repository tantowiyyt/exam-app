import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { verifyCsrfToken } from '@/lib/csrf';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';
import { muatKonteks, gabungJawaban, parseJawaban, nilaiDanSimpan, GRACE_MS } from '@/lib/sesi-ujian';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    // CSRF protection
    if (!(await verifyCsrfToken(request))) {
      return NextResponse.json({ message: 'Token CSRF tidak valid' }, { status: 403 });
    }

    const ctx = await muatKonteks(session.nomorPeserta);
    if ('error' in ctx) {
      // Sudah dinilai (mis. otomatis oleh server / pengawas) -> beri tahu klien
      return NextResponse.json({ message: ctx.error }, { status: ctx.httpStatus });
    }
    const { user, ujian, sesi, tahap, status } = ctx;

    // Waktu mulai & tenggat ditentukan server (sesi), bukan dari klien.
    // Jawaban kiriman terakhir hanya diterima bila masih dalam batas waktu (+ toleransi jaringan);
    // selebihnya dinilai dari jawaban yang sudah tersimpan otomatis.
    const body = await request.json().catch(() => ({}));
    const masihWaktu = !status.habis && Date.now() <= status.tenggat + GRACE_MS;
    const jawaban = masihWaktu
      ? gabungJawaban(sesi, tahap, status, { jawaban: body.jawabanPeserta }).jawaban
      : parseJawaban(sesi);

    const hasil = await nilaiDanSimpan({ user, ujian, jawaban, waktuMulai: sesi.waktuMulai, sesiId: sesi.id });

    await createAuditLog({
      action: AUDIT_ACTIONS.SUBMIT_UJIAN,
      target: `Peserta ${user.nomorPeserta}`,
      details: { ujianId: ujian?.id ?? null, nilaiAkhir: hasil.nilaiAkhir, totalSoal: hasil.totalSoal, tepatWaktu: masihWaktu },
      ipAddress: getAuditIP(request),
    });

    return NextResponse.json({ success: true, ...hasil });
  } catch (error) {
    console.error('ERROR SAAT SUBMIT UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memproses & menyimpan nilai' }, { status: 500 });
  }
}
