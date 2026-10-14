"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";

interface SoalAnalisis {
    soalId: number;
    pertanyaan: string;
    mataPelajaran: string;
    totalDijawab: number;
    jumlahBenar: number;
    rasioBenar: number;
    tingkatKesulitan: string;
    warna: string;
}

interface Stats {
    totalSoal: number;
    totalPeserta: number;
    mudah: number;
    sedang: number;
    sulit: number;
    sangatSulit: number;
}

export default function AnalisisSoalPage() {
    const [analisis, setAnalisis] = useState<SoalAnalisis[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [filterMapel, setFilterMapel] = useState("");
    const [filterKesulitan, setFilterKesulitan] = useState("");

    useEffect(() => {
        const fetchAnalisis = async () => {
            const res = await fetch("/api/admin/analisis-soal");
            if (res.ok) {
                const data = await res.json();
                setAnalisis(data.analisis);
                setStats(data.stats);
            }
        };
        fetchAnalisis();
    }, []);

    const filteredAnalisis = analisis.filter((a) => {
        const matchMapel = !filterMapel || a.mataPelajaran === filterMapel;
        const matchKesulitan = !filterKesulitan || a.tingkatKesulitan === filterKesulitan;
        return matchMapel && matchKesulitan;
    });

    const getWarnaClass = (warna: string) => {
        const map: Record<string, string> = {
            emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
            amber: "bg-amber-100 text-amber-800 border-amber-200",
            orange: "bg-orange-100 text-orange-800 border-orange-200",
            red: "bg-red-100 text-red-800 border-red-200",
        };
        return map[warna] || "bg-slate-100 text-slate-800";
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12">
            <HeaderHalaman grup="Ujian CAT" judul="Analisis Butir Soal" />

            <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
                {/* Stats Summary */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 text-center">
                            <div className="text-3xl font-black text-slate-800">{stats.totalSoal}</div>
                            <div className="text-xs text-slate-500 font-bold mt-1">Total Soal</div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-200 text-center">
                            <div className="text-3xl font-black text-emerald-600">{stats.mudah}</div>
                            <div className="text-xs text-emerald-600 font-bold mt-1">Mudah (&ge;80%)</div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-200 text-center">
                            <div className="text-3xl font-black text-amber-600">{stats.sedang}</div>
                            <div className="text-xs text-amber-600 font-bold mt-1">Sedang (60-79%)</div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-200 text-center">
                            <div className="text-3xl font-black text-orange-600">{stats.sulit}</div>
                            <div className="text-xs text-orange-600 font-bold mt-1">Sulit (40-59%)</div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-200 text-center">
                            <div className="text-3xl font-black text-red-600">{stats.sangatSulit}</div>
                            <div className="text-xs text-red-600 font-bold mt-1">Sangat Sulit (&lt;40%)</div>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-3">
                    <select value={filterMapel} onChange={(e) => setFilterMapel(e.target.value)}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                        <option value="">Semua Mata Pelajaran</option>
                        <option value="TIK">TIK</option>
                        <option value="Matematika">Matematika</option>
                        <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                        <option value="Pengetahuan Umum">Pengetahuan Umum</option>
                    </select>
                    <select value={filterKesulitan} onChange={(e) => setFilterKesulitan(e.target.value)}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                        <option value="">Semua Tingkat</option>
                        <option value="Mudah">Mudah</option>
                        <option value="Sedang">Sedang</option>
                        <option value="Sulit">Sulit</option>
                        <option value="Sangat Sulit">Sangat Sulit</option>
                    </select>
                    <span className="text-sm text-slate-500 self-center">{filteredAnalisis.length} soal ditampilkan</span>
                </div>

                {/* Soal List */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Daftar Soal berdasarkan Tingkat Kesulitan</h2>
                    <div className="space-y-3">
                        {filteredAnalisis.length === 0 ? (
                            <p className="text-center py-8 text-slate-400 italic">Belum ada data analisis. Minimal 1 peserta harus sudah mengerjakan ujian.</p>
                        ) : (
                            filteredAnalisis.map((soal, index) => (
                                <div key={soal.soalId} className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-800">
                                                <span className="text-indigo-600 mr-1">{index + 1}.</span> {soal.pertanyaan}
                                            </p>
                                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                                <span>{soal.mataPelajaran}</span>
                                                <span>&bull;</span>
                                                <span>Dijawab: {soal.totalDijawab} peserta</span>
                                                <span>&bull;</span>
                                                <span>Benar: {soal.jumlahBenar}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {/* Progress bar */}
                                            <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${soal.rasioBenar}%` }}></div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 w-10 text-right">{soal.rasioBenar}%</span>
                                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${getWarnaClass(soal.warna)}`}>
                                                {soal.tingkatKesulitan}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
