import { prisma } from './prisma';

/** Identitas instansi & penandatangan untuk kop kartu ujian dan dokumen cetak lain. */
export const DEFAULT_INSTANSI = {
  namaInstansi: 'NAMA SEKOLAH / INSTANSI',
  subJudul: 'Panitia Ujian Berbasis Komputer (CAT)',
  alamat: 'Alamat instansi',
  kota: 'Kota',
  tahunPelajaran: '',
  logo: '',
  jabatanPenandatangan: 'Ketua Panitia',
  namaPenandatangan: '',
  nipPenandatangan: '',
  /** Tampilan kartu: warna aksen (lihat WARNA_KARTU) & model cetak */
  warnaKartu: 'biru',
  modelKartu: 'lengkap',
  tataTertib: [
    'Peserta hadir di ruang ujian 15 menit sebelum ujian dimulai.',
    'Kartu ini wajib dibawa dan ditunjukkan kepada pengawas.',
    'Login menggunakan Nomor Peserta dan password yang diberikan panitia.',
    'Dilarang membawa catatan, ponsel, atau alat komunikasi ke dalam ruang ujian.',
    'Dilarang berpindah tab/aplikasi atau keluar dari mode layar penuh selama ujian.',
    'Peserta yang melanggar tata tertib dapat dikeluarkan dari ruang ujian.',
  ].join('\n'),
};

export const WARNA_KARTU = ['biru', 'hijau', 'merah', 'ungu', 'oranye', 'hitam'] as const;
export const MODEL_KARTU = ['lengkap', 'ringkas'] as const;

export type Instansi = typeof DEFAULT_INSTANSI;
const KEYS = Object.keys(DEFAULT_INSTANSI) as (keyof Instansi)[];

export async function getInstansi(): Promise<Instansi> {
  const rows = await prisma.pengaturanAplikasi.findMany({ where: { key: { in: KEYS.map((k) => `instansi.${k}`) } } });
  const out = { ...DEFAULT_INSTANSI };
  for (const r of rows) {
    const k = r.key.slice('instansi.'.length) as keyof Instansi;
    if (k in out) out[k] = r.value;
  }
  return out;
}

export async function setInstansi(data: Partial<Record<string, unknown>>): Promise<Instansi> {
  const ops = KEYS
    .filter((k) => typeof data[k] === 'string')
    .map((k) => {
      const value = String(data[k]).slice(0, k === 'tataTertib' ? 4000 : 500);
      return prisma.pengaturanAplikasi.upsert({
        where: { key: `instansi.${k}` },
        update: { value },
        create: { key: `instansi.${k}`, value },
      });
    });
  await prisma.$transaction(ops);
  return getInstansi();
}
