"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman, muatIdentitas } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { inputClass, labelClass, fmtTanggal } from "@/components/lms/ui";

// Jurnal / agenda mengajar. Guru: isi per pertemuan, siswa tidak hadir otomatis dari presensi. Admin: lihat semua & cetak (supervisi).

interface Jurnal {
    id: number; tanggal: string; jamKe: string; materi: string; kegiatan: string; catatan: string; sesiPresensiId: number | null;
    mapel: { id: number; nama: string; kelas: string }; guru: string;
    tidakHadir: { nama: string; status: string; keterangan: string }[];
}
interface Data {
    admin: boolean;
    semester: { id: number; label: string; aktif: boolean };
    semesterList: { id: number; label: string; aktif: boolean }[];
    mapelList: { id: number; nama: string; kelas: string }[];
    guruList: { id: number; nama: string }[];
    jurnal: Jurnal[];
}
const hariIniStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const KOSONG = { id: 0, mapelId: 0, tanggal: hariIniStr(), jamKe: "", materi: "", kegiatan: "", catatan: "" };
const STATUS: Record<string, string> = { I: "Izin", S: "Sakit", A: "Alpa" };

export default function HalamanJurnal() {
    const { toast } = useToast();
    const [f, setF] = useState({ semester: 0, guru: 0, mapelId: 0, dari: "", sampai: "" });
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [form, setForm] = useState<typeof KOSONG | null>(null);
    const [versi, setVersi] = useState(0);
    const [sekolah, setSekolah] = useState("");

    useEffect(() => { muatIdentitas().then((x) => x && setSekolah(x.namaSekolah)); }, []);
    useEffect(() => {
        let ignore = false;
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
        fetch(`/api/lms/jurnal?${p}`).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
            .then(({ ok, data }) => { if (!ignore) { if (ok) { setD(data); setError(""); } else setError(data.message || "Gagal memuat jurnal"); } });
        return () => { ignore = true; };
    }, [f, versi]);

    const simpan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        const res = await fetch("/api/lms/jurnal", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return toast(data.message || "Gagal menyimpan", "error");
        toast("Jurnal disimpan", "success");
        setForm(null);
        setVersi((v) => v + 1);
    };
    const hapus = async (id: number) => {
        if (!confirm("Hapus jurnal ini?")) return;
        const res = await fetch(`/api/lms/jurnal?id=${id}`, { method: "DELETE" });
        if (res.ok) setVersi((v) => v + 1); else toast("Gagal menghapus", "error");
    };
    const pilihGuru = d?.admin ? d.guruList.find((g) => g.id === f.guru)?.nama : "";

    return (
        <div className="min-h-screen bg-slate-100 font-sans print:bg-white">
            <HeaderHalaman grup="Akademik" judul="Jurnal Mengajar">
                {d && !d.admin && d.semester.aktif && <button onClick={() => setForm({ ...KOSONG, mapelId: d.mapelList[0]?.id ?? 0 })} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">+ Isi Jurnal</button>}
                <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Cetak</button>
            </HeaderHalaman>
            <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-4 print:p-0">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {d && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end print:hidden">
                        {d.semesterList.length > 1 && (
                            <label><span className={labelClass}>Semester</span>
                                <select value={d.semester.id} onChange={(e) => setF({ ...f, semester: Number(e.target.value) })} className={inputClass}>
                                    {d.semesterList.map((s) => <option key={s.id} value={s.id}>{s.label}{s.aktif ? " (aktif)" : ""}</option>)}
                                </select>
                            </label>
                        )}
                        {d.admin && (
                            <label><span className={labelClass}>Guru</span>
                                <select value={f.guru} onChange={(e) => setF({ ...f, guru: Number(e.target.value), mapelId: 0 })} className={inputClass}>
                                    <option value={0}>Semua guru</option>
                                    {d.guruList.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
                                </select>
                            </label>
                        )}
                        <label><span className={labelClass}>Mapel</span>
                            <select value={f.mapelId} onChange={(e) => setF({ ...f, mapelId: Number(e.target.value) })} className={`${inputClass} max-w-64`}>
                                <option value={0}>Semua mapel</option>
                                {d.mapelList.map((m) => <option key={m.id} value={m.id}>{m.kelas} · {m.nama}</option>)}
                            </select>
                        </label>
                        <label><span className={labelClass}>Dari</span><input type="date" value={f.dari} onChange={(e) => setF({ ...f, dari: e.target.value })} className={inputClass} /></label>
                        <label><span className={labelClass}>Sampai</span><input type="date" value={f.sampai} onChange={(e) => setF({ ...f, sampai: e.target.value })} className={inputClass} /></label>
                    </div>
                )}

                {form && d && (
                    <form onSubmit={simpan} className="bg-white rounded-2xl border border-indigo-200 p-4 grid md:grid-cols-4 gap-3 print:hidden">
                        <label className="md:col-span-2"><span className={labelClass}>Kelas · Mapel</span>
                            <select value={form.mapelId || ""} onChange={(e) => setForm({ ...form, mapelId: Number(e.target.value) })} required disabled={!!form.id} className={inputClass}>
                                <option value="">— pilih —</option>
                                {d.mapelList.map((m) => <option key={m.id} value={m.id}>{m.kelas} · {m.nama}</option>)}
                            </select>
                        </label>
                        <label><span className={labelClass}>Tanggal</span><input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} required className={inputClass} /></label>
                        <label><span className={labelClass}>Jam ke-</span><input value={form.jamKe} onChange={(e) => setForm({ ...form, jamKe: e.target.value })} maxLength={30} placeholder="mis. 1-2" className={inputClass} /></label>
                        <label className="md:col-span-2"><span className={labelClass}>Materi / Kompetensi</span><textarea value={form.materi} onChange={(e) => setForm({ ...form, materi: e.target.value })} required rows={2} maxLength={1000} className={inputClass} /></label>
                        <label className="md:col-span-2"><span className={labelClass}>Kegiatan Pembelajaran</span><textarea value={form.kegiatan} onChange={(e) => setForm({ ...form, kegiatan: e.target.value })} rows={2} maxLength={2000} className={inputClass} /></label>
                        <label className="md:col-span-4"><span className={labelClass}>Catatan / Kendala</span><input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} maxLength={2000} className={inputClass} /></label>
                        <div className="md:col-span-4 flex flex-wrap gap-2 items-center">
                            <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Simpan</button>
                            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold">Batal</button>
                            <span className="text-xs text-slate-500">Siswa tidak hadir diambil otomatis dari presensi mapel ini pada tanggal yang sama.</span>
                        </div>
                    </form>
                )}

                {d && (
                    <section className="bg-white rounded-2xl border border-slate-200 overflow-x-auto print:border-0">
                        <div className="hidden print:block text-center mb-3">
                            <p className="font-black text-lg uppercase">Jurnal Mengajar Guru</p>
                            <p className="text-sm">{sekolah}{sekolah && " · "}{d.semester.label}{pilihGuru ? ` · ${pilihGuru}` : ""}</p>
                        </div>
                        <table className="w-full text-sm print:text-[11px]">
                            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                                <tr>
                                    <th className="p-2 text-left">No</th><th className="p-2 text-left">Tanggal</th><th className="p-2">Jam</th><th className="p-2 text-left">Kelas · Mapel</th>
                                    {d.admin && <th className="p-2 text-left">Guru</th>}
                                    <th className="p-2 text-left">Materi</th><th className="p-2 text-left">Kegiatan</th><th className="p-2 text-left">Tidak Hadir</th><th className="p-2 text-left">Catatan</th>
                                    <th className="p-2 print:hidden"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {d.jurnal.map((j, i) => (
                                    <tr key={j.id} className="border-t border-slate-100 align-top">
                                        <td className="p-2">{i + 1}</td>
                                        <td className="p-2 whitespace-nowrap">{fmtTanggal(j.tanggal)}</td>
                                        <td className="p-2 text-center">{j.jamKe}</td>
                                        <td className="p-2">{j.mapel.kelas} · {j.mapel.nama}</td>
                                        {d.admin && <td className="p-2">{j.guru}</td>}
                                        <td className="p-2 whitespace-pre-wrap">{j.materi}</td>
                                        <td className="p-2 whitespace-pre-wrap">{j.kegiatan}</td>
                                        <td className="p-2 text-xs">
                                            {j.sesiPresensiId === null ? <i className="text-slate-400">belum ada presensi</i>
                                                : j.tidakHadir.length ? j.tidakHadir.map((t) => <span key={t.nama} className="block">{t.nama} ({STATUS[t.status] ?? t.status})</span>)
                                                    : <span className="text-emerald-700">Hadir semua</span>}
                                        </td>
                                        <td className="p-2 text-xs whitespace-pre-wrap">{j.catatan}</td>
                                        <td className="p-2 print:hidden whitespace-nowrap">
                                            <button onClick={() => setForm({ id: j.id, mapelId: j.mapel.id, tanggal: j.tanggal.slice(0, 10), jamKe: j.jamKe, materi: j.materi, kegiatan: j.kegiatan, catatan: j.catatan })} className="text-[11px] font-bold text-amber-700 hover:underline mr-2">Edit</button>
                                            <button onClick={() => hapus(j.id)} className="text-[11px] font-bold text-red-600 hover:underline">Hapus</button>
                                        </td>
                                    </tr>
                                ))}
                                {!d.jurnal.length && <tr><td colSpan={10} className="p-8 text-center text-slate-400 italic">Belum ada jurnal.</td></tr>}
                            </tbody>
                        </table>
                        <div className="hidden print:flex justify-between mt-10 text-sm px-8">
                            <div className="text-center">Mengetahui,<br />Kepala Sekolah<br /><br /><br /><br />(.............................)</div>
                            <div className="text-center">Guru Mata Pelajaran<br /><br /><br /><br /><br />({pilihGuru || d.jurnal[0]?.guru || "............................."})</div>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
