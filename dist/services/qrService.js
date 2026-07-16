"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateApprovedDevice = exports.deviceApproved = exports.qrResponse = exports.validateQr = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const validateQr = async (token) => {
    let actualToken = token;
    if (token && token.includes('qrToken=')) {
        try {
            const idx = token.indexOf('qrToken=');
            actualToken = token.substring(idx + 8);
            const ampIdx = actualToken.indexOf('&');
            if (ampIdx !== -1) {
                actualToken = actualToken.substring(0, ampIdx);
            }
            actualToken = actualToken.trim();
        }
        catch (e) {
            // ignore
        }
    }
    const qrToken = await prisma.officeQrToken.findUnique({
        where: { token: actualToken },
        include: { officeLocation: true },
    });
    if (!qrToken) {
        throw new Error('Invalid QR token');
    }
    if (qrToken.expiresAt < new Date()) {
        throw new Error('QR token expired');
    }
    return qrToken;
};
exports.validateQr = validateQr;
const qrResponse = async (qrToken) => {
    return {
        valid: true,
        token: qrToken.token,
        officeId: qrToken.officeLocation.id,
        officeName: qrToken.officeLocation.officeName,
        createdAt: qrToken.createdAt,
        expiresAt: qrToken.expiresAt,
        printedQrExpiresAt: qrToken.expiresAt,
        dailyCode: '',
        mode: 'PERMANENT_OFFICE_QR'
    };
};
exports.qrResponse = qrResponse;
// Device validation
const deviceApproved = async (username, deviceId) => {
    if (!deviceId)
        return false;
    const user = await prisma.appUser.findUnique({
        where: { username },
        include: { employee: true }
    });
    if (!user || !user.employee)
        return false;
    const employee = user.employee;
    // If fingerprint is not set, bind the device automatically
    if (!employee.deviceFingerprint) {
        await prisma.employee.update({
            where: { id: employee.id },
            data: { deviceFingerprint: deviceId }
        });
        return true;
    }
    // Return true if the requested deviceId matches the stored fingerprint
    return employee.deviceFingerprint === deviceId;
};
exports.deviceApproved = deviceApproved;
const validateApprovedDevice = async (username, deviceId) => {
    if (!deviceId) {
        throw new Error('Device approval is required before punch');
    }
    const approved = await (0, exports.deviceApproved)(username, deviceId);
    if (!approved) {
        throw new Error('This device is not approved for attendance punch');
    }
};
exports.validateApprovedDevice = validateApprovedDevice;
