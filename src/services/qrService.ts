import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

export const validateQr = async (token: string) => {
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
    } catch (e) {
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

export const qrResponse = async (qrToken: any) => {
  // Hardcoded to true to fulfill the permanent QR feature request
  const permanent = true;
  
  let dailyCode = "";
  let mode = "ROTATING_TOKEN";

  if (permanent) {
    mode = "FIXED_QR_DAILY_CODE";
    const dateStr = new Date().toISOString().split('T')[0];
    const hash = crypto.createHash('sha256').update(qrToken.token + dateStr).digest('hex');
    // 4 digit code
    dailyCode = String(parseInt(hash.substring(0, 6), 16) % 10000).padStart(4, '0');
  }
  
  return {
    valid: true,
    token: qrToken.token,
    officeId: qrToken.officeLocation.id,
    officeName: qrToken.officeLocation.officeName,
    createdAt: qrToken.createdAt,
    expiresAt: qrToken.expiresAt,
    printedQrExpiresAt: permanent ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) : qrToken.expiresAt,
    dailyCode,
    mode
  };
};

// Device validation
export const deviceApproved = async (username: string, deviceId: string) => {
  if (!deviceId) return false;
  
  const user = await prisma.appUser.findUnique({
    where: { username },
    include: { employee: true }
  });
  
  if (!user || !user.employee) return false;
  
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

export const validateApprovedDevice = async (username: string, deviceId: string) => {
  if (!deviceId) {
    throw new Error('Device approval is required before punch');
  }
  const approved = await deviceApproved(username, deviceId);
  if (!approved) {
    throw new Error('This device is not approved for attendance punch');
  }
};
