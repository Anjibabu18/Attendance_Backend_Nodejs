import cron from 'node-cron';
import { PrismaClient, AttendanceStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Run every day at 23:59
export const startAttendanceCronJob = () => {
  cron.schedule('0 5 * * *', async () => {
    console.log('[Cron] Running daily attendance missing-checkout check (5 AM)...');
    try {
      const istString = new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'});
      const istDate = new Date(istString);
      istDate.setDate(istDate.getDate() - 1);
      
      const targetDate = new Date(Date.UTC(istDate.getFullYear(), istDate.getMonth(), istDate.getDate()));

      // Find all entries for targetDate that have a check-in but no check-out
      const entries = await prisma.attendanceEntry.findMany({
        where: {
          date: targetDate,
          inTime: { not: null },
          outTime: null,
        }
      });

      if (entries.length > 0) {
        console.log(`[Cron] Found ${entries.length} employees who forgot to checkout on ${targetDate.toISOString()}. Marking as ABSENT.`);
        
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
        console.log('[Cron] No missing checkouts found for yesterday.');
      }

      // Check if targetDate is a working day (Not weekend or holiday)
      const settings = await prisma.attendanceSettings.findFirst();
      const weekendDays = (settings?.weekendDays || 'SUNDAY').split(',');
      const dayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][targetDate.getUTCDay()];
      
      const holiday = await prisma.holiday.findFirst({ where: { date: targetDate } });

      if (!weekendDays.includes(dayName) && !holiday) {
        // Find employees with NO attendance entry yesterday
        const activeEmployees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });
        const allEntries = await prisma.attendanceEntry.findMany({ where: { date: targetDate } });
        const presentIds = new Set(allEntries.map(e => e.employeeId));

        let absentCount = 0;
        for (const emp of activeEmployees) {
          if (!presentIds.has(emp.id)) {
            await prisma.attendanceEntry.create({
              data: {
                employeeId: emp.id,
                date: targetDate,
                status: AttendanceStatus.ABSENT,
                leaveReason: 'Did not report to work',
                workedMinutes: 0
              }
            });
            absentCount++;
          }
        }
        console.log(`[Cron] Created ${absentCount} ABSENT entries for employees who didn't punch in on ${targetDate.toISOString()}.`);
      }

    } catch (error) {
      console.error('[Cron] Error running missing-checkout job:', error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });
  
  console.log('[Cron] Attendance missing-checkout job scheduled.');
};
