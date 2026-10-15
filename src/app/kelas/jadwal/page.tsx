"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { inputClass, labelClass, warnaMapel } from "@/components/lms/ui";

// Jadwal pelajaran mingguan. Siswa: kelasnya. Guru: jadwal mengajarnya / kelas yang diajar. Admin: per kelas/guru + kelola.

interface Item { id: number; hari: number; jamMulai: string; jamSelesai: string; ruang: string; mapel: { id: number; nama: string }; kelas: { id: number; nama: string }; guru: { id: number; nama: string } | null }
interface Data {
    peran: "siswa" | "guru" | "admin";
    judul: string;
    jadwal: Item[];
    semester: { id: number; label: string; aktif: boolean };
    semesterList: { id: number; label: string; aktif: boolean }[];
    kelasList?: { id: number; nama: string; mapel: { id: number; nama: string; guru: string }[] }[];
    guruList?: { id: number; nama: string }[];
}
const HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const KOSONG = { id: 0, mapelId: 0, hari: 1, jamMulai: "07:00", jamSelesai: "08:30", ruang: "" };

export default function HalamanJadwal() {
    const { toast } = useToast();
    const [pilih, setPilih] = useState<{ kelas?: number; guru?: number; semester?: number }>({});
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [form, setForm] = useState(KOSONG);
    const [versi, setVersi] = useState(0);

    useEffect(() => {
        let ignore = false;
        const p = new URLSearchParams();
        if (pilih.kelas) p.set("kelas", String(pilih.kelas));
        if (pilih.guru) p.set("guru", String(pilih.guru));
        if (pilih.semester) p.set("semester", String(pilih.semester));
        fetch(`/api/lms/jadwal?${p}`).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
            .then(({ ok, data }) => {
                if (ignore) return;
                if (!ok) return setError(data.message || "Gagal memuat jadwal");
                setError("");
                // Admin: buka kelas pertama otomatis
                if (data.peran === "admin" && !pilih.kelas && !pilih.guru && data.kelasList?.length) { setPilih((x) => ({ ...x, kelas: data.kelasList[0].id })); return; }
                setD(data);
            });
        return () => { ignore = true; };
    }, [pilih, versi]);

    const admin = d?.peran === "admin";
    const bisaKelola = admin && !!pilih.kelas && d?.semester.aktif;
    const mapelKelas = d?.kelasList?.find((k) => k.id === pilih.kelas)?.mapel ?? [];
    const hariTampil = [1, 2, 3, 4, 5, 6, ...(d?.jadwal.some((j) => j.hari === 7) ? [7] : [])];
    const hariIni = ((new Date().getDay() + 6) % 7) + 1;

    const simpan = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch("/api/lms/jadwal", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return toast(data.message || "Gagal menyimpan", "error");
        toast("Jadwal disimpan", "success");
        setForm({ ...KOSONG, hari: form.hari, jamMulai: form.jamSelesai, jamSelesai: form.jamSelesai });
        setVersi((v) => v + 1);
    };
    const hapus = async (id: number) => {
        if (!confirm("Hapus jadwal ini?")) return;
        const res = await fetch(`/api/lms/jadwal?id=${id}`, { method: "DELETE" });
        if (!res.ok) return toast("Gagal menghapus", "error");
        setVersi((v) => v + 1);
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans print:bg-white">
            <HeaderHalaman grup="Akademik" judul="Jadwal Pelajaran">
                {d && d.semesterList.length > 1 && (
                    <select value={d.semester.id} onChange={(e) => setPilih((x) => ({ ...x, semester: Number(e.target.value) }))} aria-label="Semester" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {d.semesterList.map((s) => <option key={s.id} value={s.id}>{s.label}{s.aktif ? " (aktif)" : ""}</option>)}
                    </select>
                )}
                {d && d.peran !== "siswa" && (
                    <select value={pilih.kelas ? `k${pilih.kelas}` : pilih.guru ? `g${pilih.guru}` : ""} aria-label="Tampilkan jadwal"
                        onChange={(e) => { const v = e.target.value; setForm(KOSONG); setPilih((x) => ({ semester: x.semester, ...(v.startsWith("k") ? { kelas: Number(v.slice(1)) } : v.startsWith("g") ? { guru: Number(v.slice(1)) } : {}) })); }}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold max-w-64">
                        {d.peran === "guru" && <option value="">Jadwal mengajar saya</option>}
                        <optgroup label="Per kelas">{d.kelasList?.map((k) => <option key={k.id} value={`k${k.id}`}>{k.nama}</option>)}</optgroup>
                        {admin && <optgroup label="Per guru">{d.guruList?.map((g) => <option key={g.id} value={`g${g.id}`}>{g.nama}</option>)}</optgroup>}
                    </select>
                )}
                <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Cetak</button>
            </HeaderHalaman>
            <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 print:p-0">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {!d && !error && <p className="text-slate-500">Memuat jadwal...</p>}
                {d && (
                    <>
                        <h2 className="text-lg font-black text-slate-800">{d.judul || "Jadwal"} <span className="text-sm font-semibold text-slate-500">· {d.semester.label}</span></h2>
                        {bisaKelola && (
                            <form onSubmit={simpan} className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end print:hidden">
                                <label className="col-span-2"><span className={labelClass}>Mapel</span>
                                    <select value={form.mapelId || ""} onChange={(e) => setForm({ ...form, mapelId: Number(e.target.value) })} required className={inputClass}>
                                        <option value="">— pilih —</option>
                                        {mapelKelas.map((m) => <option key={m.id} value={m.id}>{m.nama}{m.guru ? ` · ${m.guru}` : ""}</option>)}
                                    </select>
                                </label>
                                <label><span className={labelClass}>Hari</span>
                                    <select value={form.hari} onChange={(e) => setForm({ ...form, hari: Number(e.target.value) })} className={inputClass}>
                                        {HARI.slice(1).map((h, i) => <option key={h} value={i + 1}>{h}</option>)}
                                    </select>
                                </label>
                                <label><span className={labelClass}>Mulai</span><input type="time" value={form.jamMulai} onChange={(e) => setForm({ ...form, jamMulai: e.target.value })} required className={inputClass} /></label>
                                <label><span className={labelClass}>Selesai</span><input type="time" value={form.jamSelesai} onChange={(e) => setForm({ ...form, jamSelesai: e.target.value })} required className={inputClass} /></label>
                                <label><span className={labelClass}>Ruang</span><input value={form.ruang} onChange={(e) => setForm({ ...form, ruang: e.target.value })} maxLength={50} className={inputClass} placeholder="opsional" /></label>
                                <div className="col-span-2 md:col-span-6 flex gap-2">
                                    <button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">{form.id ? "Simpan Perubahan" : "Tambah Jadwal"}</button>
                                    {form.id > 0 && <button type="button" onClick={() => setForm(KOSONG)} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold">Batal</button>}
                                    <span className="text-xs text-slate-500 self-center">Jadwal yang bentrok dengan kelas atau guru yang sama akan ditolak.</span>
                                </div>
                            </form>
                        )}
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
                            {hariTampil.map((h) => {
                                const isi = d.jadwal.filter((j) => j.hari === h);
                                return (
                                    <section key={h} className={`bg-white rounded-2xl border p-4 break-inside-avoid ${h === hariIni && d.semester.aktif ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"}`}>
                                        <h3 className="font-black text-slate-800 mb-2">{HARI[h]}{h === hariIni && d.semester.aktif && <span className="ml-2 text-[10px] font-bold uppercase text-indigo-600 print:hidden">Hari ini</span>}</h3>
                                        <ul className="space-y-2">
                                            {isi.map((j) => (
                                                <li key={j.id} className="flex gap-3 text-sm">
                                                    <span className="w-24 shrink-0 font-mono text-xs text-slate-500 pt-0.5">{j.jamMulai}–{j.jamSelesai}</span>
                                                    <span className={`w-1 rounded-full shrink-0 bg-linear-to-b ${warnaMapel(j.mapel.id)}`} aria-hidden />
                                                    <span className="flex-1 min-w-0">
                                                        <b className="text-slate-800">{j.mapel.nama}</b>
                                                        <span className="block text-xs text-slate-500">{d.peran === "siswa" || pilih.kelas ? j.guru?.nama ?? "—" : j.kelas.nama}{j.ruang && ` · ${j.ruang}`}</span>
                                                    </span>
                                                    {bisaKelola && (
                                                        <span className="flex flex-col gap-1 print:hidden">
                                                            <button onClick={() => setForm({ id: j.id, mapelId: j.mapel.id, hari: j.hari, jamMulai: j.jamMulai, jamSelesai: j.jamSelesai, ruang: j.ruang })} className="text-[10px] font-bold text-amber-700 hover:underline">Edit</button>
                                                            <button onClick={() => hapus(j.id)} className="text-[10px] font-bold text-red-600 hover:underline">Hapus</button>
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                            {!isi.length && <li className="text-xs text-slate-400 italic">Tidak ada pelajaran</li>}
                                        </ul>
                                    </section>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
