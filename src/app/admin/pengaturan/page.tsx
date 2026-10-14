"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";
import { PengaturanSemester } from "@/components/Semester";

// Pengaturan identitas aplikasi: nama aplikasi, nama & alamat sekolah, logo, modul ujian CAT.
// Disimpan di tabel PengaturanAplikasi (kunci instansi.*), dipakai juga untuk kop kartu ujian.

interface Instansi { namaAplikasi: string; modulCat: string; namaInstansi: string; alamat: string; kota: string; logo: string; [k: string]: string }

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const labelClass = "block text-xs font-bold text-slate-600 uppercase mb-1";

export default function PengaturanPage() {
    const { toast } = useToast();
    const [d, setD] = useState<Instansi | null>(null);
    const [simpan, setSimpan] = useState(false);

    useEffect(() => {
        let ignore = false;
        fetch("/api/admin/instansi").then((r) => (r.ok ? r.json() : null)).then((x) => { if (!ignore && x) setD(x); });
        return () => { ignore = true; };
    }, []);

    const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !d) return;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) { setD({ ...d, logo: data.url }); toast("Logo diunggah. Klik Simpan untuk menerapkan.", "success"); }
        else toast(data.message || "Gagal mengunggah logo", "error");
        e.target.value = "";
    };

    const kirim = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!d) return;
        setSimpan(true);
        const res = await fetch("/api/admin/instansi", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ namaAplikasi: d.namaAplikasi, modulCat: d.modulCat, namaInstansi: d.namaInstansi, alamat: d.alamat, kota: d.kota, logo: d.logo }),
        });
        const data = await res.json().catch(() => ({}));
        setSimpan(false);
        if (res.ok) {
            toast("Pengaturan disimpan", "success");
            // Menu & nama aplikasi di kerangka dimuat sekali per halaman: muat ulang agar langsung terlihat
            setTimeout(() => window.location.reload(), 600);
        } else toast(data.message || "Gagal menyimpan", "error");
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Sistem" judul="Pengaturan" />
            <main className="max-w-3xl mx-auto p-4 md:p-8">
                {!d ? <p className="text-slate-500">Memuat...</p> : (
                    <form onSubmit={kirim} className="space-y-6">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <h2 className="text-lg font-bold text-slate-800">Identitas Aplikasi</h2>
                            <label className="block"><span className={labelClass}>Nama Aplikasi</span>
                                <input value={d.namaAplikasi} onChange={(e) => setD({ ...d, namaAplikasi: e.target.value })} required maxLength={60} placeholder="mis. E-Learning SMAN 1" className={inputClass} />
                                <span className="text-[11px] text-slate-400">Tampil di pojok kiri atas semua halaman.</span>
                            </label>
                            <label className="block"><span className={labelClass}>Nama Sekolah / Instansi</span>
                                <input value={d.namaInstansi} onChange={(e) => setD({ ...d, namaInstansi: e.target.value })} maxLength={200} className={inputClass} />
                                <span className="text-[11px] text-slate-400">Tampil di bawah nama aplikasi dan di kop kartu ujian.</span>
                            </label>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label className="block"><span className={labelClass}>Alamat</span>
                                    <input value={d.alamat} onChange={(e) => setD({ ...d, alamat: e.target.value })} maxLength={300} className={inputClass} />
                                </label>
                                <label className="block"><span className={labelClass}>Kota</span>
                                    <input value={d.kota} onChange={(e) => setD({ ...d, kota: e.target.value })} maxLength={100} className={inputClass} />
                                </label>
                            </div>
                            <div>
                                <span className={labelClass}>Logo</span>
                                <div className="flex items-center gap-3">
                                    {d.logo
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={d.logo} alt="Logo" className="h-14 w-14 object-contain border border-slate-200 rounded-lg bg-white" />
                                        : <span className="h-14 w-14 rounded-lg bg-indigo-500 text-white font-black text-xl flex items-center justify-center">{(d.namaAplikasi || "E").charAt(0).toUpperCase()}</span>}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} className="text-xs" aria-label="Unggah logo" />
                                    {d.logo && <button type="button" onClick={() => setD({ ...d, logo: "" })} className="text-red-600 text-xs font-bold">Hapus</button>}
                                </div>
                            </div>
                        </section>

                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
                            <h2 className="text-lg font-bold text-slate-800">Modul Ujian CAT</h2>
                            <p className="text-sm text-slate-500">Ujian berbasis komputer (bank soal, ujian terjadwal, monitoring, kartu ujian). Bila sekolah hanya memakai ujian offline/nilai manual dan kuis, modul ini bisa disembunyikan.</p>
                            <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Modul ujian CAT">
                                {[
                                    { v: "aktif", judul: "Aktif", ket: "Menu Ujian CAT tampil; siswa melihat banner ujian yang sedang berlangsung." },
                                    { v: "nonaktif", judul: "Nonaktif", ket: "Menu & banner Ujian CAT disembunyikan. Data ujian tetap tersimpan." },
                                ].map((o) => (
                                    <label key={o.v} className={`block rounded-xl border-2 p-4 cursor-pointer ${d.modulCat === o.v ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                                        <span className="flex items-center gap-2 font-bold text-slate-800">
                                            <input type="radio" name="modulCat" value={o.v} checked={d.modulCat === o.v} onChange={() => setD({ ...d, modulCat: o.v })} />
                                            {o.judul}
                                        </span>
                                        <span className="block text-xs text-slate-500 mt-1">{o.ket}</span>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <div className="flex justify-end">
                            <button type="submit" disabled={simpan} className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan Pengaturan"}</button>
                        </div>
                    </form>
                )}
                <div className="mt-6"><PengaturanSemester /></div>
            </main>
        </div>
    );
}
