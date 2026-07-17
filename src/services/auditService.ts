import prisma from '../prisma';

import * as crypto from 'crypto';



const auditUnavailable = (error: any) =>
  error?.code === 'P2021' || error?.code === 'P2022' || String(error?.message || '').includes('punch_audit_logs') || String(error?.message || '').includes('qr_scan_audit_logs') || String(error?.message || '').includes('face_verification_logs');

export const tokenHash = (token?: string | null) => {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 64);
};

export const clientMeta = (req: any) => {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req?.socket?.remoteAddress || req?.ip || '').split(',')[0].trim();
  return {
    ipAddress: ip || null,
    userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null,
  };
};

export const logPunchAudit = async (data: {
  employeeId?: number | null;
  action: string;
  stage: string;
  status: string;
  reason?: string | null;
  deviceId?: string | null;
  officeLocationId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  faceScore?: number | null;
  faceVerified?: boolean | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) => {
  try {
    await (prisma as any).punchAuditLog.create({
      data: {
        employeeId: data.employeeId ?? null,
        action: data.action,
        stage: data.stage,
        status: data.status,
        reason: data.reason ? String(data.reason).slice(0, 500) : null,
        deviceId: data.deviceId ? String(data.deviceId).slice(0, 120) : null,
        officeLocationId: data.officeLocationId ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        faceScore: data.faceScore ?? null,
        faceVerified: data.faceVerified ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  } catch (error: any) {
    if (!auditUnavailable(error)) console.warn('Punch audit log failed', error.message);
  }
};

export const logQrScan = async (data: {
  employeeId?: number | null;
  officeLocationId?: number | null;
  qrTokenId?: number | null;
  token?: string | null;
  mode?: string | null;
  status: string;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) => {
  try {
    await (prisma as any).qrScanAuditLog.create({
      data: {
        employeeId: data.employeeId ?? null,
        officeLocationId: data.officeLocationId ?? null,
        qrTokenId: data.qrTokenId ?? null,
        tokenHash: tokenHash(data.token),
        mode: data.mode ?? null,
        status: data.status,
        reason: data.reason ? String(data.reason).slice(0, 500) : null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  } catch (error: any) {
    if (!auditUnavailable(error)) console.warn('QR audit log failed', error.message);
  }
};

export const logFaceVerification = async (data: {
  employeeId: number;
  attendanceEntryId?: number | null;
  action: string;
  similarityScore?: number | null;
  verified: boolean;
  message?: string | null;
  photoUrl?: string | null;
}) => {
  try {
    await (prisma as any).faceVerificationLog.create({
      data: {
        employeeId: data.employeeId,
        attendanceEntryId: data.attendanceEntryId ?? null,
        action: data.action,
        similarityScore: data.similarityScore ?? null,
        verified: data.verified,
        message: data.message ? String(data.message).slice(0, 500) : null,
        photoUrl: data.photoUrl ?? null,
      },
    });
  } catch (error: any) {
    if (!auditUnavailable(error)) console.warn('Face verification log failed', error.message);
  }
};

const serialize = (row: any, type: string) => ({
  type,
  id: row.id,
  employeeId: row.employeeId ?? null,
  employeeName: row.employee?.name || null,
  employeeNumber: row.employee?.employeeNumber || null,
  status: row.status ?? (row.verified === true ? 'VERIFIED' : row.verified === false ? 'FAILED' : null),
  action: row.action || row.mode || type,
  stage: row.stage || null,
  reason: row.reason || row.message || null,
  officeLocationId: row.officeLocationId ?? null,
  faceScore: row.faceScore ?? row.similarityScore ?? null,
  faceVerified: row.faceVerified ?? row.verified ?? null,
  createdAt: row.createdAt,
});

export const listAuditEvents = async (limit = 80) => {
  try {
    const take = Math.min(Math.max(limit, 1), 300);
    const [punch, qr, face] = await Promise.all([
      (prisma as any).punchAuditLog.findMany({ include: { employee: true }, orderBy: { createdAt: 'desc' }, take }),
      (prisma as any).qrScanAuditLog.findMany({ include: { employee: true }, orderBy: { createdAt: 'desc' }, take }),
      (prisma as any).faceVerificationLog.findMany({ include: { employee: true }, orderBy: { createdAt: 'desc' }, take }),
    ]);
    return [...punch.map((row: any) => serialize(row, 'PUNCH')), ...qr.map((row: any) => serialize(row, 'QR_SCAN')), ...face.map((row: any) => serialize(row, 'FACE'))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, take);
  } catch (error: any) {
    if (auditUnavailable(error)) return [];
    throw error;
  }
};

export const auditCsv = async () => {
  const rows = await listAuditEvents(500);
  const header = ['type','id','employeeNumber','employeeName','status','action','stage','reason','officeLocationId','faceScore','faceVerified','createdAt'];
  const escape = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [header.join(','), ...rows.map((row) => header.map((key) => escape((row as any)[key])).join(','))].join('\n');
};
