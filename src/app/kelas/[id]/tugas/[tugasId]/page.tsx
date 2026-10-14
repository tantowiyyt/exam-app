"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
    LmsNav, Diskusi, FormTugas, IsiTeks, Lampiran, UploadLampiran, kirim, fmtWaktu, statusTugas, inputClass, type TugasData,
} from "@/components/lms/ui";

interface Pengumpulan {
    id: number;
    jawaban: string;
    lampiran: string;
    namaLampiran: string;
    dikumpulkanAt: string;
    nilai: number | null;
    catatanGuru: string;
    dinilaiAt: string | null;
}

interface DataTugas {
    peran: "kelola" | "siswa";
    mapel: { id: number; nama: string; kelas: string };
    tugas: TugasData & { id: number; createdAt: string; tenggat: string | null };
    pengumpulan?: Pengumpulan | null;
    daftar?: { siswa: { id: number; nomorPeserta: string; nama: string }; pengumpulan: Pengumpulan | null }[];
}

async function muat(id: string) {
    const res = await fetch(`/api/lms/tugas/${id}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data: data as DataTugas } : { error: (data.message as string) || "Gagal memuat" };
}

export default function HalamanTugas() {
    const { id, tugasId } = useParams<{ id: string; tugasId: string }>();
    const [d, setD] = useState<DataTugas | null>(null);
    const [error, setError] = useState("");
    const [edit, setEdit] = useState(false);

    const refresh = useCallback(async () => {
        const r = await muat(tugasId);
        if (r.data) setD(r.data); else setError(r.error);
    }, [tugasId]);

    useEffect(() => {
        let ignore = false;
        muat(tugasId).then((r) => { if (!ignore) { if (r.data) setD(r.data); else setError(r.error); } });
        return () => { ignore = true; };
    }, [tugasId]);

    const kembali = { href: `/kelas/${id}`, label: "Mapel" };
    if (error) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={kembali} /><p className="p-8 text-center text-red-600 font-semibold">{error}</p></div>);
    if (!d) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={kembali} /><p className="p-8 text-center text-slate-500">Memuat...</p></div>);

    const { tugas } = d;
    const kelola = d.peran === "kelola";

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <LmsNav judul={`${d.mapel.kelas} · ${d.mapel.nama}`} kembali={kembali} />
            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
                <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-4">
                    <header className="flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Tugas · {d.mapel.nama}</p>
                            <h1 className="text-2xl font-black text-slate-800 mt-1">{tugas.judul}</h1>
                            <div className="flex flex-wrap gap-2 mt-2 text-xs">
                                <span className={`px-2.5 py-1 rounded-full font-bold ${tugas.tenggat ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-600"}`}>
                                    {tugas.tenggat ? `Tenggat: ${fmtWaktu(tugas.tenggat)}` : "Tanpa tenggat"}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold">Nilai maks {tugas.nilaiMaks}</span>
                            </div>
                        </div>
                        {kelola && !tugas.terbit && <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-600">Draf — belum terlihat siswa</span>}
                        {kelola && <button onClick={() => setEdit(true)} className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold">Edit</button>}
                    </header>
                    <IsiTeks teks={tugas.deskripsi} className="text-[15px] text-slate-700" />
                    {tugas.lampiran && <Lampiran url={tugas.lampiran} nama={tugas.namaLampiran} />}
                </article>

                {kelola ? <Penilaian d={d} onChange={refresh} /> : <Pengumpulan d={d} onChange={refresh} />}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <Diskusi target={{ tugasId: tugas.id }} />
                </div>
            </main>

            {edit && <FormTugas mapelId={d.mapel.id} awal={tugas} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); refresh(); }} />}
        </div>
    );
}

/** Siswa: kumpulkan / perbarui jawaban, lihat nilai & catatan guru. */
function Pengumpulan({ d, onChange }: { d: DataTugas; onChange: () => void }) {
    const { toast } = useToast();
    const p = d.pengumpulan ?? null;
    const [jawaban, setJawaban] = useState(p?.jawaban ?? "");
    const [lampiran, setLampiran] = useState({ url: p?.lampiran ?? "", nama: p?.namaLampiran ?? "" });
    const [ubah, setUbah] = useState(!p);
    const [proses, setProses] = useState(false);
    const dinilai = p?.nilai !== null && p?.nilai !== undefined;
    const st = statusTugas(d.tugas.tenggat, p);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProses(true);
        const { ok, data } = await kirim("/api/lms/pengumpulan", "POST", {
            tugasId: d.tugas.id, jawaban, lampiran: lampiran.url, namaLampiran: lampiran.nama,
        });
        setProses(false);
        if (ok) { toast("Tugas dikumpulkan", "success"); setUbah(false); onChange(); } else toast(data.message || "Gagal mengumpulkan", "error");
    };

    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-bold text-slate-800 flex-1">Tugas Saya</h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.cls}`}>{st.label}</span>
            </div>

            {dinilai && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex flex-wrap gap-4 items-start">
                    <div className="text-center">
                        <p className="text-3xl font-black text-emerald-700">{p!.nilai}</p>
                        <p className="text-[10px] text-emerald-700 font-bold">dari {d.tugas.nilaiMaks}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-emerald-800">Catatan guru</p>
                        {p!.catatanGuru ? <IsiTeks teks={p!.catatanGuru} className="text-sm text-slate-700" /> : <p className="text-sm text-slate-500 italic">Tidak ada catatan.</p>}
                        <p className="text-[10px] text-slate-400 mt-1">Dinilai {fmtWaktu(p!.dinilaiAt)}</p>
                    </div>
                </div>
            )}

            {p && !ubah && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-400">Dikumpulkan {fmtWaktu(p.dikumpulkanAt)}</p>
                    {p.jawaban && <IsiTeks teks={p.jawaban} className="text-sm text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-100" />}
                    {p.lampiran && <Lampiran url={p.lampiran} nama={p.namaLampiran} />}
                    {!dinilai && <button onClick={() => setUbah(true)} className="text-sm font-bold text-indigo-600 hover:underline">Ubah jawaban</button>}
                </div>
            )}

            {ubah && !dinilai && (
                <form onSubmit={submit} className="space-y-3">
                    <textarea value={jawaban} onChange={(e) => setJawaban(e.target.value)} rows={6} className={`${inputClass} resize-y`}
                        placeholder="Tulis jawaban Anda di sini (atau lampirkan file di bawah)." aria-label="Jawaban tugas" />
                    <UploadLampiran value={lampiran} onChange={setLampiran} />
                    <div className="flex gap-2">
                        <button type="submit" disabled={proses || (!jawaban.trim() && !lampiran.url)} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">
                            {proses ? "Mengirim..." : p ? "Kirim Ulang" : "Kumpulkan"}
                        </button>
                        {p && <button type="button" onClick={() => setUbah(false)} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold">Batal</button>}
                    </div>
                </form>
            )}
        </section>
    );
}

/** Guru: daftar siswa, status pengumpulan, beri nilai & catatan. */
function Penilaian({ d, onChange }: { d: DataTugas; onChange: () => void }) {
    const { toast } = useToast();
    const daftar = d.daftar ?? [];
    const [buka, setBuka] = useState<number | null>(null);
    const [nilai, setNilai] = useState<Record<number, { nilai: string; catatan: string }>>({});
    const kumpul = daftar.filter((x) => x.pengumpulan).length;
    const dinilai = daftar.filter((x) => x.pengumpulan?.nilai !== null && x.pengumpulan?.nilai !== undefined).length;

    const isian = (p: Pengumpulan) => nilai[p.id] ?? { nilai: p.nilai === null ? "" : String(p.nilai), catatan: p.catatanGuru };

    const simpan = async (p: Pengumpulan) => {
        const v = isian(p);
        const { ok, data } = await kirim("/api/lms/pengumpulan", "PUT", { id: p.id, nilai: v.nilai === "" ? null : Number(v.nilai), catatanGuru: v.catatan });
        if (ok) { toast("Nilai disimpan", "success"); onChange(); } else toast(data.message || "Gagal menyimpan nilai", "error");
    };

    const unduhCsv = () => {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const baris = [["No", "Nomor Peserta", "Nama", "Status", "Waktu Kumpul", "Nilai", "Catatan"].join(",")];
        daftar.forEach((x, i) => {
            const p = x.pengumpulan;
            baris.push([i + 1, esc(x.siswa.nomorPeserta), esc(x.siswa.nama), p ? "Dikumpulkan" : "Belum", p ? esc(fmtWaktu(p.dikumpulkanAt)) : "", p?.nilai ?? "", esc(p?.catatanGuru ?? "")].join(","));
        });
        const blob = new Blob(["﻿" + baris.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `nilai-${d.mapel.kelas}-${d.tugas.judul}.csv`.replace(/[^\w.-]+/g, "_");
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <h2 className="font-bold text-slate-800 flex-1">Pengumpulan Siswa</h2>
                <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1 font-bold">{kumpul}/{daftar.length} mengumpulkan</span>
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 font-bold">{dinilai} dinilai</span>
                <button onClick={unduhCsv} disabled={daftar.length === 0} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50">Unduh CSV</button>
            </div>
            {daftar.length === 0 && <p className="p-8 text-center text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
            <ul className="divide-y divide-slate-100">
                {daftar.map((x) => {
                    const p = x.pengumpulan;
                    const st = statusTugas(d.tugas.tenggat, p);
                    const terbuka = p && buka === p.id;
                    return (
                        <li key={x.siswa.id}>
                            <button type="button" disabled={!p} onClick={() => p && setBuka(terbuka ? null : p.id)}
                                className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-slate-50 disabled:hover:bg-transparent disabled:cursor-default">
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-slate-800 truncate">{x.siswa.nama}</span>
                                    <span className="block text-[11px] text-slate-400 font-mono">{x.siswa.nomorPeserta}{p && <span className="font-sans"> · {fmtWaktu(p.dikumpulkanAt)}</span>}</span>
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                                {p && <span className="text-slate-400 text-xs">{terbuka ? "▲" : "▼"}</span>}
                            </button>
                            {terbuka && p && (
                                <div className="px-6 pb-5 space-y-3 bg-slate-50/60">
                                    {p.jawaban ? <IsiTeks teks={p.jawaban} className="text-sm text-slate-700 bg-white rounded-xl p-4 border border-slate-200" /> : <p className="text-xs text-slate-400 italic pt-3">Tanpa jawaban teks.</p>}
                                    {p.lampiran && <Lampiran url={p.lampiran} nama={p.namaLampiran} />}
                                    <div className="grid sm:grid-cols-[120px_1fr_auto] gap-2 items-start">
                                        <label className="block">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Nilai (0–{d.tugas.nilaiMaks})</span>
                                            <input type="number" min={0} max={d.tugas.nilaiMaks} value={isian(p).nilai}
                                                onChange={(e) => setNilai({ ...nilai, [p.id]: { ...isian(p), nilai: e.target.value } })} className={inputClass} />
                                        </label>
                                        <label className="block">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Catatan untuk siswa</span>
                                            <textarea rows={2} value={isian(p).catatan} onChange={(e) => setNilai({ ...nilai, [p.id]: { ...isian(p), catatan: e.target.value } })} className={`${inputClass} resize-y`} />
                                        </label>
                                        <button onClick={() => simpan(p)} className="sm:mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">Simpan Nilai</button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
