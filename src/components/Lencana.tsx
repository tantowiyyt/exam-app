"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { fmtTanggal } from "@/components/lms/ui";

// Lencana: siswa & orang tua melihat lencana otomatis (dengan progres) + lencana dari guru;
// guru/admin memilih mapel lalu memberi / mencabut lencana untuk siswa.

interface Otomatis { kode: string; judul: string; deskripsi: string; ikon: string; dapat: boolean; progres: string }
interface DariGuru { id: number; jenis: string; judul: string; catatan: string; createdAt: string; ikon: string; mapel: string; oleh: string; bisaHapus?: boolean }
interface Semester { id: number; label: string; aktif: boolean }
interface DataSiswa { peran: "siswa"; semester: Semester; semesterList: Semester[]; otomatis: Otomatis[]; dariGuru: DariGuru[] }
interface DataKelola {
    peran: "kelola"; semester: Semester; semesterList: Semester[]; jenis: Record<string, { judul: string; ikon: string }>;
    mapelList?: { id: number; nama: string; kelas: string }[];
    mapel?: { id: number; nama: string; kelas: string };
    siswa?: { id: number; nomorPeserta: string; nama: string; otomatis: { kode: string; judul: string; ikon: string }[]; dariGuru: DariGuru[] }[];
}

function Kartu({ ikon, judul, sub, aktif, catatan }: { ikon: string; judul: string; sub: string; aktif: boolean; catatan?: string }) {
    return (
        <div className={`rounded-2xl border p-4 flex gap-3 items-start ${aktif ? "bg-white border-amber-200 shadow-sm" : "bg-slate-50 border-slate-200"}`}>
            <span className={`text-3xl leading-none ${aktif ? "" : "grayscale opacity-40"}`} aria-hidden>{ikon}</span>
            <span className="min-w-0">
                <b className={`block ${aktif ? "text-slate-800" : "text-slate-500"}`}>{judul}</b>
                <span className="block text-xs text-slate-500">{sub}</span>
                {catatan && <span className="block text-xs text-slate-600 mt-1 italic">“{catatan}”</span>}
            </span>
        </div>
    );
}

export function TampilanLencana({ anak, grup = "Belajar" }: { anak?: number; grup?: string }) {
    const { toast } = useToast();
    const [semester, setSemester] = useState<number | undefined>();
    const [mapelId, setMapelId] = useState<number | undefined>();
    const [d, setD] = useState<DataSiswa | DataKelola | null>(null);
    const [error, setError] = useState("");
    const [beri, setBeri] = useState<{ jenis: string; judul: string; catatan: string; siswa: Set<number> } | null>(null);
    const [versi, setVersi] = useState(0);

    useEffect(() => {
        let ignore = false;
        const p = new URLSearchParams();
        if (anak) p.set("anak", String(anak));
        if (semester) p.set("semester", String(semester));
        if (mapelId) p.set("mapelId", String(mapelId));
        fetch(`/api/lms/lencana?${p}`).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).then(({ ok, data }) => {
            if (ignore) return;
            if (!ok) return setError(data.message || "Gagal memuat lencana");
            setError("");
            // Guru: buka mapel pertama otomatis
            if (data.peran === "kelola" && !mapelId && data.mapelList?.length) { setMapelId(data.mapelList[0].id); return; }
            setD(data);
        });
        return () => { ignore = true; };
    }, [anak, semester, mapelId, versi]);

    const kirimLencana = async () => {
        if (!beri || !mapelId) return;
        const res = await fetch("/api/lms/lencana", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapelId, jenis: beri.jenis, judul: beri.judul, catatan: beri.catatan, siswa: [...beri.siswa] }) });
        const data = await res.json().catch(() => ({}));
        toast(data.message || (res.ok ? "Berhasil" : "Gagal"), res.ok ? "success" : "error");
        if (res.ok) { setBeri(null); setVersi((v) => v + 1); }
    };
    const cabut = async (id: number) => {
        if (!confirm("Cabut lencana ini?")) return;
        const res = await fetch(`/api/lms/lencana?id=${id}`, { method: "DELETE" });
        if (res.ok) setVersi((v) => v + 1); else toast("Gagal mencabut", "error");
    };

    const pilihSemester = d && d.semesterList.length > 1 && (
        <select value={d.semester.id} onChange={(e) => setSemester(Number(e.target.value))} aria-label="Semester" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
            {d.semesterList.map((s) => <option key={s.id} value={s.id}>{s.label}{s.aktif ? " (aktif)" : ""}</option>)}
        </select>
    );

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup={grup} judul="Lencana">
                {d?.peran === "kelola" && (
                    <MapelPicker mapelId={mapelId} onChange={(id) => { setMapelId(id); setBeri(null); }} />
                )}
                {pilihSemester}
            </HeaderHalaman>
            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {!d && !error && <p className="text-slate-500">Memuat lencana...</p>}

                {d?.peran === "siswa" && (
                    <>
                        <section>
                            <h2 className="font-bold text-slate-800 mb-3">Lencana Prestasi Belajar <span className="text-sm font-normal text-slate-500">· {d.otomatis.filter((l) => l.dapat).length} dari {d.otomatis.length} didapat ({d.semester.label})</span></h2>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {[...d.otomatis].sort((a, b) => Number(b.dapat) - Number(a.dapat)).map((l) => <Kartu key={l.kode} ikon={l.ikon} judul={l.judul} sub={l.dapat ? l.deskripsi : `${l.deskripsi} — ${l.progres}`} aktif={l.dapat} />)}
                            </div>
                        </section>
                        <section>
                            <h2 className="font-bold text-slate-800 mb-3">Penghargaan dari Guru</h2>
                            {d.dariGuru.length ? (
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {d.dariGuru.map((l) => <Kartu key={l.id} ikon={l.ikon} judul={l.judul} sub={`${l.mapel} · ${l.oleh} · ${fmtTanggal(l.createdAt)}`} catatan={l.catatan} aktif />)}
                                </div>
                            ) : <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400 italic">Belum ada penghargaan semester ini.</p>}
                        </section>
                    </>
                )}

                {d?.peran === "kelola" && d.siswa && d.mapel && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="font-bold text-slate-800 flex-1">{d.mapel.kelas} · {d.mapel.nama}</h2>
                            {d.semester.aktif && <button onClick={() => setBeri({ jenis: "teraktif", judul: "", catatan: "", siswa: new Set() })} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold">★ Beri Lencana</button>}
                        </div>
                        {beri && (
                            <section className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(d.jenis).map(([k, j]) => (
                                        <button key={k} type="button" onClick={() => setBeri({ ...beri, jenis: k })} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${beri.jenis === k ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}`}>{j.ikon} {j.judul}</button>
                                    ))}
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <input value={beri.judul} onChange={(e) => setBeri({ ...beri, judul: e.target.value })} maxLength={60} placeholder={`Nama lencana (bawaan: ${d.jenis[beri.jenis]?.judul})`} aria-label="Nama lencana" className="px-3 py-2 text-sm rounded-lg border border-slate-300" />
                                    <input value={beri.catatan} onChange={(e) => setBeri({ ...beri, catatan: e.target.value })} maxLength={300} placeholder="Catatan untuk siswa (opsional)" aria-label="Catatan" className="px-3 py-2 text-sm rounded-lg border border-slate-300" />
                                </div>
                                <p className="text-xs text-slate-500">Centang siswa di daftar bawah ({beri.siswa.size} dipilih).</p>
                                <div className="flex gap-2">
                                    <button onClick={kirimLencana} disabled={!beri.siswa.size} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold disabled:opacity-50">Berikan</button>
                                    <button onClick={() => setBeri(null)} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold">Batal</button>
                                </div>
                            </section>
                        )}
                        <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                            {d.siswa.map((s) => (
                                <div key={s.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                                    {beri && <input type="checkbox" className="mt-1" checked={beri.siswa.has(s.id)} aria-label={`Pilih ${s.nama}`}
                                        onChange={() => setBeri((b) => { if (!b) return b; const n = new Set(b.siswa); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return { ...b, siswa: n }; })} />}
                                    <span className="w-48 min-w-0"><b className="text-sm text-slate-800 block truncate">{s.nama}</b><span className="text-[11px] text-slate-400 font-mono">{s.nomorPeserta}</span></span>
                                    <span className="flex-1 flex flex-wrap gap-1.5">
                                        {s.otomatis.map((l) => <span key={l.kode} title={l.judul} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{l.ikon} {l.judul}</span>)}
                                        {s.dariGuru.map((l) => (
                                            <span key={l.id} title={`${l.oleh}${l.catatan ? ` — ${l.catatan}` : ""}`} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                                                {l.ikon} {l.judul}{l.bisaHapus && <button onClick={() => cabut(l.id)} className="ml-1 text-amber-900/60 hover:text-red-600" aria-label="Cabut lencana">×</button>}
                                            </span>
                                        ))}
                                        {!s.otomatis.length && !s.dariGuru.length && <span className="text-xs text-slate-300">—</span>}
                                    </span>
                                </div>
                            ))}
                            {!d.siswa.length && <p className="p-6 text-center text-slate-400 italic">Belum ada siswa.</p>}
                        </section>
                        <p className="text-xs text-slate-500">Abu-abu = lencana otomatis dari data belajar (kehadiran, ketepatan tugas, membaca materi, nilai, kuis, diskusi). Kuning = penghargaan dari guru.</p>
                    </>
                )}
                {d?.peran === "kelola" && !d.mapel && <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400">Belum ada mapel yang Anda ampu.</p>}
            </main>
        </div>
    );
}

/** Pilihan mapel untuk guru/admin (daftar dimuat sekali). */
function MapelPicker({ mapelId, onChange }: { mapelId?: number; onChange: (id: number) => void }) {
    const [list, setList] = useState<{ id: number; nama: string; kelas: string }[]>([]);
    useEffect(() => {
        let ignore = false;
        fetch("/api/lms/lencana").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d?.mapelList) setList(d.mapelList); });
        return () => { ignore = true; };
    }, []);
    if (!list.length) return null;
    return (
        <select value={mapelId ?? ""} onChange={(e) => onChange(Number(e.target.value))} aria-label="Mapel" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold max-w-64">
            {list.map((m) => <option key={m.id} value={m.id}>{m.kelas} · {m.nama}</option>)}
        </select>
    );
}
