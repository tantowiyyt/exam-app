import { NextResponse } from 'next/server';
import { generateCsrfToken } from '@/lib/csrf';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: 'Tidak terautentikasi' }, { status: 401 });
  }

  try {
    const token = await generateCsrfToken(session.nomorPeserta);
    return NextResponse.json({ csrfToken: token });
  } catch {
    return NextResponse.json({ message: 'Gagal generate CSRF token' }, { status: 500 });
  }
}
