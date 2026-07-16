import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { PrismaClient } from '@prisma/client';
import { getEmployeeStreaks } from '../services/streaksService';

const prisma = new PrismaClient();

export const getStreaks = async (req: AuthRequest, res: Response) => {
  try {
    const username = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.appUser.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const streaks = await getEmployeeStreaks(employee.id);
    res.json(streaks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
