import prisma from '../prisma';

import * as crypto from 'crypto';


const todayKey = () => new Date().toISOString().slice(0, 10);

export const internalDailyCodeForQr = (token: string) => {
  const digest = crypto
    .createHash('sha256')
    .update(`${token}:${todayKey()}:attendance-daily-code`)
    .digest('hex');

  return String(parseInt(digest.slice(0, 8), 16) % 10000).padStart(4, '0');
};

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
  return {
    valid: true,
    token: qrToken.token,
    officeId: qrToken.officeLocation.id,
    officeName: qrToken.officeLocation.officeName,
    createdAt: qrToken.createdAt,
    expiresAt: qrToken.expiresAt,
    printedQrExpiresAt: qrToken.expiresAt,
    dailyCode: internalDailyCodeForQr(qrToken.token),
    mode: 'PERMANENT_OFFICE_QR_AUTO_CODE'
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
  
  // Backward compatibility: check if it matches the legacy single fingerprint
  if (employee.deviceFingerprint === deviceId) {
    return true;
  }

  // Check the new DeviceRequest table for an approved row for this device
  const approvedReq = await prisma.deviceRequest.findFirst({
    where: {
      employeeId: employee.id,
      deviceId: deviceId,
      approved: true
    }
  });

  return !!approvedReq;
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

