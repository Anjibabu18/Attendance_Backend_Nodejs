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
