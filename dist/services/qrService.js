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
exports.validateApprovedDevice = exports.deviceApproved = exports.qrResponse = exports.validateQr = exports.internalDailyCodeForQr = void 0;
const client_1 = require("@prisma/client");
const crypto = __importStar(require("crypto"));
const prisma = new client_1.PrismaClient();
const todayKey = () => new Date().toISOString().slice(0, 10);
const internalDailyCodeForQr = (token) => {
    const digest = crypto
        .createHash('sha256')
        .update(`${token}:${todayKey()}:attendance-daily-code`)
        .digest('hex');
    return String(parseInt(digest.slice(0, 8), 16) % 10000).padStart(4, '0');
};
exports.internalDailyCodeForQr = internalDailyCodeForQr;
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
        dailyCode: (0, exports.internalDailyCodeForQr)(qrToken.token),
        mode: 'PERMANENT_OFFICE_QR_AUTO_CODE'
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
