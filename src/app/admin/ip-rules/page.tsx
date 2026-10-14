"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";

interface IPRule {
    id: number;
    ipAddress: string;
    type: "WHITELIST" | "BLACKLIST";
    keterangan: string | null;
    createdBy: string | null;
    createdAt: string;
}

export default function IPRulesPage() {
    const { toast } = useToast();
    const [rules, setRules] = useState<IPRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [ipAddress, setIPAddress] = useState("");
    const [type, setType] = useState<"WHITELIST" | "BLACKLIST">("WHITELIST");
    const [keterangan, setKeterangan] = useState("");
    const [submitting, setSubmitting] = useState(false);
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

    const fetchRules = async () => {
        try {
            const res = await fetch("/api/admin/ip-rules");
            if (res.ok) {
                const data = await res.json();
                setRules(data.rules);
            }
        } catch (err) {
            console.error("Gagal memuat IP rules:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(fetchRules, 0);
        return () => clearTimeout(t);
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch("/api/admin/ip-rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ipAddress, type, keterangan }),
            });

            if (res.ok) {
                toast("IP Rule berhasil ditambahkan", "success");
                setIPAddress("");
                setKeterangan("");
                fetchRules();
            } else {
                const data = await res.json();
                toast(data.message || "Gagal menambahkan IP rule", "error");
            }
        } catch {
            toast("Gagal menambahkan IP rule", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Hapus IP rule ini?")) return;

        try {
            const res = await fetch("/api/admin/ip-rules", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });

            if (res.ok) {
                toast("IP Rule berhasil dihapus", "success");
                fetchRules();
            } else {
                toast("Gagal menghapus IP rule", "error");
            }
        } catch {
            toast("Gagal menghapus IP rule", "error");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <nav className="bg-white dark:bg-gray-800 shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex items-center">
                            <Link href="/admin" className="text-xl font-bold text-indigo-600">
                                Admin Panel
                            </Link>
                        </div>
                        <div className="flex items-center space-x-4">
                            <ThemeToggle />
                            <span className="text-gray-700 dark:text-gray-300">IP Rules</span>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {/* Add Rule Form */}
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                        Tambah IP Rule
                    </h2>
                    <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                IP Address
                            </label>
                            <input
                                type="text"
                                value={ipAddress}
                                onChange={(e) => setIPAddress(e.target.value)}
                                placeholder="192.168.1.1 atau 192.168.1.0/24"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Tipe
                            </label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as "WHITELIST" | "BLACKLIST")}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                            >
                                <option value="WHITELIST">Whitelist (Izinkan)</option>
                                <option value="BLACKLIST">Blacklist (Blokir)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Keterangan
                            </label>
                            <input
                                type="text"
                                value={keterangan}
                                onChange={(e) => setKeterangan(e.target.value)}
                                placeholder="Lab CAT-01"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                            >
                                {submitting ? "Menambahkan..." : "Tambah Rule"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Info */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                    <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        ℹ️ Informasi
                    </h3>
                    <ul className="mt-2 text-sm text-blue-700 dark:text-blue-300 list-disc list-inside">
                        <li><strong>Whitelist</strong>: Hanya IP yang terdaftar yang diizinkan mengakses</li>
                        <li><strong>Blacklist</strong>: IP yang terdaftar akan diblokir dari akses</li>
                        <li>Format: IP tunggal (192.168.1.1) atau CIDR (192.168.1.0/24)</li>
                        <li>Blacklist diproses sebelum Whitelist (prioritas lebih tinggi)</li>
                        <li>Jika tidak ada rules, semua IP diizinkan</li>
                    </ul>
                </div>

                {/* Rules List */}
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    IP Address
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Tipe
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Keterangan
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Dibuat Oleh
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Tanggal
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Aksi
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {rules.map((rule) => (
                                <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                                        {rule.ipAddress}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                rule.type === "WHITELIST"
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                            }`}
                                        >
                                            {rule.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {rule.keterangan || "-"}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {rule.createdBy || "-"}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(rule.createdAt).toLocaleDateString("id-ID")}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <button
                                            onClick={() => handleDelete(rule.id)}
                                            className="text-red-600 hover:text-red-800 dark:text-red-400"
                                        >
                                            Hapus
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rules.length === 0 && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            Belum ada IP rules. Semua IP diizinkan mengakses.
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <Link
                        href="/admin"
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                    >
                        ← Kembali ke Dashboard
                    </Link>
                </div>
            </main>
        </div>
    );
}