import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRole } from '@/lib/admin-auth';
import { teks } from '@/lib/lms';
import { whereKontak, bolehKirim, LABEL_PERAN } from '@/lib/pesan';

// Pesan pribadi. GET: daftar percakapan | ?dengan=id (isi percakapan, ditandai dibaca) | ?kontak=1&q= (akun yang boleh dihubungi)
// | ?belum=1 (jumlah pesan belum dibaca). POST { ke, isi }.

const SEMUA = ['ADMIN', 'GURU', 'PENGAWAS', 'PESERTA', 'ORANGTUA'] as const;
const batasKirim = new Map<number, number[]>();
const pilihUser = { id: true, nama: true, role: true, nomorPeserta: true, kelas: true } as const;
const info = (u: { id: number; nama: string; role: string; nomorPeserta: string; kelas: string }) =>
  ({ id: u.id, nama: u.nama, peran: LABEL_PERAN[u.role] ?? u.role, keterangan: u.role === 'PESERTA' ? u.kelas : u.role === 'ADMIN' || u.role === 'GURU' ? '' : u.nomorPeserta });

export async function GET(request: Request) {
  const auth = await verifyRole([...SEMUA]);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    const q = new URL(request.url).searchParams;

    if (q.get('belum')) return NextResponse.json({ belum: await prisma.pesan.count({ where: { keId: user.id, dibacaAt: null } }) });

    if (q.get('kontak')) {
      const cari = teks(q.get('q'), 50);
      const list = await prisma.user.findMany({
        where: { AND: [await whereKontak(user), ...(cari ? [{ OR: [{ nama: { contains: cari } }, { nomorPeserta: { contains: cari } }, { kelas: { contains: cari } }] }] : [])] },
        select: pilihUser, orderBy: [{ role: 'asc' }, { nama: 'asc' }], take: 50,
      });
      return NextResponse.json({ kontak: list.map(info) });
    }

    const dengan = Number(q.get('dengan'));
    if (dengan) {
      const lawan = await prisma.user.findUnique({ where: { id: dengan }, select: pilihUser });
      if (!lawan) return NextResponse.json({ message: 'Akun tidak ditemukan' }, { status: 404 });
      const pesan = await prisma.pesan.findMany({
        where: { OR: [{ dariId: user.id, keId: dengan }, { dariId: dengan, keId: user.id }] },
        orderBy: { id: 'desc' }, take: 200,
      });
      if (!pesan.length && !(await bolehKirim(user, dengan))) return NextResponse.json({ message: 'Akun tidak ditemukan' }, { status: 404 });
      await prisma.pesan.updateMany({ where: { dariId: dengan, keId: user.id, dibacaAt: null }, data: { dibacaAt: new Date() } });
      return NextResponse.json({
        lawan: info(lawan),
        bolehBalas: await bolehKirim(user, dengan),
        pesan: pesan.reverse().map((p) => ({ id: p.id, saya: p.dariId === user.id, isi: p.isi, waktu: p.createdAt, dibaca: !!p.dibacaAt })),
      });
    }

    // Daftar percakapan: pesan terakhir per lawan bicara + jumlah belum dibaca
    const terbaru = await prisma.pesan.findMany({ where: { OR: [{ dariId: user.id }, { keId: user.id }] }, orderBy: { id: 'desc' }, take: 1000 });
    const per = new Map<number, { terakhir: typeof terbaru[number]; belum: number }>();
    for (const p of terbaru) {
      const lawan = p.dariId === user.id ? p.keId : p.dariId;
      const x = per.get(lawan) ?? { terakhir: p, belum: 0 };
      if (p.keId === user.id && !p.dibacaAt) x.belum++;
      per.set(lawan, x);
    }
    const users = await prisma.user.findMany({ where: { id: { in: [...per.keys()] } }, select: pilihUser });
    return NextResponse.json({
      percakapan: [...per.entries()].filter(([id]) => users.some((u) => u.id === id)).map(([id, x]) => ({
        lawan: info(users.find((u) => u.id === id)!), belum: x.belum,
        terakhir: { isi: x.terakhir.isi.slice(0, 120), waktu: x.terakhir.createdAt, saya: x.terakhir.dariId === user.id },
      })),
    });
  } catch (error) {
    console.error('ERROR GET PESAN:', error);
    return NextResponse.json({ message: 'Gagal memuat pesan' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyRole([...SEMUA]);
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { user } = auth;
    const body = await request.json();
    const isi = teks(body.isi, 2000);
    const ke = Number(body.ke);
    if (!isi) return NextResponse.json({ message: 'Pesan tidak boleh kosong' }, { status: 400 });
    if (!(await bolehKirim(user, ke))) return NextResponse.json({ message: 'Anda tidak bisa mengirim pesan ke akun ini' }, { status: 403 });
    // Batas 20 pesan per menit per akun (mencegah spam)
    const now = Date.now();
    const jejak = (batasKirim.get(user.id) ?? []).filter((t) => now - t < 60000);
    if (jejak.length >= 20) return NextResponse.json({ message: 'Terlalu banyak pesan. Tunggu sebentar.' }, { status: 429 });
    batasKirim.set(user.id, [...jejak, now]);
    const p = await prisma.pesan.create({ data: { dariId: user.id, keId: ke, isi } });
    return NextResponse.json({ success: true, data: { id: p.id, saya: true, isi: p.isi, waktu: p.createdAt, dibaca: false } });
  } catch (error) {
    console.error('ERROR POST PESAN:', error);
    return NextResponse.json({ message: 'Gagal mengirim pesan' }, { status: 500 });
  }
}
