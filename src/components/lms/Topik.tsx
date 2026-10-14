"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { Modal, IsiTeks, LabelTerbit, kirim, fmtWaktu, inputClass, labelClass } from "./ui";

type Jenis = "materi" | "tugas" | "kuis";
interface Item { jenis: Jenis; id: number; judul: string; topikId: number | null; info: string; selesai: boolean | null; terbit: boolean; terbitPada?: string | null; createdAt: string }
export interface DataTopik {
    topik: { id: number; judul: string; deskripsi: string }[];
    materi: { id: number; judul: string; terbit: boolean; terbitPada?: string | null; topikId: number | null; createdAt: string; sudahDibaca: boolean }[];
    tugas: { id: number; judul: string; terbit: boolean; terbitPada?: string | null; topikId: number | null; createdAt: string; tenggat: string | null; pengumpulanSaya?: { status: string } | null }[];
    kuis: { id: number; judul: string; terbit: boolean; topikId: number | null; selesai: string | null; jumlahSoal: number; saya?: { terbaik: unknown } }[];
}

const IKON: Record<Jenis, { huruf: string; cls: string }> = {
    materi: { huruf: "M", cls: "bg-indigo-100 text-indigo-700" },
    tugas: { huruf: "T", cls: "bg-amber-100 text-amber-700" },
    kuis: { huruf: "Q", cls: "bg-fuchsia-100 text-fuchsia-700" },
};

/** Tab "Topik": materi, tugas, dan kuis dikelompokkan per topik/bab/minggu. */
export function TabTopik({ mapelId, kelola, d, refresh }: { mapelId: number; kelola: boolean; d: DataTopik; refresh: () => void }) {
    const { toast } = useToast();
    const [form, setForm] = useState<{ id?: number; judul: string; deskripsi: string } | null>(null);

    const items: Item[] = [
        ...d.materi.map((m) => ({ jenis: "materi" as const, id: m.id, judul: m.judul, topikId: m.topikId, terbit: m.terbit, terbitPada: m.terbitPada, createdAt: m.createdAt, info: "Materi", selesai: kelola ? null : m.sudahDibaca })),
        ...d.tugas.map((t) => ({ jenis: "tugas" as const, id: t.id, judul: t.judul, topikId: t.topikId, terbit: t.terbit, terbitPada: t.terbitPada, createdAt: t.createdAt, info: t.tenggat ? `Tugas · tenggat ${fmtWaktu(t.tenggat)}` : "Tugas", selesai: kelola ? null : !!t.pengumpulanSaya && t.pengumpulanSaya.status !== "revisi" })),
        ...d.kuis.map((k) => ({ jenis: "kuis" as const, id: k.id, judul: k.judul, topikId: k.topikId, terbit: k.terbit, createdAt: "", info: `Kuis · ${k.jumlahSoal} soal${k.selesai ? ` · ditutup ${fmtWaktu(k.selesai)}` : ""}`, selesai: kelola ? null : !!k.saya?.terbaik })),
    ];
    const bagian = [
        ...d.topik.map((t) => ({ topik: t, isi: items.filter((x) => x.topikId === t.id) })),
        { topik: null, isi: items.filter((x) => !x.topikId || !d.topik.some((t) => t.id === x.topikId)) },
    ].filter((b) => b.topik || b.isi.length);

    const simpan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        const { ok, data } = await kirim("/api/lms/topik", form.id ? "PUT" : "POST", { ...form, mapelId });
        if (ok) { toast(form.id ? "Topik diperbarui" : "Topik ditambahkan", "success"); setForm(null); refresh(); } else toast(data.message || "Gagal", "error");
    };
    const aksi = async (method: string, body?: unknown, url = "/api/lms/topik") => {
        const { ok, data } = await kirim(url, method, body);
        if (!ok) toast(data.message || "Gagal", "error"); else refresh();
        return ok;
    };
    const hapus = (t: { id: number; judul: string }) => {
        if (confirm(`Hapus topik "${t.judul}"? Materi, tugas, dan kuis di dalamnya TIDAK ikut terhapus (pindah ke "Lainnya").`)) aksi("DELETE", undefined, `/api/lms/topik?id=${t.id}`);
    };

    return (
        <section className="space-y-4">
            {kelola && (
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setForm({ judul: `Topik ${d.topik.length + 1}`, deskripsi: "" })} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Topik</button>
                    <p className="text-xs text-slate-500">Kelompokkan materi, tugas, dan kuis per bab atau minggu. Pilih topik saat membuat item, atau pindahkan dari daftar di bawah.</p>
                </div>
            )}
            {bagian.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada materi, tugas, atau kuis.</p>}

            {bagian.map(({ topik, isi }, i) => {
                const terlihat = isi.filter((x) => x.selesai !== null);
                const selesai = terlihat.filter((x) => x.selesai).length;
                return (
                    <div key={topik?.id ?? "lain"} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-slate-800">{topik ? topik.judul : d.topik.length ? "Lainnya" : "Semua Isi"}</h3>
                                {topik?.deskripsi && <IsiTeks teks={topik.deskripsi} className="text-xs text-slate-500 mt-1" />}
                            </div>
                            {!kelola && terlihat.length > 0 && (
                                <div className="flex items-center gap-2 text-xs text-slate-500" title="Progres Anda di topik ini">
                                    <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(selesai / terlihat.length) * 100}%` }} /></div>
                                    <b>{selesai}/{terlihat.length}</b>
                                </div>
                            )}
                            {kelola && topik && (
                                <div className="flex gap-1 text-xs font-bold">
                                    <button onClick={() => aksi("PUT", { aksi: "urut", id: topik.id, arah: "naik" })} disabled={i === 0} aria-label="Naikkan topik" className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30">↑</button>
                                    <button onClick={() => aksi("PUT", { aksi: "urut", id: topik.id, arah: "turun" })} disabled={i >= d.topik.length - 1} aria-label="Turunkan topik" className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30">↓</button>
                                    <button onClick={() => setForm({ id: topik.id, judul: topik.judul, deskripsi: topik.deskripsi })} className="px-2 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Ubah</button>
                                    <button onClick={() => hapus(topik)} className="px-2 h-7 rounded-lg text-red-600 hover:bg-red-50">Hapus</button>
                                </div>
                            )}
                        </div>
                        {isi.length === 0 && <p className="px-5 py-4 text-xs text-slate-400 italic">Belum ada isi di topik ini.</p>}
                        <ul className="divide-y divide-slate-100">
                            {isi.map((x) => (
                                <li key={`${x.jenis}${x.id}`} className="flex items-center gap-3 px-5 py-2.5">
                                    <span className={`shrink-0 w-8 h-8 rounded-lg font-black text-xs flex items-center justify-center ${x.selesai ? "bg-emerald-100 text-emerald-700" : IKON[x.jenis].cls}`}>{x.selesai ? "✓" : IKON[x.jenis].huruf}</span>
                                    <Link href={`/kelas/${mapelId}/${x.jenis}/${x.id}`} className="flex-1 min-w-0 group">
                                        <span className="block text-sm font-semibold text-slate-800 group-hover:text-indigo-700 truncate">{x.judul}</span>
                                        <span className="block text-[11px] text-slate-400 truncate">{x.info}</span>
                                    </Link>
                                    {kelola && <LabelTerbit terbit={x.terbit} terbitPada={x.terbitPada} />}
                                    {kelola && d.topik.length > 0 && (
                                        <select value={x.topikId ?? ""} aria-label={`Topik untuk ${x.judul}`} onChange={(e) => aksi("PUT", { aksi: "pindah", jenis: x.jenis, itemId: x.id, topikId: e.target.value ? Number(e.target.value) : null })}
                                            className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 max-w-32">
                                            <option value="">Lainnya</option>
                                            {d.topik.map((t) => <option key={t.id} value={t.id}>{t.judul}</option>)}
                                        </select>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}

            {form && (
                <Modal judul={form.id ? "Ubah Topik" : "Topik Baru"} onClose={() => setForm(null)}>
                    <form onSubmit={simpan} className="space-y-4">
                        <label className="block"><span className={labelClass}>Judul</span>
                            <input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} required maxLength={200} className={inputClass} placeholder="mis. Bab 1 — Limit Fungsi / Minggu 1" />
                        </label>
                        <label className="block"><span className={labelClass}>Deskripsi / tujuan pembelajaran (opsional)</span>
                            <textarea value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} rows={3} maxLength={2000} className={`${inputClass} resize-y`} />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Simpan</button>
                        </div>
                    </form>
                </Modal>
            )}
        </section>
    );
}
