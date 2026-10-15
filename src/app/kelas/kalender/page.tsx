"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LmsNav } from "@/components/lms/ui";

type Jenis = "tugas" | "kuis" | "presensi" | "ujian" | "terbit";
interface Acara { id: string; jenis: Jenis; judul: string; waktu: string; mapel: string; href: string; selesai?: boolean }

const WARNA: Record<Jenis, { label: string; chip: string; titik: string }> = {
    tugas: { label: "Tenggat tugas", chip: "bg-amber-100 text-amber-800", titik: "bg-amber-500" },
    kuis: { label: "Kuis", chip: "bg-fuchsia-100 text-fuchsia-800", titik: "bg-fuchsia-500" },
    presensi: { label: "Pertemuan", chip: "bg-teal-100 text-teal-800", titik: "bg-teal-500" },
    ujian: { label: "Ujian", chip: "bg-indigo-100 text-indigo-800", titik: "bg-indigo-500" },
    terbit: { label: "Terbit terjadwal", chip: "bg-sky-100 text-sky-800", titik: "bg-sky-500" },
};
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const kunciTgl = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const jam = (s: string) => new Date(s).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

/** Kotak tanggal satu bulan (mulai Senin), 6 minggu. */
function gridBulan(tahun: number, bulan: number) {
    const awal = new Date(tahun, bulan, 1);
    const geser = (awal.getDay() + 6) % 7;
    const mulai = new Date(tahun, bulan, 1 - geser);
    return Array.from({ length: 42 }, (_, i) => new Date(mulai.getFullYear(), mulai.getMonth(), mulai.getDate() + i));
}

export default function Kalender() {
    const hariIni = new Date();
    const [bulan, setBulan] = useState({ tahun: hariIni.getFullYear(), bulan: hariIni.getMonth() });
    const [pilih, setPilih] = useState(kunciTgl(hariIni));
    const [data, setData] = useState<{ kunci: string; acara: Acara[] } | null>(null);
    const [gagal, setGagal] = useState("");

    const hari = useMemo(() => gridBulan(bulan.tahun, bulan.bulan), [bulan]);
    const kunciBulan = `${bulan.tahun}-${bulan.bulan}`;

    useEffect(() => {
        let ignore = false;
        const dari = hari[0];
        const sampai = new Date(hari[41].getFullYear(), hari[41].getMonth(), hari[41].getDate() + 1);
        fetch(`/api/lms/kalender?dari=${dari.toISOString()}&sampai=${sampai.toISOString()}`)
            .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
            .then(({ ok, d }) => { if (!ignore) { if (ok) setData({ kunci: kunciBulan, acara: d.acara }); else setGagal(d.message || "Gagal memuat kalender"); } });
        return () => { ignore = true; };
    }, [hari, kunciBulan]);

    const acara = data?.kunci === kunciBulan ? data.acara : null;
    const perHari = useMemo(() => {
        const m = new Map<string, Acara[]>();
        for (const a of acara ?? []) { const k = kunciTgl(new Date(a.waktu)); m.set(k, [...(m.get(k) ?? []), a]); }
        return m;
    }, [acara]);

    const ganti = (d: number) => setBulan(({ tahun, bulan: b }) => { const x = new Date(tahun, b + d, 1); return { tahun: x.getFullYear(), bulan: x.getMonth() }; });
    const keHariIni = () => { setBulan({ tahun: hariIni.getFullYear(), bulan: hariIni.getMonth() }); setPilih(kunciTgl(hariIni)); };
    const daftarPilih = perHari.get(pilih) ?? [];
    const tglPilih = hari.find((h) => kunciTgl(h) === pilih);
    const namaBulan = new Date(bulan.tahun, bulan.bulan, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <LmsNav judul="Kalender" kembali={{ href: "/kelas", label: "Beranda" }} />
            <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-4">
                <header className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Kalender</p>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-800 capitalize">{namaBulan}</h1>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => ganti(-1)} aria-label="Bulan sebelumnya" className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 font-bold">&larr;</button>
                        <button onClick={keHariIni} className="px-3 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-sm font-bold">Hari ini</button>
                        <button onClick={() => ganti(1)} aria-label="Bulan berikutnya" className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 font-bold">&rarr;</button>
                    </div>
                </header>

                <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
                    {(Object.keys(WARNA) as Jenis[]).map((j) => <span key={j} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${WARNA[j].titik}`} />{WARNA[j].label}</span>)}
                </div>
                {gagal && <p className="text-red-600 font-semibold">{gagal}</p>}

                <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                            {HARI.map((h) => <div key={h} className="py-2 text-center text-[11px] font-bold uppercase text-slate-500">{h}</div>)}
                        </div>
                        <div className={`grid grid-cols-7 ${acara ? "" : "opacity-50"}`}>
                            {hari.map((h) => {
                                const k = kunciTgl(h);
                                const isi = perHari.get(k) ?? [];
                                const luar = h.getMonth() !== bulan.bulan;
                                const kini = k === kunciTgl(hariIni);
                                return (
                                    <button key={k} onClick={() => setPilih(k)} aria-label={`${h.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}, ${isi.length} acara`}
                                        className={`min-h-16 sm:min-h-24 border-b border-r border-slate-100 p-1 sm:p-1.5 text-left align-top flex flex-col gap-0.5 ${pilih === k ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : "hover:bg-slate-50"} ${luar ? "bg-slate-50/60" : ""}`}>
                                        <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${kini ? "bg-indigo-600 text-white" : luar ? "text-slate-300" : "text-slate-700"}`}>{h.getDate()}</span>
                                        {/* Layar kecil: titik; layar lebar: judul singkat */}
                                        <span className="flex flex-wrap gap-0.5 sm:hidden">{isi.slice(0, 4).map((a) => <span key={a.id} className={`w-1.5 h-1.5 rounded-full ${WARNA[a.jenis].titik}`} />)}</span>
                                        {isi.slice(0, 3).map((a) => (
                                            <span key={a.id} className={`hidden sm:block truncate text-[10px] font-semibold rounded px-1 py-0.5 ${WARNA[a.jenis].chip} ${a.selesai ? "line-through opacity-60" : ""}`}>{a.judul}</span>
                                        ))}
                                        {isi.length > 3 && <span className="hidden sm:block text-[10px] text-slate-400">+{isi.length - 3} lagi</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <h2 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">
                            {tglPilih ? tglPilih.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }) : "Pilih tanggal"}
                        </h2>
                        {daftarPilih.length === 0 && <p className="px-5 py-6 text-xs text-slate-400 italic">Tidak ada agenda.</p>}
                        <ul className="divide-y divide-slate-100">
                            {daftarPilih.map((a) => (
                                <li key={a.id}>
                                    <Link href={a.href} className="flex gap-3 px-5 py-3 hover:bg-slate-50">
                                        <span className={`shrink-0 w-1.5 rounded-full ${WARNA[a.jenis].titik}`} />
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-sm font-semibold text-slate-800 ${a.selesai ? "line-through text-slate-400" : ""}`}>{a.judul}</span>
                                            <span className="block text-[11px] text-slate-400 truncate">{jam(a.waktu)} · {a.mapel}</span>
                                        </span>
                                        {a.selesai && <span className="text-[10px] font-bold text-emerald-600 self-center">Selesai</span>}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </aside>
                </div>
            </main>
        </div>
    );
}
