import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getSoalPeserta } from '@/lib/ujian-soal';
import { ujianAktifUntuk } from '@/lib/ujian-peserta';
import {
  susunTahap, hitungStatus, sinkronStatus, cariSesiAktif, parseJawaban, parseRagu, nilaiDanSimpan,
} from '@/lib/sesi-ujian';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { nomorPeserta: session.nomorPeserta } });
    if (!user) {
      return NextResponse.json({ message: 'User tidak ditemukan' }, { status: 401 });
    }
    if (user.role === 'PENGAWAS' || user.role === 'GURU') {
      return NextResponse.json({ message: 'Akun pengawas/guru tidak dapat mengerjakan ujian' }, { status: 403 });
    }
    const serverNow = Date.now();
    // Ujian aktif yang menargetkan kelas siswa (beberapa ujian boleh aktif untuk kelas berbeda)
    const { ujian, sudah, adaAktif, kelasLain } = await ujianAktifUntuk(user);
    if (!ujian) {
      if (adaAktif) return NextResponse.json({ status: 'bukan_kelas', kelas: kelasLain.join(', '), serverNow });
      return NextResponse.json({ status: 'tidak_ada', serverNow });
    }
    if (sudah) {
      return NextResponse.json({ message: 'Anda sudah menyelesaikan ujian ini', sudahUjian: true }, { status: 409 });
    }
    let sesi = await cariSesiAktif(user.id, ujian.id);

    // Soal tidak dikirim sebelum jadwal mulai
    if (!sesi && ujian?.jadwalMulai && serverNow < ujian.jadwalMulai.getTime()) {
      return NextResponse.json({ status: 'belum', jadwalMulai: ujian.jadwalMulai, serverNow });
    }
    if (!sesi && ujian?.jadwalSelesai && serverNow > ujian.jadwalSelesai.getTime()) {
      return NextResponse.json({ status: 'jadwal_selesai', serverNow });
    }

    const soal = await getSoalPeserta(user.id, ujian);
    if (soal.length === 0) {
      return NextResponse.json({ status: 'kosong', serverNow });
    }
    const tahap = susunTahap(soal);

    if (!sesi) {
      sesi = await prisma.sesiUjian.create({
        data: { userId: user.id, ujianId: ujian?.id ?? null, waktuMulai: new Date(serverNow), tahapMulai: new Date(serverNow) },
      });
      const forwarded = request.headers.get('x-forwarded-for');
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          activity: 'START_UJIAN',
          details: JSON.stringify({ ujianId: ujian?.id ?? null, total: soal.length }),
          ipAddress: forwarded?.split(',')[0] || '127.0.0.1',
          userAgent: request.headers.get('user-agent') || '',
        },
      });
    }

    const status = hitungStatus(sesi, ujian, tahap, serverNow);
    sesi = await sinkronStatus(sesi, status);

    // Waktu sudah habis (mis. browser ditutup): nilai otomatis dari jawaban tersimpan
    if (status.habis) {
      const hasil = await nilaiDanSimpan({ user, ujian, jawaban: parseJawaban(sesi), waktuMulai: sesi.waktuMulai, sesiId: sesi.id });
      return NextResponse.json({ status: 'selesai_otomatis', hasil, serverNow });
    }

    const byId = new Map(soal.map((s) => [s.id, s]));
    const groups = tahap.map((t, i) => {
      const terkunci = status.berbagian && i !== status.tahap;
      return {
        nama: t.nama,
        durasiMenit: t.durasiMenit,
        jumlah: t.soalIds.length,
        terkunci,
        selesai: status.berbagian && i < status.tahap,
        // Di mode berbagian, isi soal hanya dikirim untuk bagian yang sedang aktif
        soal: terkunci ? [] : t.soalIds.map((id) => {
          const s = byId.get(id)!;
          return {
            id: s.id, pertanyaan: s.pertanyaan, opsiA: s.opsiA, opsiB: s.opsiB, opsiC: s.opsiC, opsiD: s.opsiD,
            mataPelajaran: s.mataPelajaran, bagian: s.bagian?.nama ?? null, bobot: s.bobot,
          };
        }),
      };
    });

    return NextResponse.json({
      status: 'ok',
      ujianId: ujian?.id ?? null,
      namaUjian: ujian?.nama ?? 'Ujian',
      groups,
      sesi: {
        waktuMulai: sesi.waktuMulai,
        tenggat: status.tenggat,
        serverNow,
        berbagian: status.berbagian,
        tahap: status.tahap,
        jumlahTahap: tahap.length,
        jawaban: parseJawaban(sesi),
        ragu: parseRagu(sesi),
      },
    });
  } catch (error) {
    console.error('ERROR AMBIL SOAL UJIAN:', error);
    return NextResponse.json({ message: 'Gagal memuat soal ujian' }, { status: 500 });
  }
}
