"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
    LmsNav, Diskusi, FormTugas, IsiTeks, DaftarLampiran, UploadBerkas, Modal, TabelRubrik, kirim, fmtWaktu, statusTugas, inputClass,
    type TugasData, type Berkas,
} from "@/components/lms/ui";

interface Pengumpulan {
    id: number;
    jawaban: string;
    berkas: Berkas[];
    status: string;
    dikumpulkanAt: string;
    nilai: number | null;
    nilaiRubrik: number[];
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
    const [salin, setSalin] = useState(false);

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
                                {tugas.tenggat && !tugas.terimaTerlambat && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold">Tidak menerima terlambat</span>}
                                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold">Nilai maks {tugas.nilaiMaks}</span>
                                {kelola && tugas.untukSiswa.length > 0 && <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-bold">Untuk {tugas.untukSiswa.length} siswa tertentu</span>}
                            </div>
                        </div>
                        {kelola && !tugas.terbit && <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-600">Draf — belum terlihat siswa</span>}
                        {kelola && (
                            <div className="flex gap-2">
                                <button onClick={() => setSalin(true)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">Salin ke kelas lain</button>
                                <button onClick={() => setEdit(true)} className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold">Edit</button>
                            </div>
                        )}
                    </header>
                    <IsiTeks teks={tugas.deskripsi} className="text-[15px] text-slate-700" />
                    <DaftarLampiran berkas={tugas.berkas} />
                    {!!tugas.rubrik?.length && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Rubrik penilaian</p>
                            <TabelRubrik rubrik={tugas.rubrik} />
                        </div>
                    )}
                </article>

                {kelola ? <Penilaian d={d} onChange={refresh} /> : <Pengumpulan key={d.pengumpulan?.status ?? "baru"} d={d} onChange={refresh} />}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <Diskusi target={{ tugasId: tugas.id }} />
                </div>
            </main>

            {edit && <FormTugas mapelId={d.mapel.id} awal={tugas} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); refresh(); }} />}
            {salin && <SalinTugas tugasId={tugas.id} mapelId={d.mapel.id} onClose={() => setSalin(false)} />}
        </div>
    );
}

/** Siswa: kumpulkan / perbarui jawaban, lihat nilai & catatan guru, perbaiki bila diminta revisi. */
function Pengumpulan({ d, onChange }: { d: DataTugas; onChange: () => void }) {
    const { toast } = useToast();
    const p = d.pengumpulan ?? null;
    const revisi = p?.status === "revisi";
    const [jawaban, setJawaban] = useState(p?.jawaban ?? "");
    const [berkas, setBerkas] = useState<Berkas[]>(p?.berkas ?? []);
    const [ubah, setUbah] = useState(!p);
    const [proses, setProses] = useState(false);
    const dinilai = p?.nilai !== null && p?.nilai !== undefined;
    const st = statusTugas(d.tugas.tenggat, p);
    const tertutup = !!d.tugas.tenggat && !d.tugas.terimaTerlambat && new Date(d.tugas.tenggat) < new Date() && !revisi;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProses(true);
        const { ok, data } = await kirim("/api/lms/pengumpulan", "POST", { tugasId: d.tugas.id, jawaban, berkas });
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
                    {!!d.tugas.rubrik?.length && p!.nilaiRubrik.length > 0 && <div className="basis-full"><TabelRubrik rubrik={d.tugas.rubrik} nilai={p!.nilaiRubrik} /></div>}
                </div>
            )}

            {revisi && (
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
                    <p className="text-xs font-bold text-orange-800">Guru meminta Anda memperbaiki jawaban · {fmtWaktu(p!.dinilaiAt)}</p>
                    <IsiTeks teks={p!.catatanGuru} className="text-sm text-slate-700 mt-1" />
                </div>
            )}

            {p && !ubah && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-400">Dikumpulkan {fmtWaktu(p.dikumpulkanAt)}</p>
                    {p.jawaban && <IsiTeks teks={p.jawaban} className="text-sm text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-100" />}
                    <DaftarLampiran berkas={p.berkas} />
                    {!dinilai && !tertutup && (
                        <button onClick={() => setUbah(true)} className={revisi ? "px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold" : "text-sm font-bold text-indigo-600 hover:underline"}>
                            {revisi ? "Perbaiki & Kirim Ulang" : "Ubah jawaban"}
                        </button>
                    )}
                </div>
            )}

            {tertutup && !dinilai && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                    Tenggat sudah lewat dan guru tidak menerima pengumpulan terlambat{p ? ", jadi jawaban tidak dapat diubah lagi" : ""}.
                </p>
            )}

            {ubah && !dinilai && !tertutup && (
                <form onSubmit={submit} className="space-y-3">
                    <textarea value={jawaban} onChange={(e) => setJawaban(e.target.value)} rows={6} className={`${inputClass} resize-y`}
                        placeholder="Tulis jawaban Anda di sini (atau lampirkan file di bawah)." aria-label="Jawaban tugas" />
                    <UploadBerkas value={berkas} onChange={setBerkas} />
                    <div className="flex gap-2">
                        <button type="submit" disabled={proses || (!jawaban.trim() && berkas.length === 0)} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">
                            {proses ? "Mengirim..." : p ? "Kirim Ulang" : "Kumpulkan"}
                        </button>
                        {p && <button type="button" onClick={() => setUbah(false)} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold">Batal</button>}
                    </div>
                </form>
            )}
        </section>
    );
}

type Saring = "semua" | "belumDinilai" | "belumKumpul" | "revisi" | "dinilai";

/** Guru: daftar siswa, status pengumpulan, beri nilai & catatan, minta revisi, unduh semua. */
function Penilaian({ d, onChange }: { d: DataTugas; onChange: () => void }) {
    const { toast } = useToast();
    const daftar = d.daftar ?? [];
    const [buka, setBuka] = useState<number | null>(null);
    const [nilai, setNilai] = useState<Record<number, { nilai: string; catatan: string; rubrik: string[] }>>({});
    const [saring, setSaring] = useState<Saring>("semua");
    const sudahNilai = (p: Pengumpulan | null) => p?.nilai !== null && p?.nilai !== undefined;
    const kumpul = daftar.filter((x) => x.pengumpulan).length;
    const dinilai = daftar.filter((x) => sudahNilai(x.pengumpulan)).length;

    const cocok: Record<Saring, (p: Pengumpulan | null) => boolean> = {
        semua: () => true,
        belumDinilai: (p) => !!p && !sudahNilai(p) && p.status !== "revisi",
        belumKumpul: (p) => !p,
        revisi: (p) => p?.status === "revisi",
        dinilai: (p) => sudahNilai(p),
    };
    const tampil = daftar.filter((x) => cocok[saring](x.pengumpulan));
    const jumlah = (s: Saring) => daftar.filter((x) => cocok[s](x.pengumpulan)).length;

    const rubrik = d.tugas.rubrik ?? [];
    const isian = (p: Pengumpulan) => nilai[p.id] ?? {
        nilai: p.nilai === null ? "" : String(p.nilai), catatan: p.catatanGuru,
        rubrik: rubrik.map((_, i) => (p.nilaiRubrik[i] === undefined ? "" : String(p.nilaiRubrik[i]))),
    };

    // Setelah menyimpan, buka siswa berikutnya yang belum dinilai
    const berikutnya = (id: number) => {
        const urut = daftar.filter((x) => x.pengumpulan && !sudahNilai(x.pengumpulan) && x.pengumpulan.status !== "revisi" && x.pengumpulan.id !== id);
        setBuka(urut[0]?.pengumpulan?.id ?? null);
    };

    const simpan = async (p: Pengumpulan) => {
        const v = isian(p);
        const pakaiRubrik = rubrik.length > 0 && v.rubrik.some((x) => x !== "");
        const body = pakaiRubrik
            ? { id: p.id, rubrik: v.rubrik.map((x) => (x === "" ? null : Number(x))), catatanGuru: v.catatan }
            : { id: p.id, nilai: v.nilai === "" ? null : Number(v.nilai), catatanGuru: v.catatan };
        const { ok, data } = await kirim("/api/lms/pengumpulan", "PUT", body);
        if (ok) { toast("Nilai disimpan", "success"); if (pakaiRubrik || v.nilai !== "") berikutnya(p.id); onChange(); } else toast(data.message || "Gagal menyimpan nilai", "error");
    };

    const mintaRevisi = async (p: Pengumpulan) => {
        const v = isian(p);
        if (!v.catatan.trim()) { toast("Tulis catatan apa yang perlu diperbaiki", "error"); return; }
        const { ok, data } = await kirim("/api/lms/pengumpulan", "PUT", { id: p.id, aksi: "revisi", catatanGuru: v.catatan });
        if (ok) { toast("Dikembalikan ke siswa untuk revisi", "success"); berikutnya(p.id); onChange(); } else toast(data.message || "Gagal", "error");
    };

    const unduhCsv = () => {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const baris = [["No", "Nomor Peserta", "Nama", "Status", "Waktu Kumpul", "Nilai", "Catatan"].join(",")];
        daftar.forEach((x, i) => {
            const p = x.pengumpulan;
            const status = !p ? "Belum" : p.status === "revisi" ? "Perlu revisi" : "Dikumpulkan";
            baris.push([i + 1, esc(x.siswa.nomorPeserta), esc(x.siswa.nama), status, p ? esc(fmtWaktu(p.dikumpulkanAt)) : "", p?.nilai ?? "", esc(p?.catatanGuru ?? "")].join(","));
        });
        const blob = new Blob(["﻿" + baris.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `nilai-${d.mapel.kelas}-${d.tugas.judul}.csv`.replace(/[^\w.-]+/g, "_");
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const tabSaring: [Saring, string][] = [["semua", "Semua"], ["belumDinilai", "Perlu dinilai"], ["revisi", "Revisi"], ["dinilai", "Dinilai"], ["belumKumpul", "Belum kumpul"]];

    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <h2 className="font-bold text-slate-800 flex-1">Pengumpulan Siswa</h2>
                <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1 font-bold">{kumpul}/{daftar.length} mengumpulkan</span>
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 font-bold">{dinilai} dinilai</span>
                {kumpul > 0
                    ? <a href={`/api/lms/tugas/${d.tugas.id}/zip`} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Unduh Semua (ZIP)</a>
                    : <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white opacity-50">Unduh Semua (ZIP)</span>}
                <button onClick={unduhCsv} disabled={daftar.length === 0} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50">Unduh CSV</button>
            </div>
            <div className="px-6 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto" role="tablist">
                {tabSaring.map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={saring === k} onClick={() => setSaring(k)}
                        className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${saring === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {label} <span className="opacity-70">{jumlah(k)}</span>
                    </button>
                ))}
            </div>
            {daftar.length === 0 && <p className="p-8 text-center text-slate-400 italic">Belum ada siswa yang ditugaskan.</p>}
            {daftar.length > 0 && tampil.length === 0 && <p className="p-8 text-center text-slate-400 italic">Tidak ada siswa di kategori ini.</p>}
            <ul className="divide-y divide-slate-100">
                {tampil.map((x) => {
                    const p = x.pengumpulan;
                    const st = statusTugas(d.tugas.tenggat, p);
                    const terbuka = p && buka === p.id;
                    return (
                        <li key={x.siswa.id}>
                            <button type="button" disabled={!p} onClick={() => p && setBuka(terbuka ? null : p.id)}
                                className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-slate-50 disabled:hover:bg-transparent disabled:cursor-default">
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-slate-800 truncate">{x.siswa.nama}</span>
                                    <span className="block text-[11px] text-slate-400 font-mono">{x.siswa.nomorPeserta}{p && <span className="font-sans"> · {fmtWaktu(p.dikumpulkanAt)}{p.berkas.length > 0 && ` · ${p.berkas.length} file`}</span>}</span>
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                                {p && <span className="text-slate-400 text-xs">{terbuka ? "▲" : "▼"}</span>}
                            </button>
                            {terbuka && p && (
                                <div className="px-6 pb-5 space-y-3 bg-slate-50/60">
                                    {p.jawaban ? <IsiTeks teks={p.jawaban} className="text-sm text-slate-700 bg-white rounded-xl p-4 border border-slate-200" /> : <p className="text-xs text-slate-400 italic pt-3">Tanpa jawaban teks.</p>}
                                    <DaftarLampiran berkas={p.berkas} />
                                    {rubrik.length > 0 && (
                                        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                                            {rubrik.map((r, i) => (
                                                <label key={i} className="flex items-center gap-3 px-3 py-2">
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-sm font-semibold text-slate-700">{r.kriteria}</span>
                                                        {r.deskripsi && <span className="block text-[11px] text-slate-500 truncate">{r.deskripsi}</span>}
                                                    </span>
                                                    <input type="number" min={0} max={r.maks} value={isian(p).rubrik[i]} aria-label={`Skor ${r.kriteria}`}
                                                        onChange={(e) => setNilai({ ...nilai, [p.id]: { ...isian(p), rubrik: isian(p).rubrik.map((x, j) => (j === i ? e.target.value : x)) } })}
                                                        className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                                                    <span className="w-10 text-xs text-slate-400">/ {r.maks}</span>
                                                </label>
                                            ))}
                                            <p className="px-3 py-2 text-sm font-bold text-slate-700 text-right">Total: {isian(p).rubrik.reduce((a, x) => a + (Number(x) || 0), 0)} / {d.tugas.nilaiMaks}</p>
                                        </div>
                                    )}
                                    <div className={`grid gap-2 items-start ${rubrik.length ? "" : "sm:grid-cols-[120px_1fr]"}`}>
                                        {!rubrik.length && (
                                            <label className="block">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase">Nilai (0–{d.tugas.nilaiMaks})</span>
                                                <input type="number" min={0} max={d.tugas.nilaiMaks} value={isian(p).nilai}
                                                    onChange={(e) => setNilai({ ...nilai, [p.id]: { ...isian(p), nilai: e.target.value } })} className={inputClass} />
                                            </label>
                                        )}
                                        <label className="block">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Catatan untuk siswa</span>
                                            <textarea rows={2} value={isian(p).catatan} onChange={(e) => setNilai({ ...nilai, [p.id]: { ...isian(p), catatan: e.target.value } })} className={`${inputClass} resize-y`} />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button onClick={() => mintaRevisi(p)} className="px-4 py-2 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-bold"
                                            title="Kembalikan ke siswa dengan catatan; siswa bisa mengirim ulang">Minta Revisi</button>
                                        <button onClick={() => simpan(p)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">Simpan Nilai</button>
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

/** Salin tugas ke mapel lain yang dikelola (sebagai draf). */
function SalinTugas({ tugasId, mapelId, onClose }: { tugasId: number; mapelId: number; onClose: () => void }) {
    const { toast } = useToast();
    const [mapel, setMapel] = useState<{ id: number; nama: string; kelas: { nama: string } }[] | null>(null);
    const [pilih, setPilih] = useState<number[]>([]);
    const [proses, setProses] = useState(false);

    useEffect(() => {
        let ignore = false;
        fetch("/api/lms/kelas").then((r) => r.json()).then((d) => { if (!ignore) setMapel((d.mapel ?? []).filter((m: { id: number }) => m.id !== mapelId)); });
        return () => { ignore = true; };
    }, [mapelId]);

    const submit = async () => {
        setProses(true);
        const { ok, data } = await kirim("/api/lms/tugas", "POST", { salinDari: tugasId, mapelIds: pilih });
        setProses(false);
        toast(data.message || (ok ? "Tugas disalin" : "Gagal menyalin"), ok ? "success" : "error");
        if (ok) onClose();
    };

    return (
        <Modal judul="Salin Tugas ke Kelas Lain" onClose={onClose}>
            <p className="text-xs text-slate-500 mb-3">Salinan dibuat sebagai <b>draf</b> untuk semua siswa kelas tujuan — periksa tenggat lalu terbitkan dari mapel tujuan.</p>
            {mapel === null && <p className="text-sm text-slate-400">Memuat...</p>}
            {mapel?.length === 0 && <p className="text-sm text-slate-400 italic">Tidak ada mapel lain yang Anda kelola.</p>}
            <div className="space-y-1 max-h-72 overflow-y-auto">
                {mapel?.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-sm">
                        <input type="checkbox" checked={pilih.includes(m.id)} onChange={() => setPilih(pilih.includes(m.id) ? pilih.filter((x) => x !== m.id) : [...pilih, m.id])} />
                        <span className="font-semibold text-slate-700">{m.kelas.nama}</span>
                        <span className="text-slate-500">· {m.nama}</span>
                    </label>
                ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                <button onClick={submit} disabled={proses || pilih.length === 0} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">
                    {proses ? "Menyalin..." : `Salin ke ${pilih.length} mapel`}
                </button>
            </div>
        </Modal>
    );
}
