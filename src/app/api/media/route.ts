import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { verifyRole } from '@/lib/admin-auth';
import { MEDIA_DIR } from '@/lib/storage';

// Unggah gambar/audio untuk soal (CAT, kuis, bank soal) — admin & guru.
// Disisipkan ke teks soal sebagai [gambar:URL] / [audio:URL]; dibuka semua pengguna yang login.

const IZIN: Record<string, { magic: string[]; maksMb: number }> = {
  jpg: { magic: ['ffd8'], maksMb: 5 }, jpeg: { magic: ['ffd8'], maksMb: 5 }, png: { magic: ['89504e47'], maksMb: 5 },
  gif: { magic: ['47494638'], maksMb: 5 }, webp: { magic: ['52494646'], maksMb: 5 },
  mp3: { magic: ['494433', 'fffb', 'fff3', 'fff2'], maksMb: 15 }, ogg: { magic: ['4f676753'], maksMb: 15 },
  wav: { magic: ['52494646'], maksMb: 15 }, m4a: { magic: [], maksMb: 15 },
};

export async function POST(request: Request) {
  const auth = await verifyRole(['ADMIN', 'GURU']);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const file = (await request.formData()).get('file');
    if (!file || !(file instanceof File)) return NextResponse.json({ message: 'Tidak ada file' }, { status: 400 });
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const aturan = IZIN[ext];
    if (!aturan) return NextResponse.json({ message: 'Format harus gambar (JPG/PNG/GIF/WEBP) atau audio (MP3/OGG/WAV/M4A)' }, { status: 400 });
    if (file.size > aturan.maksMb * 1024 * 1024) return NextResponse.json({ message: `Ukuran file maksimal ${aturan.maksMb} MB` }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const hex = buf.subarray(0, 12).toString('hex');
    // m4a: kotak "ftyp" di byte ke-4
    const cocok = ext === 'm4a' ? hex.slice(8, 16) === '66747970' : aturan.magic.some((m) => hex.startsWith(m));
    if (!cocok) return NextResponse.json({ message: 'Isi file tidak sesuai dengan formatnya' }, { status: 400 });
    const nama = `${randomUUID()}.${ext}`;
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(join(MEDIA_DIR, nama), buf);
    const jenis = ['mp3', 'ogg', 'wav', 'm4a'].includes(ext) ? 'audio' : 'gambar';
    const url = `/api/media/${nama}`;
    return NextResponse.json({ success: true, url, jenis, sisip: `[${jenis}:${url}]` });
  } catch (error) {
    console.error('ERROR UPLOAD MEDIA:', error);
    return NextResponse.json({ message: 'Gagal mengunggah file' }, { status: 500 });
  }
}
