"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman, muatIdentitas, type Identitas } from "@/components/AppShell";

// Daftar hadir & berita acara ujian CAT per ruang dan sesi (admin & pengawas). Kehadiran otomatis dari sesi ujian.

interface Peserta { id: number; nomorPeserta: string; nama: string; kelas: string; hadir: boolean; selesai: boolean; keterangan: string }
interface Data {
    daftarUjian: { id: number; nama: string; aktif: boolean }[];
    ujian: { id: number; nama: string; durasiMenit: number; jadwalMulai: string | null; jadwalSelesai: string | null } | null;
    ruangSesi: { ruang: string; sesi: string }[];
    ruang: string; sesi: string;
    peserta: Peserta[];
    beritaAcara: { mulai: string | null; selesai: string | null; catatan: string; namaPengawas: string } | null;
    saranMulai: string | null;
    pengawas: string;
}
const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const lokal = (iso: string | null | undefined) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const jam = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "........");

export default function BeritaAcaraPage() {
    const { toast } = useToast();
    const [q, setQ] = useState<{ ujian?: number; ruang?: string; sesi?: string }>({});
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [form, setForm] = useState({ mulai: "", selesai: "", catatan: "", ket: {} as Record<number, string> });
    const [cetak, setCetak] = useState<"hadir" | "berita">("hadir");
    const [identitas, setIdentitas] = useState<Identitas | null>(null);
    const [versi, setVersi] = useState(0);

    useEffect(() => { muatIdentitas().then(setIdentitas); }, []);
    useEffect(() => {
        let ignore = false;
        const p = new URLSearchParams();
        if (q.ujian) p.set("ujian", String(q.ujian));
        if (q.ruang !== undefined) p.set("ruang", q.ruang);
        if (q.sesi !== undefined) p.set("sesi", q.sesi);
        fetch(`/api/admin/berita-acara?${p}`).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).then(({ ok, data }) => {
            if (ignore) return;
            if (!ok) return setError(data.message || "Gagal memuat");
            setError("");
            setD(data);
            setForm({
                mulai: lokal(data.beritaAcara?.mulai ?? data.saranMulai), selesai: lokal(data.beritaAcara?.selesai), catatan: data.beritaAcara?.catatan ?? "",
                ket: Object.fromEntries((data.peserta as Peserta[]).filter((x) => x.keterangan).map((x) => [x.id, x.keterangan])),
            });
        });
        return () => { ignore = true; };
    }, [q, versi]);

    const simpan = async () => {
        if (!d?.ujian) return;
        const res = await fetch("/api/admin/berita-acara", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ujian: d.ujian.id, ruang: d.ruang, sesi: d.sesi, catatan: form.catatan,
                mulai: form.mulai ? new Date(form.mulai).toISOString() : null, selesai: form.selesai ? new Date(form.selesai).toISOString() : null,
                tidakHadir: Object.entries(form.ket).map(([userId, keterangan]) => ({ userId: Number(userId), keterangan })),
            }),
        });
        const data = await res.json().catch(() => ({}));
        toast(data.message || (res.ok ? "Tersimpan" : "Gagal"), res.ok ? "success" : "error");
        if (res.ok) setVersi((v) => v + 1);
    };

    const hadir = d?.peserta.filter((p) => p.hadir) ?? [];
    const tidak = d?.peserta.filter((p) => !p.hadir) ?? [];
    const tanggal = form.mulai ? new Date(form.mulai).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "........................";
    const kop = (
        <div className="hidden print:block text-center border-b-2 border-black pb-2 mb-3">
            <p className="font-black uppercase">{identitas?.namaSekolah || identitas?.namaAplikasi}</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-100 font-sans print:bg-white">
            <HeaderHalaman grup="Modul Ujian CAT" judul="Berita Acara & Daftar Hadir">
                {d && d.daftarUjian.length > 0 && (
                    <select value={d.ujian?.id ?? ""} onChange={(e) => setQ({ ujian: Number(e.target.value) })} aria-label="Ujian" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold max-w-60">
                        {d.daftarUjian.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.aktif ? " (aktif)" : ""}</option>)}
                    </select>
                )}
                {d && d.ruangSesi.length > 0 && (
                    <select value={`${d.ruang}|${d.sesi}`} onChange={(e) => { const [ruang, sesi] = e.target.value.split("|"); setQ({ ujian: d.ujian?.id, ruang, sesi }); }} aria-label="Ruang & sesi" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {d.ruangSesi.map((k) => <option key={`${k.ruang}|${k.sesi}`} value={`${k.ruang}|${k.sesi}`}>Ruang {k.ruang || "-"} · Sesi {k.sesi || "-"}</option>)}
                    </select>
                )}
                <select value={cetak} onChange={(e) => setCetak(e.target.value as "hadir" | "berita")} aria-label="Dokumen" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                    <option value="hadir">Daftar Hadir</option><option value="berita">Berita Acara</option>
                </select>
                <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Cetak</button>
            </HeaderHalaman>
            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6 print:p-0">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {d && !d.ujian && <p className="text-slate-500">Belum ada ujian.</p>}
                {d?.ujian && (
                    <>
                        <section className="grid grid-cols-3 gap-3 print:hidden">
                            {([["Peserta", d.peserta.length], ["Hadir", hadir.length], ["Tidak hadir", tidak.length]] as [string, number][]).map(([l, v]) => (
                                <div key={l} className="bg-white rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-500">{l}</p><p className="text-2xl font-black text-slate-800">{v}</p></div>
                            ))}
                        </section>

                        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 print:hidden">
                            <h2 className="font-bold text-slate-800">Isi Berita Acara</h2>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label><span className="block text-xs font-bold text-slate-600 uppercase mb-1">Mulai</span><input type="datetime-local" value={form.mulai} onChange={(e) => setForm({ ...form, mulai: e.target.value })} className={inputClass} /></label>
                                <label><span className="block text-xs font-bold text-slate-600 uppercase mb-1">Selesai</span><input type="datetime-local" value={form.selesai} onChange={(e) => setForm({ ...form, selesai: e.target.value })} className={inputClass} /></label>
                            </div>
                            <label className="block"><span className="block text-xs font-bold text-slate-600 uppercase mb-1">Catatan kejadian</span>
                                <textarea value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} rows={3} maxLength={5000} placeholder="mis. Komputer no. 12 mati 10 menit, peserta pindah ke komputer 15 dan diberi tambahan waktu." className={inputClass} />
                            </label>
                            {tidak.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-600 uppercase mb-1">Keterangan peserta tidak hadir</p>
                                    <div className="space-y-1">
                                        {tidak.map((p) => (
                                            <div key={p.id} className="flex gap-2 items-center text-sm">
                                                <span className="w-56 truncate">{p.nama} <span className="text-xs text-slate-500 font-mono">{p.nomorPeserta}</span></span>
                                                <input value={form.ket[p.id] ?? ""} onChange={(e) => setForm({ ...form, ket: { ...form.ket, [p.id]: e.target.value } })} placeholder="sakit / izin / tanpa keterangan" aria-label={`Keterangan ${p.nama}`} className={inputClass} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <button onClick={simpan} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Simpan</button>
                            {d.beritaAcara && <p className="text-xs text-slate-500">Terakhir disimpan oleh {d.beritaAcara.namaPengawas}.</p>}
                        </section>

                        {/* Dokumen cetak */}
                        <article className="bg-white rounded-2xl border border-slate-200 p-6 md:p-10 text-[13px] text-slate-900 print:border-0 print:p-0 print:rounded-none">
                            {kop}
                            {cetak === "hadir" ? (
                                <>
                                    <h2 className="text-center font-black tracking-wide">DAFTAR HADIR PESERTA</h2>
                                    <p className="text-center mb-3">{d.ujian.nama}</p>
                                    <p className="mb-2">Ruang: <b>{d.ruang || "-"}</b> · Sesi: <b>{d.sesi || "-"}</b> · {tanggal}</p>
                                    <table className="w-full border-collapse text-[12px]">
                                        <thead><tr className="bg-slate-100">{["No", "No. Peserta", "Nama", "Kelas", "Tanda Tangan", "Ket."].map((h) => <th key={h} className="border border-slate-500 px-2 py-1">{h}</th>)}</tr></thead>
                                        <tbody>
                                            {d.peserta.map((p, i) => (
                                                <tr key={p.id}>
                                                    <td className="border border-slate-500 px-2 py-2 text-center">{i + 1}</td>
                                                    <td className="border border-slate-500 px-2 font-mono">{p.nomorPeserta}</td>
                                                    <td className="border border-slate-500 px-2">{p.nama}</td>
                                                    <td className="border border-slate-500 px-2">{p.kelas}</td>
                                                    <td className={`border border-slate-500 px-2 w-40 ${i % 2 ? "text-right" : ""}`}>{i + 1}.</td>
                                                    <td className="border border-slate-500 px-2 text-[11px]">{p.hadir ? "" : form.ket[p.id] || "Tidak hadir"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            ) : (
                                <>
                                    <h2 className="text-center font-black tracking-wide">BERITA ACARA PELAKSANAAN UJIAN</h2>
                                    <p className="text-center mb-4">{d.ujian.nama}</p>
                                    <p className="leading-relaxed">
                                        Pada hari ini <b>{tanggal}</b>, telah diselenggarakan <b>{d.ujian.nama}</b> berbasis komputer (CAT)
                                        di ruang <b>{d.ruang || "-"}</b> sesi <b>{d.sesi || "-"}</b>, mulai pukul <b>{jam(form.mulai ? new Date(form.mulai).toISOString() : null)}</b> sampai
                                        pukul <b>{jam(form.selesai ? new Date(form.selesai).toISOString() : null)}</b>.
                                    </p>
                                    <table className="my-4 text-[13px]">
                                        <tbody>
                                            <tr><td className="pr-4">Jumlah peserta seharusnya</td><td>: {d.peserta.length} orang</td></tr>
                                            <tr><td className="pr-4">Jumlah peserta hadir</td><td>: {hadir.length} orang</td></tr>
                                            <tr><td className="pr-4">Jumlah peserta tidak hadir</td><td>: {tidak.length} orang</td></tr>
                                        </tbody>
                                    </table>
                                    {tidak.length > 0 && (
                                        <>
                                            <p className="font-semibold">Peserta tidak hadir:</p>
                                            <ol className="list-decimal pl-6 mb-4">{tidak.map((p) => <li key={p.id}>{p.nomorPeserta} — {p.nama} ({p.kelas}){form.ket[p.id] ? `: ${form.ket[p.id]}` : ""}</li>)}</ol>
                                        </>
                                    )}
                                    <p className="font-semibold">Catatan selama pelaksanaan ujian:</p>
                                    <div className="border border-slate-500 min-h-24 p-2 whitespace-pre-wrap mb-8">{form.catatan || "Ujian berjalan tertib dan lancar."}</div>
                                    <div className="flex justify-end">
                                        <div className="text-center">
                                            <p>Pengawas,</p>
                                            <p className="mt-16 font-bold underline">{d.beritaAcara?.namaPengawas || d.pengawas || "............................"}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </article>
                    </>
                )}
            </main>
        </div>
    );
}
