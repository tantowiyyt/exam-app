"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

// ---------- util ----------

export const fmtTanggal = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";
export const fmtWaktu = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

/** ISO -> nilai input datetime-local (waktu lokal). */
export function toLocalInput(iso: string | null | undefined) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ID video YouTube dari link, null bila bukan YouTube. */
export function youtubeId(url: string): string | null {
    const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
    return m ? m[1] : null;
}

/** Warna kartu mapel yang konsisten per id. */
const WARNA = [
    "from-indigo-600 to-blue-500", "from-emerald-600 to-teal-500", "from-rose-600 to-pink-500", "from-amber-600 to-orange-500",
    "from-violet-600 to-purple-500", "from-cyan-600 to-sky-500", "from-lime-600 to-green-500", "from-fuchsia-600 to-pink-500",
];
export const warnaMapel = (id: number) => WARNA[id % WARNA.length];

export async function kirim(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
}

// ---------- tata letak ----------

interface Me { nama: string; role: string }

export function LmsNav({ judul, kembali }: { judul?: string; kembali?: { href: string; label: string } }) {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);

    useEffect(() => {
        let ignore = false;
        fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setMe(d); });
        return () => { ignore = true; };
    }, []);

    const keluar = async () => {
        await fetch("/api/logout", { method: "POST" });
        router.push("/login");
    };

    return (
        <nav className="bg-linear-to-r from-slate-900 to-indigo-950 text-white shadow-md sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
                <Link href="/kelas" className="font-black tracking-wider text-indigo-300 shrink-0">CAT<span className="text-white">·LMS</span></Link>
                {judul && <span className="text-white/60 text-sm truncate hidden sm:inline">| {judul}</span>}
                <div className="ml-auto flex items-center gap-2 text-xs">
                    {kembali && <Link href={kembali.href} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-bold">&larr; {kembali.label}</Link>}
                    {me?.role === "ADMIN" && <Link href="/admin" className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-bold hidden sm:inline">Admin</Link>}
                    {me?.role === "PESERTA" && <Link href="/dashboard" className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-bold hidden sm:inline">Ujian CAT</Link>}
                    <span className="hidden md:inline text-white/70 max-w-40 truncate" title={me?.nama}>{me?.nama}</span>
                    <Link href="/akun/password" className="text-white/70 hover:text-white font-bold hidden sm:inline">Password</Link>
                    <button onClick={keluar} className="text-red-300 hover:text-red-200 font-bold">Keluar</button>
                </div>
            </div>
        </nav>
    );
}

export function Modal({ judul, onClose, children }: { judul: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={judul} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="font-bold text-slate-800">{judul}</h2>
                    <button onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

export const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
export const labelClass = "block text-xs font-bold text-slate-600 uppercase mb-1";

// ---------- isi ----------

/** Teks biasa: baris baru dipertahankan, URL otomatis jadi tautan. Tidak merender HTML. */
export function IsiTeks({ teks, className = "" }: { teks: string; className?: string }) {
    if (!teks) return null;
    const bagian = teks.split(/(https?:\/\/[^\s<>"]+)/g);
    return (
        <div className={`whitespace-pre-wrap wrap-break-word leading-relaxed ${className}`}>
            {bagian.map((b, i) =>
                /^https?:\/\//.test(b)
                    ? <a key={i} href={b} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline break-all">{b}</a>
                    : <span key={i}>{b}</span>,
            )}
        </div>
    );
}

export function Lampiran({ url, nama }: { url: string; nama: string }) {
    if (!url) return null;
    const ext = (nama || url).split(".").pop()?.toUpperCase() ?? "FILE";
    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-3 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl px-3 py-2 max-w-full transition-colors">
            <span className="shrink-0 w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">{ext.slice(0, 4)}</span>
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-700 truncate">{nama || "Lampiran"}</span>
                <span className="block text-[11px] text-slate-400">Buka / unduh</span>
            </span>
        </a>
    );
}

export function VideoEmbed({ url }: { url: string }) {
    if (!url) return null;
    const yt = youtubeId(url);
    if (!yt) {
        return <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold underline break-all">Tonton video: {url}</a>;
    }
    return (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
            {/* YouTube menolak embed tanpa referrer; header situs memakai same-origin */}
            <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title="Video materi" className="w-full h-full" allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
        </div>
    );
}

/** Pilih & unggah satu lampiran; nilai = { url, nama }. */
export function UploadLampiran({ value, onChange }: { value: { url: string; nama: string }; onChange: (v: { url: string; nama: string }) => void }) {
    const { toast } = useToast();
    const [proses, setProses] = useState(false);

    const pilih = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { toast("Ukuran file maksimal 10 MB", "error"); return; }
        setProses(true);
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/lms/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        setProses(false);
        if (res.ok) onChange({ url: data.url, nama: data.nama });
        else toast(data.message || "Gagal mengunggah file", "error");
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {value.url ? (
                <>
                    <Lampiran url={value.url} nama={value.nama} />
                    <button type="button" onClick={() => onChange({ url: "", nama: "" })} className="text-xs text-red-600 font-bold">Hapus</button>
                </>
            ) : (
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 ${proses ? "opacity-60 pointer-events-none" : ""}`}>
                    {proses ? "Mengunggah..." : "+ Pilih file (PDF, Word, Excel, PPT, gambar, ZIP — maks 10 MB)"}
                    <input type="file" className="sr-only" onChange={pilih}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.zip" />
                </label>
            )}
        </div>
    );
}

// ---------- diskusi ----------

interface Komentar { id: number; isi: string; createdAt: string; penulis: string; peranPenulis: string; bolehHapus: boolean }

export function Diskusi({ target }: { target: { materiId?: number; tugasId?: number; pengumumanId?: number } }) {
    const { toast } = useToast();
    const [list, setList] = useState<Komentar[]>([]);
    const [isi, setIsi] = useState("");
    const [kirimProses, setKirimProses] = useState(false);
    const query = new URLSearchParams(Object.entries(target).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();

    const muat = useCallback(async () => {
        const res = await fetch(`/api/lms/komentar?${query}`);
        if (res.ok) setList((await res.json()).komentar);
    }, [query]);

    useEffect(() => {
        let ignore = false;
        fetch(`/api/lms/komentar?${query}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setList(d.komentar); });
        return () => { ignore = true; };
    }, [query]);

    const kirimKomentar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isi.trim()) return;
        setKirimProses(true);
        const { ok, data } = await kirim("/api/lms/komentar", "POST", { ...target, isi });
        setKirimProses(false);
        if (ok) { setIsi(""); muat(); } else toast(data.message || "Gagal mengirim", "error");
    };

    const hapus = async (id: number) => {
        if (!confirm("Hapus komentar ini?")) return;
        const { ok, data } = await kirim(`/api/lms/komentar?id=${id}`, "DELETE");
        if (ok) muat(); else toast(data.message || "Gagal menghapus", "error");
    };

    return (
        <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">Diskusi ({list.length})</h3>
            {list.length === 0 && <p className="text-xs text-slate-400 italic">Belum ada diskusi. Ajukan pertanyaan atau tanggapan di sini.</p>}
            <ul className="space-y-2">
                {list.map((k) => (
                    <li key={k.id} className="flex gap-3">
                        <span className={`shrink-0 w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${k.peranPenulis === "PESERTA" ? "bg-slate-200 text-slate-600" : "bg-indigo-600 text-white"}`}>
                            {k.penulis.charAt(0).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-700">{k.penulis}</span>
                                {k.peranPenulis !== "PESERTA" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{k.peranPenulis === "GURU" ? "Guru" : "Admin"}</span>}
                                <span className="text-[10px] text-slate-400">{fmtWaktu(k.createdAt)}</span>
                                {k.bolehHapus && <button onClick={() => hapus(k.id)} className="ml-auto text-[10px] text-red-500 hover:text-red-700 font-bold">Hapus</button>}
                            </div>
                            <IsiTeks teks={k.isi} className="text-sm text-slate-700 mt-0.5" />
                        </div>
                    </li>
                ))}
            </ul>
            <form onSubmit={kirimKomentar} className="flex gap-2">
                <textarea value={isi} onChange={(e) => setIsi(e.target.value)} rows={2} maxLength={2000} placeholder="Tulis komentar atau pertanyaan..."
                    aria-label="Komentar baru" className={`${inputClass} resize-y`} />
                <button type="submit" disabled={kirimProses || !isi.trim()} className="self-end px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">Kirim</button>
            </form>
        </section>
    );
}

// ---------- form materi & tugas ----------

export interface MateriData { id?: number; judul: string; isi: string; linkVideo: string; lampiran: string; namaLampiran: string; terbit: boolean }
export interface TugasData { id?: number; judul: string; deskripsi: string; lampiran: string; namaLampiran: string; tenggat: string | null; nilaiMaks: number; terbit: boolean }

export function FormMateri({ mapelId, awal, onClose, onSaved }: { mapelId: number; awal?: MateriData; onClose: () => void; onSaved: () => void }) {
    const { toast } = useToast();
    const [f, setF] = useState<MateriData>(awal ?? { judul: "", isi: "", linkVideo: "", lampiran: "", namaLampiran: "", terbit: true });
    const [simpan, setSimpan] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSimpan(true);
        const { ok, data } = await kirim("/api/lms/materi", f.id ? "PUT" : "POST", { ...f, mapelId });
        setSimpan(false);
        if (ok) { toast(f.id ? "Materi diperbarui" : "Materi ditambahkan", "success"); onSaved(); } else toast(data.message || "Gagal menyimpan", "error");
    };

    return (
        <Modal judul={f.id ? "Edit Materi" : "Tambah Materi"} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <label className="block"><span className={labelClass}>Judul</span>
                    <input value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} required maxLength={200} className={inputClass} placeholder="mis. Pertemuan 1 — Pengenalan Algoritma" />
                </label>
                <label className="block"><span className={labelClass}>Isi / Ringkasan Materi</span>
                    <textarea value={f.isi} onChange={(e) => setF({ ...f, isi: e.target.value })} rows={8} className={`${inputClass} resize-y`} placeholder="Tulis penjelasan materi. Link http(s) otomatis bisa diklik." />
                </label>
                <label className="block"><span className={labelClass}>Link Video (opsional)</span>
                    <input type="url" value={f.linkVideo} onChange={(e) => setF({ ...f, linkVideo: e.target.value })} className={inputClass} placeholder="https://www.youtube.com/watch?v=..." />
                    <span className="text-[10px] text-slate-400">Video YouTube ditampilkan langsung di halaman materi.</span>
                </label>
                <div><span className={labelClass}>Lampiran (opsional)</span>
                    <UploadLampiran value={{ url: f.lampiran, nama: f.namaLampiran }} onChange={(v) => setF({ ...f, lampiran: v.url, namaLampiran: v.nama })} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={f.terbit} onChange={(e) => setF({ ...f, terbit: e.target.checked })} />
                    Terbitkan (terlihat oleh siswa)
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button type="submit" disabled={simpan} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan"}</button>
                </div>
            </form>
        </Modal>
    );
}

export function FormTugas({ mapelId, awal, onClose, onSaved }: { mapelId: number; awal?: TugasData; onClose: () => void; onSaved: () => void }) {
    const { toast } = useToast();
    const [f, setF] = useState<TugasData>(awal ?? { judul: "", deskripsi: "", lampiran: "", namaLampiran: "", tenggat: null, nilaiMaks: 100, terbit: true });
    const [tenggatLokal, setTenggatLokal] = useState(toLocalInput(awal?.tenggat));
    const [simpan, setSimpan] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSimpan(true);
        const body = { ...f, mapelId, tenggat: tenggatLokal ? new Date(tenggatLokal).toISOString() : null };
        const { ok, data } = await kirim("/api/lms/tugas", f.id ? "PUT" : "POST", body);
        setSimpan(false);
        if (ok) { toast(f.id ? "Tugas diperbarui" : "Tugas ditambahkan", "success"); onSaved(); } else toast(data.message || "Gagal menyimpan", "error");
    };

    return (
        <Modal judul={f.id ? "Edit Tugas" : "Buat Tugas"} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <label className="block"><span className={labelClass}>Judul</span>
                    <input value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} required maxLength={200} className={inputClass} placeholder="mis. Latihan Soal Bab 1" />
                </label>
                <label className="block"><span className={labelClass}>Instruksi</span>
                    <textarea value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} rows={6} className={`${inputClass} resize-y`} placeholder="Jelaskan apa yang harus dikerjakan & dikumpulkan siswa." />
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block"><span className={labelClass}>Tenggat (opsional)</span>
                        <input type="datetime-local" value={tenggatLokal} onChange={(e) => setTenggatLokal(e.target.value)} className={inputClass} />
                    </label>
                    <label className="block"><span className={labelClass}>Nilai Maksimal</span>
                        <input type="number" min={1} max={1000} value={f.nilaiMaks} onChange={(e) => setF({ ...f, nilaiMaks: Number(e.target.value) })} required className={inputClass} />
                    </label>
                </div>
                <div><span className={labelClass}>Lampiran soal (opsional)</span>
                    <UploadLampiran value={{ url: f.lampiran, nama: f.namaLampiran }} onChange={(v) => setF({ ...f, lampiran: v.url, namaLampiran: v.nama })} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={f.terbit} onChange={(e) => setF({ ...f, terbit: e.target.checked })} />
                    Terbitkan (terlihat oleh siswa)
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button type="submit" disabled={simpan} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan"}</button>
                </div>
            </form>
        </Modal>
    );
}

/** Status tugas untuk siswa. */
export function statusTugas(tenggat: string | null, kumpul: { dikumpulkanAt: string; nilai: number | null } | null) {
    if (kumpul?.nilai !== null && kumpul?.nilai !== undefined) return { label: `Dinilai: ${kumpul.nilai}`, cls: "bg-emerald-100 text-emerald-700" };
    if (kumpul) {
        const telat = tenggat && new Date(kumpul.dikumpulkanAt) > new Date(tenggat);
        return telat ? { label: "Dikumpulkan (terlambat)", cls: "bg-amber-100 text-amber-700" } : { label: "Sudah dikumpulkan", cls: "bg-sky-100 text-sky-700" };
    }
    if (tenggat && new Date(tenggat) < new Date()) return { label: "Lewat tenggat", cls: "bg-red-100 text-red-700" };
    return { label: "Belum dikumpulkan", cls: "bg-slate-200 text-slate-600" };
}
