import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, berkasDariBody, kolomBerkas, kodeSiswa, idSiswa, jadwalTerbit, topikValid, rubrikDariBody } from '@/lib/lms';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

async function dataTugas(body: Record<string, unknown>, kelas: string, mapelId: number) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Judul tugas wajib diisi' } as const;
  const lampiran = berkasDariBody(body);
  if ('error' in lampiran) return { error: lampiran.error } as const;
  let tenggat: Date | null = null;
  if (body.tenggat) {
    tenggat = new Date(String(body.tenggat));
    if (isNaN(tenggat.getTime())) return { error: 'Tenggat tidak valid' } as const;
  }
  // Dengan rubrik, nilai maksimal = jumlah skor maksimal tiap kriteria
  const rubrik = rubrikDariBody(body.rubrik);
  if ('error' in rubrik) return { error: rubrik.error } as const;
  const nilaiMaks = rubrik.rubrik.length ? rubrik.rubrik.reduce((a, r) => a + r.maks, 0) : Math.floor(Number(body.nilaiMaks ?? 100));
  if (!Number.isFinite(nilaiMaks) || nilaiMaks < 1 || nilaiMaks > 1000) return { error: 'Nilai maksimal 1–1000' } as const;

  const terbitPada = jadwalTerbit(body.terbitPada);
  if (terbitPada === undefined) return { error: 'Jadwal terbit tidak valid' } as const;
  const topikId = await topikValid(body.topikId, mapelId);
  if (topikId === undefined) return { error: 'Topik tidak ditemukan di mapel ini' } as const;

  // Penugasan ke siswa tertentu: hanya siswa di kelas mapel ini
  const untukSiswa = kodeSiswa(body.untukSiswa);
  if (untukSiswa) {
    const ids = idSiswa(untukSiswa);
    const valid = await prisma.user.count({ where: { id: { in: ids }, role: 'PESERTA', kelas } });
    if (valid !== ids.length) return { error: 'Siswa yang dipilih harus anggota kelas ini' } as const;
  }

  return {
    data: {
      judul,
      deskripsi: teks(body.deskripsi, 50000),
      ...kolomBerkas(lampiran.berkas),
      tenggat,
      terimaTerlambat: body.terimaTerlambat !== false,
      untukSiswa,
      nilaiMaks,
      rubrik: JSON.stringify(rubrik.rubrik),
      terbit: body.terbit !== false,
      terbitPada,
      topikId,
    },
  } as const;
}

/** Salin tugas ke mapel lain yang juga dikelola (sebagai draf, untuk semua siswa kelas tujuan). */
async function salinTugas(request: Request, user: { id: number; role: string }, body: Record<string, unknown>) {
  const sumber = await prisma.tugas.findUnique({ where: { id: Number(body.salinDari) } });
  const aksesSumber = sumber ? await aksesMapel(user, sumber.mapelId) : null;
  if (!sumber || aksesSumber?.peran !== 'kelola') return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });

  const tujuan = Array.isArray(body.mapelIds) ? [...new Set(body.mapelIds.map(Number))].filter((id) => id !== sumber.mapelId) : [];
  if (!tujuan.length) return NextResponse.json({ message: 'Pilih minimal satu mapel tujuan' }, { status: 400 });
  for (const id of tujuan) {
    if ((await aksesMapel(user, id))?.peran !== 'kelola') {
      return NextResponse.json({ message: 'Anda tidak mengelola salah satu mapel tujuan' }, { status: 403 });
    }
  }

  const { judul, deskripsi, lampiran, namaLampiran, lampiranLain, tenggat, terimaTerlambat, nilaiMaks, rubrik } = sumber;
  const dibuat = await prisma.$transaction(tujuan.map((mapelId) => prisma.tugas.create({
    data: { mapelId, judul, deskripsi, lampiran, namaLampiran, lampiranLain, tenggat, terimaTerlambat, nilaiMaks, rubrik, terbit: false },
  })));
  await createAuditLog({ action: 'SALIN_TUGAS', target: `Tugas #${sumber.id} ${sumber.judul}`, details: { ke: tujuan }, ipAddress: getAuditIP(request) });
  return NextResponse.json({ success: true, message: `Tugas disalin ke ${dibuat.length} mapel sebagai draf`, data: dibuat });
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    if (body.salinDari) return salinTugas(request, auth.user, body);

    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = await dataTugas(body, akses.mapel.kelas.nama, akses.mapel.id);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    const tugas = await prisma.tugas.create({ data: { ...hasil.data, mapelId: akses.mapel.id } });
    await createAuditLog({ action: 'CREATE_TUGAS', target: `Tugas #${tugas.id} ${tugas.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: tugas });
  } catch (error) {
    console.error('ERROR POST TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan tugas' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const lama = await prisma.tugas.findUnique({ where: { id: Number(body.id) } });
    if (!lama) return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    const akses = await aksesMapel(auth.user, lama.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });
    const hasil = await dataTugas(body, akses.mapel.kelas.nama, akses.mapel.id);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });

    const tugas = await prisma.tugas.update({ where: { id: lama.id }, data: hasil.data });
    await createAuditLog({ action: 'UPDATE_TUGAS', target: `Tugas #${tugas.id} ${tugas.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data: tugas });
  } catch (error) {
    console.error('ERROR PUT TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menyimpan tugas' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const tugas = await prisma.tugas.findUnique({ where: { id } });
    if (!tugas) return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });
    const akses = await aksesMapel(auth.user, tugas.mapelId);
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tidak memiliki akses ke mapel ini' }, { status: 403 });

    // Pengumpulan & komentar siswa ikut terhapus (UI meminta konfirmasi)
    await prisma.$transaction([
      prisma.komentar.deleteMany({ where: { tugasId: id } }),
      prisma.pengumpulanTugas.deleteMany({ where: { tugasId: id } }),
      prisma.tugas.delete({ where: { id } }),
    ]);
    await createAuditLog({ action: 'DELETE_TUGAS', target: `Tugas #${id} ${tugas.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Tugas dihapus' });
  } catch (error) {
    console.error('ERROR DELETE TUGAS:', error);
    return NextResponse.json({ message: 'Gagal menghapus tugas' }, { status: 500 });
  }
}
