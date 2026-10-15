"use client";

import { useEffect, useState } from "react";
import { HeaderHalaman, muatIdentitas } from "@/components/AppShell";

// Panduan singkat per peran. Bisa dicetak / disimpan sebagai PDF (Cetak -> Simpan sebagai PDF) untuk dibagikan.
// Admin bisa membuka panduan semua peran.

type Peran = "PESERTA" | "GURU" | "WALI" | "PENGAWAS" | "ADMIN" | "ORANGTUA";
interface Bagian { judul: string; langkah: string[] }

const NAMA: Record<Peran, string> = { ORANGTUA: "Orang Tua", PESERTA: "Siswa", GURU: "Guru", WALI: "Wali Kelas", PENGAWAS: "Pengawas Ujian", ADMIN: "Admin / Operator" };

const PANDUAN: Record<Peran, Bagian[]> = {
    ORANGTUA: [
        { judul: "Masuk", langkah: [
            "Masuk dengan username dan password yang diberikan sekolah (biasanya ortu-NIS anak), lalu ganti password lewat menu Ganti Password.",
            "Bila satu akun ditautkan ke beberapa anak, pilih kartu anak di Beranda.",
        ] },
        { judul: "Memantau belajar anak", langkah: [
            "Beranda menampilkan persentase kehadiran, tugas yang sedang berjalan, dan tugas yang lewat tenggat.",
            "Di bawahnya: nilai per mata pelajaran (yang sudah diumumkan guru), daftar tugas & statusnya, catatan ketidakhadiran, ujian mendatang, pengumuman, dan jadwal pelajaran.",
            "Menu Rapor Anak menampilkan rapor semester; bisa dicetak.",
        ] },
        { judul: "Berkomunikasi dengan sekolah", langkah: [
            "Klik \"Pesan ke Wali Kelas\" atau \"kirim pesan\" di samping nama guru, atau buka menu Pesan → Pesan Baru.",
            "Pesan bisa dikirim ke guru mapel anak, wali kelas, dan admin sekolah.",
        ] },
    ],
    PESERTA: [
        { judul: "Masuk pertama kali", langkah: [
            "Buka alamat aplikasi dari guru/operator, lalu masuk dengan NIS dan password yang dibagikan.",
            "Buka menu Ganti Password dan ganti password Anda. Jangan berikan password kepada teman.",
            "Buka Data Diri dan lengkapi datanya, termasuk No. HP/WhatsApp dan email agar bisa memakai Lupa Password.",
        ] },
        { judul: "Belajar di kelas", langkah: [
            "Beranda menampilkan mapel di kelas Anda, tugas yang harus dikerjakan, dan kelas virtual hari ini.",
            "Klik mapel lalu buka tab Materi untuk membaca materi atau menonton video.",
            "Tab Tugas: buka tugas, tulis jawaban atau lampirkan file (maks 5), lalu klik Kumpulkan. Bila guru meminta revisi, perbaiki lalu kirim ulang.",
            "Tab Kuis: klik Mulai. Jawaban tersimpan otomatis; perhatikan sisa waktu.",
            "Tab Presensi: masukkan kode dari guru saat presensi dibuka.",
            "Lonceng di kanan atas berisi pemberitahuan tugas, nilai, dan pengumuman baru.",
        ] },
        { judul: "Nilai, kehadiran, dan rapor", langkah: [
            "Tab Nilai di setiap mapel menampilkan nilai tugas, kuis, dan ujian yang sudah diumumkan.",
            "Menu Kehadiran menampilkan rekap hadir/izin/sakit/alpa semua mapel.",
            "Menu Rapor menampilkan rapor semester; pilih semester lain di kanan atas.",
            "Menu Jadwal menampilkan jadwal pelajaran mingguan kelas Anda.",
        ] },
        { judul: "Ujian sekolah & ujian mapel (CAT)", langkah: [
            "Buka menu Ujian Sekolah (atau tab Ujian di mapel) pada jadwal ujian. Masukkan token dari pengawas bila diminta.",
            "Ujian berjalan dalam layar penuh. Jangan pindah tab atau keluar dari layar penuh, karena dicatat sebagai pelanggaran dan pada batas tertentu jawaban dikumpulkan otomatis.",
            "Klik Tandai Ragu untuk soal yang ingin dicek lagi. Jawaban tersimpan otomatis, jadi bila komputer mati, masuk lagi dan lanjutkan.",
            "Klik Selesai Ujian setelah semua soal terjawab.",
        ] },
        { judul: "Lupa password", langkah: [
            "Di halaman masuk, klik Lupa password? lalu isi NIS.",
            "Bila sekolah mengaktifkan email/WhatsApp, kode 6 angka dikirim ke kontak Anda; masukkan kode dan password baru.",
            "Bila tidak, permintaan diteruskan ke wali kelas. Temui wali kelas untuk mendapatkan password sementara, lalu segera ganti.",
        ] },
    ],
    GURU: [
        { judul: "Menyiapkan mapel", langkah: [
            "Beranda menampilkan mapel yang Anda ampu dan daftar Perlu Dinilai.",
            "Di setiap mapel: tab Topik untuk menyusun bab/minggu, lalu isi Materi, Tugas, dan Kuis di topik itu.",
            "Materi & tugas bisa disimpan sebagai Draf, terbit sekarang, atau dijadwalkan terbit.",
            "Pengumuman di tab Beranda mapel tampil untuk semua siswa kelas itu.",
        ] },
        { judul: "Tugas & penilaian", langkah: [
            "Buat tugas dengan tenggat, nilai maksimal atau rubrik, dan pilih apakah boleh terlambat. Tugas bisa ditujukan ke siswa tertentu.",
            "Buka tugas untuk menilai: isi nilai/rubrik dan catatan, atau klik Minta Revisi. Unduh semua jawaban sekaligus dengan tombol ZIP.",
            "Remedial: dari tugas atau ujian, klik Remedial/Susulan dan pilih siswa di bawah KKM. Nilai yang masuk rapor mengikuti aturan remedial mapel.",
        ] },
        { judul: "Kuis & ujian mapel", langkah: [
            "Tab Kuis: buat kuis, tambah soal (PG, benar-salah, isian, esai). Soal bisa memuat gambar, audio, dan rumus (tombol + Gambar/Audio dan + Rumus).",
            "Simpan soal ke Bank Soal agar bisa dipakai lagi di kelas lain, atau ambil dari Bank Soal.",
            "Tab Ujian: buat UH/UTS/UAS offline (isi nilai) atau CAT (token, layar penuh). Pantau lewat tab Monitoring. Klik Umumkan Nilai bila nilai siap dilihat siswa.",
        ] },
        { judul: "Presensi & jurnal mengajar", langkah: [
            "Tab Presensi: buat pertemuan, isi H/I/S/A atau buka presensi mandiri dengan kode/QR. Tambahkan tautan Zoom/Meet bila kelas daring.",
            "Menu Jurnal Mengajar: catat tanggal, jam, materi, dan kegiatan setiap pertemuan. Siswa tidak hadir diambil otomatis dari presensi. Cetak untuk supervisi.",
            "Menu Jadwal menampilkan jadwal mengajar mingguan Anda.",
        ] },
        { judul: "Nilai akhir & rapor", langkah: [
            "Tab Nilai: atur bobot tugas/kuis/UH/UTS/UAS/presensi dan KKM. Isi deskripsi capaian tiap siswa (ada saran otomatis).",
            "Menu Rapor menampilkan rapor kelas yang Anda ajar.",
        ] },
    ],
    WALI: [
        { judul: "Tugas wali kelas", langkah: [
            "Admin menetapkan Anda sebagai wali kelas di menu Kelas & Mapel.",
            "Menu Rapor: buka kelas perwalian, klik nama siswa, lalu isi catatan wali kelas, ketidakhadiran (bila berbeda dari presensi), ekstrakurikuler, prestasi, kokurikuler, dan keputusan naik kelas (semester genap).",
            "Cetak rapor satu siswa atau semua siswa (Cetak / PDF).",
            "Menu Reset Password Siswa: tangani permintaan lupa password siswa kelas Anda. Berikan password sementara secara langsung kepada siswa.",
        ] },
    ],
    PENGAWAS: [
        { judul: "Saat ujian CAT", langkah: [
            "Masuk dengan akun pengawas; halaman Monitoring Ujian langsung terbuka (hanya peserta ruang Anda bila ruang diisi).",
            "Pantau status peserta: belum mulai, mengerjakan, selesai, jumlah terjawab, sisa waktu, dan pelanggaran.",
            "Bila perlu: Tambah Waktu (mis. komputer bermasalah), Kumpulkan paksa, atau Reset sesi (peserta mulai dari awal).",
            "Buka Berita Acara: cetak daftar hadir sebelum ujian untuk ditandatangani peserta, lalu isi waktu mulai/selesai dan catatan kejadian, simpan, dan cetak berita acara.",
        ] },
    ],
    ADMIN: [
        { judul: "Persiapan awal", langkah: [
            "Pengaturan: nama aplikasi, sekolah, logo, kop & penandatangan, semester aktif, batas predikat rapor.",
            "Guru & Staf: buat akun guru dan pengawas. Siswa: tambah/impor siswa (CSV atau ekspor Dapodik) dan isi kelasnya.",
            "Kelas & Mapel: buat kelas (bisa otomatis dari data siswa), mapel, guru pengampu, dan wali kelas. Jadwal Pelajaran: isi roster per kelas.",
            "Notifikasi (opsional): aktifkan email SMTP dan/atau WhatsApp gateway agar siswa menerima kode lupa password dan pengingat.",
        ] },
        { judul: "Modul Ujian CAT (ujian sekolah)", langkah: [
            "Menu Modul Ujian CAT → Kelola Ujian: buat ujian, atur durasi, jadwal, kelas peserta, dan pool soal. Beberapa ujian boleh aktif bersamaan untuk kelas yang berbeda.",
            "Bank Soal Ujian: tambah/impor soal (bisa bergambar, audio, rumus). Peserta & Ruang: atur ruang & sesi per kelas. Kartu Ujian: cetak. Bila sekolah tidak memakai ujian CAT, nonaktifkan modulnya di Pengaturan.",
            "Aktifkan ujian pada hari H. Pantau di Monitoring. Berita acara per ruang bisa dilihat & dicetak.",
            "Hasil Ujian, Statistik, dan Analisis Soal tersedia setelah ujian.",
        ] },
        { judul: "Akhir semester & kenaikan kelas", langkah: [
            "Pastikan nilai sudah lengkap dan rapor dicetak.",
            "Pengaturan → Semester: tambah dan aktifkan semester baru. Keanggotaan kelas semester lama diarsipkan otomatis.",
            "Siswa → pindahkan / naikkan kelas secara massal. Rapor & nilai semester lalu tetap bisa dibuka.",
            "Ekspor nilai untuk e-Rapor dari menu Rapor (tombol Ekspor e-Rapor).",
            "Backup & Restore: unduh backup sebelum dan sesudah kegiatan penting.",
        ] },
    ],
};

const URUT: Peran[] = ["PESERTA", "ORANGTUA", "GURU", "WALI", "PENGAWAS", "ADMIN"];
const UNTUK: Record<string, Peran[]> = { ORANGTUA: ["ORANGTUA"], PESERTA: ["PESERTA"], GURU: ["GURU", "WALI"], PENGAWAS: ["PENGAWAS"], ADMIN: URUT };

export default function Panduan() {
    const [role, setRole] = useState<string | null>(null);
    const [pilih, setPilih] = useState<Peran | null>(null);
    const [aplikasi, setAplikasi] = useState("E-Learning");

    useEffect(() => {
        let ignore = false;
        fetch("/api/me").then((r) => r.json()).then((d) => { if (!ignore) setRole(d.role ?? "PESERTA"); }).catch(() => {});
        muatIdentitas().then((d) => { if (!ignore && d) setAplikasi(d.namaAplikasi); });
        return () => { ignore = true; };
    }, []);

    const boleh = role ? UNTUK[role] ?? ["PESERTA"] : [];
    const aktif = pilih && boleh.includes(pilih) ? pilih : boleh[0];

    return (
        <div className="min-h-screen bg-slate-100 font-sans print:bg-white">
            <HeaderHalaman grup="Bantuan" judul="Panduan Penggunaan">
                {boleh.length > 1 && (
                    <select value={aktif} onChange={(e) => setPilih(e.target.value as Peran)} aria-label="Panduan untuk" className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-semibold">
                        {boleh.map((p) => <option key={p} value={p}>{NAMA[p]}</option>)}
                    </select>
                )}
                <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Cetak / Simpan PDF</button>
            </HeaderHalaman>
            <main className="max-w-3xl mx-auto p-4 md:p-8 print:p-0">
                {aktif && (
                    <article className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 print:border-0 print:p-0">
                        <h2 className="text-2xl font-black text-slate-800">Panduan {NAMA[aktif]}</h2>
                        <p className="text-sm text-slate-500 mb-6">{aplikasi}</p>
                        {PANDUAN[aktif].map((b, i) => (
                            <section key={b.judul} className="mb-6 break-inside-avoid">
                                <h3 className="font-bold text-indigo-700 mb-2">{i + 1}. {b.judul}</h3>
                                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-700 leading-relaxed">
                                    {b.langkah.map((l) => <li key={l}>{l}</li>)}
                                </ol>
                            </section>
                        ))}
                    </article>
                )}
            </main>
        </div>
    );
}
