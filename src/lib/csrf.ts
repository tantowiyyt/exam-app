import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

// Generate a short-lived CSRF token tied to the session
export async function generateCsrfToken(nomorPeserta: string): Promise<string> {
  return new SignJWT({ type: 'csrf', sub: nomorPeserta })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(encodedKey);
}

// Verify CSRF token from request header matches cookie
export async function verifyCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const token = request.headers.get('x-csrf-token');
  const session = cookieStore.get('session')?.value;

  if (!token || !session) return false;

  try {
    // Token harus bertipe csrf (bukan JWT sesi) dan milik user pada sesi ini
    const { payload: csrf } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] });
    if (csrf.type !== 'csrf') return false;

    const { payload } = await jwtVerify(session, encodedKey, { algorithms: ['HS256'] });
    return !!payload.nomorPeserta && csrf.sub === payload.nomorPeserta;
  } catch {
    return false;
  }
}
