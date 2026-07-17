import prisma from '../prisma';
import cron from 'node-cron';

import { sendPushToUser } from '../services/pushService';



/**
 * Push Notification Reminder Job
 * 
 * Runs two scheduled tasks:
 * 1. Punch-In Reminder: 5 minutes before default in-time (e.g., 8:55 AM)
 *    → Sends to employees who haven't punched in yet
 * 2. Punch-Out Reminder: 5 minutes after default out-time (e.g., 6:05 PM)
 *    → Sends to employees who punched in but haven't punched out
 */
export function startPushReminderJobs() {
  // Check every minute and compare against attendance settings
  cron.schedule('* * * * *', async () => {
    try {
      const settings = await prisma.attendanceSettings.findFirst();
      if (!settings) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Extract in/out times from settings
      const inTime = settings.defaultInTime; // stored as Date with time component
      const outTime = settings.defaultOutTime;

      const inHour = inTime.getUTCHours();
      const inMinute = inTime.getUTCMinutes();
      const outHour = outTime.getUTCHours();
      const outMinute = outTime.getUTCMinutes();

      // Calculate reminder times (5 minutes before in, 5 minutes after out)
      const reminderInHour = inMinute < 5 ? inHour - 1 : inHour;
      const reminderInMinute = inMinute < 5 ? 60 + inMinute - 5 : inMinute - 5;
      const reminderOutMinute = outMinute + 5;
      const reminderOutHour = reminderOutMinute >= 60 ? outHour + 1 : outHour;
      const finalOutMinute = reminderOutMinute >= 60 ? reminderOutMinute - 60 : reminderOutMinute;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ===== PUNCH-IN REMINDER =====
      if (currentHour === reminderInHour && currentMinute === reminderInMinute) {
        console.log('[PushJob] Sending punch-in reminders...');

        // Get all active employees
        const employees = await prisma.employee.findMany({
          where: { status: 'ACTIVE' },
          include: { user: true },
        });

        // Get today's attendance entries
        const entries = await prisma.attendanceEntry.findMany({
          where: { date: today },
          select: { employeeId: true },
        });
        const punchedInIds = new Set(entries.map((e) => e.employeeId));

        // Send to employees who haven't punched in
        let sentCount = 0;
        for (const emp of employees) {
          if (!punchedInIds.has(emp.id)) {
            // Check if user has push subscriptions
            const subCount = await prisma.pushSubscription.count({ where: { userId: emp.userId } });
            if (subCount > 0) {
              await sendPushToUser(emp.userId, {
                title: '⏰ Punch-In Reminder',
                body: `Good morning! Don't forget to punch in. Office hours start at ${formatTime(inHour, inMinute)}.`,
                icon: '/favicon.ico',
                url: '/employee',
              }).catch((err) => console.error(`[PushJob] Failed to send to user ${emp.userId}:`, err));
              sentCount++;
            }
          }
        }
        console.log(`[PushJob] Sent ${sentCount} punch-in reminders.`);
      }

      // ===== PUNCH-OUT REMINDER =====
      if (currentHour === reminderOutHour && currentMinute === finalOutMinute) {
        console.log('[PushJob] Sending punch-out reminders...');

        // Get today's entries where employee punched in but NOT out
        const entries = await prisma.attendanceEntry.findMany({
          where: {
            date: today,
            inTime: { not: null },
            outTime: null,
          },
          include: {
            employee: {
              include: { user: true },
            },
          },
        });

        let sentCount = 0;
        for (const entry of entries) {
          const subCount = await prisma.pushSubscription.count({ where: { userId: entry.employee.userId } });
          if (subCount > 0) {
            await sendPushToUser(entry.employee.userId, {
              title: '🏠 Punch-Out Reminder',
              body: `Did you leave? Remember to punch out! Office hours ended at ${formatTime(outHour, outMinute)}.`,
              icon: '/favicon.ico',
              url: '/employee',
            }).catch((err) => console.error(`[PushJob] Failed to send to user ${entry.employee.userId}:`, err));
            sentCount++;
          }
        }
        console.log(`[PushJob] Sent ${sentCount} punch-out reminders.`);
      }
    } catch (error) {
      console.error('[PushJob] Error:', error);
    }
  });

  console.log('[PushJob] Push notification reminder jobs scheduled.');
}

function formatTime(hour: number, minute: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}
