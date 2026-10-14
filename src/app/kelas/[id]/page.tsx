"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
    LmsNav, Diskusi, FormMateri, FormTugas, IsiTeks, LabelTerbit, kirim, fmtTanggal, fmtWaktu, statusTugas, warnaMapel, inputClass,
} from "@/components/lms/ui";
import { RekapNilai } from "@/components/lms/RekapNilai";
import { FormKuis } from "@/components/lms/kuis";
import { Presensi } from "@/components/lms/Presensi";
import { TabTopik } from "@/components/lms/Topik";
import { UjianManual } from "@/components/lms/UjianManual";

interface DataMapel {
    peran: "kelola" | "siswa";
    mapel: { id: number; nama: string; deskripsi: string; kelas: { id: number; nama: string }; guru: { id: number; nama: string } | null };
    jumlahSiswa: number;
    jumlahUjianManual: number;
    siswa: { id: number; nomorPeserta: string; nama: string }[];
    topik: { id: number; judul: string; deskripsi: string }[];
    progres: { userId: number; materi: number; tugas: number; tugasTotal: number; kuis: number; persen: number | null }[];
    jumlahMateriTampil?: number; jumlahKuisTampil?: number;
    pengumuman: { id: number; judul: string; isi: string; createdAt: string; penulis: string; jumlahKomentar: number }[];
    materi: { id: number; judul: string; terbit: boolean; terbitPada?: string | null; topikId: number | null; createdAt: string; adaLampiran: boolean; adaVideo: boolean; jumlahKomentar: number; jumlahDibaca?: number; sudahDibaca: boolean }[];
    tugas: { id: number; judul: string; terbit: boolean; terbitPada?: string | null; topikId: number | null; tenggat: string | null; nilaiMaks: number; createdAt: string; terimaTerlambat: boolean; jumlahKumpul?: number; jumlahDitugaskan?: number | null; pengumpulanSaya?: { dikumpulkanAt: string; nilai: number | null; status: string } | null }[];
    kuis: {
        id: number; judul: string; terbit: boolean; topikId: number | null; mulai: string | null; selesai: string | null; durasiMenit: number; maksPercobaan: number; jumlahSoal: number;
        status: "draf" | "belum" | "buka" | "tutup"; jumlahSelesai?: number; perluDinilai?: number;
        saya?: { jumlah: number; sedang: boolean; terbaik: { nilai: number; perluDinilai: boolean } | null };
    }[];
    ujian: { id: number; nama: string; isActive: boolean; durasiMenit: number; jadwalMulai: string | null; jadwalSelesai: string | null; nilaiSaya?: number | null }[];
}

type Tab = "beranda" | "topik" | "materi" | "tugas" | "kuis" | "ujian" | "presensi" | "nilai" | "anggota";
const TAB: Tab[] = ["beranda", "topik", "materi", "tugas", "kuis", "ujian", "presensi", "nilai", "anggota"];

/** Tab awal & kode presensi dari URL (?tab=presensi&kode=XXXX, mis. dari QR presensi). */
function paramAwal() {
    if (typeof window === "undefined") return { tab: "beranda" as Tab, kode: "" };
    const q = new URLSearchParams(window.location.search);
    const tab = q.get("tab") as Tab;
    return { tab: TAB.includes(tab) ? tab : "beranda", kode: q.get("kode") ?? "" };
}

async function muat(id: string) {
    const res = await fetch(`/api/lms/mapel/${id}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data: data as DataMapel } : { error: (data.message as string) || "Gagal memuat" };
}

export default function HalamanMapel() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { toast } = useToast();
    const [d, setD] = useState<DataMapel | null>(null);
    const [error, setError] = useState("");
    const [awal] = useState(paramAwal);
    const [tab, setTab] = useState<Tab>(awal.tab);
    const [form, setForm] = useState<"materi" | "tugas" | "kuis" | null>(null);
    const [pengumuman, setPengumuman] = useState({ judul: "", isi: "" });
    const [bukaDiskusi, setBukaDiskusi] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        const r = await muat(id);
        if (r.data) setD(r.data); else setError(r.error);
    }, [id]);

    useEffect(() => {
        let ignore = false;
        muat(id).then((r) => { if (!ignore) { if (r.data) setD(r.data); else setError(r.error); } });
        return () => { ignore = true; };
    }, [id]);

    if (error) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={{ href: "/kelas", label: "Kelas" }} /><p className="p-8 text-center text-red-600 font-semibold">{error}</p></div>);
    if (!d) return (<div className="min-h-screen bg-slate-100"><LmsNav /><p className="p-8 text-center text-slate-500">Memuat...</p></div>);

    const kelola = d.peran === "kelola";
    const tabs: { key: Tab; label: string; n?: number }[] = [
        { key: "beranda", label: "Beranda", n: d.pengumuman.length },
        { key: "topik", label: "Topik", n: d.topik.length || undefined },
        { key: "materi", label: "Materi", n: d.materi.length },
        { key: "tugas", label: "Tugas", n: d.tugas.length },
        { key: "kuis", label: "Kuis", n: d.kuis.length },
        { key: "ujian", label: "Ujian", n: d.ujian.length + (d.jumlahUjianManual ?? 0) },
        { key: "presensi", label: "Presensi" },
        { key: "nilai", label: "Nilai" },
        ...(kelola ? [{ key: "anggota" as Tab, label: "Anggota", n: d.jumlahSiswa }] : []),
    ];

    const kirimPengumuman = async (e: React.FormEvent) => {
        e.preventDefault();
        const { ok, data } = await kirim("/api/lms/pengumuman", "POST", { mapelId: d.mapel.id, ...pengumuman });
        if (ok) { setPengumuman({ judul: "", isi: "" }); toast("Pengumuman diterbitkan", "success"); refresh(); }
        else toast(data.message || "Gagal", "error");
    };

    const hapus = async (jenis: "pengumuman" | "materi" | "tugas", itemId: number, judul: string) => {
        const pesan = jenis === "tugas"
            ? `Hapus tugas "${judul}"? Semua jawaban & nilai siswa untuk tugas ini ikut terhapus.`
            : `Hapus ${jenis} "${judul}"? Diskusinya ikut terhapus.`;
        if (!confirm(pesan)) return;
        const { ok, data } = await kirim(`/api/lms/${jenis}?id=${itemId}`, "DELETE");
        toast(data.message || (ok ? "Dihapus" : "Gagal menghapus"), ok ? "success" : "error");
        if (ok) refresh();
    };

    const dibaca = d.materi.filter((m) => m.sudahDibaca).length;
    const tugasSelesai = d.tugas.filter((t) => t.pengumpulanSaya && t.pengumpulanSaya.status !== "revisi").length;

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <LmsNav judul={`${d.mapel.kelas.nama} · ${d.mapel.nama}`} kembali={{ href: "/kelas", label: "Kelas" }} />

            {/* Sampul mapel */}
            <div className={`bg-linear-to-br ${warnaMapel(d.mapel.id)} text-white`}>
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
                    <p className="text-xs font-bold uppercase tracking-widest text-white/80">Kelas {d.mapel.kelas.nama}</p>
                    <h1 className="text-3xl font-black mt-1">{d.mapel.nama}</h1>
                    <p className="text-sm text-white/90 mt-1">{d.mapel.guru ? `Pengampu: ${d.mapel.guru.nama}` : "Guru belum ditentukan"} · {d.jumlahSiswa} siswa</p>
                    {d.mapel.deskripsi && <p className="text-sm text-white/85 mt-3 max-w-2xl">{d.mapel.deskripsi}</p>}
                    {!kelola && (d.materi.length > 0 || d.tugas.length > 0) && (
                        <div className="mt-4 flex flex-wrap gap-4 text-xs">
                            <span className="bg-white/15 rounded-full px-3 py-1">Materi dibaca: <b>{dibaca}/{d.materi.length}</b></span>
                            <span className="bg-white/15 rounded-full px-3 py-1">Tugas dikumpulkan: <b>{tugasSelesai}/{d.tugas.length}</b></span>
                        </div>
                    )}
                </div>
            </div>

            {/* Tab */}
            <div className="bg-white border-b border-slate-200 sticky top-[52px] z-30">
                <div className="max-w-6xl mx-auto px-4 md:px-8 flex gap-1 overflow-x-auto" role="tablist">
                    {tabs.map((t) => (
                        <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                            ref={tab === t.key ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                            className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap ${tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                            {t.label}{t.n !== undefined && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{t.n}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <main className="max-w-6xl mx-auto p-4 md:p-8">
                {/* BERANDA: pengumuman */}
                {tab === "beranda" && (
                    <div className="grid lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            {kelola && (
                                <form onSubmit={kirimPengumuman} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2 shadow-sm">
                                    <input value={pengumuman.judul} onChange={(e) => setPengumuman({ ...pengumuman, judul: e.target.value })} required maxLength={200}
                                        placeholder="Judul pengumuman" aria-label="Judul pengumuman" className={inputClass} />
                                    <textarea value={pengumuman.isi} onChange={(e) => setPengumuman({ ...pengumuman, isi: e.target.value })} required rows={3}
                                        placeholder="Tulis pengumuman untuk kelas..." aria-label="Isi pengumuman" className={`${inputClass} resize-y`} />
                                    <div className="flex justify-end">
                                        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Umumkan</button>
                                    </div>
                                </form>
                            )}
                            {d.pengumuman.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada pengumuman.</p>}
                            {d.pengumuman.map((p) => (
                                <article key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                                    <div className="flex items-start gap-3">
                                        <span className="shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center">{p.penulis.charAt(0).toUpperCase()}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800">{p.penulis}</p>
                                            <p className="text-[11px] text-slate-400">{fmtWaktu(p.createdAt)}</p>
                                        </div>
                                        {kelola && <button onClick={() => hapus("pengumuman", p.id, p.judul)} className="text-xs text-red-500 hover:text-red-700 font-bold">Hapus</button>}
                                    </div>
                                    <h3 className="font-bold text-slate-800 mt-3">{p.judul}</h3>
                                    <IsiTeks teks={p.isi} className="text-sm text-slate-600 mt-1" />
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        {bukaDiskusi === p.id ? (
                                            <Diskusi target={{ pengumumanId: p.id }} />
                                        ) : (
                                            <button onClick={() => setBukaDiskusi(p.id)} className="text-xs font-bold text-indigo-600 hover:underline">
                                                {p.jumlahKomentar > 0 ? `Lihat ${p.jumlahKomentar} komentar` : "Tulis komentar"}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>

                        {/* Ringkasan samping */}
                        <aside className="space-y-4">
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-700 mb-3">Tugas Mendatang</h3>
                                {d.tugas.filter((t) => t.tenggat && new Date(t.tenggat) > new Date()).slice(0, 5).map((t) => (
                                    <Link key={t.id} href={`/kelas/${d.mapel.id}/tugas/${t.id}`} className="block py-2 border-b border-slate-100 last:border-0 hover:text-indigo-700">
                                        <p className="text-sm font-semibold truncate">{t.judul}</p>
                                        <p className="text-[11px] text-slate-400">Tenggat {fmtWaktu(t.tenggat)}</p>
                                    </Link>
                                ))}
                                {!d.tugas.some((t) => t.tenggat && new Date(t.tenggat) > new Date()) && <p className="text-xs text-slate-400 italic">Tidak ada tugas dengan tenggat mendatang.</p>}
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-700 mb-3">Materi Terbaru</h3>
                                {[...d.materi].reverse().slice(0, 5).map((m) => (
                                    <Link key={m.id} href={`/kelas/${d.mapel.id}/materi/${m.id}`} className="block py-2 border-b border-slate-100 last:border-0 text-sm font-semibold truncate hover:text-indigo-700">{m.judul}</Link>
                                ))}
                                {d.materi.length === 0 && <p className="text-xs text-slate-400 italic">Belum ada materi.</p>}
                            </div>
                        </aside>
                    </div>
                )}

                {/* TOPIK */}
                {tab === "topik" && <TabTopik mapelId={d.mapel.id} kelola={kelola} d={d} refresh={refresh} />}

                {/* MATERI */}
                {tab === "materi" && (
                    <section className="space-y-3">
                        {kelola && <button onClick={() => setForm("materi")} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Tambah Materi</button>}
                        {d.materi.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada materi.</p>}
                        {d.materi.map((m, i) => (
                            <div key={m.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 p-4">
                                <span className={`shrink-0 w-10 h-10 rounded-lg font-black flex items-center justify-center ${!kelola && m.sudahDibaca ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                                    {!kelola && m.sudahDibaca ? "✓" : i + 1}
                                </span>
                                <Link href={`/kelas/${d.mapel.id}/materi/${m.id}`} className="flex-1 min-w-0 group">
                                    <p className="font-bold text-slate-800 group-hover:text-indigo-700 truncate">{m.judul}</p>
                                    <p className="text-[11px] text-slate-400 flex flex-wrap gap-x-3">
                                        <span>{fmtTanggal(m.createdAt)}</span>
                                        {m.adaVideo && <span>Video</span>}
                                        {m.adaLampiran && <span>Lampiran</span>}
                                        {m.jumlahKomentar > 0 && <span>{m.jumlahKomentar} diskusi</span>}
                                        {kelola && <span>Dibaca {m.jumlahDibaca}/{d.jumlahSiswa} siswa</span>}
                                    </p>
                                </Link>
                                {kelola && <LabelTerbit terbit={m.terbit} terbitPada={m.terbitPada} />}
                                {kelola && <button onClick={() => hapus("materi", m.id, m.judul)} className="text-xs text-red-500 hover:text-red-700 font-bold">Hapus</button>}
                            </div>
                        ))}
                    </section>
                )}

                {/* TUGAS */}
                {tab === "tugas" && (
                    <section className="space-y-3">
                        {kelola && <button onClick={() => setForm("tugas")} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Buat Tugas</button>}
                        {d.tugas.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada tugas.</p>}
                        {d.tugas.map((t) => {
                            const st = !kelola ? statusTugas(t.tenggat, t.pengumpulanSaya ?? null) : null;
                            return (
                                <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 p-4">
                                    <span className="shrink-0 w-10 h-10 rounded-lg bg-amber-100 text-amber-700 font-black flex items-center justify-center">T</span>
                                    <Link href={`/kelas/${d.mapel.id}/tugas/${t.id}`} className="flex-1 min-w-0 group">
                                        <p className="font-bold text-slate-800 group-hover:text-indigo-700 truncate">{t.judul}</p>
                                        <p className="text-[11px] text-slate-400 flex flex-wrap gap-x-3">
                                            <span>{t.tenggat ? `Tenggat ${fmtWaktu(t.tenggat)}` : "Tanpa tenggat"}</span>
                                            <span>Nilai maks {t.nilaiMaks}</span>
                                            {kelola && <span>{t.jumlahKumpul}/{t.jumlahDitugaskan ?? d.jumlahSiswa} mengumpulkan</span>}
                                            {kelola && t.jumlahDitugaskan != null && <span className="text-violet-600 font-semibold">Untuk {t.jumlahDitugaskan} siswa</span>}
                                            {t.tenggat && !t.terimaTerlambat && <span className="text-red-500">Tidak menerima terlambat</span>}
                                        </p>
                                    </Link>
                                    {st && <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>}
                                    {kelola && <LabelTerbit terbit={t.terbit} terbitPada={t.terbitPada} />}
                                    {kelola && <button onClick={() => hapus("tugas", t.id, t.judul)} className="text-xs text-red-500 hover:text-red-700 font-bold">Hapus</button>}
                                </div>
                            );
                        })}
                    </section>
                )}

                {/* KUIS */}
                {tab === "kuis" && (
                    <section className="space-y-3">
                        {kelola && <button onClick={() => setForm("kuis")} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Buat Kuis</button>}
                        {d.kuis.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada kuis.</p>}
                        {d.kuis.map((q) => {
                            const s = q.saya;
                            const st = kelola
                                ? null
                                : s?.sedang ? { label: "Sedang dikerjakan", cls: "bg-amber-100 text-amber-700" }
                                : s?.terbaik ? (s.terbaik.perluDinilai ? { label: "Menunggu nilai esai", cls: "bg-fuchsia-100 text-fuchsia-700" } : { label: `Nilai: ${s.terbaik.nilai}`, cls: "bg-emerald-100 text-emerald-700" })
                                : q.status === "buka" ? { label: "Belum dikerjakan", cls: "bg-slate-200 text-slate-600" }
                                : q.status === "belum" ? { label: "Belum dibuka", cls: "bg-sky-100 text-sky-700" }
                                : { label: "Ditutup", cls: "bg-red-100 text-red-700" };
                            return (
                                <div key={q.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 p-4">
                                    <span className="shrink-0 w-10 h-10 rounded-lg bg-fuchsia-100 text-fuchsia-700 font-black flex items-center justify-center">Q</span>
                                    <Link href={`/kelas/${d.mapel.id}/kuis/${q.id}`} className="flex-1 min-w-0 group">
                                        <p className="font-bold text-slate-800 group-hover:text-indigo-700 truncate">{q.judul}</p>
                                        <p className="text-[11px] text-slate-400 flex flex-wrap gap-x-3">
                                            <span>{q.jumlahSoal} soal</span>
                                            <span>{q.durasiMenit ? `${q.durasiMenit} menit` : "Tanpa batas waktu"}</span>
                                            {q.mulai && <span>Dibuka {fmtWaktu(q.mulai)}</span>}
                                            {q.selesai && <span>Ditutup {fmtWaktu(q.selesai)}</span>}
                                            {kelola && <span>{q.jumlahSelesai}/{d.jumlahSiswa} selesai</span>}
                                            {kelola && !!q.perluDinilai && <span className="text-fuchsia-700 font-semibold">{q.perluDinilai} esai perlu dinilai</span>}
                                        </p>
                                    </Link>
                                    {st && <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>}
                                    {kelola && !q.terbit && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">Draf</span>}
                                    {kelola && q.terbit && q.status === "buka" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Dibuka</span>}
                                </div>
                            );
                        })}
                    </section>
                )}

                {/* UJIAN */}
                {tab === "ujian" && (
                    <div className="space-y-8">
                    <UjianManual mapelId={d.mapel.id} onChange={refresh} />
                    <section className="space-y-3">
                        {(kelola || d.ujian.length > 0) && <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Ujian CAT (Komputer)</h2>}
                        {kelola && (
                            <p className="text-xs text-slate-500">
                                Opsional. Ujian CAT untuk kelas ini dibuat admin di menu <b>Kelola Ujian</b> dengan memilih &quot;Untuk Kelas / Mapel&quot; = {d.mapel.kelas.nama} — {d.mapel.nama}.
                            </p>
                        )}
                        {d.ujian.length === 0 && (kelola || !d.jumlahUjianManual) && <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 italic text-sm">{kelola ? "Belum ada ujian CAT untuk mapel ini." : "Belum ada ujian untuk mapel ini."}</p>}
                        {d.ujian.map((u) => (
                            <div key={u.id} className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${u.isActive ? "border-emerald-400" : "border-slate-200"}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-800">{u.nama}</p>
                                        {u.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-white">AKTIF</span>}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {u.durasiMenit} menit · {u.jadwalMulai ? `${fmtWaktu(u.jadwalMulai)} – ${fmtWaktu(u.jadwalSelesai)}` : "jadwal bebas selama aktif"}
                                    </p>
                                </div>
                                {!kelola && (u.nilaiSaya !== null && u.nilaiSaya !== undefined ? (
                                    <span className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">Nilai: {u.nilaiSaya}</span>
                                ) : u.isActive ? (
                                    <Link href="/dashboard" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold text-center">Kerjakan Ujian</Link>
                                ) : (
                                    <span className="text-xs text-slate-400">Belum dibuka</span>
                                ))}
                            </div>
                        ))}
                    </section>
                    </div>
                )}

                {/* PRESENSI */}
                {tab === "presensi" && <Presensi mapelId={d.mapel.id} kodeAwal={awal.kode} />}

                {/* NILAI */}
                {tab === "nilai" && <RekapNilai mapelId={d.mapel.id} />}

                {/* ANGGOTA + progres belajar */}
                {tab === "anggota" && kelola && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">
                            Anggota = peserta dengan kelas <b>{d.mapel.kelas.nama}</b> (diatur di menu Peserta). Progres = materi dibaca + tugas dikumpulkan + kuis dikerjakan dari semua yang sudah terbit.
                        </div>
                        {d.siswa.length === 0 && <p className="p-8 text-center text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
                        {d.siswa.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2 text-left w-8">No</th>
                                            <th className="px-3 py-2 text-left">Nama</th>
                                            <th className="px-3 py-2 text-center">Materi</th>
                                            <th className="px-3 py-2 text-center">Tugas</th>
                                            <th className="px-3 py-2 text-center">Kuis</th>
                                            <th className="px-3 py-2 text-left min-w-40">Progres</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {d.siswa.map((s, i) => {
                                            const p = d.progres.find((x) => x.userId === s.id);
                                            return (
                                                <tr key={s.id} className="hover:bg-slate-50">
                                                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                                                    <td className="px-3 py-2">
                                                        <p className="font-semibold text-slate-700">{s.nama}</p>
                                                        <p className="font-mono text-[10px] text-slate-400">{s.nomorPeserta}</p>
                                                    </td>
                                                    <td className="px-3 py-2 text-center text-slate-600">{p?.materi ?? 0}/{d.jumlahMateriTampil ?? 0}</td>
                                                    <td className="px-3 py-2 text-center text-slate-600">{p?.tugas ?? 0}/{p?.tugasTotal ?? 0}</td>
                                                    <td className="px-3 py-2 text-center text-slate-600">{p?.kuis ?? 0}/{d.jumlahKuisTampil ?? 0}</td>
                                                    <td className="px-3 py-2">
                                                        {p?.persen === null || p?.persen === undefined ? <span className="text-xs text-slate-300">–</span> : (
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                                    <div className={`h-full ${p.persen >= 80 ? "bg-emerald-500" : p.persen >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${p.persen}%` }} />
                                                                </div>
                                                                <span className="w-10 text-right text-xs font-bold text-slate-700">{p.persen}%</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}
            </main>

            {form === "materi" && <FormMateri mapelId={d.mapel.id} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
            {form === "kuis" && <FormKuis mapelId={d.mapel.id} onClose={() => setForm(null)} onSaved={(kuisId) => router.push(`/kelas/${d.mapel.id}/kuis/${kuisId}`)} />}
            {form === "tugas" && <FormTugas mapelId={d.mapel.id} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
        </div>
    );
}
