import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, mapelDariTarget, teks } from '@/lib/lms';

// Diskusi di materi / tugas / pengumuman. Target dikirim sebagai materiId, tugasId, atau pengumumanId.
function bacaTarget(src: { get(k: string): string | null } | Record<string, unknown>) {
  const ambil = (k: string) => Number('get' in src && typeof src.get === 'function' ? src.get(k) : (src as Record<string, unknown>)[k]) || undefined;
  const t = { materiId: ambil('materiId'), tugasId: ambil('tugasId'), pengumumanId: ambil('pengumumanId') };
  return Object.values(t).filter(Boolean).length === 1 ? t : null;
}

async function cekAkses(user: { id: number; role: string }, target: NonNullable<ReturnType<typeof bacaTarget>>) {
  const pemilik = await mapelDariTarget(target, user.id);
  if (!pemilik) return null;
  const akses = await aksesMapel(user, pemilik.mapelId);
  if (!akses || (akses.peran === 'siswa' && !pemilik.terbit)) return null;
  return akses;
}

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const target = bacaTarget(new URL(request.url).searchParams);
    const akses = target ? await cekAkses(auth.user, target) : null;
    if (!target || !akses) return NextResponse.json({ message: 'Tidak ditemukan' }, { status: 404 });

    const komentar = await prisma.komentar.findMany({
      where: target,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, nama: true, role: true } } },
    });
    return NextResponse.json({
      komentar: komentar.map((k) => ({
        id: k.id, isi: k.isi, createdAt: k.createdAt,
        penulis: k.user.nama, peranPenulis: k.user.role,
        bolehHapus: k.userId === auth.user.id || akses.peran === 'kelola',
      })),
    });
  } catch (error) {
    console.error('ERROR GET KOMENTAR:', error);
    return NextResponse.json({ message: 'Gagal memuat diskusi' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const target = bacaTarget(body);
    const akses = target ? await cekAkses(auth.user, target) : null;
    if (!target || !akses) return NextResponse.json({ message: 'Tidak ditemukan' }, { status: 404 });
    const isi = teks(body.isi, 2000);
    if (!isi) return NextResponse.json({ message: 'Komentar tidak boleh kosong' }, { status: 400 });

    const k = await prisma.komentar.create({ data: { ...target, userId: auth.user.id, isi } });
    return NextResponse.json({ success: true, data: k });
  } catch (error) {
    console.error('ERROR POST KOMENTAR:', error);
    return NextResponse.json({ message: 'Gagal mengirim komentar' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    const k = await prisma.komentar.findUnique({ where: { id } });
    if (!k) return NextResponse.json({ message: 'Komentar tidak ditemukan' }, { status: 404 });
    const target = { materiId: k.materiId ?? undefined, tugasId: k.tugasId ?? undefined, pengumumanId: k.pengumumanId ?? undefined };
    const akses = await cekAkses(auth.user, target);
    if (!akses || (k.userId !== auth.user.id && akses.peran !== 'kelola')) {
      return NextResponse.json({ message: 'Tidak dapat menghapus komentar ini' }, { status: 403 });
    }
    await prisma.komentar.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Komentar dihapus' });
  } catch (error) {
    console.error('ERROR DELETE KOMENTAR:', error);
    return NextResponse.json({ message: 'Gagal menghapus komentar' }, { status: 500 });
  }
}
