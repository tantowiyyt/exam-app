import { NextResponse } from 'next/server';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { FOTO_DIR } from '@/lib/storage';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { cache } from '@/lib/cache';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';

type Row = Record<string, unknown> & { id: number };

const FOTO_NAME = /^[\w-]+\.(jpg|jpeg|png|webp)$/i;

/** Foto peserta (storage/fotos) sebagai base64 agar ikut dalam file backup. */
async function bacaFoto(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    for (const name of await readdir(FOTO_DIR)) {
      if (FOTO_NAME.test(name)) out[name] = (await readFile(join(FOTO_DIR, name))).toString('base64');
    }
  } catch {
    // folder belum ada = belum ada foto
  }
  return out;
}

// Nama tabel dalam file backup (diisi berurutan sesuai relasi di POST)
type TableName =
  | 'users' | 'ujian' | 'bagianUjian' | 'soal' | 'jawabanUjian'
  | 'historiUjian' | 'sesiUjian' | 'pelanggaran' | 'userActivity' | 'ipRules' | 'auditLogs'
  | 'kelas' | 'mapel' | 'materi' | 'tugas' | 'pengumpulanTugas' | 'pengumuman' | 'komentar';

export async function GET(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const [users, ujian, bagianUjian, soal, jawabanUjian, historiUjian, sesiUjian, pelanggaran, userActivity, ipRules, auditLogs] = await Promise.all([
      prisma.user.findMany({ orderBy: { id: 'asc' } }),
      prisma.ujian.findMany({ orderBy: { id: 'asc' } }),
      prisma.bagianUjian.findMany({ orderBy: { id: 'asc' } }),
      prisma.soal.findMany({ orderBy: { id: 'asc' } }),
      prisma.jawabanUjian.findMany({ orderBy: { id: 'asc' } }),
      prisma.historiUjian.findMany({ orderBy: { id: 'asc' } }),
      prisma.sesiUjian.findMany({ orderBy: { id: 'asc' } }),
      prisma.pelanggaran.findMany({ orderBy: { id: 'asc' } }),
      prisma.userActivity.findMany({ orderBy: { id: 'asc' } }),
      prisma.iPRule.findMany({ orderBy: { id: 'asc' } }),
      prisma.auditLog.findMany({ orderBy: { id: 'asc' } }),
    ]);
    const pengaturanAplikasi = await prisma.pengaturanAplikasi.findMany();
    // LMS (lampiran file di storage/lms tidak ikut — salin foldernya, lihat DEPLOY.md)
    const [kelas, mapel, materi, materiDibaca, tugas, pengumpulanTugas, pengumuman, komentar] = await Promise.all([
      prisma.kelas.findMany({ orderBy: { id: 'asc' } }),
      prisma.mapel.findMany({ orderBy: { id: 'asc' } }),
      prisma.materi.findMany({ orderBy: { id: 'asc' } }),
      prisma.materiDibaca.findMany(),
      prisma.tugas.findMany({ orderBy: { id: 'asc' } }),
      prisma.pengumpulanTugas.findMany({ orderBy: { id: 'asc' } }),
      prisma.pengumuman.findMany({ orderBy: { id: 'asc' } }),
      prisma.komentar.findMany({ orderBy: { id: 'asc' } }),
    ]);

    const backup = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      fotos: await bacaFoto(),
      data: {
        users, ujian, bagianUjian, soal, jawabanUjian, historiUjian, sesiUjian, pelanggaran, userActivity, ipRules, auditLogs, pengaturanAplikasi,
        kelas, mapel, materi, materiDibaca, tugas, pengumpulanTugas, pengumuman, komentar,
      },
    };

    await createAuditLog({ action: AUDIT_ACTIONS.BACKUP_DATABASE, ipAddress: getAuditIP(request) });

    return NextResponse.json(backup, {
      headers: {
        'Content-Disposition': `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error('ERROR PADA BACKUP:', error);
    return NextResponse.json({ message: 'Gagal membuat backup' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    const { data, replaceAll, fotos } = body;

    if (!data || typeof data !== 'object' || !Array.isArray(data.users)) {
      return NextResponse.json({ message: 'Data backup tidak valid' }, { status: 400 });
    }

    const rows = (name: TableName): Row[] =>
      Array.isArray(data[name]) ? (data[name] as Row[]).filter((r) => r && Number.isInteger(r.id)) : [];

    // Jangan sampai admin terkunci: backup wajib berisi minimal satu admin bila mengganti semua data
    if (replaceAll && !rows('users').some((u) => u.role === 'ADMIN')) {
      return NextResponse.json({ message: 'Backup tidak berisi akun admin. Restore dibatalkan agar Anda tidak terkunci.' }, { status: 400 });
    }

    const counts: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      if (replaceAll) {
        await tx.komentar.deleteMany();
        await tx.materiDibaca.deleteMany();
        await tx.pengumpulanTugas.deleteMany();
        await tx.pengumuman.deleteMany();
        await tx.materi.deleteMany();
        await tx.tugas.deleteMany();
        await tx.auditLog.deleteMany();
        await tx.pengaturanAplikasi.deleteMany();
        await tx.iPRule.deleteMany();
        await tx.userActivity.deleteMany();
        await tx.pelanggaran.deleteMany();
        await tx.sesiUjian.deleteMany();
        await tx.historiUjian.deleteMany();
        await tx.jawabanUjian.deleteMany();
        await tx.soal.deleteMany();
        await tx.bagianUjian.deleteMany();
        await tx.ujian.deleteMany();
        await tx.mapel.deleteMany();
        await tx.kelas.deleteMany();
        await tx.user.deleteMany();
      }

      // ID dipertahankan agar relasi (jawaban -> user/soal, dst.) tetap benar.
      // Mode gabung: baris dengan ID yang sama ditimpa.
      const upsertAll = async (name: TableName, fn: (row: Row) => Promise<unknown>) => {
        const list = rows(name);
        for (const row of list) await fn(row);
        counts[name] = list.length;
      };

      await upsertAll('users', (r) => tx.user.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('kelas', (r) => tx.kelas.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('mapel', (r) => tx.mapel.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('ujian', (r) => tx.ujian.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('bagianUjian', (r) => tx.bagianUjian.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('soal', (r) => tx.soal.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('jawabanUjian', (r) => tx.jawabanUjian.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('historiUjian', (r) => tx.historiUjian.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('sesiUjian', (r) => tx.sesiUjian.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('pelanggaran', (r) => tx.pelanggaran.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('userActivity', (r) => tx.userActivity.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('ipRules', (r) => tx.iPRule.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('auditLogs', (r) => tx.auditLog.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('materi', (r) => tx.materi.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('tugas', (r) => tx.tugas.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('pengumpulanTugas', (r) => tx.pengumpulanTugas.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('pengumuman', (r) => tx.pengumuman.upsert({ where: { id: r.id }, update: r as never, create: r as never }));
      await upsertAll('komentar', (r) => tx.komentar.upsert({ where: { id: r.id }, update: r as never, create: r as never }));

      // Tanda "sudah dibaca" memakai kunci gabungan (tanpa id)
      const dibaca = Array.isArray(data.materiDibaca) ? data.materiDibaca : [];
      let nDibaca = 0;
      for (const row of dibaca) {
        if (row && Number.isInteger(row.userId) && Number.isInteger(row.materiId)) {
          await tx.materiDibaca.upsert({
            where: { userId_materiId: { userId: row.userId, materiId: row.materiId } },
            update: {},
            create: { userId: row.userId, materiId: row.materiId, ...(row.createdAt ? { createdAt: row.createdAt } : {}) },
          });
          nDibaca++;
        }
      }
      counts.materiDibaca = nDibaca;

      // Pengaturan aplikasi memakai kunci teks (bukan id angka)
      const pengaturan = Array.isArray(data.pengaturanAplikasi) ? data.pengaturanAplikasi : [];
      for (const row of pengaturan) {
        if (row && typeof row.key === 'string' && typeof row.value === 'string') {
          await tx.pengaturanAplikasi.upsert({ where: { key: row.key }, update: { value: row.value }, create: { key: row.key, value: row.value } });
        }
      }
      counts.pengaturanAplikasi = pengaturan.length;
    }, { timeout: 120_000, maxWait: 10_000 });

    // Pulihkan file foto (hanya nama file yang aman)
    if (fotos && typeof fotos === 'object') {
      await mkdir(FOTO_DIR, { recursive: true });
      let n = 0;
      for (const [name, b64] of Object.entries(fotos as Record<string, unknown>)) {
        if (FOTO_NAME.test(name) && typeof b64 === 'string') {
          await writeFile(join(FOTO_DIR, name), Buffer.from(b64, 'base64'));
          n++;
        }
      }
      counts.fotos = n;
    }

    cache.clear();
    await createAuditLog({
      action: AUDIT_ACTIONS.RESTORE_DATABASE,
      details: { replaceAll: !!replaceAll, counts },
      ipAddress: getAuditIP(request),
    });

    return NextResponse.json({ message: 'Restore berhasil', counts });
  } catch (error) {
    console.error('ERROR PADA RESTORE:', error);
    return NextResponse.json({ message: 'Gagal melakukan restore. Tidak ada data yang diubah. Pastikan file backup valid dan tidak bentrok dengan data yang ada.' }, { status: 500 });
  }
}
