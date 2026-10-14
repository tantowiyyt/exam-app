import { prisma } from './prisma';
import { getSession } from './session';

export interface AuditLogData {
  action: string;
  target?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    const session = await getSession();
    const userId = session ? await getUserId(session.nomorPeserta) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        action: data.action,
        target: data.target,
        details: data.details ? JSON.stringify(data.details) : null,
        ipAddress: data.ipAddress,
      },
    });
  } catch (error) {
    // Audit logging should not throw errors
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Get user ID from nomorPeserta
 */
async function getUserId(nomorPeserta: string): Promise<number | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { nomorPeserta },
      select: { id: true },
    });
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Get client IP from request
 */
export function getAuditIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '127.0.0.1';
}

/**
 * Audit log actions
 */
export const AUDIT_ACTIONS = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',

  // Soal
  CREATE_SOAL: 'CREATE_SOAL',
  UPDATE_SOAL: 'UPDATE_SOAL',
  DELETE_SOAL: 'DELETE_SOAL',
  BULK_IMPORT_SOAL: 'BULK_IMPORT_SOAL',
  BULK_DELETE_SOAL: 'BULK_DELETE_SOAL',

  // Peserta
  CREATE_PESERTA: 'CREATE_PESERTA',
  UPDATE_PESERTA: 'UPDATE_PESERTA',
  DELETE_PESERTA: 'DELETE_PESERTA',
  BULK_IMPORT_PESERTA: 'BULK_IMPORT_PESERTA',
  RESET_PESERTA: 'RESET_PESERTA',
  RESET_ALL_PESERTA: 'RESET_ALL_PESERTA',

  // Ujian
  CREATE_UJIAN: 'CREATE_UJIAN',
  UPDATE_UJIAN: 'UPDATE_UJIAN',
  DELETE_UJIAN: 'DELETE_UJIAN',
  START_UJIAN: 'START_UJIAN',
  END_UJIAN: 'END_UJIAN',

  // Pengaturan
  UPDATE_PENGATURAN: 'UPDATE_PENGATURAN',

  // Backup
  BACKUP_DATABASE: 'BACKUP_DATABASE',
  RESTORE_DATABASE: 'RESTORE_DATABASE',

  // IP Rules
  CREATE_IP_RULE: 'CREATE_IP_RULE',
  DELETE_IP_RULE: 'DELETE_IP_RULE',

  // Ujian Peserta
  START_UJIAN_PESERTA: 'START_UJIAN_PESERTA',
  SUBMIT_UJIAN: 'SUBMIT_UJIAN',
} as const;