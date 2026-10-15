import { inflateRawSync } from 'zlib';
import { buatZip } from './zip';

// Baca & tulis file Excel (.xlsx) sederhana tanpa dependensi: cukup untuk ekspor Dapodik (impor siswa)
// dan file nilai untuk e-Rapor (ekspor). Hanya sel teks/angka; rumus, gaya, & sel gabungan diabaikan.

/** Isi arsip ZIP (xlsx = zip berisi XML). */
function bacaZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // Cari End Of Central Directory dari belakang
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Bukan file Excel (.xlsx) yang valid');
  const jumlah = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < jumlah; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metode = buf.readUInt16LE(p + 10);
    const ukuran = buf.readUInt32LE(p + 20);
    const panjangNama = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const komentar = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const nama = buf.subarray(p + 46, p + 46 + panjangNama).toString('utf8');
    const awalData = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const data = buf.subarray(awalData, awalData + ukuran);
    if (metode === 0) out.set(nama, Buffer.from(data));
    else if (metode === 8) out.set(nama, inflateRawSync(data));
    p += 46 + panjangNama + extra + komentar;
  }
  return out;
}

const entitas = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
  const m: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  if (m[e.toLowerCase()]) return m[e.toLowerCase()];
  return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});
const teksXml = (x: string) => entitas([...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const kolomKe = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** Baca lembar pertama file xlsx menjadi tabel teks. */
export function bacaXlsx(buf: Buffer): string[][] {
  const zip = bacaZip(buf);
  const shared = [...(zip.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => teksXml(m[1]));
  // Lembar pertama sesuai workbook (fallback: sheet1.xml)
  let jalur = 'xl/worksheets/sheet1.xml';
  const wb = zip.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = zip.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb)?.[1];
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  if (target) jalur = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const xml = (zip.get(jalur) ?? zip.get('xl/worksheets/sheet1.xml'))?.toString('utf8');
  if (!xml) throw new Error('Lembar kerja tidak ditemukan di file Excel');
  const baris: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const isi: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atr = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(atr)?.[1];
      const t = /\bt="(\w+)"/.exec(atr)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1];
      let nilai = '';
      if (t === 's' && v !== undefined) nilai = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') nilai = teksXml(c[2] ?? '');
      else if (v !== undefined) nilai = entitas(v);
      const idx = ref ? kolomKe(ref) : isi.length;
      while (isi.length < idx) isi.push('');
      isi[idx] = nilai.trim();
    }
    baris.push(isi);
  }
  return baris;
}

/** Baca CSV (pemisah koma/titik koma) menjadi tabel teks. */
export function bacaCsv(teks: string): string[][] {
  const t = teks.replace(/^﻿/, '');
  const pemisah = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const out: string[][] = [];
  let baris: string[] = [];
  let sel = '';
  let kutip = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (kutip) {
      if (ch === '"' && t[i + 1] === '"') { sel += '"'; i++; } else if (ch === '"') kutip = false; else sel += ch;
    } else if (ch === '"') kutip = true;
    else if (ch === pemisah) { baris.push(sel.trim()); sel = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      baris.push(sel.trim()); out.push(baris); baris = []; sel = '';
    } else sel += ch;
  }
  if (sel || baris.length) { baris.push(sel.trim()); out.push(baris); }
  return out;
}

/** Tanggal dari sel Excel: "2010-05-12", "12/05/2010", "12-05-2010", atau nomor seri Excel. */
export function tanggalSel(s: string): Date | null {
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const n = Number(s);
  if (Number.isFinite(n) && n > 1000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return null;
}

const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const huruf = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** Buat file xlsx dari beberapa lembar. Baris pertama tiap lembar dicetak tebal (judul kolom). */
export function tulisXlsx(lembar: { nama: string; baris: (string | number | null | undefined)[][] }[]): Buffer {
  const namaAman = (n: string, i: number) => (n.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Lembar${i + 1}`);
  const dipakai = new Set<string>();
  const nama = lembar.map((l, i) => {
    let n = namaAman(l.nama, i);
    for (let k = 2; dipakai.has(n.toLowerCase()); k++) n = `${namaAman(l.nama, i).slice(0, 28)} ${k}`;
    dipakai.add(n.toLowerCase());
    return n;
  });
  const sheet = (rows: (string | number | null | undefined)[][]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    if (v === null || v === undefined || v === '') return '';
    const ref = `${huruf(ci)}${ri + 1}`;
    const gaya = ri === 0 ? ' s="1"' : '';
    return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${gaya}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${gaya}><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files = [
    { nama: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${nama.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nama: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nama: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nama.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nama: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nama.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${nama.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nama: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    ...lembar.map((l, i) => ({ nama: `xl/worksheets/sheet${i + 1}.xml`, data: sheet(l.baris) })),
  ];
  return buatZip(files.map((f) => ({ nama: f.nama, data: Buffer.from(f.data, 'utf8') })));
}
