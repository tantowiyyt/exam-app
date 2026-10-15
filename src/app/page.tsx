"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { muatIdentitas, type Identitas } from "@/components/AppShell";

// Halaman depan publik: aplikasi LMS sekolah dengan modul ujian CAT (opsional).

const FITUR = [
    { judul: "Materi & Video", isi: "Guru membagikan materi, lampiran, dan video pembelajaran per mapel, dikelompokkan per topik/bab.", ikon: "M4 6h16M4 12h16M4 18h10" },
    { judul: "Tugas & Penilaian", isi: "Kumpulkan tugas dengan lampiran, tenggat, revisi, rubrik, serta remedial dan pengayaan.", ikon: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v15H6zM9 11h6M9 15h4" },
    { judul: "Kuis & Ujian Mapel", isi: "Pilihan ganda, isian, esai — bisa bergambar, beraudio, dan berumus — dengan nilai otomatis.", ikon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
    { judul: "Presensi & Jadwal", isi: "Presensi per pertemuan dengan kode/QR, jadwal pelajaran mingguan, dan kalender kegiatan.", ikon: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
    { judul: "Nilai & Rapor", isi: "Rekap nilai berbobot dengan KKM dan rapor Kurikulum Merdeka siap cetak; ekspor ke e-Rapor.", ikon: "M4 20V10m6 10V4m6 16v-7m6 7v-11" },
    { judul: "Administrasi Guru", isi: "Jurnal mengajar untuk supervisi, wali kelas, impor data siswa dari Dapodik.", ikon: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7" },
    { judul: "Pemberitahuan", isi: "Lonceng di aplikasi dan (opsional) WhatsApp/email untuk tugas, pengumuman, dan jadwal ujian.", ikon: "M4 5h16v11H8l-4 4z" },
];
const FITUR_CAT = { judul: "Modul Ujian CAT", isi: "Ujian sekolah berbasis komputer: bank soal, jadwal per kelas, timer server, monitoring pengawas, berita acara, dan kartu ujian.", ikon: "M3 5h18v11H3zM8 21h8M12 16v5", modul: true };

export default function Beranda() {
    const [identitas, setIdentitas] = useState<Identitas | null>(null);

    useEffect(() => {
        let ignore = false;
        muatIdentitas().then((d) => { if (!ignore && d) { setIdentitas(d); document.title = d.namaSekolah ? `${d.namaAplikasi} · ${d.namaSekolah}` : d.namaAplikasi; } });
        return () => { ignore = true; };
    }, []);

    const nama = identitas?.namaAplikasi ?? "E-Learning";
    const fitur: { judul: string; isi: string; ikon: string; modul?: boolean }[] = identitas?.modulCat === false ? FITUR : [...FITUR, FITUR_CAT];

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
                    <p className="text-white/75 mt-4 max-w-2xl">Materi, tugas, kuis, presensi, nilai, dan rapor setiap mata pelajaran bisa diakses guru dan siswa dari komputer maupun HP{identitas?.modulCat === false ? "" : " — termasuk ujian sekolah berbasis komputer"}.</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link href="/login" className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-indigo-900/40">Masuk ke {nama} &rarr;</Link>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 -mt-8 pb-16 w-full flex-1">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {fitur.map((f) => (
                        <div key={f.judul} className={`rounded-2xl border shadow-sm p-5 ${f.modul ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200"}`}>
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.modul ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"}`}>
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={f.ikon} /></svg>
                            </span>
                            <h2 className="font-bold text-slate-800 mt-3">{f.judul}{f.modul && <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-indigo-600 border border-indigo-200">modul</span>}</h2>
                            <p className="text-sm text-slate-500 mt-1">{f.isi}</p>
                        </div>
                    ))}
                </div>
            </main>

            <footer className="border-t border-slate-200 bg-white">
                <div className="max-w-6xl mx-auto px-4 py-5 text-xs text-slate-400 flex flex-wrap gap-2 justify-between">
                    <span>{identitas?.namaSekolah || nama}</span>
                    <span>Akun dibuat oleh sekolah. Lupa password? <Link href="/lupa-password" className="font-semibold text-indigo-500 hover:underline">Reset di sini</Link>.</span>
                </div>
            </footer>
        </div>
    );
}
