"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { kirim } from "./ui";

// Monitoring ujian CAT per mapel (guru): status siswa diperbarui tiap 5 detik,
// aksi tambah waktu / kumpulkan / reset, dan token ujian.

interface Baris {
    siswa: { id: number; nomorPeserta: string; nama: string };
    status: "belum" | "mengerjakan" | "selesai";
    terjawab?: number; sisaMs?: number | null; pelanggaran?: number; tambahanMenit?: number; nilai?: number | null; perluDinilai?: boolean;
}
interface Data {
    kuis: { id: number; judul: string; status: string; token: string; maksPelanggaran: number };
    jumlahSoal: number;
    ringkasan: { siswa: number; mengerjakan: number; selesai: number; belum: number };
    siswa: Baris[];
    /** waktu perangkat saat data diterima (untuk hitung mundur sisa waktu) */
    diterima: number;
}

const fmtSisa = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const j = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${j ? `${j}:` : ""}${String(m).padStart(j ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const STATUS = {
    belum: { label: "Belum mulai", cls: "bg-slate-100 text-slate-500" },
    mengerjakan: { label: "Mengerjakan", cls: "bg-amber-100 text-amber-700" },
    selesai: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
} as const;

export function TokenUjian({ kuisId, token, onChange }: { kuisId: number; token: string; onChange: () => void }) {
    const { toast } = useToast();
    const aksi = async (a: "gantiToken" | "hapusToken") => {
        if (a === "hapusToken" && !confirm("Hapus token? Siswa bisa memulai ujian tanpa token.")) return;
        const { ok, data } = await kirim(`/api/lms/kuis/${kuisId}/monitor`, "POST", { aksi: a });
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) onChange();
    };
    return (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">Token ujian</p>
                {token
                    ? <p className="text-3xl font-black font-mono tracking-[0.3em] text-indigo-800">{token}</p>
                    : <p className="text-sm font-bold text-slate-500">Tanpa token — siswa bisa langsung mulai</p>}
                <p className="text-[11px] text-indigo-500 mt-1">Bacakan/tulis token di ruang ujian saat ujian dimulai. Ganti token bila sudah tersebar.</p>
            </div>
            <div className="flex gap-2">
                <button onClick={() => aksi("gantiToken")} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">{token ? "Ganti Token" : "Buat Token"}</button>
                {token && <button onClick={() => aksi("hapusToken")} className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold">Hapus</button>}
            </div>
        </div>
    );
}

export function MonitorUjian({ kuisId, onChange }: { kuisId: number; onChange?: () => void }) {
    const { toast } = useToast();
    const [d, setD] = useState<Data | null>(null);
    const [gagal, setGagal] = useState("");
    const [filter, setFilter] = useState<"semua" | Baris["status"]>("semua");

    const muat = useCallback(async () => {
        const res = await fetch(`/api/lms/kuis/${kuisId}/monitor`);
        const data = await res.json().catch(() => ({}));
        return res.ok ? { data: { ...data, diterima: Date.now() } as Data } : { error: data.message || "Gagal memuat monitoring" };
    }, [kuisId]);

    useEffect(() => {
        let ignore = false;
        const tarik = () => muat().then((r) => { if (!ignore) { if (r.data) { setD(r.data); setGagal(""); } else setGagal(r.error!); } });
        tarik();
        const t = setInterval(tarik, 5000);
        return () => { ignore = true; clearInterval(t); };
    }, [muat]);

    // Sisa waktu berjalan mundur di antara pembaruan
    const [sekarang, setSekarang] = useState(0);
    useEffect(() => { const t = setInterval(() => setSekarang(Date.now()), 1000); return () => clearInterval(t); }, []);

    const aksi = async (body: Record<string, unknown>, sukses?: string) => {
        const { ok, data } = await kirim(`/api/lms/kuis/${kuisId}/monitor`, "POST", body);
        toast(data.message || (ok ? sukses : "Gagal"), ok ? "success" : "error");
        if (ok) { const r = await muat(); if (r.data) setD(r.data); onChange?.(); }
    };
    const tambahWaktu = (b: Baris) => {
        const v = prompt(`Tambah waktu untuk ${b.siswa.nama} (menit):`, "5");
        if (v === null) return;
        aksi({ aksi: "tambahWaktu", userId: b.siswa.id, menit: Number(v) });
    };

    if (gagal && !d) return <p className="text-red-600 font-semibold">{gagal}</p>;
    if (!d) return <p className="text-slate-500 text-sm">Memuat monitoring...</p>;
    const lewat = Math.max(0, sekarang - d.diterima);
    // Yang sedang mengerjakan di atas, lalu selesai, lalu belum mulai
    const urutan = { mengerjakan: 0, selesai: 1, belum: 2 };
    const tampil = d.siswa.filter((b) => filter === "semua" || b.status === filter).sort((a, b) => urutan[a.status] - urutan[b.status]);

    return (
        <section className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([["semua", "Siswa", d.ringkasan.siswa, "text-slate-800"], ["mengerjakan", "Mengerjakan", d.ringkasan.mengerjakan, "text-amber-600"], ["selesai", "Selesai", d.ringkasan.selesai, "text-emerald-600"], ["belum", "Belum mulai", d.ringkasan.belum, "text-slate-500"]] as const).map(([k, l, n, c]) => (
                    <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
                        className={`text-left bg-white rounded-xl border shadow-sm p-4 ${filter === k ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                        <p className={`text-2xl font-black mt-1 ${c}`}>{n}</p>
                    </button>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                    Diperbarui otomatis tiap 5 detik · batas pelanggaran {d.kuis.maksPelanggaran}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Siswa</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-center">Terjawab</th>
                                <th className="px-3 py-2 text-center">Sisa Waktu</th>
                                <th className="px-3 py-2 text-center">Pelanggaran</th>
                                <th className="px-3 py-2 text-center">Nilai</th>
                                <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tampil.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">Tidak ada siswa.</td></tr>}
                            {tampil.map((b) => {
                                const sisa = b.sisaMs == null ? null : Math.max(0, b.sisaMs - lewat);
                                return (
                                    <tr key={b.siswa.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2">
                                            <p className="font-semibold text-slate-700">{b.siswa.nama}</p>
                                            <p className="font-mono text-[10px] text-slate-400">{b.siswa.nomorPeserta}</p>
                                        </td>
                                        <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span></td>
                                        <td className="px-3 py-2 text-center text-slate-600">{b.status === "belum" ? "–" : `${b.terjawab}/${d.jumlahSoal}`}</td>
                                        <td className={`px-3 py-2 text-center font-mono ${sisa !== null && sisa < 300000 ? "text-red-600 font-bold" : "text-slate-600"}`}>
                                            {sisa === null ? "–" : fmtSisa(sisa)}{b.tambahanMenit ? <span className="block text-[10px] text-indigo-500 font-sans">+{b.tambahanMenit} mnt</span> : null}
                                        </td>
                                        <td className={`px-3 py-2 text-center font-bold ${b.pelanggaran ? "text-red-600" : "text-slate-300"}`}>{b.status === "belum" ? "–" : b.pelanggaran}</td>
                                        <td className="px-3 py-2 text-center font-bold text-slate-700">{b.status !== "selesai" ? "–" : b.perluDinilai ? <span className="text-[10px] text-fuchsia-700">esai</span> : b.nilai}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1 whitespace-nowrap">
                                                {b.status === "mengerjakan" && <>
                                                    <button onClick={() => tambahWaktu(b)} className="text-[11px] font-bold px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700">+ Waktu</button>
                                                    <button onClick={() => confirm(`Kumpulkan jawaban ${b.siswa.nama} sekarang?`) && aksi({ aksi: "kumpulkan", userId: b.siswa.id })} className="text-[11px] font-bold px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700">Kumpulkan</button>
                                                </>}
                                                {b.status !== "belum" && (
                                                    <button onClick={() => confirm(`Reset ujian ${b.siswa.nama}? Jawabannya dihapus dan siswa bisa mengerjakan dari awal.`) && aksi({ aksi: "reset", userId: b.siswa.id })} className="text-[11px] font-bold px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-700">Reset</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
