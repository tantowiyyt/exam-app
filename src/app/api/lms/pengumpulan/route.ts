import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, berkasDariBody, kolomBerkas, ditugaskan, sudahTerbit, bacaRubrik } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Siswa mengumpulkan / memperbarui jawaban tugas.
// Terlambat boleh (ditandai dari waktu kumpul) kecuali guru mematikan "terima terlambat";
// jawaban yang dikembalikan untuk revisi selalu boleh dikirim ulang.
export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const tugas = await prisma.tugas.findUnique({ where: { id: Number(body.tugasId) } });
    const akses = tugas ? await aksesMapel(auth.user, tugas.mapelId) : null;
    if (!tugas || akses?.peran !== 'siswa' || !sudahTerbit(tugas) || !ditugaskan(tugas, auth.user.id)) {
      return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    }

    const jawaban = teks(body.jawaban, 50000);
    const lampiran = berkasDariBody(body);
    if ('error' in lampiran) return NextResponse.json({ message: lampiran.error }, { status: 400 });
    if (!jawaban && !lampiran.berkas.length) return NextResponse.json({ message: 'Isi jawaban atau lampirkan file' }, { status: 400 });

    const ada = await prisma.pengumpulanTugas.findUnique({ where: { tugasId_userId: { tugasId: tugas.id, userId: auth.user.id } } });
    if (ada?.nilai !== null && ada?.nilai !== undefined) {
      return NextResponse.json({ message: 'Tugas sudah dinilai guru, jawaban tidak dapat diubah' }, { status: 409 });
    }
    const lewat = tugas.tenggat && tugas.tenggat < new Date();
    if (lewat && !tugas.terimaTerlambat && ada?.status !== 'revisi') {
      return NextResponse.json({ message: 'Tenggat sudah lewat. Guru tidak menerima pengumpulan terlambat untuk tugas ini.' }, { status: 409 });
    }

    const data = { jawaban, ...kolomBerkas(lampiran.berkas), status: 'dikumpulkan', dikumpulkanAt: new Date() };
    const pengumpulan = await prisma.pengumpulanTugas.upsert({
      where: { tugasId_userId: { tugasId: tugas.id, userId: auth.user.id } },
      update: data,
      create: { ...data, tugasId: tugas.id, userId: auth.user.id },
    });
    return NextResponse.json({ success: true, data: pengumpulan });
  } catch (error) {
    console.error('ERROR KUMPUL TUGAS:', error);
    return NextResponse.json({ message: 'Gagal mengumpulkan tugas' }, { status: 500 });
  }
}

// Guru memberi nilai & catatan (nilai kosong = batalkan penilaian),
// atau aksi "revisi": kembalikan jawaban ke siswa untuk diperbaiki (catatan wajib).
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const p = await prisma.pengumpulanTugas.findUnique({ where: { id: Number(body.id) }, include: { tugas: true } });
    const akses = p ? await aksesMapel(auth.user, p.tugas.mapelId) : null;
    if (!p || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Pengumpulan tidak ditemukan' }, { status: 404 });

    const catatanGuru = teks(body.catatanGuru, 5000);

    if (body.aksi === 'revisi') {
      if (!catatanGuru) return NextResponse.json({ message: 'Tulis catatan apa yang perlu diperbaiki siswa' }, { status: 400 });
      const hasil = await prisma.pengumpulanTugas.update({
        where: { id: p.id },
        data: { status: 'revisi', nilai: null, nilaiRubrik: '[]', catatanGuru, dinilaiAt: new Date() },
      });
      await createAuditLog({ action: 'REVISI_TUGAS', target: `Tugas #${p.tugasId} user #${p.userId}`, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, data: hasil });
    }

    let nilai: number | null = null;
    const nilaiRubrik: number[] = [];
    const rubrik = bacaRubrik(p.tugas.rubrik);
    if (rubrik.length && Array.isArray(body.rubrik)) {
      // Nilai = jumlah skor tiap kriteria rubrik
      if (body.rubrik.length !== rubrik.length) return NextResponse.json({ message: 'Isi skor untuk semua kriteria rubrik' }, { status: 400 });
      for (const [i, v] of body.rubrik.entries()) {
        const n = Number(v);
        if (v === null || v === '' || !Number.isInteger(n) || n < 0 || n > rubrik[i].maks) {
          return NextResponse.json({ message: `Skor "${rubrik[i].kriteria}" harus bilangan bulat 0–${rubrik[i].maks}` }, { status: 400 });
        }
        nilaiRubrik.push(n);
      }
      nilai = nilaiRubrik.reduce((a, b) => a + b, 0);
    } else if (body.nilai !== null && body.nilai !== undefined && body.nilai !== '') {
      nilai = Number(body.nilai);
      if (!Number.isInteger(nilai) || nilai < 0 || nilai > p.tugas.nilaiMaks) {
        return NextResponse.json({ message: `Nilai harus bilangan bulat 0–${p.tugas.nilaiMaks}` }, { status: 400 });
      }
    }

    const hasil = await prisma.pengumpulanTugas.update({
      where: { id: p.id },
      // Memberi nilai menutup permintaan revisi
      data: { nilai, nilaiRubrik: JSON.stringify(nilaiRubrik), catatanGuru, dinilaiAt: nilai === null ? null : new Date(), ...(nilai !== null ? { status: 'dikumpulkan' } : {}) },
    });
    await createAuditLog({ action: 'NILAI_TUGAS', target: `Tugas #${p.tugasId} user #${p.userId}`, details: { nilai }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: hasil });
  } catch (error) {
    console.error('ERROR NILAI TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan nilai' }, { status: 500 });
  }
}
