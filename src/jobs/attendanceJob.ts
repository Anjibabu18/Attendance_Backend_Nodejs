import cron from 'node-cron';
import { PrismaClient, AttendanceStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Run every day at 23:59
export const startAttendanceCronJob = () => {
  cron.schedule('59 23 * * *', async () => {
    console.log('[Cron] Running daily attendance missing-checkout check...');
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Find all entries for today that have a check-in but no check-out
      const entries = await prisma.attendanceEntry.findMany({
        where: {
          date: today,
          inTime: { not: null },
          outTime: null,
        }
      });

      if (entries.length > 0) {
        console.log(`[Cron] Found ${entries.length} employees who forgot to checkout. Marking as ABSENT.`);
        
        for (const entry of entries) {
          await prisma.attendanceEntry.update({
            where: { id: entry.id },
            data: {
              status: AttendanceStatus.ABSENT,
              leaveReason: 'Forgot to checkout',
              workedMinutes: 0
            }
          });
        }
      } else {
        console.log('[Cron] No missing checkouts found today.');
      }

      // Check if today is a working day (Not weekend or holiday)
      const settings = await prisma.attendanceSettings.findFirst();
      const weekendDays = (settings?.weekendDays || 'SUNDAY').split(',');
      const dayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][today.getUTCDay()];
      
      const holiday = await prisma.holiday.findFirst({ where: { date: today } });

      if (!weekendDays.includes(dayName) && !holiday) {
        // Find employees with NO attendance entry today
        const activeEmployees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });
        const allEntries = await prisma.attendanceEntry.findMany({ where: { date: today } });
        const presentIds = new Set(allEntries.map(e => e.employeeId));

        let absentCount = 0;
        for (const emp of activeEmployees) {
          if (!presentIds.has(emp.id)) {
            await prisma.attendanceEntry.create({
              data: {
                employeeId: emp.id,
                date: today,
                status: AttendanceStatus.ABSENT,
                leaveReason: 'Did not report to work',
                workedMinutes: 0
              }
            });
            absentCount++;
          }
        }
        console.log(`[Cron] Created ${absentCount} ABSENT entries for employees who didn't punch in.`);
      }

    } catch (error) {
      console.error('[Cron] Error running missing-checkout job:', error);
    }
  });
  
  console.log('[Cron] Attendance missing-checkout job scheduled.');
};
