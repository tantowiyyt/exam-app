"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";
import { useToast } from "@/components/Toast";

// Rapor (laporan hasil belajar) lintas mapel per semester. Siswa: rapornya sendiri.
// Guru/admin: pilih kelas -> ringkasan kelas (rata-rata, ketuntasan, kehadiran, peringkat) -> rapor tiap siswa / cetak semua.

type Kunci = "tugas" | "kuis" | "uh" | "uts" | "uas" | "ujian" | "presensi";
interface Rapor {
    siswa: { id: number; nomorPeserta: string; nama: string };
    nilai: { mapelId: number; komponen: Record<Kunci, number | null>; nilaiAkhir: number | null; tuntas: boolean | null; predikat: string | null; deskripsi: string }[];
    catatan: string;
    lengkap: Lengkap;
    rataRata: number | null; jumlahTuntas: number; jumlahBerKkm: number; peringkat: number | null;
    kehadiran: { H: number; I: number; S: number; A: number; kosong: number; pertemuan: number; persen: number | null };
}
interface Lengkap {
    sakit: number | null; izin: number | null; alpa: number | null;
    ketidakhadiran: { S: number; I: number; A: number; manual: boolean };
    ekskul: { nama: string; predikat: string; keterangan: string }[];
    prestasi: { jenis: string; keterangan: string }[];
    kokurikuler: string; keputusan: "" | "naik" | "tinggal" | "lulus"; keKelas: string;
}
interface Data {
    peran: "staf" | "siswa";
    bisaIsiData?: boolean;
    semester: { id: number; label: string; tahunAjaran: string; semester: string; aktif: boolean };
    semesterList: { id: number; label: string; aktif: boolean }[];
    kelasList: { id: number; nama: string }[];
    kelas?: { id: number; nama: string; wali: string };
    sekolah?: { nama: string; alamat: string; kota: string; logo: string; namaAplikasi: string; penandatangan: { jabatan: string; nama: string; nip: string } };
    komponen?: Kunci[];
    mapel?: { id: number; nama: string; guru: string; kkm: number; berbobot: boolean }[];
    rapor?: Rapor[];
    batasPredikat?: { A: number; B: number; C: number };
}
type Format = "merdeka" | "rinci";

const LABEL: Record<Kunci, string> = { tugas: "Tugas", kuis: "Kuis", uh: "UH", uts: "UTS", uas: "UAS", ujian: "Ujian Lain", presensi: "Hadir %" };
const angka = (v: number | null | undefined) => (v === null || v === undefined ? "–" : Number.isInteger(v) ? String(v) : v.toFixed(1));
const PLACEHOLDER = "NAMA SEKOLAH / INSTANSI";

async function muat(q: { kelas?: number; semester?: number }): Promise<{ data?: Data; error?: string }> {
    const p = new URLSearchParams();
    if (q.kelas) p.set("kelas", String(q.kelas));
    if (q.semester) p.set("semester", String(q.semester));
    const res = await fetch(`/api/lms/rapor?${p}`);
    const d = await res.json().catch(() => ({}));
    return res.ok ? { data: d } : { error: d.message || "Gagal memuat rapor" };
}

export default function HalamanRapor() {
    const [kelas, setKelas] = useState<number | undefined>(undefined);
    const [semester, setSemester] = useState<number | undefined>(undefined);
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    // null = ringkasan kelas, "semua" = semua rapor (untuk dicetak), angka = rapor satu siswa
    const [tampil, setTampil] = useState<null | "semua" | number>(null);
    const [pilihFormat, setPilihFormat] = useState<Format | null>(null);
    const [versi, setVersi] = useState(0);

    useEffect(() => {
        let ignore = false;
        muat({ kelas, semester }).then((r) => {
            if (ignore) return;
            if (!r.data) { setError(r.error!); return; }
            setError("");
            // Staf: buka kelas pertama otomatis
            if (r.data.peran === "staf" && !kelas && r.data.kelasList.length) { setKelas(r.data.kelasList[0].id); return; }
            setD(r.data);
        });
        return () => { ignore = true; };
    }, [kelas, semester, versi]);

    const staf = d?.peran === "staf";
    const daftar = d?.rapor ?? [];
    // Format bawaan: Kurikulum Merdeka bila sudah ada deskripsi capaian, selain itu rinci per komponen
    const format: Format = pilihFormat ?? (daftar.some((r) => r.nilai.some((n) => n.deskripsi)) ? "merdeka" : "rinci");
    const dicetak = !staf ? daftar : tampil === "semua" ? daftar : typeof tampil === "number" ? daftar.filter((r) => r.siswa.id === tampil) : [];

    return (
        <div className="min-h-screen bg-slate-100 font-sans print:bg-white">
            <HeaderHalaman grup="Akademik" judul="Rapor">
                {d && d.semesterList.length > 1 && (
                    <select value={d.semester.id} onChange={(e) => { setSemester(Number(e.target.value)); setTampil(null); }} aria-label="Semester"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {d.semesterList.map((s) => <option key={s.id} value={s.id}>{s.label}{s.aktif ? " (aktif)" : ""}</option>)}
                    </select>
                )}
                {staf && d.kelasList.length > 0 && (
                    <select value={kelas ?? ""} onChange={(e) => { setKelas(Number(e.target.value)); setTampil(null); }} aria-label="Kelas"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {d.kelasList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                    </select>
                )}
                {dicetak.length > 0 && (
                    <select value={format} onChange={(e) => setPilihFormat(e.target.value as Format)} aria-label="Format rapor"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        <option value="merdeka">Format Kurikulum Merdeka</option>
                        <option value="rinci">Format rinci per komponen</option>
                    </select>
                )}
                {staf && kelas && <a href={`/api/lms/rapor/ekspor?kelas=${kelas}&semester=${d.semester.id}`} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold" title="Nilai, capaian, kehadiran, ekskul dalam Excel untuk disalin ke e-Rapor">Ekspor e-Rapor</a>}
                {dicetak.length > 0 && <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Cetak / PDF</button>}
            </HeaderHalaman>

            <main className="max-w-5xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {!d && !error && <p className="text-slate-500">Memuat rapor...</p>}
                {d && staf && d.kelasList.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada kelas yang Anda ajar atau walikan.</p>}

                {d && staf && d.rapor && tampil === null && <RingkasanKelas d={d} onBuka={setTampil} />}

                {d && staf && tampil !== null && (
                    <button onClick={() => setTampil(null)} className="mb-4 text-sm font-bold text-indigo-600 hover:underline print:hidden">&larr; Ringkasan kelas {d.kelas?.nama}</button>
                )}
                <div className="space-y-8 print:space-y-0">
                    {d && dicetak.map((r) => <KartuRapor key={r.siswa.id} d={d} r={r} staf={!!staf} format={format} bisaCatat={!!staf && typeof tampil === "number"} onCatat={() => setVersi((v) => v + 1)} />)}
                </div>
            </main>
        </div>
    );
}

function RingkasanKelas({ d, onBuka }: { d: Data; onBuka: (v: "semua" | number) => void }) {
    const rapor = d.rapor ?? [];
    const rata = rapor.map((r) => r.rataRata).filter((x): x is number => x !== null);
    return (
        <section className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                    ["Siswa", rapor.length],
                    ["Mata pelajaran", d.mapel?.length ?? 0],
                    ["Rata-rata kelas", rata.length ? angka(Math.round((rata.reduce((a, b) => a + b, 0) / rata.length) * 10) / 10) : "–"],
                    ["Wali kelas", d.kelas?.wali || "–"],
                ] as [string, string | number][]).map(([l, v]) => (
                    <div key={l} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                        <p className="text-xl font-black text-slate-800 mt-1 truncate">{v}</p>
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-sm font-bold text-slate-700">Kelas {d.kelas?.nama} · {d.semester.label}</p>
                    <button onClick={() => onBuka("semua")} disabled={!rapor.length} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-50">Tampilkan & Cetak Semua Rapor</button>
                </div>
                {rapor.length === 0 && <p className="p-8 text-center text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left w-10">No</th>
                                <th className="px-3 py-2 text-left">Siswa</th>
                                <th className="px-3 py-2 text-center">Rata-rata</th>
                                <th className="px-3 py-2 text-center">Tuntas</th>
                                <th className="px-3 py-2 text-center">Kehadiran</th>
                                <th className="px-3 py-2 text-center">Peringkat</th>
                                <th className="px-3 py-2 text-right" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rapor.map((r, i) => (
                                <tr key={r.siswa.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                                    <td className="px-3 py-2"><p className="font-semibold text-slate-700">{r.siswa.nama}</p><p className="font-mono text-[10px] text-slate-400">{r.siswa.nomorPeserta}</p></td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-800">{angka(r.rataRata)}</td>
                                    <td className={`px-3 py-2 text-center font-semibold ${r.jumlahBerKkm && r.jumlahTuntas < r.jumlahBerKkm ? "text-red-600" : "text-slate-600"}`}>{r.jumlahBerKkm ? `${r.jumlahTuntas}/${r.jumlahBerKkm}` : "–"}</td>
                                    <td className={`px-3 py-2 text-center ${r.kehadiran.persen !== null && r.kehadiran.persen < 75 ? "text-red-600 font-bold" : "text-slate-600"}`}>{r.kehadiran.persen === null ? "–" : `${angka(r.kehadiran.persen)}%`}</td>
                                    <td className="px-3 py-2 text-center text-slate-600">{r.peringkat ?? "–"}</td>
                                    <td className="px-3 py-2 text-right"><button onClick={() => onBuka(r.siswa.id)} className="text-xs font-bold text-indigo-600 hover:underline">Lihat rapor</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="text-xs text-slate-500">Nilai akhir tiap mapel = rekap nilai mapel (bobot & KKM diatur guru di tab Nilai). Kehadiran = gabungan presensi semua mapel pada pertemuan yang sudah berlangsung.</p>
        </section>
    );
}

function CatatanWali({ d, r, bisaCatat, onCatat }: { d: Data; r: Rapor; bisaCatat: boolean; onCatat: () => void }) {
    const { toast } = useToast();
    const [teks, setTeks] = useState(r.catatan);
    const [simpan, setSimpan] = useState(false);
    const kirimCatatan = async () => {
        setSimpan(true);
        const res = await fetch("/api/lms/rapor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siswa: r.siswa.id, semester: d.semester.id, catatan: teks }) });
        const data = await res.json().catch(() => ({}));
        setSimpan(false);
        toast(data.message || (res.ok ? "Tersimpan" : "Gagal"), res.ok ? "success" : "error");
        if (res.ok) onCatat();
    };
    return (
        <div className="border border-slate-400 mt-4 print:mt-2 break-inside-avoid">
            <p className="bg-slate-100 border-b border-slate-400 px-2 py-1 text-[12px] font-bold">Catatan Wali Kelas</p>
            {bisaCatat ? (
                <div className="p-2 space-y-2 print:hidden">
                    <textarea value={teks} onChange={(e) => setTeks(e.target.value)} rows={2} maxLength={1000} aria-label="Catatan wali kelas"
                        placeholder="mis. Pertahankan semangat belajar. Tingkatkan kehadiran." className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px]" />
                    <button onClick={kirimCatatan} disabled={simpan || teks === r.catatan} className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan catatan"}</button>
                </div>
            ) : null}
            <p className={`px-2 py-2 print:py-1 text-[12px] min-h-10 print:min-h-6 whitespace-pre-wrap ${bisaCatat ? "hidden print:block" : ""}`}>{r.catatan || "\u00a0"}</p>
        </div>
    );
}

/** Isian data rapor oleh wali kelas / admin (tidak ikut dicetak). */
function FormDataRapor({ d, r, onSaved }: { d: Data; r: Rapor; onSaved: () => void }) {
    const { toast } = useToast();
    const L = r.lengkap;
    const [f, setF] = useState({
        sakit: L.sakit ?? "", izin: L.izin ?? "", alpa: L.alpa ?? "",
        ekskul: L.ekskul.length ? L.ekskul : [{ nama: "", predikat: "", keterangan: "" }],
        prestasi: L.prestasi.length ? L.prestasi : [{ jenis: "", keterangan: "" }],
        kokurikuler: L.kokurikuler, keputusan: L.keputusan, keKelas: L.keKelas,
    });
    const [simpan, setSimpan] = useState(false);
    const kirimData = async () => {
        setSimpan(true);
        const res = await fetch("/api/lms/rapor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siswa: r.siswa.id, semester: d.semester.id, data: f }) });
        const data = await res.json().catch(() => ({}));
        setSimpan(false);
        toast(data.message || (res.ok ? "Tersimpan" : "Gagal"), res.ok ? "success" : "error");
        if (res.ok) onSaved();
    };
    const inp = "w-full border border-slate-300 rounded-lg px-2 py-1 text-[12px]";
    const hari = (k: "sakit" | "izin" | "alpa", l: string) => (
        <label className="text-[11px] font-bold text-slate-600">{l}
            <input type="number" min={0} max={366} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={String(L.ketidakhadiran[k === "sakit" ? "S" : k === "izin" ? "I" : "A"])} className={inp} />
        </label>
    );
    return (
        <section className="mt-6 border-2 border-dashed border-indigo-300 rounded-xl p-4 space-y-4 print:hidden">
            <p className="text-sm font-black text-indigo-700">Isi Data Rapor (wali kelas)</p>
            <div>
                <p className="text-xs font-bold text-slate-600 mb-1">Ketidakhadiran (hari) — kosongkan untuk memakai jumlah dari presensi</p>
                <div className="grid grid-cols-3 gap-2 max-w-md">{hari("sakit", "Sakit")}{hari("izin", "Izin")}{hari("alpa", "Tanpa keterangan")}</div>
            </div>
            <div>
                <p className="text-xs font-bold text-slate-600 mb-1">Ekstrakurikuler</p>
                {f.ekskul.map((e, i) => (
                    <div key={i} className="grid grid-cols-[2fr_1fr_3fr_auto] gap-2 mb-1">
                        <input value={e.nama} onChange={(x) => setF({ ...f, ekskul: f.ekskul.map((y, j) => (j === i ? { ...y, nama: x.target.value } : y)) })} placeholder="Kegiatan, mis. Pramuka" aria-label="Kegiatan ekstrakurikuler" className={inp} />
                        <input value={e.predikat} onChange={(x) => setF({ ...f, ekskul: f.ekskul.map((y, j) => (j === i ? { ...y, predikat: x.target.value } : y)) })} placeholder="Predikat" aria-label="Predikat" className={inp} />
                        <input value={e.keterangan} onChange={(x) => setF({ ...f, ekskul: f.ekskul.map((y, j) => (j === i ? { ...y, keterangan: x.target.value } : y)) })} placeholder="Keterangan" aria-label="Keterangan" className={inp} />
                        <button type="button" onClick={() => setF({ ...f, ekskul: f.ekskul.filter((_, j) => j !== i) })} className="text-xs text-red-600 font-bold px-1" aria-label="Hapus baris">✕</button>
                    </div>
                ))}
                {f.ekskul.length < 10 && <button type="button" onClick={() => setF({ ...f, ekskul: [...f.ekskul, { nama: "", predikat: "", keterangan: "" }] })} className="text-xs font-bold text-indigo-600">+ Ekstrakurikuler</button>}
            </div>
            <div>
                <p className="text-xs font-bold text-slate-600 mb-1">Prestasi</p>
                {f.prestasi.map((p, i) => (
                    <div key={i} className="grid grid-cols-[2fr_3fr_auto] gap-2 mb-1">
                        <input value={p.jenis} onChange={(x) => setF({ ...f, prestasi: f.prestasi.map((y, j) => (j === i ? { ...y, jenis: x.target.value } : y)) })} placeholder="Jenis, mis. Juara 1 OSN Matematika" aria-label="Jenis prestasi" className={inp} />
                        <input value={p.keterangan} onChange={(x) => setF({ ...f, prestasi: f.prestasi.map((y, j) => (j === i ? { ...y, keterangan: x.target.value } : y)) })} placeholder="Keterangan (tingkat, tahun)" aria-label="Keterangan prestasi" className={inp} />
                        <button type="button" onClick={() => setF({ ...f, prestasi: f.prestasi.filter((_, j) => j !== i) })} className="text-xs text-red-600 font-bold px-1" aria-label="Hapus baris">✕</button>
                    </div>
                ))}
                {f.prestasi.length < 10 && <button type="button" onClick={() => setF({ ...f, prestasi: [...f.prestasi, { jenis: "", keterangan: "" }] })} className="text-xs font-bold text-indigo-600">+ Prestasi</button>}
            </div>
            <label className="block text-xs font-bold text-slate-600">Kokurikuler / Projek (P5)
                <textarea value={f.kokurikuler} onChange={(e) => setF({ ...f, kokurikuler: e.target.value })} rows={2} maxLength={2000} placeholder="Deskripsi capaian kegiatan kokurikuler / projek penguatan profil pelajar Pancasila" className={inp} />
            </label>
            <div className="flex flex-wrap gap-3 items-end">
                <label className="text-xs font-bold text-slate-600">Keputusan
                    <select value={f.keputusan} onChange={(e) => setF({ ...f, keputusan: e.target.value as Lengkap["keputusan"] })} className={inp}>
                        <option value="">— belum —</option><option value="naik">Naik kelas</option><option value="tinggal">Tinggal kelas</option><option value="lulus">Lulus</option>
                    </select>
                </label>
                {(f.keputusan === "naik" || f.keputusan === "tinggal") && (
                    <label className="text-xs font-bold text-slate-600">{f.keputusan === "naik" ? "Ke kelas" : "Di kelas"}
                        <input value={f.keKelas} onChange={(e) => setF({ ...f, keKelas: e.target.value })} maxLength={50} placeholder="mis. XI IPA 1" className={inp} />
                    </label>
                )}
                <button onClick={kirimData} disabled={simpan} className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan data rapor"}</button>
            </div>
        </section>
    );
}

function KartuRapor({ d, r, staf, format, bisaCatat, onCatat }: { d: Data; r: Rapor; staf: boolean; format: Format; bisaCatat: boolean; onCatat: () => void }) {
    const merdeka = format === "merdeka";
    const komponen = merdeka ? [] : d.komponen ?? [];
    const mapel = d.mapel ?? [];
    const s = d.sekolah!;
    const namaSekolah = s.nama && s.nama !== PLACEHOLDER ? s.nama : "";
    const tanggal = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const sel = "border border-slate-400 px-2 py-1.5 print:py-[3px]";
    return (
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-10 text-slate-900 text-[13px] print:rounded-none print:border-0 print:shadow-none print:p-0 print:break-after-page">
            {/* Kop */}
            <header className="flex items-center gap-4 border-b-4 border-double border-slate-800 pb-3 print:pb-2">
                {s.logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.logo} alt="" className="w-16 h-16 object-contain" />
                    : <span className="w-16 h-16" />}
                <div className="flex-1 text-center">
                    <p className="text-lg font-black uppercase leading-tight">{namaSekolah || s.namaAplikasi}</p>
                    {s.alamat && <p className="text-xs">{s.alamat}{s.kota ? `, ${s.kota}` : ""}</p>}
                </div>
                <span className="w-16" />
            </header>
            <h2 className="text-center font-black text-base tracking-widest mt-4 print:mt-2">LAPORAN HASIL BELAJAR</h2>
            <p className="text-center text-xs mb-4 print:mb-2">Semester {d.semester.semester} · Tahun Ajaran {d.semester.tahunAjaran}</p>

            <dl className="grid grid-cols-[110px_1fr] sm:grid-cols-[110px_1fr_110px_1fr] gap-y-1 mb-4 print:mb-2">
                <dt>Nama</dt><dd className="font-bold">: {r.siswa.nama}</dd>
                <dt>Kelas</dt><dd>: {d.kelas?.nama}</dd>
                <dt>NIS</dt><dd>: {r.siswa.nomorPeserta}</dd>
                <dt>Semester</dt><dd>: {d.semester.semester} ({d.semester.tahunAjaran})</dd>
            </dl>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                    <thead className="bg-slate-100 print:bg-slate-100">
                        <tr>
                            <th className={`${sel} w-8`}>No</th>
                            <th className={`${sel} text-left`}>Mata Pelajaran</th>
                            {komponen.map((k) => <th key={k} className={`${sel} w-14`}>{LABEL[k]}</th>)}
                            <th className={`${sel} w-16`}>Nilai Akhir</th>
                            <th className={`${sel} w-14`}>Predikat</th>
                            {merdeka ? <th className={`${sel} text-left`}>Capaian Kompetensi</th> : <>
                                <th className={`${sel} w-12`}>KKM</th>
                                <th className={`${sel} w-24`}>Keterangan</th>
                            </>}
                        </tr>
                    </thead>
                    <tbody>
                        {mapel.map((m, i) => {
                            const n = r.nilai.find((x) => x.mapelId === m.id);
                            return (
                                <tr key={m.id}>
                                    <td className={`${sel} text-center`}>{i + 1}</td>
                                    <td className={sel}><span className="font-semibold">{m.nama}</span>{m.guru && <span className="block print:inline print:ml-1 text-[10px] text-slate-500">{m.guru}</span>}</td>
                                    {komponen.map((k) => <td key={k} className={`${sel} text-center`}>{angka(n?.komponen[k])}</td>)}
                                    <td className={`${sel} text-center font-bold`}>{angka(n?.nilaiAkhir)}</td>
                                    <td className={`${sel} text-center font-bold`}>{n?.predikat ?? "–"}</td>
                                    {merdeka ? <td className={`${sel} text-[11px] print:text-[10px] leading-snug`}>{n?.deskripsi || <span className="text-slate-400">–</span>}</td> : <>
                                        <td className={`${sel} text-center`}>{m.kkm || "–"}</td>
                                        <td className={`${sel} text-center text-[11px] ${n?.tuntas === false ? "font-bold" : ""}`}>{n?.tuntas === null || n?.tuntas === undefined ? "–" : n.tuntas ? "Tuntas" : "Belum tuntas"}</td>
                                    </>}
                                </tr>
                            );
                        })}
                        <tr className="bg-slate-50">
                            <td className={`${sel} text-right font-bold`} colSpan={2 + komponen.length}>Rata-rata</td>
                            <td className={`${sel} text-center font-black`}>{angka(r.rataRata)}</td>
                            <td className={sel} colSpan={merdeka ? 2 : 3}>{r.jumlahBerKkm ? `Tuntas ${r.jumlahTuntas} dari ${r.jumlahBerKkm} mapel` : ""}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {(merdeka || r.lengkap.kokurikuler) && (
                <div className="border border-slate-400 mt-4 print:mt-2 break-inside-avoid">
                    <p className="bg-slate-100 border-b border-slate-400 px-2 py-1 text-[12px] font-bold">Kokurikuler</p>
                    <p className="px-2 py-2 print:py-1 text-[12px] min-h-8 whitespace-pre-wrap">{r.lengkap.kokurikuler || "\u00a0"}</p>
                </div>
            )}

            <div className="grid sm:grid-cols-2 print:grid-cols-2 gap-4 print:gap-2 mt-4 print:mt-2">
                <table className="border-collapse text-[12px] w-full break-inside-avoid">
                    <thead>
                        <tr><th colSpan={3} className={`${sel} bg-slate-100 text-left`}>Ekstrakurikuler</th></tr>
                        <tr><th className={`${sel} font-semibold text-left`}>Kegiatan</th><th className={`${sel} font-semibold w-16`}>Predikat</th><th className={`${sel} font-semibold text-left`}>Keterangan</th></tr>
                    </thead>
                    <tbody>
                        {(r.lengkap.ekskul.length ? r.lengkap.ekskul : [{ nama: "–", predikat: "", keterangan: "" }]).map((e, i) => (
                            <tr key={i}><td className={sel}>{e.nama}</td><td className={`${sel} text-center`}>{e.predikat}</td><td className={`${sel} text-[11px]`}>{e.keterangan}</td></tr>
                        ))}
                    </tbody>
                </table>
                <table className="border-collapse text-[12px] w-full break-inside-avoid">
                    <thead>
                        <tr><th colSpan={2} className={`${sel} bg-slate-100 text-left`}>Prestasi</th></tr>
                        <tr><th className={`${sel} font-semibold text-left`}>Jenis Prestasi</th><th className={`${sel} font-semibold text-left`}>Keterangan</th></tr>
                    </thead>
                    <tbody>
                        {(r.lengkap.prestasi.length ? r.lengkap.prestasi : [{ jenis: "–", keterangan: "" }]).map((p, i) => (
                            <tr key={i}><td className={sel}>{p.jenis}</td><td className={`${sel} text-[11px]`}>{p.keterangan}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-start gap-4 mt-4 print:mt-2">
                <table className="border-collapse text-[12px] min-w-56 break-inside-avoid">
                    <thead><tr><th colSpan={2} className={`${sel} bg-slate-100 text-left`}>Ketidakhadiran</th></tr></thead>
                    <tbody>
                        {([["Sakit", r.lengkap.ketidakhadiran.S], ["Izin", r.lengkap.ketidakhadiran.I], ["Tanpa keterangan", r.lengkap.ketidakhadiran.A]] as [string, number][]).map(([l, v]) => (
                            <tr key={l}><td className={sel}>{l}</td><td className={`${sel} w-28 text-center`}>{v} {r.lengkap.ketidakhadiran.manual ? "hari" : "pertemuan"}</td></tr>
                        ))}
                    </tbody>
                </table>
                {!merdeka && <table className="border-collapse text-[12px] flex-1 min-w-64">
                    <thead>
                        <tr><th colSpan={r.kehadiran.kosong > 0 ? 5 : 4} className={`${sel} bg-slate-100 text-left`}>Kehadiran (pertemuan, semua mapel)</th></tr>
                        <tr>{["Hadir", "Izin", "Sakit", "Alpa", ...(r.kehadiran.kosong > 0 ? ["Belum diisi"] : [])].map((l) => <th key={l} className={`${sel} font-semibold`}>{l}</th>)}</tr>
                    </thead>
                    <tbody>
                        <tr>{[r.kehadiran.H, r.kehadiran.I, r.kehadiran.S, r.kehadiran.A, ...(r.kehadiran.kosong > 0 ? [r.kehadiran.kosong] : [])].map((v, i) => <td key={i} className={`${sel} text-center`}>{v}</td>)}</tr>
                    </tbody>
                </table>}
                {staf && r.peringkat !== null && (
                    <div className="border border-slate-400 px-3 py-2">
                        <p className="font-bold">Peringkat kelas</p>
                        <p>Ke-{r.peringkat} dari {d.rapor?.filter((x) => x.rataRata !== null).length} siswa</p>
                    </div>
                )}
            </div>

            <CatatanWali d={d} r={r} bisaCatat={bisaCatat} onCatat={onCatat} />

            {(r.lengkap.keputusan || d.semester.semester === "Genap") && (
                <div className="border border-slate-400 mt-4 print:mt-2 px-3 py-2 text-[12px] break-inside-avoid">
                    <p className="font-bold">Keputusan</p>
                    <p>Berdasarkan pencapaian seluruh kompetensi, peserta didik dinyatakan:{" "}
                        <b>{r.lengkap.keputusan === "naik" ? `Naik ke kelas ${r.lengkap.keKelas || "........"}`
                            : r.lengkap.keputusan === "tinggal" ? `Tinggal di kelas ${r.lengkap.keKelas || d.kelas?.nama || "........"}`
                                : r.lengkap.keputusan === "lulus" ? "LULUS" : "........................................"}</b>
                    </p>
                </div>
            )}

            {bisaCatat && d.bisaIsiData && <FormDataRapor key={`${r.siswa.id}-${d.semester.id}`} d={d} r={r} onSaved={onCatat} />}

            {/* Tanda tangan */}
            <div className="grid grid-cols-3 gap-4 mt-10 print:mt-3 text-center text-[12px] break-inside-avoid">
                <div>
                    <p>&nbsp;</p>
                    <p>Orang Tua / Wali</p>
                    <p className="mt-16 print:mt-10">( .............................. )</p>
                </div>
                <div>
                    <p>&nbsp;</p>
                    <p>Wali Kelas</p>
                    <p className="mt-16 print:mt-10 font-bold underline">{d.kelas?.wali || ".............................."}</p>
                </div>
                <div>
                    <p>{s.kota ? `${s.kota}, ` : ""}{tanggal}</p>
                    <p>{s.penandatangan.jabatan || "Kepala Sekolah"}</p>
                    <p className="mt-16 print:mt-10 font-bold underline">{s.penandatangan.nama || ".............................."}</p>
                    {s.penandatangan.nip && <p>NIP. {s.penandatangan.nip}</p>}
                </div>
            </div>
            <p className="text-[9px] text-slate-400 text-right mt-6">Dicetak dari {s.namaAplikasi} · {tanggal}</p>
        </article>
    );
}
