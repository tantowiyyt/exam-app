"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Notifikasi } from "@/components/lms/Notifikasi";

// Kerangka aplikasi LMS untuk semua role: bilah atas + menu samping (layar lebar) / laci menu (HP).
// Halaman mengerjakan ujian (/ujian) sengaja TIDAK memakai kerangka ini (layar penuh & terkunci).

interface Me { nama: string; role: string; nomorPeserta: string }
export interface Identitas { namaAplikasi: string; namaSekolah: string; logo: string; modulCat: boolean }
interface Item { href: string; label: string; ikon: keyof typeof IKON; aktif?: (p: string) => boolean; badge?: "pesan" }
/** lipat = grup bisa dibuka-tutup (modul tambahan & sistem); terbuka otomatis bila halaman aktif ada di dalamnya. */
interface Grup { judul?: string; item: Item[]; lipat?: boolean; modul?: boolean }

const IKON = {
    centang: "M4 12l5 5L20 6",
    pesan: "M4 5h16v11H8l-4 4z",
    jam: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    buku: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7",
    rumah: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    kalender: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    ujian: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v15H6zM9 11h6M9 15h4",
    profil: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
    kunci: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z",
    kelas: "M4 6h16M4 12h16M4 18h10",
    siswa: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 8a6 6 0 0 1 12 0m-1-6a6 6 0 0 1 9 6",
    guru: "M12 3 2 8l10 5 10-5-10-5zm-6 7.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5",
    monitor: "M3 5h18v11H3zM8 21h8M12 16v5",
    soal: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    kartu: "M3 6h18v12H3zM7 10h4M7 14h6M15 10h2",
    nilai: "M4 20V10m6 10V4m6 16v-7m6 7v-11",
    dasbor: "M4 4h7v7H4zm9 0h7v4h-7zm0 6h7v10h-7zM4 13h7v7H4z",
    sistem: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-2-4-2 .5-1.5-1.5L16 4h-4l-.5 2L10 7.5 8 7 6 11l2 1-1 2 2 3 2-.5 1.5 1.5L12 20h4",
} as const;

function menu(role: string, cat: boolean): Grup[] {
    const beranda: Item = { href: "/kelas", label: "Beranda", ikon: "rumah", aktif: (p) => p === "/kelas" || (/^\/kelas\/\d/.test(p)) };
    const kalender: Item = { href: "/kelas/kalender", label: "Kalender", ikon: "kalender" };
    const password: Item = { href: "/akun/password", label: "Ganti Password", ikon: "kunci" };
    const panduan: Item = { href: "/akun/panduan", label: "Panduan", ikon: "buku" };
    const pesan: Item = { href: "/akun/pesan", label: "Pesan", ikon: "pesan", badge: "pesan" };
    if (role === "ORANGTUA") {
        return [
            { item: [{ href: "/ortu", label: "Beranda", ikon: "rumah", aktif: (p: string) => p === "/ortu" }, { href: "/ortu/rapor", label: "Rapor Anak", ikon: "nilai" }, pesan] },
            { judul: "Akun", item: [password, panduan] },
        ];
    }
    const rapor: Item = { href: "/kelas/rapor", label: "Rapor", ikon: "nilai" };
    const bankSoal: Item = { href: "/kelas/bank-soal", label: "Bank Soal", ikon: "soal" };
    if (role === "PESERTA") {
        return [
            { item: [beranda, { href: "/kelas/jadwal", label: "Jadwal", ikon: "jam" }, kalender, pesan] },
            {
                judul: "Belajar", item: [
                    { href: "/kelas/kehadiran", label: "Kehadiran", ikon: "centang" }, rapor,
                    ...(cat ? [{ href: "/dashboard", label: "Ujian Sekolah", ikon: "ujian" as const, aktif: (p: string) => p.startsWith("/dashboard") || p.startsWith("/ujian") }] : []),
                ],
            },
            { judul: "Akun", item: [{ href: "/profile", label: "Data Diri", ikon: "profil" }, password, panduan] },
        ];
    }
    const resetPw: Item = { href: "/kelas/reset-password", label: "Reset Password Siswa", ikon: "kunci" };
    const jadwal: Item = { href: "/kelas/jadwal", label: "Jadwal", ikon: "jam" };
    const jurnal: Item = { href: "/kelas/jurnal", label: "Jurnal Mengajar", ikon: "buku" };
    if (role === "GURU") {
        return [
            { item: [beranda, jadwal, kalender, pesan] },
            { judul: "Mengajar", item: [jurnal, bankSoal, rapor] },
            { judul: "Akun", item: [resetPw, password, panduan] },
        ];
    }
    if (role === "PENGAWAS") return [{ judul: "Ujian CAT", item: [{ href: "/admin/monitoring", label: "Monitoring Ujian", ikon: "monitor" }, { href: "/admin/berita-acara", label: "Berita Acara", ikon: "kartu" }] }, { judul: "Akun", item: [pesan, password, panduan] }];
    // ADMIN: LMS lebih dulu; Ujian CAT = modul tambahan (bisa dilipat / dinonaktifkan di Pengaturan)
    return [
        { item: [beranda, kalender, pesan] },
        {
            judul: "Pembelajaran", item: [
                { href: "/admin/kelas", label: "Kelas & Mapel", ikon: "kelas" },
                { ...jadwal, label: "Jadwal Pelajaran" },
                jurnal,
                { ...bankSoal, label: "Bank Soal Guru" },
                rapor,
            ],
        },
        {
            judul: "Pengguna", item: [
                { href: "/admin/peserta", label: "Siswa", ikon: "siswa" },
                { href: "/admin/dapodik", label: "Impor Dapodik", ikon: "siswa" },
                { href: "/admin/akun", label: "Guru & Staf", ikon: "guru" },
                { href: "/admin/orangtua", label: "Orang Tua", ikon: "siswa" },
                { ...resetPw, label: "Reset Password" },
            ],
        },
        ...(cat ? [{
            judul: "Modul Ujian CAT", lipat: true, modul: true, item: [
                { href: "/admin", label: "Dasbor Ujian", ikon: "dasbor" as const, aktif: (p: string) => p === "/admin" },
                { href: "/admin/ujian", label: "Kelola Ujian", ikon: "ujian" as const },
                { href: "/admin/soal", label: "Bank Soal Ujian", ikon: "soal" as const },
                { href: "/admin/bagian", label: "Bagian Ujian", ikon: "kelas" as const },
                { href: "/admin/peserta-ujian", label: "Peserta & Ruang", ikon: "siswa" as const },
                { href: "/admin/kartu", label: "Kartu Ujian", ikon: "kartu" as const },
                { href: "/admin/monitoring", label: "Monitoring", ikon: "monitor" as const },
                { href: "/admin/berita-acara", label: "Berita Acara", ikon: "kartu" as const },
                { href: "/admin/nilai", label: "Hasil Ujian", ikon: "nilai" as const },
                { href: "/admin/histori", label: "Histori", ikon: "kalender" as const },
                { href: "/admin/statistik", label: "Statistik", ikon: "nilai" as const },
                { href: "/admin/analisis-soal", label: "Analisis Soal", ikon: "soal" as const },
            ],
        }] : []),
        {
            judul: "Sistem", lipat: true, item: [
                { href: "/admin/pengaturan", label: "Pengaturan", ikon: "sistem" },
                { href: "/admin/notifikasi", label: "Notifikasi WA/Email", ikon: "pesan" },
                { href: "/admin/backup", label: "Backup & Restore", ikon: "kunci" },
                { href: "/admin/activity", label: "Aktivitas", ikon: "monitor" },
                { href: "/admin/audit-logs", label: "Audit Log", ikon: "soal" },
                { href: "/admin/ip-rules", label: "Aturan IP", ikon: "kunci" },
            ],
        },
        { judul: "Akun", item: [password, panduan] },
    ];
}

function Ikon({ d }: { d: string }) {
    return <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

// Identitas jarang berubah: dimuat sekali per kunjungan halaman
let identitasCache: Promise<Identitas | null> | null = null;
export function muatIdentitas() {
    identitasCache ??= fetch("/api/identitas").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return identitasCache;
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const path = usePathname();
    const [me, setMe] = useState<Me | null>(null);
    const [identitas, setIdentitas] = useState<Identitas | null>(null);
    const [laci, setLaci] = useState(false);
    const [belum, setBelum] = useState(0);
    useEffect(() => {
        let ignore = false;
        const cek = () => fetch("/api/pesan?belum=1").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setBelum(d.belum); }).catch(() => {});
        cek();
        const t = setInterval(cek, 60000);
        return () => { ignore = true; clearInterval(t); };
    }, [path]);
    // Grup yang dibuka-tutup pengguna (diingat di browser ini)
    const [lipatan, setLipatan] = useState<Record<string, boolean>>(() => {
        try { return JSON.parse(localStorage.getItem("menuLipat") || "{}"); } catch { return {}; }
    });
    const toggleGrup = (judul: string, buka: boolean) => setLipatan((x) => {
        const n = { ...x, [judul]: !buka };
        try { localStorage.setItem("menuLipat", JSON.stringify(n)); } catch { /* penyimpanan tidak tersedia */ }
        return n;
    });

    useEffect(() => {
        let ignore = false;
        fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setMe(d); });
        muatIdentitas().then((d) => { if (!ignore && d) { setIdentitas(d); document.title = d.namaAplikasi; } });
        return () => { ignore = true; };
    }, []);

    // Tutup laci menu saat berpindah halaman
    const [pathLaci, setPathLaci] = useState(path);
    if (pathLaci !== path) { setPathLaci(path); setLaci(false); }

    const keluar = async () => {
        await fetch("/api/logout", { method: "POST" });
        router.push("/login");
    };

    const grup = me ? menu(me.role, identitas?.modulCat ?? true) : [];
    const nama = identitas?.namaAplikasi ?? "E-Learning";
    const isiMenu = (
        <nav className="p-3 space-y-5" aria-label="Menu utama">
            {grup.map((g, i) => {
                const aktifDi = (it: Item) => (it.aktif ? it.aktif(path) : path === it.href || path.startsWith(it.href + "/"));
                const adaAktif = g.item.some(aktifDi);
                // Grup lipat: terbuka bila halaman aktif ada di dalamnya, atau bila dibuka pengguna
                const buka = !g.lipat || adaAktif || lipatan[g.judul ?? ""] === true;
                return (
                <div key={i} className={g.modul ? "rounded-xl border border-indigo-100 bg-indigo-50/40 py-1" : ""}>
                    {g.judul && (g.lipat ? (
                        <button type="button" onClick={() => !adaAktif && toggleGrup(g.judul!, buka)} aria-expanded={buka}
                            className="w-full flex items-center gap-2 px-3 mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">
                            <span className="flex-1 text-left">{g.judul}</span>
                            {g.modul && <span className="normal-case tracking-normal text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">modul</span>}
                            <span aria-hidden className={`transition-transform ${buka ? "rotate-90" : ""}`}>&#9656;</span>
                        </button>
                    ) : <p className="px-3 mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{g.judul}</p>)}
                    {buka && <ul className="space-y-0.5">
                        {g.item.map((it) => {
                            const aktif = aktifDi(it);
                            return (
                                <li key={it.href + it.label}>
                                    <Link href={it.href} aria-current={aktif ? "page" : undefined}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold ${aktif ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                                        <Ikon d={IKON[it.ikon]} /><span className="flex-1">{it.label}</span>
                                        {it.badge === "pesan" && belum > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{belum > 99 ? "99+" : belum}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>}
                </div>
                );
            })}
        </nav>
    );

    return (
        <div className="min-h-screen bg-slate-100 font-sans print:bg-white">
            <header className="bg-linear-to-r from-slate-900 to-indigo-950 text-white shadow-md sticky top-0 z-40 h-14 print:hidden">
                <div className="h-full px-3 sm:px-4 flex items-center gap-2">
                    <button onClick={() => setLaci(true)} aria-label="Buka menu" className="lg:hidden w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center">
                        <Ikon d="M4 6h16M4 12h16M4 18h16" />
                    </button>
                    <Link href={me?.role === "PENGAWAS" ? "/admin/monitoring" : me?.role === "ORANGTUA" ? "/ortu" : "/kelas"} className="flex items-center gap-2 min-w-0">
                        {identitas?.logo
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={identitas.logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shrink-0" />
                            : <span className="w-8 h-8 rounded-lg bg-indigo-500 font-black flex items-center justify-center shrink-0">{nama.charAt(0).toUpperCase()}</span>}
                        <span className="min-w-0 leading-tight">
                            <span className="block font-black tracking-wide truncate">{nama}</span>
                            {identitas?.namaSekolah && <span className="block text-[10px] text-white/60 truncate max-w-[50vw] sm:max-w-xs">{identitas.namaSekolah}</span>}
                        </span>
                    </Link>
                    <div className="ml-auto flex items-center gap-2 text-xs">
                        {me && (
                            <Link href="/akun/pesan" aria-label={belum ? `Pesan, ${belum} belum dibaca` : "Pesan"} className="relative w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center">
                                <Ikon d={IKON.pesan} />
                                {belum > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[9px] font-black flex items-center justify-center">{belum > 9 ? "9+" : belum}</span>}
                            </Link>
                        )}
                        {me && me.role !== "PENGAWAS" && me.role !== "ORANGTUA" && <Notifikasi />}
                        {me && (
                            <span className="hidden sm:flex items-center gap-2 pl-2">
                                <span className="w-8 h-8 rounded-full bg-white/15 font-bold flex items-center justify-center" aria-hidden="true">{me.nama.charAt(0).toUpperCase()}</span>
                                <span className="leading-tight max-w-40">
                                    <span className="block font-bold truncate" title={me.nama}>{me.nama}</span>
                                    <span className="block text-[10px] text-white/60">{{ ADMIN: "Admin", GURU: "Guru", PENGAWAS: "Pengawas", PESERTA: "Siswa", ORANGTUA: "Orang tua" }[me.role] ?? me.role}</span>
                                </span>
                            </span>
                        )}
                        <button onClick={keluar} className="text-red-300 hover:text-red-200 font-bold px-2">Keluar</button>
                    </div>
                </div>
            </header>

            <div className="flex">
                <div className="hidden lg:block w-60 shrink-0 bg-white border-r border-slate-200 print:hidden">
                    <aside className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">{isiMenu}</aside>
                </div>
                <div className="flex-1 min-w-0">{children}</div>
            </div>

            {laci && (
                <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
                    <div className="w-72 max-w-[85vw] bg-white h-full overflow-y-auto shadow-2xl">
                        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100">
                            <span className="min-w-0">
                                <span className="block text-sm font-bold text-slate-800 truncate">{me?.nama}</span>
                                <span className="block text-[11px] text-slate-400">{me?.nomorPeserta}</span>
                            </span>
                            <button onClick={() => setLaci(false)} aria-label="Tutup menu" className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
                        </div>
                        {isiMenu}
                    </div>
                    <button className="flex-1 bg-slate-900/50" aria-label="Tutup menu" onClick={() => setLaci(false)} />
                </div>
            )}
        </div>
    );
}

/** Judul halaman standar di dalam AppShell: label grup kecil + judul + tombol aksi di kanan. */
export function HeaderHalaman({ judul, grup, children }: { judul: string; grup?: string; children?: React.ReactNode }) {
    return (
        <div className="bg-white border-b border-slate-200 print:hidden">
            <div className="px-4 md:px-8 py-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                    {grup && <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">{grup}</p>}
                    <h1 className="text-xl md:text-2xl font-black text-slate-800">{judul}</h1>
                </div>
                {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
            </div>
        </div>
    );
}
