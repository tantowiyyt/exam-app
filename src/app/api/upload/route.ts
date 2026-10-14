import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getSession } from '@/lib/session';
import { FOTO_DIR } from '@/lib/storage';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: 'Tidak ada file' }, { status: 400 });
    }

    const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      return NextResponse.json({ message: 'Format file harus JPG, PNG, atau WebP' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ message: 'Ukuran file maksimal 2MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Cek magic bytes agar file non-gambar tidak lolos hanya dengan memalsukan Content-Type
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer.subarray(0, 4).toString('hex') === '89504e47';
    const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!({ jpg: isJpeg, png: isPng, webp: isWebp } as Record<string, boolean>)[ext]) {
      return NextResponse.json({ message: 'Isi file bukan gambar yang valid' }, { status: 400 });
    }

    // Ekstensi dari tipe MIME (bukan dari nama file) & nama file disanitasi
    const safeNomor = session.nomorPeserta.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeNomor}-${Date.now()}.${ext}`;
    // Disimpan di luar public/: file yang ditambahkan setelah build tidak disajikan Next.js
    const uploadDir = FOTO_DIR;
    await mkdir(uploadDir, { recursive: true });

    await writeFile(join(uploadDir, filename), buffer);

    const fotoUrl = `/api/foto/${filename}`;

    return NextResponse.json({ success: true, url: fotoUrl });
  } catch (error) {
    console.error('ERROR UPLOAD:', error);
    return NextResponse.json({ message: 'Gagal upload file' }, { status: 500 });
  }
}
