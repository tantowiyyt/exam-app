"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

// Dasbor ujian CAT sekolah: ringkasan ujian aktif (bisa beberapa, untuk kelas berbeda) & pintasan menu.
// Jadwal, peserta (kelas), dan aktivasi diatur di Kelola Ujian; ruang/sesi & reset di Peserta Ujian.

interface Stats { totalPeserta: number; totalSoal: number; sudahUjian: number; belumUjian: number; rataNilai: number; jumlahAktif: number }
interface UjianRingkas {
    id: number; nama: string; isActive: boolean; jenis: string; durasiMenit: number; jadwalMulai: string | null; jadwalSelesai: string | null;
    labelPeserta: string; jumlahPeserta: number; jumlahSelesai: number; _count: { soal: number };
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "–");

function statusJadwal(u: UjianRingkas) {
    const now = Date.now();
    if (!u.jadwalMulai) return { label: "Tanpa jadwal", cls: "bg-slate-100 text-slate-600" };
    if (now < new Date(u.jadwalMulai).getTime()) return { label: "Belum mulai", cls: "bg-amber-100 text-amber-700" };
    if (u.jadwalSelesai && now > new Date(u.jadwalSelesai).getTime()) return { label: "Jadwal selesai", cls: "bg-red-100 text-red-700" };
    return { label: "Berlangsung", cls: "bg-emerald-100 text-emerald-700" };
}

const MENU = [
    { href: "/admin/ujian", judul: "Kelola Ujian", ket: "Buat ujian, pilih kelas peserta, jadwal, aktifkan" },
    { href: "/admin/soal", judul: "Bank Soal", ket: "Soal ujian sekolah, impor CSV" },
    { href: "/admin/peserta-ujian", judul: "Peserta Ujian", ket: "Ruang & sesi per kelas, status, reset" },
    { href: "/admin/monitoring", judul: "Monitoring", ket: "Pantau peserta secara langsung" },
    { href: "/admin/kartu", judul: "Kartu Ujian", ket: "Cetak kartu per ujian & kelas" },
    { href: "/admin/nilai", judul: "Hasil Ujian", ket: "Nilai per ujian, CSV" },
];

export default function DasborUjian() {
    const { toast } = useToast();
    const [stats, setStats] = useState<Stats | null>(null);
    const [ujian, setUjian] = useState<UjianRingkas[] | null>(null);

    useEffect(() => {
        let ignore = false;
        const muat = () => {
            fetch("/api/admin/stats").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setStats(d); });
            fetch("/api/admin/ujian").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setUjian(d); });
        };
        muat();
        const t = setInterval(muat, 10000);
        return () => { ignore = true; clearInterval(t); };
    }, []);

    const aktif = (ujian ?? []).filter((u) => u.isActive);
    const lain = (ujian ?? []).filter((u) => !u.isActive).slice(0, 5);

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Modul Ujian CAT" judul="Dasbor Ujian">
                <button onClick={async () => {
                    try { const { exportStatsToPDF } = await import("@/lib/pdf-export"); await exportStatsToPDF(); toast("Statistik di-export ke PDF", "success"); }
                    catch { toast("Gagal export PDF", "error"); }
                }} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold">Export PDF</button>
            </HeaderHalaman>
            <main id="stats-dashboard" className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
                <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {([
                        ["Ujian aktif", stats?.jumlahAktif ?? "–"],
                        ["Peserta ujian aktif", stats?.totalPeserta ?? "–"],
                        ["Sudah selesai", stats ? `${stats.sudahUjian} / ${stats.totalPeserta}` : "–"],
                        ["Rata-rata nilai", stats?.sudahUjian ? stats.rataNilai : "–"],
                    ] as [string, string | number][]).map(([l, v]) => (
                        <div key={l} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                            <p className="text-2xl font-black text-slate-800 mt-1">{v}</p>
                        </div>
                    ))}
                </section>

                <section className="space-y-3">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex-1">Ujian Aktif</h2>
                        <Link href="/admin/ujian" className="text-xs font-bold text-indigo-600 hover:underline">Kelola Ujian &rarr;</Link>
                    </div>
                    {ujian && aktif.length === 0 && (
                        <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">Tidak ada ujian aktif. Buat atau aktifkan ujian di <Link href="/admin/ujian" className="font-bold text-indigo-600">Kelola Ujian</Link>. Beberapa ujian bisa aktif bersamaan untuk kelas yang berbeda.</p>
                    )}
                    {aktif.map((u) => {
                        const st = statusJadwal(u);
                        const persen = u.jumlahPeserta ? Math.round((u.jumlahSelesai / u.jumlahPeserta) * 100) : 0;
                        return (
                            <div key={u.id} className="bg-white rounded-2xl border border-emerald-300 shadow-sm p-5 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-black text-slate-800 text-lg flex-1 min-w-0">{u.nama}</p>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                                    {u.jenis !== "LAIN" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-700">{u.jenis}</span>}
                                </div>
                                <p className="text-xs text-slate-500">Peserta: <b>{u.labelPeserta}</b> · {u._count.soal} soal · {u.durasiMenit} menit · {fmt(u.jadwalMulai)} – {fmt(u.jadwalSelesai)}</p>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${persen}%` }} /></div>
                                    <span className="text-xs font-bold text-slate-600 whitespace-nowrap">{u.jumlahSelesai}/{u.jumlahPeserta} selesai</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Link href="/admin/monitoring" className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Monitoring</Link>
                                    <Link href={`/admin/peserta-ujian?ujian=${u.id}`} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">Peserta Ujian</Link>
                                    <Link href={`/admin/nilai?ujian=${u.id}`} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">Hasil</Link>
                                </div>
                            </div>
                        );
                    })}
                </section>

                {lain.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Ujian Lainnya</h2>
                        <ul className="divide-y divide-slate-100">
                            {lain.map((u) => (
                                <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                                    <span className="flex-1 min-w-0"><span className="font-semibold text-slate-700">{u.nama}</span><span className="block text-[11px] text-slate-400">{u.labelPeserta} · {u.jumlahSelesai}/{u.jumlahPeserta} selesai</span></span>
                                    <Link href={`/admin/nilai?ujian=${u.id}`} className="text-xs font-bold text-indigo-600 hover:underline">Hasil</Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MENU.map((m) => (
                        <Link key={m.href} href={m.href} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                            <p className="font-bold text-slate-800">{m.judul}</p>
                            <p className="text-xs text-slate-500 mt-1">{m.ket}</p>
                        </Link>
                    ))}
                </section>
            </main>
        </div>
    );
}
