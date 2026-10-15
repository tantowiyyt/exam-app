"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";

// Hasil ujian CAT sekolah per ujian (pilih ujian & kelas), diperbarui tiap 5 detik.

interface Peserta {
    id: number;
    nomorPeserta: string;
    nama: string;
    kelas: string;
    ruang: string;
    sesi: string;
    sudahUjian: boolean;
    nilai: number | null;
    ujianId: number;
}
interface UjianRingkas { id: number; nama: string; isActive: boolean; labelPeserta: string }

export default function HasilUjian() {
    const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
    const [daftarUjian, setDaftarUjian] = useState<UjianRingkas[]>([]);
    const [ujianId, setUjianId] = useState(() => (typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("ujian")) || 0));
    const [kelas, setKelas] = useState("");

    useEffect(() => {
        let ignore = false;
        fetch("/api/admin/ujian").then((r) => (r.ok ? r.json() : [])).then((d) => { if (!ignore) setDaftarUjian(d); });
        return () => { ignore = true; };
    }, []);
    useEffect(() => {
        let ignore = false;
        const fetchNilai = async () => {
            const res = await fetch(`/api/admin/nilai${ujianId ? `?ujian=${ujianId}` : ""}`);
            const data = await res.json();
            if (res.ok && !ignore) setPesertaList(data);
        };
        fetchNilai();
        const interval = setInterval(fetchNilai, 5000);
        return () => { ignore = true; clearInterval(interval); };
    }, [ujianId]);

    const kelasList = [...new Set(pesertaList.map((p) => p.kelas).filter(Boolean))].sort();
    const tampil = pesertaList.filter((p) => !kelas || p.kelas === kelas);
    const aktifId = ujianId || pesertaList[0]?.ujianId || 0;
    const namaUjian = daftarUjian.find((u) => u.id === aktifId)?.nama ?? "ujian";

    const handleExportCSV = () => {
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const header = "No,NIS,Nama,Kelas,Ruang,Sesi,Status,Nilai\n";
        const rows = tampil.map((p, i) => [i + 1, esc(p.nomorPeserta), esc(p.nama), esc(p.kelas), esc(p.ruang), esc(p.sesi), p.sudahUjian ? "Selesai" : "Belum Ujian", p.nilai ?? "-"].join(",")).join("\n");
        const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `hasil-${namaUjian}${kelas ? `-${kelas}` : ""}.csv`.replace(/[^\w.-]+/g, "_");
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Ujian CAT" judul="Hasil Ujian">
                {daftarUjian.length > 0 && (
                    <select value={aktifId} onChange={(e) => { setUjianId(Number(e.target.value)); setKelas(""); }} aria-label="Ujian" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold max-w-72">
                        {daftarUjian.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.isActive ? " (aktif)" : ""} — {u.labelPeserta}</option>)}
                    </select>
                )}
                {kelasList.length > 1 && (
                    <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        <option value="">Semua kelas</option>
                        {kelasList.map((k) => <option key={k}>{k}</option>)}
                    </select>
                )}
                <button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Export CSV</button>
            </HeaderHalaman>

            <main className="max-w-6xl mx-auto p-4 md:p-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-800">Peringkat Hasil Ujian</h2>
                        <span className="text-sm text-slate-500">{tampil.filter((p) => p.sudahUjian).length} selesai dari {tampil.length} peserta</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold uppercase">
                                    <th className="p-3 text-center">No</th>
                                    <th className="p-3">NIS</th>
                                    <th className="p-3">Nama Lengkap</th>
                                    <th className="p-3">Kelas</th>
                                    <th className="p-3">Ruang / Sesi</th>
                                    <th className="p-3 text-center">Status</th>
                                    <th className="p-3 text-center">Nilai Akhir</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-slate-100">
                                {tampil.length === 0 ? (
                                    <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">Belum ada peserta untuk ujian ini.</td></tr>
                                ) : tampil.map((p, index) => (
                                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-3 text-center font-bold text-slate-400">{index + 1}</td>
                                        <td className="p-3 font-mono font-bold text-slate-700">{p.nomorPeserta}</td>
                                        <td className="p-3 font-semibold text-slate-800">{p.nama}</td>
                                        <td className="p-3 text-slate-600">{p.kelas || "-"}</td>
                                        <td className="p-3 text-slate-500 text-xs">{p.ruang || "-"} / {p.sesi ? `Sesi ${p.sesi}` : "-"}</td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.sudahUjian ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{p.sudahUjian ? "Selesai" : "Belum Ujian"}</span>
                                        </td>
                                        <td className="p-3 text-center text-lg font-black text-indigo-600">{p.nilai ?? "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
