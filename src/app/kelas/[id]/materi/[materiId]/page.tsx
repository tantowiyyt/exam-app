"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LmsNav, Diskusi, FormMateri, IsiTeks, Lampiran, VideoEmbed, fmtWaktu, type MateriData } from "@/components/lms/ui";

interface DataMateri {
    peran: "kelola" | "siswa";
    mapel: { id: number; nama: string; kelas: string };
    materi: MateriData & { id: number; createdAt: string; updatedAt: string };
    pembaca: { nama: string; nomorPeserta: string; waktu: string }[];
}

async function muat(id: string) {
    const res = await fetch(`/api/lms/materi/${id}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data: data as DataMateri } : { error: (data.message as string) || "Gagal memuat" };
}

export default function HalamanMateri() {
    const { id, materiId } = useParams<{ id: string; materiId: string }>();
    const [d, setD] = useState<DataMateri | null>(null);
    const [error, setError] = useState("");
    const [edit, setEdit] = useState(false);

    const refresh = useCallback(async () => {
        const r = await muat(materiId);
        if (r.data) setD(r.data); else setError(r.error);
    }, [materiId]);

    useEffect(() => {
        let ignore = false;
        muat(materiId).then((r) => { if (!ignore) { if (r.data) setD(r.data); else setError(r.error); } });
        return () => { ignore = true; };
    }, [materiId]);

    const kembali = { href: `/kelas/${id}`, label: "Mapel" };
    if (error) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={kembali} /><p className="p-8 text-center text-red-600 font-semibold">{error}</p></div>);
    if (!d) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={kembali} /><p className="p-8 text-center text-slate-500">Memuat...</p></div>);

    const { materi } = d;
    const kelola = d.peran === "kelola";

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <LmsNav judul={`${d.mapel.kelas} · ${d.mapel.nama}`} kembali={kembali} />
            <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-5">
                    <header className="flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Materi · {d.mapel.nama}</p>
                            <h1 className="text-2xl font-black text-slate-800 mt-1">{materi.judul}</h1>
                            <p className="text-xs text-slate-400 mt-1">Diterbitkan {fmtWaktu(materi.createdAt)}{materi.updatedAt !== materi.createdAt && ` · diperbarui ${fmtWaktu(materi.updatedAt)}`}</p>
                        </div>
                        {kelola && !materi.terbit && <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-600">Draf — belum terlihat siswa</span>}
                        {kelola && <button onClick={() => setEdit(true)} className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold">Edit</button>}
                    </header>

                    <VideoEmbed url={materi.linkVideo} />
                    <IsiTeks teks={materi.isi} className="text-[15px] text-slate-700" />
                    {materi.lampiran && (
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Lampiran</p>
                            <Lampiran url={materi.lampiran} nama={materi.namaLampiran} />
                        </div>
                    )}
                    {!materi.isi && !materi.linkVideo && !materi.lampiran && <p className="text-slate-400 italic">Materi ini belum berisi konten.</p>}
                </article>

                {kelola && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Sudah dibaca ({d.pembaca.length} siswa)</h3>
                        {d.pembaca.length === 0 ? <p className="text-xs text-slate-400 italic">Belum ada siswa yang membuka materi ini.</p> : (
                            <div className="flex flex-wrap gap-2">
                                {d.pembaca.map((p) => (
                                    <span key={p.nomorPeserta} title={fmtWaktu(p.waktu)} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1">{p.nama}</span>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <Diskusi target={{ materiId: materi.id }} />
                </div>
            </main>

            {edit && <FormMateri mapelId={d.mapel.id} awal={materi} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); refresh(); }} />}
        </div>
    );
}
