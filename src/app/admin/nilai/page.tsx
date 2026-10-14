"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";

interface Peserta {
    id: number;
    nomorPeserta: string;
    nama: string;
    ruang: string;
    sesi: string;
    sudahUjian: boolean;
    nilai: number | null;
}

export default function RekapNilai() {
    const [pesertaList, setPesertaList] = useState<Peserta[]>([]);

    useEffect(() => {
        const fetchNilai = async () => {
            const res = await fetch("/api/admin/nilai");
            const data = await res.json();
            if (res.ok) setPesertaList(data);
        };
        fetchNilai();
        const interval = setInterval(fetchNilai, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleExportCSV = () => {
        const header = "No,Nomor Peserta,Nama,Ruang,Sesi,Status,Nilai\n";
        const rows = pesertaList.map((p, index) =>
            `${index + 1},"${p.nomorPeserta}","${p.nama}","${p.ruang}","${p.sesi}",${p.sudahUjian ? 'Selesai' : 'Belum Ujian'},${p.nilai ?? '-'}`
        ).join("\n");

        const csv = header + rows;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `rekap-nilai-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Ujian CAT" judul="Hasil Ujian">
                <button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export CSV
                    </button>
            </HeaderHalaman>

            <main className="max-w-6xl mx-auto p-4 md:p-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-800">Papan Peringkat Hasil Ujian</h2>
                        <span className="text-sm text-slate-500">{pesertaList.length} peserta terdaftar</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold uppercase">
                                    <th className="p-3 text-center">No</th>
                                    <th className="p-3">No. Peserta</th>
                                    <th className="p-3">Nama Lengkap</th>
                                    <th className="p-3">Ruang / Sesi</th>
                                    <th className="p-3 text-center">Status</th>
                                    <th className="p-3 text-center">Nilai Akhir</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-slate-100">
                                {pesertaList.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">Belum ada data peserta.</td>
                                    </tr>
                                ) : (
                                    pesertaList.map((p, index) => (
                                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-3 text-center font-bold text-slate-400">{index + 1}</td>
                                            <td className="p-3 font-mono font-bold text-slate-700">{p.nomorPeserta}</td>
                                            <td className="p-3 font-semibold text-slate-800">{p.nama}</td>
                                            <td className="p-3 text-slate-500 text-xs">{p.ruang} / Sesi {p.sesi}</td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.sudahUjian ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                                    {p.sudahUjian ? "Selesai" : "Belum Ujian"}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center text-lg font-black text-indigo-600">{p.nilai ?? "-"}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
