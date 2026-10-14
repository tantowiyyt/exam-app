"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { muatIdentitas, type Identitas } from "@/components/AppShell";

// Halaman depan publik: aplikasi LMS sekolah dengan modul ujian CAT (opsional).

const FITUR = [
    { judul: "Materi & Video", isi: "Guru membagikan materi, lampiran, dan video pembelajaran per mapel, dikelompokkan per topik.", ikon: "M4 6h16M4 12h16M4 18h10" },
    { judul: "Tugas & Penilaian", isi: "Kumpulkan tugas dengan lampiran, tenggat, revisi, dan penilaian berbasis rubrik.", ikon: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v15H6zM9 11h6M9 15h4" },
    { judul: "Kuis Online", isi: "Pilihan ganda, benar/salah, isian, dan esai dengan nilai otomatis dan batas waktu.", ikon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
    { judul: "Presensi", isi: "Presensi per pertemuan dengan kode atau QR, lengkap dengan rekap kehadiran.", ikon: "M5 13l4 4L19 7" },
    { judul: "Nilai & Kalender", isi: "Rekap nilai berbobot dengan KKM, kalender tenggat, dan notifikasi.", ikon: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
];
const FITUR_CAT = { judul: "Ujian CAT", isi: "Ujian berbasis komputer: bank soal, jadwal, timer server, monitoring pengawas, dan kartu ujian.", ikon: "M3 5h18v11H3zM8 21h8M12 16v5" };

export default function Beranda() {
    const [identitas, setIdentitas] = useState<Identitas | null>(null);

    useEffect(() => {
        let ignore = false;
        muatIdentitas().then((d) => { if (!ignore && d) { setIdentitas(d); document.title = d.namaSekolah ? `${d.namaAplikasi} · ${d.namaSekolah}` : d.namaAplikasi; } });
        return () => { ignore = true; };
    }, []);

    const nama = identitas?.namaAplikasi ?? "E-Learning";
    const fitur = identitas?.modulCat === false ? FITUR : [...FITUR, FITUR_CAT];

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
            <header className="bg-linear-to-r from-slate-900 to-indigo-950 text-white">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-indigo-500 font-black flex items-center justify-center shrink-0">{nama.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 leading-tight">
                        <span className="block font-black tracking-wide truncate">{nama}</span>
                        {identitas?.namaSekolah && <span className="block text-[11px] text-white/60 truncate">{identitas.namaSekolah}</span>}
                    </span>
                    <Link href="/login" className="ml-auto bg-white text-slate-900 hover:bg-indigo-50 font-bold text-sm px-5 py-2 rounded-lg">Masuk</Link>
                </div>
                <div className="max-w-6xl mx-auto px-4 pt-10 pb-16 md:pt-16 md:pb-24">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Ruang belajar digital</p>
                    <h1 className="text-3xl md:text-5xl font-black leading-tight mt-2 max-w-3xl">
                        Belajar, mengumpulkan tugas, dan ujian{identitas?.namaSekolah ? <> di <span className="text-indigo-300">{identitas.namaSekolah}</span></> : " dalam satu aplikasi"}.
                    </h1>
                    <p className="text-white/75 mt-4 max-w-2xl">Materi, tugas, kuis, presensi, dan nilai setiap mata pelajaran bisa diakses guru dan siswa dari komputer maupun HP.</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link href="/login" className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-indigo-900/40">Masuk ke {nama} &rarr;</Link>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 -mt-8 pb-16 w-full flex-1">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fitur.map((f) => (
                        <div key={f.judul} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={f.ikon} /></svg>
                            </span>
                            <h2 className="font-bold text-slate-800 mt-3">{f.judul}</h2>
                            <p className="text-sm text-slate-500 mt-1">{f.isi}</p>
                        </div>
                    ))}
                </div>
            </main>

            <footer className="border-t border-slate-200 bg-white">
                <div className="max-w-6xl mx-auto px-4 py-5 text-xs text-slate-400 flex flex-wrap gap-2 justify-between">
                    <span>{identitas?.namaSekolah || nama}</span>
                    <span>Akun dibuat oleh sekolah. Lupa password? Hubungi admin.</span>
                </div>
            </footer>
        </div>
    );
}
