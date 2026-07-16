import { PrismaClient, AppUser } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const findByUsername = async (username: string): Promise<AppUser | null> => {
  return prisma.appUser.findUnique({
    where: { username },
  });
};

export const updateLastLogin = async (
  userId: number,
  ip: string,
  userAgent: string | undefined
) => {
  return prisma.appUser.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      lastUserAgent: userAgent ? userAgent.substring(0, 255) : null,
    },
  });
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
