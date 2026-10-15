"use client";

import { useState } from "react";
import Link from "next/link";

// Lupa password: kode lewat email/WhatsApp (bila diaktifkan sekolah), atau permintaan ke wali kelas / admin.

const input = "w-full bg-slate-50 border border-slate-300 text-slate-800 px-4 py-3 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm";

export default function LupaPassword() {
    const [nis, setNis] = useState("");
    const [langkah, setLangkah] = useState<"awal" | "kode" | "wali" | "selesai">("awal");
    const [pesan, setPesan] = useState("");
    const [error, setError] = useState("");
    const [kode, setKode] = useState("");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [proses, setProses] = useState(false);

    const kirim = async (body: Record<string, string>) => {
        setProses(true);
        setError("");
        const res = await fetch("/api/lupa-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomorPeserta: nis, ...body }) });
        const d = await res.json().catch(() => ({}));
        setProses(false);
        return { ok: res.ok, d };
    };

    const minta = async (e: React.FormEvent) => {
        e.preventDefault();
        const { ok, d } = await kirim({ aksi: "minta" });
        if (!ok) return setError(d.message || "Gagal memproses");
        setPesan(d.message);
        setLangkah(d.langkah === "kode" ? "kode" : "wali");
    };

    const ganti = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pw !== pw2) return setError("Konfirmasi password tidak sama");
        const { ok, d } = await kirim({ aksi: "kode", kode, passwordBaru: pw });
        if (!ok) return setError(d.message || "Gagal mengganti password");
        setPesan(d.message);
        setLangkah("selesai");
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-8 space-y-5">
                <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-800">Lupa Password</h1>
                    <p className="text-sm text-slate-500 mt-1">Masukkan NIS / username Anda.</p>
                </div>
                {error && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">{error}</p>}
                {pesan && langkah !== "awal" && <p className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm px-4 py-3 rounded-xl">{pesan}</p>}

                {langkah === "awal" && (
                    <form onSubmit={minta} className="space-y-4">
                        <label className="block"><span className="block text-xs font-bold text-slate-500 uppercase mb-1">NIS / Username</span>
                            <input value={nis} onChange={(e) => setNis(e.target.value)} required className={`${input} font-mono`} autoFocus />
                        </label>
                        <button disabled={proses} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl disabled:opacity-60">{proses ? "Memproses..." : "Lanjut"}</button>
                    </form>
                )}

                {langkah === "kode" && (
                    <form onSubmit={ganti} className="space-y-4">
                        <label className="block"><span className="block text-xs font-bold text-slate-500 uppercase mb-1">Kode 6 angka</span>
                            <input value={kode} onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" className={`${input} font-mono tracking-[0.4em] text-center text-lg`} autoFocus />
                        </label>
                        <label className="block"><span className="block text-xs font-bold text-slate-500 uppercase mb-1">Password baru</span>
                            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} className={input} />
                        </label>
                        <label className="block"><span className="block text-xs font-bold text-slate-500 uppercase mb-1">Ulangi password baru</span>
                            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} className={input} />
                        </label>
                        <button disabled={proses} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl disabled:opacity-60">{proses ? "Memproses..." : "Ganti Password"}</button>
                        <button type="button" onClick={() => { setLangkah("awal"); setPesan(""); }} className="w-full text-xs font-bold text-slate-500 hover:text-indigo-600">Kirim ulang kode</button>
                    </form>
                )}

                {(langkah === "selesai" || langkah === "wali") && (
                    <Link href="/login" className="block text-center w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl">Kembali ke halaman masuk</Link>
                )}
                {langkah !== "selesai" && langkah !== "wali" && <Link href="/login" className="block text-center text-xs font-semibold text-slate-500 hover:text-indigo-600">&larr; Kembali ke halaman masuk</Link>}
            </div>
        </div>
    );
}
