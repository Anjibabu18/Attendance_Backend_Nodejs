import prisma from '../prisma';
import { AppUser } from '@prisma/client';
import { sendPushToUser } from './pushService';
import { Response } from 'express';

export const sseClients = new Map<number, Set<Response>>();

export const addSseClient = (userId: number, res: Response) => {
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  sseClients.get(userId)!.add(res);

  res.on('close', () => {
    const clients = sseClients.get(userId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(userId);
    }
  });
};

export const pushToSseClients = (userId: number, data: any) => {
  const clients = sseClients.get(userId);
  if (clients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => res.write(payload));
  }
};

export const notify = async (userId: number | undefined | null, title: string, message: string) => {
  if (!userId) return null;
  const dbNotification = await prisma.notification.create({ data: { userId, title, message } });
  
  pushToSseClients(userId, dbNotification);

  try {
    await sendPushToUser(userId, {
      title,
      body: message,
      icon: '/pwa-192x192.png',
      url: '/employee'
    });
  } catch (err) {
    console.error(`[Notify] Failed to send push to user ${userId}:`, err);
  }
  
  return dbNotification;
};

export const notifyUsername = async (username: string | undefined | null, title: string, message: string) => {
  if (!username) return null;
  const user = await prisma.appUser.findUnique({ where: { username } });
  return notify(user?.id, title, message);
};

export const notifyUserRecord = async (user: Pick<AppUser, 'id'> | undefined | null, title: string, message: string) => {
  return notify(user?.id, title, message);
};

export const notifyAllHr = async (title: string, message: string) => {
  const hrUsers = await prisma.appUser.findMany({ where: { role: 'ROLE_HR' } });
  await Promise.allSettled(hrUsers.map(u => notify(u.id, title, message)));
};

export const notifyAllByRole = async (role: string, title: string, message: string) => {
  const users = await prisma.appUser.findMany({ where: { role } });
  await Promise.allSettled(users.map(u => notify(u.id, title, message)));
};
