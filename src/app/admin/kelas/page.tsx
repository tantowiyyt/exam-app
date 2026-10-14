"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

interface Mapel {
    id: number;
    nama: string;
    deskripsi: string;
    guru: { id: number; nama: string } | null;
    _count: { materi: number; tugas: number; pengumuman: number; ujian: number };
}

interface Kelas {
    id: number;
    nama: string;
    keterangan: string;
    jumlahSiswa: number;
    mapel: Mapel[];
}

interface Data {
    kelas: Kelas[];
    guru: { id: number; nama: string; nomorPeserta: string }[];
    kelasBelumDibuat: { nama: string; jumlahSiswa: number }[];
}

const KOSONG_KELAS = { id: 0, nama: "", keterangan: "" };
const KOSONG_MAPEL = { id: 0, kelasId: 0, nama: "", guruId: "", deskripsi: "" };

async function muat(): Promise<Data | null> {
    const res = await fetch("/api/admin/kelas");
    return res.ok ? res.json() : null;
}

async function kirim(method: string, body?: unknown, query = "") {
    const res = await fetch(`/api/admin/kelas${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export default function KelasMapelPage() {
    const { toast } = useToast();
    const [data, setData] = useState<Data>({ kelas: [], guru: [], kelasBelumDibuat: [] });
    const [formKelas, setFormKelas] = useState(KOSONG_KELAS);
    const [formMapel, setFormMapel] = useState(KOSONG_MAPEL);
    const [cari, setCari] = useState("");
    const [tingkat, setTingkat] = useState("");
    // Kelas yang daftar mapelnya dibuka (default tertutup; saat mencari semua hasil terbuka)
    const [dibuka, setDibuka] = useState<Set<number>>(new Set());
    const toggleKelas = (id: number) => setDibuka((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const refresh = useCallback(async () => {
        const d = await muat();
        if (d) setData(d);
    }, []);

    useEffect(() => {
        let ignore = false;
        muat().then((d) => { if (!ignore && d) setData(d); });
        return () => { ignore = true; };
    }, []);

    const hasil = (ok: boolean, d: { message?: string }, sukses: string) => {
        toast(ok ? d.message || sukses : d.message || "Gagal", ok ? "success" : "error");
        if (ok) refresh();
        return ok;
    };

    const simpanKelas = async (e: React.FormEvent) => {
        e.preventDefault();
        const { ok, data: d } = await kirim(formKelas.id ? "PUT" : "POST", { jenis: "kelas", ...formKelas });
        if (hasil(ok, d, formKelas.id ? "Kelas diperbarui" : "Kelas dibuat")) setFormKelas(KOSONG_KELAS);
    };

    const simpanMapel = async (e: React.FormEvent) => {
        e.preventDefault();
        const { ok, data: d } = await kirim(formMapel.id ? "PUT" : "POST", { jenis: "mapel", ...formMapel, guruId: formMapel.guruId || null });
        if (hasil(ok, d, formMapel.id ? "Mapel diperbarui" : "Mapel ditambahkan")) {
            setDibuka((s) => new Set(s).add(formMapel.kelasId));
            setFormMapel(KOSONG_MAPEL);
        }
    };

    const hapus = async (jenis: "kelas" | "mapel", id: number, nama: string) => {
        if (!confirm(`Hapus ${jenis} "${nama}"?`)) return;
        const { ok, data: d } = await kirim("DELETE", undefined, `?jenis=${jenis}&id=${id}`);
        hasil(ok, d, "Dihapus");
    };

    const buatDariPeserta = async () => {
        const { ok, data: d } = await kirim("POST", { jenis: "kelasDariPeserta" });
        hasil(ok, d, "Kelas dibuat");
    };

    const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
    const labelClass = "block text-xs font-bold text-slate-600 uppercase mb-1";
    const kelasDipilih = data.kelas.find((k) => k.id === formMapel.kelasId);

    // Tingkat = kata pertama nama kelas (X, XI, XII, ...)
    const daftarTingkat = useMemo(() => [...new Set(data.kelas.map((k) => k.nama.split(" ")[0]))], [data.kelas]);
    const kelasTampil = useMemo(() => {
        const q = cari.trim().toLowerCase();
        return data.kelas
            .filter((k) => !tingkat || k.nama.split(" ")[0] === tingkat)
            .map((k) => {
                if (!q || `${k.nama} ${k.keterangan}`.toLowerCase().includes(q)) return k;
                // Cocok di mapel/guru: tampilkan hanya mapel yang cocok
                const mapel = k.mapel.filter((m) => `${m.nama} ${m.guru?.nama ?? ""}`.toLowerCase().includes(q));
                return mapel.length ? { ...k, mapel } : null;
            })
            .filter((k): k is Kelas => k !== null);
    }, [data.kelas, cari, tingkat]);

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <nav className="bg-linear-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex justify-between items-center shadow-md">
                <h1 className="text-xl font-black tracking-wider text-indigo-400">CAT SYSTEM <span className="text-white text-xs font-normal">| Kelas & Mapel (LMS)</span></h1>
                <div className="flex gap-2">
                    <Link href="/kelas" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold">Buka Ruang Belajar</Link>
                    <Link href="/admin" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold">&larr; Kembali</Link>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-8">
                {/* Form */}
                <div className="space-y-6">
                    <form onSubmit={simpanKelas} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                        <h2 className="text-lg font-bold text-slate-800">{formKelas.id ? "Edit Kelas" : "Tambah Kelas"}</h2>
                        <label className="block"><span className={labelClass}>Nama Kelas</span>
                            <input value={formKelas.nama} onChange={(e) => setFormKelas({ ...formKelas, nama: e.target.value })} required maxLength={50} className={inputClass} placeholder="mis. X IPA 1" />
                            <span className="text-[10px] text-slate-400">Harus sama persis dengan kolom Kelas pada data peserta.{formKelas.id ? " Mengganti nama ikut mengganti kelas peserta anggotanya." : ""}</span>
                        </label>
                        <label className="block"><span className={labelClass}>Keterangan (opsional)</span>
                            <input value={formKelas.keterangan} onChange={(e) => setFormKelas({ ...formKelas, keterangan: e.target.value })} maxLength={200} className={inputClass} placeholder="mis. Wali kelas: Bu Sari" />
                        </label>
                        <div className="flex gap-2">
                            <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold">{formKelas.id ? "Simpan" : "Tambah Kelas"}</button>
                            {formKelas.id > 0 && <button type="button" onClick={() => setFormKelas(KOSONG_KELAS)} className="bg-slate-300 hover:bg-slate-400 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">Batal</button>}
                        </div>
                    </form>

                    <form onSubmit={simpanMapel} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                        <h2 className="text-lg font-bold text-slate-800">{formMapel.id ? "Edit Mapel" : "Tambah Mapel"}</h2>
                        <label className="block"><span className={labelClass}>Kelas</span>
                            <select value={formMapel.kelasId || ""} onChange={(e) => setFormMapel({ ...formMapel, kelasId: Number(e.target.value) })} required disabled={!!formMapel.id} className={`${inputClass} disabled:bg-slate-50`}>
                                <option value="">— pilih kelas —</option>
                                {data.kelas.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                            </select>
                        </label>
                        <label className="block"><span className={labelClass}>Nama Mapel</span>
                            <input value={formMapel.nama} onChange={(e) => setFormMapel({ ...formMapel, nama: e.target.value })} required maxLength={100} className={inputClass} placeholder="mis. Matematika" />
                        </label>
                        <label className="block"><span className={labelClass}>Guru Pengampu</span>
                            <select value={formMapel.guruId} onChange={(e) => setFormMapel({ ...formMapel, guruId: e.target.value })} className={inputClass}>
                                <option value="">— belum ditentukan —</option>
                                {data.guru.map((g) => <option key={g.id} value={g.id}>{g.nama} ({g.nomorPeserta})</option>)}
                            </select>
                            {data.guru.length === 0 && (
                                <span className="text-[10px] text-amber-600">Belum ada akun guru. Buat di <Link href="/admin/akun" className="font-bold underline">Kelola Akun</Link> dengan role Guru.</span>
                            )}
                        </label>
                        <label className="block"><span className={labelClass}>Deskripsi (opsional)</span>
                            <textarea value={formMapel.deskripsi} onChange={(e) => setFormMapel({ ...formMapel, deskripsi: e.target.value })} rows={2} maxLength={1000} className={`${inputClass} resize-y`} />
                        </label>
                        {kelasDipilih && <p className="text-[11px] text-slate-500">Kelas {kelasDipilih.nama}: {kelasDipilih.jumlahSiswa} siswa.</p>}
                        <div className="flex gap-2">
                            <button type="submit" disabled={data.kelas.length === 0} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50">{formMapel.id ? "Simpan" : "Tambah Mapel"}</button>
                            {formMapel.id > 0 && <button type="button" onClick={() => setFormMapel(KOSONG_MAPEL)} className="bg-slate-300 hover:bg-slate-400 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">Batal</button>}
                        </div>
                    </form>
                </div>

                {/* Daftar */}
                <div className="lg:col-span-2 space-y-4">
                    {data.kelasBelumDibuat.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                            <p className="text-sm text-amber-800 flex-1">
                                <b>{data.kelasBelumDibuat.length} kelas</b> tertulis di data peserta tetapi belum dibuat:{" "}
                                {data.kelasBelumDibuat.map((k) => `${k.nama} (${k.jumlahSiswa})`).join(", ")}
                            </p>
                            <button onClick={buatDariPeserta} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold">Buat Semua</button>
                        </div>
                    )}

                    {data.kelas.length === 0 && (
                        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-400 italic">
                            Belum ada kelas. Tambah kelas lalu mapelnya; siswa otomatis menjadi anggota sesuai kolom Kelas di data peserta.
                        </div>
                    )}

                    {data.kelas.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-wrap items-center gap-2">
                            <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari kelas"
                                placeholder="Cari kelas, wali kelas, mapel, atau guru..." className={`${inputClass} flex-1 min-w-48`} />
                            {daftarTingkat.length > 1 && (
                                <div className="flex flex-wrap gap-1" role="group" aria-label="Filter tingkat">
                                    {["", ...daftarTingkat].map((t) => (
                                        <button key={t || "semua"} onClick={() => setTingkat(t)} aria-pressed={tingkat === t}
                                            className={`px-3 py-2 rounded-lg text-xs font-bold ${tingkat === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                            {t || "Semua"}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <span className="text-xs text-slate-500 w-full sm:w-auto">{kelasTampil.length} dari {data.kelas.length} kelas</span>
                            {!cari.trim() && kelasTampil.length > 0 && (
                                <button onClick={() => setDibuka(kelasTampil.every((k) => dibuka.has(k.id)) ? new Set() : new Set(kelasTampil.map((k) => k.id)))}
                                    className="text-xs font-bold text-indigo-600 hover:underline">
                                    {kelasTampil.every((k) => dibuka.has(k.id)) ? "Tutup semua" : "Buka semua"}
                                </button>
                            )}
                        </div>
                    )}
                    {data.kelas.length > 0 && kelasTampil.length === 0 && (
                        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 italic">Tidak ada kelas yang cocok.</div>
                    )}

                    {kelasTampil.map((k) => {
                        const terbuka = dibuka.has(k.id) || !!cari.trim();
                        const tanpaGuru = k.mapel.filter((m) => !m.guru).length;
                        return (
                        <section key={k.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <header className={`px-5 py-3 bg-slate-50 flex flex-wrap items-center gap-2 ${terbuka ? "border-b border-slate-200" : ""}`}>
                                <button onClick={() => toggleKelas(k.id)} aria-expanded={terbuka} disabled={!!cari.trim()}
                                    className="flex flex-wrap items-center gap-2 text-left disabled:cursor-default">
                                    <span aria-hidden className={`text-slate-400 text-xs transition-transform ${terbuka ? "rotate-90" : ""}`}>&#9654;</span>
                                    <h3 className="font-black text-slate-800 text-lg">{k.nama}</h3>
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-700">{k.jumlahSiswa} siswa</span>
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">{k.mapel.length} mapel</span>
                                    {tanpaGuru > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">{tanpaGuru} tanpa guru</span>}
                                    {k.keterangan && <span className="text-xs text-slate-500">· {k.keterangan}</span>}
                                </button>
                                <div className="ml-auto flex gap-1">
                                    <button onClick={() => setFormMapel({ ...KOSONG_MAPEL, kelasId: k.id })} className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-1 rounded-md">+ Mapel</button>
                                    <button onClick={() => setFormKelas({ id: k.id, nama: k.nama, keterangan: k.keterangan })} className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded-md">Edit</button>
                                    <button onClick={() => hapus("kelas", k.id, k.nama)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded-md">Hapus</button>
                                </div>
                            </header>
                            {!terbuka ? null : k.mapel.length === 0 ? (
                                <p className="px-5 py-4 text-sm text-slate-400 italic">Belum ada mapel.</p>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {k.mapel.map((m) => (
                                        <li key={m.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <Link href={`/kelas/${m.id}`} className="font-bold text-slate-800 hover:text-indigo-700">{m.nama}</Link>
                                                <p className="text-xs text-slate-500">
                                                    {m.guru ? m.guru.nama : <span className="text-amber-600">Guru belum ditentukan</span>}
                                                    {" · "}{m._count.materi} materi · {m._count.tugas} tugas · {m._count.pengumuman} pengumuman · {m._count.ujian} ujian
                                                </p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <button onClick={() => setFormMapel({ id: m.id, kelasId: k.id, nama: m.nama, guruId: m.guru ? String(m.guru.id) : "", deskripsi: m.deskripsi })}
                                                    className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded-md">Edit</button>
                                                <button onClick={() => hapus("mapel", m.id, m.nama)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded-md">Hapus</button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
