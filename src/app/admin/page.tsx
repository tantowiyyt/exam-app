"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

interface Stats {
    totalPeserta: number;
    totalSoal: number;
    sudahUjian: number;
    belumUjian: number;
    rataNilai: number;
    durasiMenit: number;
}


export default function AdminDashboard() {
    const { toast } = useToast();
    const [stats, setStats] = useState<Stats | null>(null);
    const [jadwalMulai, setJadwalMulai] = useState("");
    const [jadwalSelesai, setJadwalSelesai] = useState("");
    const [durasi, setDurasi] = useState(60);
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data.role !== "ADMIN") router.replace("/login");
                } else {
                    router.replace("/login");
                }
            } catch {
                router.replace("/login");
            }
        };
        fetchUser();
    }, [router]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/admin/stats");
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch (err) {
                console.error("Gagal memuat statistik:", err);
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchPengaturan = async () => {
            try {
                const res = await fetch("/api/admin/pengaturan");
                if (res.ok) {
                    const data = await res.json();
                    setDurasi(data.durasiMenit || 60);
                    if (data.jadwalMulai) {
                        const d = new Date(data.jadwalMulai);
                        setJadwalMulai(d.toISOString().slice(0, 16));
                    }
                    if (data.jadwalSelesai) {
                        const d = new Date(data.jadwalSelesai);
                        setJadwalSelesai(d.toISOString().slice(0, 16));
                    }
                }
            } catch (err) {
                console.error("Gagal memuat pengaturan:", err);
            }
        };
        fetchPengaturan();
    }, []);

    const handleSaveJadwal = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/pengaturan", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    durasiMenit: durasi,
                    jadwalMulai: jadwalMulai || null,
                    jadwalSelesai: jadwalSelesai || null,
                }),
            });
            if (res.ok) {
                toast("Jadwal ujian berhasil disimpan!", "success");
            } else {
                toast("Gagal menyimpan jadwal", "error");
            }
        } catch {
            toast("Gagal menyimpan jadwal", "error");
        }
        setSaving(false);
    };

    const handleResetJadwal = async () => {
        if (!confirm("Yakin ingin mereset jadwal? Ujian bisa diakses kapan saja.")) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/pengaturan", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resetJadwal: true }),
            });
            if (res.ok) {
                setJadwalMulai("");
                setJadwalSelesai("");
                toast("Jadwal berhasil direset!", "success");
            }
        } catch {
            toast("Gagal mereset jadwal", "error");
        }
        setSaving(false);
    };

    const now = new Date();
    const mulai = jadwalMulai ? new Date(jadwalMulai) : null;
    const selesai = jadwalSelesai ? new Date(jadwalSelesai) : null;
    let jadwalStatus = "Belum Dijadwalkan";
    let jadwalColor = "text-slate-400 bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600";
    if (mulai && selesai) {
        if (now < mulai) {
            jadwalStatus = "Belum Mulai";
            jadwalColor = "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700";
        } else if (now >= mulai && now <= selesai) {
            jadwalStatus = "Sedang Berlangsung";
            jadwalColor = "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700";
        } else {
            jadwalStatus = "Selesai";
            jadwalColor = "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700";
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans flex transition-colors">

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <HeaderHalaman grup="Ujian CAT" judul="Dasbor Ujian">
                    <div className={`px-3 py-1 rounded-lg text-xs font-semibold border shadow-sm flex items-center gap-1.5 ${jadwalColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${jadwalStatus === 'Sedang Berlangsung' ? 'bg-emerald-500 animate-ping' : 'bg-current'}`}></span>
                        {jadwalStatus}
                    </div>
                </HeaderHalaman>

                {/* Page Content */}
                <main className="flex-1 p-6 space-y-8 overflow-y-auto">
                    {/* Welcome & Info Banner */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden transition-colors">
                        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/5 dark:bg-blue-400/10 rounded-full blur-3xl -z-10 pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
                        <div>
                            <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white">Ikhtisar Ujian Hari Ini</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Pantau statistik real-time dan kelola konfigurasi sistem ujian CAT Anda.</p>
                        </div>
                    </div>

                    {/* Jadwal Ujian Settings */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Pengaturan Jadwal Ujian</h3>
                        <div className="grid md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Durasi (menit)</label>
                                <input type="number" value={durasi} onChange={(e) => setDurasi(Number(e.target.value))} min={1}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Jadwal Mulai</label>
                                <input type="datetime-local" value={jadwalMulai} onChange={(e) => setJadwalMulai(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Jadwal Selesai</label>
                                <input type="datetime-local" value={jadwalSelesai} onChange={(e) => setJadwalSelesai(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    const now = new Date();
                                    const end = new Date(now.getTime() + durasi * 60 * 1000);
                                    setJadwalMulai(now.toISOString().slice(0, 16));
                                    setJadwalSelesai(end.toISOString().slice(0, 16));
                                    toast("Jadwal diisi otomatis. Klik Simpan untuk mengaktifkan.", "info");
                                }} disabled={saving}
                                    className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50 whitespace-nowrap"
                                    title="Isi jadwal mulai = sekarang, selesai = sekarang + durasi">
                                    ⚡ Mode Test
                                </button>
                                <button onClick={handleSaveJadwal} disabled={saving}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                    {saving ? "Menyimpan..." : "Simpan Jadwal"}
                                </button>
                                {jadwalMulai || jadwalSelesai ? (
                                    <button onClick={handleResetJadwal} disabled={saving}
                                        className="bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-bold transition-all">
                                        Reset
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        {jadwalMulai && jadwalSelesai && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                                Ujian aktif dari <span className="font-semibold">{new Date(jadwalMulai).toLocaleString('id-ID')}</span> sampai <span className="font-semibold">{new Date(jadwalSelesai).toLocaleString('id-ID')}</span>.
                            </p>
                        )}
                    </div>

                    {/* Quick Stats */}
                    <div id="stats-dashboard" className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 border-b-4 border-b-blue-500 hover:-translate-y-1 transition-transform">
                            <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Peserta</div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">{stats?.totalPeserta ?? '-'}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-2">Terdaftar di sistem</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 border-b-4 border-b-indigo-500 hover:-translate-y-1 transition-transform">
                            <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Soal Aktif</div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">{stats?.totalSoal ?? '-'}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-2">Bank Soal</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 border-b-4 border-b-amber-500 hover:-translate-y-1 transition-transform">
                            <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Sudah Ujian</div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">{stats?.sudahUjian ?? '-'}</div>
                            <div className="text-xs text-amber-500 font-semibold mt-2">{stats?.belumUjian ?? '-'} belum ujian</div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 border-b-4 border-b-emerald-500 hover:-translate-y-1 transition-transform">
                            <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Rata-rata Nilai</div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">{stats?.rataNilai ?? '-'}</div>
                            <div className="text-xs text-emerald-500 font-semibold mt-2">Dari {stats?.sudahUjian ?? 0} peserta</div>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                const { exportStatsToPDF } = await import("@/lib/pdf-export");
                                await exportStatsToPDF();
                                toast("Dashboard berhasil di-export ke PDF", "success");
                            } catch {
                                toast("Gagal export PDF", "error");
                            }
                        }}
                        className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    >
                        Export Stats ke PDF
                    </button>

                    {/* Menu Cards */}
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mt-4 mb-4">Menu Konfigurasi</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                        <Link href="/admin/monitoring" className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-cyan-300 dark:hover:border-cyan-600 transition-all">
                            <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 rounded-xl flex items-center justify-center mb-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-cyan-600 transition-colors">Monitoring Real-Time</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Pantau peserta secara langsung</p>
                        </Link>

                        <Link href="/admin/peserta" className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors">Manajemen Peserta</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Kelola data & kartu peserta</p>
                        </Link>

                        <Link href="/admin/soal" className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 transition-all">
                            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 transition-colors">Bank Soal</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Input & kelola soal ujian</p>
                        </Link>

                        <Link href="/admin/nilai" className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 transition-all">
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-emerald-600 transition-colors">Rekap & Live Score</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Pantau skor peserta langsung</p>
                        </Link>

                        <Link href="/admin/statistik" className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-rose-300 dark:hover:border-rose-600 transition-all">
                            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center mb-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-rose-600 transition-colors">Statistik Mapel</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Analisis per mata pelajaran</p>
                        </Link>

                        <Link href="/admin/backup" className="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-600 transition-all">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white group-hover:text-purple-600 transition-colors">Backup & Restore</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Export/import database</p>
                        </Link>
                    </div>
                </main>
            </div>
        </div>
    );
}
