import prisma from '../prisma';
import { AppUser } from '@prisma/client';
import { sendPushToUser } from './pushService';



export const notify = async (userId: number | undefined | null, title: string, message: string) => {
  if (!userId) return null;
  const dbNotification = await prisma.notification.create({ data: { userId, title, message } });
  
  // Also send Web Push Notification
  try {
    await sendPushToUser(userId, {
      title,
      body: message,
      icon: '/pwa-192x192.png',
      url: '/employee/more'
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
