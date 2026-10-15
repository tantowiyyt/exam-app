import { join } from 'path';

/**
 * Folder penyimpanan file upload (foto peserta, logo). Default: <folder aplikasi>/storage.
 * Di server sebaiknya diarahkan ke luar folder aplikasi lewat STORAGE_DIR agar aman saat update.
 */
export const STORAGE_DIR = process.env.STORAGE_DIR || join(process.cwd(), 'storage');
export const FOTO_DIR = join(STORAGE_DIR, 'fotos');
/** Lampiran LMS (materi, tugas, jawaban tugas). */
export const LMS_DIR = join(STORAGE_DIR, 'lms');
/** Gambar & audio soal (CAT, kuis, bank soal). */
export const MEDIA_DIR = join(STORAGE_DIR, 'media');
