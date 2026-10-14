"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { LmsNav, IsiTeks, kirim, fmtWaktu } from "@/components/lms/ui";
import { FormKuis, EditorSoal, KerjakanKuis, RincianPercobaan, masukLayarPenuh, layarPenuhDidukung, type SoalEdit, type TipeSoal, type KuisData } from "@/components/lms/kuis";
import { MonitorUjian, TokenUjian } from "@/components/lms/MonitorUjian";

interface Percobaan { id: number; userId: number; ke: number; mulaiAt: string; selesaiAt: string | null; nilai: number | null; skor: number | null; skorMaks: number | null; perluDinilai: boolean }
interface Terbaik { nilai: number; perluDinilai: boolean }
interface Info extends KuisData {
    id: number; mapelId: number; status: "draf" | "belum" | "buka" | "tutup"; jumlahSoal: number; totalBobot: number; adaEsai: boolean;
    token?: string; perluToken?: boolean;
}
interface Data {
    peran: "kelola" | "siswa";
    mapel: { id: number; nama: string; kelas: string };
    kuis: Info;
    // siswa
    percobaan?: Percobaan[];
    aktif?: { id: number; batas: string | null } | null;
    sisaPercobaan?: number;
    terbaik?: Terbaik | null;
    kunciTerbuka?: boolean;
    hasilDiumumkan?: boolean;
    // pengelola
    soal?: { id: number; tipe: TipeSoal; pertanyaan: string; opsi: string[]; kunci: string; pembahasan: string; bobot: number }[];
    hasil?: { siswa: { id: number; nomorPeserta: string; nama: string }; percobaan: Percobaan[]; terbaik: Terbaik | null; sedang: boolean }[];
}

const STATUS: Record<Info["status"], { label: string; cls: string }> = {
    draf: { label: "Draf", cls: "bg-slate-200 text-slate-600" },
    belum: { label: "Belum dibuka", cls: "bg-sky-100 text-sky-700" },
    buka: { label: "Sedang dibuka", cls: "bg-emerald-100 text-emerald-700" },
    tutup: { label: "Ditutup", cls: "bg-red-100 text-red-700" },
};

async function muat(id: string) {
    const res = await fetch(`/api/lms/kuis/${id}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data: data as Data } : { error: (data.message as string) || "Gagal memuat" };
}

export default function HalamanKuis() {
    const { id, kuisId } = useParams<{ id: string; kuisId: string }>();
    const router = useRouter();
    const { toast } = useToast();
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<"monitor" | "hasil" | "soal" | null>(null);
    const [tokenInput, setTokenInput] = useState("");
    const [tokenMulai, setTokenMulai] = useState<string | undefined>(undefined);
    const [edit, setEdit] = useState(false);
    const [kerjakan, setKerjakan] = useState(false);
    const [rincian, setRincian] = useState<number | null>(null);
    const [versiSoal, setVersiSoal] = useState(0);

    const refresh = useCallback(async () => {
        const r = await muat(kuisId);
        if (r.data) setD(r.data); else setError(r.error);
    }, [kuisId]);

    useEffect(() => {
        let ignore = false;
        muat(kuisId).then((r) => { if (!ignore) { if (r.data) setD(r.data); else setError(r.error); } });
        return () => { ignore = true; };
    }, [kuisId]);

    const selesai = useCallback((msg: string) => {
        toast(msg, "success");
        setKerjakan(false);
        refresh();
    }, [toast, refresh]);

    const kembali = d?.kuis.modeUjian ? { href: `/kelas/${id}?tab=ujian`, label: "Ujian Mapel" } : { href: `/kelas/${id}`, label: "Mapel" };
    if (error) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={kembali} /><p className="p-8 text-center text-red-600 font-semibold">{error}</p></div>);
    if (!d) return (<div className="min-h-screen bg-slate-100"><LmsNav kembali={kembali} /><p className="p-8 text-center text-slate-500">Memuat...</p></div>);

    const k = d.kuis;
    const kelola = d.peran === "kelola";
    const st = STATUS[k.status];
    const ujian = !!k.modeUjian;
    const tabAktif = tab ?? (k.jumlahSoal === 0 ? "soal" : ujian && k.terbit ? "monitor" : "hasil");
    const umum = d.hasilDiumumkan !== false;
    // Mode ujian: layar penuh diminta saat tombol ditekan (harus dari aksi pengguna)
    const mulaiKerjakan = (token?: string) => {
        if (ujian) masukLayarPenuh();
        setTokenMulai(token);
        setKerjakan(true);
    };

    const ubahTerbit = async () => {
        const { ok, data } = await kirim("/api/lms/kuis", "PUT", { ...k, terbit: !k.terbit });
        toast(ok ? (k.terbit ? `${ujian ? "Ujian" : "Kuis"} dijadikan draf` : `${ujian ? "Ujian" : "Kuis"} diterbitkan`) : data.message || "Gagal", ok ? "success" : "error");
        if (ok) refresh();
    };
    const hapus = async () => {
        if (!confirm(`Hapus kuis "${k.judul}"? Semua soal, jawaban, dan nilai siswa ikut terhapus.`)) return;
        const { ok, data } = await kirim(`/api/lms/kuis?id=${k.id}`, "DELETE");
        toast(data.message || (ok ? "Dihapus" : "Gagal"), ok ? "success" : "error");
        if (ok) router.push(`/kelas/${id}`);
    };

    const infoBaris = [
        `${k.jumlahSoal} soal`,
        k.durasiMenit ? `${k.durasiMenit} menit` : "tanpa batas waktu",
        `${k.maksPercobaan}× kesempatan`,
        k.mulai ? `dibuka ${fmtWaktu(k.mulai)}` : null,
        k.selesai ? `ditutup ${fmtWaktu(k.selesai)}` : null,
    ].filter(Boolean);

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <LmsNav judul={`${d.mapel.kelas} · ${d.mapel.nama}`} kembali={kembali} />
            <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
                {/* Kepala kuis */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex flex-wrap items-start gap-3">
                        <span className={`shrink-0 w-12 h-12 rounded-xl font-black text-lg flex items-center justify-center ${ujian ? "bg-indigo-100 text-indigo-700" : "bg-fuchsia-100 text-fuchsia-700"}`}>{ujian ? "U" : "Q"}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-xl font-black text-slate-800">{k.judul}</h1>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                                {ujian && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Ujian CAT</span>}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{infoBaris.join(" · ")}</p>
                        </div>
                        {kelola && (
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setEdit(true)} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">Pengaturan</button>
                                <button onClick={ubahTerbit} className={`px-3 py-2 rounded-lg text-xs font-bold ${k.terbit ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}>{k.terbit ? "Jadikan Draf" : "Terbitkan"}</button>
                                {!ujian && <button onClick={hapus} className="px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 text-xs font-bold">Hapus</button>}
                            </div>
                        )}
                    </div>
                    {k.deskripsi && <IsiTeks teks={k.deskripsi} className="text-sm text-slate-600 mt-4" />}
                </section>

                {/* ---------- SISWA ---------- */}
                {!kelola && kerjakan && <KerjakanKuis kuisId={k.id} judul={k.judul} onSelesai={selesai} token={tokenMulai} />}

                {!kelola && !kerjakan && (
                    <section className="grid md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center text-center">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Nilai {k.maksPercobaan > 1 ? "tertinggi" : "saya"}</p>
                            {!umum
                                ? <p className="text-sm font-bold text-slate-500 mt-2">{d.percobaan?.some((p) => p.selesaiAt) ? "Jawaban terkirim. Nilai diumumkan oleh guru." : "–"}</p>
                                : d.terbaik
                                ? d.terbaik.perluDinilai
                                    ? <p className="text-sm font-bold text-fuchsia-700 mt-2">Menunggu penilaian esai</p>
                                    : <p className="text-5xl font-black text-indigo-700 mt-1">{d.terbaik.nilai}</p>
                                : <p className="text-4xl font-black text-slate-300 mt-1">–</p>}
                        </div>
                        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                            {d.aktif ? (
                                <>
                                    <p className="text-sm text-slate-600">Anda sedang mengerjakan {ujian ? "ujian" : "kuis"} ini{d.aktif.batas && <> — batas waktu <b>{fmtWaktu(d.aktif.batas)}</b></>}.</p>
                                    <button onClick={() => mulaiKerjakan()} className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold">Lanjutkan Mengerjakan</button>
                                </>
                            ) : ujian && k.status === "buka" && (d.sisaPercobaan ?? 0) > 0 ? (
                                <form onSubmit={(e) => { e.preventDefault(); mulaiKerjakan(tokenInput); }} className="space-y-3">
                                    <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
                                        <li>Waktu mengerjakan <b>{k.durasiMenit} menit</b> sejak tombol Mulai ditekan{k.selesai && <> (paling lambat {fmtWaktu(k.selesai)})</>}. Ujian hanya <b>1 kali</b>.</li>
                                        {layarPenuhDidukung() && <li>Ujian berjalan dalam <b>layar penuh</b>. Jangan keluar dari layar penuh.</li>}
                                        <li>Jangan berpindah tab/aplikasi. Pelanggaran ke-{k.maksPelanggaran ?? 5} = jawaban dikumpulkan otomatis.</li>
                                        <li>Jawaban tersimpan otomatis; bila koneksi terputus, buka lagi halaman ini untuk melanjutkan.</li>
                                    </ul>
                                    {k.perluToken && (
                                        <label className="block max-w-xs"><span className="block text-xs font-bold text-slate-600 uppercase mb-1">Token ujian</span>
                                            <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value.toUpperCase())} required maxLength={10} autoComplete="off"
                                                placeholder="Dari guru/pengawas" className="w-full px-3 py-2.5 rounded-lg border border-slate-300 font-mono text-lg tracking-widest uppercase outline-none focus:ring-2 focus:ring-indigo-500" />
                                        </label>
                                    )}
                                    <button type="submit" className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Mulai Ujian</button>
                                </form>
                            ) : k.status === "buka" && (d.sisaPercobaan ?? 0) > 0 ? (
                                <>
                                    <p className="text-sm text-slate-600">
                                        {k.durasiMenit ? <>Waktu mengerjakan <b>{k.durasiMenit} menit</b> sejak tombol Mulai ditekan{k.selesai && " (atau sampai kuis ditutup)"}. </> : null}
                                        Jawaban tersimpan otomatis. Sisa kesempatan: <b>{d.sisaPercobaan}</b>.
                                    </p>
                                    <button onClick={() => { if (confirm("Mulai mengerjakan sekarang? Waktu langsung berjalan.")) mulaiKerjakan(); }}
                                        className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">{d.percobaan?.length ? "Kerjakan Lagi" : "Mulai Mengerjakan"}</button>
                                </>
                            ) : (
                                <p className="text-sm text-slate-600">
                                    {k.status === "belum" ? <>{ujian ? "Ujian" : "Kuis"} dibuka pada <b>{fmtWaktu(k.mulai)}</b>.</> : k.status === "tutup" ? `${ujian ? "Ujian" : "Kuis"} sudah ditutup.` : ujian ? "Anda sudah mengerjakan ujian ini." : "Kesempatan mengerjakan sudah habis."}
                                </p>
                            )}
                            {!!d.percobaan?.length && (
                                <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                                    {d.percobaan.filter((p) => p.selesaiAt).map((p) => (
                                        <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                                            <span className="text-slate-500 flex-1">{ujian ? "Dikumpulkan" : `Percobaan ${p.ke}`} · {fmtWaktu(p.selesaiAt)}</span>
                                            <span className="font-bold text-slate-700">{!umum ? "" : p.perluDinilai ? <span className="text-fuchsia-700 text-xs">esai belum dinilai</span> : p.nilai}</span>
                                            {umum && <button onClick={() => setRincian(p.id)} className="text-xs font-bold text-indigo-600 hover:underline">Lihat jawaban</button>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>
                )}

                {/* ---------- PENGELOLA ---------- */}
                {kelola && (
                    <>
                        {ujian && <TokenUjian kuisId={k.id} token={k.token ?? ""} onChange={refresh} />}
                        {ujian && !k.terbit && (
                            <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">Ujian masih <b>draf</b>. Susun soal di tab Soal, atur jadwal lewat Pengaturan, lalu klik <b>Terbitkan</b> agar siswa bisa mengerjakan sesuai jadwal.</p>
                        )}
                        <div className="flex gap-1 border-b border-slate-200" role="tablist">
                            {([...(ujian ? [["monitor", "Monitoring"] as const] : []), ["hasil", `Hasil (${d.hasil?.filter((h) => h.terbaik).length ?? 0}/${d.hasil?.length ?? 0})`], ["soal", `Soal (${k.jumlahSoal})`]] as const).map(([t, l]) => (
                                <button key={t} role="tab" aria-selected={tabAktif === t} onClick={() => setTab(t)}
                                    className={`px-4 py-2.5 text-sm font-bold border-b-2 ${tabAktif === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
                            ))}
                        </div>

                        {tabAktif === "soal" && d.soal && (
                            <EditorSoal key={versiSoal} kuisId={k.id} mapelNama={d.mapel.nama} adaPercobaan={!!d.hasil?.some((h) => h.percobaan.length)}
                                awal={d.soal.map((s) => ({ ...s, kunciLokal: `db${s.id}` }) as SoalEdit)}
                                onSaved={async () => { await refresh(); setVersiSoal((v) => v + 1); }} />
                        )}

                        {tabAktif === "hasil" && d.hasil && <TabelHasil d={d} onBuka={setRincian} />}
                        {tabAktif === "monitor" && ujian && <MonitorUjian kuisId={k.id} onChange={refresh} />}
                    </>
                )}
            </main>

            {edit && <FormKuis mapelId={d.mapel.id} awal={k} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); refresh(); }} />}
            {rincian !== null && <RincianPercobaan id={rincian} onClose={() => setRincian(null)} onChanged={refresh} />}
        </div>
    );
}

function TabelHasil({ d, onBuka }: { d: Data; onBuka: (id: number) => void }) {
    const hasil = d.hasil ?? [];
    const nilai = hasil.map((h) => h.terbaik).filter((t): t is Terbaik => !!t && !t.perluDinilai).map((t) => t.nilai);
    const rata = nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 10) / 10 : null;
    const perluDinilai = hasil.reduce((a, h) => a + h.percobaan.filter((p) => p.perluDinilai).length, 0);

    const unduhCsv = () => {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const out = [["No", "Nomor Peserta", "Nama", "Jumlah Percobaan", "Nilai Tertinggi", "Keterangan"].join(",")];
        hasil.forEach((h, i) => out.push([i + 1, esc(h.siswa.nomorPeserta), esc(h.siswa.nama), h.percobaan.length, h.terbaik?.nilai ?? "",
            h.terbaik?.perluDinilai ? "esai belum dinilai" : h.sedang ? "sedang mengerjakan" : h.terbaik ? "" : "belum mengerjakan"].join(",")));
        const blob = new Blob(["﻿" + out.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `nilai-kuis-${d.mapel.kelas}-${d.kuis.judul}.csv`.replace(/[^\w.-]+/g, "_");
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const ringkas: [string, string | number][] = [
        ["Selesai", `${hasil.filter((h) => h.terbaik).length}/${hasil.length}`],
        ["Rata-rata", rata ?? "–"],
        ["Tertinggi", nilai.length ? Math.max(...nilai) : "–"],
        ["Esai perlu dinilai", perluDinilai],
    ];

    return (
        <section className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ringkas.map(([l, v]) => (
                    <div key={l} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{l}</p>
                        <p className={`text-2xl font-black mt-1 ${l.startsWith("Esai") && perluDinilai ? "text-fuchsia-700" : "text-slate-800"}`}>{v}</p>
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                    <p className="flex-1 text-xs text-slate-500">Klik nilai untuk melihat jawaban, menilai esai, atau menghapus percobaan agar siswa bisa mengerjakan ulang.</p>
                    <button onClick={unduhCsv} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700">Unduh CSV</button>
                </div>
                {hasil.length === 0 && <p className="p-8 text-center text-slate-400 italic">Belum ada siswa di kelas ini.</p>}
                <ul className="divide-y divide-slate-100">
                    {hasil.map((h, i) => (
                        <li key={h.siswa.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <span className="w-6 text-right text-xs text-slate-400">{i + 1}</span>
                            <div className="flex-1 min-w-40">
                                <p className="text-sm font-semibold text-slate-700">{h.siswa.nama}</p>
                                <p className="font-mono text-[10px] text-slate-400">{h.siswa.nomorPeserta}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {h.percobaan.length === 0 && <span className="text-xs text-slate-400 italic">Belum mengerjakan</span>}
                                {h.percobaan.map((p) => (
                                    <button key={p.id} onClick={() => onBuka(p.id)} title={`Percobaan ${p.ke}`}
                                        className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${!p.selesaiAt ? "border-amber-300 bg-amber-50 text-amber-700" : p.perluDinilai ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300"}`}>
                                        #{p.ke} {!p.selesaiAt ? "mengerjakan" : p.perluDinilai ? "nilai esai" : p.nilai}
                                    </button>
                                ))}
                            </div>
                            <span className="w-14 text-right text-lg font-black text-indigo-700">{h.terbaik && !h.terbaik.perluDinilai ? h.terbaik.nilai : ""}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
