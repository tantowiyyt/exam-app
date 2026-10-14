"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

// Pengaturan tahun ajaran & semester (admin). Satu semester aktif: tugas, kuis, presensi, & ujian baru masuk ke situ.

interface Semester { id: number; tahunAjaran: string; semester: string; aktif: boolean; label: string; jumlah: { tugas: number; kuis: number; presensi: number; ujian: number } }

async function kirim(method: string, body?: unknown, query = "") {
    const res = await fetch(`/api/admin/semester${query}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

/** Usulan semester berikutnya: Ganjil -> Genap tahun yang sama, Genap -> Ganjil tahun berikutnya. */
function berikutnya(list: Semester[]) {
    const a = list.find((s) => s.aktif) ?? list[0];
    if (!a) return { tahunAjaran: "", semester: "Ganjil" };
    if (a.semester === "Ganjil") return { tahunAjaran: a.tahunAjaran, semester: "Genap" };
    const [x, y] = a.tahunAjaran.split("/").map(Number);
    return { tahunAjaran: `${x + 1}/${y + 1}`, semester: "Ganjil" };
}

export function PengaturanSemester() {
    const { toast } = useToast();
    const [list, setList] = useState<Semester[] | null>(null);
    const [form, setForm] = useState<{ tahunAjaran: string; semester: string; aktif: boolean } | null>(null);

    const muat = useCallback(async () => {
        const { ok, data } = await kirim("GET");
        if (ok) setList(data.semester);
    }, []);
    useEffect(() => {
        let ignore = false;
        kirim("GET").then(({ ok, data }) => { if (!ignore && ok) setList(data.semester); });
        return () => { ignore = true; };
    }, []);

    const hasil = (ok: boolean, data: { message?: string }) => {
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) muat();
        return ok;
    };
    const aktifkan = async (s: Semester) => {
        if (!confirm(`Aktifkan semester ${s.label}? Tugas, kuis, presensi, dan ujian baru akan masuk ke semester ini, dan halaman mapel menampilkan semester ini secara bawaan.`)) return;
        const { ok, data } = await kirim("PUT", { id: s.id });
        hasil(ok, data);
    };
    const hapus = async (s: Semester) => {
        if (!confirm(`Hapus semester ${s.label}?`)) return;
        const { ok, data } = await kirim("DELETE", undefined, `?id=${s.id}`);
        hasil(ok, data);
    };
    const tambah = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        const { ok, data } = await kirim("POST", form);
        if (hasil(ok, data)) setForm(null);
    };

    const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800 flex-1">Tahun Ajaran & Semester</h2>
                {list && !form && <button type="button" onClick={() => setForm({ ...berikutnya(list), aktif: true })} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Semester</button>}
            </div>
            <p className="text-sm text-slate-500">Tugas, kuis, presensi, dan ujian yang dibuat tercatat di <b>semester aktif</b>. Saat semester berganti, aktifkan semester baru: halaman mapel dan rekap nilai mulai bersih, data semester lalu tetap tersimpan dan bisa dilihat lewat pilihan semester di halaman mapel.</p>

            {form && (
                <form onSubmit={tambah} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <label className="block"><span className="block text-xs font-bold text-slate-600 uppercase mb-1">Tahun ajaran</span>
                        <input value={form.tahunAjaran} onChange={(e) => setForm({ ...form, tahunAjaran: e.target.value })} required placeholder="2026/2027" pattern="\d{4}/\d{4}" className={inputClass} />
                    </label>
                    <label className="block"><span className="block text-xs font-bold text-slate-600 uppercase mb-1">Semester</span>
                        <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className={inputClass}>
                            <option>Ganjil</option><option>Genap</option>
                        </select>
                    </label>
                    <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Simpan</button>
                        <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    </div>
                    <label className="sm:col-span-3 flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} /> Langsung jadikan semester aktif
                    </label>
                </form>
            )}

            {!list ? <p className="text-sm text-slate-400">Memuat...</p> : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {list.map((s) => {
                        const isi = s.jumlah.tugas + s.jumlah.kuis + s.jumlah.presensi + s.jumlah.ujian;
                        return (
                            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-800">{s.label} {s.aktif && <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 align-middle">AKTIF</span>}</p>
                                    <p className="text-[11px] text-slate-400">{s.jumlah.tugas} tugas · {s.jumlah.kuis} kuis · {s.jumlah.presensi} pertemuan · {s.jumlah.ujian} ujian</p>
                                </div>
                                {!s.aktif && <button type="button" onClick={() => aktifkan(s)} className="text-xs font-bold px-3 py-1.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800">Aktifkan</button>}
                                {!s.aktif && isi === 0 && <button type="button" onClick={() => hapus(s)} className="text-xs font-bold px-3 py-1.5 rounded-md bg-red-100 hover:bg-red-200 text-red-800">Hapus</button>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
