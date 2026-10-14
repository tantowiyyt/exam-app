"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuditLog {
    id: number;
    userId: number | null;
    action: string;
    target: string | null;
    details: string | null;
    ipAddress: string | null;
    createdAt: string;
    user: {
        id: number;
        nama: string;
        nomorPeserta: string;
    } | null;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterAction, setFilterAction] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
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

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterAction) params.set("action", filterAction);
            params.set("page", currentPage.toString());
            params.set("limit", "50");

            const res = await fetch(`/api/admin/audit-logs?${params}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
                setPagination(data.pagination);
            }
        } catch (err) {
            console.error("Gagal memuat audit logs:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(fetchLogs, 0);
        return () => clearTimeout(t);
    }, [filterAction, currentPage]);

    const getActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            LOGIN: "Login",
            LOGOUT: "Logout",
            LOGIN_FAILED: "Login Gagal",
            CREATE_SOAL: "Buat Soal",
            UPDATE_SOAL: "Edit Soal",
            DELETE_SOAL: "Hapus Soal",
            BULK_IMPORT_SOAL: "Import Soal",
            BULK_DELETE_SOAL: "Hapus Soal Massal",
            CREATE_PESERTA: "Buat Peserta",
            UPDATE_PESERTA: "Edit Peserta",
            DELETE_PESERTA: "Hapus Peserta",
            BULK_IMPORT_PESERTA: "Import Peserta",
            RESET_PESERTA: "Reset Ujian Peserta",
            RESET_ALL_PESERTA: "Reset Semua Peserta",
            CREATE_UJIAN: "Buat Ujian",
            UPDATE_UJIAN: "Edit Ujian",
            DELETE_UJIAN: "Hapus Ujian",
            UPDATE_PENGATURAN: "Update Pengaturan",
            BACKUP_DATABASE: "Backup Database",
            RESTORE_DATABASE: "Restore Database",
            CREATE_IP_RULE: "Buat IP Rule",
            DELETE_IP_RULE: "Hapus IP Rule",
            START_UJIAN_PESERTA: "Mulai Ujian",
            SUBMIT_UJIAN: "Submit Ujian",
        };
        return labels[action] || action;
    };

    const getActionColor = (action: string) => {
        if (action.includes("DELETE") || action.includes("FAILED")) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
        if (action.includes("CREATE") || action.includes("IMPORT")) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        if (action.includes("UPDATE") || action.includes("EDIT")) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
        if (action === "LOGIN" || action === "LOGOUT") return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
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
                            <span className="text-gray-700 dark:text-gray-300">Audit Logs</span>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {/* Filter */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-6">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Filter Aksi:
                        </label>
                        <select
                            value={filterAction}
                            onChange={(e) => {
                                setFilterAction(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="">Semua Aksi</option>
                            <option value="LOGIN">Login</option>
                            <option value="LOGOUT">Logout</option>
                            <option value="LOGIN_FAILED">Login Gagal</option>
                            <option value="CREATE_SOAL">Buat Soal</option>
                            <option value="DELETE_SOAL">Hapus Soal</option>
                            <option value="CREATE_PESERTA">Buat Peserta</option>
                            <option value="DELETE_PESERTA">Hapus Peserta</option>
                            <option value="BACKUP_DATABASE">Backup</option>
                            <option value="RESTORE_DATABASE">Restore</option>
                            <option value="SUBMIT_UJIAN">Submit Ujian</option>
                        </select>
                        {pagination && (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                Total: {pagination.total} log
                            </span>
                        )}
                    </div>
                </div>

                {/* Logs Table */}
                {loading ? (
                    <div className="text-center py-8">Memuat data...</div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                        Waktu
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                        User
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                        Aksi
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                        Target
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                        IP Address
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                        Detail
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                            {new Date(log.createdAt).toLocaleString("id-ID")}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                                            {log.user ? (
                                                <div>
                                                    <div className="font-medium text-gray-900 dark:text-white">{log.user.nama}</div>
                                                    <div className="text-xs text-gray-500">{log.user.nomorPeserta}</div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">System</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                                                {getActionLabel(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                            {log.target || "-"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-500 dark:text-gray-400">
                                            {log.ipAddress || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                            {log.details || "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {logs.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                Tidak ada audit log ditemukan
                            </div>
                        )}
                    </div>
                )}

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="mt-4 flex justify-center gap-2">
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                        >
                            ← Prev
                        </button>
                        <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                            Halaman {pagination.page} dari {pagination.totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                            disabled={currentPage === pagination.totalPages}
                            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                        >
                            Next →
                        </button>
                    </div>
                )}

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