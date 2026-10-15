import { NextResponse } from 'next/server';
import { verifyLmsSession } from '@/lib/lms';
import { semesterDipilih, daftarSemester } from '@/lib/semester';
import { rekapKehadiran } from '@/lib/kehadiran';

// Rekap kehadiran siswa sendiri lintas mapel per semester (?semester=id): per mapel H/I/S/A & persen,
// plus riwayat per pertemuan. Pertemuan yang sudah berlangsung tanpa isian dihitung "belum diisi".
export async function GET(request: Request) {
  const auth = await verifyLmsSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
  const { user } = auth;
  if (user.role !== 'PESERTA') return NextResponse.json({ message: 'Halaman ini untuk siswa' }, { status: 403 });

  try {
    const semester = await semesterDipilih(new URL(request.url).searchParams.get('semester'));
    const semesterList = (await daftarSemester()).map((s) => ({ id: s.id, label: s.label, aktif: s.aktif }));
    return NextResponse.json({
      semester: { id: semester.id, label: semester.label, aktif: semester.aktif },
      semesterList,
      ...(await rekapKehadiran(user.id, semester)),
    });
  } catch (error) {
    console.error('ERROR KEHADIRAN:', error);
    return NextResponse.json({ message: 'Gagal memuat kehadiran' }, { status: 500 });
  }
}
