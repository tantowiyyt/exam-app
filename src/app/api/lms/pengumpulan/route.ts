import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, lampiranValid } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Siswa mengumpulkan / memperbarui jawaban tugas (boleh terlambat — ditandai dari waktu kumpul)
export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const tugas = await prisma.tugas.findUnique({ where: { id: Number(body.tugasId) } });
    const akses = tugas ? await aksesMapel(auth.user, tugas.mapelId) : null;
    if (!tugas || akses?.peran !== 'siswa' || !tugas.terbit) {
      return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    }

    const jawaban = teks(body.jawaban, 50000);
    if (body.lampiran && !lampiranValid(body.lampiran)) return NextResponse.json({ message: 'Lampiran tidak valid' }, { status: 400 });
    if (!jawaban && !body.lampiran) return NextResponse.json({ message: 'Isi jawaban atau lampirkan file' }, { status: 400 });

    const ada = await prisma.pengumpulanTugas.findUnique({ where: { tugasId_userId: { tugasId: tugas.id, userId: auth.user.id } } });
    if (ada?.nilai !== null && ada?.nilai !== undefined) {
      return NextResponse.json({ message: 'Tugas sudah dinilai guru, jawaban tidak dapat diubah' }, { status: 409 });
    }

    const data = {
      jawaban,
      lampiran: body.lampiran ? String(body.lampiran) : '',
      namaLampiran: body.lampiran ? teks(body.namaLampiran, 200) : '',
      dikumpulkanAt: new Date(),
    };
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

// Guru memberi nilai & catatan (nilai kosong = batalkan penilaian)
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const p = await prisma.pengumpulanTugas.findUnique({ where: { id: Number(body.id) }, include: { tugas: true } });
    const akses = p ? await aksesMapel(auth.user, p.tugas.mapelId) : null;
    if (!p || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Pengumpulan tidak ditemukan' }, { status: 404 });

    let nilai: number | null = null;
    if (body.nilai !== null && body.nilai !== undefined && body.nilai !== '') {
      nilai = Number(body.nilai);
      if (!Number.isInteger(nilai) || nilai < 0 || nilai > p.tugas.nilaiMaks) {
        return NextResponse.json({ message: `Nilai harus bilangan bulat 0–${p.tugas.nilaiMaks}` }, { status: 400 });
      }
    }

    const hasil = await prisma.pengumpulanTugas.update({
      where: { id: p.id },
      data: { nilai, catatanGuru: teks(body.catatanGuru, 5000), dinilaiAt: nilai === null ? null : new Date() },
    });
    await createAuditLog({ action: 'NILAI_TUGAS', target: `Tugas #${p.tugasId} user #${p.userId}`, details: { nilai }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: hasil });
  } catch (error) {
    console.error('ERROR NILAI TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan nilai' }, { status: 500 });
  }
}
