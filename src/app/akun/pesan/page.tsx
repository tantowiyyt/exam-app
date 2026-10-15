"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { inputClass } from "@/components/lms/ui";

// Pesan pribadi: daftar percakapan di kiri, isi percakapan di kanan (di HP bergantian). Diperbarui tiap 10 detik.

interface Orang { id: number; nama: string; peran: string; keterangan: string }
interface Percakapan { lawan: Orang; belum: number; terakhir: { isi: string; waktu: string; saya: boolean } }
interface Pesan { id: number; saya: boolean; isi: string; waktu: string; dibaca: boolean }

const jam = (s: string) => {
    const d = new Date(s);
    const hariIni = new Date().toDateString() === d.toDateString();
    return hariIni ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

export default function HalamanPesan() {
    const { toast } = useToast();
    const [daftar, setDaftar] = useState<Percakapan[] | null>(null);
    const [aktif, setAktif] = useState<number | null>(null);
    const [utas, setUtas] = useState<{ lawan: Orang; bolehBalas: boolean; pesan: Pesan[] } | null>(null);
    const [isi, setIsi] = useState("");
    const [baru, setBaru] = useState(false);
    const [cari, setCari] = useState("");
    const [kontak, setKontak] = useState<Orang[]>([]);
    const [kirimProses, setKirimProses] = useState(false);
    const bawah = useRef<HTMLDivElement>(null);

    const muatDaftar = useCallback(() => fetch("/api/pesan").then((r) => (r.ok ? r.json() : null)).then((d) => d && setDaftar(d.percakapan)), []);
    const muatUtas = useCallback((id: number) => fetch(`/api/pesan?dengan=${id}`).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) })).then(({ ok, d }) => {
        if (ok) setUtas(d); else { toast(d.message || "Gagal membuka percakapan", "error"); setAktif(null); }
    }), [toast]);

    useEffect(() => {
        let ignore = false;
        // Buka percakapan dari tautan ?dengan=id (setelah daftar dimuat)
        const id = Number(new URLSearchParams(window.location.search).get("dengan"));
        fetch("/api/pesan").then((r) => (r.ok ? r.json() : null)).then((d) => {
            if (ignore) return;
            if (d) setDaftar(d.percakapan);
            if (id) setAktif(id);
        });
        return () => { ignore = true; };
    }, []);
    useEffect(() => {
        if (!aktif) return;
        let ignore = false;
        const muat = () => fetch(`/api/pesan?dengan=${aktif}`).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) })).then(({ ok, d }) => { if (!ignore && ok) setUtas(d); });
        muat();
        const t = setInterval(() => { muat(); muatDaftar(); }, 10000);
        return () => { ignore = true; clearInterval(t); };
    }, [aktif, muatDaftar]);
    useEffect(() => { bawah.current?.scrollIntoView({ block: "end" }); }, [utas?.pesan.length]);
    useEffect(() => {
        if (!baru) return;
        let ignore = false;
        const t = setTimeout(() => {
            fetch(`/api/pesan?kontak=1&q=${encodeURIComponent(cari)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setKontak(d.kontak); });
        }, 250);
        return () => { ignore = true; clearTimeout(t); };
    }, [baru, cari]);

    const buka = (id: number) => { setAktif(id); setBaru(false); setUtas(null); muatUtas(id).then(muatDaftar); };
    const kirim = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aktif || !isi.trim()) return;
        setKirimProses(true);
        const res = await fetch("/api/pesan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ke: aktif, isi }) });
        const d = await res.json().catch(() => ({}));
        setKirimProses(false);
        if (!res.ok) return toast(d.message || "Gagal mengirim", "error");
        setIsi("");
        setUtas((u) => (u ? { ...u, pesan: [...u.pesan, d.data] } : u));
        muatDaftar();
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Komunikasi" judul="Pesan">
                <button onClick={() => { setBaru(true); setAktif(null); setUtas(null); }} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Pesan Baru</button>
            </HeaderHalaman>
            <main className="max-w-6xl mx-auto p-4 md:p-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm grid md:grid-cols-[18rem_1fr] h-[calc(100vh-11rem)] min-h-[28rem] overflow-hidden">
                    {/* Daftar percakapan */}
                    <aside className={`border-r border-slate-100 overflow-y-auto ${aktif || baru ? "hidden md:block" : ""}`}>
                        {daftar === null && <p className="p-4 text-sm text-slate-400">Memuat...</p>}
                        {daftar?.length === 0 && <p className="p-6 text-sm text-slate-400 italic text-center">Belum ada pesan. Klik “+ Pesan Baru”.</p>}
                        <ul>
                            {daftar?.map((c) => (
                                <li key={c.lawan.id}>
                                    <button onClick={() => buka(c.lawan.id)} className={`w-full text-left px-4 py-3 border-b border-slate-50 flex gap-3 items-start ${aktif === c.lawan.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                                        <span className="w-9 h-9 shrink-0 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">{c.lawan.nama.charAt(0).toUpperCase()}</span>
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-center gap-2"><b className="text-sm text-slate-800 truncate flex-1">{c.lawan.nama}</b><span className="text-[10px] text-slate-400 shrink-0">{jam(c.terakhir.waktu)}</span></span>
                                            <span className="block text-[11px] text-slate-400">{c.lawan.peran}{c.lawan.keterangan && ` · ${c.lawan.keterangan}`}</span>
                                            <span className={`block text-xs truncate ${c.belum ? "font-bold text-slate-800" : "text-slate-500"}`}>{c.terakhir.saya && "Anda: "}{c.terakhir.isi}</span>
                                        </span>
                                        {c.belum > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{c.belum}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    {/* Kanan: pesan baru / isi percakapan */}
                    <section className={`flex flex-col min-h-0 ${!aktif && !baru ? "hidden md:flex" : "flex"}`}>
                        {baru && (
                            <div className="p-4 flex flex-col min-h-0">
                                <div className="flex items-center gap-2 mb-3">
                                    <button onClick={() => setBaru(false)} className="md:hidden text-indigo-600 font-bold text-sm">&larr;</button>
                                    <input autoFocus type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, NIS, atau kelas..." aria-label="Cari penerima" className={inputClass} />
                                </div>
                                <ul className="overflow-y-auto divide-y divide-slate-100">
                                    {kontak.map((k) => (
                                        <li key={k.id}><button onClick={() => buka(k.id)} className="w-full text-left px-2 py-2.5 hover:bg-slate-50 text-sm"><b className="text-slate-800">{k.nama}</b> <span className="text-xs text-slate-400">{k.peran}{k.keterangan && ` · ${k.keterangan}`}</span></button></li>
                                    ))}
                                    {!kontak.length && <li className="p-4 text-sm text-slate-400 italic">Tidak ada akun yang cocok.</li>}
                                </ul>
                                <p className="text-[11px] text-slate-400 mt-3">Siswa dan orang tua dapat mengirim pesan kepada guru, wali kelas, dan admin.</p>
                            </div>
                        )}
                        {!baru && !aktif && <p className="m-auto text-sm text-slate-400">Pilih percakapan atau mulai pesan baru.</p>}
                        {!baru && aktif && (
                            <>
                                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                                    <button onClick={() => { setAktif(null); setUtas(null); }} className="md:hidden text-indigo-600 font-bold">&larr;</button>
                                    <span className="min-w-0"><b className="block text-slate-800 truncate">{utas?.lawan.nama ?? "..."}</b><span className="block text-[11px] text-slate-400">{utas?.lawan.peran}{utas?.lawan.keterangan && ` · ${utas.lawan.keterangan}`}</span></span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
                                    {utas?.pesan.map((m) => (
                                        <div key={m.id} className={`flex ${m.saya ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap wrap-break-word ${m.saya ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"}`}>
                                                {m.isi}
                                                <span className={`block text-[10px] mt-0.5 text-right ${m.saya ? "text-white/70" : "text-slate-400"}`}>{jam(m.waktu)}{m.saya && (m.dibaca ? " · dibaca" : "")}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {utas && !utas.pesan.length && <p className="text-center text-sm text-slate-400 italic">Belum ada pesan. Tulis pesan pertama.</p>}
                                    <div ref={bawah} />
                                </div>
                                {utas?.bolehBalas !== false ? (
                                    <form onSubmit={kirim} className="p-3 border-t border-slate-100 flex gap-2">
                                        <textarea value={isi} onChange={(e) => setIsi(e.target.value)} rows={1} maxLength={2000} placeholder="Tulis pesan..." aria-label="Isi pesan"
                                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
                                            className={`${inputClass} resize-none`} />
                                        <button disabled={kirimProses || !isi.trim()} className="px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">Kirim</button>
                                    </form>
                                ) : <p className="p-3 border-t border-slate-100 text-xs text-slate-400 text-center">Anda tidak bisa membalas percakapan ini.</p>}
                            </>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
