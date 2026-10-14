import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, mapelPengguna, whereTugasSiswa } from '@/lib/lms';

type Jenis = 'tugas' | 'kuis' | 'presensi' | 'ujian' | 'terbit';
interface Acara { id: string; jenis: Jenis; judul: string; waktu: Date; mapel: string; href: string; selesai?: boolean }

const MAKS_HARI = 62;

/**
 * Kalender LMS untuk rentang ?dari=ISO&sampai=ISO (maks 62 hari):
 * tenggat tugas, kuis dibuka/ditutup, pertemuan presensi, jadwal ujian mapel (CAT & offline),
 * dan (pengelola) materi/tugas yang terbit terjadwal.
 */
export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const q = new URL(request.url).searchParams;
    const dari = new Date(q.get('dari') ?? '');
    const sampai = new Date(q.get('sampai') ?? '');
    if (isNaN(dari.getTime()) || isNaN(sampai.getTime()) || sampai <= dari || sampai.getTime() - dari.getTime() > MAKS_HARI * 86400000) {
      return NextResponse.json({ message: `Rentang tanggal tidak valid (maks ${MAKS_HARI} hari)` }, { status: 400 });
    }

    const mapel = await mapelPengguna(user);
    const ids = mapel.map((m) => m.id);
    const siswa = user.role === 'PESERTA';
    const nama = new Map(mapel.map((m) => [m.id, siswa ? m.nama : `${m.kelas.nama} · ${m.nama}`]));
    const rentang = { gte: dari, lt: sampai };
    const out: Acara[] = [];
    if (!ids.length) return NextResponse.json({ acara: out });

    const [tugas, kuis, presensi, ujian, terjadwal] = await Promise.all([
      prisma.tugas.findMany({
        where: { mapelId: { in: ids }, tenggat: rentang, ...(siswa ? whereTugasSiswa(user.id) : {}) },
        select: { id: true, judul: true, tenggat: true, mapelId: true, terbit: true, pengumpulan: { where: { userId: user.id }, select: { status: true } } },
      }),
      prisma.kuis.findMany({
        where: { mapelId: { in: ids }, ...(siswa ? { terbit: true } : {}), OR: [{ mulai: rentang }, { selesai: rentang }] },
        select: { id: true, judul: true, mulai: true, selesai: true, mapelId: true, percobaan: { where: { userId: user.id, selesaiAt: { not: null } }, select: { id: true } } },
      }),
      prisma.sesiPresensi.findMany({
        where: { mapelId: { in: ids }, tanggal: rentang },
        select: { id: true, judul: true, tanggal: true, mapelId: true, presensi: { where: { userId: user.id }, select: { status: true } } },
      }),
      prisma.ujian.findMany({ where: { mapelId: { in: ids }, jadwalMulai: rentang }, select: { id: true, nama: true, jadwalMulai: true, mapelId: true } }),
      siswa ? Promise.resolve(null) : Promise.all([
        prisma.materi.findMany({ where: { mapelId: { in: ids }, terbit: true, terbitPada: rentang }, select: { id: true, judul: true, terbitPada: true, mapelId: true } }),
        prisma.tugas.findMany({ where: { mapelId: { in: ids }, terbit: true, terbitPada: rentang }, select: { id: true, judul: true, terbitPada: true, mapelId: true } }),
      ]),
    ]);

    for (const t of tugas) {
      out.push({
        id: `t${t.id}`, jenis: 'tugas', judul: t.judul, waktu: t.tenggat!, mapel: nama.get(t.mapelId) ?? '', href: `/kelas/${t.mapelId}/tugas/${t.id}`,
        selesai: siswa ? t.pengumpulan.some((p) => p.status === 'dikumpulkan') : undefined,
      });
    }
    for (const k of kuis) {
      const selesai = siswa ? k.percobaan.length > 0 : undefined;
      const href = `/kelas/${k.mapelId}/kuis/${k.id}`;
      if (k.mulai && k.mulai >= dari && k.mulai < sampai) out.push({ id: `qm${k.id}`, jenis: 'kuis', judul: `Kuis dibuka: ${k.judul}`, waktu: k.mulai, mapel: nama.get(k.mapelId) ?? '', href, selesai });
      if (k.selesai && k.selesai >= dari && k.selesai < sampai) out.push({ id: `qs${k.id}`, jenis: 'kuis', judul: `Kuis ditutup: ${k.judul}`, waktu: k.selesai, mapel: nama.get(k.mapelId) ?? '', href, selesai });
    }
    for (const p of presensi) {
      out.push({
        id: `p${p.id}`, jenis: 'presensi', judul: p.judul, waktu: p.tanggal, mapel: nama.get(p.mapelId) ?? '', href: `/kelas/${p.mapelId}?tab=presensi`,
        selesai: siswa ? p.presensi.length > 0 : undefined,
      });
    }
    const ujianManual = await prisma.ujianManual.findMany({ where: { mapelId: { in: ids }, tanggal: rentang }, select: { id: true, judul: true, tanggal: true, mapelId: true } });
    for (const u of ujianManual) out.push({ id: `um${u.id}`, jenis: 'ujian', judul: `Ujian: ${u.judul}`, waktu: u.tanggal!, mapel: nama.get(u.mapelId) ?? '', href: `/kelas/${u.mapelId}?tab=ujian` });
    for (const u of ujian) out.push({ id: `u${u.id}`, jenis: 'ujian', judul: `Ujian: ${u.nama}`, waktu: u.jadwalMulai!, mapel: nama.get(u.mapelId!) ?? '', href: siswa ? '/dashboard' : `/kelas/${u.mapelId}?tab=ujian` });
    if (terjadwal) {
      const [materi, tugasJ] = terjadwal;
      for (const m of materi) out.push({ id: `tm${m.id}`, jenis: 'terbit', judul: `Terbit: ${m.judul}`, waktu: m.terbitPada!, mapel: nama.get(m.mapelId) ?? '', href: `/kelas/${m.mapelId}/materi/${m.id}` });
      for (const t of tugasJ) out.push({ id: `tt${t.id}`, jenis: 'terbit', judul: `Terbit: ${t.judul}`, waktu: t.terbitPada!, mapel: nama.get(t.mapelId) ?? '', href: `/kelas/${t.mapelId}/tugas/${t.id}` });
    }

    out.sort((a, b) => a.waktu.getTime() - b.waktu.getTime());
    return NextResponse.json({ acara: out });
  } catch (error) {
    console.error('ERROR KALENDER:', error);
    return NextResponse.json({ message: 'Gagal memuat kalender' }, { status: 500 });
  }
}
