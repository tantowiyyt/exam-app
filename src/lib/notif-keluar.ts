import nodemailer from 'nodemailer';
import { prisma } from './prisma';

// Notifikasi di luar aplikasi: email (SMTP) dan WhatsApp (gateway HTTP: Fonnte, Wablas, atau URL lain).
// Pengaturan disimpan di PengaturanAplikasi dengan awalan "notif."; semua kanal nonaktif bawaannya.
// Setiap kiriman dicatat di NotifKeluar dengan kunci unik agar tidak terkirim dua kali.

export const DEFAULT_NOTIF = {
  emailAktif: 'nonaktif',
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  smtpDari: '',
  waAktif: 'nonaktif',
  /** fonnte | wablas | lain (POST JSON {target, message} ke waUrl) */
  waPenyedia: 'fonnte',
  waUrl: '',
  waToken: '',
  /** Jenis notifikasi yang dikirim (aktif/nonaktif) */
  kirimTugas: 'aktif',
  kirimPengumuman: 'aktif',
  kirimUjian: 'aktif',
  pengingatTenggat: 'aktif',
};
export type PengaturanNotif = typeof DEFAULT_NOTIF;
const KEYS = Object.keys(DEFAULT_NOTIF) as (keyof PengaturanNotif)[];
export const RAHASIA: (keyof PengaturanNotif)[] = ['smtpPass', 'waToken'];
export const PENYEDIA_WA = ['fonnte', 'wablas', 'lain'] as const;

export async function getNotif(): Promise<PengaturanNotif> {
  const rows = await prisma.pengaturanAplikasi.findMany({ where: { key: { in: KEYS.map((k) => `notif.${k}`) } } });
  const out = { ...DEFAULT_NOTIF };
  for (const r of rows) {
    const k = r.key.slice('notif.'.length) as keyof PengaturanNotif;
    if (k in out) out[k] = r.value;
  }
  return out;
}

export async function setNotif(data: Record<string, unknown>) {
  const ops = KEYS.filter((k) => typeof data[k] === 'string').map((k) => {
    const value = String(data[k]).trim().slice(0, 500);
    return prisma.pengaturanAplikasi.upsert({ where: { key: `notif.${k}` }, update: { value }, create: { key: `notif.${k}`, value } });
  });
  await prisma.$transaction(ops);
}

export const emailValid = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Nomor HP Indonesia ke format 62xxxxxxxx; '' bila tidak valid. */
export function nomorWa(hp: string | null | undefined) {
  let n = String(hp ?? '').replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return /^62\d{8,13}$/.test(n) ? n : '';
}

const emailSiap = (c: PengaturanNotif) => c.emailAktif === 'aktif' && !!c.smtpHost && emailValid(c.smtpDari || c.smtpUser);
const waSiap = (c: PengaturanNotif) => c.waAktif === 'aktif' && !!c.waToken && (c.waPenyedia !== 'lain' || /^https?:\/\//.test(c.waUrl)) && (c.waPenyedia !== 'wablas' || /^https?:\/\//.test(c.waUrl));

export type Kanal = 'email' | 'wa';
type Penerima = { email?: string | null; noHp?: string | null };

/** Kanal yang bisa dipakai untuk pengguna ini (sesuai pengaturan & data kontaknya). */
export function kanalUntuk(u: Penerima, c: PengaturanNotif): { kanal: Kanal; tujuan: string }[] {
  const out: { kanal: Kanal; tujuan: string }[] = [];
  if (emailSiap(c) && u.email && emailValid(u.email)) out.push({ kanal: 'email', tujuan: u.email });
  const wa = nomorWa(u.noHp);
  if (waSiap(c) && wa) out.push({ kanal: 'wa', tujuan: wa });
  return out;
}

export async function kirimEmail(c: PengaturanNotif, to: string, subject: string, text: string) {
  const port = Number(c.smtpPort) || 587;
  const transport = nodemailer.createTransport({
    host: c.smtpHost, port, secure: port === 465,
    auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  await transport.sendMail({ from: c.smtpDari || c.smtpUser, to, subject, text, disableFileAccess: true, disableUrlAccess: true });
}

export async function kirimWa(c: PengaturanNotif, nomor: string, pesan: string) {
  let res: Response;
  const sinyal = AbortSignal.timeout(15000);
  if (c.waPenyedia === 'fonnte') {
    res = await fetch(c.waUrl || 'https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: c.waToken }, body: new URLSearchParams({ target: nomor, message: pesan }), signal: sinyal,
    });
  } else if (c.waPenyedia === 'wablas') {
    res = await fetch(`${c.waUrl.replace(/\/+$/, '')}/api/send-message`, {
      method: 'POST', headers: { Authorization: c.waToken }, body: new URLSearchParams({ phone: nomor, message: pesan }), signal: sinyal,
    });
  } else {
    res = await fetch(c.waUrl, {
      method: 'POST', headers: { Authorization: c.waToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: nomor, message: pesan }), signal: sinyal,
    });
  }
  if (!res.ok) throw new Error(`Gateway WhatsApp menjawab ${res.status}`);
  const teks = await res.text();
  // Fonnte/Wablas menjawab 200 dengan status false bila gagal
  if (/"status"\s*:\s*false/.test(teks)) throw new Error(teks.slice(0, 200));
}

/**
 * Kirim satu pesan ke pengguna lewat semua kanal yang tersedia. kunci = penanda unik kejadian
 * (mis. "tugas-baru:12"); kiriman dengan kunci + kanal + user yang sama tidak diulang.
 * Mengembalikan kanal yang berhasil.
 */
export async function kirimKe(
  user: Penerima & { id: number; notifWa?: boolean },
  pesan: { kunci: string; judul: string; isi: string },
  opsi: { c?: PengaturanNotif; paksa?: boolean } = {},
): Promise<Kanal[]> {
  const c = opsi.c ?? (await getNotif());
  if (!opsi.paksa && user.notifWa === false) return [];
  const berhasil: Kanal[] = [];
  for (const { kanal, tujuan } of kanalUntuk(user, c)) {
    const kunci = `${pesan.kunci}:${kanal}:${user.id}`.slice(0, 190);
    if (!opsi.paksa && (await prisma.notifKeluar.findUnique({ where: { kunci }, select: { id: true } }))) continue;
    let status = 'terkirim';
    let error = '';
    try {
      if (kanal === 'email') await kirimEmail(c, tujuan, pesan.judul, pesan.isi);
      else await kirimWa(c, tujuan, `*${pesan.judul}*\n${pesan.isi}`);
      berhasil.push(kanal);
    } catch (e) {
      status = 'gagal';
      error = e instanceof Error ? e.message.slice(0, 300) : 'Gagal mengirim';
    }
    // Kiriman paksa (kode reset) tidak dicatat dengan kunci tetap agar bisa diulang
    const k = opsi.paksa ? `${kunci}:${Date.now()}` : kunci;
    await prisma.notifKeluar.create({ data: { kunci: k, userId: user.id, kanal, tujuan, judul: pesan.judul.slice(0, 200), status, error } }).catch(() => {});
  }
  return berhasil;
}

/** Kirim ke banyak pengguna di latar belakang (tidak menahan respons API). */
export function kirimLatar(users: (Penerima & { id: number; notifWa?: boolean })[], pesan: (u: { id: number }) => { kunci: string; judul: string; isi: string }) {
  if (!users.length) return;
  void (async () => {
    try {
      const c = await getNotif();
      if (!emailSiap(c) && !waSiap(c)) return;
      for (const u of users) await kirimKe(u, pesan(u), { c });
    } catch (e) {
      console.error('NOTIF KELUAR:', e);
    }
  })();
}

/** Samarkan tujuan untuk ditampilkan: s***@gmail.com, 62812****89 */
export function samarkan(kanal: Kanal, tujuan: string) {
  if (kanal === 'email') {
    const [a, b] = tujuan.split('@');
    return `${a.slice(0, 2)}***@${b}`;
  }
  return `${tujuan.slice(0, 5)}****${tujuan.slice(-2)}`;
}
