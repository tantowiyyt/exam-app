"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

interface Akun {
  id: number;
  nomorPeserta: string;
  nama: string;
  role: "ADMIN" | "PENGAWAS" | "GURU";
  ruang: string;
  createdAt: string;
}

interface DataAkun {
  akun: Akun[];
  selfId: number;
  ruangList: string[];
}

const EMPTY_FORM = { username: "", nama: "", password: "", role: "PENGAWAS", ruang: "" };

async function loadAkun(): Promise<DataAkun | null> {
  const res = await fetch("/api/admin/akun");
  return res.ok ? res.json() : null;
}

export default function KelolaAkunPage() {
  const { toast } = useToast();
  const [data, setData] = useState<DataAkun>({ akun: [], selfId: 0, ruangList: [] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const d = await loadAkun();
    if (d) setData(d);
  }, []);

  useEffect(() => {
    let ignore = false;
    loadAkun().then((d) => { if (!ignore && d) setData(d); });
    return () => { ignore = true; };
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/akun", {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { id: editId, nama: form.nama, role: form.role, ruang: form.ruang, password: form.password || undefined } : form),
    });
    const body = await res.json();
    if (res.ok) {
      toast(editId ? "Akun diperbarui" : "Akun dibuat", "success");
      resetForm();
      refresh();
    } else {
      toast(body.message || "Gagal menyimpan akun", "error");
    }
    setLoading(false);
  };

  const handleEdit = (a: Akun) => {
    setEditId(a.id);
    setForm({ username: a.nomorPeserta, nama: a.nama, password: "", role: a.role, ruang: a.ruang });
  };

  const handleDelete = async (a: Akun) => {
    if (!confirm(`Hapus akun ${a.role.toLowerCase()} "${a.nama}" (${a.nomorPeserta})?`)) return;
    const res = await fetch(`/api/admin/akun?id=${a.id}`, { method: "DELETE" });
    const body = await res.json();
    toast(body.message || (res.ok ? "Akun dihapus" : "Gagal menghapus akun"), res.ok ? "success" : "error");
    if (res.ok) {
      if (editId === a.id) resetForm();
      refresh();
    }
  };

  const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
  const editingSelf = editId === data.selfId;

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <nav className="bg-linear-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-black tracking-wider text-indigo-400">CAT SYSTEM <span className="text-white text-xs font-normal">| Kelola Akun</span></h1>
        <Link href="/admin" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all">&larr; Kembali</Link>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{editId ? "Edit Akun" : "Buat Akun Baru"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="akun-username" className="block text-xs font-bold text-slate-600 uppercase mb-1">Username (untuk login)</label>
              <input id="akun-username" type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={!!editId} required pattern="[\w.\-]{3,50}" title="3–50 karakter: huruf, angka, titik, minus, garis bawah"
                className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="mis. pengawas01" />
            </div>
            <div>
              <label htmlFor="akun-nama" className="block text-xs font-bold text-slate-600 uppercase mb-1">Nama</label>
              <input id="akun-nama" type="text" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="akun-role" className="block text-xs font-bold text-slate-600 uppercase mb-1">Role</label>
              <select id="akun-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={editingSelf} className={`${inputClass} disabled:bg-slate-50`}>
                <option value="PENGAWAS">Pengawas — hanya monitoring ujian</option>
                <option value="GURU">Guru — kelola kelas, materi, tugas (LMS)</option>
                <option value="ADMIN">Admin — akses penuh</option>
              </select>
              {editingSelf && <p className="text-[10px] text-slate-400 mt-1">Role akun Anda sendiri tidak dapat diubah.</p>}
            </div>
            {form.role === "PENGAWAS" && (
              <div>
                <label htmlFor="akun-ruang" className="block text-xs font-bold text-slate-600 uppercase mb-1">Ruang yang Diawasi</label>
                <input id="akun-ruang" type="text" list="daftar-ruang" value={form.ruang} onChange={(e) => setForm({ ...form, ruang: e.target.value })}
                  className={inputClass} placeholder="Kosongkan = semua ruang" />
                <datalist id="daftar-ruang">
                  {data.ruangList.map((r) => <option key={r} value={r} />)}
                </datalist>
                <p className="text-[10px] text-slate-400 mt-1">Pengawas hanya melihat & mengatur peserta di ruang ini.</p>
              </div>
            )}
            <div>
              <label htmlFor="akun-password" className="block text-xs font-bold text-slate-600 uppercase mb-1">Password</label>
              <input id="akun-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editId} minLength={6} className={inputClass} placeholder={editId ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"} />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                {loading ? "Menyimpan..." : editId ? "Simpan Perubahan" : "Buat Akun"}
              </button>
              {editId && (
                <button type="button" onClick={resetForm} className="bg-slate-300 hover:bg-slate-400 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">Batal</button>
              )}
            </div>
          </form>
        </div>

        {/* List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Akun Admin, Pengawas & Guru ({data.akun.length})</h2>
          <p className="text-xs text-slate-500 mb-4">
            Akun peserta dikelola di menu <Link href="/admin/peserta" className="text-indigo-600 font-semibold hover:underline">Peserta</Link>.
          </p>
          <div className="space-y-2">
            {data.akun.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-200 bg-slate-50/50 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 text-sm">{a.nama}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${a.role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : a.role === "GURU" ? "bg-emerald-100 text-emerald-700" : "bg-cyan-100 text-cyan-700"}`}>{a.role}</span>
                    {a.id === data.selfId && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">Anda</span>}
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {a.nomorPeserta}
                    {a.role === "PENGAWAS" && <span className="font-sans"> · {a.ruang ? `Ruang ${a.ruang}` : "Semua ruang"}</span>}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleEdit(a)} className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded-md">Edit</button>
                  {a.id !== data.selfId && (
                    <button onClick={() => handleDelete(a)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded-md">Hapus</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
