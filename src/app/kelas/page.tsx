"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LmsNav, warnaMapel } from "@/components/lms/ui";

interface MapelKartu {
    id: number;
    nama: string;
    deskripsi: string;
    kelas: { id: number; nama: string };
    guru: { id: number; nama: string } | null;
    jumlahMateri: number;
    jumlahTugas: number;
    tugasBelum: number;
}

interface Data {
    role: string;
    nama: string;
    kelasSaya: string;
    mapel: MapelKartu[];
}

export default function BerandaKelas() {
    const [data, setData] = useState<Data | null>(null);
    const [gagal, setGagal] = useState("");

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
        for (const m of data?.mapel ?? []) map.set(m.kelas.nama, [...(map.get(m.kelas.nama) ?? []), m]);
        return [...map.entries()];
    }, [data]);

    const siswa = data?.role === "PESERTA";

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <LmsNav />
            <main className="max-w-6xl mx-auto p-4 md:p-8">
                <header className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Ruang Belajar</p>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-800">{siswa ? "Kelas Saya" : "Kelas yang Saya Ampu"}</h1>
                    {data && (
                        <p className="text-sm text-slate-500 mt-1">
                            {siswa ? (data.kelasSaya ? <>Kelas <b>{data.kelasSaya}</b> · {data.mapel.length} mata pelajaran</> : "Kelas Anda belum diatur. Hubungi admin.") : `${data.mapel.length} mata pelajaran`}
                        </p>
                    )}
                </header>

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

                <div className="space-y-8">
                    {perKelas.map(([kelas, list]) => (
                        <section key={kelas}>
                            {!siswa && <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Kelas {kelas}</h2>}
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                                                {siswa && m.tugasBelum > 0 && (
                                                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.tugasBelum} tugas belum dikumpulkan</span>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </main>
        </div>
    );
}
