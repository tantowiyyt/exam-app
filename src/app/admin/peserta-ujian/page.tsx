"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

// Peserta ujian CAT sekolah per ujian: ruang & sesi (per kelas sekaligus atau per siswa), status, nilai, reset.

interface Siswa { id: number; nomorPeserta: string; nama: string; kelas: string; ruang: string; sesi: string; status: "belum" | "mengerjakan" | "selesai"; nilai: number | null }
interface Data {
    daftarUjian: { id: number; nama: string; aktif: boolean; peserta: string }[];
    ujian: { id: number; nama: string; aktif: boolean; peserta: string } | null;
    kelasList: string[];
    siswa: Siswa[];
}

const STATUS = {
    belum: { label: "Belum", cls: "bg-slate-100 text-slate-600" },
    mengerjakan: { label: "Mengerjakan", cls: "bg-amber-100 text-amber-700" },
    selesai: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
} as const;
const inputClass = "px-2 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

async function kirim(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/peserta-ujian", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export default function PesertaUjian() {
    const { toast } = useToast();
    const [ujianId, setUjianId] = useState(() => (typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("ujian")) || 0));
    const [d, setD] = useState<Data | null>(null);
    const [kelas, setKelas] = useState("");
    const [cari, setCari] = useState("");
    const [pilih, setPilih] = useState<Set<number>>(new Set());
    const [perKelas, setPerKelas] = useState<Record<string, { ruang: string; sesi: string }>>({});
    const [massal, setMassal] = useState({ ruang: "", sesi: "" });

    const muat = useCallback(async () => {
        const res = await fetch(`/api/admin/peserta-ujian${ujianId ? `?ujian=${ujianId}` : ""}`);
        if (res.ok) setD(await res.json());
    }, [ujianId]);
    useEffect(() => {
        let ignore = false;
        fetch(`/api/admin/peserta-ujian${ujianId ? `?ujian=${ujianId}` : ""}`).then((r) => (r.ok ? r.json() : null)).then((x) => { if (!ignore && x) setD(x); });
        const t = setInterval(() => { muat(); }, 10000);
        return () => { ignore = true; clearInterval(t); };
    }, [ujianId, muat]);

    if (!d) return <div className="min-h-screen bg-slate-100"><HeaderHalaman grup="Modul Ujian CAT" judul="Peserta & Ruang Ujian" /><p className="p-8 text-slate-500">Memuat...</p></div>;
    const u = d.ujian;
    const tampil = d.siswa.filter((s) => (!kelas || s.kelas === kelas) && (!cari || `${s.nama} ${s.nomorPeserta}`.toLowerCase().includes(cari.toLowerCase())));
    const dipilih = tampil.filter((s) => pilih.has(s.id));
    const semua = tampil.length > 0 && tampil.every((s) => pilih.has(s.id));
    const hitung = (st: Siswa["status"]) => d.siswa.filter((s) => s.status === st).length;
    // Ruang/sesi yang sedang dipakai mayoritas tiap kelas (bawaan isian per kelas)
    const umum = (k: string, f: "ruang" | "sesi") => {
        const n = new Map<string, number>();
        for (const s of d.siswa.filter((x) => x.kelas === k)) n.set(s[f], (n.get(s[f]) ?? 0) + 1);
        return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    };

    const hasil = async (body: Record<string, unknown>, pesan?: string) => {
        if (pesan && !confirm(pesan)) return;
        const { ok, data } = await kirim({ ujian: u?.id, ...body });
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) { setPilih(new Set()); muat(); }
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Modul Ujian CAT" judul="Peserta & Ruang Ujian">
                {d.daftarUjian.length > 0 && (
                    <select value={u?.id ?? ""} onChange={(e) => { setUjianId(Number(e.target.value)); setKelas(""); setPilih(new Set()); setPerKelas({}); }} aria-label="Ujian"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold max-w-80">
                        {d.daftarUjian.map((x) => <option key={x.id} value={x.id}>{x.nama}{x.aktif ? " (aktif)" : ""} — {x.peserta}</option>)}
                    </select>
                )}
            </HeaderHalaman>
            <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-5">
                {!u && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">Belum ada ujian. Buat di <Link href="/admin/ujian" className="font-bold text-indigo-600">Kelola Ujian</Link>.</p>}
                {u && <>
                    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {([["Peserta", d.siswa.length], ["Belum mulai", hitung("belum")], ["Mengerjakan", hitung("mengerjakan")], ["Selesai", hitung("selesai")]] as [string, number][]).map(([l, v]) => (
                            <div key={l} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                                <p className="text-2xl font-black text-slate-800 mt-1">{v}</p>
                            </div>
                        ))}
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Ruang & Sesi per Kelas <span className="font-normal text-slate-400">— peserta: {u.peserta}</span></h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2 text-left">Kelas</th><th className="px-4 py-2 text-left">Siswa</th><th className="px-4 py-2 text-left">Ruang</th><th className="px-4 py-2 text-left">Sesi</th><th /></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {d.kelasList.map((k) => {
                                        const v = perKelas[k] ?? { ruang: umum(k, "ruang"), sesi: umum(k, "sesi") };
                                        return (
                                            <tr key={k}>
                                                <td className="px-4 py-2 font-semibold text-slate-700">{k}</td>
                                                <td className="px-4 py-2 text-slate-500">{d.siswa.filter((s) => s.kelas === k).length}</td>
                                                <td className="px-4 py-2"><input value={v.ruang} onChange={(e) => setPerKelas({ ...perKelas, [k]: { ...v, ruang: e.target.value } })} placeholder="mis. LAB 1" aria-label={`Ruang ${k}`} className={`${inputClass} w-32`} /></td>
                                                <td className="px-4 py-2"><input value={v.sesi} onChange={(e) => setPerKelas({ ...perKelas, [k]: { ...v, sesi: e.target.value } })} placeholder="1" aria-label={`Sesi ${k}`} className={`${inputClass} w-20`} /></td>
                                                <td className="px-4 py-2 text-right"><button onClick={() => hasil({ aksi: "aturRuang", kelas: k, ruang: v.ruang, sesi: v.sesi })} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">Terapkan</button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                            <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / NIS..." aria-label="Cari siswa" className={`${inputClass} flex-1 min-w-40`} />
                            {d.kelasList.length > 1 && (
                                <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas" className={inputClass}>
                                    <option value="">Semua kelas</option>
                                    {d.kelasList.map((k) => <option key={k}>{k}</option>)}
                                </select>
                            )}
                            <button onClick={() => hasil({ aksi: "resetSemua" }, `Reset ujian "${u.nama}" untuk SEMUA ${d.siswa.length} peserta? Mereka bisa mengerjakan dari awal (riwayat nilai tetap tersimpan).`)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800">Reset semua peserta</button>
                        </div>
                        {dipilih.length > 0 && (
                            <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-bold text-indigo-800">{dipilih.length} dipilih:</span>
                                <input value={massal.ruang} onChange={(e) => setMassal({ ...massal, ruang: e.target.value })} placeholder="Ruang" aria-label="Ruang terpilih" className={`${inputClass} w-28`} />
                                <input value={massal.sesi} onChange={(e) => setMassal({ ...massal, sesi: e.target.value })} placeholder="Sesi" aria-label="Sesi terpilih" className={`${inputClass} w-16`} />
                                <button onClick={() => hasil({ aksi: "aturRuang", ids: dipilih.map((s) => s.id), ...(massal.ruang ? { ruang: massal.ruang } : {}), ...(massal.sesi ? { sesi: massal.sesi } : {}) })} disabled={!massal.ruang && !massal.sesi}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50">Atur ruang/sesi</button>
                                <button onClick={() => hasil({ aksi: "reset", ids: dipilih.map((s) => s.id) }, `Reset ujian untuk ${dipilih.length} siswa terpilih?`)} className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 font-bold">Reset ujian</button>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="Pilih semua" checked={semua} onChange={() => setPilih(semua ? new Set() : new Set(tampil.map((s) => s.id)))} /></th>
                                        <th className="px-3 py-2 text-left">Siswa</th>
                                        <th className="px-3 py-2 text-left">Kelas</th>
                                        <th className="px-3 py-2 text-left">Ruang / Sesi</th>
                                        <th className="px-3 py-2 text-center">Status</th>
                                        <th className="px-3 py-2 text-center">Nilai</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {tampil.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">Tidak ada siswa.</td></tr>}
                                    {tampil.map((s) => (
                                        <tr key={s.id} className={pilih.has(s.id) ? "bg-indigo-50/50" : "hover:bg-slate-50"}>
                                            <td className="px-3 py-2"><input type="checkbox" aria-label={`Pilih ${s.nama}`} checked={pilih.has(s.id)} onChange={() => setPilih((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} /></td>
                                            <td className="px-3 py-2"><p className="font-semibold text-slate-700">{s.nama}</p><p className="font-mono text-[10px] text-slate-400">{s.nomorPeserta}</p></td>
                                            <td className="px-3 py-2 text-slate-600">{s.kelas || "–"}</td>
                                            <td className="px-3 py-2 text-slate-600">{s.ruang || <span className="text-amber-600 text-xs">belum diatur</span>}{s.sesi ? ` · Sesi ${s.sesi}` : ""}</td>
                                            <td className="px-3 py-2 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span></td>
                                            <td className="px-3 py-2 text-center font-bold text-indigo-700">{s.nilai ?? "–"}</td>
                                            <td className="px-3 py-2 text-right">{s.status !== "belum" && <button onClick={() => hasil({ aksi: "reset", ids: [s.id] }, `Reset ujian ${s.nama}? Ia bisa mengerjakan dari awal.`)} className="text-[11px] font-bold text-red-600 hover:underline">Reset</button>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>}
            </main>
        </div>
    );
}
