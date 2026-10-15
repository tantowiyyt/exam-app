"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

// Notifikasi di luar aplikasi: email (SMTP) dan WhatsApp (gateway). Dipakai untuk kode lupa password,
// tugas baru, pengumuman, pengingat tenggat, dan jadwal ujian. Rahasia tidak pernah ditampilkan kembali.

interface Pengaturan {
    emailAktif: string; smtpHost: string; smtpPort: string; smtpUser: string; smtpPass: string; smtpDari: string;
    waAktif: string; waPenyedia: string; waUrl: string; waToken: string;
    kirimTugas: string; kirimPengumuman: string; kirimUjian: string; pengingatTenggat: string;
    adaRahasia: { smtpPass: boolean; waToken: boolean };
}
interface Log { id: number; kanal: string; tujuan: string; judul: string; status: string; error: string; createdAt: string }

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const labelClass = "block text-xs font-bold text-slate-600 uppercase mb-1";

function Saklar({ nilai, onChange, label }: { nilai: string; onChange: (v: string) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={nilai === "aktif"} onChange={(e) => onChange(e.target.checked ? "aktif" : "nonaktif")} className="w-4 h-4" /> {label}
        </label>
    );
}

export default function NotifikasiPage() {
    const { toast } = useToast();
    const [p, setP] = useState<Pengaturan | null>(null);
    const [log, setLog] = useState<Log[]>([]);
    const [uji, setUji] = useState({ email: "", wa: "" });
    const [proses, setProses] = useState("");

    const muat = () => fetch("/api/admin/notifikasi").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setP(d.pengaturan); setLog(d.log); } });
    useEffect(() => {
        let ignore = false;
        fetch("/api/admin/notifikasi").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) { setP(d.pengaturan); setLog(d.log); } });
        return () => { ignore = true; };
    }, []);

    const api = async (method: string, body: unknown, label: string) => {
        setProses(label);
        const res = await fetch("/api/admin/notifikasi", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        setProses("");
        toast(d.message || (res.ok ? "Berhasil" : "Gagal"), res.ok ? "success" : "error");
        if (res.ok) muat();
        return res.ok;
    };

    if (!p) return <div className="min-h-screen bg-slate-100"><HeaderHalaman grup="Sistem" judul="Notifikasi WhatsApp & Email" /><p className="p-8 text-slate-500">Memuat...</p></div>;
    const set = (k: keyof Pengaturan, v: string) => setP({ ...p, [k]: v });

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Sistem" judul="Notifikasi WhatsApp & Email">
                <button onClick={() => api("POST", { aksi: "jalankan" }, "jalankan")} disabled={!!proses} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold disabled:opacity-50">{proses === "jalankan" ? "Mengirim..." : "Kirim pengingat sekarang"}</button>
            </HeaderHalaman>
            <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
                <p className="text-sm text-slate-600 bg-white rounded-2xl border border-slate-200 p-4">
                    Notifikasi dikirim ke email dan No. HP yang diisi siswa di Data Diri (atau oleh admin). Dipakai untuk <b>kode lupa password</b> dan, bila diaktifkan di bawah,
                    tugas baru, pengumuman, pengingat tenggat (24 jam sebelumnya, hanya untuk yang belum mengumpulkan), dan jadwal ujian (24 jam sebelumnya). Pengingat diperiksa otomatis tiap 10 menit;
                    setiap pesan hanya dikirim sekali. Siswa bisa mematikan pengingat di Data Diri.
                </p>
                <form onSubmit={(e) => { e.preventDefault(); api("PUT", p, "simpan"); }} className="grid lg:grid-cols-2 gap-6">
                    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                        <div className="flex items-center"><h2 className="font-bold text-slate-800 flex-1">WhatsApp</h2><Saklar nilai={p.waAktif} onChange={(v) => set("waAktif", v)} label="Aktif" /></div>
                        <label className="block"><span className={labelClass}>Penyedia gateway</span>
                            <select value={p.waPenyedia} onChange={(e) => set("waPenyedia", e.target.value)} className={inputClass}>
                                <option value="fonnte">Fonnte (fonnte.com)</option><option value="wablas">Wablas</option><option value="lain">Lainnya (POST JSON target & message)</option>
                            </select>
                        </label>
                        {p.waPenyedia !== "fonnte" && (
                            <label className="block"><span className={labelClass}>{p.waPenyedia === "wablas" ? "URL server Wablas" : "URL endpoint"}</span>
                                <input value={p.waUrl} onChange={(e) => set("waUrl", e.target.value)} placeholder={p.waPenyedia === "wablas" ? "https://solo.wablas.com" : "https://..."} className={inputClass} />
                            </label>
                        )}
                        <label className="block"><span className={labelClass}>Token / API key</span>
                            <input type="password" value={p.waToken} onChange={(e) => set("waToken", e.target.value)} placeholder={p.adaRahasia.waToken ? "•••••• (tersimpan, isi untuk mengganti)" : "Token dari penyedia"} className={inputClass} autoComplete="new-password" />
                        </label>
                        <div className="flex gap-2 pt-2 border-t border-slate-100">
                            <input value={uji.wa} onChange={(e) => setUji({ ...uji, wa: e.target.value })} placeholder="08xxxxxxxxxx" aria-label="Nomor uji" className={inputClass} />
                            <button type="button" onClick={() => api("POST", { kanal: "wa", tujuan: uji.wa }, "uji-wa")} disabled={!!proses || !uji.wa} className="shrink-0 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">Kirim uji</button>
                        </div>
                    </section>
                    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                        <div className="flex items-center"><h2 className="font-bold text-slate-800 flex-1">Email (SMTP)</h2><Saklar nilai={p.emailAktif} onChange={(v) => set("emailAktif", v)} label="Aktif" /></div>
                        <div className="grid grid-cols-[1fr_6rem] gap-2">
                            <label className="block"><span className={labelClass}>Server SMTP</span><input value={p.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" className={inputClass} /></label>
                            <label className="block"><span className={labelClass}>Port</span><input value={p.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} className={inputClass} /></label>
                        </div>
                        <label className="block"><span className={labelClass}>Username</span><input value={p.smtpUser} onChange={(e) => set("smtpUser", e.target.value)} className={inputClass} autoComplete="off" /></label>
                        <label className="block"><span className={labelClass}>Password (untuk Gmail: App Password)</span>
                            <input type="password" value={p.smtpPass} onChange={(e) => set("smtpPass", e.target.value)} placeholder={p.adaRahasia.smtpPass ? "•••••• (tersimpan, isi untuk mengganti)" : ""} className={inputClass} autoComplete="new-password" />
                        </label>
                        <label className="block"><span className={labelClass}>Alamat pengirim</span><input value={p.smtpDari} onChange={(e) => set("smtpDari", e.target.value)} placeholder="sekolah@contoh.sch.id" className={inputClass} /></label>
                        <div className="flex gap-2 pt-2 border-t border-slate-100">
                            <input value={uji.email} onChange={(e) => setUji({ ...uji, email: e.target.value })} placeholder="email tujuan uji" aria-label="Email uji" className={inputClass} />
                            <button type="button" onClick={() => api("POST", { kanal: "email", tujuan: uji.email }, "uji-email")} disabled={!!proses || !uji.email} className="shrink-0 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">Kirim uji</button>
                        </div>
                    </section>
                    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 lg:col-span-2">
                        <h2 className="font-bold text-slate-800 mb-1">Yang dikirim</h2>
                        <div className="grid sm:grid-cols-2 gap-2">
                            <Saklar nilai={p.kirimTugas} onChange={(v) => set("kirimTugas", v)} label="Tugas baru" />
                            <Saklar nilai={p.pengingatTenggat} onChange={(v) => set("pengingatTenggat", v)} label="Pengingat tenggat tugas (H-1)" />
                            <Saklar nilai={p.kirimPengumuman} onChange={(v) => set("kirimPengumuman", v)} label="Pengumuman mapel" />
                            <Saklar nilai={p.kirimUjian} onChange={(v) => set("kirimUjian", v)} label="Jadwal ujian (H-1)" />
                        </div>
                        <p className="text-xs text-slate-500">Kode lupa password selalu dikirim bila kanal aktif.</p>
                        <button disabled={!!proses} className="mt-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{proses === "simpan" ? "Menyimpan..." : "Simpan Pengaturan"}</button>
                    </section>
                </form>
                <section className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                    <h2 className="font-bold text-slate-800 p-4 border-b border-slate-100">Pengiriman terakhir</h2>
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Waktu</th><th className="p-2">Kanal</th><th className="p-2 text-left">Tujuan</th><th className="p-2 text-left">Judul</th><th className="p-2">Status</th></tr></thead>
                        <tbody>
                            {log.map((l) => (
                                <tr key={l.id} className="border-t border-slate-100">
                                    <td className="p-2 text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString("id-ID")}</td>
                                    <td className="p-2 text-center text-xs font-bold">{l.kanal === "wa" ? "WA" : "Email"}</td>
                                    <td className="p-2 text-xs font-mono">{l.tujuan}</td>
                                    <td className="p-2 text-xs">{l.judul}</td>
                                    <td className="p-2 text-center"><span title={l.error} className={`text-[10px] font-bold px-2 py-0.5 rounded ${l.status === "terkirim" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{l.status}</span></td>
                                </tr>
                            ))}
                            {!log.length && <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">Belum ada pengiriman.</td></tr>}
                        </tbody>
                    </table>
                </section>
            </main>
        </div>
    );
}
