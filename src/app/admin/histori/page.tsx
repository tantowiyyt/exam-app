"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";

interface HistoriItem {
    id: number;
    user: { id: number; nomorPeserta: string; nama: string; ruang: string; sesi: string };
    waktuMulai: string;
    waktuSelesai: string;
    totalSoal: number;
    jumlahBenar: number;
    jumlahSalah: number;
    nilaiAkhir: number;
    skorPerMapel: string | null;
}

export default function HistoriUjian() {
    const [historiList, setHistoriList] = useState<HistoriItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchHistori = async () => {
            try {
                const res = await fetch("/api/admin/histori");
                if (res.ok) setHistoriList(await res.json());
            } catch {}
            setLoading(false);
        };
        fetchHistori();
    }, []);

    const filteredHistori = historiList.filter((h) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return h.user.nama.toLowerCase().includes(q) || h.user.nomorPeserta.toLowerCase().includes(q);
    });

    const formatDurasi = (mulai: string, selesai: string) => {
        const ms = new Date(selesai).getTime() - new Date(mulai).getTime();
        const menit = Math.floor(ms / 60000);
        const detik = Math.floor((ms % 60000) / 1000);
        return `${menit}m ${detik}s`;
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Memuat histori...</div>;

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Modul Ujian CAT" judul="Histori Ujian" />

            <main className="max-w-6xl mx-auto p-4 md:p-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                        <h2 className="text-lg font-bold text-slate-800">Riwayat Ujian ({filteredHistori.length})</h2>
                        <input type="text" placeholder="Cari nama/nomor..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 w-48" />
                    </div>

                    {filteredHistori.length === 0 ? (
                        <p className="text-center text-slate-400 py-10">Belum ada riwayat ujian.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3">No</th>
                                        <th className="px-4 py-3">Peserta</th>
                                        <th className="px-4 py-3">Ruang/Sesi</th>
                                        <th className="px-4 py-3">Waktu Mulai</th>
                                        <th className="px-4 py-3">Durasi</th>
                                        <th className="px-4 py-3">Benar/Salah</th>
                                        <th className="px-4 py-3">Nilai</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredHistori.map((h, idx) => {
                                        return (
                                            <tr key={h.id} className="hover:bg-slate-50 transition-all">
                                                <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <span className="font-bold text-slate-700">{h.user.nama}</span>
                                                    <span className="block text-xs text-slate-400">{h.user.nomorPeserta}</span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-600">{h.user.ruang} / S{h.user.sesi}</td>
                                                <td className="px-4 py-3 text-xs text-slate-600">
                                                    {new Date(h.waktuMulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    <br />
                                                    {new Date(h.waktuMulai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-600">{formatDurasi(h.waktuMulai, h.waktuSelesai)}</td>
                                                <td className="px-4 py-3">
                                                    <span className="text-emerald-600 font-bold">{h.jumlahBenar}</span>
                                                    <span className="text-slate-400"> / </span>
                                                    <span className="text-red-500 font-bold">{h.jumlahSalah}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`font-black text-lg ${h.nilaiAkhir >= 70 ? 'text-emerald-600' : h.nilaiAkhir >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {h.nilaiAkhir}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
