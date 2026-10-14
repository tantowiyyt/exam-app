"use client";

import { useRouter } from "next/navigation";

export default function OfflinePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl">!</div>
        <h2 className="text-xl font-bold text-slate-800">Anda Sedang Offline</h2>
        <p className="text-sm text-slate-500">Koneksi internet terputus. Pastikan jaringan Anda aktif dan coba lagi.</p>
        <div className="space-y-2 pt-4">
          <button
            onClick={() => router.refresh()}
            className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all"
          >
            Coba Lagi
          </button>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-all"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    </div>
  );
}
