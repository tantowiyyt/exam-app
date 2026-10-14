"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function GantiPasswordPage() {
  const [passwordLama, setPasswordLama] = useState("");
  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [kembali, setKembali] = useState("/dashboard");

  useEffect(() => {
    let ignore = false;
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((me) => {
      if (ignore) return;
      if (me?.role === "ADMIN") setKembali("/admin");
      else if (me?.role === "PENGAWAS") setKembali("/admin/monitoring");
    }).catch(() => {});
    return () => { ignore = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (passwordBaru !== konfirmasi) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwordLama, passwordBaru }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setPasswordLama("");
        setPasswordBaru("");
        setKonfirmasi("");
      } else {
        setError(data.message || "Gagal mengubah password.");
      }
    } catch {
      setError("Terjadi kesalahan koneksi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-white dark:bg-slate-950/50 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-3 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm";

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-indigo-50 to-slate-200 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900 flex items-center justify-center p-4 font-sans transition-colors">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle className="text-slate-400 hover:text-slate-600 dark:hover:text-white bg-white/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700/50 rounded-full" />
      </div>

      <div className="w-full max-w-md bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-3xl p-8 shadow-xl">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white mb-1">Ganti Password</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Gunakan minimal 6 karakter yang sulit ditebak.</p>

        {error && <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 text-sm">{error}</div>}
        {success && <div role="status" className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pw-lama" className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Password Lama</label>
            <input id="pw-lama" type="password" autoComplete="current-password" required value={passwordLama} onChange={(e) => setPasswordLama(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pw-baru" className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Password Baru</label>
            <input id="pw-baru" type="password" autoComplete="new-password" required minLength={6} value={passwordBaru} onChange={(e) => setPasswordBaru(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="pw-konfirmasi" className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">Konfirmasi Password Baru</label>
            <input id="pw-konfirmasi" type="password" autoComplete="new-password" required minLength={6} value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} className={inputClass} />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all disabled:opacity-50">
            {loading ? "Menyimpan..." : "Simpan Password"}
          </button>
        </form>

        <Link href={kembali} className="block text-center text-sm text-slate-500 hover:text-indigo-600 mt-6">&larr; Kembali</Link>
      </div>
    </div>
  );
}
