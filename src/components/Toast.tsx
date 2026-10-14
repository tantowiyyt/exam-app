"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, type: ToastType = "info") => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3500);
    }, []);

    const remove = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const bg: Record<ToastType, string> = {
        success: "bg-emerald-600",
        error: "bg-red-600",
        warning: "bg-amber-500",
        info: "bg-slate-700",
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`${bg[t.type]} text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-slide-up cursor-pointer min-w-[240px] max-w-[360px]`}
                        onClick={() => remove(t.id)}
                    >
                        {t.type === "success" && <span>&#10003;</span>}
                        {t.type === "error" && <span>&#10007;</span>}
                        {t.type === "warning" && <span>!</span>}
                        {t.type === "info" && <span>i</span>}
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
