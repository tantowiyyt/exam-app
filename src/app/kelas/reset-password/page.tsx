"use client";

import { useCallback, useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { fmtWaktu, inputClass } from "@/components/lms/ui";

// Wali kelas / admin: tangani permintaan reset password dari halaman Lupa Password, atau reset langsung siswa perwalian.

interface Data {
    admin: boolean;
    kelasWalian: string[];
    permintaan: { id: number; createdAt: string; user: { id: number; nomorPeserta: string; nama: string; role: string; kelas: string } }[];
    siswa: { id: number; nomorPeserta: string; nama: string; kelas: string }[];
}

export default function ResetPassword() {
    const { toast: showToast } = useToast();
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [hasil, setHasil] = useState<{ nama: string; nomorPeserta: string; password: string } | null>(null);
    const [cari, setCari] = useState("");

    const muat = useCallback(async () => {
        const res = await fetch("/api/lms/reset-password");
        const data = await res.json().catch(() => ({}));
        if (res.ok) { setD(data); setError(""); } else setError(data.message || "Gagal memuat");
    }, []);
    useEffect(() => {
        let ignore = false;
        fetch("/api/lms/reset-password").then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
            .then(({ ok, data }) => { if (!ignore) { if (ok) setD(data); else setError(data.message || "Gagal memuat"); } });
        return () => { ignore = true; };
    }, []);

    const aksi = async (body: Record<string, unknown>, konfirmasi?: string) => {
        if (konfirmasi && !confirm(konfirmasi)) return;
        const res = await fetch("/api/lms/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return showToast(data.message || "Gagal", "error");
        if (data.password) setHasil({ ...data.user, password: data.password });
        else showToast(data.message, "success");
        muat();
    };

    const siswa = (d?.siswa ?? []).filter((s) => !cari || `${s.nama} ${s.nomorPeserta}`.toLowerCase().includes(cari.toLowerCase()));

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Akun" judul="Reset Password" />
            <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {!d && !error && <p className="text-slate-500">Memuat...</p>}
                {hasil && (
                    <div role="status" className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5">
                        <p className="text-sm text-emerald-900">Password <b>{hasil.nama}</b> ({hasil.nomorPeserta}) direset. Berikan password sementara ini dan minta segera menggantinya lewat menu Ganti Password:</p>
                        <p className="mt-2 text-2xl font-black font-mono tracking-widest text-emerald-800 select-all">{hasil.password}</p>
                        <button onClick={() => setHasil(null)} className="mt-3 text-xs font-bold text-emerald-700 hover:underline">Tutup</button>
                    </div>
                )}
                {d && (
                    <>
                        {!d.admin && !d.kelasWalian.length && (
                            <p className="bg-white rounded-2xl border border-slate-200 p-6 text-slate-500 text-sm">Anda belum ditetapkan sebagai wali kelas. Permintaan reset password siswa ditangani wali kelasnya atau admin.</p>
                        )}
                        <section className="bg-white rounded-2xl border border-slate-200">
                            <h2 className="font-bold text-slate-800 p-4 border-b border-slate-100">Permintaan Reset ({d.permintaan.length})</h2>
                            <ul className="divide-y divide-slate-100">
                                {d.permintaan.map((p) => (
                                    <li key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                                        <span className="flex-1 min-w-0"><b className="text-slate-800">{p.user.nama}</b> <span className="text-slate-500 font-mono">{p.user.nomorPeserta}</span>
                                            <span className="block text-xs text-slate-500">{p.user.role === "PESERTA" ? p.user.kelas || "tanpa kelas" : p.user.role} · diminta {fmtWaktu(p.createdAt)}</span></span>
                                        <button onClick={() => aksi({ permintaanId: p.id })} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Reset Password</button>
                                        <button onClick={() => aksi({ permintaanId: p.id, aksi: "tolak" }, "Tutup permintaan tanpa mereset password?")} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold">Abaikan</button>
                                    </li>
                                ))}
                                {!d.permintaan.length && <li className="p-6 text-center text-slate-400 italic text-sm">Tidak ada permintaan.</li>}
                            </ul>
                        </section>
                        {d.kelasWalian.length > 0 && (
                            <section className="bg-white rounded-2xl border border-slate-200">
                                <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
                                    <h2 className="font-bold text-slate-800 flex-1">Siswa Perwalian · {d.kelasWalian.join(", ")}</h2>
                                    <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari siswa..." aria-label="Cari siswa" className={`${inputClass} max-w-56`} />
                                </div>
                                <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
                                    {siswa.map((s) => (
                                        <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                            <span className="flex-1 min-w-0 truncate">{s.nama} <span className="text-slate-500 font-mono text-xs">{s.nomorPeserta}</span></span>
                                            <button onClick={() => aksi({ userId: s.id }, `Reset password ${s.nama}?`)} className="px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold">Reset</button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        {d.admin && <p className="text-xs text-slate-500">Admin juga bisa mereset password lewat menu Siswa dan Guru &amp; Staf.</p>}
                    </>
                )}
            </main>
        </div>
    );
}
