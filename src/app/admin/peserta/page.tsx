"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

// Data siswa (akademik): identitas, kelas, data diri, akun. Ruang/sesi/status ujian CAT ada di Ujian CAT -> Peserta Ujian.

interface Siswa {
    id: number; nomorPeserta: string; nama: string; kelas: string; jenisKelamin: string | null;
    nik: string | null; tempatLahir: string | null; tanggalLahir: string | null; alamat: string | null; noHp: string | null; email?: string; nisn?: string; foto: string | null;
    createdAt: string;
}
interface Form {
    id: number; nomorPeserta: string; nama: string; password: string; kelas: string; jenisKelamin: string;
    nik: string; tempatLahir: string; tanggalLahir: string; alamat: string; noHp: string; email: string; nisn: string; foto: string;
}

const KOSONG: Form = { id: 0, nomorPeserta: "", nama: "", password: "", kelas: "", jenisKelamin: "", nik: "", tempatLahir: "", tanggalLahir: "", alamat: "", noHp: "", email: "", nisn: "", foto: "" };
const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const labelClass = "block text-xs font-bold text-slate-600 uppercase mb-1";
const PER_HALAMAN = 30;
const lengkap = (s: Siswa) => !!(s.nik && s.tempatLahir && s.tanggalLahir && s.jenisKelamin && s.alamat && s.noHp);

export default function DataSiswa() {
    const { toast } = useToast();
    const [siswa, setSiswa] = useState<Siswa[]>([]);
    const [kelasList, setKelasList] = useState<string[]>([]);
    const [cari, setCari] = useState("");
    const [kelas, setKelas] = useState("");
    const [halaman, setHalaman] = useState(1);
    const [pilih, setPilih] = useState<Set<number>>(new Set());
    const [tujuan, setTujuan] = useState("");
    const [form, setForm] = useState<Form | null>(null);
    const [impor, setImpor] = useState<string | null>(null);
    const [simpan, setSimpan] = useState(false);

    const muat = useCallback(async () => {
        const res = await fetch("/api/admin/peserta");
        if (res.ok) setSiswa(await res.json());
    }, []);
    useEffect(() => {
        let ignore = false;
        fetch("/api/admin/peserta").then((r) => (r.ok ? r.json() : [])).then((d) => { if (!ignore) setSiswa(d); });
        fetch("/api/admin/kelas").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!ignore && d) setKelasList(d.kelas.map((k: { nama: string }) => k.nama)); });
        return () => { ignore = true; };
    }, []);

    const tampil = useMemo(() => {
        const q = cari.trim().toLowerCase();
        return siswa
            .filter((s) => (kelas === "" ? true : kelas === "-" ? !s.kelas : s.kelas === kelas))
            .filter((s) => !q || `${s.nama} ${s.nomorPeserta}`.toLowerCase().includes(q))
            .sort((a, b) => (a.kelas || "~").localeCompare(b.kelas || "~") || a.nama.localeCompare(b.nama));
    }, [siswa, cari, kelas]);
    const jumlahHalaman = Math.max(1, Math.ceil(tampil.length / PER_HALAMAN));
    const hal = Math.min(halaman, jumlahHalaman);
    const isi = tampil.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN);
    const dipilih = tampil.filter((s) => pilih.has(s.id));
    const semuaTampil = tampil.length > 0 && tampil.every((s) => pilih.has(s.id));
    const tanpaKelas = siswa.filter((s) => !s.kelas).length;

    const kirimForm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        setSimpan(true);
        const body = { ...form, id: form.id || undefined, tanggalLahir: form.tanggalLahir || "" };
        const res = await fetch("/api/admin/peserta", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        setSimpan(false);
        if (res.ok) { toast(form.id ? "Data siswa disimpan" : "Siswa ditambahkan", "success"); setForm(null); muat(); }
        else toast(data.message || "Gagal menyimpan", "error");
    };

    const edit = (s: Siswa) => setForm({
        id: s.id, nomorPeserta: s.nomorPeserta, nama: s.nama, password: "", kelas: s.kelas, jenisKelamin: s.jenisKelamin ?? "",
        nik: s.nik ?? "", tempatLahir: s.tempatLahir ?? "", tanggalLahir: s.tanggalLahir ? s.tanggalLahir.slice(0, 10) : "",
        alamat: s.alamat ?? "", noHp: s.noHp ?? "", email: s.email ?? "", nisn: s.nisn ?? "", foto: s.foto ?? "",
    });

    const hapus = async (s: Siswa) => {
        if (!confirm(`Hapus ${s.nama} beserta seluruh data belajarnya (tugas, kuis, presensi, nilai, hasil ujian)?`)) return;
        const res = await fetch(`/api/admin/peserta?id=${s.id}`, { method: "DELETE" });
        toast(res.ok ? "Siswa dihapus" : "Gagal menghapus siswa", res.ok ? "success" : "error");
        if (res.ok) muat();
    };

    const pindah = async () => {
        if (!dipilih.length) return;
        if (!confirm(`Pindahkan ${dipilih.length} siswa ke ${tujuan || "tanpa kelas"}?`)) return;
        const res = await fetch("/api/admin/peserta", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pindahKelas", ids: dipilih.map((s) => s.id), kelas: tujuan }) });
        const data = await res.json().catch(() => ({}));
        toast(data.message || (res.ok ? "Tersimpan" : "Gagal"), res.ok ? "success" : "error");
        if (res.ok) { setPilih(new Set()); muat(); }
    };

    const unggahFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !form) return;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) setForm({ ...form, foto: data.url }); else toast(data.message || "Gagal unggah foto", "error");
        e.target.value = "";
    };

    // Impor CSV: nis, nama, password, kelas, jenisKelamin (L/P, opsional). Baris judul dilewati.
    const prosesImpor = async () => {
        const baris = (impor ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const data = [];
        const salah: string[] = [];
        for (const [i, l] of baris.entries()) {
            const [nomorPeserta, nama, password, kls, jk] = l.split(/[,;\t]/).map((x) => x.trim().replace(/^"|"$/g, ""));
            if (i === 0 && /^nis|nomor/i.test(nomorPeserta)) continue;
            if (!nomorPeserta || !nama || !password) { salah.push(`Baris ${i + 1}`); continue; }
            data.push({ nomorPeserta, nama, password, kelas: kls ?? "", ...(jk === "L" || jk === "P" ? { jenisKelamin: jk } : {}) });
        }
        if (!data.length) { toast("Tidak ada baris yang valid", "error"); return; }
        const res = await fetch("/api/admin/peserta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulk: data }) });
        const hasil = await res.json().catch(() => ({}));
        toast(`${hasil.message || (res.ok ? "Impor selesai" : "Gagal impor")}${salah.length ? ` · ${salah.length} baris dilewati` : ""}`, res.ok ? "success" : "error");
        if (res.ok) { setImpor(null); muat(); }
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Akademik" judul="Data Siswa">
                <button onClick={() => setImpor("")} className="px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold">Impor CSV</button>
                <button onClick={() => setForm({ ...KOSONG, kelas: kelas && kelas !== "-" ? kelas : "" })} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">+ Tambah Siswa</button>
            </HeaderHalaman>
            <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
                    <input type="search" value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(1); }} placeholder="Cari nama atau NIS..." aria-label="Cari siswa" className={`${inputClass} flex-1 min-w-48`} />
                    <select value={kelas} onChange={(e) => { setKelas(e.target.value); setHalaman(1); setPilih(new Set()); }} aria-label="Filter kelas" className={`${inputClass} w-auto`}>
                        <option value="">Semua kelas ({siswa.length})</option>
                        {kelasList.map((k) => <option key={k} value={k}>{k} ({siswa.filter((s) => s.kelas === k).length})</option>)}
                        {tanpaKelas > 0 && <option value="-">Tanpa kelas ({tanpaKelas})</option>}
                    </select>
                    <span className="text-xs text-slate-500">{tampil.length} siswa</span>
                </div>

                {dipilih.length > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-bold text-indigo-800">{dipilih.length} siswa dipilih</span>
                        <span className="text-slate-500">· pindah / naik kelas ke</span>
                        <select value={tujuan} onChange={(e) => setTujuan(e.target.value)} aria-label="Kelas tujuan" className={`${inputClass} w-auto`}>
                            <option value="">— tanpa kelas —</option>
                            {kelasList.map((k) => <option key={k}>{k}</option>)}
                        </select>
                        <button onClick={pindah} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Pindahkan</button>
                        <button onClick={() => setPilih(new Set())} className="text-xs font-bold text-slate-500 hover:underline">Batal</button>
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="Pilih semua yang tampil" checked={semuaTampil} onChange={() => setPilih(semuaTampil ? new Set() : new Set(tampil.map((s) => s.id)))} /></th>
                                    <th className="px-3 py-2 text-left">NIS</th>
                                    <th className="px-3 py-2 text-left">Nama</th>
                                    <th className="px-3 py-2 text-center">L/P</th>
                                    <th className="px-3 py-2 text-left">Kelas</th>
                                    <th className="px-3 py-2 text-left">Data diri</th>
                                    <th className="px-3 py-2 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isi.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">Tidak ada siswa.</td></tr>}
                                {isi.map((s) => (
                                    <tr key={s.id} className={pilih.has(s.id) ? "bg-indigo-50/50" : "hover:bg-slate-50"}>
                                        <td className="px-3 py-2"><input type="checkbox" aria-label={`Pilih ${s.nama}`} checked={pilih.has(s.id)} onChange={() => setPilih((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} /></td>
                                        <td className="px-3 py-2 font-mono text-slate-700">{s.nomorPeserta}</td>
                                        <td className="px-3 py-2 font-semibold text-slate-800">{s.nama}</td>
                                        <td className="px-3 py-2 text-center text-slate-600">{s.jenisKelamin ?? "–"}</td>
                                        <td className="px-3 py-2">{s.kelas ? <span className="text-slate-700">{s.kelas}</span> : <span className="text-amber-600 text-xs font-semibold">belum ada kelas</span>}</td>
                                        <td className="px-3 py-2">{lengkap(s) ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Lengkap</span> : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">Belum lengkap</span>}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <button onClick={() => edit(s)} className="text-xs font-bold text-indigo-600 hover:underline mr-3">Edit</button>
                                            <Link href={`/admin/kartu?id=${s.id}`} className="text-xs font-bold text-slate-500 hover:underline mr-3">Kartu</Link>
                                            <button onClick={() => hapus(s)} className="text-xs font-bold text-red-600 hover:underline">Hapus</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {jumlahHalaman > 1 && (
                        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <span>Halaman {hal} dari {jumlahHalaman}</span>
                            <div className="flex gap-1">
                                <button onClick={() => setHalaman(hal - 1)} disabled={hal === 1} className="px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">&larr;</button>
                                <button onClick={() => setHalaman(hal + 1)} disabled={hal === jumlahHalaman} className="px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40">&rarr;</button>
                            </div>
                        </div>
                    )}
                </div>
                <p className="text-xs text-slate-500">Ruang & sesi ujian CAT diatur di <Link href="/admin/peserta-ujian" className="font-bold text-indigo-600">Modul Ujian CAT → Peserta &amp; Ruang</Link>. Kelas dibuat di <Link href="/admin/kelas" className="font-bold text-indigo-600">Kelas & Mapel</Link>.</p>
            </main>

            {form && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && setForm(null)}>
                    <form onSubmit={kirimForm} role="dialog" aria-label={form.id ? "Edit siswa" : "Tambah siswa"} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6 p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-800 text-lg">{form.id ? "Edit Data Siswa" : "Tambah Siswa"}</h2>
                            <button type="button" onClick={() => setForm(null)} aria-label="Tutup" className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
                        </div>
                        <fieldset className="grid sm:grid-cols-2 gap-3">
                            <legend className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Identitas</legend>
                            <label className="block"><span className={labelClass}>NIS / Username</span><input value={form.nomorPeserta} onChange={(e) => setForm({ ...form, nomorPeserta: e.target.value })} required className={inputClass} /></label>
                            <label className="block"><span className={labelClass}>Nama Lengkap</span><input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required className={inputClass} /></label>
                            <label className="block"><span className={labelClass}>Kelas</span>
                                <select value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} className={inputClass}>
                                    <option value="">— belum ada kelas —</option>
                                    {kelasList.map((k) => <option key={k}>{k}</option>)}
                                    {form.kelas && !kelasList.includes(form.kelas) && <option value={form.kelas}>{form.kelas} (belum dibuat)</option>}
                                </select>
                            </label>
                            <label className="block"><span className={labelClass}>Jenis Kelamin</span>
                                <select value={form.jenisKelamin} onChange={(e) => setForm({ ...form, jenisKelamin: e.target.value })} className={inputClass}>
                                    <option value="">—</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
                                </select>
                            </label>
                        </fieldset>
                        <fieldset className="grid sm:grid-cols-[1fr_120px] gap-4">
                            <legend className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Data Diri</legend>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label className="block sm:col-span-2"><span className={labelClass}>NIK</span><input value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, "") })} maxLength={16} inputMode="numeric" placeholder="16 digit" className={inputClass} /></label>
                                <label className="block"><span className={labelClass}>Tempat Lahir</span><input value={form.tempatLahir} onChange={(e) => setForm({ ...form, tempatLahir: e.target.value })} className={inputClass} /></label>
                                <label className="block"><span className={labelClass}>Tanggal Lahir</span><input type="date" value={form.tanggalLahir} onChange={(e) => setForm({ ...form, tanggalLahir: e.target.value })} className={inputClass} /></label>
                                <label className="block"><span className={labelClass}>No. HP / WA</span><input value={form.noHp} onChange={(e) => setForm({ ...form, noHp: e.target.value })} className={inputClass} /></label>
                                <label className="block"><span className={labelClass}>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></label>
                                <label className="block"><span className={labelClass}>NISN</span><input value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} inputMode="numeric" className={inputClass} /></label>
                                <label className="block sm:col-span-2"><span className={labelClass}>Alamat</span><textarea value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} rows={2} className={`${inputClass} resize-y`} /></label>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <span className={labelClass}>Foto 3×4</span>
                                <div className="w-24 h-32 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {form.foto ? <img src={form.foto} alt="Foto siswa" className="w-full h-full object-cover" /> : <span className="text-[10px] text-slate-400">belum ada</span>}
                                </div>
                                <label className="text-[11px] font-bold text-indigo-600 cursor-pointer hover:underline">Unggah<input type="file" accept="image/jpeg,image/png,image/webp" onChange={unggahFoto} className="sr-only" /></label>
                                {form.foto && <button type="button" onClick={() => setForm({ ...form, foto: "" })} className="text-[11px] text-red-600 hover:underline">Hapus</button>}
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Akun</legend>
                            <label className="block max-w-sm"><span className={labelClass}>{form.id ? "Password baru" : "Password"}</span>
                                <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!form.id} placeholder={form.id ? "Kosongkan bila tidak diganti" : ""} className={inputClass} autoComplete="new-password" />
                            </label>
                        </fieldset>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                            <button type="submit" disabled={simpan} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan"}</button>
                        </div>
                    </form>
                </div>
            )}

            {impor !== null && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3" onMouseDown={(e) => e.target === e.currentTarget && setImpor(null)}>
                    <div role="dialog" aria-label="Impor siswa" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-3">
                        <h2 className="font-bold text-slate-800 text-lg">Impor Siswa dari CSV</h2>
                        <p className="text-xs text-slate-500">Satu siswa per baris: <code className="bg-slate-100 px-1 rounded">NIS, nama, password, kelas, jenis kelamin (L/P, opsional)</code>. Baris judul boleh ada. Bisa disalin langsung dari Excel. NIS yang sudah ada dilewati.</p>
                        <textarea value={impor} onChange={(e) => setImpor(e.target.value)} rows={10} aria-label="Data CSV" placeholder={"NIS,Nama,Password,Kelas,JK\n260101,Andi Pratama,rahasia1,X IPA 1,L"} className={`${inputClass} font-mono text-xs`} />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setImpor(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                            <button onClick={prosesImpor} disabled={!impor.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">Impor</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
