"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState("");
  const [nomorPeserta, setNomorPeserta] = useState("");
  const [foto, setFoto] = useState("");
  const [nik, setNik] = useState("");
  const [tempatLahir, setTempatLahir] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [jenisKelamin, setJenisKelamin] = useState("");
  const [alamat, setAlamat] = useState("");
  const [noHp, setNoHp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (data.profilLengkap && data.ruang) {
            router.push("/dashboard");
            return;
          }
          setNama(data.nama);
          setNomorPeserta(data.nomorPeserta);
          setFoto(data.foto || "");
        } else {
          router.push("/login");
        }
      } catch {
        router.push("/login");
      } finally {
        setFetching(false);
      }
    };
    fetchUser();
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

      if (res.ok) {
        setFoto(data.url);
      } else {
        setError(data.message || "Gagal upload foto");
      }
    } catch {
      setError("Gagal upload foto");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto, nik, tempatLahir, tanggalLahir, jenisKelamin, alamat, noHp }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError(data.message || "Gagal menyimpan data.");
      }
    } catch {
      setError("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center">
        <div className="text-white text-sm">Memuat data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-slate-900 py-8 px-4 font-sans">
      <div className="max-w-lg mx-auto">
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl shadow-indigo-900/20">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-linear-to-tr from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mb-1">Lengkapi Data Diri</h1>
            <p className="text-sm text-slate-400">Isi data Anda untuk keperluan ujian</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm font-semibold px-4 py-3 rounded-xl mb-6 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            {/* Foto Profil */}
            <div className="text-center">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Foto Identitas</label>
              <div className="flex flex-col items-center gap-3">
                <div className="w-28 h-36 bg-slate-800 border-2 border-dashed border-slate-600 rounded-xl flex items-center justify-center overflow-hidden">
                  {foto ? (
                    <img src={foto} alt="Foto Profil" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-12 h-12 text-slate-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadFoto} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 px-4 py-2 rounded-lg border border-blue-500/30 transition-all disabled:opacity-50">
                  {uploading ? "Mengupload..." : foto ? "Ganti Foto" : "Upload Foto"}
                </button>
                <p className="text-[10px] text-slate-500">Format: JPG/PNG/WebP, Maks 2MB</p>
              </div>
            </div>

            {/* Data Pribadi */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data Pribadi</p>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">NIK (Nomor Induk Kependudukan)</label>
                <input type="text" required inputMode="numeric" pattern="\d{16}" title="NIK 16 digit angka" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))}
                  placeholder="16 digit NIK"
                  className="w-full bg-slate-950/50 border border-slate-800 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600 font-mono text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Tempat Lahir</label>
                  <input type="text" required value={tempatLahir} onChange={(e) => setTempatLahir(e.target.value)}
                    placeholder="Kota kelahiran"
                    className="w-full bg-slate-950/50 border border-slate-800 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Tanggal Lahir</label>
                  <input type="date" required value={tanggalLahir} onChange={(e) => setTanggalLahir(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Jenis Kelamin</label>
                <select required value={jenisKelamin} onChange={(e) => setJenisKelamin(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm">
                  <option value="" disabled>Pilih</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Alamat Lengkap</label>
                <textarea required value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={3}
                  placeholder="Alamat sesuai KTP"
                  className="w-full bg-slate-950/50 border border-slate-800 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600 text-sm resize-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">No. HP / WhatsApp</label>
                <input type="tel" required value={noHp} onChange={(e) => setNoHp(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="w-full bg-slate-950/50 border border-slate-800 text-white px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600 font-mono text-sm" />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center bg-slate-800/20 border border-slate-700/30 rounded-xl px-4 py-3">
              Ruang, sesi, dan jadwal ujian akan ditentukan otomatis oleh sistem setelah Anda menyimpan data diri.
            </p>

            <button type="submit" disabled={loading}
              className="w-full bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25 disabled:opacity-70 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Menyimpan...
                </span>
              ) : "Simpan & Lanjutkan"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
