"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/LanguageToggle";

interface UjianInfo {
  nama: string;
  durasiMenit: number;
  jadwalMulai: string | null;
  jadwalSelesai: string | null;
}

interface RuangInfo {
  ruang: string;
  sesi: string;
  tanggal: string | null;
  terisi: number;
  kapasitas: number;
}

interface StatsInfo {
  totalPeserta: number;
  totalSoal: number;
  totalMapel: number;
  totalUjian: number;
  mapel: { nama: string; jumlah: number }[];
}

export default function LandingPage() {
  const { t } = useI18n();
  const [ujian, setUjian] = useState<UjianInfo | null>(null);
  const [ruangList, setRuangList] = useState<RuangInfo[]>([]);
  const [stats, setStats] = useState<StatsInfo | null>(null);
  const [countdown, setCountdown] = useState("");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch("/api/public/info");
        if (res.ok) {
          const data = await res.json();
          setUjian(data.ujian);
          setRuangList(data.ruang || []);
          setStats(data.stats || null);
        }
      } catch {}
    };
    fetchInfo();
  }, []);

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
        setCountdown(`${j.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${d.toString().padStart(2, "0")}`);
        setStatusText("Sedang Berlangsung");
      } else if (now < mulai) {
        const diff = mulai.getTime() - now.getTime();
        const j = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const d = Math.floor((diff % 60000) / 1000);
        setCountdown(`${j}j ${m}m ${d}d`);
        setStatusText("Belum Dimulai");
      } else {
        setCountdown("");
        setStatusText("Selesai");
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [ujian]);

  const formatTanggal = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  };

  const formatJam = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const groupedRuang = ruangList.reduce<Record<string, RuangInfo[]>>((acc, r) => {
    if (!acc[r.ruang]) acc[r.ruang] = [];
    acc[r.ruang].push(r);
    return acc;
  }, {});

  const howItWorks = [
    { icon: "1", title: t('landing.howStep1Title'), desc: t('landing.howStep1Desc'), color: "from-emerald-500 to-teal-500" },
    { icon: "2", title: t('landing.howStep2Title'), desc: t('landing.howStep2Desc'), color: "from-blue-500 to-indigo-500" },
    { icon: "3", title: t('landing.howStep3Title'), desc: t('landing.howStep3Desc'), color: "from-amber-500 to-orange-500" },
    { icon: "4", title: t('landing.howStep4Title'), desc: t('landing.howStep4Desc'), color: "from-purple-500 to-pink-500" },
  ];

  const features = [
    { icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ), title: t('landing.feature1Title'), desc: t('landing.feature1Desc'), color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    { icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ), title: t('landing.feature2Title'), desc: t('landing.feature2Desc'), color: "text-red-400 bg-red-500/10 border-red-500/20" },
    { icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ), title: t('landing.feature3Title'), desc: t('landing.feature3Desc'), color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    { icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
      </svg>
    ), title: t('landing.feature4Title'), desc: t('landing.feature4Desc'), color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-indigo-950 to-slate-900 text-white font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-125 h-125 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-150 h-150 bg-purple-600/15 rounded-full blur-[150px] pointer-events-none"></div>

      {/* HEADER */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-linear-to-tr from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-white font-black text-sm">C</span>
          </div>
          <span className="text-lg font-black tracking-wider bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent">
            CAT <span className="text-indigo-400 font-medium">SYSTEM</span>
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <LanguageToggle />
          <Link href="/daftar" className="text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 rounded-full hover:bg-indigo-500/20 transition-all">
            {t('nav.register')}
          </Link>
          <Link href="/login" className="text-xs font-bold text-white bg-white/10 border border-white/20 px-4 py-2 rounded-full hover:bg-white/20 transition-all">
            {t('nav.login')}
          </Link>
        </div>
      </header>

      {/* HERO */}
      <main className="w-full max-w-6xl mx-auto px-6 py-10 relative z-10">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 px-4 py-1.5 rounded-full text-xs font-semibold text-indigo-300 mb-5 tracking-wide uppercase">
            {t('landing.badge')}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            {t('landing.title')}{" "}
            <span className="bg-linear-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {t('landing.titleHighlight')}
            </span>
          </h1>
          <p className="mt-4 text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            {t('landing.desc')}
          </p>
        </div>

        {/* STATistik Dinamis */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { value: stats.totalPeserta, label: t('landing.statParticipants'), color: "text-indigo-400" },
              { value: stats.totalSoal, label: t('landing.statQuestions'), color: "text-emerald-400" },
              { value: stats.totalMapel, label: t('landing.statSubjects'), color: "text-amber-400" },
              { value: stats.totalUjian, label: t('landing.statExams'), color: "text-purple-400" },
            ].map((s, i) => (
              <div key={i} className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-5 text-center">
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* INFO UJIAN AKTIF */}
        {ujian && (
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 md:p-8 mb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">{t('landing.activeExam')}</p>
                <h2 className="text-2xl font-black text-white">{ujian.nama}</h2>
              </div>
              {statusText && (
                <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${
                  statusText === "Sedang Berlangsung" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                  statusText === "Belum Dimulai" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                  "bg-red-500/10 text-red-400 border-red-500/30"
                }`}>
                  {statusText} {countdown && `- ${countdown}`}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('landing.date')}</p>
                <p className="text-sm font-semibold text-white">{formatTanggal(ujian.jadwalMulai)}</p>
              </div>
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('landing.time')}</p>
                <p className="text-sm font-semibold text-white">{formatJam(ujian.jadwalMulai)} — {formatJam(ujian.jadwalSelesai)}</p>
              </div>
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('landing.duration')}</p>
                <p className="text-sm font-semibold text-white">{ujian.durasiMenit} Menit</p>
              </div>
            </div>
          </div>
        )}

        {!ujian && (
          <div className="text-center py-10 bg-slate-900/30 border border-slate-700/30 rounded-3xl mb-10">
            <p className="text-slate-500 text-sm">{t('landing.noExam')}</p>
          </div>
        )}

        {/* DAFTAR RUANG */}
        {Object.keys(groupedRuang).length > 0 && (
          <div className="mb-10">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">{t('landing.roomStatus')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(groupedRuang).map(([ruang, sessions]) => (
                <div key={ruang} className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white">{ruang}</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{sessions.length} sesi</span>
                  </div>
                  <div className="space-y-2">
                    {sessions.map((s) => {
                      const pct = Math.round((s.terisi / s.kapasitas) * 100);
                      return (
                        <div key={`${s.sesi}-${s.tanggal}`}>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>Sesi {s.sesi}</span>
                            <span>{s.terisi}/{s.kapasitas}</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CARA KERJA */}
        <div className="mb-12">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6 text-center">{t('landing.howItWorks')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {howItWorks.map((step, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-5 text-center relative group hover:border-slate-600/60 transition-all">
                <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${step.color} flex items-center justify-center mx-auto mb-3 shadow-lg`}>
                  <span className="text-white font-black text-sm">{step.icon}</span>
                </div>
                <h4 className="text-sm font-bold text-white mb-1">{step.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                {i < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 text-slate-600 text-lg">&rarr;</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FITUR UNGGULAN */}
        <div className="mb-12">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6 text-center">{t('landing.features')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-5 flex gap-4 items-start hover:border-slate-600/60 transition-all">
                <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${f.color}`}>
                  {f.icon}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">{f.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA SECTION */}
        <div className="text-center mb-8">
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-3xl p-8 md:p-10">
            <h3 className="text-xl font-black text-white mb-2">{t('landing.cta')}</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
              {t('landing.desc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login" className="relative group inline-block">
                <div className="absolute -inset-0.5 bg-linear-to-r from-indigo-500 to-purple-500 rounded-xl blur opacity-70 group-hover:opacity-100 transition duration-200"></div>
                <span className="relative block bg-slate-950 text-white font-bold text-sm px-8 py-3.5 rounded-xl border border-slate-800/80 group-hover:scale-[1.02] transition-all">
                  {t('nav.login')} &rarr;
                </span>
              </Link>
              <Link href="/daftar" className="inline-flex items-center justify-center gap-2 text-sm font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-8 py-3.5 rounded-xl hover:bg-indigo-500/20 transition-all">
                {t('nav.register')}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 text-center text-xs text-slate-500 relative z-10 border-t border-slate-900">
        &copy; {new Date().getFullYear()} CAT System Aplikasi Ujian. Hak Cipta Dilindungi Undang-Undang.
      </footer>
    </div>
  );
}
