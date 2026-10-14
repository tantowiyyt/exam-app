import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/session';

export async function POST() {
  try {
    await deleteSession();
    return NextResponse.json({ success: true, message: 'Berhasil logout' });
  } catch (error) {
    console.error('ERROR PADA API LOGOUT:', error);
    return NextResponse.json({ message: 'Gagal logout' }, { status: 500 });
  }
}
