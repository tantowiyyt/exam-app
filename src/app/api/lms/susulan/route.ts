import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, kodeSiswa, idSiswa } from '@/lib/lms';
import { semesterAktif } from '@/lib/semester';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Remedial / pengayaan / susulan dari tugas atau ujian mapel (induk) untuk siswa tertentu.
// { kunci: 't12' | 'm5', tipe: 'remedial' | 'pengayaan' | 'susulan', siswa: number[], judul?, tenggat?, tanggal? }
// Tugas: disalin (deskripsi, lampiran, rubrik, nilai maks) dan ditugaskan ke siswa terpilih.
// Ujian offline: ujian baru (jenis & nilai maks sama). Ujian CAT: kuis ujian baru dengan soal disalin (draf, token baru).
// Nilai digabung ke induk di rekap sesuai Mapel.aturanRemedial (lihat lib/rekap.ts).

const TIPE_SUSULAN = ['remedial', 'pengayaan', 'susulan'] as const;
const LABEL: Record<string, string> = { remedial: 'Remedial', pengayaan: 'Pengayaan', susulan: 'Susulan' };
const HURUF_TOKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const tipe = String(body.tipe ?? '');
    if (!(TIPE_SUSULAN as readonly string[]).includes(tipe)) return NextResponse.json({ message: 'Jenis harus remedial, pengayaan, atau susulan' }, { status: 400 });
    const m = /^([tm])(\d+)$/.exec(String(body.kunci ?? ''));
    if (!m) return NextResponse.json({ message: 'Tugas/ujian induk tidak valid' }, { status: 400 });
    const id = Number(m[2]);
    const induk = m[1] === 't'
      ? await prisma.tugas.findUnique({ where: { id } })
      : await prisma.ujianManual.findUnique({ where: { id } });
    if (!induk) return NextResponse.json({ message: 'Tugas/ujian induk tidak ditemukan' }, { status: 404 });
    if (induk.indukId) return NextResponse.json({ message: 'Tidak bisa membuat susulan dari tugas/ujian susulan' }, { status: 400 });
    const akses = await aksesMapel(auth.user, induk.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });

    const untukSiswa = kodeSiswa(body.siswa);
    if (!untukSiswa) return NextResponse.json({ message: 'Pilih minimal satu siswa' }, { status: 400 });
    const ids = idSiswa(untukSiswa);
    if ((await prisma.user.count({ where: { id: { in: ids }, role: 'PESERTA', kelas: akses.mapel.kelas.nama } })) !== ids.length) {
      return NextResponse.json({ message: 'Siswa yang dipilih harus anggota kelas ini' }, { status: 400 });
    }
    const judulInduk = 'judul' in induk ? induk.judul : '';
    const judul = teks(body.judul, 200) || `${LABEL[tipe]} – ${judulInduk}`;
    const semesterId = (await semesterAktif()).id;
    const tgl = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); return isNaN(d.getTime()) ? undefined : d; };

    let data: { id: number; jenis: 'tugas' | 'ujian' };
    if (m[1] === 't') {
      const t = induk as Awaited<ReturnType<typeof prisma.tugas.findUnique>> & object;
      const tenggat = tgl(body.tenggat);
      if (tenggat === undefined) return NextResponse.json({ message: 'Tenggat tidak valid' }, { status: 400 });
      const baru = await prisma.tugas.create({
        data: {
          mapelId: t.mapelId, judul, deskripsi: teks(body.deskripsi, 50000) || t.deskripsi, lampiran: t.lampiran, namaLampiran: t.namaLampiran, lampiranLain: t.lampiranLain,
          tenggat, terimaTerlambat: t.terimaTerlambat, untukSiswa, nilaiMaks: t.nilaiMaks, rubrik: t.rubrik, terbit: true, topikId: t.topikId,
          indukId: t.id, tipeSusulan: tipe, semesterId,
        },
      });
      data = { id: baru.id, jenis: 'tugas' };
    } else {
      const u = induk as Awaited<ReturnType<typeof prisma.ujianManual.findUnique>> & object;
      const tanggal = tgl(body.tanggal);
      if (tanggal === undefined) return NextResponse.json({ message: 'Tanggal tidak valid' }, { status: 400 });
      const baru = await prisma.$transaction(async (tx) => {
        let kuisId: number | null = null;
        if (u.mode === 'cat' && u.kuisId) {
          const k = await tx.kuis.findUnique({ where: { id: u.kuisId }, include: { soal: { orderBy: { urutan: 'asc' } } } });
          if (k) {
            const kuis = await tx.kuis.create({
              data: {
                mapelId: k.mapelId, judul, deskripsi: k.deskripsi, durasiMenit: k.durasiMenit, maksPercobaan: 1, acakSoal: k.acakSoal, tampilkanJawaban: k.tampilkanJawaban,
                terbit: false, topikId: k.topikId, semesterId, modeUjian: true, maksPelanggaran: k.maksPelanggaran, untukSiswa,
                token: k.token ? Array.from({ length: 6 }, () => HURUF_TOKEN[randomInt(HURUF_TOKEN.length)]).join('') : '',
              },
            });
            if (k.soal.length) await tx.soalKuis.createMany({ data: k.soal.map((s) => ({ kuisId: kuis.id, urutan: s.urutan, tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: s.opsi, kunci: s.kunci, pembahasan: s.pembahasan, bobot: s.bobot })) });
            kuisId = kuis.id;
          }
        }
        return tx.ujianManual.create({
          data: {
            mapelId: u.mapelId, judul, tanggal, nilaiMaks: u.nilaiMaks, keterangan: teks(body.keterangan, 1000), jenis: u.jenis, mode: u.mode, kuisId,
            indukId: u.id, tipeSusulan: tipe, untukSiswa, semesterId,
          },
        });
      });
      data = { id: baru.id, jenis: 'ujian' };
    }
    await createAuditLog({ action: 'CREATE_SUSULAN', target: `${LABEL[tipe]} dari ${body.kunci} ${judulInduk}`, details: { siswa: ids.length, ...data }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: `${LABEL[tipe]} dibuat untuk ${ids.length} siswa`, data });
  } catch (error) {
    console.error('ERROR SUSULAN:', error);
    return NextResponse.json({ message: 'Gagal membuat remedial/susulan' }, { status: 500 });
  }
}
