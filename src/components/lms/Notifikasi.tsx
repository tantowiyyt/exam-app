"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Item { id: string; jenis: string; judul: string; isi: string; waktu: string; href: string; baru: boolean }

const IKON: Record<string, { huruf: string; cls: string }> = {
    tugas: { huruf: "T", cls: "bg-amber-100 text-amber-700" },
    materi: { huruf: "M", cls: "bg-indigo-100 text-indigo-700" },
    pengumuman: { huruf: "P", cls: "bg-sky-100 text-sky-700" },
    nilai: { huruf: "N", cls: "bg-emerald-100 text-emerald-700" },
    revisi: { huruf: "R", cls: "bg-orange-100 text-orange-700" },
    lencana: { huruf: "★", cls: "bg-yellow-100 text-yellow-700" },
    kumpul: { huruf: "K", cls: "bg-violet-100 text-violet-700" },
    komentar: { huruf: "D", cls: "bg-slate-200 text-slate-700" },
    kuis: { huruf: "Q", cls: "bg-fuchsia-100 text-fuchsia-700" },
    presensi: { huruf: "A", cls: "bg-teal-100 text-teal-700" },
};

function relatif(iso: string) {
    const menit = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (menit < 1) return "baru saja";
    if (menit < 60) return `${menit} menit lalu`;
    const jam = Math.round(menit / 60);
    if (jam < 24) return `${jam} jam lalu`;
    return `${Math.round(jam / 24)} hari lalu`;
}

/** Lonceng notifikasi LMS di navbar; diperbarui tiap menit. */
export function Notifikasi() {
    const [items, setItems] = useState<Item[]>([]);
    const [baru, setBaru] = useState(0);
    const [buka, setBuka] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const muat = useCallback(async () => {
        const r = await fetch("/api/lms/notifikasi").catch(() => null);
        if (!r?.ok) return;
        const d = await r.json();
        setItems(d.items);
        setBaru(d.jumlahBaru);
    }, []);

    useEffect(() => {
        let ignore = false;
        const ambil = () => fetch("/api/lms/notifikasi").then((r) => (r.ok ? r.json() : null)).then((d) => {
            if (!ignore && d) { setItems(d.items); setBaru(d.jumlahBaru); }
        }).catch(() => {});
        ambil();
        const t = setInterval(ambil, 60_000);
        return () => { ignore = true; clearInterval(t); };
    }, []);

    // Tutup saat klik di luar
    useEffect(() => {
        if (!buka) return;
        const klik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setBuka(false); };
        document.addEventListener("mousedown", klik);
        return () => document.removeEventListener("mousedown", klik);
    }, [buka]);

    const toggle = async () => {
        const next = !buka;
        setBuka(next);
        if (next && baru > 0) {
            // Tandai dibaca; titik "baru" tetap terlihat selama panel terbuka
            setBaru(0);
            await fetch("/api/lms/notifikasi", { method: "POST" }).catch(() => {});
        } else if (!next) {
            muat();
        }
    };

    return (
        <div ref={ref} className="relative">
            <button onClick={toggle} aria-label={`Notifikasi${baru ? ` (${baru} baru)` : ""}`} aria-expanded={buka}
                className="relative bg-white/10 hover:bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {baru > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[9px] font-black flex items-center justify-center">{baru > 9 ? "9+" : baru}</span>}
            </button>
            {buka && (
                <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
                    <p className="px-4 py-2.5 border-b border-slate-100 text-sm font-bold">Notifikasi</p>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                        {items.length === 0 && <p className="p-6 text-center text-xs text-slate-400 italic">Belum ada notifikasi dalam 30 hari terakhir.</p>}
                        {items.map((n) => {
                            const ikon = IKON[n.jenis] ?? IKON.komentar;
                            return (
                                <Link key={n.id} href={n.href} onClick={() => setBuka(false)} className={`flex gap-3 px-4 py-3 hover:bg-slate-50 ${n.baru ? "bg-indigo-50/60" : ""}`}>
                                    <span className={`shrink-0 w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center ${ikon.cls}`}>{ikon.huruf}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-xs font-semibold leading-snug line-clamp-2">{n.judul}</span>
                                        {n.isi && <span className="block text-[11px] text-slate-500 truncate">{n.isi}</span>}
                                        <span className="block text-[10px] text-slate-400 mt-0.5">{relatif(n.waktu)}</span>
                                    </span>
                                    {n.baru && <span className="shrink-0 w-2 h-2 mt-1.5 rounded-full bg-indigo-500" aria-label="baru" />}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
