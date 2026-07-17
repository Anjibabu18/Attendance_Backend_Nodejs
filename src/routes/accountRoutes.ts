import prisma from '../prisma';
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { requireAuth } from '../middlewares/authMiddleware';
import { verifyPassword } from '../services/userService';

const router = Router();


router.use(requireAuth);

router.post('/password', async (req, res) => {
  try {
    const username = (req as any).user.username as string;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Current password and a new password of at least 6 characters are required' });
    }

    const user = await prisma.appUser.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });

    await prisma.appUser.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/devices/current', async (req: any, res) => {
  const deviceId = String(req.query.deviceId || '');
  if (!deviceId) return res.json({ deviceId, approved: false, registered: false });
  const user = await prisma.appUser.findUnique({ where: { username: req.user.username }, include: { employee: true } });
  if (!user || !user.employee) return res.json({ deviceId, approved: false, registered: false });
  
  if (user.employee.deviceFingerprint === deviceId) {
    return res.json({ deviceId, approved: true, registered: true });
  }

  const reqObj = await prisma.deviceRequest.findFirst({ where: { employeeId: user.employee.id, deviceId } });
  res.json({ deviceId, approved: false, registered: !!reqObj });
});

router.post('/devices/register', async (req: any, res) => {
  try {
    const { deviceId, label } = req.body;
    if (!deviceId) throw new Error('Device ID is required');
    const user = await prisma.appUser.findUnique({ where: { username: req.user.username }, include: { employee: true } });
    if (!user || !user.employee) throw new Error('Employee not found');

    const existing = await prisma.deviceRequest.findFirst({ where: { employeeId: user.employee.id, deviceId } });
    if (existing) return res.json({ ok: true, message: 'Already pending' });

    await prisma.deviceRequest.create({
      data: {
        employeeId: user.employee.id,
        deviceId,
        label: label || 'Mobile Device'
      }
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;

