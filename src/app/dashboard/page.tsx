"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Pengaturan {
    durasiMenit: number;
    jadwalMulai: string | null;
    jadwalSelesai: string | null;
}

interface HistoriUjian {
    waktuMulai: string;
    waktuSelesai: string;
    totalSoal: number;
    jumlahBenar: number;
    jumlahSalah: number;
    nilaiAkhir: number;
    skorPerMapel: Record<string, number> | null;
}

export default function ParticipantDashboard() {
    const [userData, setUserData] = useState<{ nama: string; nomorPeserta: string; role: string; sudahUjian?: boolean; profilLengkap?: boolean; ruang?: string; sesi?: string; tanggalUjian?: string; foto?: string } | null>(null);
    const [pengaturan, setPengaturan] = useState<Pengaturan | null>(null);
    const [histori, setHistori] = useState<HistoriUjian | null>(null);
    const [showTutorial, setShowTutorial] = useState(false);
    const [tutorialDone, setTutorialDone] = useState(false);
    const [countdown, setCountdown] = useState("");
    const router = useRouter();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/me");
                if (res.ok) {
                    const data = await res.json();
                    setUserData(data);
                    if (data.role === "PESERTA" && !data.profilLengkap) {
                        router.push("/profile?lanjut=ujian");
                        return;
                    }
                } else {
                    router.push("/login");
                }
            } catch {
                router.push("/login");
            }
        };
        fetchUser();

        const fetchPengaturan = async () => {
            try {
                const res = await fetch("/api/pengaturan");
                if (res.ok) {
                    const data = await res.json();
                    setPengaturan(data);
                }
            } catch {}
        };
        fetchPengaturan();

        const fetchHistori = async () => {
            try {
                const res = await fetch("/api/ujian/history");
                if (res.ok) {
                    const data = await res.json();
                    if (data.sudahUjian && data.histori) {
                        setHistori(data.histori);
                    }
                }
            } catch {}
        };
        fetchHistori();
    }, [router]);

    // Countdown timer
    useEffect(() => {
        if (!pengaturan?.jadwalMulai) return;

        const updateCountdown = () => {
            const now = new Date();
            const mulai = new Date(pengaturan.jadwalMulai!);
            const selesai = pengaturan.jadwalSelesai ? new Date(pengaturan.jadwalSelesai) : null;

            if (now >= mulai && selesai && now <= selesai) {
                const diff = selesai.getTime() - now.getTime();
                const jam = Math.floor(diff / 3600000);
                const menit = Math.floor((diff % 3600000) / 60000);
                const detik = Math.floor((diff % 60000) / 1000);
                setCountdown(`${jam.toString().padStart(2, '0')}:${menit.toString().padStart(2, '0')}:${detik.toString().padStart(2, '0')}`);
            } else if (now < mulai) {
                const diff = mulai.getTime() - now.getTime();
                const jam = Math.floor(diff / 3600000);
                const menit = Math.floor((diff % 3600000) / 60000);
                const detik = Math.floor((diff % 60000) / 1000);
                setCountdown(`Mulai dalam ${jam}j ${menit}m ${detik}d`);
            } else {
                setCountdown("Selesai");
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [pengaturan]);


    if (!userData) return <div className="p-6 text-center">Loading...</div>;
    const selesai = userData.role === "PESERTA" && !!userData.sudahUjian;

    return (
        <div className="min-h-screen bg-linear-to-b from-slate-50 to-slate-100 p-6 flex flex-col items-center justify-center font-sans relative">

            {/* Modal Tutorial */}
            {showTutorial && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-slate-100">
                        <h2 className="text-2xl font-bold bg-linear-to-r from-slate-900 to-blue-950 bg-clip-text text-transparent mb-4">Tata Cara Penggunaan Aplikasi</h2>
                        <div className="space-y-3 text-slate-600 mb-8 bg-linear-to-b from-slate-50 to-blue-50/30 p-6 rounded-2xl border border-blue-100/50 text-sm">
                            <p>1. Waktu ujian akan mulai berjalan secara otomatis setelah Anda menekan tombol <b>Mulai Ujian</b>.</p>
                            <p>2. Pilih salah satu jawaban yang dianggap paling benar dengan mengklik opsi yang tersedia.</p>
                            <p>3. Anda dapat menggunakan tombol nomor untuk melompat antar soal.</p>
                            <p>4. Urutan soal yang Anda terima akan diacak secara sistem komputer.</p>
                        </div>
                        <button onClick={() => { setShowTutorial(false); setTutorialDone(true); }} className="w-full py-4 bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all">
                            Saya Mengerti & Telah Membaca
                        </button>
                    </div>
                </div>
            )}

            <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">
                {/* Header Identitas Bergradasi */}
                <div className="p-8 bg-linear-to-r from-blue-950 via-indigo-900 to-slate-900 text-white flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left relative">
                    <div className="w-32 h-40 bg-white/10 border-2 border-dashed border-white/30 rounded-2xl flex items-center justify-center shrink-0 relative overflow-hidden">
                        {userData.foto ? (
                            <img src={userData.foto} alt="Foto" className="w-full h-full object-cover" />
                        ) : (
                            <svg className="w-16 h-16 text-white/40" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        )}
                    </div>

                    <div className="flex-1 space-y-2">
                        <p className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest bg-white/10 inline-block px-3 py-1 rounded-full border border-white/10">Peserta Ujian CAT</p>
                        <h1 className="text-3xl font-black tracking-tight uppercase">{userData.nama}</h1>
                        <div className="text-slate-300 font-medium grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 pt-3 text-sm border-t border-white/10 mt-2">
                            <p><span className="text-white/50">No. Peserta:</span> {userData.nomorPeserta}</p>
                            <p><span className="text-white/50">Ruang:</span> {userData.ruang || 'Belum diatur'}</p>
                            <p><span className="text-white/50">Sesi:</span> {userData.sesi ? `Sesi ${userData.sesi}` : 'Belum diatur'}</p>
                            <p><span className="text-white/50">Tanggal:</span> {userData.tanggalUjian || 'Belum diatur'}</p>
                        </div>
                    </div>
                </div>

                {/* Area Card Menu */}
                <div className="p-8 bg-slate-50/50 grid sm:grid-cols-2 gap-6 border-t border-slate-100">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col text-center">
                        <h3 className="font-bold text-lg text-slate-800 mb-2">Tutorial Ujian</h3>
                        <p className="text-sm text-slate-500 mb-6 flex-1">Pelajari simulasi tata cara pengerjaan serta navigasi sistem ujian dengan seksama.</p>
                        <button onClick={() => setShowTutorial(true)} className="w-full py-3 bg-linear-to-r from-slate-800 to-slate-900 text-white rounded-xl font-bold">
                            Buka Tutorial
                        </button>
                    </div>

                    <div className={`p-6 rounded-2xl border shadow-sm flex flex-col text-center ${tutorialDone ? 'bg-white border-emerald-400' : 'bg-slate-100 opacity-75'}`}>
                        <h3 className="font-bold text-lg text-slate-800 mb-2">Mulai Ujian</h3>
                        {pengaturan?.jadwalMulai && (
                            <div className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                countdown === "Selesai" ? 'bg-red-50 text-red-700 border-red-200' :
                                countdown.startsWith("Mulai") ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                                {countdown}
                            </div>
                        )}
                        <p className="text-sm text-slate-500 mb-6 flex-1">
                            {selesai ? 'Anda sudah menyelesaikan ujian. Lihat hasil dan review jawaban Anda.' : tutorialDone ? 'Sesi ujian telah divalidasi. Anda siap mengerjakan sekarang.' : 'Tombol akan terbuka setelah Anda menyelesaikan tutorial.'}
                        </p>
                        {selesai ? (
                            <button onClick={() => router.push("/ujian/review")}
                                className="w-full py-3 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg">
                                Lihat Review Jawaban
                            </button>
                        ) : (
                            <button onClick={() => router.push("/ujian")} disabled={!tutorialDone}
                                className={`w-full py-3 rounded-xl font-bold ${tutorialDone ? 'bg-linear-to-r from-emerald-500 to-teal-600 text-white shadow-lg' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                                {tutorialDone ? 'Mulai Sekarang' : 'Terkunci'}
                            </button>
                        )}
                    </div>


                    {histori && (
                        <div className="sm:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-6 bg-linear-to-r from-indigo-600 to-purple-600 text-white">
                                <h3 className="font-bold text-lg">Riwayat Ujian Saya</h3>
                                <p className="text-indigo-200 text-xs mt-1">Hasil ujian terakhir Anda</p>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                                        <p className="text-2xl font-black text-indigo-600">{histori.nilaiAkhir}</p>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Nilai Akhir</p>
                                    </div>
                                    <div className="text-center p-3 bg-emerald-50 rounded-xl">
                                        <p className="text-2xl font-black text-emerald-600">{histori.jumlahBenar}</p>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Benar</p>
                                    </div>
                                    <div className="text-center p-3 bg-red-50 rounded-xl">
                                        <p className="text-2xl font-black text-red-500">{histori.jumlahSalah}</p>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Salah</p>
                                    </div>
                                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                                        <p className="text-2xl font-black text-slate-700">{histori.totalSoal}</p>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Total Soal</p>
                                    </div>
                                </div>

                                {histori.skorPerMapel && Object.keys(histori.skorPerMapel).length > 0 && (
                                    <div className="mb-5">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Skor per Mata Pelajaran</p>
                                        <div className="space-y-2">
                                            {Object.entries(histori.skorPerMapel).map(([mapel, nilai]) => (
                                                <div key={mapel} className="flex items-center gap-3">
                                                    <span className="text-sm text-slate-600 w-32 shrink-0 truncate">{mapel}</span>
                                                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${nilai >= 75 ? 'bg-emerald-500' : nilai >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                            style={{ width: `${nilai}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-700 w-12 text-right">{nilai}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Link href="/ujian/review" className="flex-1 py-3 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold text-center hover:from-indigo-600 hover:to-purple-700 transition-all">
                                        Review Jawaban
                                    </Link>
                                    <div className="flex-1 text-center text-xs text-slate-400 flex flex-col justify-center">
                                        <p>Dikerjakan: {new Date(histori.waktuMulai).toLocaleString('id-ID')}</p>
                                        <p>Selesai: {new Date(histori.waktuSelesai).toLocaleString('id-ID')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
