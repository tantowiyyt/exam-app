"use client";

import { createContext, useContext, useSyncExternalStore, ReactNode } from "react";
import { Locale, t as translate } from "@/lib/i18n/translations";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "id",
  setLocale: () => {},
  t: (key: string) => key,
});

const EVENT = "locale-change";

function readLocale(): Locale {
  try {
    const saved = localStorage.getItem("locale");
    if (saved === "en" || saved === "id") return saved;
  } catch {}
  return "id";
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, () => "id" as Locale);

  const setLocale = (l: Locale) => {
    try {
      localStorage.setItem("locale", l);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };

  const t = (key: string) => translate(locale, key);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
