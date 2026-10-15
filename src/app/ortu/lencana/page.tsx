"use client";

import { useEffect, useState } from "react";
import { TampilanLencana } from "@/components/Lencana";

// Lencana anak untuk orang tua. Pilih anak bila lebih dari satu.
export default function LencanaAnak() {
    const [anak, setAnak] = useState<{ id: number; nama: string }[] | null>(null);
    const [pilih, setPilih] = useState<number | null>(null);
    useEffect(() => {
        let ignore = false;
        fetch("/api/ortu").then((r) => (r.ok ? r.json() : null)).then((d) => {
            if (ignore || !d) return;
            const list = d.anak.map((a: { siswa: { id: number; nama: string } }) => a.siswa);
            setAnak(list);
            setPilih(list[0]?.id ?? null);
        });
        return () => { ignore = true; };
    }, []);
    if (anak && !anak.length) return <p className="p-8 text-slate-500">Akun Anda belum ditautkan ke data siswa. Hubungi admin sekolah.</p>;
    return (
        <>
            {anak && anak.length > 1 && (
                <div className="px-4 md:px-8 pt-4 flex gap-2">
                    {anak.map((a) => <button key={a.id} onClick={() => setPilih(a.id)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${pilih === a.id ? "bg-indigo-600 text-white" : "bg-white border border-slate-300 text-slate-700"}`}>{a.nama}</button>)}
                </div>
            )}
            {pilih && <TampilanLencana key={pilih} anak={pilih} grup="Orang Tua" />}
        </>
    );
}
