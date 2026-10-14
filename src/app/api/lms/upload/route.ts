import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { verifyLmsSession } from '@/lib/lms';
import { LMS_DIR } from '@/lib/storage';

const MAKS_MB = 10;

// Ekstensi yang diterima -> tanda awal file (magic bytes) yang harus cocok; null = teks biasa
const IZIN: Record<string, string[] | null> = {
  pdf: ['25504446'],
  docx: ['504b0304'], xlsx: ['504b0304'], pptx: ['504b0304'], zip: ['504b0304'],
  doc: ['d0cf11e0'], xls: ['d0cf11e0'], ppt: ['d0cf11e0'],
  jpg: ['ffd8'], jpeg: ['ffd8'], png: ['89504e47'],
  txt: null,
};

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: 'Tidak ada file' }, { status: 400 });
    }
    if (file.size > MAKS_MB * 1024 * 1024) {
      return NextResponse.json({ message: `Ukuran file maksimal ${MAKS_MB} MB` }, { status: 400 });
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!(ext in IZIN)) {
      return NextResponse.json({ message: 'Format file harus PDF, Word, Excel, PowerPoint, gambar (JPG/PNG), TXT, atau ZIP' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const magic = IZIN[ext];
    if (magic && !magic.some((m) => buffer.subarray(0, m.length / 2).toString('hex') === m)) {
      return NextResponse.json({ message: 'Isi file tidak sesuai dengan formatnya' }, { status: 400 });
    }

    const nama = `${randomUUID()}.${ext}`;
    await mkdir(LMS_DIR, { recursive: true });
    await writeFile(join(LMS_DIR, nama), buffer);

    return NextResponse.json({ success: true, url: `/api/lms/file/${nama}`, nama: file.name.slice(0, 200) });
  } catch (error) {
    console.error('ERROR UPLOAD LMS:', error);
    return NextResponse.json({ message: 'Gagal mengunggah file' }, { status: 500 });
  }
}
