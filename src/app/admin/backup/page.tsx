"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { HeaderHalaman } from "@/components/AppShell";

export default function BackupPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [replaceAll, setReplaceAll] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data.role !== "ADMIN") {
                        router.replace("/login");
                    }
                } else {
                    router.replace("/login");
                }
            } catch {
                router.replace("/login");
            }
        };
        fetchUser();
    }, [router]);

    const handleBackup = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/backup");
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast("Backup berhasil", "success");
            } else {
                const data = await res.json();
                toast(data.message || "Backup gagal", "error");
            }
        } catch (error) {
            toast("Gagal melakukan backup", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleRestore = async () => {
        if (!selectedFile) {
            toast("Pilih file backup terlebih dahulu", "error");
            return;
        }

        if (!confirm("Apakah Anda yakin ingin melakukan restore? Semua data saat ini akan diganti.")) {
            return;
        }

        setRestoring(true);
        try {
            const text = await selectedFile.text();
            const backup = JSON.parse(text);

            const res = await fetch("/api/admin/backup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: backup.data, fotos: backup.fotos, lampiranLms: backup.lampiranLms, replaceAll }),
            });

            if (res.ok) {
                const data = await res.json();
                toast(data.message || "Restore berhasil", "success");
                setSelectedFile(null);
                setReplaceAll(false);
            } else {
                const data = await res.json();
                toast(data.message || "Restore gagal", "error");
            }
        } catch (error) {
            toast("Gagal melakukan restore", "error");
        } finally {
            setRestoring(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <HeaderHalaman grup="Sistem" judul="Backup & Restore" />

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Backup Section */}
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Backup Database
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Export seluruh database ke file JSON untuk keamanan data.
                        </p>
                        <button
                            onClick={handleBackup}
                            disabled={loading}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                        >
                            {loading ? "Memproses..." : "Download Backup"}
                        </button>
                    </div>

                    {/* Restore Section */}
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Restore Database
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Import data dari file backup JSON sebelumnya.
                        </p>
                        <div className="mb-4">
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={replaceAll}
                                    onChange={(e) => setReplaceAll(e.target.checked)}
                                    className="mr-2"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    Ganti semua data (hapus data lama)
                                </span>
                            </label>
                        </div>
                        <button
                            onClick={handleRestore}
                            disabled={restoring || !selectedFile}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                        >
                            {restoring ? "Memproses..." : "Restore dari File"}
                        </button>
                    </div>
                </div>

                {/* Info Section */}
                <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        ⚠️ Peringatan
                    </h3>
                    <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside">
                        <li>Backup berisi seluruh data termasuk password (hashed)</li>
                        <li>Restore dengan opsi &ldquo;Ganti semua data&rdquo; akan menghapus data saat ini</li>
                        <li>Pastikan backup tersimpan di tempat yang aman</li>
                        <li>Lakukan backup secara berkala untuk keamanan data</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}