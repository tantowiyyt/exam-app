import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLmsSession, aksesMapel, teks, urutUjianManual } from '@/lib/lms';
import { nilaiTerbaik, statusBuka, tokenBaru } from '@/lib/kuis';
import { semesterAktif, semesterDipilih } from '@/lib/semester';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';

// Ujian mapel (rencana penilaian semester): UH / UTS / UAS / lainnya, dikelola guru.
// Cara pelaksanaan:
//  - offline: ujian di luar aplikasi (kertas/praktik), guru mengisi nilai
//  - cat: dikerjakan siswa di komputer = Kuis mode ujian (kuisId): soal, jadwal, token, layar penuh, monitoring
// Siswa melihat jadwal; nilai baru terlihat setelah guru mengumumkan (terbit).

const JENIS_UJIAN = ['UH', 'UTS', 'UAS', 'LAIN'] as const;

function tanggalOpsional(v: unknown): Date | null | undefined {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

function dataUjian(body: Record<string, unknown>, mode: string) {
  const judul = teks(body.judul, 200);
  if (!judul) return { error: 'Nama ujian wajib diisi' } as const;
  const jenis = String(body.jenis ?? 'LAIN');
  if (!(JENIS_UJIAN as readonly string[]).includes(jenis)) return { error: 'Jenis ujian tidak dikenal' } as const;
  const keterangan = teks(body.keterangan, 2000);

  if (mode === 'cat') {
    // Jadwal & durasi disimpan di kuis ujiannya
    const mulai = tanggalOpsional(body.mulai);
    const selesai = tanggalOpsional(body.selesai);
    if (mulai === undefined || selesai === undefined) return { error: 'Jadwal tidak valid' } as const;
    if (mulai && selesai && selesai <= mulai) return { error: 'Waktu selesai harus setelah waktu mulai' } as const;
    const durasiMenit = Math.floor(Number(body.durasiMenit ?? 90));
    if (!Number.isFinite(durasiMenit) || durasiMenit < 1 || durasiMenit > 600) return { error: 'Durasi 1–600 menit' } as const;
    return { data: { judul, jenis, keterangan, tanggal: mulai, nilaiMaks: 100 }, kuis: { judul, deskripsi: keterangan, mulai, selesai, durasiMenit } } as const;
  }

  const tanggal = tanggalOpsional(body.tanggal);
  if (tanggal === undefined) return { error: 'Tanggal tidak valid' } as const;
  const nilaiMaks = Math.floor(Number(body.nilaiMaks ?? 100));
  if (!Number.isFinite(nilaiMaks) || nilaiMaks < 1 || nilaiMaks > 1000) return { error: 'Nilai maksimal 1–1000' } as const;
  return { data: { judul, jenis, keterangan, tanggal, nilaiMaks }, kuis: null } as const;
}

async function ujianKelola(id: unknown, user: { id: number; role: string }) {
  const ujian = await prisma.ujianManual.findUnique({ where: { id: Number(id) } });
  const akses = ujian ? await aksesMapel(user, ujian.mapelId) : null;
  return ujian && akses?.peran === 'kelola' ? { ujian, akses } : null;
}

const rata = (n: number[]) => (n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null);

export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const { user } = auth;
    const q = new URL(request.url).searchParams;
    const akses = await aksesMapel(user, Number(q.get('mapelId')));
    if (!akses) return NextResponse.json({ message: 'Mapel tidak ditemukan atau bukan kelas Anda' }, { status: 404 });
    const kelola = akses.peran === 'kelola';
    const semester = await semesterDipilih(q.get('semester'));

    const ujian = urutUjianManual(await prisma.ujianManual.findMany({
      where: { mapelId: akses.mapel.id, semesterId: semester.id },
      include: { nilai: { where: kelola ? {} : { userId: user.id }, select: { userId: true, nilai: true, catatan: true } } },
    }));
    // Kuis ujian (mode CAT) beserta percobaan
    const kuisIds = ujian.map((u) => u.kuisId).filter((x): x is number => !!x);
    const [kuis, percobaan, jumlahSoal] = kuisIds.length ? await Promise.all([
      prisma.kuis.findMany({ where: { id: { in: kuisIds } } }),
      prisma.percobaanKuis.findMany({ where: { kuisId: { in: kuisIds }, ...(kelola ? {} : { userId: user.id }) }, select: { kuisId: true, userId: true, selesaiAt: true, nilai: true, perluDinilai: true } }),
      prisma.soalKuis.groupBy({ by: ['kuisId'], where: { kuisId: { in: kuisIds } }, _count: true }),
    ]) : [[], [], []];
    const infoKuis = (u: { kuisId: number | null }) => {
      const k = kuis.find((x) => x.id === u.kuisId);
      return k ? { id: k.id, status: statusBuka(k), terbit: k.terbit, mulai: k.mulai, selesai: k.selesai, durasiMenit: k.durasiMenit, jumlahSoal: jumlahSoal.find((j) => j.kuisId === k.id)?._count ?? 0 } : null;
    };

    if (!kelola) {
      return NextResponse.json({
        peran: akses.peran,
        semester,
        ujian: ujian.map((u) => {
          const base = { id: u.id, judul: u.judul, jenis: u.jenis, mode: u.mode, tanggal: u.tanggal, nilaiMaks: u.nilaiMaks, keterangan: u.keterangan, diumumkan: u.terbit };
          if (u.mode === 'cat') {
            const milik = percobaan.filter((p) => p.kuisId === u.kuisId);
            const best = nilaiTerbaik(milik);
            return {
              ...base, kuis: infoKuis(u),
              status: milik.some((p) => !p.selesaiAt) ? 'mengerjakan' : milik.length ? 'selesai' : 'belum',
              saya: u.terbit && best && !best.perluDinilai ? { nilai: best.nilai, catatan: '' } : null,
            };
          }
          return { ...base, saya: u.terbit && u.nilai[0] ? { nilai: u.nilai[0].nilai, catatan: u.nilai[0].catatan } : null };
        }),
      });
    }

    const siswa = await prisma.user.findMany({
      where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama },
      select: { id: true, nomorPeserta: true, nama: true },
      orderBy: { nama: 'asc' },
    });
    return NextResponse.json({
      peran: akses.peran,
      semester,
      siswa,
      ujian: ujian.map((u) => {
        const base = { id: u.id, judul: u.judul, jenis: u.jenis, mode: u.mode, tanggal: u.tanggal, nilaiMaks: u.nilaiMaks, keterangan: u.keterangan, terbit: u.terbit };
        if (u.mode === 'cat') {
          // Nilai = hasil mengerjakan (satu kesempatan)
          const nilai = siswa.flatMap((s) => {
            const best = nilaiTerbaik(percobaan.filter((p) => p.kuisId === u.kuisId && p.userId === s.id));
            return best && !best.perluDinilai ? [{ userId: s.id, nilai: best.nilai, catatan: '' }] : [];
          });
          const milik = percobaan.filter((p) => p.kuisId === u.kuisId);
          return {
            ...base, kuis: infoKuis(u), nilai, rataRata: rata(nilai.map((n) => n.nilai)),
            hasil: { mengerjakan: milik.filter((p) => !p.selesaiAt).length, selesai: milik.filter((p) => p.selesaiAt).length, perluDinilai: milik.filter((p) => p.perluDinilai).length },
          };
        }
        return { ...base, nilai: u.nilai, rataRata: rata(u.nilai.map((x) => x.nilai)) };
      }),
    });
  } catch (error) {
    console.error('ERROR GET UJIAN MAPEL:', error);
    return NextResponse.json({ message: 'Gagal memuat ujian' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const akses = await aksesMapel(auth.user, Number(body.mapelId));
    if (akses?.peran !== 'kelola') return NextResponse.json({ message: 'Mapel tidak ditemukan atau Anda tidak mengelolanya' }, { status: 404 });
    const mode = body.mode === 'cat' ? 'cat' : 'offline';
    const hasil = dataUjian(body, mode);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    const semesterId = (await semesterAktif()).id;

    const ujian = await prisma.$transaction(async (tx) => {
      let kuisId: number | null = null;
      if (hasil.kuis) {
        // Kuis ujian: satu kesempatan, soal diacak, kunci tidak ditampilkan, token acak; draf sampai soal siap
        const k = await tx.kuis.create({
          data: {
            ...hasil.kuis, mapelId: akses.mapel.id, semesterId, modeUjian: true, token: tokenBaru(),
            maksPercobaan: 1, acakSoal: true, tampilkanJawaban: false, terbit: false,
          },
        });
        kuisId = k.id;
      }
      return tx.ujianManual.create({ data: { ...hasil.data, mode, kuisId, semesterId, mapelId: akses.mapel.id } });
    });
    await createAuditLog({ action: 'CREATE_UJIAN_MAPEL', target: `Ujian #${ujian.id} ${ujian.judul} (${ujian.jenis}, ${mode})`, ipAddress: getAuditIP(request) });
    return NextResponse.json({
      success: true,
      message: mode === 'cat' ? 'Ujian CAT dibuat. Tambahkan soal lalu terbitkan.' : 'Ujian dibuat. Isi nilainya lalu umumkan ke siswa.',
      data: ujian,
    });
  } catch (error) {
    console.error('ERROR POST UJIAN MAPEL:', error);
    return NextResponse.json({ message: 'Gagal membuat ujian' }, { status: 500 });
  }
}

// aksi "nilai" = simpan nilai banyak siswa (offline); tanpa aksi = ubah data ujian / umumkan (terbit)
export async function PUT(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const ada = await ujianKelola(body.id, auth.user);
    if (!ada) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const { ujian, akses } = ada;
    const target = `Ujian #${ujian.id} ${ujian.judul}`;

    if (body.aksi === 'nilai') {
      if (ujian.mode === 'cat') return NextResponse.json({ message: 'Nilai ujian CAT berasal dari hasil mengerjakan siswa' }, { status: 400 });
      const list: unknown[] = Array.isArray(body.data) ? body.data : [];
      if (list.length > 1000) return NextResponse.json({ message: 'Terlalu banyak data' }, { status: 400 });
      const siswa = new Set((await prisma.user.findMany({ where: { role: 'PESERTA', kelas: akses.mapel.kelas.nama }, select: { id: true } })).map((u) => u.id));
      // Siswa yang sudah pindah kelas tetap boleh dikoreksi/dihapus bila sudah punya nilai
      const sudah = new Set((await prisma.nilaiUjianManual.findMany({ where: { ujianId: ujian.id }, select: { userId: true } })).map((n) => n.userId));
      const ops = [];
      for (const raw of list) {
        const r = (raw ?? {}) as Record<string, unknown>;
        const userId = Number(r.userId);
        if (!siswa.has(userId) && !sudah.has(userId)) return NextResponse.json({ message: 'Ada siswa yang bukan anggota kelas ini' }, { status: 400 });
        const where = { ujianId_userId: { ujianId: ujian.id, userId } };
        // Nilai kosong = hapus nilai siswa itu
        if (r.nilai === null || r.nilai === '' || r.nilai === undefined) {
          if (sudah.has(userId)) ops.push(prisma.nilaiUjianManual.delete({ where }));
          continue;
        }
        const nilai = Number(r.nilai);
        if (!Number.isFinite(nilai) || nilai < 0 || nilai > ujian.nilaiMaks) {
          return NextResponse.json({ message: `Nilai harus 0–${ujian.nilaiMaks}` }, { status: 400 });
        }
        const v = { nilai: Math.round(nilai * 100) / 100, catatan: teks(r.catatan, 500) };
        ops.push(prisma.nilaiUjianManual.upsert({ where, update: v, create: { ...v, ujianId: ujian.id, userId } }));
      }
      await prisma.$transaction(ops);
      await createAuditLog({ action: 'NILAI_UJIAN_MAPEL', target, details: { perubahan: ops.length }, ipAddress: getAuditIP(request) });
      return NextResponse.json({ success: true, message: `${ops.length} nilai disimpan` });
    }

    // Ubah data ujian dan/atau status umumkan
    if (body.mode !== undefined && body.mode !== ujian.mode) {
      return NextResponse.json({ message: 'Cara pelaksanaan tidak bisa diubah. Hapus lalu buat ujian baru.' }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    let dataKuis: Record<string, unknown> | null = null;
    if (body.judul !== undefined) {
      const hasil = dataUjian(body, ujian.mode);
      if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
      if (ujian.mode === 'offline') {
        const tertinggi = await prisma.nilaiUjianManual.aggregate({ where: { ujianId: ujian.id }, _max: { nilai: true } });
        if ((tertinggi._max.nilai ?? 0) > hasil.data.nilaiMaks) {
          return NextResponse.json({ message: `Sudah ada nilai ${tertinggi._max.nilai}; nilai maksimal tidak boleh lebih kecil` }, { status: 400 });
        }
      }
      Object.assign(data, hasil.data);
      dataKuis = hasil.kuis;
    }
    if (typeof body.terbit === 'boolean') {
      data.terbit = body.terbit;
      if (body.terbit && !ujian.terbit) data.diumumkanAt = new Date();
    }
    const hasil = await prisma.$transaction(async (tx) => {
      if (dataKuis && ujian.kuisId) await tx.kuis.update({ where: { id: ujian.kuisId }, data: dataKuis });
      return tx.ujianManual.update({ where: { id: ujian.id }, data });
    });
    return NextResponse.json({ success: true, message: body.terbit === true ? 'Nilai diumumkan ke siswa' : body.terbit === false ? 'Nilai disembunyikan dari siswa' : 'Ujian diperbarui', data: hasil });
  } catch (error) {
    console.error('ERROR PUT UJIAN MAPEL:', error);
    return NextResponse.json({ message: 'Gagal menyimpan' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const ada = await ujianKelola(new URL(request.url).searchParams.get('id'), auth.user);
    if (!ada) return NextResponse.json({ message: 'Ujian tidak ditemukan' }, { status: 404 });
    const { ujian } = ada;
    // Ujian CAT: kuis ujian beserta soal & jawaban siswa ikut terhapus (UI meminta konfirmasi)
    const k = ujian.kuisId;
    await prisma.$transaction([
      prisma.nilaiUjianManual.deleteMany({ where: { ujianId: ujian.id } }),
      prisma.ujianManual.delete({ where: { id: ujian.id } }),
      ...(k ? [
        prisma.percobaanKuis.deleteMany({ where: { kuisId: k } }),
        prisma.soalKuis.deleteMany({ where: { kuisId: k } }),
        prisma.kuis.deleteMany({ where: { id: k } }),
      ] : []),
    ]);
    await createAuditLog({ action: 'DELETE_UJIAN_MAPEL', target: `Ujian #${ujian.id} ${ujian.judul}`, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Ujian dan nilainya dihapus' });
  } catch (error) {
    console.error('ERROR DELETE UJIAN MAPEL:', error);
    return NextResponse.json({ message: 'Gagal menghapus ujian' }, { status: 500 });
  }
}
