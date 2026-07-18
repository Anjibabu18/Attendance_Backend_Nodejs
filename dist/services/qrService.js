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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateApprovedDevice = exports.deviceApproved = exports.qrResponse = exports.validateQr = exports.internalDailyCodeForQr = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const crypto = __importStar(require("crypto"));
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
    const qrToken = await prisma_1.default.officeQrToken.findUnique({
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
    const user = await prisma_1.default.appUser.findUnique({
        where: { username },
        include: { employee: true }
    });
    if (!user || !user.employee)
        return false;
    const employee = user.employee;
    // Backward compatibility: check if it matches the legacy single fingerprint
    if (employee.deviceFingerprint === deviceId) {
        return true;
    }
    // Check the new DeviceRequest table for an approved row for this device
    const approvedReq = await prisma_1.default.deviceRequest.findFirst({
        where: {
            employeeId: employee.id,
            deviceId: deviceId,
            approved: true
        }
    });
    return !!approvedReq;
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
