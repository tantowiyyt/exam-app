"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

interface Bagian {
  id: number;
  ujianId: number;
  nama: string;
  urutan: number;
  durasiMenit: number | null;
  batasSoal: number | null;
  _count: { soal: number };
}

interface Ujian {
  id: number;
  nama: string;
}

export default function BagianManagement() {
  const { toast } = useToast();
  const [bagianList, setBagianList] = useState<Bagian[]>([]);
  const [ujianList, setUjianList] = useState<Ujian[]>([]);
  const [form, setForm] = useState({ ujianId: "", nama: "", urutan: "", durasiMenit: "", batasSoal: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterUjian, setFilterUjian] = useState("");

  const fetchData = async () => {
    const res = await fetch("/api/admin/bagian");
    if (res.ok) {
      const data = await res.json();
      setBagianList(data.bagian || []);
      setUjianList(data.ujianList || []);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchData, 0);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const body = {
      ...(isEditing && editId ? { id: editId } : {}),
      ujianId: Number(form.ujianId),
      nama: form.nama,
      urutan: form.urutan ? Number(form.urutan) : undefined,
      durasiMenit: form.durasiMenit ? Number(form.durasiMenit) : null,
      batasSoal: form.batasSoal ? Number(form.batasSoal) : null,
    };

    const res = await fetch("/api/admin/bagian", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (res.ok) {
      toast(isEditing ? "Bagian berhasil diubah!" : "Bagian berhasil ditambah!", "success");
      resetForm();
      fetchData();
    } else {
      toast(data.message || "Gagal menyimpan bagian", "error");
    }
    setLoading(false);
  };

  const handleEdit = (b: Bagian) => {
    setForm({
      ujianId: String(b.ujianId),
      nama: b.nama,
      urutan: String(b.urutan),
      durasiMenit: b.durasiMenit ? String(b.durasiMenit) : "",
      batasSoal: b.batasSoal ? String(b.batasSoal) : "",
    });
    setEditId(b.id);
    setIsEditing(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin hapus bagian ini? Soal di dalamnya tidak akan dihapus.")) return;
    const res = await fetch(`/api/admin/bagian?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Bagian berhasil dihapus!", "success");
      fetchData();
    } else {
      toast("Gagal menghapus bagian", "error");
    }
  };

  const resetForm = () => {
    setForm({ ujianId: "", nama: "", urutan: "", durasiMenit: "", batasSoal: "" });
    setIsEditing(false);
    setEditId(null);
  };

  const filteredBagian = filterUjian
    ? bagianList.filter(b => b.ujianId === Number(filterUjian))
    : bagianList;

  const groupedByUjian = filteredBagian.reduce<Record<number, Bagian[]>>((acc, b) => {
    if (!acc[b.ujianId]) acc[b.ujianId] = [];
    acc[b.ujianId].push(b);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <nav className="bg-linear-to-r from-slate-900 to-blue-950 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-black tracking-wider text-cyan-400">CAT SYSTEM <span className="text-white text-xs font-normal">| Kelola Bagian Ujian</span></h1>
        <Link href="/admin" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all">&larr; Kembali</Link>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{isEditing ? "Edit Bagian" : "Tambah Bagian Baru"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ujian</label>
              <select value={form.ujianId} onChange={e => setForm({ ...form, ujianId: e.target.value })} disabled={isEditing}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" required>
                <option value="" disabled>Pilih Ujian</option>
                {ujianList.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nama Bagian</label>
              <input type="text" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })}
                placeholder="Contoh: Pengetahuan Dasar, Tes Skolastik..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Urutan</label>
                <input type="number" min="1" value={form.urutan} onChange={e => setForm({ ...form, urutan: e.target.value })}
                  placeholder="Auto" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Durasi (mnt)</label>
                <input type="number" min="1" value={form.durasiMenit} onChange={e => setForm({ ...form, durasiMenit: e.target.value })}
                  placeholder="Opsional" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Batas Soal</label>
                <input type="number" min="1" value={form.batasSoal} onChange={e => setForm({ ...form, batasSoal: e.target.value })}
                  placeholder="Semua" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400"><b>Durasi</b>: bila SEMUA soal ujian berada di bagian yang punya durasi, peserta mengerjakan bagian secara berurutan dengan waktu masing-masing dan tidak bisa kembali ke bagian sebelumnya. Selain itu dipakai durasi ujian utama. <b>Batas Soal</b> opsional: peserta mendapat sejumlah soal acak dari bagian ini. Soal dimasukkan ke bagian lewat menu <Link href="/admin/soal" className="text-blue-600 font-semibold hover:underline">Bank Soal</Link>.</p>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold transition-all">
                {loading ? "Menyimpan..." : isEditing ? "Simpan" : "Tambah"}
              </button>
              {isEditing && (
                <button type="button" onClick={resetForm} className="bg-slate-300 hover:bg-slate-400 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">Batal</button>
              )}
            </div>
          </form>
        </div>

        {/* List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800">Daftar Bagian</h2>
            <select value={filterUjian} onChange={e => setFilterUjian(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Semua Ujian</option>
              {ujianList.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
          </div>

          {Object.entries(groupedByUjian).length === 0 ? (
            <p className="text-center text-slate-400 italic py-8">Belum ada bagian ujian.</p>
          ) : Object.entries(groupedByUjian).map(([ujianId, bagians]) => {
            const ujian = ujianList.find(u => u.id === Number(ujianId));
            return (
              <div key={ujianId} className="mb-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">{ujian?.nama || `Ujian #${ujianId}`}</h3>
                <div className="space-y-2">
                  {bagians.map(b => (
                    <div key={b.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-sm font-black">{b.urutan}</span>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{b.nama}</p>
                          <p className="text-[10px] text-slate-400">
                            {b._count.soal} soal
                            {b.durasiMenit && ` · ${b.durasiMenit} menit`}
                            {b.batasSoal && ` · max ${b.batasSoal} soal`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(b)} className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded-md">Edit</button>
                        <button onClick={() => handleDelete(b.id)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded-md">Hapus</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
