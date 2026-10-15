#!/usr/bin/env node
// Runner tes end-to-end. Lihat tests/README.md.
//
//   npm run build && npm run test:e2e          # semua suite fungsional
//   npm run test:beban                         # + uji beban (default 150 peserta)
//
// Database asli TIDAK disentuh: prisma/dev.db disalin ke folder sementara, lalu server
// produksi (`next start`) dijalankan memakai salinan itu dan folder upload sementara.
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, copyFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT || 3457);
const BASE_URL = `http://localhost:${PORT}`;
const args = process.argv.slice(2);
const bebanIdx = args.indexOf('--beban');
const jumlahBeban = bebanIdx >= 0 ? Number(args[bebanIdx + 1]) || 150 : 0;

if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  console.error('Belum ada build produksi. Jalankan dulu: npm run build');
  process.exit(1);
}

// 1. Salin database ke folder sementara (ikut file WAL bila ada)
const tmp = mkdtempSync(join(tmpdir(), 'cat-uji-'));
const testDb = join(tmp, 'test.db').replace(/\\/g, '/');
const sumber = resolve(ROOT, process.env.SOURCE_DB || 'prisma/dev.db');
const env = { ...process.env, DATABASE_URL: `file:${testDb}`, STORAGE_DIR: join(tmp, 'storage'), NODE_ENV: 'production' };
if (existsSync(sumber)) {
  copyFileSync(sumber, testDb);
  for (const ext of ['-wal', '-shm']) if (existsSync(sumber + ext)) copyFileSync(sumber + ext, testDb + ext);
} else {
  console.log('Database sumber tidak ada, membuat database kosong...');
  spawnSync(process.execPath, [join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'), 'db', 'push', '--skip-generate'], { cwd: ROOT, env, stdio: 'inherit' });
}

// 2. Admin khusus tes (password acak, hanya di salinan database)
const ADMIN_USER = 'uji-admin';
const ADMIN_PASS = randomBytes(12).toString('hex');
const buat = spawnSync(process.execPath, [join(ROOT, 'scripts', 'buat-admin.mjs'), ADMIN_USER, ADMIN_PASS, 'Admin Uji'], { cwd: ROOT, env, encoding: 'utf8' });
if (buat.status !== 0) {
  console.error(buat.stderr || buat.stdout);
  process.exit(1);
}

// 3. Jalankan server produksi
const server = spawn(process.execPath, [join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)], {
  cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

const berhenti = () => {
  server.kill();
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* file mungkin masih terkunci sesaat */ }
};
process.on('SIGINT', () => { berhenti(); process.exit(130); });

let siap = false;
for (let i = 0; i < 60 && !siap; i++) {
  try { siap = (await fetch(`${BASE_URL}/login`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); }
}
if (!siap) {
  console.error('Server tes gagal start:\n' + log);
  berhenti();
  process.exit(1);
}

// 4. Jalankan suite
let suites = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => /^\d+-.*\.mjs$/.test(f)).sort();
// --hanya 16,17 = jalankan suite yang namanya diawali angka itu saja
const iHanya = process.argv.indexOf('--hanya');
if (iHanya > 0) { const pilih = String(process.argv[iHanya + 1] ?? '').split(','); suites = suites.filter((f) => pilih.some((p) => f.startsWith(p))); }
if (jumlahBeban) suites.push('beban.mjs');

let totalLulus = 0;
let totalGagal = 0;
for (const suite of suites) {
  const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'e2e', suite), ...(suite === 'beban.mjs' ? [String(jumlahBeban)] : [])], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, BASE_URL, ADMIN_USER, ADMIN_PASS, TEST_DB: `file:${testDb}` },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const lulus = (out.match(/^PASS /gm) || []).length;
  const gagal = (out.match(/^FAIL /gm) || []).length + (r.status !== 0 && !/^FAIL /m.test(out) ? 1 : 0);
  totalLulus += lulus;
  totalGagal += gagal;
  console.log(`${gagal ? '✗' : '✓'} ${suite.padEnd(24)} lulus ${lulus}${gagal ? `, GAGAL ${gagal}` : ''}`);
  if (suite === 'beban.mjs' || gagal) console.log(out.split('\n').filter((l) => !l.startsWith('PASS ')).map((l) => '    ' + l).join('\n'));
}

console.log(`\nTotal: ${totalLulus} lulus, ${totalGagal} gagal`);
berhenti();
process.exit(totalGagal ? 1 : 0);
