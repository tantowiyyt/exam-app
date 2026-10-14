"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { Modal, IsiTeks, PilihTopik, kirim, toLocalInput, inputClass, labelClass } from "./ui";

// ---------- tipe ----------

export type TipeSoal = "pg" | "bs" | "isian" | "esai";
export const LABEL_TIPE: Record<TipeSoal, string> = { pg: "Pilihan ganda", bs: "Benar / Salah", isian: "Isian singkat", esai: "Esai" };
const HURUF = "ABCDEF";

export interface SoalEdit { id?: number; kunciLokal: string; tipe: TipeSoal; pertanyaan: string; opsi: string[]; kunci: string; pembahasan: string; bobot: number }
export interface KuisData {
    id?: number; judul: string; deskripsi: string; durasiMenit: number; mulai: string | null; selesai: string | null;
    maksPercobaan: number; acakSoal: boolean; tampilkanJawaban: boolean; terbit: boolean; topikId?: number | null;
}

let urut = 0;
const kunciBaru = () => `s${Date.now()}-${urut++}`;

export function soalBaru(tipe: TipeSoal): SoalEdit {
    return { kunciLokal: kunciBaru(), tipe, pertanyaan: "", opsi: tipe === "pg" ? ["", "", "", ""] : [], kunci: tipe === "bs" ? "B" : tipe === "pg" ? "0" : "", pembahasan: "", bobot: tipe === "esai" ? 10 : 1 };
}

/** Teks jawaban siswa yang mudah dibaca. */
export function teksJawaban(tipe: string, opsi: string[], j: unknown) {
    if (j === null || j === undefined || j === "") return null;
    if (tipe === "pg") { const i = Number(j); return `${HURUF[i] ?? "?"}. ${opsi[i] ?? ""}`; }
    if (tipe === "bs") return j === "B" ? "Benar" : "Salah";
    return String(j);
}

// ---------- pengaturan kuis ----------

export function FormKuis({ mapelId, awal, onClose, onSaved }: { mapelId: number; awal?: KuisData; onClose: () => void; onSaved: (id: number) => void }) {
    const { toast } = useToast();
    const [f, setF] = useState<KuisData>(awal ?? { judul: "", deskripsi: "", durasiMenit: 30, mulai: null, selesai: null, maksPercobaan: 1, acakSoal: true, tampilkanJawaban: true, terbit: false });
    const [mulai, setMulai] = useState(toLocalInput(awal?.mulai));
    const [selesai, setSelesai] = useState(toLocalInput(awal?.selesai));
    const [simpan, setSimpan] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSimpan(true);
        const body = { ...f, mapelId, mulai: mulai ? new Date(mulai).toISOString() : null, selesai: selesai ? new Date(selesai).toISOString() : null };
        const { ok, data } = await kirim("/api/lms/kuis", f.id ? "PUT" : "POST", body);
        setSimpan(false);
        if (ok) { toast(f.id ? "Pengaturan kuis disimpan" : "Kuis dibuat — sekarang tambahkan soal", "success"); onSaved(data.data.id); }
        else toast(data.message || "Gagal menyimpan", "error");
    };

    return (
        <Modal judul={f.id ? "Pengaturan Kuis" : "Buat Kuis"} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <label className="block"><span className={labelClass}>Judul</span>
                    <input value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} required maxLength={200} className={inputClass} placeholder="mis. Kuis Bab 2 — Persamaan Linear" />
                </label>
                <PilihTopik mapelId={mapelId} value={f.topikId} onChange={(topikId) => setF({ ...f, topikId })} />
                <label className="block"><span className={labelClass}>Petunjuk (opsional)</span>
                    <textarea value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} rows={3} className={`${inputClass} resize-y`} placeholder="Petunjuk pengerjaan untuk siswa." />
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block"><span className={labelClass}>Dibuka (opsional)</span>
                        <input type="datetime-local" value={mulai} onChange={(e) => setMulai(e.target.value)} className={inputClass} />
                    </label>
                    <label className="block"><span className={labelClass}>Ditutup (opsional)</span>
                        <input type="datetime-local" value={selesai} onChange={(e) => setSelesai(e.target.value)} className={inputClass} />
                    </label>
                    <label className="block"><span className={labelClass}>Durasi (menit, 0 = tanpa batas)</span>
                        <input type="number" min={0} max={600} value={f.durasiMenit} onChange={(e) => setF({ ...f, durasiMenit: Number(e.target.value) })} required className={inputClass} />
                    </label>
                    <label className="block"><span className={labelClass}>Kesempatan mengerjakan</span>
                        <input type="number" min={1} max={10} value={f.maksPercobaan} onChange={(e) => setF({ ...f, maksPercobaan: Number(e.target.value) })} required className={inputClass} />
                        <span className="text-[10px] text-slate-400">Bila lebih dari 1, nilai yang dipakai = nilai tertinggi.</span>
                    </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={f.acakSoal} onChange={(e) => setF({ ...f, acakSoal: e.target.checked })} />
                    Acak urutan soal untuk tiap siswa
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="mt-1" checked={f.tampilkanJawaban} onChange={(e) => setF({ ...f, tampilkanJawaban: e.target.checked })} />
                    <span>Tampilkan kunci jawaban & pembahasan ke siswa setelah selesai
                        <span className="block text-[11px] text-slate-400">Bila waktu tutup diisi, kunci baru terlihat setelah kuis ditutup.</span></span>
                </label>
                {f.id && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={f.terbit} onChange={(e) => setF({ ...f, terbit: e.target.checked })} />
                        Terbitkan (terlihat oleh siswa)
                    </label>
                )}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                    <button type="submit" disabled={simpan} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan"}</button>
                </div>
            </form>
        </Modal>
    );
}

// ---------- editor soal ----------

/**
 * Impor cepat dari teks:
 *   1. Pertanyaan
 *   A. pilihan
 *   *B. pilihan benar   (tanda * = kunci)
 * Soal tanpa pilihan: "Jawaban: x|y" = isian, "Jawaban: Benar/Salah" = benar-salah, tanpa jawaban = esai.
 */
export function imporTeks(teks: string): SoalEdit[] {
    const out: SoalEdit[] = [];
    const blok = teks.replace(/\r/g, "").split(/\n(?=\s*\d+[.)]\s)/);
    for (const b of blok) {
        const baris = b.split("\n").map((x) => x.trim()).filter(Boolean);
        if (!baris.length) continue;
        const tanya: string[] = [];
        const opsi: string[] = [];
        let kunci = "";
        let jawab = "";
        let bahas = "";
        for (const l of baris) {
            const o = /^(\*)?\s*([A-Fa-f])[.)]\s+(.*)$/.exec(l);
            const j = /^(jawaban|kunci)\s*:\s*(.*)$/i.exec(l);
            const p = /^pembahasan\s*:\s*(.*)$/i.exec(l);
            if (o && (opsi.length || tanya.length)) { if (o[1]) kunci = String(opsi.length); opsi.push(o[3]); }
            else if (j) jawab = j[2].trim();
            else if (p) bahas = p[1];
            else if (!opsi.length) tanya.push(l.replace(/^\d+[.)]\s*/, ""));
        }
        if (!tanya.length) continue;
        const s = soalBaru(opsi.length ? "pg" : !jawab ? "esai" : /^(benar|salah|b|s)$/i.test(jawab) ? "bs" : "isian");
        s.pertanyaan = tanya.join("\n");
        s.pembahasan = bahas;
        if (s.tipe === "pg") {
            s.opsi = opsi;
            // Kunci juga boleh ditulis "Jawaban: C"
            const huruf = HURUF.indexOf(jawab.toUpperCase());
            s.kunci = kunci || (huruf >= 0 ? String(huruf) : "0");
        } else if (s.tipe === "bs") s.kunci = /^(benar|b)$/i.test(jawab) ? "B" : "S";
        else if (s.tipe === "isian") s.kunci = jawab;
        out.push(s);
    }
    return out;
}

export function EditorSoal({ kuisId, awal, adaPercobaan, onSaved }: { kuisId: number; awal: SoalEdit[]; adaPercobaan: boolean; onSaved: () => void }) {
    const { toast } = useToast();
    const [list, setList] = useState<SoalEdit[]>(awal);
    const [ubah, setUbah] = useState(false);
    const [simpan, setSimpan] = useState(false);
    const [impor, setImpor] = useState<string | null>(null);

    const set = (i: number, v: Partial<SoalEdit>) => { setList(list.map((s, j) => (j === i ? { ...s, ...v } : s))); setUbah(true); };
    const ganti = (l: SoalEdit[]) => { setList(l); setUbah(true); };
    const pindah = (i: number, d: number) => {
        const j = i + d;
        if (j < 0 || j >= list.length) return;
        const l = [...list];
        [l[i], l[j]] = [l[j], l[i]];
        ganti(l);
    };

    const simpanSemua = async () => {
        setSimpan(true);
        const { ok, data } = await kirim(`/api/lms/kuis/${kuisId}/soal`, "PUT", { soal: list.map((s) => ({ ...s, kunciLokal: undefined })) });
        setSimpan(false);
        if (ok) { toast(data.message || "Soal disimpan", "success"); setUbah(false); onSaved(); } else toast(data.message || "Gagal menyimpan", "error");
    };

    const prosesImpor = () => {
        const hasil = imporTeks(impor ?? "");
        if (!hasil.length) { toast("Tidak ada soal yang dikenali. Periksa format.", "error"); return; }
        ganti([...list, ...hasil]);
        setImpor(null);
        toast(`${hasil.length} soal ditambahkan — periksa lalu klik Simpan Soal`, "success");
    };

    const totalBobot = list.reduce((a, s) => a + (Number(s.bobot) || 0), 0);

    return (
        <section className="space-y-4">
            {adaPercobaan && (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                    Sudah ada siswa yang mengerjakan. Perubahan kunci/bobot akan menghitung ulang nilai mereka; soal yang dihapus tidak lagi dihitung.
                </p>
            )}

            {list.length === 0 && <p className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">Belum ada soal. Tambahkan soal di bawah atau impor dari teks.</p>}

            {list.map((s, i) => (
                <div key={s.kunciLokal} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-sm flex items-center justify-center">{i + 1}</span>
                        <select value={s.tipe} aria-label={`Tipe soal ${i + 1}`} onChange={(e) => { const t = e.target.value as TipeSoal; const b = soalBaru(t); set(i, { tipe: t, opsi: s.opsi.length >= 2 ? s.opsi : b.opsi, kunci: b.kunci }); }}
                            className="text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                            {(Object.keys(LABEL_TIPE) as TipeSoal[]).map((t) => <option key={t} value={t}>{LABEL_TIPE[t]}</option>)}
                        </select>
                        <label className="text-xs text-slate-500 flex items-center gap-1">Bobot
                            <input type="number" min={1} max={100} value={s.bobot} onChange={(e) => set(i, { bobot: Number(e.target.value) })} className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm" />
                        </label>
                        <div className="ml-auto flex gap-1">
                            <button type="button" onClick={() => pindah(i, -1)} disabled={i === 0} aria-label="Naikkan" className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30">↑</button>
                            <button type="button" onClick={() => pindah(i, 1)} disabled={i === list.length - 1} aria-label="Turunkan" className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30">↓</button>
                            <button type="button" onClick={() => ganti(list.filter((_, j) => j !== i))} className="px-3 h-8 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50">Hapus</button>
                        </div>
                    </div>
                    <textarea value={s.pertanyaan} onChange={(e) => set(i, { pertanyaan: e.target.value })} rows={2} placeholder="Tulis pertanyaan..." aria-label={`Pertanyaan ${i + 1}`} className={`${inputClass} resize-y`} />

                    {s.tipe === "pg" && (
                        <div className="space-y-2">
                            {s.opsi.map((o, k) => (
                                <div key={k} className="flex items-center gap-2">
                                    <label className={`shrink-0 w-8 h-8 rounded-full border-2 font-bold text-xs flex items-center justify-center cursor-pointer ${s.kunci === String(k) ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-slate-500"}`} title="Tandai sebagai jawaban benar">
                                        <input type="radio" className="sr-only" name={`kunci-${s.kunciLokal}`} checked={s.kunci === String(k)} onChange={() => set(i, { kunci: String(k) })} />
                                        {HURUF[k]}
                                    </label>
                                    <input value={o} onChange={(e) => set(i, { opsi: s.opsi.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`Pilihan ${HURUF[k]}`} aria-label={`Pilihan ${HURUF[k]} soal ${i + 1}`} className={inputClass} />
                                    {s.opsi.length > 2 && (
                                        <button type="button" aria-label={`Hapus pilihan ${HURUF[k]}`} onClick={() => {
                                            const kunci = Number(s.kunci);
                                            set(i, { opsi: s.opsi.filter((_, j) => j !== k), kunci: String(kunci === k ? 0 : kunci > k ? kunci - 1 : kunci) });
                                        }} className="text-slate-400 hover:text-red-600 px-1">&times;</button>
                                    )}
                                </div>
                            ))}
                            {s.opsi.length < 6 && <button type="button" onClick={() => set(i, { opsi: [...s.opsi, ""] })} className="text-xs font-bold text-indigo-600 hover:underline">+ Pilihan</button>}
                            <p className="text-[10px] text-slate-400">Klik huruf untuk menandai jawaban yang benar (hijau).</p>
                        </div>
                    )}
                    {s.tipe === "bs" && (
                        <div className="flex gap-4 text-sm">
                            {[["B", "Benar"], ["S", "Salah"]].map(([v, l]) => (
                                <label key={v} className="flex items-center gap-2"><input type="radio" name={`kunci-${s.kunciLokal}`} checked={s.kunci === v} onChange={() => set(i, { kunci: v })} /> Kunci: {l}</label>
                            ))}
                        </div>
                    )}
                    {s.tipe === "isian" && (
                        <label className="block"><span className={labelClass}>Jawaban yang diterima</span>
                            <input value={s.kunci} onChange={(e) => set(i, { kunci: e.target.value })} className={inputClass} placeholder="mis. Jakarta | DKI Jakarta" />
                            <span className="text-[10px] text-slate-400">Pisahkan beberapa jawaban benar dengan tanda |. Huruf besar/kecil & spasi berlebih diabaikan.</span>
                        </label>
                    )}
                    {s.tipe === "esai" && <p className="text-xs text-slate-500">Jawaban esai dinilai manual oleh guru (0 sampai bobot soal).</p>}

                    <details className="text-sm" open={!!s.pembahasan}>
                        <summary className="text-xs font-bold text-slate-500 cursor-pointer">Pembahasan (opsional)</summary>
                        <textarea value={s.pembahasan} onChange={(e) => set(i, { pembahasan: e.target.value })} rows={2} placeholder="Penjelasan jawaban yang ditampilkan setelah kuis selesai" className={`${inputClass} resize-y mt-2`} />
                    </details>
                </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-dashed border-slate-300 p-4">
                <span className="text-xs font-bold text-slate-500 mr-1">Tambah soal:</span>
                {(Object.keys(LABEL_TIPE) as TipeSoal[]).map((t) => (
                    <button key={t} type="button" onClick={() => ganti([...list, soalBaru(t)])} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-xs font-bold text-slate-700">+ {LABEL_TIPE[t]}</button>
                ))}
                <button type="button" onClick={() => setImpor("")} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-xs font-bold text-slate-700">Impor dari teks</button>
            </div>

            <div className="sticky bottom-0 bg-slate-100/95 backdrop-blur py-3 flex items-center gap-3">
                <p className="text-xs text-slate-500 flex-1">{list.length} soal · total bobot {totalBobot}{ubah && <span className="text-amber-600 font-bold"> · belum disimpan</span>}</p>
                <button type="button" onClick={simpanSemua} disabled={simpan || !ubah} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan Soal"}</button>
            </div>

            {impor !== null && (
                <Modal judul="Impor Soal dari Teks" onClose={() => setImpor(null)}>
                    <div className="space-y-3">
                        <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap text-slate-600">{`1. Ibu kota Indonesia adalah ...
A. Bandung
*B. Jakarta
C. Surabaya
Pembahasan: Jakarta adalah ibu kota.

2. Air mendidih pada 100°C di permukaan laut.
Jawaban: Benar

3. Hasil dari 7 x 8 = ...
Jawaban: 56

4. Jelaskan proses fotosintesis!`}</pre>
                        <p className="text-[11px] text-slate-500">Tanda * di depan pilihan = kunci (atau tulis &quot;Jawaban: B&quot;). Tanpa pilihan: &quot;Jawaban: Benar/Salah&quot; = benar-salah, jawaban lain = isian, tanpa jawaban = esai.</p>
                        <textarea value={impor} onChange={(e) => setImpor(e.target.value)} rows={10} className={`${inputClass} font-mono text-xs`} placeholder="Tempel soal di sini..." aria-label="Teks soal" />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setImpor(null)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold">Batal</button>
                            <button type="button" onClick={prosesImpor} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Tambahkan</button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}

// ---------- mengerjakan (siswa) ----------

interface SoalSiswa { id: number; tipe: TipeSoal; pertanyaan: string; opsi: string[]; bobot: number }
interface Sesi { percobaan: { id: number; ke: number; batas: string | null }; soal: SoalSiswa[]; jawaban: Record<string, string>; serverNow: string }

function fmtSisa(ms: number) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const j = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), d = t % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return j ? `${j}:${pad(m)}:${pad(d)}` : `${pad(m)}:${pad(d)}`;
}

export function KerjakanKuis({ kuisId, judul, onSelesai }: { kuisId: number; judul: string; onSelesai: (msg: string) => void }) {
    const { toast } = useToast();
    const [sesi, setSesi] = useState<Sesi | null>(null);
    const [gagal, setGagal] = useState("");
    const [jawaban, setJawaban] = useState<Record<string, string>>({});
    const [no, setNo] = useState(0);
    const [status, setStatus] = useState<"tersimpan" | "menyimpan" | "belum" | "gagal">("tersimpan");
    const [sisa, setSisa] = useState<number | null>(null);
    const [kirimProses, setKirimProses] = useState(false);
    const selisih = useRef(0); // jam server - jam perangkat
    const jawabanRef = useRef(jawaban);
    const selesaiRef = useRef(false);
    const kirimRef = useRef(false);

    useEffect(() => {
        let ignore = false;
        kirim(`/api/lms/kuis/${kuisId}/kerjakan`, "POST", { aksi: "mulai" }).then(({ ok, data }) => {
            if (ignore) return;
            if (!ok) { setGagal(data.message || "Gagal membuka kuis"); return; }
            selisih.current = new Date(data.serverNow).getTime() - Date.now();
            jawabanRef.current = data.jawaban ?? {};
            setJawaban(data.jawaban ?? {});
            setSesi(data);
        });
        return () => { ignore = true; };
    }, [kuisId]);

    const simpan = useCallback(async () => {
        if (selesaiRef.current) return;
        setStatus("menyimpan");
        const { ok, data } = await kirim(`/api/lms/kuis/${kuisId}/kerjakan`, "POST", { aksi: "simpan", jawaban: jawabanRef.current });
        if (ok) setStatus("tersimpan");
        else if (data.message?.includes("habis")) { selesaiRef.current = true; onSelesai(data.message); }
        else setStatus("gagal");
    }, [kuisId, onSelesai]);

    const kumpulkan = useCallback(async (otomatis = false) => {
        if (selesaiRef.current || kirimRef.current) return;
        kirimRef.current = true;
        setKirimProses(true);
        const { ok, data } = await kirim(`/api/lms/kuis/${kuisId}/kerjakan`, "POST", { aksi: "selesai", jawaban: jawabanRef.current });
        kirimRef.current = false;
        setKirimProses(false);
        if (ok || data.message?.includes("habis")) {
            selesaiRef.current = true;
            onSelesai(ok ? (otomatis ? "Waktu habis — jawaban otomatis dikumpulkan" : "Jawaban dikumpulkan") : data.message);
        } else toast(data.message || "Gagal mengumpulkan, coba lagi", "error");
    }, [kuisId, onSelesai, toast]);

    // Simpan otomatis 1,5 detik setelah jawaban berubah
    useEffect(() => {
        if (status !== "belum") return;
        const t = setTimeout(simpan, 1500);
        return () => clearTimeout(t);
    }, [jawaban, status, simpan]);

    // Hitung mundur; waktu habis -> kumpulkan otomatis
    useEffect(() => {
        const batas = sesi?.percobaan.batas;
        if (!batas) return;
        const tick = () => {
            const ms = new Date(batas).getTime() - (Date.now() + selisih.current);
            setSisa(ms);
            if (ms <= 0) kumpulkan(true);
        };
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [sesi, kumpulkan]);

    // Peringatan saat menutup halaman dengan jawaban belum tersimpan
    useEffect(() => {
        const h = (e: BeforeUnloadEvent) => { if (status === "belum" || status === "menyimpan") e.preventDefault(); };
        window.addEventListener("beforeunload", h);
        return () => window.removeEventListener("beforeunload", h);
    }, [status]);

    const jawab = (id: number, v: string) => {
        const baru = { ...jawabanRef.current, [id]: v };
        jawabanRef.current = baru;
        setJawaban(baru);
        setStatus("belum");
    };

    if (gagal) return <p className="bg-white rounded-2xl border border-red-200 p-6 text-center text-red-600 font-semibold">{gagal}</p>;
    if (!sesi) return <p className="text-slate-500">Membuka kuis...</p>;
    if (!sesi.soal.length) return <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-500">Kuis ini belum berisi soal.</p>;

    const s = sesi.soal[no];
    const terjawab = sesi.soal.filter((x) => (jawaban[x.id] ?? "").trim() !== "").length;
    const konfirmasi = () => {
        const kosong = sesi.soal.length - terjawab;
        if (confirm(kosong ? `Masih ada ${kosong} soal belum dijawab. Kumpulkan sekarang?` : "Kumpulkan jawaban sekarang? Jawaban tidak dapat diubah lagi.")) kumpulkan();
    };

    return (
        <div className="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
            <div className="space-y-4 order-2 lg:col-start-1 lg:row-start-1 lg:row-span-2">
                <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-black text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1">Soal {no + 1} / {sesi.soal.length}</span>
                        <span className="text-[11px] text-slate-400">{LABEL_TIPE[s.tipe]} · bobot {s.bobot}</span>
                    </div>
                    <IsiTeks teks={s.pertanyaan} className="text-slate-800 text-base" />
                    <div className="mt-4 space-y-2">
                        {s.tipe === "pg" && s.opsi.map((o, k) => {
                            const pilih = jawaban[s.id] === String(k);
                            return (
                                <label key={k} className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer ${pilih ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                                    <input type="radio" className="sr-only" name={`j-${s.id}`} checked={pilih} onChange={() => jawab(s.id, String(k))} />
                                    <span className={`shrink-0 w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center ${pilih ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{HURUF[k]}</span>
                                    <span className="text-sm text-slate-700 pt-1 whitespace-pre-wrap">{o}</span>
                                </label>
                            );
                        })}
                        {s.tipe === "bs" && (
                            <div className="grid grid-cols-2 gap-2">
                                {[["B", "Benar"], ["S", "Salah"]].map(([v, l]) => (
                                    <label key={v} className={`rounded-xl border-2 px-3 py-3 text-center font-bold cursor-pointer ${jawaban[s.id] === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                                        <input type="radio" className="sr-only" name={`j-${s.id}`} checked={jawaban[s.id] === v} onChange={() => jawab(s.id, v)} />{l}
                                    </label>
                                ))}
                            </div>
                        )}
                        {s.tipe === "isian" && <input value={jawaban[s.id] ?? ""} onChange={(e) => jawab(s.id, e.target.value)} maxLength={500} placeholder="Tulis jawaban singkat" aria-label="Jawaban" className={inputClass} />}
                        {s.tipe === "esai" && <textarea value={jawaban[s.id] ?? ""} onChange={(e) => jawab(s.id, e.target.value)} rows={8} maxLength={10000} placeholder="Tulis jawaban Anda" aria-label="Jawaban" className={`${inputClass} resize-y`} />}
                    </div>
                </article>
                <div className="flex items-center gap-2">
                    <button onClick={() => setNo(no - 1)} disabled={no === 0} className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-sm font-bold text-slate-700 disabled:opacity-40">&larr; Sebelumnya</button>
                    <span className="flex-1" />
                    {no < sesi.soal.length - 1
                        ? <button onClick={() => setNo(no + 1)} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Berikutnya &rarr;</button>
                        : <button onClick={konfirmasi} disabled={kirimProses} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">Kumpulkan</button>}
                </div>
            </div>

            <aside className="contents">
                <div className="order-1 lg:col-start-2 lg:row-start-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">{judul} · percobaan {sesi.percobaan.ke}</p>
                    {sisa !== null && (
                        <p className={`text-3xl font-black font-mono mt-1 ${sisa < 60000 ? "text-red-600 animate-pulse" : sisa < 300000 ? "text-amber-600" : "text-slate-800"}`} aria-live="polite">{fmtSisa(sisa)}</p>
                    )}
                    {sisa === null && <p className="text-sm font-bold text-slate-600 mt-1">Tanpa batas waktu</p>}
                    <p className={`text-[11px] mt-1 font-semibold ${status === "gagal" ? "text-red-600" : status === "tersimpan" ? "text-emerald-600" : "text-slate-400"}`}>
                        {status === "tersimpan" ? "✓ Jawaban tersimpan" : status === "menyimpan" ? "Menyimpan..." : status === "gagal" ? "Gagal menyimpan — periksa koneksi" : "Belum tersimpan"}
                    </p>
                </div>
                <div className="order-3 lg:col-start-2 lg:row-start-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-bold text-slate-600 mb-2">{terjawab}/{sesi.soal.length} terjawab</p>
                    <div className="grid grid-cols-8 lg:grid-cols-5 gap-1.5">
                        {sesi.soal.map((x, i) => (
                            <button key={x.id} onClick={() => setNo(i)} aria-label={`Soal ${i + 1}`}
                                className={`h-8 rounded-lg text-xs font-bold ${i === no ? "ring-2 ring-indigo-500 " : ""}${(jawaban[x.id] ?? "").trim() ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{i + 1}</button>
                        ))}
                    </div>
                    <button onClick={konfirmasi} disabled={kirimProses} className="mt-3 w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">{kirimProses ? "Mengumpulkan..." : "Kumpulkan"}</button>
                </div>
            </aside>
        </div>
    );
}

// ---------- rincian jawaban ----------

interface Rincian {
    kelola: boolean;
    kunciTerbuka: boolean;
    percobaan: { id: number; ke: number; mulaiAt: string; selesaiAt: string | null; nilai: number | null; skor: number | null; skorMaks: number | null; perluDinilai: boolean; siswa: { nama: string; nomorPeserta: string } };
    soal: { id: number; tipe: TipeSoal; pertanyaan: string; opsi: string[]; bobot: number; jawaban: unknown; poin?: number | null; kunci?: string; pembahasan?: string }[];
}

export function RincianPercobaan({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged?: () => void }) {
    const { toast } = useToast();
    const [d, setD] = useState<Rincian | null>(null);
    const [gagal, setGagal] = useState("");
    const [esai, setEsai] = useState<Record<number, string>>({});
    const [simpan, setSimpan] = useState(false);

    const muat = useCallback(async () => {
        const res = await fetch(`/api/lms/percobaan/${id}`);
        const data = await res.json().catch(() => ({}));
        return res.ok ? { data: data as Rincian } : { error: (data.message as string) || "Gagal memuat" };
    }, [id]);

    const terapkan = useCallback((r: { data?: Rincian; error?: string }) => {
        if (!r.data) { setGagal(r.error ?? ""); return; }
        setD(r.data);
        setEsai(Object.fromEntries(r.data.soal.filter((s) => s.tipe === "esai").map((s) => [s.id, s.poin === null || s.poin === undefined ? "" : String(s.poin)])));
    }, []);

    useEffect(() => {
        let ignore = false;
        muat().then((r) => { if (!ignore) terapkan(r); });
        return () => { ignore = true; };
    }, [muat, terapkan]);

    const simpanEsai = async () => {
        setSimpan(true);
        const { ok, data } = await kirim(`/api/lms/percobaan/${id}`, "PUT", { skorEsai: Object.fromEntries(Object.entries(esai).map(([k, v]) => [k, v === "" ? null : Number(v)])) });
        setSimpan(false);
        if (ok) { toast(`Nilai disimpan: ${data.data.nilai}`, "success"); terapkan(await muat()); onChanged?.(); } else toast(data.message || "Gagal menyimpan", "error");
    };

    const hapus = async () => {
        if (!confirm("Hapus percobaan ini? Jawaban & nilainya hilang dan siswa mendapat kesempatan mengerjakan lagi.")) return;
        const { ok, data } = await kirim(`/api/lms/percobaan/${id}`, "DELETE");
        toast(data.message || (ok ? "Dihapus" : "Gagal"), ok ? "success" : "error");
        if (ok) { onChanged?.(); onClose(); }
    };

    const p = d?.percobaan;
    return (
        <Modal judul={p ? `${p.siswa.nama} — percobaan ${p.ke}` : "Rincian Jawaban"} onClose={onClose}>
            {gagal && <p className="text-red-600 font-semibold">{gagal}</p>}
            {!d && !gagal && <p className="text-slate-500">Memuat...</p>}
            {d && p && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 bg-slate-50 rounded-xl p-3">
                        <div className="flex-1 text-xs text-slate-500">
                            {p.selesaiAt ? <>Selesai {new Date(p.selesaiAt).toLocaleString("id-ID")}</> : <span className="text-amber-600 font-bold">Sedang mengerjakan</span>}
                            {p.skorMaks !== null && <> · skor {p.skor}/{p.skorMaks}</>}
                            {p.perluDinilai && <span className="block text-fuchsia-700 font-bold">Ada jawaban esai yang belum dinilai</span>}
                        </div>
                        {p.nilai !== null && <p className="text-3xl font-black text-indigo-700">{p.nilai}</p>}
                    </div>
                    {!d.kunciTerbuka && <p className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-3 py-2">Kunci jawaban belum ditampilkan guru (atau baru terlihat setelah kuis ditutup).</p>}

                    <ol className="space-y-3">
                        {d.soal.map((s, i) => {
                            const jaw = teksJawaban(s.tipe, s.opsi, s.jawaban);
                            const benar = s.poin !== undefined && s.poin !== null && s.poin >= s.bobot;
                            const warna = s.poin === undefined ? "border-slate-200" : s.poin === null ? "border-fuchsia-300" : benar ? "border-emerald-300" : s.poin > 0 ? "border-amber-300" : "border-red-300";
                            return (
                                <li key={s.id} className={`rounded-xl border-2 ${warna} p-3`}>
                                    <div className="flex items-start gap-2">
                                        <span className="shrink-0 text-xs font-black text-slate-500 mt-0.5">{i + 1}.</span>
                                        <IsiTeks teks={s.pertanyaan} className="text-sm text-slate-800 flex-1" />
                                        {s.poin !== undefined && <span className="shrink-0 text-xs font-bold text-slate-600">{s.poin === null ? "?" : s.poin}/{s.bobot}</span>}
                                    </div>
                                    <div className="mt-2 pl-5 space-y-1 text-sm">
                                        <p><span className="text-slate-400 text-xs">Jawaban: </span>{jaw === null ? <i className="text-slate-400">tidak dijawab</i> : <span className="whitespace-pre-wrap text-slate-700">{jaw}</span>}</p>
                                        {d.kunciTerbuka && s.tipe !== "esai" && s.kunci !== undefined && (
                                            <p className="text-emerald-700"><span className="text-slate-400 text-xs">Kunci: </span>{s.tipe === "isian" ? s.kunci.split("|").join(" / ") : teksJawaban(s.tipe, s.opsi, s.kunci)}</p>
                                        )}
                                        {s.pembahasan && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5 whitespace-pre-wrap"><b>Pembahasan:</b> {s.pembahasan}</p>}
                                        {d.kelola && s.tipe === "esai" && p.selesaiAt && (
                                            <label className="flex items-center gap-2 text-xs font-bold text-fuchsia-700">Nilai esai
                                                <input type="number" min={0} max={s.bobot} step={0.5} value={esai[s.id] ?? ""} onChange={(e) => setEsai({ ...esai, [s.id]: e.target.value })}
                                                    className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-800" aria-label={`Nilai esai soal ${i + 1}`} /> / {s.bobot}
                                            </label>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>

                    {d.kelola && (
                        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-100">
                            <button onClick={hapus} className="px-3 py-2 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50">Hapus percobaan (kerjakan ulang)</button>
                            {d.soal.some((s) => s.tipe === "esai") && p.selesaiAt && (
                                <button onClick={simpanEsai} disabled={simpan} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-bold disabled:opacity-50">{simpan ? "Menyimpan..." : "Simpan Nilai Esai"}</button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
