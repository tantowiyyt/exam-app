"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DaftarPage() {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [password, setPassword] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedNP, setGeneratedNP] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDaftar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (password !== konfirmasi) {
      setError("Konfirmasi password tidak cocok!");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/daftar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setGeneratedNP(data.data.nomorPeserta);
        setSuccess(data.message);
      } else {
        setError(data.message || "Registrasi gagal.");
      }
    } catch {
      setError("Terjadi kesalahan sistem. Coba lagi nanti.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-indigo-50 to-slate-200 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900 flex items-center justify-center relative overflow-hidden p-4 font-sans transition-colors">
      <div className="absolute top-[-15%] left-[-10%] w-125 h-125 bg-indigo-400/20 dark:bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-150 h-150 bg-purple-400/15 dark:bg-purple-600/15 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle className="text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-300 dark:border-slate-700/50 rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-slate-200 dark:border-slate-700/50 rounded-4xl p-8 md:p-10 shadow-2xl shadow-indigo-200/20 dark:shadow-indigo-900/20 transition-colors">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-linear-to-tr from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white mb-1">
              Daftar Menjadi Peserta
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Buat akun untuk mengikuti ujian
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 dark:text-red-400 text-sm font-semibold px-4 py-3 rounded-xl mb-6 text-center animate-pulse">
              {error}
            </div>
          )}

          {success && generatedNP ? (
            <div className="text-center space-y-5">
              <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-xl p-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-emerald-500 dark:text-emerald-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-emerald-600 dark:text-emerald-400 font-bold text-sm mb-4">{success}</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-2">Nomor Peserta Anda:</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-300 font-mono tracking-widest bg-emerald-500/10 rounded-lg px-4 py-3 select-all cursor-pointer border border-emerald-500/30">
                  {generatedNP}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-3">Catat atau salin nomor di atas, ini adalah username Anda untuk login.</p>
              </div>
              <button
                onClick={() => router.push("/login")}
                className="w-full bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/25"
              >
                Login Sekarang
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedNP);
                }}
                className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold py-3 rounded-xl transition-all text-sm"
              >
                Salin Nomor Peserta
              </button>
            </div>
          ) : (
            <form onSubmit={handleDaftar} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Masukkan nama lengkap"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-white px-4 py-3.5 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-white px-4 py-3.5 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 font-mono text-sm tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">
                  Konfirmasi Password
                </label>
                <input
                  type="password"
                  required
                  value={konfirmasi}
                  onChange={(e) => setKonfirmasi(e.target.value)}
                  placeholder="Ulangi password"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-white px-4 py-3.5 rounded-xl outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 font-mono text-sm tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-4 rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/25 mt-4 disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Memproses...
                  </span>
                ) : (
                  "Daftar Sekarang"
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center border-t border-slate-200 dark:border-slate-800/60 pt-6 space-y-3">
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-1"
            >
              Sudah punya akun? Masuk di sini
            </Link>
            <Link
              href="/"
              className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1"
            >
              &larr; Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
