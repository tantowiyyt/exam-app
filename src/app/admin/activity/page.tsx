"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeaderHalaman } from "@/components/AppShell";

interface UserWithActivity {
    id: number;
    nama: string;
    nomorPeserta: string;
    ruang: string;
    sesi: string;
    sudahUjian: boolean;
    nilai: number | null;
    isOnline: boolean;
    lastActivity: string | null;
    lastActivityTime: string | null;
}

export default function ActivityMonitorPage() {
    const [users, setUsers] = useState<UserWithActivity[]>([]);
    const [onlineCount, setOnlineCount] = useState(0);
    const [totalPeserta, setTotalPeserta] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
    const [search, setSearch] = useState("");
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

    const fetchActivity = async () => {
        try {
            const res = await fetch("/api/user-activity");
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users);
                setOnlineCount(data.onlineCount);
                setTotalPeserta(data.totalPeserta);
            }
        } catch (err) {
            console.error("Gagal memuat aktivitas:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const first = setTimeout(fetchActivity, 0);
        const interval = setInterval(fetchActivity, 10000); // Refresh setiap 10 detik
        return () => { clearTimeout(first); clearInterval(interval); };
    }, []);

    const filteredUsers = users.filter((user) => {
        const matchesFilter =
            filter === "all" ||
            (filter === "online" && user.isOnline) ||
            (filter === "offline" && !user.isOnline);
        const matchesSearch =
            user.nama.toLowerCase().includes(search.toLowerCase()) ||
            user.nomorPeserta.toLowerCase().includes(search.toLowerCase()) ||
            user.ruang.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getActivityLabel = (activity: string | null) => {
        switch (activity) {
            case "LOGIN":
                return "Login";
            case "LOGOUT":
                return "Logout";
            case "START_UJIAN":
                return "Mulai Ujian";
            case "ANSWER_SOAL":
                return "Menjawab Soal";
            case "SUBMIT_UJIAN":
                return "Submit Ujian";
            case "IDLE":
                return "Idle";
            default:
                return activity || "-";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <HeaderHalaman grup="Sistem" judul="Aktivitas Pengguna" />

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Online Sekarang</div>
                        <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Total Peserta</div>
                        <div className="text-2xl font-bold text-blue-600">{totalPeserta}</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Offline</div>
                        <div className="text-2xl font-bold text-gray-600">{totalPeserta - onlineCount}</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilter("all")}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                    filter === "all"
                                        ? "bg-indigo-600 text-white"
                                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                Semua
                            </button>
                            <button
                                onClick={() => setFilter("online")}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                    filter === "online"
                                        ? "bg-green-600 text-white"
                                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                Online
                            </button>
                            <button
                                onClick={() => setFilter("offline")}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                    filter === "offline"
                                        ? "bg-gray-600 text-white"
                                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                }`}
                            >
                                Offline
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder="Cari nama, nomor, atau ruang..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                </div>

                {/* User List */}
                {loading ? (
                    <div className="text-center py-8">Memuat data...</div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Peserta
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Ruang / Sesi
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Aktivitas
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Status Ujian
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Terakhir Aktif
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    user.isOnline
                                                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                        : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                                                }`}
                                            >
                                                {user.isOnline ? "Online" : "Offline"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{user.nama}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">{user.nomorPeserta}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {user.ruang} / Sesi {user.sesi}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {getActivityLabel(user.lastActivity)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {user.sudahUjian ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                                    Selesai ({user.nilai ?? 0})
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                                    Belum Ujian
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {user.lastActivityTime
                                                ? new Date(user.lastActivityTime).toLocaleString("id-ID")
                                                : "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredUsers.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                Tidak ada data ditemukan
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}