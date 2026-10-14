"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useToast } from "@/components/Toast";
import { Modal, kirim, fmtWaktu, toLocalInput, inputClass, labelClass } from "./ui";

type Status = "H" | "I" | "S" | "A";
const STATUS: Record<Status, { label: string; cls: string; aktif: string }> = {
    H: { label: "Hadir", cls: "text-emerald-700", aktif: "bg-emerald-500 text-white border-emerald-500" },
    I: { label: "Izin", cls: "text-sky-700", aktif: "bg-sky-500 text-white border-sky-500" },
    S: { label: "Sakit", cls: "text-amber-700", aktif: "bg-amber-500 text-white border-amber-500" },
    A: { label: "Alpa", cls: "text-red-600", aktif: "bg-red-500 text-white border-red-500" },
};
const URUT: Status[] = ["H", "I", "S", "A"];

interface Rekap { H: number; I: number; S: number; A: number; persen: number | null }
interface CatatanSiswa { userId: number; status: Status; mandiri: boolean; keterangan: string; waktu: string }
interface SesiGuru { id: number; judul: string; tanggal: string; catatan: string; kode: string; dibuka: boolean; bukaSampai: string | null; presensi: CatatanSiswa[]; jumlah: Rekap }
interface SesiSiswa { id: number; judul: string; tanggal: string; catatan: string; dibuka: boolean; bukaSampai: string | null; saya: { status: Status; waktu: string; mandiri: boolean; keterangan: string } | null }
interface DataGuru { peran: "kelola"; siswa: { id: number; nomorPeserta: string; nama: string }[]; sesi: SesiGuru[]; rekap: (Rekap & { userId: number })[] }
interface DataSiswa { peran: "siswa"; sesi: SesiSiswa[]; rekap: Rekap }

const jam = (d: string | null) => (d ? new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "");

function Lencana({ s }: { s: Status | null | undefined }) {
    if (!s) return <span className="text-slate-300">–</span>;
    return <span className={`font-black ${STATUS[s].cls}`} title={STATUS[s].label}>{s}</span>;
}

/** Tab "Presensi" di halaman mapel. */
export function Presensi({ mapelId, kodeAwal, semesterId }: { mapelId: number; kodeAwal?: string; semesterId?: number }) {
    const [d, setD] = useState<DataGuru | DataSiswa | null>(null);
    const [error, setError] = useState("");

    const muat = useCallback(async () => {
        const res = await fetch(`/api/lms/presensi?mapelId=${mapelId}${semesterId ? `&semester=${semesterId}` : ""}`);
        const data = await res.json().catch(() => ({}));
        return res.ok ? { data } : { error: data.message || "Gagal memuat presensi" };
    }, [mapelId, semesterId]);
    const refresh = useCallback(async () => { const r = await muat(); if (r.data) setD(r.data); else setError(r.error); }, [muat]);

    useEffect(() => {
        let ignore = false;
        muat().then((r) => { if (!ignore) { if (r.data) setD(r.data); else setError(r.error); } });
        return () => { ignore = true; };
    }, [muat]);

    if (error) return <p className="text-red-600 font-semibold">{error}</p>;
    if (!d) return <p className="text-slate-500">Memuat...</p>;
    return d.peran === "kelola"
        ? <PresensiGuru mapelId={mapelId} d={d} refresh={refresh} />
        : <PresensiSiswa mapelId={mapelId} d={d} refresh={refresh} kodeAwal={kodeAwal} />;
}

// ---------- siswa ----------

function PresensiSiswa({ mapelId, d, refresh, kodeAwal }: { mapelId: number; d: DataSiswa; refresh: () => void; kodeAwal?: string }) {
    const { toast } = useToast();
    const [kode, setKode] = useState(kodeAwal ?? "");
    const [proses, setProses] = useState(false);
    const terbuka = d.sesi.filter((s) => s.dibuka && s.saya?.status !== "H");

    const hadir = async (e: React.FormEvent) => {
        e.preventDefault();
        setProses(true);
        const { ok, data } = await kirim("/api/lms/presensi", "POST", { aksi: "hadir", mapelId, kode });
        setProses(false);
        toast(data.message || (ok ? "Presensi tercatat" : "Gagal"), ok ? "success" : "error");
        if (ok) { setKode(""); refresh(); }
    };

    return (
        <section className="space-y-4">
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2.5 sm:p-4">
                    <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate"><span className="sm:hidden">Hadir %</span><span className="hidden sm:inline">Kehadiran</span></p>
                    <p className="text-lg sm:text-2xl font-black text-slate-800 mt-1">{d.rekap.persen === null ? "–" : `${d.rekap.persen}%`}</p>
                </div>
                {URUT.map((s) => (
                    <div key={s} className="bg-white rounded-xl border border-slate-200 shadow-sm p-2.5 sm:p-4">
                        <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">{STATUS[s].label}</p>
                        <p className={`text-lg sm:text-2xl font-black mt-1 ${STATUS[s].cls}`}>{d.rekap[s]}</p>
                    </div>
                ))}
            </div>

            {terbuka.length > 0 && (
                <form onSubmit={hadir} className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-5 space-y-3">
                    <p className="font-bold text-teal-900">Presensi dibuka: {terbuka.map((s) => s.judul).join(", ")}</p>
                    <p className="text-xs text-teal-800">Masukkan kode yang ditampilkan guru (atau pindai QR-nya) sebelum pukul {jam(terbuka[0].bukaSampai)}.</p>
                    <div className="flex gap-2 max-w-sm">
                        <input value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} required maxLength={10} placeholder="KODE" aria-label="Kode presensi"
                            className={`${inputClass} font-mono text-lg tracking-[0.3em] uppercase`} autoComplete="off" />
                        <button type="submit" disabled={proses} className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50">Hadir</button>
                    </div>
                </form>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                {d.sesi.length === 0 && <p className="p-8 text-center text-slate-400 italic">Belum ada pertemuan.</p>}
                {d.sesi.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{s.judul}</p>
                            <p className="text-[11px] text-slate-400">{fmtWaktu(s.tanggal)}{s.saya?.mandiri && ` · presensi mandiri ${jam(s.saya.waktu)}`}{s.saya?.keterangan && ` · ${s.saya.keterangan}`}</p>
                        </div>
                        {s.saya
                            ? <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS[s.saya.status].aktif}`}>{STATUS[s.saya.status].label}</span>
                            : <span className="text-xs text-slate-400">{s.dibuka ? "Belum presensi" : "Belum dicatat"}</span>}
                    </div>
                ))}
            </div>
        </section>
    );
}

// ---------- guru ----------

function PresensiGuru({ mapelId, d, refresh }: { mapelId: number; d: DataGuru; refresh: () => void }) {
    const { toast } = useToast();
    const [form, setForm] = useState<{ judul: string; tanggal: string; bukaMenit: number; catatan: string } | null>(null);
    const [isi, setIsi] = useState<SesiGuru | null>(null);
    const [kode, setKode] = useState<SesiGuru | null>(null);

    const buat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        const { ok, data } = await kirim("/api/lms/presensi", "POST", { ...form, mapelId, tanggal: new Date(form.tanggal).toISOString() });
        if (!ok) { toast(data.message || "Gagal", "error"); return; }
        toast("Pertemuan dibuat", "success");
        setForm(null);
        refresh();
        if (form.bukaMenit) setKode({ ...data.data, presensi: [], jumlah: { H: 0, I: 0, S: 0, A: 0, persen: null }, dibuka: true });
    };

    const hapus = async (s: SesiGuru) => {
        if (!confirm(`Hapus "${s.judul}" beserta seluruh catatan presensinya?`)) return;
        const { ok, data } = await kirim(`/api/lms/presensi?id=${s.id}`, "DELETE");
        toast(data.message || (ok ? "Dihapus" : "Gagal"), ok ? "success" : "error");
        if (ok) refresh();
    };

    const unduhCsv = () => {
        const urut = [...d.sesi].reverse();
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const out = [["No", "Nomor Peserta", "Nama", ...urut.map((s) => esc(`${s.judul} (${new Date(s.tanggal).toLocaleDateString("id-ID")})`)), "H", "I", "S", "A", "Kehadiran (%)"].join(",")];
        d.siswa.forEach((m, i) => {
            const r = d.rekap.find((x) => x.userId === m.id);
            out.push([i + 1, esc(m.nomorPeserta), esc(m.nama), ...urut.map((s) => s.presensi.find((p) => p.userId === m.id)?.status ?? ""), r?.H ?? 0, r?.I ?? 0, r?.S ?? 0, r?.A ?? 0, r?.persen ?? ""].join(","));
        });
        const blob = new Blob(["﻿" + out.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `presensi-${mapelId}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const kolom = [...d.sesi].reverse();
    return (
        <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setForm({ judul: `Pertemuan ${d.sesi.length + 1}`, tanggal: toLocalInput(new Date().toISOString()), bukaMenit: 15, catatan: "" })}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Pertemuan Baru</button>
                {d.sesi.length > 0 && <button onClick={unduhCsv} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold">Unduh Rekap CSV</button>}
            </div>

            {d.sesi.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada pertemuan. Buat pertemuan untuk mulai mencatat kehadiran.</p>}

            <div className="grid md:grid-cols-2 gap-3">
                {d.sesi.map((s) => (
                    <div key={s.id} className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${s.dibuka ? "border-teal-400" : "border-slate-200"}`}>
                        <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 truncate">{s.judul}</p>
                                <p className="text-[11px] text-slate-400">{fmtWaktu(s.tanggal)}</p>
                            </div>
                            {s.dibuka && <button onClick={() => setKode(s)} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-teal-600 text-white">Kode {s.kode} · s.d. {jam(s.bukaSampai)}</button>}
                        </div>
                        <div className="flex gap-3 text-xs">
                            {URUT.map((k) => <span key={k} className={STATUS[k].cls}><b>{s.jumlah[k]}</b> {STATUS[k].label}</span>)}
                            <span className="text-slate-400">{d.siswa.length - s.presensi.length > 0 && `${d.siswa.length - s.presensi.length} belum`}</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setIsi(s)} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Isi Presensi</button>
                            {!s.dibuka && <button onClick={() => setKode(s)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">Buka Presensi Mandiri</button>}
                            <button onClick={() => hapus(s)} className="ml-auto text-xs text-red-500 hover:text-red-700 font-bold">Hapus</button>
                        </div>
                    </div>
                ))}
            </div>

            {d.sesi.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <h3 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Rekap Kehadiran</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 min-w-40">Nama</th>
                                    {kolom.map((s, i) => <th key={s.id} className="px-2 py-2 text-center" title={`${s.judul} — ${fmtWaktu(s.tanggal)}`}>{i + 1}</th>)}
                                    {URUT.map((k) => <th key={k} className={`px-2 py-2 text-center ${STATUS[k].cls}`}>{k}</th>)}
                                    <th className="px-3 py-2 text-center">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {d.siswa.map((m) => {
                                    const r = d.rekap.find((x) => x.userId === m.id);
                                    return (
                                        <tr key={m.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 sticky left-0 bg-white font-semibold text-slate-700">{m.nama}</td>
                                            {kolom.map((s) => <td key={s.id} className="px-2 py-2 text-center"><Lencana s={s.presensi.find((p) => p.userId === m.id)?.status} /></td>)}
                                            {URUT.map((k) => <td key={k} className="px-2 py-2 text-center text-slate-600">{r?.[k] ?? 0}</td>)}
                                            <td className={`px-3 py-2 text-center font-black ${r?.persen !== null && r?.persen !== undefined && r.persen < 75 ? "text-red-600" : "text-slate-800"}`}>{r?.persen ?? "–"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="px-5 py-2 text-[11px] text-slate-400 border-t border-slate-100">Persentase = jumlah Hadir ÷ pertemuan yang sudah berlangsung. Kehadiran di bawah 75% ditandai merah.</p>
                </div>
            )}

            {form && (
                <Modal judul="Pertemuan Baru" onClose={() => setForm(null)}>
                    <form onSubmit={buat} className="space-y-4">
                        <label className="block"><span className={labelClass}>Judul</span>
                            <input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} required maxLength={200} className={inputClass} />
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <label className="block"><span className={labelClass}>Tanggal & jam</span>
                                <input type="datetime-local" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} required className={inputClass} />
                            </label>
                            <label className="block"><span className={labelClass}>Presensi mandiri siswa</span>
                                <select value={form.bukaMenit} onChange={(e) => setForm({ ...form, bukaMenit: Number(e.target.value) })} className={inputClass}>
                                    <option value={0}>Tidak — guru mengisi sendiri</option>
                                    {[10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>Dibuka {m} menit mulai sekarang</option>)}
                                </select>
                            </label>
                        </div>
                        <label className="block"><span className={labelClass}>Catatan / topik (opsional)</span>
                            <input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} maxLength={2000} className={inputClass} placeholder="mis. Bab 3 — Turunan" />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Simpan</button>
                        </div>
                    </form>
                </Modal>
            )}
            {isi && <LembarPresensi sesi={isi} siswa={d.siswa} onClose={() => setIsi(null)} onSaved={() => { setIsi(null); refresh(); }} />}
            {kode && <KodePresensi mapelId={mapelId} sesi={kode} onClose={() => setKode(null)} onChanged={(s) => { setKode(s); refresh(); }} />}
        </section>
    );
}

function LembarPresensi({ sesi, siswa, onClose, onSaved }: { sesi: SesiGuru; siswa: DataGuru["siswa"]; onClose: () => void; onSaved: () => void }) {
    const { toast } = useToast();
    const [isi, setIsi] = useState<Record<number, { status: Status | ""; keterangan: string }>>(() =>
        Object.fromEntries(siswa.map((m) => { const p = sesi.presensi.find((x) => x.userId === m.id); return [m.id, { status: p?.status ?? "", keterangan: p?.keterangan ?? "" }]; })));
    const [simpan, setSimpan] = useState(false);

    const semua = (status: Status, hanyaKosong: boolean) =>
        setIsi(Object.fromEntries(Object.entries(isi).map(([id, v]) => [id, hanyaKosong && v.status ? v : { ...v, status }])));

    const submit = async () => {
        setSimpan(true);
        const data = Object.entries(isi).map(([userId, v]) => ({ userId: Number(userId), ...v }));
        const { ok, data: res } = await kirim("/api/lms/presensi", "PUT", { aksi: "isi", id: sesi.id, data });
        setSimpan(false);
        if (ok) { toast("Presensi disimpan", "success"); onSaved(); } else toast(res.message || "Gagal menyimpan", "error");
    };

    return (
        <Modal judul={`${sesi.judul} — ${fmtWaktu(sesi.tanggal)}`} onClose={onClose}>
            <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <button onClick={() => semua("H", false)} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Semua Hadir</button>
                    <button onClick={() => semua("A", true)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">Yang kosong = Alpa</button>
                </div>
                {siswa.length === 0 && <p className="text-sm text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
                <ul className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
                    {siswa.map((m) => {
                        const v = isi[m.id];
                        const p = sesi.presensi.find((x) => x.userId === m.id);
                        return (
                            <li key={m.id} className="py-2 flex flex-wrap items-center gap-2">
                                <div className="flex-1 min-w-36">
                                    <p className="text-sm font-semibold text-slate-700">{m.nama}</p>
                                    {p?.mandiri && <p className="text-[10px] text-teal-600">presensi mandiri {jam(p.waktu)}</p>}
                                </div>
                                <div className="flex gap-1" role="radiogroup" aria-label={`Status ${m.nama}`}>
                                    {URUT.map((k) => (
                                        <button key={k} type="button" role="radio" aria-checked={v.status === k} title={STATUS[k].label}
                                            onClick={() => setIsi({ ...isi, [m.id]: { ...v, status: v.status === k ? "" : k } })}
                                            className={`w-9 h-9 rounded-lg border text-xs font-black ${v.status === k ? STATUS[k].aktif : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>{k}</button>
                                    ))}
                                </div>
                                {(v.status === "I" || v.status === "S") && (
                                    <input value={v.keterangan} onChange={(e) => setIsi({ ...isi, [m.id]: { ...v, keterangan: e.target.value } })} maxLength={300} placeholder="Keterangan"
                                        aria-label={`Keterangan ${m.nama}`} className="w-full sm:w-40 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                                )}
                            </li>
                        );
                    })}
                </ul>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button onClick={submit} disabled={simpan} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan Presensi"}</button>
                </div>
            </div>
        </Modal>
    );
}

function KodePresensi({ mapelId, sesi, onClose, onChanged }: { mapelId: number; sesi: SesiGuru; onClose: () => void; onChanged: (s: SesiGuru) => void }) {
    const { toast } = useToast();
    const [qr, setQr] = useState("");
    const [menit, setMenit] = useState(15);

    useEffect(() => {
        let ignore = false;
        QRCode.toDataURL(`${window.location.origin}/kelas/${mapelId}?tab=presensi&kode=${sesi.kode}`, { width: 280, margin: 1 }).then((u) => { if (!ignore) setQr(u); });
        return () => { ignore = true; };
    }, [mapelId, sesi.kode]);

    const ubah = async (extra: Record<string, unknown>) => {
        const { ok, data } = await kirim("/api/lms/presensi", "PUT", { aksi: "ubah", id: sesi.id, judul: sesi.judul, tanggal: sesi.tanggal, catatan: sesi.catatan, ...extra });
        if (!ok) { toast(data.message || "Gagal", "error"); return; }
        const s = data.data;
        onChanged({ ...sesi, kode: s.kode, bukaSampai: s.bukaSampai, dibuka: !!s.bukaSampai && new Date(s.bukaSampai) > new Date() });
    };

    return (
        <Modal judul={`Presensi Mandiri — ${sesi.judul}`} onClose={onClose}>
            <div className="text-center space-y-4">
                {sesi.dibuka ? (
                    <>
                        <p className="text-sm text-slate-600">Siswa membuka mapel ini → tab <b>Presensi</b> → masukkan kode, atau pindai QR.</p>
                        <p className="text-5xl sm:text-6xl font-black font-mono tracking-[0.25em] text-slate-800">{sesi.kode}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element -- QR berupa data URL */}
                        {qr && <img src={qr} alt={`QR presensi ${sesi.kode}`} className="mx-auto w-56 h-56" />}
                        <p className="text-xs text-teal-700 font-bold">Dibuka sampai pukul {jam(sesi.bukaSampai)}</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            <button onClick={() => ubah({ gantiKode: true })} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">Ganti Kode</button>
                            <button onClick={() => ubah({ bukaMenit: 0 })} className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold">Tutup Sekarang</button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-slate-600">Presensi mandiri sedang ditutup. Buka agar siswa bisa mengisi kehadiran sendiri dengan kode.</p>
                        <div className="flex justify-center items-center gap-2">
                            <select value={menit} onChange={(e) => setMenit(Number(e.target.value))} aria-label="Lama dibuka" className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
                                {[10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m} menit</option>)}
                            </select>
                            <button onClick={() => ubah({ bukaMenit: menit, gantiKode: true })} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">Buka Presensi</button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
