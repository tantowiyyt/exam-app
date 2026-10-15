"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeaderHalaman } from "@/components/AppShell";
import { fmtTanggal, fmtWaktu } from "@/components/lms/ui";

// Portal orang tua: ringkasan tiap anak, lalu rincian (nilai, tugas, kehadiran, jadwal, pengumuman, ujian). Hanya baca.

interface Ringkas { siswa: { id: number; nomorPeserta: string; nama: string; kelas: string }; kehadiran: { persen: number | null; pertemuan: number; A: number; S: number; I: number }; tugasMendatang: number; tugasTerlambat: number }
interface Detail {
    semester: { label: string };
    siswa: { id: number; nama: string; nomorPeserta: string; kelas: string };
    wali: { id: number; nama: string } | null;
    nilai: { id: number; nama: string; guru: { id: number; nama: string } | null; kkm: number; nilaiAkhir: number | null; tuntas: boolean | null }[];
    kehadiran: { total: { H: number; I: number; S: number; A: number; belum: number; pertemuan: number; persen: number | null }; riwayat: { id: number; mapel: string; judul: string; tanggal: string; status: string | null; keterangan: string }[] };
    tugas: { id: number; judul: string; mapel: string; tenggat: string | null; status: string; nilai: number | null; nilaiMaks: number }[];
    jadwal: { id: number; hari: number; jamMulai: string; jamSelesai: string; mapel: string; ruang: string; hariIni: boolean }[];
    pengumuman: { id: number; judul: string; isi: string; createdAt: string; mapel: string }[];
    ujian: { id: number; judul: string; jenis: string; tanggal: string | null; mapel: string }[];
}
const STATUS_TUGAS: Record<string, [string, string]> = {
    belum: ["Belum dikumpulkan", "bg-amber-100 text-amber-800"], terlambat: ["Lewat tenggat", "bg-red-100 text-red-700"],
    dikumpulkan: ["Dikumpulkan", "bg-sky-100 text-sky-700"], revisi: ["Perlu revisi", "bg-orange-100 text-orange-700"], dinilai: ["Dinilai", "bg-emerald-100 text-emerald-700"],
};
const HADIR: Record<string, string> = { H: "Hadir", I: "Izin", S: "Sakit", A: "Alpa" };
const HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const warna = (p: number | null) => (p === null ? "text-slate-400" : p < 75 ? "text-red-600" : "text-emerald-600");

export default function PortalOrtu() {
    const [anak, setAnak] = useState<Ringkas[] | null>(null);
    const [pilih, setPilih] = useState<number | null>(null);
    const [d, setD] = useState<Detail | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let ignore = false;
        fetch("/api/ortu").then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).then(({ ok, data }) => {
            if (ignore) return;
            if (!ok) return setError(data.message || "Gagal memuat");
            setAnak(data.anak);
            if (data.anak.length) setPilih(data.anak[0].siswa.id);
        });
        return () => { ignore = true; };
    }, []);
    useEffect(() => {
        if (!pilih) return;
        let ignore = false;
        fetch(`/api/ortu?anak=${pilih}`).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).then(({ ok, data }) => { if (!ignore) { if (ok) setD(data); else setError(data.message); } });
        return () => { ignore = true; };
    }, [pilih]);

    const tampil = d && d.siswa.id === pilih ? d : null;
    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Orang Tua" judul="Pantau Belajar Anak" />
            <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
                {error && <p className="text-red-600 font-semibold">{error}</p>}
                {anak?.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">Akun Anda belum ditautkan ke data siswa. Hubungi admin sekolah.</p>}
                {anak && anak.length > 0 && (
                    <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {anak.map((a) => (
                            <button key={a.siswa.id} onClick={() => setPilih(a.siswa.id)} className={`text-left bg-white rounded-2xl border p-4 shadow-sm ${pilih === a.siswa.id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"}`}>
                                <p className="font-black text-slate-800">{a.siswa.nama}</p>
                                <p className="text-xs text-slate-500">{a.siswa.kelas || "Belum ada kelas"} · NIS {a.siswa.nomorPeserta}</p>
                                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                                    <div><p className={`text-lg font-black ${warna(a.kehadiran.persen)}`}>{a.kehadiran.persen ?? "–"}{a.kehadiran.persen !== null && "%"}</p><p className="text-[10px] text-slate-500">Kehadiran</p></div>
                                    <div><p className="text-lg font-black text-amber-600">{a.tugasMendatang}</p><p className="text-[10px] text-slate-500">Tugas berjalan</p></div>
                                    <div><p className={`text-lg font-black ${a.tugasTerlambat ? "text-red-600" : "text-slate-400"}`}>{a.tugasTerlambat}</p><p className="text-[10px] text-slate-500">Terlambat</p></div>
                                </div>
                            </button>
                        ))}
                    </section>
                )}

                {pilih && !tampil && !error && <p className="text-slate-500">Memuat data anak...</p>}
                {tampil && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-lg font-black text-slate-800 flex-1">{tampil.siswa.nama} · {tampil.siswa.kelas} <span className="text-sm font-semibold text-slate-500">({tampil.semester.label})</span></h2>
                            <Link href={`/ortu/rapor?anak=${tampil.siswa.id}`} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Lihat Rapor</Link>
                            {tampil.wali && <Link href={`/akun/pesan?dengan=${tampil.wali.id}`} className="px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-bold">Pesan ke Wali Kelas</Link>}
                        </div>
                        <div className="grid lg:grid-cols-2 gap-6">
                            <section className="bg-white rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 px-4 py-3 border-b border-slate-100">Nilai per Mata Pelajaran</h3>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {tampil.nilai.map((n) => (
                                            <tr key={n.id} className="border-t border-slate-50">
                                                <td className="px-4 py-2"><b className="text-slate-800">{n.nama}</b>{n.guru && <span className="block text-[11px] text-slate-400">{n.guru.nama} · <Link href={`/akun/pesan?dengan=${n.guru.id}`} className="text-indigo-600 hover:underline">kirim pesan</Link></span>}</td>
                                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                                    <b className={n.nilaiAkhir === null ? "text-slate-300" : n.tuntas === false ? "text-red-600" : "text-slate-800"}>{n.nilaiAkhir ?? "–"}</b>
                                                    {n.kkm > 0 && <span className="block text-[10px] text-slate-400">KKM {n.kkm}{n.tuntas === false && " · belum tuntas"}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {!tampil.nilai.length && <tr><td className="p-6 text-center text-slate-400 italic">Belum ada mapel.</td></tr>}
                                    </tbody>
                                </table>
                                <p className="px-4 py-2 text-[11px] text-slate-400">Hanya nilai yang sudah diumumkan guru.</p>
                            </section>
                            <section className="bg-white rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 px-4 py-3 border-b border-slate-100">Tugas</h3>
                                <ul className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                                    {tampil.tugas.map((t) => {
                                        const [label, cls] = STATUS_TUGAS[t.status] ?? [t.status, "bg-slate-100 text-slate-600"];
                                        return (
                                            <li key={t.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                                                <span className="flex-1 min-w-0"><b className="text-slate-800 block truncate">{t.judul}</b><span className="text-[11px] text-slate-400">{t.mapel}{t.tenggat && ` · tenggat ${fmtWaktu(t.tenggat)}`}</span></span>
                                                {t.nilai !== null && <b className="text-slate-700">{t.nilai}/{t.nilaiMaks}</b>}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cls}`}>{label}</span>
                                            </li>
                                        );
                                    })}
                                    {!tampil.tugas.length && <li className="p-6 text-center text-slate-400 italic text-sm">Belum ada tugas.</li>}
                                </ul>
                            </section>
                            <section className="bg-white rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 px-4 py-3 border-b border-slate-100">Kehadiran <span className={`ml-2 ${warna(tampil.kehadiran.total.persen)}`}>{tampil.kehadiran.total.persen ?? "–"}{tampil.kehadiran.total.persen !== null && "%"}</span></h3>
                                <p className="px-4 pt-3 text-xs text-slate-600">Hadir {tampil.kehadiran.total.H} · Izin {tampil.kehadiran.total.I} · Sakit {tampil.kehadiran.total.S} · Alpa {tampil.kehadiran.total.A} dari {tampil.kehadiran.total.pertemuan} pertemuan</p>
                                <ul className="divide-y divide-slate-50 max-h-72 overflow-y-auto mt-2">
                                    {tampil.kehadiran.riwayat.filter((r) => r.status !== "H").slice(0, 30).map((r) => (
                                        <li key={r.id} className="px-4 py-2 text-xs flex gap-3"><span className="w-20 text-slate-400">{fmtTanggal(r.tanggal)}</span><span className="flex-1">{r.mapel} · {r.judul}{r.keterangan && ` (${r.keterangan})`}</span><b className={r.status === "A" ? "text-red-600" : "text-slate-600"}>{r.status ? HADIR[r.status] : "Belum diisi"}</b></li>
                                    ))}
                                    {!tampil.kehadiran.riwayat.some((r) => r.status !== "H") && <li className="p-4 text-center text-xs text-slate-400 italic">Tidak ada catatan ketidakhadiran.</li>}
                                </ul>
                            </section>
                            <section className="bg-white rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 px-4 py-3 border-b border-slate-100">Ujian Mendatang & Pengumuman</h3>
                                <ul className="divide-y divide-slate-50">
                                    {tampil.ujian.map((u) => <li key={`u${u.id}`} className="px-4 py-2 text-sm"><b className="text-indigo-700">{u.jenis === "LAIN" ? "Ujian" : u.jenis}</b> · {u.judul} <span className="text-xs text-slate-400">· {u.mapel}{u.tanggal && ` · ${fmtTanggal(u.tanggal)}`}</span></li>)}
                                    {tampil.pengumuman.map((p) => <li key={`p${p.id}`} className="px-4 py-2 text-sm"><b className="text-slate-800">{p.judul}</b> <span className="text-xs text-slate-400">· {p.mapel} · {fmtTanggal(p.createdAt)}</span><p className="text-xs text-slate-600 line-clamp-2">{p.isi}</p></li>)}
                                    {!tampil.ujian.length && !tampil.pengumuman.length && <li className="p-4 text-center text-xs text-slate-400 italic">Belum ada.</li>}
                                </ul>
                            </section>
                        </div>
                        {tampil.jadwal.length > 0 && (
                            <section className="bg-white rounded-2xl border border-slate-200 p-4">
                                <h3 className="font-bold text-slate-800 mb-3">Jadwal Pelajaran</h3>
                                <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                                    {[1, 2, 3, 4, 5, 6].map((h) => (
                                        <div key={h}><p className={`font-bold mb-1 ${tampil.jadwal.some((j) => j.hari === h && j.hariIni) ? "text-indigo-600" : "text-slate-700"}`}>{HARI[h]}</p>
                                            {tampil.jadwal.filter((j) => j.hari === h).map((j) => <p key={j.id} className="text-slate-600"><span className="font-mono text-slate-400">{j.jamMulai}</span> {j.mapel}</p>)}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
