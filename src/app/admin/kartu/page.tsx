"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useToast } from "@/components/Toast";

interface Peserta {
    id: number;
    nomorPeserta: string;
    nama: string;
    kelas: string;
    ruang: string;
    sesi: string;
    foto: string | null;
    nik: string | null;
    tempatLahir: string | null;
    tanggalLahir: string | null;
    jenisKelamin: string | null;
    tanggalUjian: string | null;
}

interface Ujian {
    id: number;
    nama: string;
    durasiMenit: number;
    jadwalMulai: string | null;
    jadwalSelesai: string | null;
}

interface Bagian {
    id: number;
    ujianId: number;
    nama: string;
    urutan: number;
    durasiMenit: number | null;
}

interface Instansi {
    namaInstansi: string;
    subJudul: string;
    alamat: string;
    kota: string;
    tahunPelajaran: string;
    logo: string;
    jabatanPenandatangan: string;
    namaPenandatangan: string;
    nipPenandatangan: string;
    tataTertib: string;
    warnaKartu: string;
    modelKartu: string;
}

// Tema warna kartu — "hitam" untuk printer hitam-putih
const TEMA: Record<string, { label: string; aksen: string; muda: string }> = {
    biru: { label: "Biru", aksen: "#1d4ed8", muda: "#dbeafe" },
    hijau: { label: "Hijau", aksen: "#047857", muda: "#d1fae5" },
    merah: { label: "Merah", aksen: "#b91c1c", muda: "#fee2e2" },
    ungu: { label: "Ungu", aksen: "#6d28d9", muda: "#ede9fe" },
    oranye: { label: "Oranye", aksen: "#c2410c", muda: "#ffedd5" },
    hitam: { label: "Hitam-putih", aksen: "#1f2937", muda: "#f3f4f6" },
};

/** QR code berisi nomor peserta, digambar sebagai SVG agar tajam saat dicetak. */
function QrNomor({ teks, ukuran }: { teks: string; ukuran: string }) {
    const { size, data } = QRCode.create(teks, { errorCorrectionLevel: "M" }).modules;
    let d = "";
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (data[r * size + c]) d += `M${c} ${r}h1v1h-1z`;
    return (
        <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} style={{ width: ukuran, height: ukuran }} shapeRendering="crispEdges" role="img" aria-label={`QR ${teks}`}>
            <rect x={-1} y={-1} width={size + 2} height={size + 2} fill="#fff" />
            <path d={d} fill="#000" />
        </svg>
    );
}

/** Judul bagian dengan penanda warna aksen. */
function JudulBagian({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="flex items-center gap-2 text-[10.5pt] font-bold mt-4 mb-1.5 uppercase tracking-wide text-[var(--aksen)]">
            <span className="inline-block w-[2.5mm] h-[2.5mm] rotate-45 bg-[var(--aksen)]" />
            {children}
            <span className="flex-1 border-b border-[var(--aksen)] opacity-40" />
        </h2>
    );
}

// Kolom yang belum terisi dicetak sebagai titik-titik agar bisa diisi tangan
const ISIAN = "..................................................";
const ISIAN_PENDEK = "........................";

const fmtTanggal = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
const fmtTanggalPendek = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";
const fmtJam = (d: string | null) => (d ? new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "");

async function muatData() {
    const [p, u, b, i] = await Promise.all([
        fetch("/api/admin/peserta"), fetch("/api/admin/pengaturan"), fetch("/api/admin/bagian"), fetch("/api/admin/instansi"),
    ]);
    return {
        peserta: p.ok ? ((await p.json()) as Peserta[]) : [],
        ujian: u.ok ? ((await u.json()) as Ujian) : null,
        bagian: b.ok ? (((await b.json()).bagian || []) as Bagian[]) : [],
        instansi: i.ok ? ((await i.json()) as Instansi) : null,
    };
}

export default function CetakKartuUjian() {
    const { toast } = useToast();
    const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
    const [ujian, setUjian] = useState<Ujian | null>(null);
    const [bagianList, setBagianList] = useState<Bagian[]>([]);
    const [instansi, setInstansi] = useState<Instansi | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterRuang, setFilterRuang] = useState("");
    const [filterKelas, setFilterKelas] = useState("");
    const [cari, setCari] = useState("");
    const [hanyaId, setHanyaId] = useState<number | null>(null);
    const [panelKop, setPanelKop] = useState(false);
    const [menyimpan, setMenyimpan] = useState(false);

    useEffect(() => {
        let ignore = false;
        const id = Number(new URLSearchParams(window.location.search).get("id"));
        muatData().then((d) => {
            if (ignore) return;
            setPesertaList(d.peserta);
            setUjian(d.ujian);
            setBagianList(d.bagian);
            setInstansi(d.instansi);
            if (id) setHanyaId(id);
            setLoading(false);
        });
        return () => { ignore = true; };
    }, []);

    const daftarRuang = useMemo(() => [...new Set(pesertaList.map((p) => p.ruang).filter(Boolean))].sort(), [pesertaList]);
    const daftarKelas = useMemo(() => [...new Set(pesertaList.map((p) => p.kelas).filter(Boolean))].sort(), [pesertaList]);

    const dicetak = pesertaList
        .filter((p) => (hanyaId ? p.id === hanyaId : true))
        .filter((p) => !filterRuang || p.ruang === filterRuang)
        .filter((p) => !filterKelas || p.kelas === filterKelas)
        .filter((p) => !cari || `${p.nama} ${p.nomorPeserta}`.toLowerCase().includes(cari.toLowerCase()))
        .sort((a, b) => a.ruang.localeCompare(b.ruang) || a.sesi.localeCompare(b.sesi) || a.nomorPeserta.localeCompare(b.nomorPeserta));

    const bagianUjian = bagianList.filter((b) => b.ujianId === ujian?.id).sort((a, b) => a.urutan - b.urutan);
    const tataTertib = (instansi?.tataTertib || "").split("\n").map((s) => s.trim()).filter(Boolean);

    const simpanKop = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!instansi) return;
        setMenyimpan(true);
        const res = await fetch("/api/admin/instansi", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(instansi),
        });
        const data = await res.json();
        setMenyimpan(false);
        if (res.ok) {
            setInstansi(data.data);
            toast("Kop & penandatangan disimpan", "success");
        } else {
            toast(data.message || "Gagal menyimpan", "error");
        }
    };

    const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !instansi) return;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) {
            setInstansi({ ...instansi, logo: data.url });
            toast("Logo diunggah. Klik Simpan untuk menerapkan.", "success");
        } else {
            toast(data.message || "Gagal mengunggah logo", "error");
        }
        e.target.value = "";
    };

    const warna = instansi?.warnaKartu && TEMA[instansi.warnaKartu] ? instansi.warnaKartu : "biru";
    const model = instansi?.modelKartu === "ringkas" ? "ringkas" : "lengkap";
    const tema = TEMA[warna];

    // Pilihan tampilan langsung diterapkan dan disimpan agar dipakai lagi berikutnya
    const ubahTampilan = async (ubahan: Partial<Instansi>) => {
        if (!instansi) return;
        setInstansi({ ...instansi, ...ubahan });
        const res = await fetch("/api/admin/instansi", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ubahan),
        });
        if (!res.ok) toast("Gagal menyimpan pilihan tampilan", "error");
    };

    if (loading) return <div className="p-8 text-center">Memuat data...</div>;

    const ubah = (k: keyof Instansi) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        instansi && setInstansi({ ...instansi, [k]: e.target.value });
    const inputClass = "w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white";

    return (
        <div className="min-h-screen bg-slate-200 font-sans">
            {/* Toolbar */}
            <div className="no-print bg-white p-4 border-b border-slate-200 sticky top-0 z-50 shadow-sm space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-3">
                    <h1 className="text-lg font-bold text-slate-800">
                        Cetak Kartu Ujian <span className="text-sm font-normal text-slate-500">— {dicetak.length} kartu ({model === "ringkas" ? `${Math.ceil(dicetak.length / 4)} lembar A4, 4 kartu per lembar` : "1 lembar A4 per peserta"})</span>
                    </h1>
                    <div className="flex flex-wrap gap-2">
                        <Link href="/admin" className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-bold">&larr; Kembali</Link>
                        <button onClick={() => setPanelKop(!panelKop)} className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-sm font-bold">
                            {panelKop ? "Tutup Pengaturan Kop" : "Atur Kop & Tanda Tangan"}
                        </button>
                        <button onClick={() => window.print()} disabled={dicetak.length === 0} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                            Cetak / Simpan PDF
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {hanyaId ? (
                        <button onClick={() => setHanyaId(null)} className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                            Hanya 1 peserta — tampilkan semua ✕
                        </button>
                    ) : (
                        <>
                            <input type="search" placeholder="Cari nama / nomor..." value={cari} onChange={(e) => setCari(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 w-48" aria-label="Cari peserta" />
                            <select value={filterRuang} onChange={(e) => setFilterRuang(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white" aria-label="Filter ruang">
                                <option value="">Semua Ruang</option>
                                {daftarRuang.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <select value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white" aria-label="Filter kelas">
                                <option value="">Semua Kelas</option>
                                {daftarKelas.map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
                        </>
                    )}
                    {instansi && (
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm" role="group" aria-label="Model kartu">
                                {[["lengkap", "A4 Lengkap"], ["ringkas", "Ringkas (4/lembar)"]].map(([v, l]) => (
                                    <button key={v} type="button" onClick={() => ubahTampilan({ modelKartu: v })} aria-pressed={model === v}
                                        className={`px-3 py-1.5 font-semibold ${model === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1" role="group" aria-label="Warna kartu">
                                {Object.entries(TEMA).map(([k, t]) => (
                                    <button key={k} type="button" title={t.label} aria-label={`Warna ${t.label}`} aria-pressed={warna === k} onClick={() => ubahTampilan({ warnaKartu: k })}
                                        className={`w-6 h-6 rounded-full border-2 border-white ${warna === k ? "ring-2 ring-offset-1 ring-slate-500" : "shadow"}`} style={{ background: t.aksen }} />
                                ))}
                            </div>
                        </div>
                    )}
                    {!ujian?.jadwalMulai && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">Jadwal ujian aktif belum diatur — kolom tanggal/waktu dikosongkan.</span>}
                </div>

                {panelKop && instansi && (
                    <form onSubmit={simpanKop} className="grid md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-600">Nama Instansi / Sekolah<input className={inputClass} value={instansi.namaInstansi} onChange={ubah("namaInstansi")} /></label>
                            <label className="block text-xs font-bold text-slate-600">Sub-judul Kop<input className={inputClass} value={instansi.subJudul} onChange={ubah("subJudul")} /></label>
                            <label className="block text-xs font-bold text-slate-600">Alamat<input className={inputClass} value={instansi.alamat} onChange={ubah("alamat")} /></label>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-600">Kota (tempat tanda tangan)<input className={inputClass} value={instansi.kota} onChange={ubah("kota")} /></label>
                            <label className="block text-xs font-bold text-slate-600">Tahun Pelajaran<input className={inputClass} value={instansi.tahunPelajaran} onChange={ubah("tahunPelajaran")} placeholder="mis. 2026/2027" /></label>
                            <div className="text-xs font-bold text-slate-600">
                                Logo
                                <div className="flex items-center gap-2 mt-1">
                                    {instansi.logo && <img src={instansi.logo} alt="Logo" className="h-9 w-9 object-contain border rounded" />}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} className="text-xs" aria-label="Unggah logo" />
                                    {instansi.logo && <button type="button" onClick={() => setInstansi({ ...instansi, logo: "" })} className="text-red-600 text-xs">Hapus</button>}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-600">Jabatan Penandatangan<input className={inputClass} value={instansi.jabatanPenandatangan} onChange={ubah("jabatanPenandatangan")} /></label>
                            <label className="block text-xs font-bold text-slate-600">Nama Penandatangan<input className={inputClass} value={instansi.namaPenandatangan} onChange={ubah("namaPenandatangan")} /></label>
                            <label className="block text-xs font-bold text-slate-600">NIP<input className={inputClass} value={instansi.nipPenandatangan} onChange={ubah("nipPenandatangan")} /></label>
                        </div>
                        <label className="block md:col-span-3 text-xs font-bold text-slate-600">
                            Tata Tertib (satu poin per baris)
                            <textarea rows={4} className={inputClass} value={instansi.tataTertib} onChange={ubah("tataTertib")} />
                        </label>
                        <div className="md:col-span-3">
                            <button type="submit" disabled={menyimpan} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                                {menyimpan ? "Menyimpan..." : "Simpan Kop & Tanda Tangan"}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Kartu */}
            <div className="kartu-wrap py-8 print:py-0" style={{ "--aksen": tema.aksen, "--aksen-muda": tema.muda } as React.CSSProperties}>
                {dicetak.length === 0 && <p className="text-center text-slate-500 py-16 no-print">Tidak ada peserta yang cocok.</p>}

                {/* Model ringkas: 4 kartu (A6) per lembar A4 */}
                {model === "ringkas" &&
                    Array.from({ length: Math.ceil(dicetak.length / 4) }, (_, i) => dicetak.slice(i * 4, i * 4 + 4)).map((grup, gi) => (
                        <section key={gi} className="kartu-a4 lembar-ringkas bg-white text-black mx-auto shadow-lg print:shadow-none">
                            {grup.map((p) => (
                                <article key={p.id} className="kartu-kecil">
                                    <div className="h-full flex flex-col border-[1.5px] border-[var(--aksen)] rounded-[3mm] overflow-hidden relative">
                                        {instansi?.logo && <img src={instansi.logo} alt="" className="absolute inset-0 m-auto w-[45mm] h-[45mm] object-contain opacity-[0.06] pointer-events-none" />}
                                        <header className="flex items-center gap-2 px-3 py-2 bg-[var(--aksen)] text-white">
                                            <div className="w-[11mm] h-[11mm] shrink-0 rounded-full bg-white flex items-center justify-center overflow-hidden">
                                                {instansi?.logo ? <img src={instansi.logo} alt="" className="max-w-[9mm] max-h-[9mm] object-contain" /> : <span className="text-[5pt] text-gray-400">LOGO</span>}
                                            </div>
                                            <div className="leading-tight min-w-0">
                                                <p className="text-[6.5pt] uppercase opacity-90 truncate">{instansi?.subJudul}</p>
                                                <p className="text-[9.5pt] font-black uppercase truncate">{instansi?.namaInstansi}</p>
                                            </div>
                                        </header>
                                        <div className="text-center py-1.5 bg-[var(--aksen-muda)] border-b border-[var(--aksen)]">
                                            <p className="text-[10pt] font-black tracking-[0.18em] text-[var(--aksen)]">KARTU PESERTA UJIAN</p>
                                            <p className="text-[7pt] font-semibold uppercase">{ujian?.nama || "Ujian Berbasis Komputer"}{instansi?.tahunPelajaran ? ` · TP ${instansi.tahunPelajaran}` : ""}</p>
                                        </div>
                                        <div className="flex gap-2.5 px-3 pt-2.5 relative">
                                            <div className="shrink-0 flex flex-col items-center gap-1.5">
                                                <div className="w-[22mm] h-[29mm] border border-[var(--aksen)] flex items-center justify-center overflow-hidden bg-white">
                                                    {p.foto ? <img src={p.foto} alt={`Foto ${p.nama}`} className="w-full h-full object-cover" /> : <span className="text-[6.5pt] text-gray-500 text-center">Pas foto<br />3 × 4</span>}
                                                </div>
                                                <QrNomor teks={p.nomorPeserta} ukuran="17mm" />
                                            </div>
                                            <div className="flex-1 min-w-0 text-[8pt]">
                                                <div className="rounded-[1.5mm] bg-[var(--aksen-muda)] border-l-[3px] border-[var(--aksen)] px-2 py-1 mb-1.5">
                                                    <p className="text-[6pt] uppercase tracking-wider text-gray-600">Nomor Peserta</p>
                                                    <p className="font-mono font-black text-[12pt] leading-none tracking-wider text-[var(--aksen)]">{p.nomorPeserta}</p>
                                                </div>
                                                <p className="font-bold uppercase text-[9pt] leading-tight mb-1">{p.nama}</p>
                                                <table className="w-full border-collapse">
                                                    <tbody>
                                                        {[
                                                            ["Kelas", p.kelas || ISIAN_PENDEK],
                                                            ["Ruang", p.ruang || ISIAN_PENDEK],
                                                            ["Sesi", p.sesi ? `Sesi ${p.sesi}` : ISIAN_PENDEK],
                                                            ["Tanggal", fmtTanggalPendek(ujian?.jadwalMulai || p.tanggalUjian) || ISIAN_PENDEK],
                                                            ["Waktu", ujian?.jadwalMulai ? `${fmtJam(ujian.jadwalMulai)} – ${fmtJam(ujian.jadwalSelesai)}` : ISIAN_PENDEK],
                                                        ].map(([l, v]) => (
                                                            <tr key={l} className="border-b border-dotted border-gray-300">
                                                                <td className="py-[1.5px] w-[13mm] text-gray-600">{l}</td>
                                                                <td className="py-[1.5px] font-semibold truncate max-w-0">{v}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div className="mx-3 mt-2 grid grid-cols-2 gap-1.5 text-[7.5pt]">
                                            <div className="border border-dashed border-[var(--aksen)] rounded px-1.5 py-1">
                                                <p className="text-[6pt] uppercase text-gray-600">Username</p>
                                                <p className="font-mono font-bold">{p.nomorPeserta}</p>
                                            </div>
                                            <div className="border border-dashed border-[var(--aksen)] rounded px-1.5 py-1">
                                                <p className="text-[6pt] uppercase text-gray-600">Password</p>
                                                <p>&nbsp;</p>
                                            </div>
                                        </div>
                                        {tataTertib.length > 0 && (
                                            <div className="mx-3 mt-2 text-[6.5pt] leading-snug">
                                                <p className="font-bold uppercase text-[var(--aksen)] mb-0.5">Tata Tertib</p>
                                                <ol className="list-decimal pl-3.5 space-y-[1px]">
                                                    {tataTertib.slice(0, 4).map((t, i) => <li key={i}>{t}</li>)}
                                                </ol>
                                            </div>
                                        )}
                                        <div className="mt-auto px-3 pb-1.5 flex justify-end text-[7.5pt]">
                                            <div className="text-center w-[45mm]">
                                                <p>{instansi?.kota || "........"}, {fmtTanggalPendek(new Date())}</p>
                                                <p>{instansi?.jabatanPenandatangan},</p>
                                                <div className="h-[9mm]" />
                                                <p className="font-bold underline leading-tight">{instansi?.namaPenandatangan || "(..............................)"}</p>
                                                {instansi?.nipPenandatangan && <p className="leading-tight">NIP. {instansi.nipPenandatangan}</p>}
                                            </div>
                                        </div>
                                        <p className="shrink-0 bg-[var(--aksen)] text-white text-[6.5pt] text-center py-[2px] tracking-wide">Wajib dibawa &amp; ditunjukkan kepada pengawas setiap ujian</p>
                                    </div>
                                </article>
                            ))}
                        </section>
                    ))}

                {/* Model lengkap: 1 lembar A4 per peserta */}
                {model === "lengkap" && dicetak.map((p) => {
                    const tglUjian = ujian?.jadwalMulai || p.tanggalUjian;
                    return (
                        <section key={p.id} className="kartu-a4 bg-white text-black mx-auto shadow-lg print:shadow-none">
                            {/* Bingkai ganda & tanda air logo */}
                            <div className="absolute inset-[7mm] border-[1.5px] border-[var(--aksen)] rounded-[4mm] pointer-events-none" />
                            <div className="absolute inset-[8.2mm] border border-[var(--aksen)] opacity-30 rounded-[3.2mm] pointer-events-none" />
                            {instansi?.logo && <img src={instansi.logo} alt="" className="absolute inset-0 m-auto w-[120mm] h-[120mm] object-contain opacity-[0.05] pointer-events-none" />}

                            <div className="relative">
                                {/* Kop */}
                                <header className="flex items-center gap-4 pb-2 border-b-[3px] border-double border-[var(--aksen)]">
                                    <div className="w-[22mm] h-[22mm] shrink-0 flex items-center justify-center">
                                        {instansi?.logo ? <img src={instansi.logo} alt="" className="max-w-full max-h-full object-contain" /> : <div className="w-full h-full border border-dashed border-gray-400 rounded-full text-[8pt] text-gray-400 flex items-center justify-center text-center">LOGO</div>}
                                    </div>
                                    <div className="flex-1 text-center leading-tight">
                                        <p className="text-[11pt] font-semibold uppercase">{instansi?.subJudul}</p>
                                        <p className="text-[16pt] font-black uppercase tracking-wide text-[var(--aksen)]">{instansi?.namaInstansi}</p>
                                        <p className="text-[9pt]">{instansi?.alamat}</p>
                                    </div>
                                    <div className="w-[22mm] shrink-0" />
                                </header>

                                {/* Judul */}
                                <div className="text-center my-4">
                                    <h1 className="inline-block px-10 py-1.5 rounded-full bg-[var(--aksen)] text-white text-[14pt] font-black tracking-[0.2em]">KARTU PESERTA UJIAN</h1>
                                    <p className="text-[11pt] font-bold mt-2 uppercase">{ujian?.nama || "Ujian Berbasis Komputer"}</p>
                                    {instansi?.tahunPelajaran && <p className="text-[10pt]">Tahun Pelajaran {instansi.tahunPelajaran}</p>}
                                </div>

                                {/* Identitas + Foto + QR */}
                                <div className="flex gap-6">
                                    <div className="flex-1 self-start">
                                        <div className="flex items-center justify-between rounded-[2mm] bg-[var(--aksen-muda)] border-l-[5px] border-[var(--aksen)] px-4 py-2 mb-2">
                                            <div>
                                                <p className="text-[8pt] uppercase tracking-[0.15em] text-gray-600">Nomor Peserta</p>
                                                <p className="font-mono font-black text-[18pt] leading-none tracking-wider text-[var(--aksen)]">{p.nomorPeserta}</p>
                                            </div>
                                            <div className="text-right text-[9pt] leading-tight">
                                                <p className="text-gray-600">Ruang / Sesi</p>
                                                <p className="font-bold text-[12pt]">{p.ruang || "...."} / {p.sesi || "...."}</p>
                                            </div>
                                        </div>
                                        <table className="w-full text-[10.5pt] border-collapse">
                                            <tbody>
                                                {[
                                                    ["Nama Lengkap", <span key="n" className="font-bold uppercase">{p.nama}</span>],
                                                    ["Kelas", p.kelas || ISIAN],
                                                    ["NIK", p.nik || ISIAN],
                                                    ["Tempat, Tgl. Lahir", `${p.tempatLahir || ISIAN_PENDEK}, ${fmtTanggalPendek(p.tanggalLahir) || ISIAN_PENDEK}`],
                                                    ["Jenis Kelamin", p.jenisKelamin === "L" ? "Laki-laki" : p.jenisKelamin === "P" ? "Perempuan" : "Laki-laki / Perempuan *)"],
                                                ].map(([label, value]) => (
                                                    <tr key={String(label)} className="border-b border-dotted border-gray-300">
                                                        <td className="py-[4px] pr-2 w-[40mm] align-top text-gray-700">{label}</td>
                                                        <td className="py-[4px] pr-2 align-top">:</td>
                                                        <td className="py-[4px] align-top">{value}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {!p.jenisKelamin && <p className="text-[8pt] italic mt-1">*) Coret yang tidak perlu</p>}
                                    </div>
                                    <div className="shrink-0 flex flex-col items-center gap-2">
                                        <div className="w-[30mm] h-[40mm] border-2 border-[var(--aksen)] p-[1mm] bg-white">
                                            <div className="w-full h-full border border-gray-300 flex items-center justify-center overflow-hidden">
                                                {p.foto ? <img src={p.foto} alt={`Foto ${p.nama}`} className="w-full h-full object-cover" /> : <span className="text-[8pt] text-gray-500 text-center px-1">Pas foto<br />3 × 4</span>}
                                            </div>
                                        </div>
                                        <QrNomor teks={p.nomorPeserta} ukuran="22mm" />
                                    </div>
                                </div>

                                {/* Jadwal */}
                                <JudulBagian>Jadwal Ujian</JudulBagian>
                                <table className="w-full text-[10pt] border-collapse border border-[var(--aksen)]">
                                    <thead>
                                        <tr className="bg-[var(--aksen)] text-white">
                                            <th className="border border-[var(--aksen)] px-2 py-1 text-left">Hari, Tanggal</th>
                                            <th className="border border-[var(--aksen)] px-2 py-1 text-left">Waktu</th>
                                            <th className="border border-[var(--aksen)] px-2 py-1 text-left">Durasi</th>
                                            <th className="border border-[var(--aksen)] px-2 py-1 text-left">Paraf Pengawas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border border-[var(--aksen)] px-2 py-2.5">{fmtTanggal(tglUjian) || "........................"}</td>
                                            <td className="border border-[var(--aksen)] px-2 py-2.5">{ujian?.jadwalMulai ? `${fmtJam(ujian.jadwalMulai)} – ${fmtJam(ujian.jadwalSelesai)}` : "........ – ........"}</td>
                                            <td className="border border-[var(--aksen)] px-2 py-2.5">{ujian ? `${ujian.durasiMenit} menit` : "........ menit"}</td>
                                            <td className="border border-[var(--aksen)] px-2 py-2.5 w-[32mm]"></td>
                                        </tr>
                                    </tbody>
                                </table>
                                {bagianUjian.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[8.5pt]">
                                        <b className="mr-1">Bagian ujian:</b>
                                        {bagianUjian.map((b, i) => (
                                            <span key={b.id} className="px-2 rounded-full bg-[var(--aksen-muda)] border border-[var(--aksen)]">
                                                {i + 1}. {b.nama}{b.durasiMenit ? ` (${b.durasiMenit} mnt)` : ""}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Akun login */}
                                <JudulBagian>Akun Login CAT</JudulBagian>
                                <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-3 text-[10pt] items-stretch">
                                    <div className="border-[1.5px] border-dashed border-[var(--aksen)] rounded-[2mm] px-3 py-1.5">
                                        <p className="text-[7.5pt] uppercase tracking-wider text-gray-600">Username</p>
                                        <p className="font-mono font-bold text-[12pt]">{p.nomorPeserta}</p>
                                    </div>
                                    <div className="border-[1.5px] border-dashed border-[var(--aksen)] rounded-[2mm] px-3 py-1.5">
                                        <p className="text-[7.5pt] uppercase tracking-wider text-gray-600">Password</p>
                                        <p>&nbsp;</p>
                                    </div>
                                    <p className="text-[8.5pt] italic self-center leading-snug">Password diberikan oleh panitia. Jaga kerahasiaannya dan jangan dipinjamkan kepada orang lain.</p>
                                </div>

                                {/* Tata tertib */}
                                {tataTertib.length > 0 && (
                                    <>
                                        <JudulBagian>Tata Tertib Peserta</JudulBagian>
                                        <ol className="text-[9.5pt] space-y-1">
                                            {tataTertib.map((t, i) => (
                                                <li key={i} className="flex gap-2">
                                                    <span className="shrink-0 w-[4.5mm] h-[4.5mm] mt-[0.5mm] rounded-full bg-[var(--aksen)] text-white text-[7pt] font-bold flex items-center justify-center">{i + 1}</span>
                                                    <span>{t}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </>
                                )}

                                {/* Tanda tangan */}
                                <div className="mt-6 grid grid-cols-2 gap-8 text-[10pt]">
                                    <div className="text-center">
                                        <p>&nbsp;</p>
                                        <p>Peserta Ujian,</p>
                                        <div className="h-[20mm]" />
                                        <p className="font-bold underline uppercase">{p.nama}</p>
                                    </div>
                                    <div className="text-center">
                                        <p>{instansi?.kota || "........"}, {fmtTanggalPendek(new Date())}</p>
                                        <p>{instansi?.jabatanPenandatangan},</p>
                                        <div className="h-[20mm]" />
                                        <p className="font-bold underline">{instansi?.namaPenandatangan || "(..............................)"}</p>
                                        {instansi?.nipPenandatangan && <p>NIP. {instansi.nipPenandatangan}</p>}
                                    </div>
                                </div>
                            </div>

                            <p className="kartu-footer text-[7.5pt] text-white text-center bg-[var(--aksen)] rounded-full py-[2px]">
                                Kartu ini wajib dibawa setiap mengikuti ujian · Dicetak dari CAT System pada {fmtTanggalPendek(new Date())}
                            </p>
                        </section>
                    );
                })}
            </div>

            <style jsx global>{`
                .kartu-a4 {
                    width: 210mm;
                    min-height: 297mm;
                    padding: 13mm 17mm;
                    box-sizing: border-box;
                    position: relative;
                    margin-bottom: 8mm;
                    font-family: "Times New Roman", Times, serif;
                }
                .kartu-footer { position: absolute; left: 20mm; right: 20mm; bottom: 9.5mm; }
                .lembar-ringkas {
                    padding: 0;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 148.5mm 148.5mm;
                    align-content: start;
                    font-family: Arial, Helvetica, sans-serif;
                }
                /* Garis potong putus-putus di antara 4 kartu */
                .kartu-kecil { padding: 5mm; box-sizing: border-box; height: 148.5mm; outline: 0.2mm dashed #9ca3af; outline-offset: -0.1mm; }
                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    html, body { background: #fff !important; }
                    .no-print { display: none !important; }
                    .kartu-wrap { padding: 0 !important; }
                    .kartu-a4 {
                        margin: 0;
                        height: 297mm;
                        min-height: 0;
                        overflow: hidden;
                        break-after: page;
                        page-break-after: always;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .kartu-a4:last-child { break-after: auto; page-break-after: auto; }
                }
            `}</style>
        </div>
    );
}
