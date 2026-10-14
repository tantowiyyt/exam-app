import type { SesiUjian, Ujian, User } from '@prisma/client';
import { prisma } from './prisma';
import { getSoalPeserta, groupName, type SoalWithBagian } from './ujian-soal';

/** Toleransi jaringan untuk penyimpanan/submit setelah tenggat. */
export const GRACE_MS = 60 * 1000;

export interface Tahap {
  nama: string;
  durasiMenit: number | null;
  soalIds: number[];
}

/** Kelompokkan soal (sudah terurut) menjadi tahap. */
export function susunTahap(soal: SoalWithBagian[]): Tahap[] {
  const tahap: Tahap[] = [];
  for (const s of soal) {
    const nama = groupName(s);
    let t = tahap[tahap.length - 1];
    if (!t || t.nama !== nama) {
      t = { nama, durasiMenit: s.bagian?.durasiMenit ?? null, soalIds: [] };
      tahap.push(t);
    }
    t.soalIds.push(s.id);
  }
  return tahap;
}

/**
 * Mode bagian berwaktu: aktif bila SEMUA soal peserta berada di bagian yang punya durasi.
 * Peserta mengerjakan bagian berurutan dan tidak bisa kembali ke bagian sebelumnya.
 */
export function modeBerbagian(tahap: Tahap[]): boolean {
  return tahap.length > 0 && tahap.every((t) => t.durasiMenit && t.durasiMenit > 0);
}

export interface StatusSesi {
  berbagian: boolean;
  tahap: number;          // indeks tahap aktif (== tahap.length bila semua habis)
  tahapMulai: Date;
  tambahanMenit: number;
  tenggat: number;        // epoch ms tenggat tahap/ujian saat ini
  habis: boolean;
}

/** Hitung status terkini; di mode berbagian, tahap yang waktunya habis dilewati otomatis. */
export function hitungStatus(sesi: SesiUjian, ujian: Ujian | null, tahap: Tahap[], now = Date.now()): StatusSesi {
  const berbagian = modeBerbagian(tahap);
  const batasJadwal = ujian?.jadwalSelesai ? ujian.jadwalSelesai.getTime() + sesi.tambahanMenit * 60000 : Infinity;

  if (!berbagian) {
    const tenggat = Math.min(
      sesi.waktuMulai.getTime() + ((ujian?.durasiMenit ?? 60) + sesi.tambahanMenit) * 60000,
      batasJadwal,
    );
    return { berbagian, tahap: 0, tahapMulai: sesi.waktuMulai, tambahanMenit: sesi.tambahanMenit, tenggat, habis: now > tenggat };
  }

  let idx = sesi.tahap;
  let mulai = sesi.tahapMulai.getTime();
  let tambahan = sesi.tambahanMenit;
  while (idx < tahap.length) {
    const akhir = mulai + (tahap[idx].durasiMenit! + tambahan) * 60000;
    if (now <= akhir) break;
    // Tahap berikutnya dimulai tepat saat tahap ini habis; tambahan waktu hanya untuk tahap saat itu
    idx++;
    mulai = akhir;
    tambahan = 0;
  }
  const tenggatTahap = idx < tahap.length ? mulai + (tahap[idx].durasiMenit! + tambahan) * 60000 : mulai;
  const tenggat = Math.min(tenggatTahap, batasJadwal);
  return {
    berbagian,
    tahap: idx,
    tahapMulai: new Date(mulai),
    tambahanMenit: tambahan,
    tenggat,
    habis: idx >= tahap.length || now > batasJadwal,
  };
}

/** Simpan hasil auto-advance tahap bila berubah. */
export async function sinkronStatus(sesi: SesiUjian, status: StatusSesi): Promise<SesiUjian> {
  if (!status.berbagian || (status.tahap === sesi.tahap && status.tahapMulai.getTime() === sesi.tahapMulai.getTime())) return sesi;
  return prisma.sesiUjian.update({
    where: { id: sesi.id },
    data: { tahap: status.tahap, tahapMulai: status.tahapMulai, tambahanMenit: status.tambahanMenit },
  });
}

export function cariSesiAktif(userId: number, ujianId: number | null) {
  return prisma.sesiUjian.findFirst({
    where: { userId, ujianId, selesai: false },
    orderBy: { id: 'desc' },
  });
}

export function parseJawaban(sesi: SesiUjian): Record<string, string> {
  try {
    const obj = JSON.parse(sesi.jawaban);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function parseRagu(sesi: SesiUjian): number[] {
  try {
    const arr = JSON.parse(sesi.ragu);
    return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

/**
 * Nilai jawaban dan simpan hasil (jawaban, nilai user, histori, tutup sesi) dalam satu transaksi.
 * Dipakai oleh submit peserta maupun "paksa kumpulkan" oleh pengawas.
 */
export async function nilaiDanSimpan(opts: {
  user: User;
  ujian: Ujian | null;
  jawaban: Record<string, string>;
  waktuMulai: Date;
  sesiId?: number;
}) {
  const { user, ujian, jawaban, waktuMulai, sesiId } = opts;
  const allSoal = await getSoalPeserta(user.id, ujian);

  let jumlahBenar = 0;
  let jumlahSalah = 0;
  let totalBobotBenar = 0;
  let totalBobot = 0;
  const perMapel: Record<string, { bobotBenar: number; bobotTotal: number }> = {};
  const perBagian: Record<string, { bobotBenar: number; bobotTotal: number }> = {};

  const jawabanRecords = allSoal.map((soal) => {
    const mapel = soal.mataPelajaran || 'Umum';
    perMapel[mapel] ??= { bobotBenar: 0, bobotTotal: 0 };
    perMapel[mapel].bobotTotal += soal.bobot;
    const bagian = soal.bagian ? groupName(soal) : null;
    if (bagian) {
      perBagian[bagian] ??= { bobotBenar: 0, bobotTotal: 0 };
      perBagian[bagian].bobotTotal += soal.bobot;
    }

    const raw = jawaban[soal.id];
    const jawabanUser = typeof raw === 'string' && ['A', 'B', 'C', 'D'].includes(raw) ? raw : null;
    const benar = jawabanUser === soal.jawabanBenar;
    totalBobot += soal.bobot;
    if (benar) {
      jumlahBenar++;
      totalBobotBenar += soal.bobot;
      perMapel[mapel].bobotBenar += soal.bobot;
      if (bagian) perBagian[bagian].bobotBenar += soal.bobot;
    } else {
      jumlahSalah++;
    }

    return {
      userId: user.id,
      soalId: soal.id,
      ujianId: ujian?.id ?? null,
      jawabanPeserta: jawabanUser,
      jawabanBenar: soal.jawabanBenar,
      benar,
      mataPelajaran: mapel,
    };
  });

  const persen = (d: { bobotBenar: number; bobotTotal: number }) => (d.bobotTotal > 0 ? Math.round((d.bobotBenar / d.bobotTotal) * 100) : 0);
  const nilaiAkhir = persen({ bobotBenar: totalBobotBenar, bobotTotal: totalBobot });
  const skorPerMapel = Object.fromEntries(Object.entries(perMapel).map(([k, v]) => [k, persen(v)]));
  const skorPerBagian = Object.fromEntries(Object.entries(perBagian).map(([k, v]) => [k, persen(v)]));

  await prisma.$transaction([
    prisma.jawabanUjian.deleteMany({ where: { userId: user.id } }),
    prisma.jawabanUjian.createMany({ data: jawabanRecords }),
    prisma.user.update({ where: { id: user.id }, data: { nilai: nilaiAkhir, sudahUjian: true } }),
    prisma.historiUjian.create({
      data: {
        userId: user.id,
        ujianId: ujian?.id ?? null,
        waktuMulai,
        totalSoal: allSoal.length,
        jumlahBenar,
        jumlahSalah,
        nilaiAkhir,
        skorPerMapel: JSON.stringify(skorPerMapel),
        skorPerBagian: Object.keys(skorPerBagian).length > 0 ? JSON.stringify(skorPerBagian) : null,
      },
    }),
    ...(sesiId ? [prisma.sesiUjian.update({ where: { id: sesiId }, data: { selesai: true } })] : []),
  ]);

  return { totalSoal: allSoal.length, jumlahBenar, jumlahSalah, nilaiAkhir, skorPerMapel, skorPerBagian };
}

/** Muat user, ujian aktif, sesi terbuka, soal & status untuk peserta yang login. */
export async function muatKonteks(nomorPeserta: string) {
  const user = await prisma.user.findUnique({ where: { nomorPeserta } });
  if (!user) return { error: 'User tidak ditemukan', httpStatus: 401 } as const;
  const ujian = await prisma.ujian.findFirst({ where: { isActive: true } });
  const sesi = await cariSesiAktif(user.id, ujian?.id ?? null);
  if (!sesi) return { error: 'Sesi ujian tidak ditemukan. Muat ulang halaman ujian.', httpStatus: 409 } as const;
  const soal = await getSoalPeserta(user.id, ujian);
  const tahap = susunTahap(soal);
  const status = hitungStatus(sesi, ujian, tahap);
  return { user, ujian, sesi: await sinkronStatus(sesi, status), soal, tahap, status } as const;
}

/**
 * Gabungkan jawaban kiriman klien ke jawaban tersimpan. Hanya soal yang boleh diubah
 * (semua soal peserta, atau soal bagian aktif pada mode berbagian) yang diterima.
 */
export function gabungJawaban(
  sesi: SesiUjian,
  tahap: Tahap[],
  status: StatusSesi,
  input: { jawaban?: unknown; ragu?: unknown },
) {
  const boleh = new Set(status.berbagian ? (tahap[status.tahap]?.soalIds ?? []) : tahap.flatMap((t) => t.soalIds));
  const jawaban = parseJawaban(sesi);
  if (input.jawaban && typeof input.jawaban === 'object') {
    for (const id of boleh) delete jawaban[id];
    for (const [id, opsi] of Object.entries(input.jawaban as Record<string, unknown>)) {
      if (boleh.has(Number(id)) && typeof opsi === 'string' && ['A', 'B', 'C', 'D'].includes(opsi)) jawaban[id] = opsi;
    }
  }
  let ragu = parseRagu(sesi);
  if (Array.isArray(input.ragu)) {
    ragu = [...ragu.filter((id) => !boleh.has(id)), ...input.ragu.filter((id): id is number => Number.isInteger(id) && boleh.has(id))];
  }
  return { jawaban, ragu };
}
