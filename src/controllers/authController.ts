import { Request, Response } from 'express';
import { z } from 'zod';
import { findByUsername, updateLastLogin, verifyPassword } from '../services/userService';
import { createAccessToken, createRefreshToken, verifyToken } from '../utils/jwt';
import { AuthRequest } from '../middlewares/authMiddleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const getClientAddress = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const remoteAddress = getClientAddress(req);

    // TODO: loginAttemptService.assertAllowed(username, remoteAddress)

    const user = await findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid login' });
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      // TODO: loginAttemptService.recordFailure(...)
      return res.status(401).json({ error: 'Invalid login' });
    }

    if (!user.enabled) {
      return res.status(401).json({ error: 'User is disabled' });
    }

    // Record success
    const userAgent = req.headers['user-agent'];
    await updateLastLogin(user.id, remoteAddress, userAgent);

    // Generate tokens
    const accessToken = createAccessToken(user.username, user.role);
    const refreshToken = createRefreshToken(user.username, user.role);

    // If employee, fetch employee details
    if (user.role === 'ROLE_EMPLOYEE') {
      const employee = await prisma.employee.findUnique({
        where: { userId: user.id },
      });
      if (!employee) {
        return res.status(409).json({ error: 'Employee profile missing' });
      }
      return res.json({
        token: accessToken,
        refreshToken,
        role: user.role,
        employeeId: employee.id,
        name: employee.name,
      });
    }

    return res.json({
      token: accessToken,
      refreshToken,
      role: user.role,
      employeeId: null,
      name: user.username,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: (error as any).errors });
    }
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token type' });
    }

    const username = decoded.sub as string;
    const role = decoded.role;

    const user = await findByUsername(username);
    if (!user || !user.enabled) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    const newAccessToken = createAccessToken(username, role);
    const newRefreshToken = createRefreshToken(username, role);

    return res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error: any) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

export const me = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({
    username: req.user.username,
    role: req.user.role,
  });
};
