import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getSession } from '@/lib/session';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    // Ambil aktivitas terakhir untuk setiap user (5 menit terakhir dianggap online)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const activities = await prisma.userActivity.findMany({
      where: {
        createdAt: { gte: fiveMinutesAgo },
      },
      include: { user: { select: { id: true, nama: true, nomorPeserta: true, ruang: true, sesi: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Group by user to get latest activity per user
    const userMap = new Map<number, typeof activities[0]>();
    for (const activity of activities) {
      if (!userMap.has(activity.userId) || userMap.get(activity.userId)!.createdAt < activity.createdAt) {
        userMap.set(activity.userId, activity);
      }
    }

    const onlineUsers = Array.from(userMap.values());

    // Get all users with their status
    const allPeserta = await prisma.user.findMany({
      where: { role: 'PESERTA' },
      select: {
        id: true,
        nama: true,
        nomorPeserta: true,
        ruang: true,
        sesi: true,
        sudahUjian: true,
        nilai: true,
      },
    });

    // Mark online/offline status
    const usersWithStatus = allPeserta.map((user) => {
      const lastActivity = userMap.get(user.id);
      return {
        ...user,
        isOnline: !!lastActivity,
        lastActivity: lastActivity?.activity || null,
        lastActivityTime: lastActivity?.createdAt || null,
      };
    });

    return NextResponse.json({
      onlineCount: onlineUsers.length,
      totalPeserta: allPeserta.length,
      users: usersWithStatus,
    });
  } catch (error) {
    console.error('ERROR PADA GET ACTIVITY:', error);
    return NextResponse.json({ message: 'Gagal mengambil data aktivitas' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { activity, details } = body;

    const ALLOWED = ['LOGIN', 'LOGOUT', 'START_UJIAN', 'ANSWER_SOAL', 'SUBMIT_UJIAN', 'IDLE'];
    if (typeof activity !== 'string' || !ALLOWED.includes(activity)) {
      return NextResponse.json({ message: 'Aktivitas tidak valid' }, { status: 400 });
    }

    // Find user by nomorPeserta
    const user = await prisma.user.findUnique({
      where: { nomorPeserta: session.nomorPeserta },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const userAgent = request.headers.get('user-agent') || '';
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0] || '127.0.0.1';

    await prisma.userActivity.create({
      data: {
        userId: user.id,
        activity,
        details: details ? JSON.stringify(details).slice(0, 1000) : null,
        ipAddress,
        userAgent,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ERROR PADA POST ACTIVITY:', error);
    return NextResponse.json({ message: 'Gagal mencatat aktivitas' }, { status: 500 });
  }
}