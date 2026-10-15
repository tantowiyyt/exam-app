"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

interface Peserta {
  id: number;
  nomorPeserta: string;
  nama: string;
  ruang: string;
  sesi: string;
  tanggalUjian: string | null;
  foto: string | null;
  jawabanTerjawab: number;
  pelanggaran: number;
  sedangUjian: boolean;
  totalSoalPeserta: number;
  tenggat: number | null;
  waktuHabis: boolean;
  bagianAktif: string | null;
  tambahanMenit: number;
}

function formatSisa(ms: number) {
  if (ms <= 0) return "Habis";
  const t = Math.floor(ms / 1000);
  const j = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const d = t % 60;
  return `${j > 0 ? `${j}:` : ""}${String(m).padStart(2, "0")}:${String(d).padStart(2, "0")}`;
}

interface SudahSelesai {
  id: number;
  nomorPeserta: string;
  nama: string;
  ruang: string;
  sesi: string;
  nilai: number | null;
  foto: string | null;
  waktuMulai: string | null;
  waktuSelesai: string | null;
}

interface UjianInfo {
  id: number;
  nama: string;
  peserta: string;
  durasiMenit: number;
  jadwalMulai: string | null;
  jadwalSelesai: string | null;
}

interface Stats {
  totalPeserta: number;
  sedangUjian: number;
  sudahSelesai: number;
  belumMulai: number;
}

export default function MonitoringPage() {
  const { toast } = useToast();
  const [offset, setOffset] = useState(0);
  const [sekarang, setSekarang] = useState(0);
  const [aksiId, setAksiId] = useState<number | null>(null);
  const [ruangSaya, setRuangSaya] = useState<string | null>(null);
  const [ujian, setUjian] = useState<UjianInfo | null>(null);
  const [peserta, setPeserta] = useState<Peserta[]>([]);
  const [sudahSelesai, setSudahSelesai] = useState<SudahSelesai[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [totalSoal, setTotalSoal] = useState(0);
  const [countdown, setCountdown] = useState("");
  const [filterRuang, setFilterRuang] = useState("");
  const [tab, setTab] = useState<"aktif" | "selesai">("aktif");
  // Beberapa ujian bisa aktif bersamaan (kelas berbeda): pilih yang dipantau
  const [daftarUjian, setDaftarUjian] = useState<{ id: number; nama: string; peserta: string }[]>([]);
  const [pilihUjian, setPilihUjian] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/monitoring${pilihUjian ? `?ujian=${pilihUjian}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setUjian(data.ujian);
        setDaftarUjian(data.daftarUjian || []);
        setPeserta(data.peserta || []);
        setSudahSelesai(data.sudahSelesai || []);
        setStats(data.stats);
        setTotalSoal(data.totalSoal);
        if (data.serverNow) setOffset(data.serverNow - Date.now());
        setRuangSaya(data.ruangPengawas ?? null);
      }
    } catch {}
  }, [pilihUjian]);

  useEffect(() => {
    const first = setTimeout(fetchData, 0);
    const interval = setInterval(fetchData, 5000);
    const tick = setInterval(() => setSekarang(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(interval); clearInterval(tick); };
  }, [fetchData]);

  const aksi = async (p: Peserta, action: "tambahWaktu" | "paksaKumpul" | "reset") => {
    let menit: number | undefined;
    if (action === "tambahWaktu") {
      const input = prompt(`Tambah waktu untuk ${p.nama} (menit):`, "10");
      if (!input) return;
      menit = Number(input);
      if (!(menit >= 1 && menit <= 180)) { toast("Masukkan 1–180 menit", "error"); return; }
    } else if (action === "paksaKumpul") {
      if (!confirm(`Kumpulkan ujian ${p.nama} sekarang? Jawaban yang sudah tersimpan akan dinilai.`)) return;
    } else if (!confirm(`Reset sesi ${p.nama}? Jawaban yang sudah tersimpan DIHAPUS dan waktu dimulai ulang dari awal.`)) {
      return;
    }
    setAksiId(p.id);
    try {
      const res = await fetch("/api/admin/sesi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.id, action, menit }),
      });
      const data = await res.json();
      toast(data.message || (res.ok ? "Berhasil" : "Gagal"), res.ok ? "success" : "error");
      fetchData();
    } finally {
      setAksiId(null);
    }
  };

  useEffect(() => {
    if (!ujian?.jadwalMulai) return;
    const update = () => {
      const now = new Date();
      const mulai = new Date(ujian.jadwalMulai!);
      const selesai = ujian.jadwalSelesai ? new Date(ujian.jadwalSelesai) : null;
      if (now >= mulai && selesai && now <= selesai) {
        const diff = selesai.getTime() - now.getTime();
        const j = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const d = Math.floor((diff % 60000) / 1000);
        setCountdown(`${j.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${d.toString().padStart(2,"0")}`);
      } else if (now < mulai) {
        setCountdown("Belum Mulai");
      } else {
        setCountdown("Selesai");
      }
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [ujian]);

  const filteredPeserta = filterRuang
    ? peserta.filter(p => p.ruang === filterRuang)
    : peserta;

  const filteredSelesai = filterRuang
    ? sudahSelesai.filter(p => p.ruang === filterRuang)
    : sudahSelesai;

  const uniqueRuang = [...new Set([...peserta.map(p => p.ruang), ...sudahSelesai.map(p => p.ruang)])].sort();

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <HeaderHalaman grup="Ujian CAT" judul="Monitoring Ujian">
        {countdown && (
          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
            countdown === "Selesai" ? "bg-red-50 text-red-700 border-red-200" :
            countdown === "Belum Mulai" ? "bg-amber-50 text-amber-700 border-amber-200" :
            "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            {countdown}
          </span>
        )}
        {ruangSaya && (
          <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">Ruang {ruangSaya}</span>
        )}
      </HeaderHalaman>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
              <p className="text-3xl font-black text-indigo-600">{stats.totalPeserta}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Total Peserta</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
              <p className="text-3xl font-black text-emerald-600">{stats.sedangUjian}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Sedang Mengerjakan</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
              <p className="text-3xl font-black text-blue-600">{stats.sudahSelesai}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Sudah Selesai</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
              <p className="text-3xl font-black text-slate-700">{totalSoal}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">Total Soal</p>
            </div>
          </div>
        )}

        {/* Info Ujian */}
        {ujian && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              <h2 className="font-bold text-slate-800">{ujian.nama}</h2>
              <p className="text-xs text-slate-500">Peserta: {ujian.peserta} · {ujian.durasiMenit} menit | {ujian.jadwalMulai ? new Date(ujian.jadwalMulai).toLocaleDateString("id-ID") : "-"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
            {daftarUjian.length > 1 && (
              <select value={ujian.id} onChange={(e) => setPilihUjian(Number(e.target.value))} aria-label="Ujian yang dipantau"
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold">
                {daftarUjian.map((u) => <option key={u.id} value={u.id}>{u.nama} — {u.peserta}</option>)}
              </select>
            )}
            <select value={filterRuang} onChange={(e) => setFilterRuang(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Semua Ruang</option>
              {uniqueRuang.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setTab("aktif")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "aktif" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
            Sedang Mengerjakan ({filteredPeserta.length})
          </button>
          <button onClick={() => setTab("selesai")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "selesai" ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
            Sudah Selesai ({filteredSelesai.length})
          </button>
        </div>

        {/* Table Aktif */}
        {tab === "aktif" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Peserta</th>
                    <th className="px-4 py-3">Ruang / Sesi</th>
                    <th className="px-4 py-3 text-center">Progres</th>
                    <th className="px-4 py-3 text-center">Sisa Waktu</th>
                    <th className="px-4 py-3 text-center">Pelanggaran</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPeserta.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400 italic">Tidak ada peserta aktif</td></tr>
                  ) : filteredPeserta.map(p => {
                    const total = p.totalSoalPeserta || totalSoal;
                    const pct = total > 0 ? Math.round((p.jawabanTerjawab / total) * 100) : 0;
                    const sisa = p.tenggat && sekarang ? p.tenggat - (sekarang + offset) : null;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                              {p.foto ? <img src={p.foto} alt="" className="w-full h-full object-cover" /> :
                               <span className="text-xs font-bold text-slate-500">{p.nama.charAt(0)}</span>}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{p.nama}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{p.nomorPeserta}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-semibold">{p.ruang}</span>
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold ml-1">S{p.sesi}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-16 text-right">{p.jawabanTerjawab}/{total}</span>
                          </div>
                          {p.bagianAktif && <p className="text-[10px] text-indigo-600 font-semibold mt-1">Bagian: {p.bagianAktif}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!p.sedangUjian ? (
                            <span className="text-xs text-slate-400">Belum mulai</span>
                          ) : (
                            <span className={`text-xs font-mono font-bold ${sisa !== null && sisa < 5 * 60000 ? "text-red-600" : "text-slate-700"}`}>
                              {sisa === null ? "—" : formatSisa(sisa)}
                              {p.tambahanMenit > 0 && <span className="block text-[10px] font-sans text-emerald-600">+{p.tambahanMenit} mnt</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.pelanggaran > 0 ? (
                            <span className={`text-xs font-bold px-2 py-1 rounded ${p.pelanggaran >= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              ⚠ {p.pelanggaran}x
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {p.sedangUjian ? (
                            <div className="flex gap-1 justify-center">
                              <button disabled={aksiId === p.id} onClick={() => aksi(p, "tambahWaktu")} title="Tambah waktu"
                                className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-1 rounded disabled:opacity-50">+Waktu</button>
                              <button disabled={aksiId === p.id} onClick={() => aksi(p, "paksaKumpul")} title="Kumpulkan sekarang"
                                className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2 py-1 rounded disabled:opacity-50">Kumpulkan</button>
                              <button disabled={aksiId === p.id} onClick={() => aksi(p, "reset")} title="Reset sesi"
                                className="text-[10px] bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2 py-1 rounded disabled:opacity-50">Reset</button>
                            </div>
                          ) : (
                            <span className="block text-center text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Table Selesai */}
        {tab === "selesai" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Peserta</th>
                    <th className="px-4 py-3">Ruang / Sesi</th>
                    <th className="px-4 py-3 text-center">Nilai</th>
                    <th className="px-4 py-3">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSelesai.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400 italic">Belum ada yang selesai</td></tr>
                  ) : filteredSelesai.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                            {p.foto ? <img src={p.foto} alt="" className="w-full h-full object-cover" /> :
                             <span className="text-xs font-bold text-slate-500">{p.nama.charAt(0)}</span>}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{p.nama}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{p.nomorPeserta}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-semibold">{p.ruang}</span>
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold ml-1">S{p.sesi}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-black ${p.nilai !== null && p.nilai >= 75 ? "text-emerald-600" : p.nilai !== null && p.nilai >= 50 ? "text-amber-600" : "text-red-600"}`}>
                          {p.nilai ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {p.waktuMulai ? new Date(p.waktuMulai).toLocaleTimeString("id-ID") : "-"} → {p.waktuSelesai ? new Date(p.waktuSelesai).toLocaleTimeString("id-ID") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
