import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { createAuditLog, getAuditIP } from '@/lib/audit-log';
import { getNotif, setNotif, RAHASIA, PENYEDIA_WA, emailValid, nomorWa, kirimEmail, kirimWa, type PengaturanNotif } from '@/lib/notif-keluar';

// Pengaturan notifikasi di luar aplikasi (email SMTP & WhatsApp gateway). Rahasia (password SMTP, token WA)
// tidak pernah dikirim balik ke browser; kosong saat menyimpan = tidak diubah.

const tampil = (c: PengaturanNotif) => ({
  ...c,
  ...Object.fromEntries(RAHASIA.map((k) => [k, ''])),
  adaRahasia: Object.fromEntries(RAHASIA.map((k) => [k, !!c[k]])),
});

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const [c, log] = await Promise.all([
      getNotif(),
      prisma.notifKeluar.findMany({ orderBy: { id: 'desc' }, take: 30, select: { id: true, kanal: true, tujuan: true, judul: true, status: true, error: true, createdAt: true } }),
    ]);
    return NextResponse.json({ pengaturan: tampil(c), log });
  } catch (error) {
    console.error('ERROR GET NOTIF:', error);
    return NextResponse.json({ message: 'Gagal memuat pengaturan notifikasi' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const body = await request.json();
    const aktif = (v: unknown) => v === undefined || v === 'aktif' || v === 'nonaktif';
    for (const k of ['emailAktif', 'waAktif', 'kirimTugas', 'kirimPengumuman', 'kirimUjian', 'pengingatTenggat']) {
      if (!aktif(body[k])) return NextResponse.json({ message: `Nilai ${k} tidak valid` }, { status: 400 });
    }
    if (body.waPenyedia !== undefined && !(PENYEDIA_WA as readonly string[]).includes(body.waPenyedia)) return NextResponse.json({ message: 'Penyedia WhatsApp tidak dikenal' }, { status: 400 });
    if (body.smtpPort !== undefined && !/^\d{2,5}$/.test(String(body.smtpPort))) return NextResponse.json({ message: 'Port SMTP tidak valid' }, { status: 400 });
    if (body.smtpDari && !emailValid(String(body.smtpDari))) return NextResponse.json({ message: 'Alamat pengirim email tidak valid' }, { status: 400 });
    if (body.waUrl && !/^https?:\/\//.test(String(body.waUrl))) return NextResponse.json({ message: 'URL gateway harus diawali http:// atau https://' }, { status: 400 });
    const data = { ...body };
    for (const k of RAHASIA) if (!data[k]) delete data[k];
    await setNotif(data);
    const c = await getNotif();
    await createAuditLog({ action: 'UPDATE_NOTIFIKASI', target: 'Notifikasi luar aplikasi', details: { email: c.emailAktif, wa: c.waAktif }, ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, message: 'Pengaturan notifikasi disimpan', pengaturan: tampil(c) });
  } catch (error) {
    console.error('ERROR PUT NOTIF:', error);
    return NextResponse.json({ message: 'Gagal menyimpan pengaturan' }, { status: 500 });
  }
}

// Kirim pesan uji: { kanal: 'email' | 'wa', tujuan }
export async function POST(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  try {
    const { kanal, tujuan } = await request.json();
    const c = await getNotif();
    const isi = 'Pesan uji dari aplikasi sekolah. Bila pesan ini sampai, pengaturan notifikasi sudah benar.';
    if (kanal === 'email') {
      if (!emailValid(String(tujuan ?? ''))) return NextResponse.json({ message: 'Email tujuan tidak valid' }, { status: 400 });
      if (!c.smtpHost) return NextResponse.json({ message: 'Server SMTP belum diisi' }, { status: 400 });
      await kirimEmail(c, tujuan, 'Pesan uji notifikasi', isi);
    } else if (kanal === 'wa') {
      const no = nomorWa(tujuan);
      if (!no) return NextResponse.json({ message: 'Nomor WhatsApp tidak valid' }, { status: 400 });
      if (!c.waToken) return NextResponse.json({ message: 'Token gateway WhatsApp belum diisi' }, { status: 400 });
      await kirimWa(c, no, isi);
    } else {
      return NextResponse.json({ message: 'Kanal tidak dikenal' }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'Pesan uji terkirim' });
  } catch (error) {
    return NextResponse.json({ message: `Gagal mengirim: ${error instanceof Error ? error.message : 'kesalahan tidak dikenal'}` }, { status: 502 });
  }
}
