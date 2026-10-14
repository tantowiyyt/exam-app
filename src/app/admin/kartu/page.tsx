"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
                        Cetak Kartu Ujian <span className="text-sm font-normal text-slate-500">— {dicetak.length} kartu (1 lembar A4 per peserta)</span>
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

            {/* Kartu A4 */}
            <div className="kartu-wrap py-8 print:py-0">
                {dicetak.length === 0 && <p className="text-center text-slate-500 py-16 no-print">Tidak ada peserta yang cocok.</p>}
                {dicetak.map((p) => {
                    const tglUjian = ujian?.jadwalMulai || p.tanggalUjian;
                    return (
                        <section key={p.id} className="kartu-a4 bg-white text-black mx-auto shadow-lg print:shadow-none">
                            {/* Kop */}
                            <header className="flex items-center gap-4 pb-3 border-b-4 border-double border-black">
                                <div className="w-[22mm] h-[22mm] shrink-0 flex items-center justify-center">
                                    {instansi?.logo ? <img src={instansi.logo} alt="" className="max-w-full max-h-full object-contain" /> : <div className="w-full h-full border border-dashed border-gray-400 rounded-full text-[8pt] text-gray-400 flex items-center justify-center text-center">LOGO</div>}
                                </div>
                                <div className="flex-1 text-center leading-tight">
                                    <p className="text-[11pt] font-semibold uppercase">{instansi?.subJudul}</p>
                                    <p className="text-[16pt] font-black uppercase tracking-wide">{instansi?.namaInstansi}</p>
                                    <p className="text-[9pt]">{instansi?.alamat}</p>
                                </div>
                                <div className="w-[22mm] shrink-0" />
                            </header>

                            {/* Judul */}
                            <div className="text-center my-5">
                                <h1 className="text-[15pt] font-black tracking-[0.15em] underline underline-offset-4">KARTU PESERTA UJIAN</h1>
                                <p className="text-[11pt] font-semibold mt-1 uppercase">{ujian?.nama || "Ujian Berbasis Komputer"}</p>
                                {instansi?.tahunPelajaran && <p className="text-[10pt]">Tahun Pelajaran {instansi.tahunPelajaran}</p>}
                            </div>

                            {/* Identitas + Foto */}
                            <div className="flex gap-6">
                                <table className="flex-1 text-[10.5pt] border-collapse self-start">
                                    <tbody>
                                        {[
                                            ["Nomor Peserta", <span key="np" className="font-mono font-black text-[13pt] tracking-wider">{p.nomorPeserta}</span>],
                                            ["Nama Lengkap", <span key="n" className="font-bold uppercase">{p.nama}</span>],
                                            ["Kelas", p.kelas || ISIAN],
                                            ["NIK", p.nik || ISIAN],
                                            ["Tempat, Tgl. Lahir", `${p.tempatLahir || ISIAN_PENDEK}, ${fmtTanggalPendek(p.tanggalLahir) || ISIAN_PENDEK}`],
                                            ["Jenis Kelamin", p.jenisKelamin === "L" ? "Laki-laki" : p.jenisKelamin === "P" ? "Perempuan" : "Laki-laki / Perempuan *)"],
                                            ["Ruang", <span key="r" className="font-bold">{p.ruang || ISIAN}</span>],
                                            ["Sesi", <span key="s" className="font-bold">{p.sesi ? `Sesi ${p.sesi}` : ISIAN}</span>],
                                        ].map(([label, value]) => (
                                            <tr key={String(label)}>
                                                <td className="py-[3px] pr-2 w-[42mm] align-top">{label}</td>
                                                <td className="py-[3px] pr-2 align-top">:</td>
                                                <td className="py-[3px] align-top">{value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="w-[30mm] h-[40mm] shrink-0 border border-black flex items-center justify-center overflow-hidden">
                                    {p.foto ? <img src={p.foto} alt={`Foto ${p.nama}`} className="w-full h-full object-cover" /> : <span className="text-[8pt] text-gray-500 text-center px-1">Pas foto<br />3 × 4</span>}
                                </div>
                            </div>

                            {!p.jenisKelamin && <p className="text-[8pt] italic mt-1">*) Coret yang tidak perlu</p>}

                            {/* Jadwal */}
                            <h2 className="text-[10.5pt] font-bold mt-5 mb-1 uppercase">Jadwal Ujian</h2>
                            <table className="w-full text-[10pt] border-collapse border border-black">
                                <thead>
                                    <tr className="bg-gray-100 print:bg-gray-100">
                                        <th className="border border-black px-2 py-1 text-left">Hari, Tanggal</th>
                                        <th className="border border-black px-2 py-1 text-left">Waktu</th>
                                        <th className="border border-black px-2 py-1 text-left">Durasi</th>
                                        <th className="border border-black px-2 py-1 text-left">Paraf Pengawas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border border-black px-2 py-2">{fmtTanggal(tglUjian) || "........................"}</td>
                                        <td className="border border-black px-2 py-2">{ujian?.jadwalMulai ? `${fmtJam(ujian.jadwalMulai)} – ${fmtJam(ujian.jadwalSelesai)}` : "........ – ........"}</td>
                                        <td className="border border-black px-2 py-2">{ujian ? `${ujian.durasiMenit} menit` : "........ menit"}</td>
                                        <td className="border border-black px-2 py-2 w-[32mm]"></td>
                                    </tr>
                                </tbody>
                            </table>
                            {bagianUjian.length > 0 && (
                                <p className="text-[9pt] mt-1">
                                    <b>Bagian ujian:</b> {bagianUjian.map((b, i) => `${i + 1}. ${b.nama}${b.durasiMenit ? ` (${b.durasiMenit} menit)` : ""}`).join("   ")}
                                </p>
                            )}

                            {/* Akun login */}
                            <div className="mt-4 border border-black px-3 py-2 text-[10pt] flex flex-wrap gap-x-8 gap-y-1">
                                <span><b>Username:</b> <span className="font-mono">{p.nomorPeserta}</span></span>
                                <span><b>Password:</b> ..............................</span>
                                <span className="text-[8.5pt] italic">(password diberikan oleh panitia — jaga kerahasiaannya)</span>
                            </div>

                            {/* Tata tertib */}
                            {tataTertib.length > 0 && (
                                <>
                                    <h2 className="text-[10.5pt] font-bold mt-4 mb-1 uppercase">Tata Tertib Peserta</h2>
                                    <ol className="list-decimal pl-5 text-[9.5pt] space-y-0.5">
                                        {tataTertib.map((t, i) => <li key={i}>{t}</li>)}
                                    </ol>
                                </>
                            )}

                            {/* Tanda tangan */}
                            <div className="mt-8 grid grid-cols-2 gap-8 text-[10pt]">
                                <div className="text-center">
                                    <p>&nbsp;</p>
                                    <p>Peserta Ujian,</p>
                                    <div className="h-[22mm]" />
                                    <p className="font-bold underline uppercase">{p.nama}</p>
                                </div>
                                <div className="text-center">
                                    <p>{instansi?.kota || "........"}, {fmtTanggalPendek(new Date())}</p>
                                    <p>{instansi?.jabatanPenandatangan},</p>
                                    <div className="h-[22mm]" />
                                    <p className="font-bold underline">{instansi?.namaPenandatangan || "(..............................)"}</p>
                                    {instansi?.nipPenandatangan && <p>NIP. {instansi.nipPenandatangan}</p>}
                                </div>
                            </div>

                            <p className="kartu-footer text-[7.5pt] text-gray-500 text-center">
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
                    padding: 14mm 16mm;
                    box-sizing: border-box;
                    position: relative;
                    margin-bottom: 8mm;
                    font-family: "Times New Roman", Times, serif;
                }
                .kartu-footer { position: absolute; left: 16mm; right: 16mm; bottom: 10mm; }
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
