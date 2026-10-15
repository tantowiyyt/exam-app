"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

// Akun orang tua: memantau kehadiran, tugas, nilai, jadwal, dan rapor anaknya; bisa mengirim pesan ke guru & wali kelas.

interface Ortu { id: number; nomorPeserta: string; nama: string; noHp: string | null; anak: { id: number; nomorPeserta: string; nama: string; kelas: string }[] }
interface Dibuat { username: string; nama: string; anak: string; password: string }
const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const labelClass = "block text-xs font-bold text-slate-600 uppercase mb-1";
const KOSONG = { id: 0, username: "", nama: "", password: "", noHp: "", anak: "" };

export default function OrangTuaPage() {
    const { toast } = useToast();
    const [data, setData] = useState<{ orangTua: Ortu[]; kelas: { nama: string; tanpaOrtu: number }[] } | null>(null);
    const [cari, setCari] = useState("");
    const [form, setForm] = useState(KOSONG);
    const [massal, setMassal] = useState({ kelas: "", password: "acak" });
    const [dibuat, setDibuat] = useState<Dibuat[]>([]);
    const [versi, setVersi] = useState(0);

    useEffect(() => {
        let ignore = false;
        const t = setTimeout(() => fetch(`/api/admin/orangtua?q=${encodeURIComponent(cari)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setData(d); }), 200);
        return () => { ignore = true; clearTimeout(t); };
    }, [cari, versi]);

    const api = async (method: string, body?: unknown, query = "") => {
        const res = await fetch(`/api/admin/orangtua${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { toast(d.message || "Gagal", "error"); return null; }
        setVersi((v) => v + 1);
        return d;
    };
    const simpan = async (e: React.FormEvent) => {
        e.preventDefault();
        const anak = form.anak.split(/[\s,;]+/).filter(Boolean);
        const d = form.id
            ? await api("PUT", { id: form.id, nama: form.nama, noHp: form.noHp, anak, ...(form.password ? { password: form.password } : {}) })
            : await api("POST", { aksi: "buat", username: form.username, nama: form.nama, password: form.password, noHp: form.noHp, anak });
        if (d) { toast(form.id ? "Akun disimpan" : "Akun orang tua dibuat", "success"); setForm(KOSONG); }
    };
    const buatMassal = async () => {
        if (!massal.kelas) return;
        const d = await api("POST", { aksi: "massal", ...massal });
        if (d) { toast(d.message, "success"); setDibuat(d.dibuat); }
    };
    const unduh = () => {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const csv = ["Username,Nama,Anak,Password awal", ...dibuat.map((x) => [x.username, x.nama, x.anak, x.password].map(esc).join(","))].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        a.download = `akun-orang-tua-${massal.kelas}.csv`.replace(/[^\w.-]+/g, "_");
        a.click();
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Pengguna" judul="Akun Orang Tua" />
            <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <form onSubmit={simpan} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                        <h2 className="font-bold text-slate-800">{form.id ? "Edit Akun" : "Tambah Akun Orang Tua"}</h2>
                        {!form.id && <label className="block"><span className={labelClass}>Username</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required maxLength={50} className={inputClass} placeholder="mis. ortu-12345" /></label>}
                        <label className="block"><span className={labelClass}>Nama</span><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required maxLength={200} className={inputClass} placeholder="mis. Bapak Ahmad" /></label>
                        <label className="block"><span className={labelClass}>{form.id ? "Password baru (opsional)" : "Password"}</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!form.id} minLength={6} className={inputClass} autoComplete="new-password" /></label>
                        <label className="block"><span className={labelClass}>No. HP / WA</span><input value={form.noHp} onChange={(e) => setForm({ ...form, noHp: e.target.value })} className={inputClass} /></label>
                        <label className="block"><span className={labelClass}>NIS anak (pisahkan koma bila lebih dari satu)</span><input value={form.anak} onChange={(e) => setForm({ ...form, anak: e.target.value })} required className={`${inputClass} font-mono`} placeholder="12345, 12399" /></label>
                        <div className="flex gap-2">
                            <button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold">{form.id ? "Simpan" : "Tambah"}</button>
                            {form.id > 0 && <button type="button" onClick={() => setForm(KOSONG)} className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold">Batal</button>}
                        </div>
                    </form>
                    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                        <h2 className="font-bold text-slate-800">Buat Massal per Kelas</h2>
                        <p className="text-xs text-slate-500">Satu akun untuk setiap siswa yang belum punya akun orang tua. Username: <code>ortu-NIS</code>.</p>
                        <select value={massal.kelas} onChange={(e) => setMassal({ ...massal, kelas: e.target.value })} aria-label="Kelas" className={inputClass}>
                            <option value="">— pilih kelas —</option>
                            {data?.kelas.map((k) => <option key={k.nama} value={k.nama} disabled={!k.tanpaOrtu}>{k.nama} ({k.tanpaOrtu} siswa belum punya)</option>)}
                        </select>
                        <select value={massal.password} onChange={(e) => setMassal({ ...massal, password: e.target.value })} aria-label="Password awal" className={inputClass}>
                            <option value="acak">Password acak (unduh daftarnya)</option><option value="tanggal">Tanggal lahir anak (ddmmyyyy)</option><option value="nis">NIS anak</option>
                        </select>
                        <button onClick={buatMassal} disabled={!massal.kelas} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50">Buat Akun</button>
                        {dibuat.length > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm">
                                <p className="text-emerald-800 font-semibold">{dibuat.length} akun dibuat. Unduh daftar password sekarang — tidak bisa ditampilkan lagi.</p>
                                <button onClick={unduh} className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Unduh CSV</button>
                            </div>
                        )}
                    </section>
                </div>
                <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200">
                    <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                        <h2 className="font-bold text-slate-800 flex-1">Daftar Orang Tua ({data?.orangTua.length ?? 0})</h2>
                        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, NIS anak, kelas..." aria-label="Cari" className={`${inputClass} max-w-64`} />
                    </div>
                    <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                        {data?.orangTua.map((o) => (
                            <li key={o.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                                <span className="flex-1 min-w-48"><b className="text-slate-800">{o.nama}</b> <span className="font-mono text-xs text-slate-500">{o.nomorPeserta}</span>
                                    <span className="block text-xs text-slate-500">Anak: {o.anak.map((a) => `${a.nama} (${a.kelas || "-"})`).join(", ") || "—"}</span></span>
                                <button onClick={() => setForm({ id: o.id, username: o.nomorPeserta, nama: o.nama, password: "", noHp: o.noHp ?? "", anak: o.anak.map((a) => a.nomorPeserta).join(", ") })} className="text-xs font-bold text-amber-700 hover:underline">Edit</button>
                                <button onClick={() => confirm(`Hapus akun ${o.nama}?`) && api("DELETE", undefined, `?id=${o.id}`)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
                            </li>
                        ))}
                        {data && !data.orangTua.length && <li className="p-8 text-center text-slate-400 italic">Belum ada akun orang tua.</li>}
                    </ul>
                </section>
            </main>
        </div>
    );
}
