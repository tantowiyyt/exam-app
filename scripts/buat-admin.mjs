#!/usr/bin/env node
// Buat akun admin pertama, atau reset password akun admin yang sudah ada.
//
//   npm run admin:buat -- <username> <password> ["Nama Lengkap"]
//
// Database diambil dari DATABASE_URL (otomatis dibaca dari .env oleh Prisma).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [username, password, nama = 'Administrator'] = process.argv.slice(2);

if (!username || !password) {
  console.error('Pemakaian: npm run admin:buat -- <username> <password> ["Nama Lengkap"]');
  process.exit(1);
}
if (!/^[\w.-]{3,50}$/.test(username)) {
  console.error('Username 3–50 karakter: huruf, angka, titik, minus, garis bawah.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password admin minimal 8 karakter.');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const ada = await prisma.user.findUnique({ where: { nomorPeserta: username } });
  if (ada && ada.role !== 'ADMIN') {
    console.error(`Username "${username}" sudah dipakai akun ${ada.role}. Pilih username lain.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { nomorPeserta: username },
    update: { password: hash, nama },
    create: { nomorPeserta: username, nama, password: hash, role: 'ADMIN', ruang: '', sesi: '' },
  });
  await prisma.auditLog.create({
    data: { action: ada ? 'RESET_PASSWORD_ADMIN' : 'CREATE_AKUN', target: `ADMIN ${username}`, details: JSON.stringify({ via: 'scripts/buat-admin.mjs' }) },
  });

  console.log(ada ? `Password admin "${user.nomorPeserta}" berhasil direset.` : `Admin "${user.nomorPeserta}" berhasil dibuat.`);
} finally {
  await prisma.$disconnect();
}
