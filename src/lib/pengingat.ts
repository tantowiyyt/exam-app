import { prisma } from './prisma';
import { getNotif, kanalUntuk, kirimKe, type PengaturanNotif } from './notif-keluar';

// Pengiriman notifikasi WhatsApp/email terjadwal (dijalankan berkala oleh penjadwal & bisa dipicu admin):
//  - tugas baru terbit (24 jam terakhir) & pengumuman baru  -> siswa kelasnya
//  - pengingat tenggat tugas dalam 24 jam                   -> siswa yang belum mengumpulkan
//  - ujian dalam 24 jam (ujian mapel offline/CAT & ujian CAT sekolah) -> siswa pesertanya
// Setiap pesan punya kunci unik per kejadian + siswa, jadi aman dijalankan berulang (tidak terkirim ganda).

const JAM = 3600000;
const fmt = (d: Date) => d.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
type Penerima = { id: number; email: string; noHp: string | null; notifWa: boolean; kelas: string };

async function siswaKelas(kelas: string[]) {
  if (!kelas.length) return [] as Penerima[];
  return prisma.user.findMany({ where: { role: 'PESERTA', kelas: { in: kelas }, notifWa: true }, select: { id: true, email: true, noHp: true, notifWa: true, kelas: true } });
}

export async function jalankanPengingat(now = new Date(), cfg?: PengaturanNotif) {
  const c = cfg ?? (await getNotif());
  const hasil = { dikirim: 0, dicoba: 0 };
  // Tidak ada kanal aktif = tidak ada yang dikerjakan
  if (!kanalUntuk({ email: 'a@b.cd', noHp: '081200000000' }, c).length) return hasil;
  const kirim = async (u: Penerima, kunci: string, judul: string, isi: string) => {
    if (!kanalUntuk(u, c).length) return;
    hasil.dicoba++;
    if ((await kirimKe(u, { kunci, judul, isi }, { c })).length) hasil.dikirim++;
  };
  const sejak = new Date(now.getTime() - 24 * JAM);
  const sampai = new Date(now.getTime() + 24 * JAM);
  const mapelInfo = async (ids: number[]) => new Map((await prisma.mapel.findMany({ where: { id: { in: ids } }, select: { id: true, nama: true, kelas: { select: { nama: true } } } })).map((m) => [m.id, m]));

  if (c.kirimTugas === 'aktif' || c.pengingatTenggat === 'aktif') {
    const tugas = await prisma.tugas.findMany({
      where: {
        terbit: true, OR: [{ terbitPada: null }, { terbitPada: { lte: now } }],
        AND: [{ OR: [{ createdAt: { gte: sejak } }, { terbitPada: { gte: sejak } }, { tenggat: { gt: now, lte: sampai } }] }],
      },
      select: { id: true, judul: true, mapelId: true, tenggat: true, untukSiswa: true, createdAt: true, terbitPada: true, pengumpulan: { select: { userId: true } } },
    });
    const m = await mapelInfo([...new Set(tugas.map((t) => t.mapelId))]);
    const penerima = await siswaKelas([...new Set(tugas.map((t) => m.get(t.mapelId)?.kelas.nama).filter((x): x is string => !!x))]);
    for (const t of tugas) {
      const mp = m.get(t.mapelId);
      if (!mp) continue;
      const untuk = penerima.filter((u) => u.kelas === mp.kelas.nama && (!t.untukSiswa || t.untukSiswa.includes(`,${u.id},`)));
      const baru = (t.terbitPada ?? t.createdAt) >= sejak;
      for (const u of untuk) {
        if (c.kirimTugas === 'aktif' && baru) {
          await kirim(u, `tugas-baru:${t.id}`, `Tugas baru: ${t.judul}`, `${mp.nama}${t.tenggat ? ` — tenggat ${fmt(t.tenggat)}` : ''}. Buka aplikasi untuk mengerjakan.`);
        }
        if (c.pengingatTenggat === 'aktif' && t.tenggat && t.tenggat > now && t.tenggat <= sampai && !t.pengumpulan.some((p) => p.userId === u.id)) {
          await kirim(u, `tenggat:${t.id}`, `Pengingat tenggat: ${t.judul}`, `${mp.nama} — tenggat ${fmt(t.tenggat)}. Anda belum mengumpulkan.`);
        }
      }
    }
  }

  if (c.kirimPengumuman === 'aktif') {
    const peng = await prisma.pengumuman.findMany({ where: { createdAt: { gte: sejak } }, select: { id: true, judul: true, isi: true, mapelId: true } });
    const m = await mapelInfo([...new Set(peng.map((p) => p.mapelId))]);
    const penerima = await siswaKelas([...new Set(peng.map((p) => m.get(p.mapelId)?.kelas.nama).filter((x): x is string => !!x))]);
    for (const p of peng) {
      const mp = m.get(p.mapelId);
      if (!mp) continue;
      for (const u of penerima.filter((x) => x.kelas === mp.kelas.nama)) {
        await kirim(u, `pengumuman:${p.id}`, `Pengumuman ${mp.nama}: ${p.judul}`, p.isi.slice(0, 500));
      }
    }
  }

  if (c.kirimUjian === 'aktif') {
    const [manual, kuis, sekolah] = await Promise.all([
      prisma.ujianManual.findMany({ where: { mode: 'offline', tanggal: { gt: now, lte: sampai } }, select: { id: true, judul: true, tanggal: true, mapelId: true, untukSiswa: true } }),
      prisma.kuis.findMany({ where: { modeUjian: true, terbit: true, mulai: { gt: now, lte: sampai } }, select: { id: true, judul: true, mulai: true, mapelId: true, untukSiswa: true } }),
      prisma.ujian.findMany({ where: { isActive: true, jadwalMulai: { gt: now, lte: sampai } }, select: { id: true, nama: true, jadwalMulai: true, kelasTarget: true, mapel: { select: { kelas: { select: { nama: true } } } } } }),
    ]);
    const m = await mapelInfo([...new Set([...manual, ...kuis].map((x) => x.mapelId))]);
    const daftar = [
      ...manual.map((x) => ({ kunci: `ujian-m:${x.id}`, judul: x.judul, waktu: x.tanggal!, kelas: m.get(x.mapelId)?.kelas.nama ? [m.get(x.mapelId)!.kelas.nama] : [], untuk: x.untukSiswa, mapel: m.get(x.mapelId)?.nama ?? '' })),
      ...kuis.map((x) => ({ kunci: `ujian-k:${x.id}`, judul: x.judul, waktu: x.mulai!, kelas: m.get(x.mapelId)?.kelas.nama ? [m.get(x.mapelId)!.kelas.nama] : [], untuk: x.untukSiswa, mapel: m.get(x.mapelId)?.nama ?? '' })),
      ...sekolah.map((x) => {
        const kt = x.kelasTarget.split(',').filter(Boolean);
        return { kunci: `ujian-s:${x.id}`, judul: x.nama, waktu: x.jadwalMulai!, kelas: kt.length ? kt : x.mapel ? [x.mapel.kelas.nama] : ['*'], untuk: '', mapel: 'Ujian CAT' };
      }),
    ];
    for (const u of daftar) {
      const penerima = u.kelas.includes('*')
        ? await prisma.user.findMany({ where: { role: 'PESERTA', notifWa: true }, select: { id: true, email: true, noHp: true, notifWa: true, kelas: true } })
        : await siswaKelas(u.kelas);
      for (const s of penerima.filter((x) => !u.untuk || u.untuk.includes(`,${x.id},`))) {
        await kirim(s, u.kunci, `Jadwal ujian: ${u.judul}`, `${u.mapel} — ${fmt(u.waktu)}. Siapkan diri dan datang tepat waktu.`);
      }
    }
  }
  return hasil;
}

// ---------- Penjadwal (satu instance server) ----------
const g = globalThis as unknown as { __penjadwalNotif?: NodeJS.Timeout; __pengingatJalan?: boolean };

export function mulaiPenjadwal() {
  if (g.__penjadwalNotif || process.env.NOTIF_PENJADWAL === 'off') return;
  const jalan = async () => {
    if (g.__pengingatJalan) return;
    g.__pengingatJalan = true;
    try { await jalankanPengingat(); } catch (e) { console.error('PENGINGAT:', e); } finally { g.__pengingatJalan = false; }
  };
  // Pertama kali 2 menit setelah server hidup, lalu tiap 10 menit
  setTimeout(jalan, 2 * 60000);
  g.__penjadwalNotif = setInterval(jalan, 10 * 60000);
}
