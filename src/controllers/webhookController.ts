import { Request as Req, Response as Res } from 'express';
import { PrismaClient } from '@prisma/client';
import { checkIn, checkOut } from '../services/attendancePunchService';

const prisma = new PrismaClient();
const WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET || 'zkt-biometric-secret-2026';

export const biometricPunch = async (req: Req, res: Res) => {
  try {
    const { secret, employeeNumber, timestamp, punchType } = req.body;

    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized webhook secret' });
    }

    if (!employeeNumber || !timestamp || !punchType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeNumber }
    });

    if (!employee) {
      return res.status(404).json({ error: `Employee not found: ${employeeNumber}` });
    }

    // Since this is a hardware punch, we don't have GPS or a selfie photo.
    // We will pass 0, 0 for lat/lng, and a small empty buffer for photo, 
    // or ideally the services support null. But checkIn requires a Buffer.
    const emptyPhotoBuffer = Buffer.from('');
    
    let entry;
    if (punchType === 'IN') {
      entry = await checkIn(employee, 0, 0, emptyPhotoBuffer, null, true);
    } else if (punchType === 'OUT') {
      entry = await checkOut(employee, 0, 0, emptyPhotoBuffer, null, true);
    } else {
      return res.status(400).json({ error: 'Invalid punchType. Must be IN or OUT' });
    }

    return res.json({ success: true, entry });
  } catch (error: any) {
    console.error('Biometric webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
};
