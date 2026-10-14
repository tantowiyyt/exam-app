"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Modal, kirim, fmtTanggal, inputClass, labelClass } from "@/components/lms/ui";

// Ujian offline / nilai manual (alternatif ujian CAT): guru membuat ujian & mengisi nilai, siswa melihat setelah diumumkan.

interface Siswa { id: number; nomorPeserta: string; nama: string }
interface UjianGuru {
    id: number; judul: string; tanggal: string | null; nilaiMaks: number; keterangan: string; terbit: boolean;
    nilai: { userId: number; nilai: number; catatan: string }[]; rataRata: number | null;
}
interface UjianSiswa {
    id: number; judul: string; tanggal: string | null; nilaiMaks: number; keterangan: string; diumumkan: boolean;
    saya: { nilai: number; catatan: string } | null;
}
type Data =
    | { peran: "kelola"; siswa: Siswa[]; ujian: UjianGuru[] }
    | { peran: "siswa"; ujian: UjianSiswa[] };

const KOSONG = { id: 0, judul: "", tanggal: "", nilaiMaks: 100, keterangan: "" };
const tglInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE") : "");

async function muat(mapelId: number): Promise<{ data?: Data; error?: string }> {
    const res = await fetch(`/api/lms/ujian-manual?mapelId=${mapelId}`);
    const d = await res.json().catch(() => ({}));
    return res.ok ? { data: d } : { error: d.message || "Gagal memuat ujian offline" };
}

export function UjianManual({ mapelId, onChange }: { mapelId: number; onChange?: () => void }) {
    const { toast } = useToast();
    const [d, setD] = useState<Data | null>(null);
    const [error, setError] = useState("");
    const [form, setForm] = useState<typeof KOSONG | null>(null);
    const [isi, setIsi] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        const r = await muat(mapelId);
        if (r.data) setD(r.data); else setError(r.error!);
    }, [mapelId]);

    useEffect(() => {
        let ignore = false;
        muat(mapelId).then((r) => { if (!ignore) { if (r.data) setD(r.data); else setError(r.error!); } });
        return () => { ignore = true; };
    }, [mapelId]);

    if (error) return <p className="text-red-600 font-semibold">{error}</p>;
    if (!d) return <p className="text-slate-500 text-sm">Memuat ujian offline...</p>;

    if (d.peran === "siswa") {
        if (!d.ujian.length) return null;
        return (
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Ujian Offline</h2>
                {d.ujian.map((u) => (
                    <div key={u.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800">{u.judul}</p>
                            <p className="text-xs text-slate-500 mt-1">{u.tanggal ? fmtTanggal(u.tanggal) : "Tanggal belum ditentukan"} · nilai maks {u.nilaiMaks}</p>
                            {u.keterangan && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{u.keterangan}</p>}
                            {u.saya?.catatan && <p className="text-xs text-indigo-700 mt-1">Catatan guru: {u.saya.catatan}</p>}
                        </div>
                        {u.saya ? (
                            <span className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 whitespace-nowrap">Nilai: {u.saya.nilai}/{u.nilaiMaks}</span>
                        ) : (
                            <span className="text-xs text-slate-400">{u.diumumkan ? "Tidak ada nilai" : "Nilai belum diumumkan"}</span>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    const simpanUjian = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        const body = { ...form, tanggal: form.tanggal ? new Date(`${form.tanggal}T00:00:00`).toISOString() : null };
        const { ok, data } = form.id ? await kirim("/api/lms/ujian-manual", "PUT", body) : await kirim("/api/lms/ujian-manual", "POST", { ...body, mapelId });
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) {
            setForm(null);
            if (!form.id && data.data?.id) setIsi(data.data.id);
            refresh(); onChange?.();
        }
    };

    const umumkan = async (u: UjianGuru) => {
        if (!u.terbit && u.nilai.length < d.siswa.length && !confirm(`Baru ${u.nilai.length} dari ${d.siswa.length} siswa yang punya nilai. Umumkan sekarang?`)) return;
        const { ok, data } = await kirim("/api/lms/ujian-manual", "PUT", { id: u.id, terbit: !u.terbit });
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) refresh();
    };

    const hapus = async (u: UjianGuru) => {
        if (!confirm(`Hapus ujian "${u.judul}" beserta ${u.nilai.length} nilai siswa?`)) return;
        const { ok, data } = await kirim(`/api/lms/ujian-manual?id=${u.id}`, "DELETE");
        toast(data.message || (ok ? "Dihapus" : "Gagal"), ok ? "success" : "error");
        if (ok) { if (isi === u.id) setIsi(null); refresh(); onChange?.(); }
    };

    const unduhCsv = (u: UjianGuru) => {
        const esc = (v: string | number) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
        const out = [["No", "Nomor Peserta", "Nama", `Nilai (maks ${u.nilaiMaks})`, "Catatan"]];
        d.siswa.forEach((s, i) => {
            const n = u.nilai.find((x) => x.userId === s.id);
            out.push([String(i + 1), s.nomorPeserta, s.nama, n ? String(n.nilai) : "", n?.catatan ?? ""]);
        });
        const blob = new Blob(["﻿" + out.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `nilai-${u.judul.replace(/[^\w-]+/g, "_")}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex-1">Ujian Offline / Nilai Manual</h2>
                <button onClick={() => setForm({ ...KOSONG })} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Ujian Offline</button>
            </div>
            <p className="text-xs text-slate-500">Untuk ujian yang tidak memakai CAT (mis. ujian kertas/praktik): buat ujian, isi nilai siswa, lalu umumkan. Nilai masuk rekap pada kategori Ujian.</p>
            {d.ujian.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 italic text-sm">Belum ada ujian offline.</p>}
            {d.ujian.map((u) => (
                <div key={u.id} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                        <span className="hidden md:flex shrink-0 w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 font-black items-center justify-center">U</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold text-slate-800">{u.judul}</p>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${u.terbit ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{u.terbit ? "Diumumkan" : "Belum diumumkan"}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 mt-0.5">
                                <span>{u.tanggal ? fmtTanggal(u.tanggal) : "Tanpa tanggal"}</span>
                                <span>Maks {u.nilaiMaks}</span>
                                <span>{u.nilai.length}/{d.siswa.length} siswa dinilai</span>
                                {u.rataRata !== null && <span>Rata-rata {u.rataRata}</span>}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <button onClick={() => setIsi(isi === u.id ? null : u.id)} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-md">{isi === u.id ? "Tutup" : "Isi Nilai"}</button>
                            <button onClick={() => umumkan(u)} className={`text-xs font-bold px-3 py-1.5 rounded-md ${u.terbit ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"}`}>{u.terbit ? "Sembunyikan" : "Umumkan"}</button>
                            <button onClick={() => setForm({ id: u.id, judul: u.judul, tanggal: tglInput(u.tanggal), nilaiMaks: u.nilaiMaks, keterangan: u.keterangan })} className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-3 py-1.5 rounded-md">Edit</button>
                            <button onClick={() => unduhCsv(u)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-md">CSV</button>
                            <button onClick={() => hapus(u)} className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-md">Hapus</button>
                        </div>
                    </div>
                    {isi === u.id && <IsiNilai key={u.id} ujian={u} siswa={d.siswa} onSaved={refresh} />}
                </div>
            ))}

            {form && (
                <Modal judul={form.id ? "Edit Ujian Offline" : "Ujian Offline Baru"} onClose={() => setForm(null)}>
                    <form onSubmit={simpanUjian} className="space-y-3">
                        <label className="block"><span className={labelClass}>Nama Ujian</span>
                            <input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} required maxLength={200} placeholder="mis. UTS Ganjil, Ujian Praktik" className={inputClass} autoFocus />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block"><span className={labelClass}>Tanggal</span>
                                <input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} className={inputClass} />
                            </label>
                            <label className="block"><span className={labelClass}>Nilai Maksimal</span>
                                <input type="number" min={1} max={1000} value={form.nilaiMaks} onChange={(e) => setForm({ ...form, nilaiMaks: Number(e.target.value) })} required className={inputClass} />
                            </label>
                        </div>
                        <label className="block"><span className={labelClass}>Keterangan (opsional)</span>
                            <textarea value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} rows={2} maxLength={2000} placeholder="mis. Materi bab 1–3, ruang 12" className={`${inputClass} resize-y`} />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">{form.id ? "Simpan" : "Buat Ujian"}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

/** Tabel isian nilai satu ujian + tempel dari Excel. */
function IsiNilai({ ujian, siswa, onSaved }: { ujian: UjianGuru; siswa: Siswa[]; onSaved: () => void }) {
    const { toast } = useToast();
    const awal = () => Object.fromEntries(siswa.map((s) => {
        const n = ujian.nilai.find((x) => x.userId === s.id);
        return [s.id, { nilai: n ? String(n.nilai) : "", catatan: n?.catatan ?? "" }];
    }));
    const [draf, setDraf] = useState<Record<number, { nilai: string; catatan: string }>>(awal);
    const [tempel, setTempel] = useState<string | null>(null);
    const [simpan, setSimpan] = useState(false);

    const asli = (id: number) => ujian.nilai.find((x) => x.userId === id);
    const berubah = siswa.filter((s) => {
        const a = asli(s.id), v = draf[s.id];
        return (a ? String(a.nilai) : "") !== v.nilai.trim() || (a?.catatan ?? "") !== v.catatan;
    });
    const salah = siswa.filter((s) => {
        const v = draf[s.id].nilai.trim();
        if (!v) return false;
        const n = Number(v.replace(",", "."));
        return !Number.isFinite(n) || n < 0 || n > ujian.nilaiMaks;
    });

    const terapkanTempel = () => {
        const baris = (tempel ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const baru = { ...draf };
        let cocok = 0;
        const gagal: string[] = [];
        baris.forEach((l, i) => {
            const kol = l.split(/\t|;|,(?=\s*\S)/).map((x) => x.trim()).filter(Boolean);
            const angka = kol.length ? kol[kol.length - 1] : "";
            let s: Siswa | undefined;
            if (kol.length === 1) s = siswa[i]; // hanya nilai: urut sesuai daftar
            else {
                const kunci = kol.slice(0, -1).map((x) => x.toLowerCase());
                s = siswa.find((x) => kunci.includes(x.nomorPeserta.toLowerCase())) ?? siswa.find((x) => kunci.includes(x.nama.toLowerCase()));
            }
            if (!s || !/^\d+([.,]\d+)?$/.test(angka)) { if (!/nilai|nama|^no/i.test(l)) gagal.push(l); return; }
            baru[s.id] = { ...baru[s.id], nilai: angka.replace(",", ".") };
            cocok++;
        });
        setDraf(baru);
        setTempel(null);
        toast(`${cocok} nilai diterapkan${gagal.length ? `, ${gagal.length} baris tidak dikenali` : ""}. Periksa lalu klik Simpan.`, gagal.length ? "error" : "success");
    };

    const kirimNilai = async () => {
        if (salah.length) { toast(`Nilai harus angka 0–${ujian.nilaiMaks}`, "error"); return; }
        setSimpan(true);
        const { ok, data } = await kirim("/api/lms/ujian-manual", "PUT", {
            id: ujian.id, aksi: "nilai",
            data: berubah.map((s) => ({ userId: s.id, nilai: draf[s.id].nilai.trim() === "" ? null : Number(draf[s.id].nilai.replace(",", ".")), catatan: draf[s.id].catatan })),
        });
        setSimpan(false);
        toast(data.message || (ok ? "Tersimpan" : "Gagal"), ok ? "success" : "error");
        if (ok) onSaved();
    };

    if (!siswa.length) return <p className="px-4 pb-4 text-sm text-slate-400 italic">Belum ada siswa di kelas ini.</p>;

    return (
        <div className="border-t border-slate-100 bg-slate-50/60 rounded-b-xl">
            <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                <button onClick={() => setTempel(tempel === null ? "" : null)} className="text-xs font-bold text-indigo-600 hover:underline">{tempel === null ? "Tempel dari Excel" : "Batal tempel"}</button>
                <span className="text-xs text-slate-400 flex-1">Kosongkan nilai untuk menghapus nilai siswa itu.</span>
                <span className="text-xs text-slate-500">{berubah.length} perubahan</span>
                <button onClick={kirimNilai} disabled={!berubah.length || simpan} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan Nilai"}</button>
            </div>
            {tempel !== null && (
                <div className="px-4 pb-3 space-y-2">
                    <textarea value={tempel} onChange={(e) => setTempel(e.target.value)} rows={6} aria-label="Data nilai dari Excel"
                        placeholder={"Salin 2 kolom dari Excel: Nomor Peserta (atau Nama) dan Nilai, contoh:\n260001\t85\n260002\t90\n\nAtau 1 kolom nilai saja, urut sesuai daftar di bawah."}
                        className={`${inputClass} font-mono text-xs`} />
                    <button onClick={terapkanTempel} disabled={!tempel.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">Terapkan</button>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase text-slate-500 bg-slate-100">
                        <tr>
                            <th className="px-3 py-2 text-left w-8">No</th>
                            <th className="px-3 py-2 text-left">Siswa</th>
                            <th className="px-3 py-2 text-left w-28">Nilai /{ujian.nilaiMaks}</th>
                            <th className="px-3 py-2 text-left min-w-40">Catatan</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {siswa.map((s, i) => {
                            const v = draf[s.id];
                            const err = salah.includes(s);
                            const ubah = berubah.includes(s);
                            return (
                                <tr key={s.id} className={ubah ? "bg-amber-50/60" : ""}>
                                    <td className="px-3 py-1.5 text-xs text-slate-400">{i + 1}</td>
                                    <td className="px-3 py-1.5">
                                        <p className="font-semibold text-slate-700">{s.nama}</p>
                                        <p className="font-mono text-[10px] text-slate-400">{s.nomorPeserta}</p>
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <input inputMode="decimal" value={v.nilai} aria-label={`Nilai ${s.nama}`} aria-invalid={err}
                                            onChange={(e) => setDraf({ ...draf, [s.id]: { ...v, nilai: e.target.value } })}
                                            className={`w-20 border rounded-lg px-2 py-1.5 text-sm ${err ? "border-red-500 bg-red-50" : "border-slate-300"}`} />
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <input value={v.catatan} maxLength={500} aria-label={`Catatan ${s.nama}`} placeholder="opsional"
                                            onChange={(e) => setDraf({ ...draf, [s.id]: { ...v, catatan: e.target.value } })}
                                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
