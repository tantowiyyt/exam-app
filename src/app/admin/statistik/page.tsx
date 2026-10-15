"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";

interface MapelStat {
    nama: string;
    rataRata: number;
    totalUjian: number;
}

const mapelColors: Record<string, string> = {
    "TIK": "bg-blue-500",
    "Matematika": "bg-purple-500",
    "Bahasa Indonesia": "bg-amber-500",
    "Pengetahuan Umum": "bg-emerald-500",
};

const mapelTextColors: Record<string, string> = {
    "TIK": "text-blue-600",
    "Matematika": "text-purple-600",
    "Bahasa Indonesia": "text-amber-600",
    "Pengetahuan Umum": "text-emerald-600",
};

export default function StatistikMapel() {
    const [statistik, setStatistik] = useState<MapelStat[]>([]);
    const [totalHistori, setTotalHistori] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatistik = async () => {
            try {
                const res = await fetch("/api/admin/statistik-mapel");
                if (res.ok) {
                    const data = await res.json();
                    setStatistik(data.statistik);
                    setTotalHistori(data.totalHistori);
                }
            } catch {}
            setLoading(false);
        };
        fetchStatistik();
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Memuat statistik...</div>;

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Modul Ujian CAT" judul="Statistik per Mapel" />

            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800 mb-2">Rata-rata Nilai per Mata Pelajaran</h2>
                    <p className="text-xs text-slate-400 mb-6">Berdasarkan {totalHistori} sesi ujian yang telah selesai</p>

                    {statistik.length === 0 ? (
                        <p className="text-center text-slate-400 py-10">Belum ada data statistik. Ujian harus dikerjakan terlebih dahulu.</p>
                    ) : (
                        <div className="space-y-6">
                            {/* Bar Chart */}
                            <div className="flex items-end gap-6 h-64 border-b-2 border-l-2 border-slate-200 pl-4 pb-2">
                                {statistik.map((s) => {
                                    const barHeight = s.rataRata > 0 ? Math.max(8, (s.rataRata / 100) * 100) : 0;
                                    const color = mapelColors[s.nama] || 'bg-slate-400';
                                    return (
                                        <div key={s.nama} className="flex-1 flex flex-col items-center gap-1">
                                            <span className="text-xs font-bold text-slate-600">{s.rataRata}</span>
                                            <div className={`w-full max-w-16 ${color} rounded-t-lg transition-all duration-700 ease-out`}
                                                style={{ height: `${barHeight}%`, minHeight: s.rataRata > 0 ? '8px' : '0' }}></div>
                                            <span className="text-[10px] font-bold text-slate-500 text-center leading-tight mt-1">{s.nama}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Detail Cards */}
                            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                                {statistik.map((s) => (
                                    <div key={s.nama} className={`bg-white p-4 rounded-xl border-2 border-slate-100 hover:border-slate-200 transition-all`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className={`w-3 h-3 rounded-full ${mapelColors[s.nama] || 'bg-slate-400'}`}></span>
                                            <h3 className={`text-sm font-bold ${mapelTextColors[s.nama] || 'text-slate-700'}`}>{s.nama}</h3>
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-3xl font-black text-slate-800">{s.rataRata}</span>
                                            <span className="text-xs text-slate-400 font-bold">/ 100</span>
                                        </div>
                                        <div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full ${mapelColors[s.nama] || 'bg-slate-400'} rounded-full`}
                                                style={{ width: `${s.rataRata}%` }}></div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-2">{s.totalUjian} peserta sudah mengerjakan</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
