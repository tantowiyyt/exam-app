import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, mapelPengguna, whereTugasSiswa, whereTerbit } from '@/lib/lms';

const HARI = 30; // notifikasi diambil dari aktivitas 30 hari terakhir
const MAKS = 30;

interface Notif { id: string; jenis: 'tugas' | 'materi' | 'pengumuman' | 'nilai' | 'revisi' | 'kumpul' | 'komentar' | 'kuis' | 'presensi' | 'lencana'; judul: string; isi: string; waktu: Date; href: string }

/**
 * Notifikasi LMS — dihitung dari data yang ada (tidak disimpan terpisah).
 * Siswa: tugas/materi/pengumuman baru, tugas dinilai, tugas dikembalikan untuk revisi.
 * Guru/admin: pengumpulan baru yang belum dinilai, komentar baru di mapel yang dikelola.
 */
export async function GET() {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const sejak = new Date(Date.now() - HARI * 86400000);
    const mapel = await mapelPengguna(user);
    const ids = mapel.map((m) => m.id);
    const namaMapel = new Map(mapel.map((m) => [m.id, user.role === 'PESERTA' ? m.nama : `${m.kelas.nama} · ${m.nama}`]));
    const out: Notif[] = [];

    if (ids.length && user.role === 'PESERTA') {
      // Baru = dibuat dalam 30 hari, atau terbit terjadwal dalam 30 hari
      const baru = { OR: [{ terbitPada: null, createdAt: { gte: sejak } }, { terbitPada: { gte: sejak } }] };
      const [tugas, materi, pengumuman, dinilai, kuis, presensi] = await Promise.all([
        prisma.tugas.findMany({ where: { mapelId: { in: ids }, AND: [whereTugasSiswa(user.id), baru] }, orderBy: { createdAt: 'desc' }, take: MAKS }),
        prisma.materi.findMany({ where: { mapelId: { in: ids }, AND: [whereTerbit(), baru] }, orderBy: { createdAt: 'desc' }, take: MAKS }),
        prisma.pengumuman.findMany({ where: { mapelId: { in: ids }, createdAt: { gte: sejak } }, orderBy: { createdAt: 'desc' }, take: MAKS }),
        prisma.pengumpulanTugas.findMany({
          where: { userId: user.id, dinilaiAt: { gte: sejak }, OR: [{ nilai: { not: null } }, { status: 'revisi' }] },
          include: { tugas: { select: { id: true, judul: true, mapelId: true, nilaiMaks: true } } },
          orderBy: { dinilaiAt: 'desc' }, take: MAKS,
        }),
        // Kuis terbit: waktu notifikasi = waktu buka (atau saat dibuat bila tanpa jadwal)
        prisma.kuis.findMany({
          where: {
            mapelId: { in: ids }, terbit: true, OR: [{ mulai: null, createdAt: { gte: sejak } }, { mulai: { gte: sejak, lte: new Date() } }],
            AND: [{ OR: [{ untukSiswa: '' }, { untukSiswa: { contains: `,${user.id},` } }] }],
          },
          orderBy: { createdAt: 'desc' }, take: MAKS,
        }),
        // Presensi mandiri yang sedang dibuka & belum diisi siswa ini
        prisma.sesiPresensi.findMany({
          where: { mapelId: { in: ids }, bukaSampai: { gt: new Date() }, presensi: { none: { userId: user.id } } },
          orderBy: { createdAt: 'desc' }, take: MAKS,
        }),
      ]);
      // Nilai ujian offline yang diumumkan & siswa ini punya nilainya
      const nilaiUjian = await prisma.nilaiUjianManual.findMany({
        where: { userId: user.id, ujian: { mapelId: { in: ids }, terbit: true, diumumkanAt: { gte: sejak } } },
        include: { ujian: { select: { id: true, judul: true, mapelId: true, nilaiMaks: true, diumumkanAt: true } } },
        take: MAKS,
      });
      for (const n of nilaiUjian) out.push({ id: `u${n.id}`, jenis: 'nilai', judul: `Nilai ${n.ujian.judul}: ${n.nilai}/${n.ujian.nilaiMaks}`, isi: namaMapel.get(n.ujian.mapelId) ?? '', waktu: n.ujian.diumumkanAt!, href: `/kelas/${n.ujian.mapelId}?tab=ujian` });
      // Lencana dari guru
      const lencana = await prisma.lencanaSiswa.findMany({ where: { userId: user.id, createdAt: { gte: sejak } }, orderBy: { createdAt: 'desc' }, take: MAKS });
      for (const l of lencana) out.push({ id: `b${l.id}`, jenis: 'lencana', judul: `Anda mendapat lencana: ${l.judul}`, isi: namaMapel.get(l.mapelId) ?? '', waktu: l.createdAt, href: '/kelas/lencana' });
      for (const p of presensi) out.push({ id: `a${p.id}`, jenis: 'presensi', judul: `Presensi dibuka: ${p.judul}`, isi: namaMapel.get(p.mapelId) ?? '', waktu: p.createdAt, href: `/kelas/${p.mapelId}?tab=presensi` });
      for (const k of kuis) out.push({ id: `q${k.id}`, jenis: 'kuis', judul: `${k.modeUjian ? 'Ujian' : 'Kuis'} dibuka: ${k.judul}`, isi: namaMapel.get(k.mapelId) ?? '', waktu: k.mulai ?? k.createdAt, href: `/kelas/${k.mapelId}/kuis/${k.id}` });
      for (const t of tugas) out.push({ id: `t${t.id}`, jenis: 'tugas', judul: `Tugas baru: ${t.judul}`, isi: namaMapel.get(t.mapelId) ?? '', waktu: t.terbitPada ?? t.createdAt, href: `/kelas/${t.mapelId}/tugas/${t.id}` });
      for (const m of materi) out.push({ id: `m${m.id}`, jenis: 'materi', judul: `Materi baru: ${m.judul}`, isi: namaMapel.get(m.mapelId) ?? '', waktu: m.terbitPada ?? m.createdAt, href: `/kelas/${m.mapelId}/materi/${m.id}` });
      for (const p of pengumuman) out.push({ id: `p${p.id}`, jenis: 'pengumuman', judul: p.judul, isi: namaMapel.get(p.mapelId) ?? '', waktu: p.createdAt, href: `/kelas/${p.mapelId}` });
      for (const k of dinilai) {
        const href = `/kelas/${k.tugas.mapelId}/tugas/${k.tugas.id}`;
        out.push(k.status === 'revisi'
          ? { id: `r${k.id}`, jenis: 'revisi', judul: `Perlu revisi: ${k.tugas.judul}`, isi: k.catatanGuru.slice(0, 120), waktu: k.dinilaiAt!, href }
          : { id: `n${k.id}`, jenis: 'nilai', judul: `${k.tugas.judul} dinilai: ${k.nilai}/${k.tugas.nilaiMaks}`, isi: namaMapel.get(k.tugas.mapelId) ?? '', waktu: k.dinilaiAt!, href });
      }
    } else if (ids.length) {
      const [kumpul, komentar, esai] = await Promise.all([
        prisma.pengumpulanTugas.findMany({
          where: { tugas: { mapelId: { in: ids } }, dikumpulkanAt: { gte: sejak }, nilai: null, status: 'dikumpulkan' },
          include: { user: { select: { nama: true } }, tugas: { select: { id: true, judul: true, mapelId: true } } },
          orderBy: { dikumpulkanAt: 'desc' }, take: MAKS,
        }),
        prisma.komentar.findMany({
          where: {
            userId: { not: user.id }, createdAt: { gte: sejak },
            OR: [{ materi: { mapelId: { in: ids } } }, { tugas: { mapelId: { in: ids } } }, { pengumuman: { mapelId: { in: ids } } }],
          },
          include: {
            user: { select: { nama: true } },
            materi: { select: { id: true, judul: true, mapelId: true } },
            tugas: { select: { id: true, judul: true, mapelId: true } },
            pengumuman: { select: { id: true, judul: true, mapelId: true } },
          },
          orderBy: { createdAt: 'desc' }, take: MAKS,
        }),
        prisma.percobaanKuis.findMany({
          where: { kuis: { mapelId: { in: ids } }, selesaiAt: { gte: sejak }, perluDinilai: true },
          include: { user: { select: { nama: true } }, kuis: { select: { id: true, judul: true, mapelId: true } } },
          orderBy: { selesaiAt: 'desc' }, take: MAKS,
        }),
      ]);
      for (const p of esai) {
        out.push({ id: `e${p.id}`, jenis: 'kuis', judul: `Esai ${p.user.nama} perlu dinilai: ${p.kuis.judul}`, isi: namaMapel.get(p.kuis.mapelId) ?? '', waktu: p.selesaiAt!, href: `/kelas/${p.kuis.mapelId}/kuis/${p.kuis.id}` });
      }
      for (const k of kumpul) {
        out.push({ id: `k${k.id}`, jenis: 'kumpul', judul: `${k.user.nama} mengumpulkan ${k.tugas.judul}`, isi: namaMapel.get(k.tugas.mapelId) ?? '', waktu: k.dikumpulkanAt, href: `/kelas/${k.tugas.mapelId}/tugas/${k.tugas.id}` });
      }
      for (const k of komentar) {
        const target = k.materi ?? k.tugas ?? k.pengumuman;
        if (!target) continue;
        const href = k.materi ? `/kelas/${target.mapelId}/materi/${target.id}` : k.tugas ? `/kelas/${target.mapelId}/tugas/${target.id}` : `/kelas/${target.mapelId}`;
        out.push({ id: `c${k.id}`, jenis: 'komentar', judul: `${k.user.nama} berkomentar di ${target.judul}`, isi: k.isi.slice(0, 120), waktu: k.createdAt, href });
      }
    }

    const dibaca = (await prisma.user.findUnique({ where: { id: user.id }, select: { notifDibacaAt: true } }))?.notifDibacaAt;
    const items = out
      .sort((a, b) => b.waktu.getTime() - a.waktu.getTime())
      .slice(0, MAKS)
      .map((n) => ({ ...n, baru: !dibaca || n.waktu > dibaca }));
    return NextResponse.json({ items, jumlahBaru: items.filter((n) => n.baru).length });
  } catch (error) {
    console.error('ERROR NOTIFIKASI:', error);
    return NextResponse.json({ message: 'Gagal memuat notifikasi' }, { status: 500 });
  }
}

// Tandai semua notifikasi sudah dibaca
export async function POST() {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  await prisma.user.update({ where: { id: auth.user.id }, data: { notifDibacaAt: new Date() } });
  return NextResponse.json({ success: true });
}
