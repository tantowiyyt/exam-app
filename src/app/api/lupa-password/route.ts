import { NextResponse } from 'next/server';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAuditIP, createAuditLog } from '@/lib/audit-log';
import { getNotif, kanalUntuk, kirimKe, samarkan } from '@/lib/notif-keluar';

// Lupa password (publik, tanpa login).
//  { aksi: 'minta', nomorPeserta }  -> bila email/WhatsApp aktif & akun punya kontak: kode 6 angka dikirim (berlaku 15 menit).
//                                      Selain itu: permintaan diteruskan ke wali kelas / admin untuk direset.
//  { aksi: 'kode', nomorPeserta, kode, passwordBaru } -> ganti password dengan kode.
// Jawaban untuk akun yang tidak ada sama dengan jalur wali kelas (tidak membocorkan akun mana yang terdaftar).

const MENIT_BERLAKU = 15;
const MAKS_PERCOBAAN = 5;
const hashKode = (userId: number, kode: string) =>
  createHmac('sha256', process.env.SESSION_SECRET || 'kode-reset').update(`${userId}:${kode}`).digest('hex');

const PESAN_WALI = 'Permintaan reset password sudah dikirim ke wali kelas / admin. Temui wali kelas Anda untuk mendapatkan password baru.';

export async function POST(request: Request) {
  try {
    const ip = getAuditIP(request);
    const body = await request.json().catch(() => ({}));
    const nomorPeserta = String(body.nomorPeserta ?? '').trim().slice(0, 100);
    if (!nomorPeserta) return NextResponse.json({ message: 'Isi NIS / username' }, { status: 400 });

    // Dibatasi per akun (bukan per IP: satu lab sekolah biasanya berbagi satu IP)
    const batas = checkRateLimit(`lupa-akun:${body.aksi}:${nomorPeserta.toLowerCase()}`);
    if (!batas.allowed) {
      return NextResponse.json({ message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(batas.retryAfterMs / 60000)} menit.` }, { status: 429 });
    }
    const user = await prisma.user.findUnique({ where: { nomorPeserta }, select: { id: true, role: true, nama: true, email: true, noHp: true } });

    if (body.aksi === 'minta') {
      if (!user) return NextResponse.json({ langkah: 'wali', message: PESAN_WALI });
      const c = await getNotif();
      const kanal = kanalUntuk(user, c);
      if (kanal.length) {
        const kode = String(randomInt(0, 1000000)).padStart(6, '0');
        await prisma.kodeReset.updateMany({ where: { userId: user.id, dipakai: false }, data: { dipakai: true } });
        await prisma.kodeReset.create({
          data: { userId: user.id, kodeHash: hashKode(user.id, kode), kanal: kanal.map((k) => k.kanal).join(','), kadaluarsa: new Date(Date.now() + MENIT_BERLAKU * 60000) },
        });
        const terkirim = await kirimKe(user, {
          kunci: 'kode-reset', judul: 'Kode reset password',
          isi: `Kode reset password Anda: ${kode}\nBerlaku ${MENIT_BERLAKU} menit. Abaikan pesan ini bila Anda tidak meminta reset password.`,
        }, { c, paksa: true });
        if (terkirim.length) {
          const tujuan = kanal.filter((k) => terkirim.includes(k.kanal)).map((k) => samarkan(k.kanal, k.tujuan));
          return NextResponse.json({ langkah: 'kode', message: `Kode dikirim ke ${tujuan.join(' dan ')}. Berlaku ${MENIT_BERLAKU} menit.` });
        }
        // Gagal mengirim -> jatuh ke jalur wali kelas
      }
      // Admin/pengawas/guru tanpa kontak: hanya admin lain yang bisa mereset (atau npm run admin:buat)
      const ada = await prisma.permintaanReset.findFirst({ where: { userId: user.id, selesai: false } });
      if (!ada) await prisma.permintaanReset.create({ data: { userId: user.id, ipAddress: ip } });
      return NextResponse.json({ langkah: 'wali', message: user.role === 'PESERTA' ? PESAN_WALI : 'Permintaan reset password sudah dikirim ke admin.' });
    }

    if (body.aksi === 'kode') {
      const kode = String(body.kode ?? '').trim();
      const passwordBaru = String(body.passwordBaru ?? '');
      if (passwordBaru.length < 6 || passwordBaru.length > 100) return NextResponse.json({ message: 'Password baru minimal 6 karakter' }, { status: 400 });
      const rec = user ? await prisma.kodeReset.findFirst({ where: { userId: user.id, dipakai: false }, orderBy: { id: 'desc' } }) : null;
      if (!user || !rec || rec.kadaluarsa < new Date() || rec.percobaan >= MAKS_PERCOBAAN) {
        return NextResponse.json({ message: 'Kode tidak berlaku. Minta kode baru.' }, { status: 400 });
      }
      const cocok = /^\d{6}$/.test(kode) && timingSafeEqual(Buffer.from(hashKode(user.id, kode)), Buffer.from(rec.kodeHash));
      if (!cocok) {
        await prisma.kodeReset.update({ where: { id: rec.id }, data: { percobaan: { increment: 1 } } });
        return NextResponse.json({ message: `Kode salah (sisa ${MAKS_PERCOBAAN - rec.percobaan - 1} percobaan)` }, { status: 400 });
      }
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(passwordBaru, 10) } }),
        prisma.kodeReset.update({ where: { id: rec.id }, data: { dipakai: true } }),
        prisma.permintaanReset.updateMany({ where: { userId: user.id, selesai: false }, data: { selesai: true, selesaiAt: new Date() } }),
      ]);
      await createAuditLog({ action: 'RESET_PASSWORD_MANDIRI', target: `User #${user.id} ${user.nama}`, ipAddress: ip });
      return NextResponse.json({ success: true, message: 'Password berhasil diganti. Silakan login.' });
    }

    return NextResponse.json({ message: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('ERROR LUPA PASSWORD:', error);
    return NextResponse.json({ message: 'Gagal memproses permintaan' }, { status: 500 });
  }
}
