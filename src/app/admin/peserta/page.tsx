"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

interface Peserta {
    id: number;
    nomorPeserta: string;
    nama: string;
    kelas: string;
    nik: string | null;
    tempatLahir: string | null;
    tanggalLahir: string | null;
    jenisKelamin: string | null;
    alamat: string | null;
    noHp: string | null;
    foto: string | null;
    ruang: string;
    sesi: string;
    sudahUjian: boolean;
    nilai: number | null;
}

const EMPTY_FORM = {
    id: "", nomorPeserta: "", nama: "", password: "", kelas: "", ruang: "LAB CAT-01", sesi: "1",
    nik: "", tempatLahir: "", tanggalLahir: "", jenisKelamin: "", alamat: "", noHp: "", foto: "",
};

export default function PesertaManagement() {
    const { toast } = useToast();
    const [pesertaList, setPesertaList] = useState<Peserta[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [dataDiriOpen, setDataDiriOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterRuang, setFilterRuang] = useState("");
    const [filterSesi, setFilterSesi] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const itemsPerPage = 10;

    const fetchPeserta = async () => {
        const res = await fetch("/api/admin/peserta");
        const data = await res.json();
        if (res.ok) setPesertaList(data);
    };

    useEffect(() => {
        const t = setTimeout(fetchPeserta, 0);
        return () => clearTimeout(t);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const url = "/api/admin/peserta";
        const method = isEditing ? "PUT" : "POST";

        const res = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });

        const data = await res.json();

        if (!res.ok) {
            toast(data.message, "error");
        } else {
            toast(isEditing ? "Data peserta berhasil diubah!" : "Peserta baru berhasil ditambah!", "success");
            resetForm();
            fetchPeserta();
        }
        setLoading(false);
    };

    const handleEdit = (p: Peserta) => {
        setForm({
            id: String(p.id), nomorPeserta: p.nomorPeserta, nama: p.nama, password: "", kelas: p.kelas || "", ruang: p.ruang, sesi: p.sesi,
            nik: p.nik || "", tempatLahir: p.tempatLahir || "", tanggalLahir: p.tanggalLahir ? p.tanggalLahir.slice(0, 10) : "",
            jenisKelamin: p.jenisKelamin || "", alamat: p.alamat || "", noHp: p.noHp || "", foto: p.foto || "",
        });
        setIsEditing(true);
        setDataDiriOpen(!!(p.nik || p.tempatLahir || p.tanggalLahir || p.jenisKelamin || p.alamat || p.noHp || p.foto));
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Apakah Anda yakin ingin menghapus peserta ini?")) return;

        const res = await fetch(`/api/admin/peserta?id=${id}`, { method: "DELETE" });
        if (res.ok) {
            toast("Peserta berhasil dihapus!", "success");
            fetchPeserta();
        } else {
            toast("Gagal menghapus peserta", "error");
        }
    };

    const handleResetUjian = async (id: number, nama: string) => {
        if (!confirm(`Yakin ingin mereset ujian ${nama}? Semua jawaban dan nilai akan dihapus.`)) return;

        const res = await fetch("/api/admin/peserta", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, action: "resetUjian" }),
        });
        if (res.ok) {
            toast("Ujian peserta berhasil direset!", "success");
            fetchPeserta();
        } else {
            toast("Gagal mereset ujian", "error");
        }
    };

    const uploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await res.json();
            if (res.ok) setForm((f) => ({ ...f, foto: data.url }));
            else toast(data.message || "Gagal mengunggah foto", "error");
        } catch {
            toast("Gagal mengunggah foto", "error");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setIsEditing(false);
        setDataDiriOpen(false);
    };

    const handleResetAll = async () => {
        if (!confirm("YAKIN? Semua data ujian peserta akan direset. Ini tidak bisa dibatalkan.")) return;
        if (!confirm("Konfirmasi sekali lagi: Reset SEMUA hasil ujian?")) return;

        const res = await fetch("/api/admin/peserta", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resetAll" }),
        });
        if (res.ok) {
            toast("Semua data ujian peserta berhasil direset!", "success");
            fetchPeserta();
        } else {
            toast("Gagal mereset semua peserta", "error");
        }
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith(".csv")) {
            toast("File harus berekstensi .csv", "error");
            return;
        }

        setImporting(true);
        setImportResult(null);

        try {
            const text = await file.text();
            const lines = text.split("\n").filter((line) => line.trim() !== "");
            const startIndex = lines[0].toLowerCase().includes("nomor") || lines[0].toLowerCase().includes("username") ? 1 : 0;

            const pesertaData = [];
            const errors: string[] = [];

            for (let i = startIndex; i < lines.length; i++) {
                const parts = lines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
                if (parts.length < 3) {
                    errors.push(`Baris ${i + 1}: Kolom kurang (butuh min. 3: nomorPeserta, nama, password)`);
                    continue;
                }
                const [nomorPeserta, nama, password, ruang, sesi, kelas] = parts;
                if (!nomorPeserta || !nama || !password) {
                    errors.push(`Baris ${i + 1}: Ada kolom kosong`);
                    continue;
                }
                pesertaData.push({ nomorPeserta, nama, password, ruang: ruang || "LAB CAT-01", sesi: sesi || "1", kelas: kelas || "" });
            }

            if (pesertaData.length === 0) {
                setImportResult({ success: 0, failed: lines.length - startIndex, errors });
                return;
            }

            const res = await fetch("/api/admin/peserta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bulk: pesertaData }),
            });

            const data = await res.json();
            if (res.ok) {
                setImportResult({ success: data.data.successCount, failed: data.data.failedCount, errors: data.data.errors });
                fetchPeserta();
            } else {
                toast(data.message || "Gagal mengimpor peserta", "error");
            }
        } catch {
            toast("Gagal membaca file CSV", "error");
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Get unique values for filters
    const uniqueRuang = [...new Set(pesertaList.map((p) => p.ruang))].sort();
    const uniqueSesi = [...new Set(pesertaList.map((p) => p.sesi))].sort();

    // Filter and search
    const filteredPeserta = pesertaList.filter((p) => {
        const matchesSearch =
            p.nomorPeserta.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.nama.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRuang = !filterRuang || p.ruang === filterRuang;
        const matchesSesi = !filterSesi || p.sesi === filterSesi;
        return matchesSearch && matchesRuang && matchesSesi;
    });

    const totalPages = Math.ceil(filteredPeserta.length / itemsPerPage);
    const paginatedPeserta = filteredPeserta.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Akademik" judul="Data Siswa">
                <Link href="/admin/kartu" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all">
                        Cetak Kartu
                    </Link>
            </HeaderHalaman>

            <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-8">
                {/* Kolom Kiri: Form Input + Import */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">
                            {isEditing ? "Edit Data Peserta" : "Tambah Peserta Baru"}
                        </h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nomor Peserta / Username</label>
                            <input type="text" value={form.nomorPeserta} onChange={(e) => setForm({ ...form, nomorPeserta: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Contoh: 2026001" required />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nama Lengkap</label>
                            <input type="text" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nama Lengkap Peserta" required />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Password</label>
                            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" placeholder={isEditing ? "Kosongkan jika tidak diubah" : "Password Login"} required={!isEditing} />
                        </div>

                        <div>
                            <label htmlFor="peserta-kelas" className="block text-xs font-bold text-slate-600 uppercase mb-1">Kelas</label>
                            <input id="peserta-kelas" type="text" value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" placeholder="mis. XII IPA 1 (opsional)" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ruang</label>
                                <input type="text" value={form.ruang} onChange={(e) => setForm({ ...form, ruang: e.target.value })}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Sesi</label>
                                <input type="text" value={form.sesi} onChange={(e) => setForm({ ...form, sesi: e.target.value })}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                        </div>

                        <div className="border border-slate-200 rounded-xl">
                            <button type="button" onClick={() => setDataDiriOpen(!dataDiriOpen)} aria-expanded={dataDiriOpen}
                                className="w-full flex justify-between items-center px-3 py-2 text-xs font-bold text-slate-600 uppercase">
                                <span>Data Diri & Foto <span className="normal-case font-normal text-slate-400">(opsional, untuk kartu ujian)</span></span>
                                <span>{dataDiriOpen ? "▲" : "▼"}</span>
                            </button>
                            {dataDiriOpen && (
                                <div className="px-3 pb-3 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-[60px] h-[80px] border border-slate-300 rounded bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                                            {form.foto ? <img src={form.foto} alt="Foto peserta" className="w-full h-full object-cover" /> : <span className="text-[9px] text-slate-400 text-center">3×4</span>}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="inline-block text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-3 py-1.5 cursor-pointer font-semibold">
                                                {uploading ? "Mengunggah..." : form.foto ? "Ganti Foto" : "Unggah Foto"}
                                                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadFoto} disabled={uploading} className="hidden" />
                                            </label>
                                            {form.foto && <button type="button" onClick={() => setForm({ ...form, foto: "" })} className="block text-xs text-red-600">Hapus foto</button>}
                                            <p className="text-[10px] text-slate-400">JPG/PNG/WebP, maks. 2MB</p>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="peserta-nik" className="block text-xs font-bold text-slate-600 uppercase mb-1">NIK</label>
                                        <input id="peserta-nik" type="text" inputMode="numeric" pattern="\d{16}" maxLength={16} title="NIK 16 digit angka" value={form.nik}
                                            onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, "") })}
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" placeholder="16 digit" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="peserta-tempat" className="block text-xs font-bold text-slate-600 uppercase mb-1">Tempat Lahir</label>
                                            <input id="peserta-tempat" type="text" value={form.tempatLahir} onChange={(e) => setForm({ ...form, tempatLahir: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                        <div>
                                            <label htmlFor="peserta-tgl" className="block text-xs font-bold text-slate-600 uppercase mb-1">Tanggal Lahir</label>
                                            <input id="peserta-tgl" type="date" value={form.tanggalLahir} onChange={(e) => setForm({ ...form, tanggalLahir: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="peserta-jk" className="block text-xs font-bold text-slate-600 uppercase mb-1">Jenis Kelamin</label>
                                            <select id="peserta-jk" value={form.jenisKelamin} onChange={(e) => setForm({ ...form, jenisKelamin: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                                <option value="">—</option>
                                                <option value="L">Laki-laki</option>
                                                <option value="P">Perempuan</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="peserta-hp" className="block text-xs font-bold text-slate-600 uppercase mb-1">No. HP</label>
                                            <input id="peserta-hp" type="tel" value={form.noHp} onChange={(e) => setForm({ ...form, noHp: e.target.value })}
                                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="peserta-alamat" className="block text-xs font-bold text-slate-600 uppercase mb-1">Alamat</label>
                                        <input id="peserta-alamat" type="text" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button type="submit" disabled={loading || uploading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                {loading ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Tambah Peserta"}
                            </button>
                            {isEditing && (
                                <button type="button" onClick={resetForm} className="bg-slate-300 hover:bg-slate-400 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">
                                    Batal
                                </button>
                            )}
                        </div>
                    </form>
                    </div>

                    {/* Import CSV */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">Import Peserta dari CSV</h2>
                        <p className="text-xs text-slate-500 mb-4">
                            Format: <code className="bg-slate-100 px-1 rounded">nomorPeserta, nama, password, ruang, sesi, kelas</code>
                        </p>
                        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                            {importing ? "Mengimpor..." : "Pilih File CSV"}
                        </button>
                        {importResult && (
                            <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                                <p className="font-bold">Hasil Import:</p>
                                <p className="text-emerald-700">Berhasil: {importResult.success} peserta</p>
                                {importResult.failed > 0 && <p className="text-amber-700">Gagal: {importResult.failed}</p>}
                                {importResult.errors.length > 0 && (
                                    <ul className="mt-2 text-xs text-slate-600 max-h-20 overflow-y-auto">
                                        {importResult.errors.slice(0, 5).map((err, i) => <li key={i}>- {err}</li>)}
                                        {importResult.errors.length > 5 && <li>... dan {importResult.errors.length - 5} lainnya</li>}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Kolom Kanan: Tabel Daftar Peserta */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2 overflow-hidden flex flex-col">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-slate-800">Daftar Peserta ({filteredPeserta.length})</h2>
                            <button onClick={handleResetAll} className="text-xs bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg transition-all">
                                Reset Semua
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="text"
                                placeholder="Cari nomor/nama..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 w-40"
                            />
                            <select
                                value={filterRuang}
                                onChange={(e) => { setFilterRuang(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="">Semua Ruang</option>
                                {uniqueRuang.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                            <select
                                value={filterSesi}
                                onChange={(e) => { setFilterSesi(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="">Semua Sesi</option>
                                {uniqueSesi.map((s) => (
                                    <option key={s} value={s}>Sesi {s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left text-sm text-slate-600 min-w-[700px]">
                            <thead className="bg-slate-100 text-xs text-slate-700 uppercase font-bold">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap">No. Peserta</th>
                                    <th className="px-4 py-3">Nama</th>
                                    <th className="px-4 py-3">Password</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Ruang / Sesi</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {paginatedPeserta.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                                            {searchQuery || filterRuang || filterSesi ? "Tidak ada peserta yang cocok dengan filter." : "Belum ada data peserta."}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedPeserta.map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap font-mono text-xs">{p.nomorPeserta}</td>
                                            <td className="px-4 py-3 whitespace-nowrap max-w-[180px] truncate" title={p.nama}>
                                                {p.nama}
                                                {p.kelas && <span className="block text-[10px] text-slate-400">{p.kelas}</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono text-slate-500">••••••••</td>
                                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded border mr-1">{p.ruang}</span>
                                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">Sesi {p.sesi}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {p.sudahUjian ? (
                                                    <span className="text-xs font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                                        {p.nilai !== null ? `Selesai (${p.nilai})` : 'Selesai'}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-500">Belum</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-center gap-1 whitespace-nowrap">
                                                    <button onClick={() => handleEdit(p)} className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded-md transition-all">
                                                        Edit
                                                    </button>
                                                    <Link href={`/admin/kartu?id=${p.id}`} className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold px-2 py-1 rounded-md transition-all">
                                                        Kartu
                                                    </Link>
                                                    {p.sudahUjian && (
                                                        <button onClick={() => handleResetUjian(p.id, p.nama)} className="text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold px-2 py-1 rounded-md transition-all">
                                                            Reset
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDelete(p.id)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded-md transition-all">
                                                        Hapus
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-xs font-bold rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
                            >
                                Sebelumnya
                            </button>
                            <span className="text-xs text-slate-500">
                                Halaman {currentPage} dari {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-xs font-bold rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
