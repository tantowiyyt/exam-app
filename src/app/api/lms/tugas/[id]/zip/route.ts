import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, daftarBerkas } from '@/lib/lms';
import { LMS_DIR } from '@/lib/storage';
import { buatZip } from '@/lib/zip';

const aman = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').trim().slice(0, 120) || 'file';

// Pengelola: unduh semua jawaban (teks + lampiran) satu tugas dalam satu ZIP, satu folder per siswa
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/tugas/[id]/zip'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const tugas = await prisma.tugas.findUnique({ where: { id: Number((await ctx.params).id) } });
    const akses = tugas ? await aksesMapel(auth.user, tugas.mapelId) : null;
    if (!tugas || akses?.peran !== 'kelola') return NextResponse.json({ message: 'Tugas tidak ditemukan' }, { status: 404 });

    const pengumpulan = await prisma.pengumpulanTugas.findMany({
      where: { tugasId: tugas.id },
      include: { user: { select: { nomorPeserta: true, nama: true } } },
      orderBy: { user: { nama: 'asc' } },
    });
    if (!pengumpulan.length) return NextResponse.json({ message: 'Belum ada siswa yang mengumpulkan' }, { status: 404 });

    const files: { nama: string; data: Buffer }[] = [];
    for (const p of pengumpulan) {
      const folder = aman(`${p.user.nomorPeserta} - ${p.user.nama}`);
      if (p.jawaban) files.push({ nama: `${folder}/jawaban.txt`, data: Buffer.from(p.jawaban, 'utf8') });
      const berkas = daftarBerkas(p);
      for (let i = 0; i < berkas.length; i++) {
        const fileName = berkas[i].url.split('/').pop()!;
        try {
          const data = await readFile(join(LMS_DIR, fileName));
          const ext = fileName.split('.').pop();
          const nama = aman(berkas[i].nama.replace(/\.[a-z0-9]+$/i, ''));
          files.push({ nama: `${folder}/${i + 1}. ${nama}.${ext}`, data });
        } catch {
          // file hilang dari storage — lewati
        }
      }
    }

    const zip = buatZip(files);
    const namaZip = `${aman(`${akses.mapel.kelas.nama} - ${tugas.judul}`)}.zip`;
    return new Response(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="jawaban.zip"; filename*=UTF-8''${encodeURIComponent(namaZip)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('ERROR ZIP TUGAS:', error);
    return NextResponse.json({ message: 'Gagal membuat ZIP' }, { status: 500 });
  }
}
