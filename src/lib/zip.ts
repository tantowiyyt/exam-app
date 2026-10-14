import { crc32, deflateRawSync } from 'zlib';

/**
 * Membuat file ZIP sederhana (deflate) di memori — cukup untuk mengunduh kumpulan lampiran.
 * Nama file UTF-8 (flag bit 11) agar nama berbahasa Indonesia/spasi tetap terbaca.
 */
export function buatZip(files: { nama: string; data: Buffer }[]): Buffer {
  const lokal: Buffer[] = [];
  const pusat: Buffer[] = [];
  let offset = 0;

  // Waktu DOS (dipakai semua entri)
  const d = new Date();
  const waktu = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const tanggal = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

  for (const f of files) {
    const nama = Buffer.from(f.nama, 'utf8');
    const isi = deflateRawSync(f.data);
    const crc = crc32(f.data);

    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); // versi minimum
    h.writeUInt16LE(0x0800, 6); // UTF-8
    h.writeUInt16LE(8, 8); // deflate
    h.writeUInt16LE(waktu, 10);
    h.writeUInt16LE(tanggal, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(isi.length, 18);
    h.writeUInt32LE(f.data.length, 22);
    h.writeUInt16LE(nama.length, 26);
    h.writeUInt16LE(0, 28);
    lokal.push(h, nama, isi);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(waktu, 12);
    c.writeUInt16LE(tanggal, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(isi.length, 20);
    c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(nama.length, 28);
    c.writeUInt32LE(offset, 42);
    pusat.push(c, nama);

    offset += h.length + nama.length + isi.length;
  }

  const ukuranPusat = pusat.reduce((n, b) => n + b.length, 0);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(files.length, 8);
  akhir.writeUInt16LE(files.length, 10);
  akhir.writeUInt32LE(ukuranPusat, 12);
  akhir.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokal, ...pusat, akhir]);
}
