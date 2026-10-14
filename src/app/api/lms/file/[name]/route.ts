import { readFile } from 'fs/promises';
import { join } from 'path';
import { verifyLmsSession, bolehBukaLampiran } from '@/lib/lms';
import { LMS_DIR } from '@/lib/storage';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  txt: 'text/plain; charset=utf-8',
};
// Dibuka langsung di browser; selain ini diunduh
const INLINE = new Set(['pdf', 'jpg', 'jpeg', 'png']);

// Menyajikan lampiran LMS hanya untuk anggota/pengelola mapel pemiliknya (lihat bolehBukaLampiran)
export async function GET(_request: Request, ctx: RouteContext<'/api/lms/file/[name]'>) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return new Response(auth.message, { status: auth.status });

  const { name } = await ctx.params;
  const match = /^[\w-]+\.([a-z0-9]+)$/i.exec(name);
  const ext = match?.[1].toLowerCase();
  if (!ext || !TYPES[ext]) return new Response('Tidak ditemukan', { status: 404 });

  if (!(await bolehBukaLampiran(auth.user, `/api/lms/file/${name}`))) {
    return new Response('Tidak ditemukan', { status: 404 });
  }

  try {
    const data = await readFile(join(LMS_DIR, name));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': TYPES[ext],
        'Content-Disposition': `${INLINE.has(ext) ? 'inline' : 'attachment'}; filename="${name}"`,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Tidak ditemukan', { status: 404 });
  }
}
