"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

interface Ujian {
  id: number;
  nama: string;
  durasiMenit: number;
  jadwalMulai: string | null;
  jadwalSelesai: string | null;
  isActive: boolean;
  poolSize: number | null;
  _count: { soal: number; histori: number; bagian: number };
  mapelId: number | null;
  mapel: { id: number; nama: string; kelas: { nama: string } } | null;
  kelasTarget: string;
  jenis: string;
  labelPeserta: string;
  jumlahPeserta: number;
  jumlahSelesai: number;
}

interface MapelOpsi {
  id: number;
  label: string;
}

const EMPTY_FORM = { nama: "", durasiMenit: "60", jadwalMulai: "", jadwalSelesai: "", poolSize: "", mapelId: "", jenis: "LAIN", kelas: [] as string[] };
const JENIS: [string, string][] = [["LAIN", "Ujian lainnya / try out"], ["UH", "Ulangan Harian (UH)"], ["UTS", "Ujian Tengah Semester (UTS)"], ["UAS", "Ujian Akhir Semester (UAS/PAS)"]];
const bacaKelas = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** ISO string -> nilai input datetime-local (waktu lokal). */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatJadwal(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";
}

async function loadUjian(): Promise<Ujian[] | null> {
  const res = await fetch("/api/admin/ujian");
  return res.ok ? res.json() : null;
}

/** Pilihan kelas peserta & mapel (LMS). */
async function loadKelas(): Promise<{ mapel: MapelOpsi[]; kelas: string[] }> {
  const res = await fetch("/api/admin/kelas");
  if (!res.ok) return { mapel: [], kelas: [] };
  const data: { kelas: { nama: string; mapel: { id: number; nama: string }[] }[] } = await res.json();
  return {
    mapel: data.kelas.flatMap((k) => k.mapel.map((m) => ({ id: m.id, label: `${k.nama} — ${m.nama}` }))),
    kelas: data.kelas.map((k) => k.nama),
  };
}

export default function UjianManagement() {
  const { toast } = useToast();
  const [ujianList, setUjianList] = useState<Ujian[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapelList, setMapelList] = useState<MapelOpsi[]>([]);
  const [kelasList, setKelasList] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const data = await loadUjian();
    if (data) setUjianList(data);
  }, []);

  useEffect(() => {
    let ignore = false;
    loadUjian().then((data) => { if (!ignore && data) setUjianList(data); });
    loadKelas().then((d) => { if (!ignore) { setMapelList(d.mapel); setKelasList(d.kelas); } });
    return () => { ignore = true; };
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((form.jadwalMulai && !form.jadwalSelesai) || (!form.jadwalMulai && form.jadwalSelesai)) {
      toast("Isi jadwal mulai dan selesai sekaligus, atau kosongkan keduanya", "error");
      return;
    }
    setLoading(true);
    const body = {
      ...(editId ? { id: editId } : {}),
      nama: form.nama,
      durasiMenit: Number(form.durasiMenit),
      jadwalMulai: form.jadwalMulai ? new Date(form.jadwalMulai).toISOString() : null,
      jadwalSelesai: form.jadwalSelesai ? new Date(form.jadwalSelesai).toISOString() : null,
      poolSize: form.poolSize ? Number(form.poolSize) : null,
      mapelId: form.mapelId ? Number(form.mapelId) : null,
      kelasTarget: form.kelas,
      jenis: form.jenis,
    };
    const res = await fetch("/api/admin/ujian", {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      toast(editId ? (data.message || "Ujian diperbarui") : "Ujian berhasil dibuat!", "success");
      resetForm();
      refresh();
    } else {
      toast(data.message || "Gagal menyimpan ujian", "error");
    }
    setLoading(false);
  };

  const handleEdit = (u: Ujian) => {
    setEditId(u.id);
    setForm({
      nama: u.nama,
      durasiMenit: String(u.durasiMenit),
      jadwalMulai: toLocalInput(u.jadwalMulai),
      jadwalSelesai: toLocalInput(u.jadwalSelesai),
      poolSize: u.poolSize ? String(u.poolSize) : "",
      mapelId: u.mapelId ? String(u.mapelId) : "",
      jenis: u.jenis || "LAIN",
      kelas: bacaKelas(u.kelasTarget),
    });
  };

  const handleActivate = async (u: Ujian) => {
    if (!confirm(`Aktifkan "${u.nama}" untuk ${u.labelPeserta}? Ujian aktif lain yang kelas pesertanya sama akan dinonaktifkan; ujian untuk kelas lain tetap aktif.`)) return;
    const res = await fetch("/api/admin/ujian", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, isActive: true }),
    });
    const data = await res.json();
    if (res.ok) {
      toast(data.dinonaktifkan?.length ? data.message : `"${u.nama}" sekarang aktif`, "success");
      refresh();
    } else {
      toast(data.message || "Gagal mengaktifkan ujian", "error");
    }
  };

  const handleNonaktif = async (u: Ujian) => {
    if (!confirm(`Nonaktifkan "${u.nama}"? Siswa tidak bisa lagi memulai ujian ini.`)) return;
    const res = await fetch("/api/admin/ujian", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, isActive: false }) });
    const data = await res.json();
    toast(res.ok ? `"${u.nama}" dinonaktifkan` : data.message || "Gagal", res.ok ? "success" : "error");
    if (res.ok) refresh();
  };

  // Kelas dikelompokkan per tingkat (kata pertama nama kelas) untuk pilihan cepat
  const tingkat = [...new Set(kelasList.map((k) => k.split(" ")[0]))];
  const toggleKelas = (k: string) => setForm((f) => ({ ...f, kelas: f.kelas.includes(k) ? f.kelas.filter((x) => x !== k) : [...f.kelas, k] }));
  const toggleTingkat = (t: string) => setForm((f) => {
    const daftar = kelasList.filter((k) => k.split(" ")[0] === t);
    const semua = daftar.every((k) => f.kelas.includes(k));
    return { ...f, kelas: semua ? f.kelas.filter((k) => !daftar.includes(k)) : [...new Set([...f.kelas, ...daftar])] };
  });

  const handleDelete = async (u: Ujian) => {
    if (!confirm(`Hapus ujian "${u.nama}"? Soal di dalamnya tidak dihapus, tetapi dilepas menjadi soal global.`)) return;
    const res = await fetch(`/api/admin/ujian?id=${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      toast("Ujian berhasil dihapus", "success");
      if (editId === u.id) resetForm();
      refresh();
    } else {
      toast(data.message || "Gagal menghapus ujian", "error");
    }
  };

  const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <HeaderHalaman grup="Modul Ujian CAT" judul="Kelola Ujian" />

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{editId ? "Edit Ujian" : "Buat Ujian Baru"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="ujian-nama" className="block text-xs font-bold text-slate-600 uppercase mb-1">Nama Ujian</label>
              <input id="ujian-nama" type="text" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="Contoh: Ujian TIK Semester 1" className={inputClass} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ujian-durasi" className="block text-xs font-bold text-slate-600 uppercase mb-1">Durasi (menit)</label>
                <input id="ujian-durasi" type="number" min="1" value={form.durasiMenit} onChange={(e) => setForm({ ...form, durasiMenit: e.target.value })}
                  className={inputClass} required />
              </div>
              <div>
                <label htmlFor="ujian-pool" className="block text-xs font-bold text-slate-600 uppercase mb-1">Jumlah Soal</label>
                <input id="ujian-pool" type="number" min="1" value={form.poolSize} onChange={(e) => setForm({ ...form, poolSize: e.target.value })}
                  placeholder="Semua" className={inputClass} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 -mt-2">Jumlah Soal (pool): tiap peserta mendapat sejumlah soal acak dari bank soal ujian ini. Kosongkan = semua soal.</p>
            <div>
              <label htmlFor="ujian-jenis" className="block text-xs font-bold text-slate-600 uppercase mb-1">Jenis Ujian</label>
              <select id="ujian-jenis" value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} className={`${inputClass} bg-white`}>
                {JENIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Menentukan komponen rekap nilai mapel (UH/UTS/UAS). Nilai ujian lintas mapel masuk ke mapel yang namanya sama dengan mata pelajaran soal.</p>
            </div>
            <fieldset>
              <legend className="block text-xs font-bold text-slate-600 uppercase mb-1">Peserta (kelas)</legend>
              {kelasList.length === 0 ? <p className="text-[11px] text-slate-400">Belum ada kelas.</p> : (
                <div className="border border-slate-200 rounded-lg p-2 max-h-56 overflow-y-auto space-y-2">
                  {tingkat.map((t) => {
                    const daftar = kelasList.filter((k) => k.split(" ")[0] === t);
                    return (
                      <div key={t}>
                        <button type="button" onClick={() => toggleTingkat(t)} className="text-[11px] font-bold text-indigo-600 hover:underline">Kelas {t} ({daftar.filter((k) => form.kelas.includes(k)).length}/{daftar.length})</button>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {daftar.map((k) => (
                            <label key={k} className={`text-[11px] font-semibold px-2 py-1 rounded-md border cursor-pointer ${form.kelas.includes(k) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 text-slate-600"}`}>
                              <input type="checkbox" className="sr-only" checked={form.kelas.includes(k)} onChange={() => toggleKelas(k)} />{k}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">{form.kelas.length ? `${form.kelas.length} kelas dipilih.` : "Tidak ada yang dipilih = semua siswa (atau kelas mapel di bawah bila diisi)."} Beberapa ujian bisa aktif bersamaan bila kelasnya berbeda.</p>
            </fieldset>
            <div>
              <label htmlFor="ujian-mapel" className="block text-xs font-bold text-slate-600 uppercase mb-1">Khusus Mapel (opsional)</label>
              <select id="ujian-mapel" value={form.mapelId} onChange={(e) => setForm({ ...form, mapelId: e.target.value })} className={`${inputClass} bg-white`}>
                <option value="">Ujian lintas mapel (sekolah)</option>
                {mapelList.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Bila dipilih, nilai masuk rekap mapel itu dan ujian tampil di halaman mapel (peserta = kelas mapel bila kelas di atas tidak dipilih).
                {mapelList.length === 0 && <> Buat kelas & mapel di <Link href="/admin/kelas" className="text-indigo-600 font-semibold hover:underline">Kelas & Mapel</Link>.</>}
              </p>
            </div>
            <div>
              <label htmlFor="ujian-mulai" className="block text-xs font-bold text-slate-600 uppercase mb-1">Jadwal Mulai</label>
              <input id="ujian-mulai" type="datetime-local" value={form.jadwalMulai} onChange={(e) => setForm({ ...form, jadwalMulai: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="ujian-selesai" className="block text-xs font-bold text-slate-600 uppercase mb-1">Jadwal Selesai</label>
              <input id="ujian-selesai" type="datetime-local" value={form.jadwalSelesai} onChange={(e) => setForm({ ...form, jadwalSelesai: e.target.value })} className={inputClass} />
            </div>
            <p className="text-[10px] text-slate-400 -mt-2">Kosongkan jadwal agar ujian bisa dikerjakan kapan saja selama aktif.</p>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                {loading ? "Menyimpan..." : editId ? "Simpan Perubahan" : "Buat Ujian"}
              </button>
              {editId && (
                <button type="button" onClick={resetForm} className="bg-slate-300 hover:bg-slate-400 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold">Batal</button>
              )}
            </div>
          </form>
        </div>

        {/* List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Daftar Ujian ({ujianList.length})</h2>
          <p className="text-xs text-slate-500 mb-4">
            Beberapa ujian bisa aktif bersamaan untuk kelas yang berbeda. Ruang & sesi peserta diatur di <Link href="/admin/peserta-ujian" className="text-indigo-600 font-semibold hover:underline">Peserta Ujian</Link>. Soal ditambahkan lewat <Link href="/admin/soal" className="text-indigo-600 font-semibold hover:underline">Bank Soal</Link>,
            bagian/seksi lewat <Link href="/admin/bagian" className="text-indigo-600 font-semibold hover:underline">Bagian Ujian</Link>.
          </p>

          {ujianList.length === 0 ? (
            <p className="text-center text-slate-400 italic py-8">Belum ada ujian.</p>
          ) : (
            <div className="space-y-3">
              {ujianList.map((u) => (
                <div key={u.id} className={`border rounded-xl p-4 ${u.isActive ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800">{u.nama}</h3>
                        {u.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-white">AKTIF</span>}
                        {u.jenis !== "LAIN" && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-700">{u.jenis}</span>}
                        {u.mapel && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-700">{u.mapel.nama}</span>}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">Peserta: <b>{u.labelPeserta}</b> · {u.jumlahSelesai}/{u.jumlahPeserta} selesai</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        <span>{u.durasiMenit} menit</span>
                        <span>{u._count.soal} soal{u.poolSize ? ` · ${u.poolSize} per peserta` : ""}</span>
                        <span>{u._count.bagian} bagian</span>
                        <span>{u._count.histori} hasil</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Jadwal: {u.jadwalMulai ? `${formatJadwal(u.jadwalMulai)} – ${formatJadwal(u.jadwalSelesai)}` : "bebas (tanpa jadwal)"}
                      </p>
                      {u.poolSize && u.poolSize > u._count.soal && (
                        <p className="text-[11px] text-amber-600 mt-1">Jumlah soal per peserta melebihi soal yang tersedia — semua soal akan dipakai.</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!u.isActive && (
                        <button onClick={() => handleActivate(u)} className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-1 rounded-md">Aktifkan</button>
                      )}
                      {u.isActive && (
                        <button onClick={() => handleNonaktif(u)} className="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-1 rounded-md">Nonaktifkan</button>
                      )}
                      <button onClick={() => handleEdit(u)} className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded-md">Edit</button>
                      {!u.isActive && (
                        <button onClick={() => handleDelete(u)} className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded-md">Hapus</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
