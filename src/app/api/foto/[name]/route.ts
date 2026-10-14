import { readFile } from 'fs/promises';
import { join } from 'path';
import { getSession } from '@/lib/session';
import { FOTO_DIR } from '@/lib/storage';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Menyajikan foto peserta dari storage/fotos (hanya untuk pengguna yang login)
export async function GET(_request: Request, ctx: RouteContext<'/api/foto/[name]'>) {
  const session = await getSession();
  if (!session) return new Response('Tidak terautentikasi', { status: 401 });

  const { name } = await ctx.params;
  const match = /^[\w-]+\.(jpg|jpeg|png|webp)$/i.exec(name);
  if (!match) return new Response('Tidak ditemukan', { status: 404 });

  try {
    const data = await readFile(join(FOTO_DIR, name));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': TYPES[match[1].toLowerCase()],
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Tidak ditemukan', { status: 404 });
  }
}
