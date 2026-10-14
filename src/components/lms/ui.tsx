"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

/** Sub-judul halaman di dalam kerangka aplikasi (AppShell): tombol kembali + judul. */
export function LmsNav({ judul, kembali }: { judul?: string; kembali?: { href: string; label: string } }) {
    if (!judul && !kembali) return null;
    return (
        <div className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-2.5 flex items-center gap-3 text-sm min-w-0">
                {kembali && <Link href={kembali.href} className="shrink-0 font-bold text-indigo-600 hover:text-indigo-800">&larr; {kembali.label}</Link>}
                {judul && <span className="text-slate-500 truncate">{judul}</span>}
            </div>
        </div>
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

export type Berkas = { url: string; nama: string };
export const MAKS_BERKAS = 5;

/** Daftar beberapa lampiran. */
export function DaftarLampiran({ berkas }: { berkas: Berkas[] }) {
    if (!berkas.length) return null;
    return <div className="flex flex-wrap gap-2">{berkas.map((b) => <Lampiran key={b.url} url={b.url} nama={b.nama} />)}</div>;
}

/** Unggah beberapa lampiran (maks 5). */
export function UploadBerkas({ value, onChange }: { value: Berkas[]; onChange: (v: Berkas[]) => void }) {
    return (
        <div className="space-y-2">
            {value.map((b) => (
                <div key={b.url} className="flex flex-wrap items-center gap-2">
                    <Lampiran url={b.url} nama={b.nama} />
                    <button type="button" onClick={() => onChange(value.filter((x) => x.url !== b.url))} className="text-xs text-red-600 font-bold">Hapus</button>
                </div>
            ))}
            {value.length < MAKS_BERKAS && (
                <UploadLampiran value={{ url: "", nama: "" }} onChange={(v) => { if (v.url) onChange([...value, v]); }} />
            )}
            {value.length > 0 && <p className="text-[10px] text-slate-400">{value.length}/{MAKS_BERKAS} file</p>}
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

// ---------- topik & jadwal terbit (dipakai form materi, tugas, kuis) ----------

/** Pilih topik mapel; daftar topik dimuat sendiri. */
export function PilihTopik({ mapelId, value, onChange }: { mapelId: number; value: number | null | undefined; onChange: (v: number | null) => void }) {
    const [topik, setTopik] = useState<{ id: number; judul: string }[] | null>(null);
    useEffect(() => {
        let ignore = false;
        fetch(`/api/lms/topik?mapelId=${mapelId}`).then((r) => (r.ok ? r.json() : { topik: [] })).then((d) => { if (!ignore) setTopik(d.topik ?? []); });
        return () => { ignore = true; };
    }, [mapelId]);
    if (!topik?.length) return null;
    return (
        <label className="block"><span className={labelClass}>Topik</span>
            <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
                <option value="">— Tanpa topik —</option>
                {topik.map((t) => <option key={t.id} value={t.id}>{t.judul}</option>)}
            </select>
        </label>
    );
}

/** Centang "Terbitkan" + pilihan jadwal terbit otomatis. */
export function PilihTerbit({ terbit, terbitPada, onChange }: { terbit: boolean; terbitPada: string | null | undefined; onChange: (v: { terbit: boolean; terbitPada: string | null }) => void }) {
    const [lokal, setLokal] = useState(toLocalInput(terbitPada));
    const jadwal = terbit && !!terbitPada;
    return (
        <fieldset className="space-y-2">
            <legend className={labelClass}>Penerbitan</legend>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="radio" name="terbit" checked={!terbit} onChange={() => onChange({ terbit: false, terbitPada: null })} /> Draf</label>
                <label className="flex items-center gap-2"><input type="radio" name="terbit" checked={terbit && !terbitPada} onChange={() => onChange({ terbit: true, terbitPada: null })} /> Terbitkan sekarang</label>
                <label className="flex items-center gap-2"><input type="radio" name="terbit" checked={jadwal} onChange={() => {
                    const besok = lokal || toLocalInput(new Date(Date.now() + 86400000).toISOString());
                    setLokal(besok);
                    onChange({ terbit: true, terbitPada: new Date(besok).toISOString() });
                }} /> Jadwalkan</label>
            </div>
            {jadwal && (
                <div>
                    <input type="datetime-local" value={lokal} required aria-label="Waktu terbit" className={inputClass}
                        onChange={(e) => { setLokal(e.target.value); if (e.target.value) onChange({ terbit: true, terbitPada: new Date(e.target.value).toISOString() }); }} />
                    <span className="text-[10px] text-slate-400">Siswa baru bisa melihat & mendapat notifikasi pada waktu ini.</span>
                </div>
            )}
        </fieldset>
    );
}

/** Label "Terjadwal ..." untuk daftar pengelola. */
export function LabelTerbit({ terbit, terbitPada }: { terbit: boolean; terbitPada?: string | null }) {
    if (!terbit) return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600 whitespace-nowrap">Draf</span>;
    if (terbitPada && new Date(terbitPada) > new Date()) {
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-700 whitespace-nowrap" title="Terbit otomatis">Terjadwal {fmtWaktu(terbitPada)}</span>;
    }
    return null;
}

// ---------- form materi & tugas ----------

export interface MateriData { id?: number; judul: string; isi: string; linkVideo: string; lampiran: string; namaLampiran: string; terbit: boolean; terbitPada?: string | null; topikId?: number | null }
export interface TugasData {
    id?: number; judul: string; deskripsi: string; berkas: Berkas[]; tenggat: string | null; nilaiMaks: number; terbit: boolean;
    terimaTerlambat: boolean; untukSiswa: number[]; terbitPada?: string | null; topikId?: number | null; rubrik?: Kriteria[];
}
export type Kriteria = { kriteria: string; deskripsi: string; maks: number };

/** Tabel rubrik; nilai = skor per kriteria (opsional). */
export function TabelRubrik({ rubrik, nilai }: { rubrik: Kriteria[]; nilai?: number[] }) {
    if (!rubrik.length) return null;
    return (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Kriteria penilaian</th><th className="px-3 py-2 text-center w-24">{nilai?.length ? "Skor" : "Maks"}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {rubrik.map((r, i) => (
                        <tr key={i}>
                            <td className="px-3 py-2"><p className="font-semibold text-slate-700">{r.kriteria}</p>{r.deskripsi && <p className="text-[11px] text-slate-500 whitespace-pre-wrap">{r.deskripsi}</p>}</td>
                            <td className="px-3 py-2 text-center font-bold text-slate-700">{nilai?.length ? `${nilai[i] ?? 0}/${r.maks}` : r.maks}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

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
                <PilihTopik mapelId={mapelId} value={f.topikId} onChange={(topikId) => setF({ ...f, topikId })} />
                <PilihTerbit terbit={f.terbit} terbitPada={f.terbitPada} onChange={(v) => setF({ ...f, ...v })} />
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
    const [f, setF] = useState<TugasData>(awal ?? { judul: "", deskripsi: "", berkas: [], tenggat: null, nilaiMaks: 100, terbit: true, terimaTerlambat: true, untukSiswa: [] });
    const [tenggatLokal, setTenggatLokal] = useState(toLocalInput(awal?.tenggat));
    const [simpan, setSimpan] = useState(false);
    const [tertentu, setTertentu] = useState((awal?.untukSiswa.length ?? 0) > 0);
    const [siswa, setSiswa] = useState<{ id: number; nama: string; nomorPeserta: string }[] | null>(null);

    // Daftar siswa kelas — dimuat saat memilih "siswa tertentu" (atau langsung bila tugas sudah untuk siswa tertentu)
    useEffect(() => {
        if (!tertentu || siswa !== null) return;
        let ignore = false;
        fetch(`/api/lms/mapel/${mapelId}`).then((r) => r.json()).then((d) => { if (!ignore) setSiswa(d.siswa ?? []); }).catch(() => { if (!ignore) setSiswa([]); });
        return () => { ignore = true; };
    }, [tertentu, siswa, mapelId]);

    const rubrik = f.rubrik ?? [];
    const pakaiRubrik = rubrik.length > 0;
    const totalRubrik = rubrik.reduce((a, r) => a + (Number(r.maks) || 0), 0);
    const ubahKriteria = (i: number, v: Partial<Kriteria>) => setF({ ...f, rubrik: rubrik.map((r, j) => (j === i ? { ...r, ...v } : r)) });

    const toggleSiswa = (id: number) =>
        setF({ ...f, untukSiswa: f.untukSiswa.includes(id) ? f.untukSiswa.filter((x) => x !== id) : [...f.untukSiswa, id] });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (tertentu && f.untukSiswa.length === 0) { toast("Pilih minimal satu siswa", "error"); return; }
        setSimpan(true);
        const body = { ...f, untukSiswa: tertentu ? f.untukSiswa : [], mapelId, tenggat: tenggatLokal ? new Date(tenggatLokal).toISOString() : null };
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
                        <input type="number" min={1} max={1000} value={pakaiRubrik ? totalRubrik : f.nilaiMaks} disabled={pakaiRubrik}
                            onChange={(e) => setF({ ...f, nilaiMaks: Number(e.target.value) })} required className={`${inputClass} disabled:bg-slate-100`} />
                        {pakaiRubrik && <span className="text-[10px] text-slate-400">Jumlah skor maksimal rubrik</span>}
                    </label>
                </div>

                <fieldset className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={pakaiRubrik} onChange={(e) => setF({ ...f, rubrik: e.target.checked ? [{ kriteria: "", deskripsi: "", maks: 25 }] : [] })} />
                        Nilai dengan rubrik (skor per kriteria, terlihat siswa)
                    </label>
                    {pakaiRubrik && (
                        <div className="space-y-2 border border-slate-200 rounded-lg p-3">
                            {rubrik.map((r, i) => (
                                <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-2 items-start">
                                    <div className="space-y-1">
                                        <input value={r.kriteria} onChange={(e) => ubahKriteria(i, { kriteria: e.target.value })} required maxLength={200} placeholder={`Kriteria ${i + 1}, mis. Ketepatan isi`} aria-label={`Kriteria ${i + 1}`} className={inputClass} />
                                        <input value={r.deskripsi} onChange={(e) => ubahKriteria(i, { deskripsi: e.target.value })} maxLength={1000} placeholder="Deskripsi (opsional)" aria-label={`Deskripsi kriteria ${i + 1}`} className={`${inputClass} text-xs`} />
                                    </div>
                                    <input type="number" min={1} max={1000} value={r.maks} onChange={(e) => ubahKriteria(i, { maks: Number(e.target.value) })} required aria-label={`Skor maksimal kriteria ${i + 1}`} className={inputClass} />
                                    <button type="button" onClick={() => setF({ ...f, rubrik: rubrik.filter((_, j) => j !== i) })} aria-label={`Hapus kriteria ${i + 1}`} className="h-9 px-2 text-slate-400 hover:text-red-600">&times;</button>
                                </div>
                            ))}
                            {rubrik.length < 20 && <button type="button" onClick={() => setF({ ...f, rubrik: [...rubrik, { kriteria: "", deskripsi: "", maks: 25 }] })} className="text-xs font-bold text-indigo-600 hover:underline">+ Kriteria</button>}
                        </div>
                    )}
                </fieldset>
                {tenggatLokal && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={f.terimaTerlambat} onChange={(e) => setF({ ...f, terimaTerlambat: e.target.checked })} />
                        Terima pengumpulan setelah tenggat (ditandai &quot;terlambat&quot;)
                    </label>
                )}

                <fieldset>
                    <legend className={labelClass}>Diberikan kepada</legend>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                        <label className="flex items-center gap-2"><input type="radio" name="untuk" checked={!tertentu} onChange={() => setTertentu(false)} /> Semua siswa kelas</label>
                        <label className="flex items-center gap-2"><input type="radio" name="untuk" checked={tertentu} onChange={() => setTertentu(true)} /> Siswa tertentu</label>
                    </div>
                    {tertentu && (
                        <div className="mt-2 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                            {siswa === null && <p className="p-3 text-xs text-slate-400">Memuat siswa...</p>}
                            {siswa?.length === 0 && <p className="p-3 text-xs text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
                            {siswa && siswa.length > 0 && (
                                <div className="flex gap-3 px-3 py-2 border-b border-slate-100 text-[11px] font-bold">
                                    <button type="button" onClick={() => setF({ ...f, untukSiswa: siswa.map((s) => s.id) })} className="text-indigo-600 hover:underline">Pilih semua</button>
                                    <button type="button" onClick={() => setF({ ...f, untukSiswa: [] })} className="text-slate-500 hover:underline">Kosongkan</button>
                                    <span className="ml-auto text-slate-500">{f.untukSiswa.length} dipilih</span>
                                </div>
                            )}
                            {siswa?.map((s) => (
                                <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                                    <input type="checkbox" checked={f.untukSiswa.includes(s.id)} onChange={() => toggleSiswa(s.id)} />
                                    <span className="flex-1">{s.nama}</span>
                                    <span className="font-mono text-[10px] text-slate-400">{s.nomorPeserta}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </fieldset>

                <div><span className={labelClass}>Lampiran soal (opsional, maks {MAKS_BERKAS})</span>
                    <UploadBerkas value={f.berkas} onChange={(berkas) => setF({ ...f, berkas })} />
                </div>
                <PilihTopik mapelId={mapelId} value={f.topikId} onChange={(topikId) => setF({ ...f, topikId })} />
                <PilihTerbit terbit={f.terbit} terbitPada={f.terbitPada} onChange={(v) => setF({ ...f, ...v })} />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button type="submit" disabled={simpan} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan"}</button>
                </div>
            </form>
        </Modal>
    );
}

/** Status tugas untuk siswa. */
export function statusTugas(tenggat: string | null, kumpul: { dikumpulkanAt: string; nilai: number | null; status?: string } | null) {
    if (kumpul?.nilai !== null && kumpul?.nilai !== undefined) return { label: `Dinilai: ${kumpul.nilai}`, cls: "bg-emerald-100 text-emerald-700" };
    if (kumpul?.status === "revisi") return { label: "Perlu revisi", cls: "bg-orange-100 text-orange-700" };
    if (kumpul) {
        const telat = tenggat && new Date(kumpul.dikumpulkanAt) > new Date(tenggat);
        return telat ? { label: "Dikumpulkan (terlambat)", cls: "bg-amber-100 text-amber-700" } : { label: "Sudah dikumpulkan", cls: "bg-sky-100 text-sky-700" };
    }
    if (tenggat && new Date(tenggat) < new Date()) return { label: "Lewat tenggat", cls: "bg-red-100 text-red-700" };
    return { label: "Belum dikumpulkan", cls: "bg-slate-200 text-slate-600" };
}
