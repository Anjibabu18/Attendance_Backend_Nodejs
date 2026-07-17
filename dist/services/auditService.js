"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditCsv = exports.listAuditEvents = exports.logFaceVerification = exports.logQrScan = exports.logPunchAudit = exports.clientMeta = exports.tokenHash = void 0;
const client_1 = require("@prisma/client");
const crypto = __importStar(require("crypto"));
const prisma = new client_1.PrismaClient();
const auditUnavailable = (error) => error?.code === 'P2021' || error?.code === 'P2022' || String(error?.message || '').includes('punch_audit_logs') || String(error?.message || '').includes('qr_scan_audit_logs') || String(error?.message || '').includes('face_verification_logs');
const tokenHash = (token) => {
    if (!token)
        return null;
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 64);
};
exports.tokenHash = tokenHash;
const clientMeta = (req) => {
    const forwarded = req?.headers?.['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req?.socket?.remoteAddress || req?.ip || '').split(',')[0].trim();
    return {
        ipAddress: ip || null,
        userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null,
    };
};
exports.clientMeta = clientMeta;
const logPunchAudit = async (data) => {
    try {
        await prisma.punchAuditLog.create({
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
    }
    catch (error) {
        if (!auditUnavailable(error))
            console.warn('Punch audit log failed', error.message);
    }
};
exports.logPunchAudit = logPunchAudit;
const logQrScan = async (data) => {
    try {
        await prisma.qrScanAuditLog.create({
            data: {
                employeeId: data.employeeId ?? null,
                officeLocationId: data.officeLocationId ?? null,
                qrTokenId: data.qrTokenId ?? null,
                tokenHash: (0, exports.tokenHash)(data.token),
                mode: data.mode ?? null,
                status: data.status,
                reason: data.reason ? String(data.reason).slice(0, 500) : null,
                ipAddress: data.ipAddress ?? null,
                userAgent: data.userAgent ?? null,
            },
        });
    }
    catch (error) {
        if (!auditUnavailable(error))
            console.warn('QR audit log failed', error.message);
    }
};
exports.logQrScan = logQrScan;
const logFaceVerification = async (data) => {
    try {
        await prisma.faceVerificationLog.create({
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
    }
    catch (error) {
        if (!auditUnavailable(error))
            console.warn('Face verification log failed', error.message);
    }
};
exports.logFaceVerification = logFaceVerification;
const serialize = (row, type) => ({
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
const listAuditEvents = async (limit = 80) => {
    try {
        const take = Math.min(Math.max(limit, 1), 300);
        const [punch, qr, face] = await Promise.all([
            prisma.punchAuditLog.findMany({ include: { employee: true }, orderBy: { createdAt: 'desc' }, take }),
            prisma.qrScanAuditLog.findMany({ include: { employee: true }, orderBy: { createdAt: 'desc' }, take }),
            prisma.faceVerificationLog.findMany({ include: { employee: true }, orderBy: { createdAt: 'desc' }, take }),
        ]);
        return [...punch.map((row) => serialize(row, 'PUNCH')), ...qr.map((row) => serialize(row, 'QR_SCAN')), ...face.map((row) => serialize(row, 'FACE'))]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, take);
    }
    catch (error) {
        if (auditUnavailable(error))
            return [];
        throw error;
    }
};
exports.listAuditEvents = listAuditEvents;
const auditCsv = async () => {
    const rows = await (0, exports.listAuditEvents)(500);
    const header = ['type', 'id', 'employeeNumber', 'employeeName', 'status', 'action', 'stage', 'reason', 'officeLocationId', 'faceScore', 'faceVerified', 'createdAt'];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [header.join(','), ...rows.map((row) => header.map((key) => escape(row[key])).join(','))].join('\n');
};
exports.auditCsv = auditCsv;
