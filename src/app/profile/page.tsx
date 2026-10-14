"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { HeaderHalaman } from "@/components/AppShell";

// Data diri siswa (dipakai kartu ujian & administrasi). Bisa diubah kapan saja.
// Dari dasbor ujian CAT (?lanjut=ujian): setelah disimpan kembali ke dasbor ujian.

const inputClass = "w-full bg-white border border-slate-300 text-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 text-sm";
const labelClass = "block text-xs font-bold text-slate-600 mb-1.5";

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [akun, setAkun] = useState({ nama: "", nomorPeserta: "", kelas: "", ruang: "", sesi: "" });
  const [foto, setFoto] = useState("");
  const [nik, setNik] = useState("");
  const [tempatLahir, setTempatLahir] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [jenisKelamin, setJenisKelamin] = useState("");
  const [alamat, setAlamat] = useState("");
  const [noHp, setNoHp] = useState("");
  const [error, setError] = useState("");
  const [sukses, setSukses] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [lanjutUjian] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("lanjut") === "ujian");

  useEffect(() => {
    let ignore = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ignore) return;
        if (!d) { router.push("/login"); return; }
        setAkun({ nama: d.nama, nomorPeserta: d.nomorPeserta, kelas: d.kelas ?? "", ruang: d.ruang ?? "", sesi: d.sesi ?? "" });
        setFoto(d.foto || "");
        setNik(d.nik || "");
        setTempatLahir(d.tempatLahir || "");
        setTanggalLahir(d.tanggalLahir || "");
        setJenisKelamin(d.jenisKelamin || "");
        setAlamat(d.alamat || "");
        setNoHp(d.noHp || "");
      })
      .catch(() => { if (!ignore) router.push("/login"); })
      .finally(() => { if (!ignore) setFetching(false); });
    return () => { ignore = true; };
  }, [router]);

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) setFoto(data.url);
      else setError(data.message || "Gagal upload foto");
    } catch {
      setError("Gagal upload foto");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSukses("");
    try {
      const res = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto, nik, tempatLahir, tanggalLahir, jenisKelamin, alamat, noHp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Gagal menyimpan data."); return; }
      if (lanjutUjian) { router.push("/dashboard"); return; }
      setSukses(data.message || "Data diri disimpan.");
    } catch {
      setError("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <HeaderHalaman grup="Akun" judul="Data Diri" />
      <main className="max-w-3xl mx-auto p-4 md:p-8">
        {fetching ? <p className="text-slate-500 text-sm">Memuat data...</p> : (
          <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-6">
            {lanjutUjian && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">Lengkapi data diri dulu sebelum mengikuti ujian CAT. Setelah disimpan Anda kembali ke halaman ujian.</p>
            )}
            {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">{error}</p>}
            {sukses && <p className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold px-4 py-3 rounded-xl">{sukses}</p>}

            <div className="flex flex-col sm:flex-row gap-6">
              {/* Foto */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="w-28 h-36 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center overflow-hidden">
                  {foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={foto} alt="Foto" className="w-full h-full object-cover" />
                    : <svg className="w-12 h-12 text-slate-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadFoto} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg border border-indigo-200 disabled:opacity-50">
                  {uploading ? "Mengunggah..." : foto ? "Ganti Foto" : "Unggah Foto"}
                </button>
                <p className="text-[10px] text-slate-400">JPG/PNG/WebP, maks 2 MB</p>
              </div>

              {/* Identitas akun (dari sekolah, tidak bisa diubah sendiri) */}
              <dl className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3 text-sm content-start">
                <div className="col-span-2"><dt className="text-[11px] font-bold uppercase text-slate-400">Nama</dt><dd className="font-bold text-slate-800">{akun.nama}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase text-slate-400">NIS / Username</dt><dd className="font-mono text-slate-700">{akun.nomorPeserta}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase text-slate-400">Kelas</dt><dd className="text-slate-700">{akun.kelas || "—"}</dd></div>
                {(akun.ruang || akun.sesi) && <div className="col-span-2"><dt className="text-[11px] font-bold uppercase text-slate-400">Ruang / Sesi Ujian</dt><dd className="text-slate-700">{akun.ruang || "—"} / {akun.sesi || "—"}</dd></div>}
                <p className="col-span-2 text-[11px] text-slate-400">Nama, NIS, dan kelas diatur oleh sekolah. Hubungi admin bila ada yang salah.</p>
              </dl>
            </div>

            <fieldset className="space-y-4">
              <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Data Pribadi</legend>
              <div>
                <label htmlFor="nik" className={labelClass}>NIK (Nomor Induk Kependudukan)</label>
                <input id="nik" type="text" required inputMode="numeric" pattern="\d{16}" title="NIK 16 digit angka" maxLength={16} value={nik}
                  onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))} placeholder="16 digit NIK" className={`${inputClass} font-mono`} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tempat" className={labelClass}>Tempat Lahir</label>
                  <input id="tempat" type="text" required value={tempatLahir} onChange={(e) => setTempatLahir(e.target.value)} placeholder="Kota kelahiran" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="tgl" className={labelClass}>Tanggal Lahir</label>
                  <input id="tgl" type="date" required value={tanggalLahir} onChange={(e) => setTanggalLahir(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="jk" className={labelClass}>Jenis Kelamin</label>
                  <select id="jk" required value={jenisKelamin} onChange={(e) => setJenisKelamin(e.target.value)} className={inputClass}>
                    <option value="" disabled>Pilih</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="hp" className={labelClass}>No. HP / WhatsApp</label>
                  <input id="hp" type="tel" required value={noHp} onChange={(e) => setNoHp(e.target.value)} placeholder="08xxxxxxxxxx" className={`${inputClass} font-mono`} />
                </div>
              </div>
              <div>
                <label htmlFor="alamat" className={labelClass}>Alamat Lengkap</label>
                <textarea id="alamat" required value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={3} placeholder="Alamat sesuai KTP/KK" className={`${inputClass} resize-y`} />
              </div>
            </fieldset>

            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-60">
                {loading ? "Menyimpan..." : lanjutUjian ? "Simpan & Lanjut ke Ujian" : "Simpan Data Diri"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
