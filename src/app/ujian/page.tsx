"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface SoalItem {
    id: number;
    pertanyaan: string;
    opsiA: string;
    opsiB: string;
    opsiC: string;
    opsiD: string;
    mataPelajaran: string;
    bagian: string | null;
}

interface GrupSoal {
    nama: string;
    durasiMenit: number | null;
    jumlah: number;
    terkunci: boolean;
    selesai: boolean;
    soal: SoalItem[];
}

interface HasilUjian {
    totalSoal: number;
    jumlahBenar: number;
    jumlahSalah: number;
    nilaiAkhir: number;
    skorPerMapel?: Record<string, number>;
    skorPerBagian?: Record<string, number>;
}

type StatusHalaman = "loading" | "ok" | "belum" | "jadwal_selesai" | "kosong" | "sudah" | "bukan_kelas" | "tidak_ada";
type StatusSimpan = "tersimpan" | "menyimpan" | "gagal";

const GROUP_COLORS = [
    { dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/30",       text: "text-blue-600",    border: "border-blue-200 dark:border-blue-800",       activeBg: "bg-blue-600" },
    { dot: "bg-purple-500",  bg: "bg-purple-50 dark:bg-purple-950/30",   text: "text-purple-600",  border: "border-purple-200 dark:border-purple-800",   activeBg: "bg-purple-600" },
    { dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/30",     text: "text-amber-600",   border: "border-amber-200 dark:border-amber-800",     activeBg: "bg-amber-600" },
    { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-600", border: "border-emerald-200 dark:border-emerald-800", activeBg: "bg-emerald-600" },
    { dot: "bg-rose-500",    bg: "bg-rose-50 dark:bg-rose-950/30",       text: "text-rose-600",    border: "border-rose-200 dark:border-rose-800",       activeBg: "bg-rose-600" },
    { dot: "bg-cyan-500",    bg: "bg-cyan-50 dark:bg-cyan-950/30",       text: "text-cyan-600",    border: "border-cyan-200 dark:border-cyan-800",       activeBg: "bg-cyan-600" },
];

export default function HalamanUjian() {
    const router = useRouter();
    const { toast } = useToast();
    const [status, setStatus] = useState<StatusHalaman>("loading");
    const [grupSoal, setGrupSoal] = useState<GrupSoal[]>([]);
    const [flatSoal, setFlatSoal] = useState<SoalItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [jawabanPeserta, setJawabanPeserta] = useState<Record<number, string>>({});
    const [raguSet, setRaguSet] = useState<Set<number>>(new Set());

    const [peserta, setPeserta] = useState({ nama: "Loading...", nomorPeserta: "-", ruang: "-", sesi: "-" });
    const [hasilUjian, setHasilUjian] = useState<HasilUjian | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const csrfRef = useRef("");

    // Waktu: tenggat ditentukan server; offset menyamakan jam perangkat dengan jam server
    const [tenggat, setTenggat] = useState<number | null>(null);
    const [clockOffset, setClockOffset] = useState(0);
    const [sisaWaktu, setSisaWaktu] = useState(0);
    const [jadwalMulai, setJadwalMulai] = useState<string | null>(null);
    const [kelasUjian, setKelasUjian] = useState("");
    const [sekarang, setSekarang] = useState(0);
    const [berbagian, setBerbagian] = useState(false);
    const [tahap, setTahap] = useState(0);
    const [jumlahTahap, setJumlahTahap] = useState(1);
    const [pindahTahap, setPindahTahap] = useState(false);

    const [statusSimpan, setStatusSimpan] = useState<StatusSimpan>("tersimpan");
    const dirtyRef = useRef(false);

    const [pelanggaranCount, setPelanggaranCount] = useState(0);
    const [showPelanggaranWarning, setShowPelanggaranWarning] = useState(false);
    const MAX_PELANGGARAN = 5;

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [openSubjects, setOpenSubjects] = useState<Record<string, boolean>>({});

    const ujianBerjalan = status === "ok" && !hasilUjian && !submitting && tenggat !== null;

    /** POST JSON dengan token CSRF; token diperbarui otomatis bila kedaluwarsa. */
    const kirim = useCallback(async (url: string, body: unknown, keepalive = false) => {
        const post = () => fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrfRef.current },
            body: JSON.stringify(body),
            keepalive,
        });
        let res = await post();
        if (res.status === 403) {
            const c = await fetch("/api/csrf");
            if (c.ok) {
                csrfRef.current = (await c.json()).csrfToken;
                res = await post();
            }
        }
        return res;
    }, []);

    const muatSoal = useCallback(async () => {
        const res = await fetch("/api/ujian");
        const data = await res.json();
        if (res.status === 409) { setStatus("sudah"); return; }
        if (!res.ok) { toast(data.message || "Gagal memuat soal", "error"); return; }

        if (data.serverNow) setClockOffset(data.serverNow - Date.now());
        if (data.status === "belum") { setJadwalMulai(data.jadwalMulai); setStatus("belum"); return; }
        if (data.status === "jadwal_selesai") { setStatus("jadwal_selesai"); return; }
        if (data.status === "kosong") { setStatus("kosong"); return; }
        if (data.status === "tidak_ada") { setStatus("tidak_ada"); return; }
        if (data.status === "bukan_kelas") { setKelasUjian(data.kelas); setStatus("bukan_kelas"); return; }
        if (data.status === "selesai_otomatis") {
            setHasilUjian(data.hasil);
            setStatus("ok");
            toast("Waktu ujian telah habis. Jawaban tersimpan sudah dinilai otomatis.", "warning");
            return;
        }

        const groups: GrupSoal[] = data.groups || [];
        const sesi = data.sesi;
        setGrupSoal(groups);
        setFlatSoal(groups.flatMap((g) => g.soal));
        setCurrentIndex(0);
        setOpenSubjects(Object.fromEntries(groups.map((g) => [g.nama, !g.terkunci && g.soal.length > 0])));
        setJawabanPeserta(Object.fromEntries(Object.entries(sesi.jawaban || {}).map(([k, v]) => [Number(k), v as string])));
        setRaguSet(new Set<number>(sesi.ragu || []));
        setTenggat(sesi.tenggat);
        setBerbagian(sesi.berbagian);
        setTahap(sesi.tahap);
        setJumlahTahap(sesi.jumlahTahap);
        dirtyRef.current = false;
        setStatusSimpan("tersimpan");
        setStatus("ok");
    }, [toast]);

    const handleSelesai = useCallback(async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await kirim("/api/ujian/submit", { jawabanPeserta });
            const data = await res.json();
            if (res.ok) {
                setHasilUjian(data);
            } else if (res.status === 409) {
                // Sudah dinilai di server (otomatis atau oleh pengawas)
                await muatSoal();
                setSubmitting(false);
            } else {
                toast(data.message || "Gagal mengirimkan jawaban", "error");
                setSubmitting(false);
            }
        } catch {
            toast("Terjadi kesalahan koneksi saat mengirim jawaban. Jawaban yang sudah tersimpan tetap aman.", "error");
            setSubmitting(false);
        }
    }, [jawabanPeserta, submitting, toast, kirim, muatSoal]);

    const handleLanjutBagian = useCallback(async (otomatis = false) => {
        if (pindahTahap) return;
        if (!otomatis && !confirm("Lanjut ke bagian berikutnya? Anda TIDAK dapat kembali ke bagian ini.")) return;
        setPindahTahap(true);
        try {
            if (!otomatis) {
                const res = await kirim("/api/ujian/lanjut", { dariTahap: tahap, jawaban: jawabanPeserta, ragu: Array.from(raguSet) });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    toast(data.message || "Gagal pindah bagian", "error");
                }
            }
            await muatSoal();
            if (otomatis) toast("Waktu bagian ini habis. Lanjut ke bagian berikutnya.", "warning");
        } finally {
            setPindahTahap(false);
        }
    }, [pindahTahap, kirim, tahap, jawabanPeserta, raguSet, muatSoal, toast]);

    const logPelanggaran = useCallback(async (jenis: string, keterangan?: string) => {
        try {
            const res = await fetch("/api/ujian/pelanggaran", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jenis, keterangan }),
            });
            if (res.ok) {
                const data = await res.json();
                setPelanggaranCount(data.totalPelanggaran);
                setShowPelanggaranWarning(true);
                setTimeout(() => setShowPelanggaranWarning(false), 3000);
                if (data.totalPelanggaran >= MAX_PELANGGARAN) {
                    toast("Terlalu banyak pelanggaran! Ujian akan diakhiri otomatis.", "error");
                    handleSelesai();
                }
            }
        } catch {}
    }, [handleSelesai, toast]);

    // Muat peserta, token CSRF & soal
    useEffect(() => {
        let ignore = false;
        Promise.all([fetch("/api/me"), fetch("/api/csrf")]).then(async ([meRes, csrfRes]) => {
            if (ignore) return;
            if (!meRes.ok) { router.push("/login"); return; }
            const me = await meRes.json();
            setPeserta({ nama: me.nama || "Peserta", nomorPeserta: me.nomorPeserta || "-", ruang: me.ruang || "-", sesi: me.sesi || "-" });
            if (csrfRes.ok) csrfRef.current = (await csrfRes.json()).csrfToken;
            if (me.sudahUjian && me.role !== "ADMIN") { setStatus("sudah"); return; }
            await muatSoal();
        }).catch(() => { if (!ignore) toast("Gagal terhubung ke server", "error"); });
        return () => { ignore = true; };
    }, [router, muatSoal, toast]);

    // Ruang tunggu: hitung mundur & mulai otomatis saat jadwal tiba
    useEffect(() => {
        if (status !== "belum" || !jadwalMulai) return;
        const t = setInterval(() => {
            setSekarang(Date.now());
            if (Date.now() + clockOffset >= new Date(jadwalMulai).getTime()) {
                clearInterval(t);
                muatSoal();
            }
        }, 1000);
        return () => clearInterval(t);
    }, [status, jadwalMulai, clockOffset, muatSoal]);

    // Simpan otomatis ke server (debounce)
    const simpanSekarang = useCallback(async (keepalive = false) => {
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        setStatusSimpan("menyimpan");
        try {
            const res = await kirim("/api/ujian/jawaban", { jawaban: jawabanPeserta, ragu: Array.from(raguSet) }, keepalive);
            if (res.ok) {
                const data = await res.json();
                setTenggat(data.tenggat);
                setClockOffset(data.serverNow - Date.now());
                if (data.tahap !== tahap) muatSoal();
                setStatusSimpan(dirtyRef.current ? "menyimpan" : "tersimpan");
            } else if (res.status === 409) {
                muatSoal();
            } else {
                dirtyRef.current = true;
                setStatusSimpan("gagal");
            }
        } catch {
            dirtyRef.current = true;
            setStatusSimpan("gagal");
        }
    }, [kirim, jawabanPeserta, raguSet, tahap, muatSoal]);

    useEffect(() => {
        if (!ujianBerjalan || !dirtyRef.current) return;
        const t = setTimeout(() => simpanSekarang(), 800);
        return () => clearTimeout(t);
    }, [ujianBerjalan, simpanSekarang]);

    // Coba ulang penyimpanan yang gagal (mis. jaringan putus) tiap 10 detik
    useEffect(() => {
        if (!ujianBerjalan || statusSimpan !== "gagal") return;
        const t = setInterval(() => simpanSekarang(), 10000);
        return () => clearInterval(t);
    }, [ujianBerjalan, statusSimpan, simpanSekarang]);

    // Simpan saat halaman ditutup / dimuat ulang
    useEffect(() => {
        if (!ujianBerjalan) return;
        const onUnload = () => { simpanSekarang(true); };
        window.addEventListener("pagehide", onUnload);
        return () => window.removeEventListener("pagehide", onUnload);
    }, [ujianBerjalan, simpanSekarang]);

    // Timer berdasarkan tenggat server
    useEffect(() => {
        if (!ujianBerjalan || tenggat === null) return;
        const update = () => {
            const remaining = Math.max(0, tenggat - (Date.now() + clockOffset));
            setSisaWaktu(Math.ceil(remaining / 1000));
            if (remaining <= 0) {
                clearInterval(t);
                if (berbagian && tahap < jumlahTahap - 1) {
                    handleLanjutBagian(true);
                } else {
                    toast("Waktu ujian habis! Jawaban Anda akan otomatis dikumpulkan.", "warning");
                    handleSelesai();
                }
            }
        };
        const t = setInterval(update, 1000);
        const first = setTimeout(update, 0);
        return () => { clearInterval(t); clearTimeout(first); };
    }, [ujianBerjalan, tenggat, clockOffset, berbagian, tahap, jumlahTahap, handleSelesai, handleLanjutBagian, toast]);

    useEffect(() => {
        if (!ujianBerjalan) return;
        const handleVisibilityChange = () => { if (document.hidden) logPelanggaran("TAB_SWITCH", "Peserta berpindah tab/window"); };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [ujianBerjalan, logPelanggaran]);

    useEffect(() => {
        if (!ujianBerjalan) return;
        const preventAction = (e: Event, jenis: string) => { e.preventDefault(); logPelanggaran(jenis); return false; };
        const handleContextMenu = (e: MouseEvent) => preventAction(e, "RIGHT_CLICK");
        const handleCopy = (e: ClipboardEvent) => preventAction(e, "COPY");
        const handlePaste = (e: ClipboardEvent) => preventAction(e, "PASTE");
        const handleCut = (e: ClipboardEvent) => preventAction(e, "CUT");
        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("copy", handleCopy);
        document.addEventListener("paste", handlePaste);
        document.addEventListener("cut", handleCut);
        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("copy", handleCopy);
            document.removeEventListener("paste", handlePaste);
            document.removeEventListener("cut", handleCut);
        };
    }, [ujianBerjalan, logPelanggaran]);

    useEffect(() => {
        if (!ujianBerjalan) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                const blockedCombos = ["c", "v", "x", "u", "s", "p", "a", "i", "j", "shift+i", "shift+j", "shift+c"];
                const key = e.shiftKey ? `shift+${e.key.toLowerCase()}` : e.key.toLowerCase();
                if (blockedCombos.includes(key)) { e.preventDefault(); logPelanggaran("KEYBOARD_SHORTCUT", `Blocked: Ctrl/Cmd+${e.key}`); return false; }
            }
            if (e.key === "F12") { e.preventDefault(); logPelanggaran("KEYBOARD_SHORTCUT", "Blocked: F12"); return false; }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [ujianBerjalan, logPelanggaran]);

    useEffect(() => {
        if (!ujianBerjalan) return;
        const requestFS = () => { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
        requestFS();
        const handleFullscreenChange = () => { if (!document.fullscreenElement) logPelanggaran("FULLSCREEN_EXIT", "Peserta keluar dari mode fullscreen"); };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, [ujianBerjalan, logPelanggaran]);

    const formatWaktu = (detik: number) => {
        const jam = Math.floor(detik / 3600);
        const menit = Math.floor((detik % 3600) / 60);
        const sisa = detik % 60;
        return `${jam.toString().padStart(2, '0')}:${menit.toString().padStart(2, '0')}:${sisa.toString().padStart(2, '0')}`;
    };

    const handlePilihJawaban = (soalId: number, opsi: string) => {
        dirtyRef.current = true;
        setJawabanPeserta((prev) => ({ ...prev, [soalId]: opsi }));
    };

    const handleToggleRagu = (soalId: number) => {
        dirtyRef.current = true;
        setRaguSet((prev) => {
            const next = new Set(prev);
            if (next.has(soalId)) next.delete(soalId); else next.add(soalId);
            return next;
        });
    };

    const handleSelesaiManual = () => {
        if (!confirm("Apakah Anda yakin ingin mengakhiri ujian? Jawaban Anda akan langsung dinilai.")) return;
        handleSelesai();
    };

    const handleLogout = async () => {
        if (!confirm("Yakin ingin keluar? Jawaban Anda tersimpan di server, tetapi waktu ujian tetap berjalan.")) return;
        await simpanSekarang();
        await fetch("/api/logout", { method: "POST" });
        router.push("/login");
    };

    if (status === "loading") return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Memuat Bank Soal...</div>;
    if (hasilUjian) return renderHasil(hasilUjian);
    if (status === "sudah") return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl">&#10003;</div>
                <h2 className="text-xl font-bold text-slate-800">Ujian Sudah Dikerjakan</h2>
                <p className="text-sm text-slate-500">Anda sudah menyelesaikan ujian ini. Hubungi pengawas bila perlu mengulang.</p>
                <button onClick={() => router.push("/ujian/review")} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">Lihat Review Jawaban</button>
                <button onClick={() => router.push("/dashboard")} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">Kembali ke Dashboard</button>
            </div>
        </div>
    );
    if (status === "belum") {
        const waitingCountdown = () => {
            if (!jadwalMulai) return { jam: "00", menit: "00", detik: "00" };
            if (!sekarang) return { jam: "--", menit: "--", detik: "--" };
            const diff = Math.max(0, new Date(jadwalMulai).getTime() - (sekarang + clockOffset));
            return {
                jam: Math.floor(diff / 3600000).toString().padStart(2, "0"),
                menit: Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0"),
                detik: Math.floor((diff % 60000) / 1000).toString().padStart(2, "0"),
            };
        };
        const wc = waitingCountdown();
        return (
            <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4 font-sans">
                <div className="relative z-10 bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-3xl p-8 md:p-10 max-w-md w-full shadow-2xl text-center space-y-6">
                    <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center mx-auto text-3xl">⏳</div>
                    <div>
                        <h2 className="text-2xl font-black text-white mb-1">Menunggu Ujian Dimulai</h2>
                        <p className="text-sm text-slate-400">Waktu ujian belum tiba. Silakan tunggu.</p>
                    </div>
                    <div className="flex justify-center gap-3">
                        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 min-w-[70px]">
                            <p className="text-3xl font-black text-white font-mono">{wc.jam}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Jam</p>
                        </div>
                        <div className="text-3xl font-black text-slate-600 self-start mt-3">:</div>
                        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 min-w-[70px]">
                            <p className="text-3xl font-black text-white font-mono">{wc.menit}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Menit</p>
                        </div>
                        <div className="text-3xl font-black text-slate-600 self-start mt-3">:</div>
                        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 min-w-[70px]">
                            <p className="text-3xl font-black text-amber-400 font-mono">{wc.detik}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Detik</p>
                        </div>
                    </div>
                    <button onClick={() => router.push("/dashboard")} className="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm">Kembali ke Dashboard</button>
                </div>
            </div>
        );
    }
    if (status === "tidak_ada") return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
                <h2 className="text-xl font-bold text-slate-800">Belum Ada Ujian</h2>
                <p className="text-sm text-slate-500">Saat ini tidak ada ujian CAT yang aktif untuk kelas Anda.</p>
                <button onClick={() => router.push("/kelas")} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">Kembali ke Beranda</button>
            </div>
        </div>
    );
    if (status === "bukan_kelas") return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
                <h2 className="text-xl font-bold text-slate-800">Ujian Bukan untuk Kelas Anda</h2>
                <p className="text-sm text-slate-500">Ujian yang sedang aktif khusus untuk kelas <b>{kelasUjian || "lain"}</b>. Hubungi panitia bila data kelas Anda keliru.</p>
                <button onClick={() => router.push("/dashboard")} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">Kembali ke Dashboard</button>
            </div>
        </div>
    );
    if (status === "jadwal_selesai") return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl">X</div>
                <h2 className="text-xl font-bold text-slate-800">Waktu Ujian Habis</h2>
                <p className="text-sm text-slate-500">Jadwal ujian telah berakhir. Hubungi pengawas jika ada pertanyaan.</p>
                <button onClick={() => router.push("/dashboard")} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">Kembali ke Dashboard</button>
            </div>
        </div>
    );
    if (status === "kosong" || flatSoal.length === 0) return <div className="min-h-screen flex items-center justify-center font-bold text-red-500">Belum ada soal ujian yang tersedia.</div>;

    function renderHasil(hasilUjian: HasilUjian) {
        const mapelColors: Record<string, string> = { "TIK": "text-blue-600", "Matematika": "text-purple-600", "Bahasa Indonesia": "text-amber-600", "Pengetahuan Umum": "text-emerald-600" };
        return (
            <div className="min-h-screen bg-slate-100 font-sans flex items-center justify-center p-4">
                <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl border border-slate-200 overflow-hidden p-8 space-y-6">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">&#10003;</div>
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-slate-800">Ujian Selesai!</h2>
                        <p className="text-sm text-slate-500 mt-1">Hasil nilai ujian Anda telah tersimpan.</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-3 gap-2">
                        <div><span className="block text-xs font-bold text-slate-400 uppercase">Soal</span><span className="text-lg font-extrabold text-slate-700">{hasilUjian.totalSoal}</span></div>
                        <div className="border-x border-slate-200"><span className="block text-xs font-bold text-emerald-500 uppercase">Benar</span><span className="text-lg font-extrabold text-emerald-600">{hasilUjian.jumlahBenar}</span></div>
                        <div><span className="block text-xs font-bold text-red-400 uppercase">Salah</span><span className="text-lg font-extrabold text-red-500">{hasilUjian.jumlahSalah}</span></div>
                    </div>
                    <div className="py-4 border-t border-b border-slate-100 text-center">
                        <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Total Nilai Akhir</span>
                        <span className="text-6xl font-black text-indigo-600 tracking-tight">{hasilUjian.nilaiAkhir}</span>
                    </div>
                    {hasilUjian.skorPerBagian && Object.keys(hasilUjian.skorPerBagian).length > 0 && (
                        <div className="text-left">
                            <h3 className="text-sm font-bold text-slate-600 uppercase mb-3">Detail Nilai per Bagian</h3>
                            <div className="space-y-2">
                                {Object.entries(hasilUjian.skorPerBagian).map(([bagian, skor]) => (
                                    <div key={bagian} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 border border-slate-100">
                                        <span className="text-sm font-semibold text-slate-700">{bagian}</span>
                                        <span className="text-sm font-bold text-slate-700">{skor}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {hasilUjian.skorPerMapel && Object.keys(hasilUjian.skorPerMapel).length > 0 && (
                        <div className="text-left">
                            <h3 className="text-sm font-bold text-slate-600 uppercase mb-3">Detail Nilai per Mata Pelajaran</h3>
                            <div className="space-y-2">
                                {Object.entries(hasilUjian.skorPerMapel).map(([mapel, skor]) => (
                                    <div key={mapel} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 border border-slate-100">
                                        <span className={`text-sm font-semibold ${mapelColors[mapel] || 'text-slate-700'}`}>{mapel}</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${skor}%` }}></div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 w-10 text-right">{skor}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <button onClick={() => router.push("/ujian/review")} className="w-full bg-indigo-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all mb-3">Lihat Review Jawaban</button>
                    <button onClick={() => router.push("/dashboard")} className="w-full bg-slate-900 text-white text-sm font-bold py-3 rounded-xl hover:bg-slate-800 transition-all">Keluar ke Dashboard</button>
                </div>
            </div>
        );
    }

    const soalAktif = flatSoal[currentIndex];
    const isMendekatiAkhir = sisaWaktu <= 300;
    const grupIndexBySoal = new Map<number, number>();
    grupSoal.forEach((g, gi) => g.soal.forEach((x) => grupIndexBySoal.set(x.id, gi)));
    const warnaGrup = (gi: number) => GROUP_COLORS[gi % GROUP_COLORS.length];
    const grupAktif = grupIndexBySoal.get(soalAktif.id) ?? 0;

    const toggleSubject = (subject: string) => {
        setOpenSubjects((prev) => ({ ...prev, [subject]: !prev[subject] }));
    };

    const goToSoal = (globalIndex: number) => {
        setCurrentIndex(globalIndex);
        const soal = flatSoal[globalIndex];
        const subject = soal ? grupSoal[grupIndexBySoal.get(soal.id) ?? 0]?.nama : undefined;
        if (subject && !openSubjects[subject]) {
            setOpenSubjects((prev) => ({ ...prev, [subject]: true }));
        }
    };

    const jawabanCount = flatSoal.filter((x) => jawabanPeserta[x.id]).length;
    const adaBagianBerikutnya = berbagian && tahap < jumlahTahap - 1;
    const raguCount = raguSet.size;

    return (
        <div className="h-screen bg-slate-100 font-sans flex flex-col select-none overflow-hidden">
            {/* Watermark */}
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
                {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="absolute text-slate-900/[0.03] text-sm font-bold whitespace-nowrap"
                        style={{ top: `${(i * 15) % 100}%`, left: `${(i * 23) % 100}%`, transform: "rotate(-25deg)" }}>
                        {peserta.nama} • {peserta.nomorPeserta}
                    </div>
                ))}
            </div>

            {/* Pelanggaran Warning */}
            {showPelanggaranWarning && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-red-600 text-white text-center py-2 px-4 text-sm font-bold animate-pulse">
                    PERINGATAN: Pelanggaran terdeteksi! ({pelanggaranCount}/{MAX_PELANGGARAN})
                </div>
            )}

            {/* Top Nav */}
            <nav className="bg-slate-900 text-white px-4 py-2.5 shadow-md flex items-center justify-between shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                        <svg className="w-5 h-5 text-white/50" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                    </div>
                    <div>
                        <h1 className="font-bold text-sm leading-tight">{peserta.nama}</h1>
                        <p className="text-[10px] text-indigo-300 uppercase tracking-wider">{peserta.nomorPeserta}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                <span className={`hidden sm:inline text-[10px] font-bold px-2 py-1 rounded ${statusSimpan === "gagal" ? "bg-red-500/20 text-red-300" : statusSimpan === "menyimpan" ? "bg-white/10 text-slate-300" : "bg-emerald-500/20 text-emerald-300"}`}
                    title="Jawaban disimpan otomatis ke server">
                    {statusSimpan === "gagal" ? "⚠ Belum tersimpan" : statusSimpan === "menyimpan" ? "Menyimpan…" : "✓ Tersimpan"}
                </span>
                {berbagian && (
                    <span className="hidden sm:inline text-[10px] font-bold px-2 py-1 rounded bg-indigo-500/20 text-indigo-200">
                        Bagian {tahap + 1}/{jumlahTahap}
                    </span>
                )}
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-bold ${isMendekatiAkhir ? 'bg-red-500/20 text-red-300 border border-red-500/50 animate-pulse' : 'bg-white/10 text-white border border-white/20'}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{formatWaktu(sisaWaktu)}</span>
                </div>
                </div>

                <div className="hidden md:flex items-center gap-4 text-xs font-bold">
                    {raguCount > 0 && (
                        <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/50">
                            <span>❓ {raguCount} Ragu</span>
                        </div>
                    )}
                    {pelanggaranCount > 0 && (
                        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border ${pelanggaranCount >= MAX_PELANGGARAN ? 'bg-red-600 text-white border-red-700' : 'bg-red-500/20 text-red-300 border-red-500/50'}`}>
                            ⚠️ {pelanggaranCount}/{MAX_PELANGGARAN}
                        </div>
                    )}
                    <div className="text-right text-[10px]"><span className="block text-slate-500 uppercase">Ruang</span><span className="text-white">{peserta.ruang}</span></div>
                    <div className="text-right text-[10px]"><span className="block text-slate-500 uppercase">Sesi</span><span className="text-white">{peserta.sesi}</span></div>
                    <button onClick={handleLogout} className="bg-red-500/10 hover:bg-red-500 border border-red-500/50 text-red-400 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all">Keluar</button>
                </div>
            </nav>

            {/* Body: Sidebar + Main */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className={`${sidebarOpen ? "w-64" : "w-12"} bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 overflow-hidden`}>
                    {/* Sidebar Header */}
                    <div className="px-3 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                        {sidebarOpen && <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Navigasi Soal</h3>}
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                {sidebarOpen
                                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />}
                            </svg>
                        </button>
                    </div>

                    {/* Summary Bar */}
                    {sidebarOpen && (
                        <div className="px-3 py-2 border-b border-slate-100 shrink-0">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                                <span>Progress</span>
                                <span>{jawabanCount}/{flatSoal.length}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(jawabanCount / flatSoal.length) * 100}%` }}></div>
                            </div>
                        </div>
                    )}

                    {/* Subject Groups */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                        {grupSoal.map((grup, gi) => {
                            const subject = grup.nama;
                            const soalInSubject = grup.soal;
                            const colors = warnaGrup(gi);
                            if (grup.terkunci) {
                                return (
                                    <div key={subject} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 flex items-center gap-2 opacity-70">
                                        <span className="text-xs shrink-0">{grup.selesai ? "✓" : "🔒"}</span>
                                        {sidebarOpen && (
                                            <>
                                                <span className="text-xs font-bold text-slate-500 flex-1 text-left truncate">{subject}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{grup.selesai ? "Selesai" : `${grup.jumlah} soal${grup.durasiMenit ? ` · ${grup.durasiMenit}m` : ""}`}</span>
                                            </>
                                        )}
                                    </div>
                                );
                            }
                            if (soalInSubject.length === 0) return null;
                            const isOpen = openSubjects[subject];
                            const answeredInSubject = soalInSubject.filter((s) => jawabanPeserta[s.id]).length;

                            return (
                                <div key={subject} className={`rounded-xl border ${colors.border} overflow-hidden`}>
                                    <button onClick={() => toggleSubject(subject)}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 ${colors.bg} transition-colors`}>
                                        <span className={`w-2.5 h-2.5 rounded-full ${colors.dot} shrink-0`}></span>
                                        {sidebarOpen && (
                                            <>
                                                <span className={`text-xs font-bold ${colors.text} flex-1 text-left`}>{subject}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{answeredInSubject}/{soalInSubject.length}</span>
                                                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </>
                                        )}
                                    </button>
                                    {sidebarOpen && isOpen && (
                                        <div className="p-2 bg-white grid grid-cols-5 gap-1.5">
                                            {soalInSubject.map((s) => {
                                                const globalIndex = flatSoal.findIndex((f) => f.id === s.id);
                                                const isCurrent = currentIndex === globalIndex;
                                                const isAnswered = !!jawabanPeserta[s.id];
                                                const isRagu = raguSet.has(s.id);

                                                let btnClass = "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100";
                                                if (isCurrent) btnClass = `${colors.activeBg} text-white border-transparent shadow-md`;
                                                else if (isRagu && isAnswered) btnClass = "bg-amber-400 text-white border-amber-500";
                                                else if (isRagu) btnClass = "bg-amber-50 text-amber-600 border-amber-200";
                                                else if (isAnswered) btnClass = "bg-emerald-50 text-emerald-600 border-emerald-200";

                                                return (
                                                    <button key={s.id} onClick={() => goToSoal(globalIndex)}
                                                        className={`relative w-full aspect-square rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center ${btnClass}`}>
                                                        {globalIndex + 1}
                                                        {isRagu && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full border border-white"></span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Sidebar Footer */}
                    {sidebarOpen && (
                        <div className="px-3 py-2 border-t border-slate-100 shrink-0">
                            {adaBagianBerikutnya ? (
                                <button onClick={() => handleLanjutBagian()} disabled={pindahTahap}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50">
                                    {pindahTahap ? "Memproses..." : "Lanjut ke Bagian Berikutnya"}
                                </button>
                            ) : (
                                <button onClick={handleSelesaiManual} disabled={submitting}
                                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50">
                                    {submitting ? "Memproses..." : "Selesai Ujian"}
                                </button>
                            )}
                        </div>
                    )}
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto p-6 md:p-8">
                        {/* Soal Header */}
                        <div className="flex items-center gap-2 mb-5">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${warnaGrup(grupAktif).bg} ${warnaGrup(grupAktif).text}`}>
                                {soalAktif.bagian ?? soalAktif.mataPelajaran}
                            </span>
                            {soalAktif.bagian && (
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-600">{soalAktif.mataPelajaran}</span>
                            )}
                            <span className="text-xs text-slate-400 font-medium">Soal {currentIndex + 1} dari {flatSoal.length}</span>
                        </div>

                        {/* Pertanyaan */}
                        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 mb-6">
                            <h2 className="text-base md:text-lg font-bold text-slate-800 leading-relaxed whitespace-pre-line">
                                <span className="text-indigo-600 mr-2">{currentIndex + 1}.</span>{soalAktif.pertanyaan}
                            </h2>
                        </div>

                        {/* Opsi Jawaban */}
                        <div className="space-y-3 mb-6">
                            {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                                <label key={opt} className={`flex items-center gap-4 p-4 md:p-5 rounded-xl border cursor-pointer transition-all ${jawabanPeserta[soalAktif.id] === opt ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20" : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                                    <input type="radio" name={`soal-${soalAktif.id}`} value={opt} checked={jawabanPeserta[soalAktif.id] === opt} onChange={() => handlePilihJawaban(soalAktif.id, opt)} className="w-5 h-5 text-indigo-600" />
                                    <span className="font-bold text-slate-700 w-6 shrink-0">{opt}.</span>
                                    <span className="text-slate-600 text-sm leading-relaxed">{soalAktif[`opsi${opt}` as keyof SoalItem]}</span>
                                </label>
                            ))}
                        </div>

                        {/* Ragu Toggle */}
                        <button onClick={() => handleToggleRagu(soalAktif.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${raguSet.has(soalAktif.id) ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-white text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-600"}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {raguSet.has(soalAktif.id) ? "Batal Ragu" : "Tandai Ragu"}
                        </button>

                        {/* Prev / Next */}
                        <div className="flex justify-between items-center mt-8">
                            <button onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))} disabled={currentIndex === 0}
                                className="px-6 py-2.5 bg-white border border-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl text-sm transition-all hover:bg-slate-50">
                                &larr; Sebelumnya
                            </button>
                            {currentIndex === flatSoal.length - 1 && adaBagianBerikutnya ? (
                                <button onClick={() => handleLanjutBagian()} disabled={pindahTahap}
                                    className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md transition-all hover:bg-indigo-700 disabled:opacity-50">
                                    {pindahTahap ? "Memproses..." : "Lanjut ke Bagian Berikutnya →"}
                                </button>
                            ) : currentIndex === flatSoal.length - 1 ? (
                                <button onClick={handleSelesaiManual} disabled={submitting}
                                    className="px-8 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm shadow-md transition-all hover:bg-emerald-700 disabled:opacity-50">
                                    {submitting ? "Memproses..." : "Selesai Ujian"}
                                </button>
                            ) : (
                                <button onClick={() => setCurrentIndex((prev) => Math.min(flatSoal.length - 1, prev + 1))}
                                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md transition-all hover:bg-indigo-700">
                                    Selanjutnya &rarr;
                                </button>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
