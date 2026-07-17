import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendPushToUser } from '../services/pushService';

const prisma = new PrismaClient();

export const runLiveVerificationJob = async () => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find all active employees who are currently checked in (but not out)
    const activeEntries = await prisma.attendanceEntry.findMany({
      where: {
        date: today,
        inTime: { not: null },
        outTime: null,
      },
      include: {
        employee: {
          include: {
            user: {
              include: {
                pushSubscriptions: true
              }
            }
          }
        }
      }
    });

    if (activeEntries.length === 0) return;

    // Randomly select 10% of active employees (or at least 1)
    const selectionCount = Math.max(1, Math.floor(activeEntries.length * 0.1));
    const shuffled = activeEntries.sort(() => 0.5 - Math.random());
    const selectedEntries = shuffled.slice(0, selectionCount);

    for (const entry of selectedEntries) {
      // Check if they already have an active request
      const existingReq = await prisma.liveVerificationRequest.findFirst({
        where: {
          employeeId: entry.employeeId,
          status: 'PENDING',
          expiresAt: { gt: new Date() }
        }
      });

      if (!existingReq) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

        const newReq = await prisma.liveVerificationRequest.create({
          data: {
            employeeId: entry.employeeId,
            date: today,
            requestedAt: now,
            expiresAt,
            status: 'PENDING'
          }
        });

        // Send Push Notification
        try {
          await sendPushToUser(entry.employee.user.id, {
            title: 'Security Check: Live Verification',
            body: 'Please verify your face within the next 10 minutes to maintain your active shift.',
            url: '/employee/dashboard',
          });
        } catch (e) {
          console.error('Failed to send verification push', e);
        }
      }
    }

  } catch (error) {
    console.error('Error in runLiveVerificationJob:', error);
  }
};

export const startLiveVerificationCronJob = () => {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runLiveVerificationJob();
  });
};
