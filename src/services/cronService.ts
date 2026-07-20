import cron from 'node-cron';
import prisma from '../prisma';
import { sendPushToUser } from './pushService';

export async function reloadCronJobs() {
  console.log('[Cron] Reloading cron jobs is not needed. Using minutely ping.');
}

export async function initializeCronJobs() {
  console.log('[Cron] Starting minutely background cron job for scheduled pushes...');
  cron.schedule('* * * * *', async () => {
    await triggerScheduledPushes().catch(console.error);
  });
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
  const prevIST = new Date(nowIST.getTime() - 60000); // 1 minute ago

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

    // Helper to evaluate if a given Date object matches the cron expression
    function checkMatch(timeObj: Date) {
      const min = timeObj.getMinutes();
      const hr = timeObj.getHours();
      const day = timeObj.getDay(); // 0-6 (Sun-Sat)

      const minMatches = cronMin === '*' || parseInt(cronMin) === min;
      const hourMatches = cronHour === '*' || parseInt(cronHour) === hr;
      
      let dayMatches = false;
      if (cronDayStr === '*') {
        dayMatches = true;
      } else {
        const days = cronDayStr.split(',').map(Number);
        if (days.includes(day)) {
          dayMatches = true;
        }
      }
      return minMatches && hourMatches && dayMatches;
    }

    if (checkMatch(nowIST) || checkMatch(prevIST)) {
      console.log(`[Cron Trigger] MATCHED scheduled push: ${push.title}`);
      triggeredCount++;
      
      // Must be awaited for Serverless environments (like Vercel) so the function doesn't freeze
      await executePush(push).catch(err => console.error(err));
    }
  }

  const settings = await prisma.attendanceSettings.findFirst();
  if (settings?.autoAbsentCutoffTime) {
    const cutoffDate = new Date(settings.autoAbsentCutoffTime);
    const cutoffMin = cutoffDate.getUTCMinutes();
    const cutoffHr = cutoffDate.getUTCHours();
    
    // Check if current IST time matches the cutoff time (which is stored in UTC but treated as IST by our app)
    const matchesNow = cutoffMin === nowIST.getMinutes() && cutoffHr === nowIST.getHours();
    const matchesPrev = cutoffMin === prevIST.getMinutes() && cutoffHr === prevIST.getHours();
    
    if (matchesNow || matchesPrev) {
      console.log(`[Cron Trigger] MATCHED Auto-Absent Cutoff Time: ${cutoffHr}:${cutoffMin}`);
      await processAutoAbsents().catch(err => console.error(err));
    }
  }

  return { success: true, triggered: triggeredCount };
}

async function processAutoAbsents() {
  console.log('[Cron Trigger] Processing Auto-Absents for missing checkouts...');
  try {
    // Get current date in IST and set to UTC midnight for comparison
    // Any punch with a date STRICTLY BEFORE this midnight is considered a "previous day" punch
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    nowIST.setUTCHours(0, 0, 0, 0);

    const updated = await prisma.attendanceEntry.updateMany({
      where: {
        outTime: null,
        date: {
          lt: nowIST // Strictly before today
        },
        status: {
          not: 'ABSENT' // Don't re-update if already absent
        }
      },
      data: {
        status: 'ABSENT',
        leaveReason: 'Auto-absent: Forgot to checkout',
      }
    });

    console.log(`[Cron Trigger] Auto-Absent processed. Marked ${updated.count} entries as ABSENT.`);
  } catch (err) {
    console.error(`[Cron Trigger] Failed to process Auto-Absents:`, err);
  }
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
          title: `🔔 ${push.title}`,
          body: push.body,
          icon: 'https://attendance-two-smoky.vercel.app/pwa-192x192.png',
          url: '/employee',
          data: {
            requireInteraction: true,
            actions: [
              { action: 'open', title: '✅ View Dashboard' }
            ]
          }
        })
      )
    );

    const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[Cron Trigger] Successfully sent push '${push.title}' to ${fulfilledCount}/${userIds.length} users.`);
  } catch (err) {
    console.error(`[Cron Trigger] Failed to execute push '${push.title}':`, err);
  }
}
