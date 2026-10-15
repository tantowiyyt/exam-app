"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { Modal, kirim, inputClass, labelClass } from "./ui";

type Nilai = number | "kumpul" | "revisi" | "na" | null;
interface Kolom { kunci: string; jenis: "tugas" | "kuis" | "ujian"; id: number; judul: string; maks: number; terbit: boolean; offline?: boolean; mapelUjian?: boolean; sekolah?: boolean; jenisUjian?: string; mode?: string; turunan?: { tipe: string; induk: string } }
const LABEL_SUSULAN: Record<string, string> = { remedial: "Remedial", pengayaan: "Pengayaan", susulan: "Susulan" };
const LABEL_ATURAN: Record<string, string> = {
    maksKkm: "Nilai tertinggi, nilai remedial maksimal KKM",
    maks: "Nilai tertinggi (asli atau remedial)",
    ganti: "Nilai remedial menggantikan nilai asli",
};

const LABEL_JENIS_UJIAN: Record<string, string> = { UH: "UH", UTS: "UTS", UAS: "UAS", LAIN: "Ujian" };
/** Label kolom ujian: jenis + cara pelaksanaan (mis. "UTS · CAT", "UH · offline", "Ujian CAT sekolah"). */
const labelUjian = (k: Kolom) => (k.mapelUjian
    ? `${LABEL_JENIS_UJIAN[k.jenisUjian ?? "LAIN"] ?? "Ujian"} · ${k.mode === "cat" ? "CAT" : "offline"}`
    : `${k.jenisUjian && k.jenisUjian !== "LAIN" ? `${k.jenisUjian} · ` : ""}Ujian CAT sekolah`);
interface Data {
    peran: "kelola" | "siswa";
    mapel: { id: number; nama: string; kelas: string };
    kolom: Kolom[];
    pengaturan: Pengaturan & { berbobot: boolean };
    baris: { siswa: { id: number; nomorPeserta: string; nama: string }; nilai: Record<string, Nilai>; akhir?: Record<string, number>; komponen: Record<Kat, number | null>; rataRata: number | null; tuntas: boolean | null }[];
    ringkasan: { rataKelas: number | null; tertinggi: number | null; terendah: number | null; tuntas: number | null };
}
type Kat = "tugas" | "kuis" | "uh" | "uts" | "uas" | "ujian" | "presensi";
interface Pengaturan { tugas: number; kuis: number; uh: number; uts: number; uas: number; ujian: number; presensi: number; kkm: number; aturanRemedial?: string }
const KAT: [Kat, string][] = [["tugas", "Tugas"], ["kuis", "Kuis"], ["uh", "UH"], ["uts", "UTS"], ["uas", "UAS"], ["ujian", "Ujian lain"], ["presensi", "Presensi"]];

/** Atur bobot nilai akhir per kategori & KKM. */
function FormPengaturan({ mapelId, awal, onClose, onSaved }: { mapelId: number; awal: Pengaturan; onClose: () => void; onSaved: () => void }) {
    const { toast } = useToast();
    const [f, setF] = useState(awal);
    const total = KAT.reduce((a, [k]) => a + (f[k] || 0), 0);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { ok, data } = await kirim(`/api/lms/mapel/${mapelId}`, "PUT", { bobotTugas: f.tugas, bobotKuis: f.kuis, bobotUjian: f.ujian, bobotPresensi: f.presensi, bobotUH: f.uh, bobotUTS: f.uts, bobotUAS: f.uas, kkm: f.kkm, aturanRemedial: f.aturanRemedial ?? "maksKkm" });
        if (ok) { toast("Pengaturan nilai disimpan", "success"); onSaved(); } else toast(data.message || "Gagal", "error");
    };
    return (
        <Modal judul="Pengaturan Nilai Akhir" onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <p className="text-xs text-slate-500">Bobot tiap kategori (persen). Nilai akhir = rata-rata berbobot dari kategori yang sudah punya nilai. Biarkan semua 0 untuk rata-rata biasa semua nilai. UH/UTS/UAS = ujian mapel sesuai jenisnya (offline maupun CAT); Ujian lain = ujian mapel berjenis lainnya + ujian CAT sekolah. Presensi = persentase hadir.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {KAT.map(([k, l]) => (
                        <label key={k} className="block"><span className={labelClass}>{l} (%)</span>
                            <input type="number" min={0} max={100} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} required className={inputClass} />
                        </label>
                    ))}
                </div>
                <p className={`text-xs font-bold ${total === 0 || total === 100 ? "text-slate-500" : "text-amber-600"}`}>
                    Total bobot: {total}%{total !== 0 && total !== 100 && " — tidak harus 100, bobot dihitung relatif"}
                </p>
                <label className="block max-w-40"><span className={labelClass}>KKM (0 = tidak dipakai)</span>
                    <input type="number" min={0} max={100} value={f.kkm} onChange={(e) => setF({ ...f, kkm: Number(e.target.value) })} required className={inputClass} />
                </label>
                <label className="block"><span className={labelClass}>Nilai remedial yang masuk rapor</span>
                    <select value={f.aturanRemedial ?? "maksKkm"} onChange={(e) => setF({ ...f, aturanRemedial: e.target.value })} className={inputClass}>
                        {Object.entries(LABEL_ATURAN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <span className="text-[10px] text-slate-400">Susulan mengisi nilai yang kosong. Pengayaan tidak mengubah nilai.</span>
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Simpan</button>
                </div>
            </form>
        </Modal>
    );
}

function Tuntas({ v }: { v: boolean | null }) {
    if (v === null) return null;
    return v
        ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap">TUNTAS</span>
        : <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 whitespace-nowrap">BELUM TUNTAS</span>;
}

const warnaNilai = (persen: number) =>
    persen >= 85 ? "text-emerald-700" : persen >= 70 ? "text-sky-700" : persen >= 55 ? "text-amber-700" : "text-red-600";

function Sel({ v, maks, akhir }: { v: Nilai; maks: number; akhir?: number }) {
    if (akhir !== undefined) {
        return (
            <span title="Nilai asli → nilai yang dipakai setelah remedial/susulan" className="whitespace-nowrap">
                {v === null || typeof v !== "number" ? <span className="text-slate-300">–</span> : <span className="text-slate-400 line-through text-xs">{v}</span>}
                <span className={`ml-1 font-bold ${warnaNilai((akhir / maks) * 100)}`}>{akhir}</span>
            </span>
        );
    }
    if (v === null) return <span className="text-slate-300">–</span>;
    if (v === "na") return <span className="text-[10px] text-slate-300" title="Tugas tidak diberikan ke siswa ini">n/a</span>;
    if (v === "revisi") return <span className="text-[10px] font-bold text-orange-600" title="Dikembalikan untuk revisi">revisi</span>;
    if (v === "kumpul") return <span className="text-[10px] font-bold text-sky-600" title="Sudah dikumpulkan, belum dinilai">✓ kumpul</span>;
    return <span className={`font-bold ${warnaNilai((v / maks) * 100)}`}>{v}</span>;
}

/** Tab "Nilai" di halaman mapel: rekap nilai tugas & ujian. */
export function RekapNilai({ mapelId, semesterId }: { mapelId: number; semesterId?: number }) {
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [atur, setAtur] = useState(false);
    const [susulan, setSusulan] = useState<Kolom | null>(null);

    const muat = useCallback(() => fetch(`/api/lms/mapel/${mapelId}/nilai${semesterId ? `?semester=${semesterId}` : ""}`)
        .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })), [mapelId, semesterId]);

    useEffect(() => {
        let ignore = false;
        muat().then(({ ok, data }) => { if (!ignore) { if (ok) setD(data); else setError(data.message || "Gagal memuat nilai"); } });
        return () => { ignore = true; };
    }, [muat]);
    const refresh = () => muat().then(({ ok, data }) => { if (ok) setD(data); });

    if (error) return <p className="text-red-600 font-semibold">{error}</p>;
    if (!d) return <p className="text-slate-500">Memuat...</p>;

    const kelola = d.peran === "kelola";
    const pg = d.pengaturan;
    // Kolom komponen ditampilkan bila memakai bobot (kategori berbobot > 0)
    const katTampil = pg.berbobot ? KAT.filter(([k]) => pg[k] > 0) : [];
    const labelAkhir = pg.berbobot ? "Nilai Akhir" : "Rata-rata";
    const href = (k: Kolom) => (k.jenis === "ujian" ? null : `/kelas/${mapelId}/${k.jenis}/${k.id}`);
    const JENIS = { tugas: { label: "Tugas", huruf: "T", cls: "bg-amber-100 text-amber-700", teks: "text-amber-600" }, kuis: { label: "Kuis", huruf: "Q", cls: "bg-fuchsia-100 text-fuchsia-700", teks: "text-fuchsia-600" }, ujian: { label: "Ujian", huruf: "U", cls: "bg-emerald-100 text-emerald-700", teks: "text-emerald-600" } } as const;

    const unduhCsv = () => {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const out = [["No", "Nomor Peserta", "Nama", ...d.kolom.map((k) => esc(`${k.jenis === "ujian" ? labelUjian(k) : JENIS[k.jenis].label}: ${k.judul} (maks ${k.maks})`)),
            ...katTampil.map(([, l]) => `${l} (bobot ${pg[katTampil.find((x) => x[1] === l)![0]]}%)`), labelAkhir, ...(pg.kkm ? [`Tuntas (KKM ${pg.kkm})`] : [])].join(",")];
        d.baris.forEach((b, i) => {
            out.push([
                i + 1, esc(b.siswa.nomorPeserta), esc(b.siswa.nama),
                ...d.kolom.map((k) => { const v = b.nilai[k.kunci]; return v === null ? "" : v === "kumpul" ? "belum dinilai" : v === "revisi" ? "revisi" : v === "na" ? "-" : v; }),
                ...katTampil.map(([k]) => b.komponen[k] ?? ""),
                b.rataRata ?? "",
                ...(pg.kkm ? [b.tuntas === null ? "" : b.tuntas ? "Tuntas" : "Belum tuntas"] : []),
            ].join(","));
        });
        const blob = new Blob(["﻿" + out.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `rekap-nilai-${d.mapel.kelas}-${d.mapel.nama}.csv`.replace(/[^\w.-]+/g, "_");
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const pengaturanModal = atur && <FormPengaturan mapelId={mapelId} awal={{ tugas: pg.tugas, kuis: pg.kuis, uh: pg.uh ?? 0, uts: pg.uts ?? 0, uas: pg.uas ?? 0, ujian: pg.ujian, presensi: pg.presensi, kkm: pg.kkm, aturanRemedial: pg.aturanRemedial }} onClose={() => setAtur(false)} onSaved={() => { setAtur(false); refresh(); }} />;
    if (d.kolom.length === 0 && !(pg.presensi > 0 && kelola)) {
        return (
            <>
                <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada tugas, kuis, atau ujian untuk dinilai.</p>
                {pengaturanModal}
            </>
        );
    }

    // Siswa: daftar nilai miliknya
    if (!kelola) {
        const b = d.baris[0];
        return (
            <section className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                    <div className="flex-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{pg.berbobot ? "Nilai akhir saya" : "Rata-rata nilai saya"}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                            {pg.berbobot ? `Bobot: ${katTampil.map(([k, l]) => `${l} ${pg[k]}%`).join(", ")}. ` : "Dihitung dalam persen dari nilai maksimal. "}
                            Tugas yang lewat tenggat atau kuis yang ditutup tanpa dikerjakan dihitung 0.{pg.kkm > 0 && ` KKM ${pg.kkm}.`}
                        </p>
                        {katTampil.length > 0 && b && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {katTampil.map(([k, l]) => <span key={k} className="text-[11px] bg-slate-100 rounded-full px-2.5 py-1 text-slate-600">{l}: <b>{b.komponen[k] ?? "–"}</b></span>)}
                            </div>
                        )}
                    </div>
                    <div className="text-center">
                        <p className={`text-4xl font-black ${b && b.rataRata !== null ? warnaNilai(b.rataRata) : "text-slate-300"}`}>{b?.rataRata ?? "–"}</p>
                        {b && <Tuntas v={b.tuntas} />}
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                    {d.kolom.map((k) => {
                        const h = href(k);
                        const isi = (
                            <>
                                <span className={`shrink-0 w-9 h-9 rounded-lg font-black text-xs flex items-center justify-center ${JENIS[k.jenis].cls}`}>{JENIS[k.jenis].huruf}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block font-semibold text-slate-800 truncate">{k.judul}</span>
                                    <span className="block text-[11px] text-slate-400">{k.turunan && <b className="text-violet-600">{LABEL_SUSULAN[k.turunan.tipe]} · </b>}{k.jenis === "ujian" ? labelUjian(k) : JENIS[k.jenis].label} · maks {k.maks}</span>
                                </span>
                                <span className="text-lg"><Sel v={b?.nilai[k.kunci] ?? null} maks={k.maks} akhir={b?.akhir?.[k.kunci]} /></span>
                            </>
                        );
                        return h
                            ? <Link key={k.kunci} href={h} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">{isi}</Link>
                            : <div key={k.kunci} className="flex items-center gap-3 px-5 py-3">{isi}</div>;
                    })}
                </div>
            </section>
        );
    }

    // Pengelola: tabel siswa × tugas/ujian
    const ringkasan: [string, number | string][] = [
        ["Siswa", d.baris.length],
        ["Rata-rata kelas", d.ringkasan.rataKelas ?? "–"],
        ["Tertinggi", d.ringkasan.tertinggi ?? "–"],
        ["Terendah", d.ringkasan.terendah ?? "–"],
        ...(pg.kkm ? [[`Tuntas (KKM ${pg.kkm})`, `${d.ringkasan.tuntas}/${d.baris.length}`] as [string, string]] : []),
    ];
    return (
        <section className="space-y-4">
            <div className={`grid grid-cols-2 gap-3 ${ringkasan.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
                {ringkasan.map(([label, v]) => (
                    <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{v}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-xs text-slate-500">
                        Rata-rata dalam persen dari nilai maksimal; tugas lewat tenggat / kuis ditutup tanpa dikerjakan dihitung 0. Kuis = nilai tertinggi. <span className="text-sky-600 font-bold">✓ kumpul</span> = belum dinilai, <span className="text-slate-400">n/a</span> = tugas tidak diberikan ke siswa itu.
                    </p>
                    <button onClick={() => setAtur(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
                        Bobot & KKM{pg.berbobot ? `: ${katTampil.map(([k, l]) => `${l} ${pg[k]}%`).join(" · ")}` : ""}
                    </button>
                    <button onClick={unduhCsv} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700">Unduh CSV</button>
                </div>
                {d.baris.length === 0 ? (
                    <p className="p-8 text-center text-slate-400 italic">Belum ada siswa di kelas ini.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left w-8">No</th>
                                    <th className="px-3 py-2 text-left min-w-40 sticky left-0 bg-slate-50">Nama</th>
                                    {d.kolom.map((k) => {
                                        const h = href(k);
                                        const label = <span className="line-clamp-2 normal-case font-semibold">{k.judul}</span>;
                                        return (
                                            <th key={k.kunci} className="px-3 py-2 text-center min-w-24 align-bottom" title={k.judul}>
                                                <span className={`block text-[9px] font-black ${k.turunan ? "text-violet-600" : JENIS[k.jenis].teks}`}>{k.turunan && `${LABEL_SUSULAN[k.turunan.tipe]?.toUpperCase()} · `}{(k.jenis === "ujian" ? labelUjian(k) : JENIS[k.jenis].label).toUpperCase()}{!k.terbit && (k.mapelUjian ? " · BELUM DIUMUMKAN" : " · DRAF")}</span>
                                                {h ? <Link href={h} className="hover:text-indigo-700">{label}</Link> : label}
                                                <span className="block text-[9px] text-slate-400">maks {k.maks}</span>
                                                {!k.turunan && (k.jenis === "tugas" || k.mapelUjian) && (
                                                    <button onClick={() => setSusulan(k)} className="mt-1 text-[9px] font-bold text-violet-700 hover:underline normal-case">+ Remedial/Susulan</button>
                                                )}
                                            </th>
                                        );
                                    })}
                                    {katTampil.map(([k, l]) => <th key={k} className="px-3 py-2 text-center min-w-20 bg-indigo-50/60">{l}<span className="block text-[9px] text-slate-400">{pg[k]}%</span></th>)}
                                    <th className="px-3 py-2 text-center min-w-20">{labelAkhir}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {d.baris.map((b, i) => (
                                    <tr key={b.siswa.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                                        <td className="px-3 py-2 sticky left-0 bg-white">
                                            <p className="font-semibold text-slate-700">{b.siswa.nama}</p>
                                            <p className="font-mono text-[10px] text-slate-400">{b.siswa.nomorPeserta}</p>
                                        </td>
                                        {d.kolom.map((k) => <td key={k.kunci} className={`px-3 py-2 text-center ${k.turunan ? "bg-violet-50/40" : ""}`}><Sel v={b.nilai[k.kunci]} maks={k.maks} akhir={b.akhir?.[k.kunci]} /></td>)}
                                        {katTampil.map(([k]) => <td key={k} className="px-3 py-2 text-center text-slate-600 bg-indigo-50/30">{b.komponen[k] ?? <span className="text-slate-300">–</span>}</td>)}
                                        <td className="px-3 py-2 text-center">
                                            {b.rataRata === null ? <span className="text-slate-300">–</span> : <span className={`font-black ${warnaNilai(b.rataRata)}`}>{b.rataRata}</span>}
                                            <span className="block"><Tuntas v={b.tuntas} /></span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {pengaturanModal}
            {susulan && <FormSusulan kolom={susulan} d={d} onClose={() => setSusulan(null)} onSaved={() => { setSusulan(null); refresh(); }} />}
        </section>
    );
}

/** Buat remedial / pengayaan / susulan dari satu tugas atau ujian untuk siswa terpilih. */
function FormSusulan({ kolom, d, onClose, onSaved }: { kolom: Kolom; d: Data; onClose: () => void; onSaved: () => void }) {
    const { toast } = useToast();
    const kkm = d.pengaturan.kkm || 75;
    const persen = (b: Data["baris"][number]) => { const v = b.nilai[kolom.kunci]; return typeof v === "number" ? (v / kolom.maks) * 100 : null; };
    const usul = (tipe: string) => new Set(d.baris.filter((b) => {
        const p = persen(b);
        if (b.nilai[kolom.kunci] === "na") return false;
        return tipe === "susulan" ? b.nilai[kolom.kunci] === null : tipe === "remedial" ? p !== null && p < kkm : p !== null && p >= kkm;
    }).map((b) => b.siswa.id));
    const [tipe, setTipe] = useState("remedial");
    const [pilih, setPilih] = useState<Set<number>>(() => usul("remedial"));
    const [judul, setJudul] = useState("");
    const [waktu, setWaktu] = useState("");
    const [proses, setProses] = useState(false);
    const ganti = (t: string) => { setTipe(t); setPilih(usul(t)); };
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProses(true);
        const { ok, data } = await kirim("/api/lms/susulan", "POST", {
            kunci: kolom.kunci, tipe, siswa: [...pilih], judul,
            ...(kolom.jenis === "tugas" ? { tenggat: waktu ? new Date(waktu).toISOString() : null } : { tanggal: waktu ? new Date(waktu).toISOString() : null }),
        });
        setProses(false);
        if (!ok) return toast(data.message || "Gagal", "error");
        toast(data.message, "success");
        onSaved();
    };
    return (
        <Modal judul={`Remedial / Susulan · ${kolom.judul}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    {Object.entries(LABEL_SUSULAN).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => ganti(k)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${tipe === k ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700"}`}>{l}</button>
                    ))}
                </div>
                <p className="text-xs text-slate-500">
                    {tipe === "remedial" && `Usulan: siswa dengan nilai di bawah ${kkm}${d.pengaturan.kkm ? " (KKM)" : ""}. Nilai yang dipakai: ${LABEL_ATURAN[d.pengaturan.aturanRemedial ?? "maksKkm"].toLowerCase()}.`}
                    {tipe === "susulan" && "Usulan: siswa yang belum punya nilai. Nilai susulan mengisi nilai yang kosong."}
                    {tipe === "pengayaan" && `Usulan: siswa yang sudah mencapai ${kkm}. Nilai pengayaan dicatat tetapi tidak mengubah nilai.`}
                    {kolom.jenis === "tugas" ? " Tugas disalin (deskripsi, lampiran, rubrik) khusus untuk siswa terpilih." : kolom.mode === "cat" ? " Ujian CAT dibuat dengan soal yang sama (draf) — periksa lalu terbitkan dari tab Ujian." : " Ujian baru dibuat; isi nilainya di tab Ujian."}
                </p>
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {d.baris.map((b) => {
                        const v = b.nilai[kolom.kunci];
                        return (
                            <label key={b.siswa.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                                <input type="checkbox" checked={pilih.has(b.siswa.id)} disabled={v === "na"} onChange={() => setPilih((p) => { const n = new Set(p); if (n.has(b.siswa.id)) n.delete(b.siswa.id); else n.add(b.siswa.id); return n; })} />
                                <span className="flex-1">{b.siswa.nama}</span>
                                <Sel v={v} maks={kolom.maks} />
                            </label>
                        );
                    })}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label><span className={labelClass}>Judul (opsional)</span><input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={200} placeholder={`${LABEL_SUSULAN[tipe]} – ${kolom.judul}`} className={inputClass} /></label>
                    <label><span className={labelClass}>{kolom.jenis === "tugas" ? "Tenggat" : "Tanggal ujian"}</span><input type="datetime-local" value={waktu} onChange={(e) => setWaktu(e.target.value)} className={inputClass} /></label>
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button type="submit" disabled={proses || !pilih.size} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50">Buat untuk {pilih.size} siswa</button>
                </div>
            </form>
        </Modal>
    );
}
