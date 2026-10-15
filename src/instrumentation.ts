// Dijalankan sekali saat server Next.js hidup: penjadwal notifikasi WhatsApp/email (lihat lib/pengingat.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { mulaiPenjadwal } = await import('./lib/pengingat');
    mulaiPenjadwal();
  }
}
