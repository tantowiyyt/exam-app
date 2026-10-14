"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";
import { Modal, kirim, inputClass, labelClass } from "@/components/lms/ui";
import { EditorSoal, LABEL_TIPE, teksKunci, type ItemBank, type SoalEdit } from "@/components/lms/kuis";

// Bank soal guru per mapel (lintas kelas): kelola soal, label bab/topik, bagikan ke guru lain dengan mapel sama.
// Soal dipakai lewat tombol "Ambil dari Bank Soal" di editor soal kuis / ujian CAT.

interface Data { soal: ItemBank[]; mapelList: string[]; mapelDiajar: string[]; labelList: string[] }

async function muat(mapel: string) {
    const res = await fetch(`/api/lms/bank-soal${mapel ? `?mapel=${encodeURIComponent(mapel)}` : ""}`);
    const d = await res.json().catch(() => ({}));
    return res.ok ? { data: d as Data } : { error: (d.message as string) || "Gagal memuat bank soal" };
}

const HURUF = "ABCDEF";

export default function HalamanBankSoal() {
    const { toast } = useToast();
    const [mapel, setMapel] = useState("");
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [label, setLabel] = useState("");
    const [cari, setCari] = useState("");
    const [hanyaSaya, setHanyaSaya] = useState(false);
    const [pilih, setPilih] = useState<Set<number>>(new Set());
    const [tambah, setTambah] = useState<{ label: string; bersama: boolean; versi: number } | null>(null);
    const [edit, setEdit] = useState<ItemBank | null>(null);

    const refresh = useCallback(async () => {
        const r = await muat(mapel);
        if (r.data) setD(r.data); else setError(r.error);
    }, [mapel]);

    useEffect(() => {
        let ignore = false;
        muat(mapel).then((r) => {
            if (ignore) return;
            if (!r.data) { setError(r.error); return; }
            // Pertama kali: pilih mapel yang diajar
            if (!mapel && r.data.mapelList.length) { setMapel(r.data.mapelDiajar[0] ?? r.data.mapelList[0]); return; }
            setD(r.data);
        });
        return () => { ignore = true; };
    }, [mapel]);

    const soal = (d?.soal ?? []).filter((s) => (!label || s.label === label) && (!hanyaSaya || s.milikSaya) && (!cari || s.pertanyaan.toLowerCase().includes(cari.toLowerCase())));
    const dipilih = soal.filter((s) => pilih.has(s.id) && s.milikSaya);
    const milikTampil = soal.filter((s) => s.milikSaya);
    const semua = milikTampil.length > 0 && milikTampil.every((s) => pilih.has(s.id));

    const massal = async (body: Record<string, unknown>, pesan?: string) => {
        if (pesan && !confirm(pesan)) return;
        const ids = dipilih.map((s) => s.id);
        const { ok, data } = body.hapus
            ? await kirim(`/api/lms/bank-soal?ids=${ids.join(",")}`, "DELETE")
            : await kirim("/api/lms/bank-soal", "PUT", { ids, ...body });
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) { setPilih(new Set()); refresh(); }
    };
    const gantiLabel = () => {
        const v = prompt(`Label baru untuk ${dipilih.length} soal (bab/topik):`, dipilih[0]?.label ?? "");
        if (v !== null) massal({ label: v });
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Akademik" judul="Bank Soal">
                {d && d.mapelList.length > 0 && (
                    <select value={mapel} onChange={(e) => { setMapel(e.target.value); setLabel(""); setPilih(new Set()); setTambah(null); }} aria-label="Mapel"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {d.mapelList.map((m) => <option key={m}>{m}</option>)}
                    </select>
                )}
                {mapel && <button onClick={() => setTambah({ label: label, bersama: false, versi: Date.now() })} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Tambah Soal</button>}
            </HeaderHalaman>

            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-4">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {!d && !error && <p className="text-slate-500">Memuat...</p>}
                {d && !mapel && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Anda belum mengampu mapel. Bank soal dikelompokkan per nama mapel.</p>}

                {d && mapel && (
                    <>
                        <p className="text-sm text-slate-500">Soal <b>{mapel}</b> bisa dipakai di kuis atau ujian CAT kelas mana pun lewat tombol <b>Ambil dari Bank Soal</b> di editor soal. Soal yang <b>dibagikan</b> terlihat oleh guru lain yang mengajar mapel ini (hanya pemilik yang bisa mengubah).</p>

                        {tambah && (
                            <section className="bg-indigo-50/50 border border-indigo-200 rounded-2xl p-4 space-y-3">
                                <div className="flex flex-wrap items-end gap-3">
                                    <label className="block flex-1 min-w-48"><span className={labelClass}>Label (bab / topik / tingkat)</span>
                                        <input value={tambah.label} onChange={(e) => setTambah({ ...tambah, label: e.target.value })} maxLength={100} list="label-bank" placeholder="mis. Bab 2 · Vektor" className={inputClass} />
                                        <datalist id="label-bank">{d.labelList.map((l) => <option key={l} value={l} />)}</datalist>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                                        <input type="checkbox" checked={tambah.bersama} onChange={(e) => setTambah({ ...tambah, bersama: e.target.checked })} /> Bagikan ke guru lain
                                    </label>
                                    <button onClick={() => setTambah(null)} className="pb-2 text-sm font-bold text-slate-500 hover:text-slate-800">Tutup</button>
                                </div>
                                <EditorSoal key={tambah.versi} awal={[]} labelSimpan="Simpan ke Bank"
                                    simpanKe={(s) => kirim("/api/lms/bank-soal", "POST", { mapel, label: tambah.label, bersama: tambah.bersama, soal: s })}
                                    onSaved={() => { setTambah({ ...tambah, versi: Date.now() }); refresh(); }} />
                            </section>
                        )}

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
                            <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari pertanyaan..." aria-label="Cari soal" className={`${inputClass} flex-1 min-w-48`} />
                            {d.labelList.length > 0 && (
                                <select value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" className={`${inputClass} w-auto`}>
                                    <option value="">Semua label</option>
                                    {d.labelList.map((l) => <option key={l}>{l}</option>)}
                                </select>
                            )}
                            <label className="flex items-center gap-2 text-sm text-slate-600 px-2"><input type="checkbox" checked={hanyaSaya} onChange={(e) => setHanyaSaya(e.target.checked)} /> Hanya milik saya</label>
                            <span className="text-xs text-slate-500">{soal.length} soal</span>
                        </div>

                        {milikTampil.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <label className="flex items-center gap-2 font-bold text-slate-600 mr-2">
                                    <input type="checkbox" checked={semua} onChange={() => setPilih(semua ? new Set() : new Set(milikTampil.map((s) => s.id)))} /> Pilih semua milik saya
                                </label>
                                {dipilih.length > 0 && <>
                                    <span className="text-slate-500">{dipilih.length} dipilih:</span>
                                    <button onClick={() => massal({ bersama: true })} className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold">Bagikan</button>
                                    <button onClick={() => massal({ bersama: false })} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold">Jangan bagikan</button>
                                    <button onClick={gantiLabel} className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold">Ubah label</button>
                                    <button onClick={() => massal({ hapus: true }, `Hapus ${dipilih.length} soal dari bank? Kuis/ujian yang sudah memakai soal ini tidak terpengaruh.`)} className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 font-bold">Hapus</button>
                                </>}
                            </div>
                        )}

                        {soal.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">{d.soal.length ? "Tidak ada soal yang cocok." : `Bank soal ${mapel} masih kosong. Klik + Tambah Soal, atau simpan soal dari editor kuis/ujian.`}</p>}
                        <ul className="space-y-2">
                            {soal.map((s, i) => (
                                <li key={s.id} className={`bg-white rounded-xl border shadow-sm p-4 flex gap-3 ${pilih.has(s.id) ? "border-indigo-400" : "border-slate-200"}`}>
                                    {s.milikSaya
                                        ? <input type="checkbox" className="mt-1" aria-label={`Pilih soal ${i + 1}`} checked={pilih.has(s.id)} onChange={() => setPilih((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
                                        : <span className="w-4" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">{LABEL_TIPE[s.tipe]}</span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">bobot {s.bobot}</span>
                                            {s.label && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">{s.label}</span>}
                                            {s.bersama && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Dibagikan</span>}
                                            {!s.milikSaya && <span className="text-[10px] text-slate-400">dari {s.pemilik}</span>}
                                        </div>
                                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{s.pertanyaan}</p>
                                        {s.tipe === "pg" && (
                                            <ol className="mt-1 text-xs text-slate-600 grid sm:grid-cols-2 gap-x-4">
                                                {s.opsi.map((o, k) => <li key={k} className={String(k) === s.kunci ? "font-bold text-emerald-700" : ""}>{HURUF[k]}. {o}</li>)}
                                            </ol>
                                        )}
                                        {s.tipe !== "pg" && <p className="mt-1 text-xs text-emerald-700 font-semibold">Kunci: {teksKunci(s)}</p>}
                                    </div>
                                    {s.milikSaya && <button onClick={() => setEdit(s)} className="self-start text-xs font-bold text-indigo-600 hover:underline">Edit</button>}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </main>

            {edit && (
                <Modal judul="Edit Soal Bank" onClose={() => setEdit(null)}>
                    <EditorSoal tunggal labelSimpan="Simpan Perubahan"
                        awal={[{ kunciLokal: `b${edit.id}`, tipe: edit.tipe, pertanyaan: edit.pertanyaan, opsi: edit.opsi, kunci: edit.kunci, pembahasan: edit.pembahasan, bobot: edit.bobot } as SoalEdit]}
                        simpanKe={(s) => kirim("/api/lms/bank-soal", "PUT", { ...s[0], id: edit.id })}
                        onSaved={() => { setEdit(null); refresh(); }} />
                </Modal>
            )}
        </div>
    );
}
