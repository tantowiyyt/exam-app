import { open, stat } from 'fs/promises';
import { join } from 'path';
import { getSession } from '@/lib/session';
import { MEDIA_DIR } from '@/lib/storage';

// Media soal (gambar/audio) untuk pengguna yang login. Mendukung Range agar audio bisa diputar & digeser (Safari mewajibkan).
const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
};

export async function GET(request: Request, ctx: RouteContext<'/api/media/[name]'>) {
  if (!(await getSession())) return new Response('Tidak terautentikasi', { status: 401 });
  const { name } = await ctx.params;
  const ext = /^[\w-]+\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
  if (!ext || !TYPES[ext]) return new Response('Tidak ditemukan', { status: 404 });
  const path = join(MEDIA_DIR, name);
  try {
    const { size } = await stat(path);
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
    let start = 0;
    let end = size - 1;
    if (range) {
      if (range[1]) start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
      if (!range[1] && range[2]) { start = Math.max(0, size - Number(range[2])); end = size - 1; }
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const fh = await open(path, 'r');
    const buf = Buffer.alloc(end - start + 1);
    await fh.read(buf, 0, buf.length, start);
    await fh.close();
    return new Response(new Uint8Array(buf), {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': TYPES[ext], 'Content-Length': String(buf.length), 'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
        'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Tidak ditemukan', { status: 404 });
  }
}
