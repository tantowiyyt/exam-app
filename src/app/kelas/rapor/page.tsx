"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman } from "@/components/AppShell";

// Rapor (laporan hasil belajar) lintas mapel per semester. Siswa: rapornya sendiri.
// Guru/admin: pilih kelas -> ringkasan kelas (rata-rata, ketuntasan, kehadiran, peringkat) -> rapor tiap siswa / cetak semua.

type Kunci = "tugas" | "kuis" | "uh" | "uts" | "uas" | "ujian" | "presensi";
interface Rapor {
    siswa: { id: number; nomorPeserta: string; nama: string };
    nilai: { mapelId: number; komponen: Record<Kunci, number | null>; nilaiAkhir: number | null; tuntas: boolean | null }[];
    rataRata: number | null; jumlahTuntas: number; jumlahBerKkm: number; peringkat: number | null;
    kehadiran: { H: number; I: number; S: number; A: number; kosong: number; pertemuan: number; persen: number | null };
}
interface Data {
    peran: "staf" | "siswa";
    semester: { id: number; label: string; tahunAjaran: string; semester: string; aktif: boolean };
    semesterList: { id: number; label: string; aktif: boolean }[];
    kelasList: { id: number; nama: string }[];
    kelas?: { id: number; nama: string; wali: string };
    sekolah?: { nama: string; alamat: string; kota: string; logo: string; namaAplikasi: string; penandatangan: { jabatan: string; nama: string; nip: string } };
    komponen?: Kunci[];
    mapel?: { id: number; nama: string; guru: string; kkm: number; berbobot: boolean }[];
    rapor?: Rapor[];
}

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
    }, [kelas, semester]);

    const staf = d?.peran === "staf";
    const daftar = d?.rapor ?? [];
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
                    {d && dicetak.map((r) => <KartuRapor key={r.siswa.id} d={d} r={r} staf={!!staf} />)}
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

function KartuRapor({ d, r, staf }: { d: Data; r: Rapor; staf: boolean }) {
    const komponen = d.komponen ?? [];
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
            <h2 className="text-center font-black text-base tracking-widest mt-4">LAPORAN HASIL BELAJAR</h2>
            <p className="text-center text-xs mb-4">Semester {d.semester.semester} · Tahun Ajaran {d.semester.tahunAjaran}</p>

            <dl className="grid grid-cols-[110px_1fr] sm:grid-cols-[110px_1fr_110px_1fr] gap-y-1 mb-4">
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
                            <th className={`${sel} w-12`}>KKM</th>
                            <th className={`${sel} w-24`}>Keterangan</th>
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
                                    <td className={`${sel} text-center`}>{m.kkm || "–"}</td>
                                    <td className={`${sel} text-center text-[11px] ${n?.tuntas === false ? "font-bold" : ""}`}>{n?.tuntas === null || n?.tuntas === undefined ? "–" : n.tuntas ? "Tuntas" : "Belum tuntas"}</td>
                                </tr>
                            );
                        })}
                        <tr className="bg-slate-50">
                            <td className={`${sel} text-right font-bold`} colSpan={2 + komponen.length}>Rata-rata</td>
                            <td className={`${sel} text-center font-black`}>{angka(r.rataRata)}</td>
                            <td className={sel} colSpan={2}>{r.jumlahBerKkm ? `Tuntas ${r.jumlahTuntas} dari ${r.jumlahBerKkm} mapel` : ""}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-start gap-4 mt-4">
                <table className="border-collapse text-[12px] flex-1 min-w-64">
                    <thead>
                        <tr><th colSpan={r.kehadiran.kosong > 0 ? 5 : 4} className={`${sel} bg-slate-100 text-left`}>Kehadiran (pertemuan, semua mapel)</th></tr>
                        <tr>{["Hadir", "Izin", "Sakit", "Alpa", ...(r.kehadiran.kosong > 0 ? ["Belum diisi"] : [])].map((l) => <th key={l} className={`${sel} font-semibold`}>{l}</th>)}</tr>
                    </thead>
                    <tbody>
                        <tr>{[r.kehadiran.H, r.kehadiran.I, r.kehadiran.S, r.kehadiran.A, ...(r.kehadiran.kosong > 0 ? [r.kehadiran.kosong] : [])].map((v, i) => <td key={i} className={`${sel} text-center`}>{v}</td>)}</tr>
                    </tbody>
                </table>
                {staf && r.peringkat !== null && (
                    <div className="border border-slate-400 px-3 py-2">
                        <p className="font-bold">Peringkat kelas</p>
                        <p>Ke-{r.peringkat} dari {d.rapor?.filter((x) => x.rataRata !== null).length} siswa</p>
                    </div>
                )}
            </div>

            {/* Tanda tangan */}
            <div className="grid grid-cols-3 gap-4 mt-10 print:mt-6 text-center text-[12px] break-inside-avoid">
                <div>
                    <p>&nbsp;</p>
                    <p>Orang Tua / Wali</p>
                    <p className="mt-16 print:mt-12">( .............................. )</p>
                </div>
                <div>
                    <p>&nbsp;</p>
                    <p>Wali Kelas</p>
                    <p className="mt-16 print:mt-12 font-bold underline">{d.kelas?.wali || ".............................."}</p>
                </div>
                <div>
                    <p>{s.kota ? `${s.kota}, ` : ""}{tanggal}</p>
                    <p>{s.penandatangan.jabatan || "Kepala Sekolah"}</p>
                    <p className="mt-16 print:mt-12 font-bold underline">{s.penandatangan.nama || ".............................."}</p>
                    {s.penandatangan.nip && <p>NIP. {s.penandatangan.nip}</p>}
                </div>
            </div>
            <p className="text-[9px] text-slate-400 text-right mt-6">Dicetak dari {s.namaAplikasi} · {tanggal}</p>
        </article>
    );
}
