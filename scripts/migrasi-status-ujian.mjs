// Migrasi sekali jalan (Phase 19): status "sudah ujian" per ujian.
// - Peserta dengan User.sudahUjian = true yang punya histori ujian tetapi belum punya sesi selesai
//   untuk ujian itu -> dibuatkan SesiUjian selesai (agar tetap tercatat "sudah mengerjakan").
// - Ujian tanpa semester -> semester aktif.
// Aman dijalankan berulang. Pakai: node scripts/migrasi-status-ujian.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const peserta = await prisma.user.findMany({ where: { role: 'PESERTA', sudahUjian: true }, select: { id: true } });
let dibuat = 0;
for (const { id } of peserta) {
  const histori = await prisma.historiUjian.findFirst({ where: { userId: id }, orderBy: { waktuSelesai: 'desc' } });
  if (!histori) continue;
  const ada = await prisma.sesiUjian.findFirst({ where: { userId: id, ujianId: histori.ujianId, selesai: true } });
  if (ada) continue;
  await prisma.sesiUjian.create({ data: { userId: id, ujianId: histori.ujianId, waktuMulai: histori.waktuMulai, tahapMulai: histori.waktuMulai, selesai: true } });
  dibuat++;
}
const aktif = await prisma.semester.findFirst({ where: { aktif: true } });
const n = aktif ? (await prisma.ujian.updateMany({ where: { semesterId: null }, data: { semesterId: aktif.id } })).count : 0;
console.log(`Sesi selesai dibuat: ${dibuat}. Ujian diberi semester aktif: ${n}.`);
await prisma.$disconnect();
