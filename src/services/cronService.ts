import cron from 'node-cron';
import prisma from '../prisma';
import { sendPushToUser } from './pushService';

// Store running tasks to be able to stop them when reloading
let runningJobs: cron.ScheduledTask[] = [];

export async function reloadCronJobs() {
  console.log('[Cron] Reloading cron jobs...');
  // 1. Stop all existing jobs
  for (const job of runningJobs) {
    job.stop();
  }
  runningJobs = [];

  // 2. Fetch all active scheduled pushes from DB
  const scheduledPushes = await prisma.scheduledPush.findMany({
    where: { isActive: true },
  });

  // 3. Schedule them
  for (const push of scheduledPushes) {
    if (!cron.validate(push.cronExpression)) {
      console.error(`[Cron] Invalid cron expression for Push ID ${push.id}: ${push.cronExpression}`);
      continue;
    }

    const job = cron.schedule(push.cronExpression, async () => {
      console.log(`[Cron] Executing scheduled push: ${push.title}`);
      
      try {
        // Fetch users who have active push subscriptions
        const distinctUserIds = await prisma.pushSubscription.findMany({
          select: { userId: true },
          distinct: ['userId'],
        });

        const userIds = distinctUserIds.map((sub) => sub.userId);
        
        // Send notification to each user
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
        console.log(`[Cron] Successfully sent push '${push.title}' to ${fulfilledCount}/${userIds.length} users.`);
      } catch (err) {
        console.error(`[Cron] Failed to execute push '${push.title}':`, err);
      }
    });

    runningJobs.push(job);
  }

  console.log(`[Cron] Successfully loaded ${runningJobs.length} active scheduled pushes.`);
}

export async function initializeCronJobs() {
  await reloadCronJobs();
}
