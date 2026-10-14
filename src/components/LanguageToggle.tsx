"use client";

import { useI18n } from "@/lib/i18n/provider";

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === "id" ? "en" : "id")}
      className="text-xs font-bold bg-white/10 border border-white/20 px-3 py-1.5 rounded-full hover:bg-white/20 transition-all"
      title={locale === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
    >
      {locale === "id" ? "EN" : "ID"}
    </button>
  );
}
