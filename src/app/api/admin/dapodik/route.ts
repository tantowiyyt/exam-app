import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { bacaXlsx, bacaCsv, tanggalSel } from '@/lib/xlsx';

// Impor siswa dari file unduhan Dapodik ("Daftar Peserta Didik", .xlsx) atau CSV dengan judul kolom yang sama.
// Baris judul dicari otomatis (baris yang memuat "Nama" dan "NISN"/"NIPD"). NIS = NIPD (bila kosong: NISN).
// Siswa yang sudah ada (NIS sama, atau NISN sama) diperbarui datanya — password & nilai tidak diubah.
// FormData: file, mode = pratinjau | impor, password = nisn | tanggal | nis (password awal siswa baru), buatKelas = 1

const KOLOM: Record<string, string[]> = {
  nama: ['nama', 'nama peserta didik', 'nama siswa'],
  nis: ['nipd', 'nis', 'no induk', 'nomor induk'],
  nisn: ['nisn'],
  jk: ['jk', 'jenis kelamin', 'l/p'],
  tempatLahir: ['tempat lahir'],
  tanggalLahir: ['tanggal lahir', 'tgl lahir'],
  nik: ['nik', 'nik siswa'],
  alamat: ['alamat', 'alamat jalan'],
  hp: ['hp', 'no hp', 'nomor hp', 'no. hp', 'telepon', 'no telp'],
  email: ['e-mail', 'email'],
  kelas: ['rombel saat ini', 'rombel', 'kelas', 'rombongan belajar'],
};

type Baris = { nis: string; nisn: string; nama: string; jk: string | null; tempatLahir: string | null; tanggalLahir: Date | null; nik: string | null; alamat: string | null; noHp: string | null; email: string; kelas: string };

function urai(tabel: string[][]) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const iJudul = tabel.findIndex((r) => r.some((c) => norm(c) === 'nama') && r.some((c) => ['nisn', 'nipd', 'nis'].includes(norm(c))));
  if (iJudul < 0) return { error: 'Baris judul kolom tidak ditemukan. Pastikan file memuat kolom "Nama" dan "NISN" atau "NIPD".' } as const;
  const judul = tabel[iJudul].map(norm);
  const idx = Object.fromEntries(Object.entries(KOLOM).map(([k, alias]) => [k, judul.findIndex((j) => alias.includes(j))])) as Record<keyof typeof KOLOM, number>;
  const dikenali = Object.entries(idx).filter(([, i]) => i >= 0).map(([k]) => k);
  const ambil = (r: string[], k: keyof typeof KOLOM) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  const baris: Baris[] = [];
  const peringatan: string[] = [];
  for (const [n, r] of tabel.slice(iJudul + 1).entries()) {
    const nama = ambil(r, 'nama');
    const nisn = ambil(r, 'nisn').replace(/\D/g, '');
    const nis = ambil(r, 'nis') || nisn;
    if (!nama && !nis) continue;
    if (!nama || !nis) { peringatan.push(`Baris ${iJudul + n + 2}: nama atau NIS/NISN kosong, dilewati`); continue; }
    const jk = ambil(r, 'jk').toUpperCase();
    const nik = ambil(r, 'nik').replace(/\D/g, '');
    const email = ambil(r, 'email');
    baris.push({
      nis: nis.slice(0, 50), nisn: nisn.slice(0, 20), nama: nama.slice(0, 200),
      jk: jk.startsWith('L') ? 'L' : jk.startsWith('P') ? 'P' : null,
      tempatLahir: ambil(r, 'tempatLahir').slice(0, 100) || null,
      tanggalLahir: tanggalSel(ambil(r, 'tanggalLahir')),
      nik: nik.length === 16 ? nik : null,
      alamat: ambil(r, 'alamat').slice(0, 255) || null,
      noHp: ambil(r, 'hp').slice(0, 30) || null,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 200) : '',
      kelas: ambil(r, 'kelas').slice(0, 50),
    });
  }
  const ganda = baris.map((b) => b.nis).filter((x, i, a) => a.indexOf(x) !== i);
  if (ganda.length) peringatan.push(`NIS ganda di file: ${[...new Set(ganda)].slice(0, 5).join(', ')} (hanya baris terakhir yang dipakai)`);
  return { baris: [...new Map(baris.map((b) => [b.nis, b])).values()], dikenali, peringatan } as const;
}

const ddmmyyyy = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}` : '');

export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) return NextResponse.json({ message: 'Pilih file unduhan Dapodik (.xlsx atau .csv)' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ message: 'Ukuran file maksimal 10 MB' }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    let tabel: string[][];
    try {
      tabel = buf.subarray(0, 2).toString('hex') === '504b' ? bacaXlsx(buf) : bacaCsv(buf.toString('utf8'));
    } catch (e) {
      return NextResponse.json({ message: e instanceof Error ? e.message : 'File tidak bisa dibaca' }, { status: 400 });
    }
    const hasil = urai(tabel);
    if ('error' in hasil) return NextResponse.json({ message: hasil.error }, { status: 400 });
    const { baris, dikenali, peringatan } = hasil;
    if (!baris.length) return NextResponse.json({ message: 'Tidak ada data siswa di file' }, { status: 400 });

    // Cocokkan dengan akun yang ada: NIS sama, atau NISN sama
    const ada = await prisma.user.findMany({
      where: { OR: [{ nomorPeserta: { in: baris.map((b) => b.nis) } }, { nisn: { in: baris.map((b) => b.nisn).filter(Boolean) } }] },
      select: { id: true, nomorPeserta: true, nisn: true, role: true },
    });
    const cocok = (b: Baris) => ada.find((u) => u.nomorPeserta === b.nis) ?? (b.nisn ? ada.find((u) => u.nisn === b.nisn) : undefined);
    const bentrok = baris.filter((b) => { const u = cocok(b); return u && u.role !== 'PESERTA'; });
    const kelasBaru = [...new Set(baris.map((b) => b.kelas).filter(Boolean))];
    const kelasAda = new Set((await prisma.kelas.findMany({ where: { nama: { in: kelasBaru } }, select: { nama: true } })).map((k) => k.nama));
    const ringkas = {
      jumlah: baris.length,
      baru: baris.filter((b) => !cocok(b)).length,
      diperbarui: baris.filter((b) => cocok(b)?.role === 'PESERTA').length,
      dilewati: bentrok.length,
      kelas: kelasBaru.map((k) => ({ nama: k, ada: kelasAda.has(k), jumlah: baris.filter((b) => b.kelas === k).length })),
      dikenali,
      peringatan: [...peringatan, ...bentrok.slice(0, 5).map((b) => `NIS ${b.nis} dipakai akun staf, dilewati`)],
    };

    if (form.get('mode') !== 'impor') {
      return NextResponse.json({ ...ringkas, contoh: baris.slice(0, 10).map((b) => ({ ...b, status: cocok(b) ? 'perbarui' : 'baru' })) });
    }

    const pilihPw = String(form.get('password') ?? 'nisn');
    let dibuat = 0, diperbarui = 0;
    for (const b of baris) {
      const u = cocok(b);
      if (u && u.role !== 'PESERTA') continue;
      const data = {
        nama: b.nama, nisn: b.nisn, jenisKelamin: b.jk, tempatLahir: b.tempatLahir, tanggalLahir: b.tanggalLahir, nik: b.nik, alamat: b.alamat,
        ...(b.noHp ? { noHp: b.noHp } : {}), ...(b.email ? { email: b.email } : {}), ...(b.kelas ? { kelas: b.kelas } : {}),
      };
      if (u) {
        await prisma.user.update({ where: { id: u.id }, data });
        diperbarui++;
      } else {
        const pw = (pilihPw === 'tanggal' ? ddmmyyyy(b.tanggalLahir) : pilihPw === 'nis' ? b.nis : b.nisn) || b.nis;
        await prisma.user.create({ data: { ...data, nomorPeserta: b.nis, password: await bcrypt.hash(pw, 8), role: 'PESERTA' } });
        dibuat++;
      }
    }
    let kelasDibuat = 0;
    if (form.get('buatKelas') === '1') {
      const baru = kelasBaru.filter((k) => !kelasAda.has(k));
      if (baru.length) kelasDibuat = (await prisma.kelas.createMany({ data: baru.map((nama) => ({ nama })) })).count;
    }
    await createAuditLog({ action: 'IMPOR_DAPODIK', target: file.name.slice(0, 100), details: { dibuat, diperbarui, kelasDibuat }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, ...ringkas, dibuat, diperbarui, kelasDibuat, message: `${dibuat} siswa baru, ${diperbarui} diperbarui${kelasDibuat ? `, ${kelasDibuat} kelas dibuat` : ''}` });
  } catch (error) {
    console.error('ERROR IMPOR DAPODIK:', error);
    return NextResponse.json({ message: 'Gagal mengimpor data Dapodik' }, { status: 500 });
  }
}
