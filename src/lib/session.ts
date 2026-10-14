import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey = process.env.SESSION_SECRET;
if (!secretKey || secretKey.length < 32) {
  // Tanpa secret yang kuat, token login bisa dipalsukan. Isi SESSION_SECRET (min. 32 karakter acak) di .env.
  console.error('[KEAMANAN] SESSION_SECRET kosong atau kurang dari 32 karakter. Lihat DEPLOY.md.');
}
const encodedKey = new TextEncoder().encode(secretKey);

/**
 * Cookie "Secure" hanya dikirim browser lewat HTTPS. Untuk server lab yang diakses via
 * http://IP-lokal set COOKIE_SECURE=false; bila tidak diisi: aktif di produksi.
 */
const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : process.env.NODE_ENV === 'production';

export interface SessionPayload {
  nomorPeserta: string;
  nama: string;
  role: string;
  expiresAt: Date;
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({
    nomorPeserta: payload.nomorPeserta,
    nama: payload.nama,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch {
    console.log('Failed to verify session');
    return null;
  }
}

export async function createSession(nomorPeserta: string, nama: string, role: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ nomorPeserta, nama, role, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: cookieSecure,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return null;

  const session = await decrypt(sessionCookie);
  if (!session) return null;

  // Check if session has expired
  if (new Date(session.expiresAt) < new Date()) {
    await deleteSession();
    return null;
  }

  return session;
}
