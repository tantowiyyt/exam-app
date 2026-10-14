// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient; sqliteReady?: Promise<void> };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        // Log query SQL hanya saat development (di produksi memperlambat & membanjiri log)
        log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * SQLite: aktifkan mode WAL (pembaca tidak memblokir penulis, lebih tahan banyak penyimpanan serentak).
 * Pengaturan ini tersimpan permanen di file database, jadi cukup dijalankan sekali saat start.
 */
if (process.env.DATABASE_URL?.startsWith('file:') && !globalForPrisma.sqliteReady) {
    globalForPrisma.sqliteReady = prisma
        .$queryRawUnsafe('PRAGMA journal_mode = WAL;')
        .then(() => undefined)
        .catch((error) => console.error('Gagal mengaktifkan WAL SQLite:', error));
}
