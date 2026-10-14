"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface JawabanItem {
    soalId: number;
    pertanyaan: string;
    opsiA: string;
    opsiB: string;
    opsiC: string;
    opsiD: string;
    mataPelajaran: string;
    bobot: number;
    jawabanPeserta: string | null;
    jawabanBenar: string;
    benar: boolean;
}

interface Histori {
    waktuMulai: string;
    waktuSelesai: string;
    totalSoal: number;
    jumlahBenar: number;
    jumlahSalah: number;
    nilaiAkhir: number;
    skorPerMapel: Record<string, number> | null;
}

export default function ReviewJawabanPage() {
    const router = useRouter();
    const [jawaban, setJawaban] = useState<JawabanItem[]>([]);
    const [histori, setHistori] = useState<Histori | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterMapel, setFilterMapel] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "benar" | "salah">("all");

    useEffect(() => {
        const fetchReview = async () => {
            try {
                const res = await fetch("/api/ujian/review");
                if (res.ok) {
                    const data = await res.json();
                    setJawaban(data.jawaban);
                    setHistori(data.histori);
                } else {
                    router.push("/dashboard");
                }
            } catch {
                router.push("/dashboard");
            } finally {
                setLoading(false);
            }
        };
        fetchReview();
    }, [router]);

    const filteredJawaban = jawaban.filter((j) => {
        const matchMapel = !filterMapel || j.mataPelajaran === filterMapel;
        const matchStatus =
            filterStatus === "all" ||
            (filterStatus === "benar" && j.benar) ||
            (filterStatus === "salah" && !j.benar);
        return matchMapel && matchStatus;
    });

    const getOpsiClass = (opsi: string, jawabanPeserta: string | null, jawabanBenar: string) => {
        if (opsi === jawabanBenar) return "bg-emerald-100 border-emerald-300 text-emerald-800 font-bold";
        if (opsi === jawabanPeserta && opsi !== jawabanBenar) return "bg-red-100 border-red-300 text-red-800 font-bold line-through";
        return "bg-white border-slate-200 text-slate-600";
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Memuat data review...</div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12">
            <nav className="bg-linear-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex justify-between items-center shadow-md">
                <h1 className="text-xl font-black tracking-wider text-indigo-400">CAT SYSTEM <span className="text-white text-xs font-normal">| Review Jawaban</span></h1>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all">&larr; Dashboard</Link>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {/* Ringkasan */}
                {histori && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">Ringkasan Ujian</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 bg-slate-50 rounded-xl">
                                <div className="text-2xl font-black text-slate-800">{histori.totalSoal}</div>
                                <div className="text-xs text-slate-500 font-bold">Total Soal</div>
                            </div>
                            <div className="text-center p-3 bg-emerald-50 rounded-xl">
                                <div className="text-2xl font-black text-emerald-600">{histori.jumlahBenar}</div>
                                <div className="text-xs text-emerald-600 font-bold">Benar</div>
                            </div>
                            <div className="text-center p-3 bg-red-50 rounded-xl">
                                <div className="text-2xl font-black text-red-600">{histori.jumlahSalah}</div>
                                <div className="text-xs text-red-600 font-bold">Salah</div>
                            </div>
                            <div className="text-center p-3 bg-indigo-50 rounded-xl">
                                <div className="text-2xl font-black text-indigo-600">{histori.nilaiAkhir}</div>
                                <div className="text-xs text-indigo-600 font-bold">Nilai Akhir</div>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-3">
                            Dikerjakan: {new Date(histori.waktuMulai).toLocaleString("id-ID")} - {new Date(histori.waktuSelesai).toLocaleString("id-ID")}
                        </p>
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-3">
                    <select value={filterMapel} onChange={(e) => setFilterMapel(e.target.value)}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                        <option value="">Semua Mata Pelajaran</option>
                        <option value="TIK">TIK</option>
                        <option value="Matematika">Matematika</option>
                        <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                        <option value="Pengetahuan Umum">Pengetahuan Umum</option>
                    </select>
                    <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                        {(["all", "benar", "salah"] as const).map((status) => (
                            <button key={status} onClick={() => setFilterStatus(status)}
                                className={`px-3 py-1.5 text-xs font-bold transition-all ${filterStatus === status ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                                {status === "all" ? "Semua" : status === "benar" ? "Benar" : "Salah"}
                            </button>
                        ))}
                    </div>
                    <span className="text-sm text-slate-500 self-center">{filteredJawaban.length} soal</span>
                </div>

                {/* Jawaban List */}
                <div className="space-y-4">
                    {filteredJawaban.map((item, index) => (
                        <div key={item.soalId} className={`bg-white p-6 rounded-2xl shadow-sm border ${item.benar ? "border-emerald-200" : "border-red-200"}`}>
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div className="flex items-center gap-2">
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${item.benar ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                        {item.benar ? "\u2713" : "\u2717"}
                                    </span>
                                    <div>
                                        <span className="text-xs font-bold text-slate-400">Soal {index + 1}</span>
                                        <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded ${item.mataPelajaran === "TIK" ? "bg-blue-100 text-blue-700" : item.mataPelajaran === "Matematika" ? "bg-purple-100 text-purple-700" : item.mataPelajaran === "Bahasa Indonesia" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                            {item.mataPelajaran}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-slate-400">Jawaban Anda: </span>
                                    <span className={`text-sm font-bold ${item.benar ? "text-emerald-600" : "text-red-600"}`}>
                                        {item.jawabanPeserta || "-"}
                                    </span>
                                </div>
                            </div>

                            <h3 className="text-sm font-bold text-slate-800 mb-3 leading-relaxed">{item.pertanyaan}</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {(["A", "B", "C", "D"] as const).map((opt) => (
                                    <div key={opt} className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm ${getOpsiClass(opt, item.jawabanPeserta, item.jawabanBenar)}`}>
                                        <span className="font-bold w-5">{opt}.</span>
                                        <span className="flex-1">{item[`opsi${opt}` as keyof JawabanItem] as string}</span>
                                        {opt === item.jawabanBenar && <span className="text-emerald-600 font-bold">&#10003;</span>}
                                        {opt === item.jawabanPeserta && opt !== item.jawabanBenar && <span className="text-red-600 font-bold">&#10007;</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
