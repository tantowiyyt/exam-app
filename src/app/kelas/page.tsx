"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { warnaMapel, fmtWaktu } from "@/components/lms/ui";

interface MapelKartu {
    id: number;
    nama: string;
    deskripsi: string;
    kelas: { id: number; nama: string };
    guru: { id: number; nama: string } | null;
    jumlahMateri: number;
    jumlahTugas: number;
    jumlahKuis: number;
    tugasBelum: number;
}

interface Data {
    role: string;
    nama: string;
    kelasSaya: string;
    mapel: MapelKartu[];
    agenda?: { id: number; jenis: "tugas" | "kuis"; judul: string; tenggat: string | null; revisi: boolean; mapel: { id: number; nama: string } }[];
    ujianCat?: { nama: string; durasiMenit: number; jadwalMulai: string | null; jadwalSelesai: string | null; mapel: string | null; sudahUjian: boolean } | null;
    perluDinilai?: { jenis: "tugas" | "kuis"; id: number; judul: string; jumlah: number; mapel: { id: number; nama: string; kelas: string } }[];
    ringkasan?: { kelas: number; mapel: number; guru: number; siswa: number; siswaTanpaKelas: number; mapelTanpaGuru: number } | null;
}

/** Sisa waktu menuju tenggat, mis. "2 hari lagi" / "lewat 3 jam". */
function sisaWaktu(tenggat: string | null) {
    if (!tenggat) return { label: "Tanpa tenggat", cls: "bg-slate-100 text-slate-500" };
    const ms = new Date(tenggat).getTime() - Date.now();
    const jam = Math.round(Math.abs(ms) / 3600000);
    const teks = jam < 1 ? "kurang dari 1 jam" : jam < 24 ? `${jam} jam` : `${Math.round(jam / 24)} hari`;
    if (ms < 0) return { label: `Lewat ${teks}`, cls: "bg-red-100 text-red-700" };
    return { label: `${teks} lagi`, cls: ms < 86400000 ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700" };
}

export default function BerandaKelas() {
    const [data, setData] = useState<Data | null>(null);
    const [gagal, setGagal] = useState("");
    const [cari, setCari] = useState("");
    // Banyak kelas & mapel (admin/guru): kelompok kelas bisa dibuka-tutup, default tertutup
    const [toggle, setToggle] = useState<Set<string>>(new Set());

    useEffect(() => {
        let ignore = false;
        fetch("/api/lms/kelas")
            .then(async (r) => ({ ok: r.ok, d: await r.json() }))
            .then(({ ok, d }) => { if (!ignore) { if (ok) setData(d); else setGagal(d.message || "Gagal memuat kelas"); } });
        return () => { ignore = true; };
    }, []);

    // Admin & guru bisa mengampu banyak kelas: kelompokkan per kelas
    const perKelas = useMemo(() => {
        const map = new Map<string, MapelKartu[]>();
        const q = cari.trim().toLowerCase();
        for (const m of data?.mapel ?? []) {
            if (q && !`${m.kelas.nama} ${m.nama} ${m.guru?.nama ?? ""}`.toLowerCase().includes(q)) continue;
            map.set(m.kelas.nama, [...(map.get(m.kelas.nama) ?? []), m]);
        }
        return [...map.entries()];
    }, [data, cari]);

    const siswa = data?.role === "PESERTA";
    const lipat = !siswa && perKelas.length > 3 && (data?.mapel.length ?? 0) > 12 && !cari.trim();
    const terbuka = (kelas: string) => !lipat || toggle.has(kelas);
    const balik = (kelas: string) => setToggle((s) => { const n = new Set(s); if (n.has(kelas)) n.delete(kelas); else n.add(kelas); return n; });

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <main className="max-w-6xl mx-auto p-4 md:p-8">
                <header className="mb-6 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Beranda</p>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-800">{siswa ? "Kelas Saya" : data?.role === "ADMIN" ? "Semua Kelas" : "Kelas yang Saya Ampu"}</h1>
                    {data && (
                        <p className="text-sm text-slate-500 mt-1">
                            {siswa ? (data.kelasSaya ? <>Kelas <b>{data.kelasSaya}</b> · {data.mapel.length} mata pelajaran</> : "Kelas Anda belum diatur. Hubungi admin.") : `${new Set(data.mapel.map((m) => m.kelas.id)).size} kelas · ${data.mapel.length} mata pelajaran`}
                        </p>
                    )}
                    </div>
                </header>

                {/* Admin: ringkasan sekolah */}
                {data?.ringkasan && (
                    <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: "Kelas", n: data.ringkasan.kelas, href: "/admin/kelas" },
                            { label: "Mata pelajaran", n: data.ringkasan.mapel, href: "/admin/kelas", catatan: data.ringkasan.mapelTanpaGuru ? `${data.ringkasan.mapelTanpaGuru} tanpa guru` : "" },
                            { label: "Guru", n: data.ringkasan.guru, href: "/admin/akun" },
                            { label: "Siswa", n: data.ringkasan.siswa, href: "/admin/peserta", catatan: data.ringkasan.siswaTanpaKelas ? `${data.ringkasan.siswaTanpaKelas} belum punya kelas` : "" },
                        ].map((c) => (
                            <Link key={c.label} href={c.href} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
                                <p className="text-2xl font-black text-slate-800">{c.n}</p>
                                {c.catatan && <p className="text-[11px] font-semibold text-amber-600 mt-0.5">{c.catatan}</p>}
                            </Link>
                        ))}
                    </section>
                )}

                {/* Siswa: ujian CAT yang sedang aktif untuk kelasnya */}
                {siswa && data.ujianCat && (
                    <Link href="/dashboard" className={`mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl p-5 text-white shadow-sm hover:shadow-lg transition-shadow ${data.ujianCat.sudahUjian ? "bg-linear-to-r from-slate-600 to-slate-700" : "bg-linear-to-r from-emerald-600 to-teal-600"}`}>
                        <span className="shrink-0 w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-xl font-black" aria-hidden="true">{data.ujianCat.sudahUjian ? "✓" : "!"}</span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-[11px] font-bold uppercase tracking-wider text-white/80">{data.ujianCat.sudahUjian ? "Ujian CAT selesai" : "Ujian CAT"}</span>
                            <span className="block text-lg font-black leading-tight">{data.ujianCat.nama}</span>
                            <span className="block text-xs text-white/85 mt-0.5">
                                {data.ujianCat.mapel && `${data.ujianCat.mapel} · `}{data.ujianCat.durasiMenit} menit
                                {data.ujianCat.jadwalMulai && ` · ${fmtWaktu(data.ujianCat.jadwalMulai)}${data.ujianCat.jadwalSelesai ? ` – ${fmtWaktu(data.ujianCat.jadwalSelesai)}` : ""}`}
                            </span>
                        </span>
                        <span className="shrink-0 bg-white text-slate-800 font-bold text-sm rounded-xl px-4 py-2 text-center">{data.ujianCat.sudahUjian ? "Lihat hasil" : "Buka ujian →"}</span>
                    </Link>
                )}

                {/* Guru/admin: yang menunggu dinilai */}
                {!siswa && !!data?.perluDinilai?.length && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6">
                        <h2 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Perlu Dinilai</h2>
                        <ul className="divide-y divide-slate-100">
                            {data.perluDinilai.map((t) => (
                                <li key={`${t.jenis}${t.id}`}>
                                    <Link href={`/kelas/${t.mapel.id}/${t.jenis}/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                                        <span className={`shrink-0 w-9 h-9 rounded-lg font-black flex items-center justify-center ${t.jenis === "kuis" ? "bg-fuchsia-100 text-fuchsia-700" : "bg-amber-100 text-amber-700"}`}>{t.jenis === "kuis" ? "Q" : "T"}</span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-semibold text-slate-800 truncate">{t.judul}</span>
                                            <span className="block text-[11px] text-slate-400 truncate">{t.mapel.kelas} · {t.mapel.nama}{t.jenis === "kuis" ? " · esai" : ""}</span>
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap bg-indigo-100 text-indigo-700">{t.jumlah} {t.jenis === "kuis" ? "percobaan" : "jawaban"}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {!siswa && data && data.mapel.length > 3 && (
                    <div className="mb-6">
                        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari kelas atau mapel"
                            placeholder="Cari kelas, mapel, atau guru..." className="w-full sm:max-w-md px-4 py-2.5 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-indigo-500" />
                        {cari && perKelas.length === 0 && <p className="text-sm text-slate-400 italic mt-3">Tidak ada kelas atau mapel yang cocok.</p>}
                    </div>
                )}
                {gagal && <p className="text-red-600 font-semibold">{gagal}</p>}
                {!data && !gagal && <p className="text-slate-500">Memuat...</p>}

                {data && data.mapel.length === 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
                        {data.role === "ADMIN" ? (
                            <>Belum ada kelas & mapel. Buat di <Link href="/admin/kelas" className="text-indigo-600 font-bold hover:underline">Admin → Kelas & Mapel</Link>.</>
                        ) : data.role === "GURU" ? (
                            "Anda belum ditugaskan mengampu mapel. Minta admin menambahkan Anda sebagai guru di menu Kelas & Mapel."
                        ) : (
                            "Belum ada mata pelajaran untuk kelas Anda."
                        )}
                    </div>
                )}

                {siswa && data.agenda && data.agenda.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-8">
                        <h2 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Tugas & Kuis yang Harus Dikerjakan</h2>
                        <ul className="divide-y divide-slate-100">
                            {data.agenda.map((t) => {
                                const s = t.revisi ? { label: "Perlu revisi", cls: "bg-orange-100 text-orange-700" } : sisaWaktu(t.tenggat);
                                return (
                                    <li key={`${t.jenis}${t.id}`}>
                                        <Link href={`/kelas/${t.mapel.id}/${t.jenis}/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                                            <span className={`shrink-0 w-9 h-9 rounded-lg font-black flex items-center justify-center ${t.jenis === "kuis" ? "bg-fuchsia-100 text-fuchsia-700" : "bg-amber-100 text-amber-700"}`}>{t.jenis === "kuis" ? "Q" : "T"}</span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-semibold text-slate-800 truncate">{t.judul}</span>
                                                <span className="block text-[11px] text-slate-400 truncate">{t.jenis === "kuis" ? "Kuis · " : ""}{t.mapel.nama}{t.tenggat && ` · ${t.jenis === "kuis" ? "ditutup" : "tenggat"} ${fmtWaktu(t.tenggat)}`}</span>
                                            </span>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                <div className={lipat ? "space-y-3" : "space-y-8"}>
                    {perKelas.map(([kelas, list]) => (
                        <section key={kelas}>
                            {!siswa && (lipat ? (
                                <button onClick={() => balik(kelas)} aria-expanded={terbuka(kelas)}
                                    className="w-full flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50 text-left">
                                    <span aria-hidden className={`text-slate-400 text-xs transition-transform ${terbuka(kelas) ? "rotate-90" : ""}`}>&#9654;</span>
                                    <h2 className="flex-1 text-sm font-bold text-slate-700 uppercase tracking-wider">Kelas {kelas}</h2>
                                    <span className="hidden md:block flex-2 min-w-0 truncate text-xs text-slate-400">{list.map((m) => m.nama).join(" · ")}</span>
                                    <span className="text-xs text-slate-500 whitespace-nowrap">{list.length} mapel</span>
                                </button>
                            ) : <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Kelas {kelas}</h2>)}
                            {terbuka(kelas) && (
                            <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${lipat ? "mt-3" : ""}`}>
                                {list.map((m) => (
                                    <Link key={m.id} href={`/kelas/${m.id}`}
                                        className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
                                        <div className={`bg-linear-to-br ${warnaMapel(m.id)} p-5 text-white relative`}>
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">{m.kelas.nama}</p>
                                            <h3 className="text-lg font-black leading-tight mt-0.5">{m.nama}</h3>
                                            <p className="text-xs text-white/85 mt-2 truncate">{m.guru ? m.guru.nama : "Guru belum ditentukan"}</p>
                                            <span className="absolute right-4 top-4 w-11 h-11 rounded-full bg-white/20 text-xl font-black flex items-center justify-center">
                                                {m.nama.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="p-4 flex-1 flex flex-col">
                                            {m.deskripsi && <p className="text-xs text-slate-500 line-clamp-2 mb-3">{m.deskripsi}</p>}
                                            <div className="mt-auto flex items-center gap-3 text-xs text-slate-500">
                                                <span><b className="text-slate-700">{m.jumlahMateri}</b> materi</span>
                                                <span><b className="text-slate-700">{m.jumlahTugas}</b> tugas</span>
                                                {m.jumlahKuis > 0 && <span><b className="text-slate-700">{m.jumlahKuis}</b> kuis</span>}
                                                {siswa && m.tugasBelum > 0 && (
                                                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.tugasBelum} perlu dikerjakan</span>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            )}
                        </section>
                    ))}
                </div>
            </main>
        </div>
    );
}
