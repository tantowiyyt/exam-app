import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel } from '@/lib/lms';
import { bacaJson, opsiSoal, poinSoal, hitungNilai, hasilDiumumkan } from '@/lib/kuis';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

async function muat(id: number, user: { id: number; role: string }) {
  const p = await prisma.percobaanKuis.findUnique({
    where: { id },
    include: { kuis: true, user: { select: { id: true, nomorPeserta: true, nama: true } } },
  });
  const akses = p ? await aksesMapel(user, p.kuis.mapelId) : null;
  if (!p || !akses) return null;
  if (akses.peran === 'kelola') return { p, kelola: true };
  return p.userId === user.id && p.kuis.terbit ? { p, kelola: false } : null;
}

// Rincian satu percobaan: jawaban per soal + poin.
// Siswa: setelah selesai; kunci & pembahasan hanya bila guru mengizinkan dan kuis sudah ditutup (bila ada waktu tutup).
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/percobaan/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const m = await muat(Number((await ctx.params).id), auth.user);
    if (!m || (!m.kelola && !m.p.selesaiAt)) return NextResponse.json({ message: 'Percobaan tidak ditemukan' }, { status: 404 });
    const { p, kelola } = m;
    if (!kelola && !(await hasilDiumumkan(p.kuis))) return NextResponse.json({ message: 'Hasil ujian belum diumumkan guru' }, { status: 403 });
    const kunciTerbuka = kelola || (p.kuis.tampilkanJawaban && (!p.kuis.selesai || p.kuis.selesai < new Date()));

    const soal = await prisma.soalKuis.findMany({ where: { kuisId: p.kuisId }, orderBy: { urutan: 'asc' } });
    const jawaban = bacaJson<Record<string, unknown>>(p.jawaban, {});
    const skorEsai = bacaJson<Record<string, number>>(p.skorEsai, {});

    return NextResponse.json({
      kelola,
      kunciTerbuka,
      percobaan: {
        id: p.id, ke: p.ke, mulaiAt: p.mulaiAt, selesaiAt: p.selesaiAt, nilai: p.nilai, skor: p.skor, skorMaks: p.skorMaks, perluDinilai: p.perluDinilai,
        siswa: p.user, kuis: { id: p.kuis.id, judul: p.kuis.judul, mapelId: p.kuis.mapelId },
      },
      soal: soal.map((s) => {
        const j = jawaban[s.id] ?? null;
        return {
          id: s.id, tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: opsiSoal(s), bobot: s.bobot, jawaban: j,
          // Esai: nilai guru selalu ditampilkan; soal otomatis: benar/salah hanya bila kunci terbuka
          poin: kunciTerbuka || s.tipe === 'esai' ? poinSoal(s, j, skorEsai) : undefined,
          kunci: kunciTerbuka ? s.kunci : undefined,
          pembahasan: kunciTerbuka ? s.pembahasan : undefined,
        };
      }),
    });
  } catch (error) {
    console.error('ERROR GET PERCOBAAN:', error);
    return NextResponse.json({ message: 'Gagal memuat jawaban' }, { status: 500 });
  }
}

// Guru menilai jawaban esai: { skorEsai: { [soalId]: poin } }
export async function PUT(request: Request, ctx: RouteContext<'/api/lms/percobaan/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const m = await muat(Number((await ctx.params).id), auth.user);
    if (!m?.kelola) return NextResponse.json({ message: 'Percobaan tidak ditemukan' }, { status: 404 });
    const { p } = m;
    if (!p.selesaiAt) return NextResponse.json({ message: 'Siswa belum selesai mengerjakan' }, { status: 409 });

    const body = await request.json();
    const soal = await prisma.soalKuis.findMany({ where: { kuisId: p.kuisId } });
    const skorEsai = bacaJson<Record<string, number>>(p.skorEsai, {});
    for (const [k, v] of Object.entries((body.skorEsai ?? {}) as Record<string, unknown>)) {
      const s = soal.find((x) => x.id === Number(k) && x.tipe === 'esai');
      if (!s) continue;
      if (v === null || v === '') { delete skorEsai[k]; continue; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > s.bobot) return NextResponse.json({ message: `Nilai esai harus 0–${s.bobot}` }, { status: 400 });
      skorEsai[k] = Math.round(n * 10) / 10;
    }

    const n = hitungNilai(soal, bacaJson(p.jawaban, {}), skorEsai);
    const hasil = await prisma.percobaanKuis.update({ where: { id: p.id }, data: { ...n, skorEsai: JSON.stringify(skorEsai) } });
    await createAuditLog({ action: 'NILAI_KUIS', target: `Kuis #${p.kuisId} user #${p.userId}`, details: { nilai: n.nilai }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: hasil });
  } catch (error) {
    console.error('ERROR NILAI KUIS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan nilai' }, { status: 500 });
  }
}

// Guru menghapus percobaan (siswa boleh mengerjakan ulang)
export async function DELETE(request: Request, ctx: RouteContext<'/api/lms/percobaan/[id]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const m = await muat(Number((await ctx.params).id), auth.user);
    if (!m?.kelola) return NextResponse.json({ message: 'Percobaan tidak ditemukan' }, { status: 404 });
    await prisma.percobaanKuis.delete({ where: { id: m.p.id } });
    await createAuditLog({ action: 'RESET_KUIS', target: `Kuis #${m.p.kuisId} user #${m.p.userId}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Percobaan dihapus, siswa bisa mengerjakan ulang' });
  } catch (error) {
    console.error('ERROR RESET KUIS:', error);
    return NextResponse.json({ message: 'Gagal menghapus percobaan' }, { status: 500 });
  }
}
