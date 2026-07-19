import cron from 'node-cron';
import prisma from '../prisma';
import { sendPushToUser } from './pushService';

export async function reloadCronJobs() {
  // Obsolete for Vercel Serverless Functions. 
  // We use the HTTP trigger endpoint approach instead.
  console.log('[Cron] Background cron jobs disabled (running in Serverless mode). Use /api/webhook/cron/trigger-pushes instead.');
}

export async function initializeCronJobs() {
  await reloadCronJobs();
}

/**
 * Checks all scheduled pushes and sends them if they match the CURRENT MINUTE in IST.
 * This should be called via an external HTTP ping (e.g. cron-job.org) every minute.
 */
export async function triggerScheduledPushes() {
  console.log('[Cron Trigger] Checking for scheduled pushes...');
  
  // Get current time in IST (India Standard Time)
  // because the frontend schedules the cron string based on the user's local (IST) time.
  const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const currentMinute = nowIST.getMinutes();
  const currentHour = nowIST.getHours();
  const currentDay = nowIST.getDay(); // 0-6 (Sun-Sat)

  const scheduledPushes = await prisma.scheduledPush.findMany({
    where: { isActive: true },
  });

  let triggeredCount = 0;

  for (const push of scheduledPushes) {
    const parts = push.cronExpression.split(' ');
    if (parts.length !== 5) continue;
    
    const cronMin = parts[0];
    const cronHour = parts[1];
    const cronDayStr = parts[4];

    // Evaluate match
    const minMatches = cronMin === '*' || parseInt(cronMin) === currentMinute;
    const hourMatches = cronHour === '*' || parseInt(cronHour) === currentHour;
    
    let dayMatches = false;
    if (cronDayStr === '*') {
      dayMatches = true;
    } else {
      const days = cronDayStr.split(',').map(Number);
      if (days.includes(currentDay)) {
        dayMatches = true;
      }
    }

    if (minMatches && hourMatches && dayMatches) {
      console.log(`[Cron Trigger] MATCHED scheduled push: ${push.title}`);
      triggeredCount++;
      
      // Execute the push in background without awaiting the whole batch
      executePush(push).catch(err => console.error(err));
    }
  }

  return { success: true, triggered: triggeredCount };
}

async function executePush(push: any) {
  try {
    const distinctUserIds = await prisma.pushSubscription.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });

    const userIds = distinctUserIds.map((sub) => sub.userId);
    
    const results = await Promise.allSettled(
      userIds.map((userId) => 
        sendPushToUser(userId, {
          title: push.title,
          body: push.body,
          icon: '/favicon.ico',
          url: '/employee',
        })
      )
    );

    const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[Cron Trigger] Successfully sent push '${push.title}' to ${fulfilledCount}/${userIds.length} users.`);
  } catch (err) {
    console.error(`[Cron Trigger] Failed to execute push '${push.title}':`, err);
  }
}
