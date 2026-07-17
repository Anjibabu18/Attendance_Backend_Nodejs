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

router.get('/devices/current', async (req, res) => {
  res.json({ deviceId: String(req.query.deviceId || ''), approved: true, registered: true });
});

export default router;

