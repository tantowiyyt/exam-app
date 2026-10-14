import { NextResponse } from 'next/server';
import { getIdentitas } from '@/lib/pengaturan-aplikasi';

// Identitas aplikasi (nama aplikasi, nama sekolah, logo, modul CAT) untuk tampilan. Publik: tidak memuat data rahasia.
export async function GET() {
  try {
    return NextResponse.json(await getIdentitas());
  } catch (error) {
    console.error('ERROR IDENTITAS:', error);
    return NextResponse.json({ message: 'Gagal memuat identitas aplikasi' }, { status: 500 });
  }
}
