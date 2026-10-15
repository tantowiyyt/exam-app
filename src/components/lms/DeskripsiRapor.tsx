"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { kirim } from "./ui";

// Deskripsi capaian rapor per siswa untuk mapel ini (tab Nilai, guru pengampu).
// Saran otomatis disusun dari nilai tertinggi & terendah; guru menyunting lalu menyimpan.

interface Baris { siswa: { id: number; nomorPeserta: string; nama: string }; nilaiAkhir: number | null; predikat: string | null; deskripsi: string; saran: string }
interface Data { semester: { id: number; label: string }; batas: { A: number; B: number; C: number }; siswa: Baris[] }

const WARNA: Record<string, string> = { A: "bg-emerald-100 text-emerald-700", B: "bg-sky-100 text-sky-700", C: "bg-amber-100 text-amber-700", D: "bg-red-100 text-red-700" };

export function DeskripsiRapor({ mapelId, semesterId }: { mapelId: number; semesterId?: number }) {
    const { toast } = useToast();
    const [buka, setBuka] = useState(false);
    const [d, setD] = useState<Data | null>(null);
    const [draf, setDraf] = useState<Record<number, string>>({});
    const [simpan, setSimpan] = useState(false);
    const [versi, setVersi] = useState(0);

    useEffect(() => {
        if (!buka) return;
        let ignore = false;
        fetch(`/api/lms/mapel/${mapelId}/deskripsi${semesterId ? `?semester=${semesterId}` : ""}`)
            .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
            .then(({ ok, d }) => {
                if (ignore) return;
                if (!ok) { toast(d.message || "Gagal memuat deskripsi", "error"); return; }
                setD(d);
                setDraf(Object.fromEntries((d as Data).siswa.map((b) => [b.siswa.id, b.deskripsi])));
            });
        return () => { ignore = true; };
    }, [buka, mapelId, semesterId, versi, toast]);

    const berubah = d ? d.siswa.filter((b) => (draf[b.siswa.id] ?? "") !== b.deskripsi) : [];
    const isiSaran = () => {
        if (!d) return;
        let n = 0;
        const baru = { ...draf };
        for (const b of d.siswa) if (!(baru[b.siswa.id] ?? "").trim() && b.saran) { baru[b.siswa.id] = b.saran; n++; }
        setDraf(baru);
        toast(n ? `${n} deskripsi diisi dari saran — periksa lalu Simpan` : "Tidak ada deskripsi kosong yang punya saran", n ? "success" : "error");
    };
    const kirimSemua = async () => {
        if (!d || !berubah.length) return;
        setSimpan(true);
        const { ok, data } = await kirim(`/api/lms/mapel/${mapelId}/deskripsi`, "PUT", { semester: d.semester.id, data: berubah.map((b) => ({ userId: b.siswa.id, deskripsi: draf[b.siswa.id] ?? "" })) });
        setSimpan(false);
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) setVersi((v) => v + 1);
    };

    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-6">
            <button onClick={() => setBuka(!buka)} aria-expanded={buka} className="w-full flex items-center gap-3 px-5 py-4 text-left">
                <span aria-hidden className={`text-slate-400 text-xs transition-transform ${buka ? "rotate-90" : ""}`}>&#9654;</span>
                <span className="flex-1">
                    <span className="block font-bold text-slate-800">Deskripsi Capaian Rapor</span>
                    <span className="block text-xs text-slate-500">Predikat & deskripsi per siswa yang tampil di rapor (format Kurikulum Merdeka).</span>
                </span>
            </button>
            {buka && !d && <p className="px-5 pb-5 text-sm text-slate-500">Memuat...</p>}
            {buka && d && (
                <div className="border-t border-slate-100">
                    <div className="px-5 py-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-500 flex-1">Predikat: A ≥ {d.batas.A} · B ≥ {d.batas.B} · C ≥ {d.batas.C} · D di bawahnya (diatur admin di Pengaturan).</span>
                        <button onClick={isiSaran} className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold">Isi saran untuk yang kosong</button>
                        <button onClick={kirimSemua} disabled={!berubah.length || simpan} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : `Simpan${berubah.length ? ` (${berubah.length})` : ""}`}</button>
                    </div>
                    {d.siswa.length === 0 && <p className="px-5 pb-5 text-sm text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
                    <ul className="divide-y divide-slate-100">
                        {d.siswa.map((b, i) => {
                            const v = draf[b.siswa.id] ?? "";
                            return (
                                <li key={b.siswa.id} className={`px-5 py-3 grid md:grid-cols-[220px_1fr] gap-3 ${v !== b.deskripsi ? "bg-amber-50/50" : ""}`}>
                                    <div className="flex items-start gap-3">
                                        <span className="text-xs text-slate-400 w-5 text-right pt-0.5">{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 truncate">{b.siswa.nama}</p>
                                            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                                Nilai {b.nilaiAkhir ?? "–"}
                                                {b.predikat && <span className={`font-black px-1.5 rounded ${WARNA[b.predikat]}`}>{b.predikat}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <textarea value={v} onChange={(e) => setDraf({ ...draf, [b.siswa.id]: e.target.value })} rows={2} maxLength={1000}
                                            aria-label={`Deskripsi ${b.siswa.nama}`} placeholder={b.saran || "Belum ada nilai untuk disusun saran"}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y" />
                                        {b.saran && v !== b.saran && <button onClick={() => setDraf({ ...draf, [b.siswa.id]: b.saran })} className="text-[11px] font-bold text-indigo-600 hover:underline">Pakai saran</button>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </section>
    );
}
