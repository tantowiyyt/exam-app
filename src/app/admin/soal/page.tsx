"use client";

import { useEffect, useState, useRef } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

interface Soal {
    id: number;
    pertanyaan: string;
    opsiA: string;
    opsiB: string;
    opsiC: string;
    opsiD: string;
    jawabanBenar: string;
    mataPelajaran: string;
    bobot: number;
    ujianId: number | null;
    bagianId: number | null;
    ujian: { id: number; nama: string } | null;
    bagian: { id: number; nama: string } | null;
}

interface UjianOption {
    id: number;
    nama: string;
    isActive: boolean;
    bagian: { id: number; nama: string }[];
}

const MATA_PELAJARAN = ["TIK", "Matematika", "Bahasa Indonesia", "Pengetahuan Umum"];
const EMPTY_FORM = { id: "", pertanyaan: "", opsiA: "", opsiB: "", opsiC: "", opsiD: "", jawabanBenar: "A", mataPelajaran: "TIK", bobot: "1", ujianId: "", bagianId: "" };

export default function SoalManagement() {
    const { toast } = useToast();
    const [soalList, setSoalList] = useState<Soal[]>([]);
    const [ujianList, setUjianList] = useState<UjianOption[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [filterUjian, setFilterUjian] = useState("");
    const [importTarget, setImportTarget] = useState({ ujianId: "", bagianId: "" });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMapel, setFilterMapel] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
    const [selectedSoal, setSelectedSoal] = useState<Set<number>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const itemsPerPage = 10;

    const fetchSoal = async () => {
        const res = await fetch("/api/admin/soal");
        const data = await res.json();
        if (res.ok) {
            setSoalList(data.soal);
            setUjianList(data.ujianList);
            // Default form & impor ke ujian aktif
            const aktif = String(data.ujianList.find((u: UjianOption) => u.isActive)?.id ?? "");
            setForm((f) => (f.id || f.ujianId ? f : { ...f, ujianId: aktif }));
            setImportTarget((t) => (t.ujianId ? t : { ...t, ujianId: aktif }));
        }
    };

    const activeUjianId = String(ujianList.find((u) => u.isActive)?.id ?? "");
    const bagianOptions = (ujianId: string) => ujianList.find((u) => String(u.id) === ujianId)?.bagian ?? [];

    useEffect(() => {
        const t = setTimeout(fetchSoal, 0);
        return () => clearTimeout(t);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const method = isEditing ? "PUT" : "POST";
        const res = await fetch("/api/admin/soal", {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...form,
                bobot: parseFloat(form.bobot) || 1,
                ujianId: form.ujianId ? Number(form.ujianId) : null,
                bagianId: form.bagianId ? Number(form.bagianId) : null,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            toast(data.message, "error");
        } else {
            toast(isEditing ? "Soal berhasil diubah!" : "Soal baru berhasil ditambah!", "success");
            resetForm();
            fetchSoal();
        }
        setLoading(false);
    };

    const handleEdit = (s: Soal) => {
        setForm({
            id: String(s.id), pertanyaan: s.pertanyaan, opsiA: s.opsiA, opsiB: s.opsiB, opsiC: s.opsiC, opsiD: s.opsiD,
            jawabanBenar: s.jawabanBenar, mataPelajaran: s.mataPelajaran, bobot: String(s.bobot || 1),
            ujianId: s.ujianId ? String(s.ujianId) : "", bagianId: s.bagianId ? String(s.bagianId) : "",
        });
        setIsEditing(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Yakin ingin menghapus soal ini?")) return;

        const res = await fetch(`/api/admin/soal?id=${id}`, { method: "DELETE" });
        if (res.ok) {
            fetchSoal();
        } else {
            const data = await res.json().catch(() => ({}));
            toast(data.message || "Gagal menghapus soal", "error");
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

            const startIndex = lines[0].toLowerCase().includes("pertanyaan") || lines[0].toLowerCase().includes("question") ? 1 : 0;

            const soalData = [];
            const errors: string[] = [];

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));

                if (parts.length < 7) {
                    errors.push(`Baris ${i + 1}: Kolom kurang (butuh min. 7 kolom)`);
                    continue;
                }

                const [pertanyaan, opsiA, opsiB, opsiC, opsiD, jawabanBenar, mataPelajaran, bobot] = parts;

                if (!pertanyaan || !opsiA || !opsiB || !opsiC || !opsiD || !jawabanBenar) {
                    errors.push(`Baris ${i + 1}: Ada kolom yang kosong`);
                    continue;
                }

                const validJawaban = ["A", "B", "C", "D"];
                if (!validJawaban.includes(jawabanBenar.toUpperCase())) {
                    errors.push(`Baris ${i + 1}: Kunci jawaban tidak valid (harus A/B/C/D)`);
                    continue;
                }

                soalData.push({
                    pertanyaan,
                    opsiA,
                    opsiB,
                    opsiC,
                    opsiD,
                    jawabanBenar: jawabanBenar.toUpperCase(),
                    mataPelajaran: mataPelajaran || "Umum",
                    bobot: parseFloat(bobot) || 1,
                });
            }

            if (soalData.length === 0) {
                setImportResult({ success: 0, failed: lines.length - startIndex, errors });
                return;
            }

            const res = await fetch("/api/admin/soal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bulk: soalData,
                    ujianId: importTarget.ujianId ? Number(importTarget.ujianId) : null,
                    bagianId: importTarget.bagianId ? Number(importTarget.bagianId) : null,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setImportResult({
                    success: data.data.successCount,
                    failed: data.data.failedCount,
                    errors: [...errors, ...data.data.errors],
                });
                fetchSoal();
            } else {
                toast(data.message || "Gagal mengimpor soal", "error");
            }
        } catch {
            toast("Gagal membaca file CSV", "error");
        } finally {
            setImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const resetForm = () => {
        setForm({ ...EMPTY_FORM, ujianId: activeUjianId });
        setIsEditing(false);
    };

    const toggleSelect = (id: number) => {
        setSelectedSoal((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedSoal.size === paginatedSoal.length) {
            setSelectedSoal(new Set());
        } else {
            setSelectedSoal(new Set(paginatedSoal.map((s) => s.id)));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedSoal.size === 0) return;
        if (!confirm(`Yakin ingin menghapus ${selectedSoal.size} soal yang dipilih?`)) return;

        const ids = Array.from(selectedSoal).join(",");
        const res = await fetch(`/api/admin/soal?ids=${ids}`, { method: "DELETE" });
        if (res.ok) {
            toast(`${selectedSoal.size} soal berhasil dihapus!`, "success");
            setSelectedSoal(new Set());
            fetchSoal();
        } else {
            const data = await res.json().catch(() => ({}));
            toast(data.message || "Gagal menghapus soal", "error");
        }
    };

    const handleExportSoal = () => {
        const headers = ["pertanyaan", "opsiA", "opsiB", "opsiC", "opsiD", "jawabanBenar", "mataPelajaran", "bobot"];
        const csvRows = [headers.join(",")];
        for (const s of soalList) {
            const row = [s.pertanyaan, s.opsiA, s.opsiB, s.opsiC, s.opsiD, s.jawabanBenar, s.mataPelajaran, s.bobot || 1]
                .map((v) => `"${(v || '').toString().replace(/"/g, '""')}"`)
                .join(",");
            csvRows.push(row);
        }
        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bank-soal-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast(`Berhasil export ${soalList.length} soal`, "success");
    };

    // Filter and paginate
    const filteredSoal = soalList.filter((s) => {
        const matchesSearch = s.pertanyaan.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesMapel = !filterMapel || s.mataPelajaran === filterMapel;
        const matchesUjian = !filterUjian || (filterUjian === "none" ? !s.ujianId : String(s.ujianId) === filterUjian);
        return matchesSearch && matchesMapel && matchesUjian;
    });

    const totalPages = Math.ceil(filteredSoal.length / itemsPerPage);
    const paginatedSoal = filteredSoal.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            <HeaderHalaman grup="Ujian CAT" judul="Bank Soal" />

            <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-8">
                {/* Kolom Kiri: Form + Import */}
                <div className="space-y-6">
                    {/* Form Tambah/Edit Soal */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">
                            {isEditing ? "Edit Soal" : "Tambah Soal Baru"}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label htmlFor="soal-ujian" className="block text-xs font-bold text-slate-600 uppercase mb-1">Ujian</label>
                                    <select id="soal-ujian" value={form.ujianId} onChange={(e) => setForm({ ...form, ujianId: e.target.value, bagianId: "" })}
                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                                        <option value="">Tanpa ujian (global)</option>
                                        {ujianList.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.isActive ? " (aktif)" : ""}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="soal-bagian" className="block text-xs font-bold text-slate-600 uppercase mb-1">Bagian</label>
                                    <select id="soal-bagian" value={form.bagianId} onChange={(e) => setForm({ ...form, bagianId: e.target.value })} disabled={!form.ujianId}
                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50">
                                        <option value="">Tanpa bagian</option>
                                        {bagianOptions(form.ujianId).map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
                                    </select>
                                </div>
                            </div>
                            {!form.ujianId && (
                                <p className="text-[10px] text-amber-600 -mt-2">Soal tanpa ujian hanya dipakai bila tidak ada ujian yang aktif.</p>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Mata Pelajaran</label>
                                <select value={form.mataPelajaran} onChange={(e) => setForm({ ...form, mataPelajaran: e.target.value })}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-semibold" required>
                                    {MATA_PELAJARAN.map((mp) => (
                                        <option key={mp} value={mp}>{mp}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Pertanyaan</label>
                                <textarea rows={4} value={form.pertanyaan} onChange={(e) => setForm({ ...form, pertanyaan: e.target.value })}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Tuliskan pertanyaan ujian di sini..." required />
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                                    <div key={opt} className="flex gap-2 items-center">
                                        <span className="font-bold text-slate-500 w-5">{opt}.</span>
                                        <input type="text" value={form[`opsi${opt}` as keyof typeof form]} onChange={(e) => setForm({ ...form, [`opsi${opt}`]: e.target.value })}
                                            className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500" required placeholder={`Pilihan jawaban ${opt}`} />
                                    </div>
                                ))}
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Kunci Jawaban Benar</label>
                                <select value={form.jawabanBenar} onChange={(e) => setForm({ ...form, jawabanBenar: e.target.value })}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-700 bg-emerald-50 cursor-pointer">
                                    <option value="A">Opsi A</option>
                                    <option value="B">Opsi B</option>
                                    <option value="C">Opsi C</option>
                                    <option value="D">Opsi D</option>
                                </select>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Bobot Soal</label>
                                <input type="number" step="0.5" min="0.5" value={form.bobot} onChange={(e) => setForm({ ...form, bobot: e.target.value })}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500" required />
                                <p className="text-[10px] text-slate-400 mt-1">Default: 1. Bisa diatur 0.5, 1, 2, dst.</p>
                            </div>

                            <div className="flex gap-2 pt-4">
                                <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold transition-all">
                                    {loading ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Tambah Soal"}
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
                        <h2 className="text-lg font-bold text-slate-800 mb-4">Import Soal dari CSV</h2>
                        <p className="text-xs text-slate-500 mb-4">
                            Format CSV: <code className="bg-slate-100 px-1 rounded">pertanyaan, opsiA, opsiB, opsiC, opsiD, jawabanBenar, mataPelajaran, bobot</code> (bobot opsional)
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <select aria-label="Ujian tujuan impor" value={importTarget.ujianId} onChange={(e) => setImportTarget({ ujianId: e.target.value, bagianId: "" })}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white">
                                <option value="">Tanpa ujian (global)</option>
                                {ujianList.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.isActive ? " (aktif)" : ""}</option>)}
                            </select>
                            <select aria-label="Bagian tujuan impor" value={importTarget.bagianId} onChange={(e) => setImportTarget({ ...importTarget, bagianId: e.target.value })} disabled={!importTarget.ujianId}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white disabled:bg-slate-50">
                                <option value="">Tanpa bagian</option>
                                {bagianOptions(importTarget.ujianId).map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleImportCSV}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={importing}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                            >
                                {importing ? "Mengimpor..." : "Pilih File CSV"}
                            </button>
                        </div>

                        {importResult && (
                            <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                                <p className="font-bold">Hasil Import:</p>
                                <p className="text-emerald-700">Berhasil: {importResult.success} soal</p>
                                {importResult.failed > 0 && <p className="text-amber-700">Gagal: {importResult.failed} baris</p>}
                                {importResult.errors.length > 0 && (
                                    <ul className="mt-2 text-xs text-slate-600 max-h-20 overflow-y-auto">
                                        {importResult.errors.slice(0, 5).map((err, i) => (
                                            <li key={i}>- {err}</li>
                                        ))}
                                        {importResult.errors.length > 5 && <li>... dan {importResult.errors.length - 5} error lainnya</li>}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabel Daftar Soal Kolom Kanan */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2 overflow-hidden flex flex-col">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-slate-800">Daftar Soal ({filteredSoal.length})</h2>
                            {selectedSoal.size > 0 && (
                                <button onClick={handleBulkDelete} className="text-xs bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg transition-all">
                                    Hapus {selectedSoal.size} Soal
                                </button>
                            )}
                            <button onClick={handleExportSoal} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all">
                                Export CSV
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="text"
                                placeholder="Cari soal..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 w-40"
                            />
                            <select
                                value={filterMapel}
                                onChange={(e) => { setFilterMapel(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                                <option value="">Semua Mapel</option>
                                {MATA_PELAJARAN.map((mp) => (
                                    <option key={mp} value={mp}>{mp}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Filter ujian"
                                value={filterUjian}
                                onChange={(e) => { setFilterUjian(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                                <option value="">Semua Ujian</option>
                                <option value="none">Tanpa ujian</option>
                                {ujianList.map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Select All */}
                    {paginatedSoal.length > 0 && (
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                            <input
                                type="checkbox"
                                checked={selectedSoal.size === paginatedSoal.length && paginatedSoal.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-500">Pilih semua di halaman ini</span>
                        </div>
                    )}

                    <div className="overflow-y-auto pr-2 space-y-3 flex-1">
                        {paginatedSoal.length === 0 ? (
                            <p className="text-center py-8 text-slate-400 italic">
                                {searchQuery || filterMapel ? "Tidak ada soal yang cocok." : "Belum ada soal."}
                            </p>
                        ) : (
                            paginatedSoal.map((s, index) => (
                                <div key={s.id} className={`p-4 border rounded-xl transition-colors ${selectedSoal.has(s.id) ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 bg-slate-50/50'}`}>
                                    <div className="flex justify-between gap-4 mb-3">
                                        <div className="flex items-start gap-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedSoal.has(s.id)}
                                                onChange={() => toggleSelect(s.id)}
                                                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <p className="text-sm font-bold text-slate-800">
                                                <span className="text-indigo-600 mr-1">{(currentPage - 1) * itemsPerPage + index + 1}.</span> {s.pertanyaan}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 shrink-0 items-start">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${s.mataPelajaran === 'TIK' ? 'bg-blue-100 text-blue-700' : s.mataPelajaran === 'Matematika' ? 'bg-purple-100 text-purple-700' : s.mataPelajaran === 'Bahasa Indonesia' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {s.mataPelajaran}
                                            </span>
                                            {s.bagian && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-700">{s.bagian.nama}</span>
                                            )}
                                            {!filterUjian && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">{s.ujian?.nama ?? "Global"}</span>
                                            )}
                                            <button onClick={() => handleEdit(s)} className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded transition-all">Edit</button>
                                            <button onClick={() => handleDelete(s.id)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded transition-all">Hapus</button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                                            <div key={opt} className={`px-2 py-1.5 rounded border ${s.jawabanBenar === opt ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold' : 'bg-white border-slate-200 text-slate-600'}`}>
                                                <span className="mr-1">{opt}.</span> {s[`opsi${opt}` as "opsiA"]}
                                                {s.jawabanBenar === opt && <span className="float-right">&#10003;</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
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
