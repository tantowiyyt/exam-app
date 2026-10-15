"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

// Impor siswa dari unduhan Dapodik (.xlsx/.csv): pratinjau dulu, lalu impor. Data siswa yang sudah ada diperbarui.

interface Hasil {
    jumlah: number; baru: number; diperbarui: number; dilewati: number;
    kelas: { nama: string; ada: boolean; jumlah: number }[];
    dikenali: string[]; peringatan: string[];
    contoh?: { nis: string; nisn: string; nama: string; jk: string | null; kelas: string; status: string }[];
    message?: string;
}
const LABEL_KOLOM: Record<string, string> = { nama: "Nama", nis: "NIPD/NIS", nisn: "NISN", jk: "JK", tempatLahir: "Tempat lahir", tanggalLahir: "Tanggal lahir", nik: "NIK", alamat: "Alamat", hp: "HP", email: "E-mail", kelas: "Rombel" };

export default function ImporDapodik() {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [password, setPassword] = useState("nisn");
    const [buatKelas, setBuatKelas] = useState(true);
    const [pratinjau, setPratinjau] = useState<Hasil | null>(null);
    const [selesai, setSelesai] = useState<Hasil | null>(null);
    const [proses, setProses] = useState(false);

    const kirim = async (mode: "pratinjau" | "impor") => {
        if (!file) return;
        setProses(true);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("mode", mode);
        fd.append("password", password);
        if (buatKelas) fd.append("buatKelas", "1");
        const res = await fetch("/api/admin/dapodik", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}));
        setProses(false);
        if (!res.ok) return toast(d.message || "Gagal membaca file", "error");
        if (mode === "pratinjau") { setPratinjau(d); setSelesai(null); } else { setSelesai(d); setPratinjau(null); toast(d.message, "success"); }
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Akademik" judul="Impor Siswa dari Dapodik" />
            <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                <section className="bg-white rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 space-y-1">
                    <p>1. Di aplikasi Dapodik, buka <b>Peserta Didik</b> → <b>Unduh</b> (Excel). File berisi kolom Nama, NIPD, JK, NISN, Tempat/Tanggal Lahir, NIK, Alamat, HP, E-mail, dan Rombel Saat Ini.</p>
                    <p>2. Unggah file di bawah, periksa pratinjau, lalu klik Impor. NIS di aplikasi = NIPD (bila kosong memakai NISN). Kelas = Rombel Saat Ini.</p>
                    <p>3. Siswa yang sudah ada (NIS atau NISN sama) hanya diperbarui datanya — password dan nilainya tidak berubah.</p>
                </section>
                <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <input type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPratinjau(null); setSelesai(null); }} className="block text-sm" aria-label="File Dapodik" />
                    <div className="flex flex-wrap gap-6">
                        <label className="text-sm font-semibold text-slate-700">Password awal siswa baru
                            <select value={password} onChange={(e) => setPassword(e.target.value)} className="block mt-1 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white">
                                <option value="nisn">NISN</option><option value="tanggal">Tanggal lahir (ddmmyyyy)</option><option value="nis">Sama dengan NIS</option>
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 self-end pb-2">
                            <input type="checkbox" checked={buatKelas} onChange={(e) => setBuatKelas(e.target.checked)} /> Buat kelas yang belum ada
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => kirim("pratinjau")} disabled={!file || proses} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold disabled:opacity-50">{proses && !pratinjau ? "Membaca..." : "Pratinjau"}</button>
                        {pratinjau && <button onClick={() => kirim("impor")} disabled={proses} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{proses ? "Mengimpor..." : `Impor ${pratinjau.baru + pratinjau.diperbarui} siswa`}</button>}
                    </div>
                </section>

                {(pratinjau || selesai) && (() => {
                    const h = (pratinjau ?? selesai)!;
                    return (
                        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                            {selesai && <p className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-sm font-semibold">{selesai.message}. <Link href="/admin/peserta" className="underline">Lihat daftar siswa</Link> · <Link href="/admin/kelas" className="underline">Atur kelas & wali</Link></p>}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {([["Baris siswa", h.jumlah], ["Siswa baru", h.baru], ["Diperbarui", h.diperbarui], ["Dilewati", h.dilewati]] as [string, number][]).map(([l, v]) => (
                                    <div key={l} className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-500">{l}</p><p className="text-2xl font-black text-slate-800">{v}</p></div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500">Kolom dikenali: {h.dikenali.map((k) => LABEL_KOLOM[k] ?? k).join(", ")}</p>
                            {h.peringatan.length > 0 && <ul className="text-xs text-amber-700 list-disc pl-5">{h.peringatan.map((p) => <li key={p}>{p}</li>)}</ul>}
                            <div className="flex flex-wrap gap-2">
                                {h.kelas.map((k) => <span key={k.nama} className={`text-xs font-bold px-2 py-1 rounded ${k.ada ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{k.nama} · {k.jumlah} siswa{k.ada ? "" : " · kelas baru"}</span>)}
                            </div>
                            {h.contoh && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">NIS</th><th className="p-2 text-left">NISN</th><th className="p-2 text-left">Nama</th><th className="p-2">JK</th><th className="p-2 text-left">Kelas</th><th className="p-2">Status</th></tr></thead>
                                        <tbody>{h.contoh.map((c) => (
                                            <tr key={c.nis} className="border-t border-slate-100"><td className="p-2 font-mono text-xs">{c.nis}</td><td className="p-2 font-mono text-xs">{c.nisn}</td><td className="p-2">{c.nama}</td><td className="p-2 text-center">{c.jk ?? "–"}</td><td className="p-2">{c.kelas}</td>
                                                <td className="p-2 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.status === "baru" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{c.status}</span></td></tr>
                                        ))}</tbody>
                                    </table>
                                    {h.jumlah > h.contoh.length && <p className="text-xs text-slate-400 mt-2">Menampilkan {h.contoh.length} dari {h.jumlah} baris.</p>}
                                </div>
                            )}
                        </section>
                    );
                })()}
            </main>
        </div>
    );
}
