import prisma from '../prisma';
import webpush from 'web-push';




// VAPID keys - generate once and store in .env
// To generate: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BNmGKMN4Pw_i8D-TD7530d2JumVFRegA-kw-IMdqdyJmb6OUz78rmzu7-QWnQ0bChTE9OrhVkO4O588vf16VgHQ';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'YuKagrj32k3VEFx7GPWy4A7tj5iBZ7280U4MvNKx858';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@attendance.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export async function saveSubscription(userId: number, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  return prisma.pushSubscription.upsert({
    where: {
      uk_push_sub_user_endpoint: {
        userId,
        endpoint: subscription.endpoint,
      },
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function removeSubscription(userId: number, endpoint: string) {
  return prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
}

export async function removeAllSubscriptions(userId: number) {
  return prisma.pushSubscription.deleteMany({
    where: { userId },
  });
}

export async function sendPushToUser(userId: number, payload: { title: string; body: string; icon?: string; url?: string }) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const jsonPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload
        );
      } catch (err: any) {
        // If subscription is expired/invalid (410 Gone or 404), remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        throw err;
      }
    })
  );

  return results;
}

export async function sendPushToMultipleUsers(userIds: number[], payload: { title: string; body: string; icon?: string; url?: string }) {
  const results = await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload))
  );
  return results;
}
