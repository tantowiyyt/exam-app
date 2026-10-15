"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeaderHalaman } from "@/components/AppShell";
import { fmtTanggal } from "@/components/lms/ui";

// Rekap kehadiran siswa sendiri lintas mapel per semester.

type Status = "H" | "I" | "S" | "A";
interface Rekap { H: number; I: number; S: number; A: number; belum: number; pertemuan: number; persen: number | null }
interface Data {
    semester: { id: number; label: string; aktif: boolean };
    semesterList: { id: number; label: string; aktif: boolean }[];
    kelas: string;
    total: Rekap;
    perMapel: (Rekap & { id: number; nama: string; guru: string })[];
    riwayat: { id: number; mapelId: number; mapel: string; judul: string; tanggal: string; status: Status | null; keterangan: string }[];
}

const LABEL: Record<Status, string> = { H: "Hadir", I: "Izin", S: "Sakit", A: "Alpa" };
const WARNA: Record<Status, string> = { H: "bg-emerald-100 text-emerald-800", I: "bg-sky-100 text-sky-800", S: "bg-amber-100 text-amber-800", A: "bg-red-100 text-red-800" };
const warnaPersen = (p: number | null) => (p === null ? "text-slate-400" : p < 75 ? "text-red-600" : p < 90 ? "text-amber-600" : "text-emerald-600");

export default function HalamanKehadiran() {
    const [semester, setSemester] = useState<number | undefined>(undefined);
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<number | "semua">("semua");

    useEffect(() => {
        let ignore = false;
        fetch(`/api/lms/kehadiran${semester ? `?semester=${semester}` : ""}`)
            .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
            .then(({ ok, data }) => { if (!ignore) { if (ok) { setD(data); setError(""); } else setError(data.message || "Gagal memuat kehadiran"); } });
        return () => { ignore = true; };
    }, [semester]);

    const riwayat = (d?.riwayat ?? []).filter((r) => filter === "semua" || r.mapelId === filter);

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Belajar" judul="Kehadiran Saya">
                {d && d.semesterList.length > 1 && (
                    <select value={d.semester.id} onChange={(e) => setSemester(Number(e.target.value))} aria-label="Semester"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {d.semesterList.map((s) => <option key={s.id} value={s.id}>{s.label}{s.aktif ? " (aktif)" : ""}</option>)}
                    </select>
                )}
            </HeaderHalaman>
            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {!d && !error && <p className="text-slate-500">Memuat kehadiran...</p>}
                {d && (
                    <>
                        <section className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                            <div className="col-span-2 bg-white rounded-2xl border border-slate-200 p-4">
                                <p className="text-xs font-bold uppercase text-slate-500">Kehadiran {d.semester.label}</p>
                                <p className={`text-3xl font-black ${warnaPersen(d.total.persen)}`}>{d.total.persen === null ? "–" : `${d.total.persen}%`}</p>
                                <p className="text-xs text-slate-500">{d.total.pertemuan} pertemuan{d.kelas ? ` · ${d.kelas}` : ""}</p>
                            </div>
                            {(["H", "I", "S", "A"] as Status[]).map((s) => (
                                <div key={s} className="bg-white rounded-2xl border border-slate-200 p-4">
                                    <p className="text-xs font-bold uppercase text-slate-500">{LABEL[s]}</p>
                                    <p className="text-2xl font-black text-slate-800">{d.total[s]}</p>
                                </div>
                            ))}
                        </section>
                        {d.total.belum > 0 && <p className="text-xs text-slate-500">{d.total.belum} pertemuan belum diisi presensinya — hubungi guru mapel bila keliru.</p>}

                        <section className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                                    <tr><th className="text-left p-3">Mapel</th><th className="p-3">Pertemuan</th><th className="p-3">H</th><th className="p-3">I</th><th className="p-3">S</th><th className="p-3">A</th><th className="p-3">Kehadiran</th></tr>
                                </thead>
                                <tbody>
                                    {d.perMapel.map((m) => (
                                        <tr key={m.id} className="border-t border-slate-100 text-center">
                                            <td className="text-left p-3"><Link href={`/kelas/${m.id}`} className="font-semibold text-slate-800 hover:text-indigo-600">{m.nama}</Link>{m.guru && <span className="block text-xs text-slate-500">{m.guru}</span>}</td>
                                            <td className="p-3">{m.pertemuan}</td><td className="p-3">{m.H}</td><td className="p-3">{m.I}</td><td className="p-3">{m.S}</td><td className="p-3">{m.A}</td>
                                            <td className={`p-3 font-bold ${warnaPersen(m.persen)}`}>{m.persen === null ? "–" : `${m.persen}%`}</td>
                                        </tr>
                                    ))}
                                    {!d.perMapel.length && <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">Belum ada mapel.</td></tr>}
                                </tbody>
                            </table>
                        </section>

                        <section className="bg-white rounded-2xl border border-slate-200">
                            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
                                <h2 className="font-bold text-slate-800 flex-1">Riwayat Pertemuan</h2>
                                <select value={filter} onChange={(e) => setFilter(e.target.value === "semua" ? "semua" : Number(e.target.value))} aria-label="Filter mapel"
                                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white">
                                    <option value="semua">Semua mapel</option>
                                    {d.perMapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
                                </select>
                            </div>
                            <ul className="divide-y divide-slate-100">
                                {riwayat.map((r) => (
                                    <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                                        <span className="w-24 shrink-0 text-xs text-slate-500">{fmtTanggal(r.tanggal)}</span>
                                        <span className="flex-1 min-w-0"><span className="font-semibold text-slate-800">{r.mapel}</span> · {r.judul}{r.keterangan && <span className="block text-xs text-slate-500">{r.keterangan}</span>}</span>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${r.status ? WARNA[r.status] : "bg-slate-100 text-slate-500"}`}>{r.status ? LABEL[r.status] : "Belum diisi"}</span>
                                    </li>
                                ))}
                                {!riwayat.length && <li className="p-6 text-center text-slate-400 italic">Belum ada pertemuan.</li>}
                            </ul>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}
