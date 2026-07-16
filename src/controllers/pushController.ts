import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getVapidPublicKey, saveSubscription, removeSubscription, removeAllSubscriptions, sendPushToUser } from '../services/pushService';

const prisma = new PrismaClient();

async function currentUserId(req: Request) {
  const authUser = (req as any).user;
  if (!authUser?.username) return null;
  const user = await prisma.appUser.findUnique({ where: { username: authUser.username } });
  return user?.id ?? null;
}

export async function vapidKey(req: Request, res: Response) {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(500).json({ error: 'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env' });
  }
  res.json({ publicKey: key });
}

export async function subscribe(req: Request, res: Response) {
  try {
    const userId = await currentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await saveSubscription(userId, subscription);
    res.json({ ok: true, message: 'Push subscription saved' });
  } catch (error: any) {
    console.error('[Push] Subscribe error:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function unsubscribe(req: Request, res: Response) {
  try {
    const userId = await currentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { endpoint } = req.body;
    if (endpoint) {
      await removeSubscription(userId, endpoint);
    } else {
      await removeAllSubscriptions(userId);
    }
    res.json({ ok: true, message: 'Push subscription removed' });
  } catch (error: any) {
    console.error('[Push] Unsubscribe error:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function testPush(req: Request, res: Response) {
  try {
    const userId = await currentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await sendPushToUser(userId, {
      title: 'Test Notification',
      body: 'Push notifications are working. You will receive punch-in and punch-out reminders.',
      icon: '/favicon.ico',
      url: '/employee',
    });

    res.json({ ok: true, message: 'Test notification sent' });
  } catch (error: any) {
    console.error('[Push] Test error:', error);
    res.status(400).json({ error: error.message });
  }
}
