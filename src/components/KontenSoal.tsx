"use client";

import { useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// Teks soal kaya: gambar [gambar:/api/media/x.png], audio [audio:/api/media/x.mp3],
// rumus $x^2$ (sebaris) atau $$\frac{a}{b}$$ (baris sendiri) dengan notasi LaTeX, dan tautan http(s).
// Dipakai di ujian CAT, kuis, bank soal, review, dan editor soal.

const POLA = /(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\$(?=\S)[^$\n]*?\S\$(?!\d)|\$\S\$(?!\d)|\[gambar:\/api\/media\/[\w-]+\.[a-z0-9]+\]|\[audio:\/api\/media\/[\w-]+\.[a-z0-9]+\]|https?:\/\/[^\s<>"\]]+)/gi;

export const adaMarkup = (t: string) => /\[(gambar|audio):|\$|\\\(/.test(t);

function Rumus({ tex, blok }: { tex: string; blok: boolean }) {
    const html = katex.renderToString(tex, { throwOnError: false, displayMode: blok, output: "html", strict: "ignore", trust: false });
    return blok
        ? <span className="block my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
        : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function KontenSoal({ teks, className = "", sebaris = false }: { teks: string; className?: string; sebaris?: boolean }) {
    if (!teks) return null;
    const bagian = teks.split(POLA);
    const Tag = sebaris ? "span" : "div";
    return (
        <Tag className={`whitespace-pre-wrap wrap-break-word leading-relaxed ${className}`}>
            {bagian.map((b, i) => {
                if (i % 2 === 0) return b ? <span key={i}>{b}</span> : null;
                if (b.startsWith("$$")) return <Rumus key={i} tex={b.slice(2, -2)} blok />;
                if (b.startsWith("\\(")) return <Rumus key={i} tex={b.slice(2, -2)} blok={false} />;
                if (b.startsWith("$")) return <Rumus key={i} tex={b.slice(1, -1)} blok={false} />;
                if (b.startsWith("[gambar:")) {
                    // eslint-disable-next-line @next/next/no-img-element
                    return <img key={i} src={b.slice(8, -1)} alt="Gambar soal" draggable={false} className="block max-w-full max-h-[28rem] my-2 rounded-lg border border-slate-200 bg-white" />;
                }
                if (b.startsWith("[audio:")) {
                    return <audio key={i} src={b.slice(7, -1)} controls controlsList="nodownload" preload="metadata" className="block my-2 w-full max-w-md" />;
                }
                return <a key={i} href={b} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline break-all">{b}</a>;
            })}
        </Tag>
    );
}

/** Tombol sisip gambar / audio / rumus untuk textarea soal. */
export function ToolbarMedia({ onSisip }: { onSisip: (teks: string) => void }) {
    const [proses, setProses] = useState(false);
    const [error, setError] = useState("");
    const file = useRef<HTMLInputElement>(null);
    const unggah = async (f: File) => {
        setProses(true);
        setError("");
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/media", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}));
        setProses(false);
        if (!res.ok) return setError(d.message || "Gagal mengunggah");
        onSisip(`\n${d.sisip}\n`);
    };
    const tombol = "px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold disabled:opacity-50";
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/ogg,audio/wav,audio/mp4,.m4a" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) unggah(f); }} />
            <button type="button" disabled={proses} onClick={() => file.current?.click()} className={tombol}>{proses ? "Mengunggah..." : "+ Gambar / Audio"}</button>
            <button type="button" onClick={() => onSisip("$x^2$")} className={tombol} title="Rumus sebaris, notasi LaTeX">+ Rumus</button>
            <button type="button" onClick={() => onSisip("\n$$\\frac{a}{b}$$\n")} className={tombol} title="Rumus di baris sendiri">+ Rumus Blok</button>
            <span className="text-[10px] text-slate-400">Rumus: <code>$x^2$</code>, <code>$\sqrt{"{x}"}$</code>, <code>$\frac{"{a}{b}"}$</code></span>
            {error && <span className="text-[11px] text-red-600 font-semibold">{error}</span>}
        </div>
    );
}

/** Textarea soal dengan toolbar sisip & pratinjau bila ada gambar/audio/rumus. */
export function TextareaSoal({ value, onChange, rows = 2, placeholder, label, className = "", required }: {
    value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; label?: string; className?: string; required?: boolean;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const sisip = (t: string) => {
        const el = ref.current;
        const awal = el?.selectionStart ?? value.length;
        const akhir = el?.selectionEnd ?? value.length;
        onChange(value.slice(0, awal) + t + value.slice(akhir));
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(awal + t.length, awal + t.length); });
    };
    return (
        <div className="space-y-1">
            <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} aria-label={label} required={required} className={className} />
            <ToolbarMedia onSisip={sisip} />
            {adaMarkup(value) && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Pratinjau</p>
                    <KontenSoal teks={value} className="text-sm text-slate-800" />
                </div>
            )}
        </div>
    );
}
