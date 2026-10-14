import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getInstansi, setInstansi, WARNA_KARTU, MODEL_KARTU } from '@/lib/pengaturan-aplikasi';
import { createAuditLog, getAuditIP, AUDIT_ACTIONS } from '@/lib/audit-log';

export async function GET() {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    return NextResponse.json(await getInstansi());
  } catch (error) {
    console.error('ERROR GET INSTANSI:', error);
    return NextResponse.json({ message: 'Gagal mengambil data instansi' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyAdminSession();
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });

  try {
    const body = await request.json();
    // Logo hanya boleh dari hasil upload aplikasi ini
    if (body.logo && !/^\/(api\/foto|uploads\/fotos)\/[\w-]+\.(jpg|jpeg|png|webp)$/i.test(body.logo)) {
      return NextResponse.json({ message: 'Logo tidak valid' }, { status: 400 });
    }
    if (body.warnaKartu !== undefined && !(WARNA_KARTU as readonly string[]).includes(body.warnaKartu)) {
      return NextResponse.json({ message: 'Warna kartu tidak valid' }, { status: 400 });
    }
    if (body.modelKartu !== undefined && !(MODEL_KARTU as readonly string[]).includes(body.modelKartu)) {
      return NextResponse.json({ message: 'Model kartu tidak valid' }, { status: 400 });
    }
    const data = await setInstansi(body);
    await createAuditLog({ action: AUDIT_ACTIONS.UPDATE_PENGATURAN, target: 'Identitas instansi', ipAddress: getAuditIP(request) });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('ERROR PUT INSTANSI:', error);
    return NextResponse.json({ message: 'Gagal menyimpan data instansi' }, { status: 500 });
  }
}
