import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Starting retroactive attendance fix...');

  const settings = await prisma.attendanceSettings.findFirst() || {
    fullDayMinutes: 480,
    halfDayMinutes: 240,
    earlyLeaveGraceMinutes: 10,
    weekendDays: 'SUNDAY'
  };

  // 1. Fix Checkouts (Half-Days and Absents)
  console.log('Evaluating existing punches for HALF_DAY and ABSENT...');
  const entries = await prisma.attendanceEntry.findMany({
    where: { outTime: { not: null }, status: 'PRESENT' }
  });

  let halfDays = 0;
  let absents = 0;

  for (const entry of entries) {
    if (entry.workedMinutes === null) continue;
    let newStatus = null;
    if (entry.workedMinutes < settings.halfDayMinutes) {
      newStatus = 'ABSENT';
      absents++;
    } else if (entry.workedMinutes < (settings.fullDayMinutes - settings.earlyLeaveGraceMinutes)) {
      newStatus = 'HALF_DAY';
      halfDays++;
    }

    if (newStatus) {
      await prisma.attendanceEntry.update({
        where: { id: entry.id },
        data: { status: newStatus as any }
      });
    }
  }
  console.log(`Updated ${halfDays} entries to HALF_DAY.`);
  console.log(`Updated ${absents} entries to ABSENT.`);

  // 2. Inject LEAVE entries for approved leaves
  console.log('Injecting LEAVE entries for approved leaves...');
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED' }
  });

  let leaveDays = 0;
  for (const req of approvedLeaves) {
    const start = new Date(req.fromDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(req.toDate);
    end.setUTCHours(0, 0, 0, 0);
    
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const currentDay = new Date(d);
      await prisma.attendanceEntry.upsert({
        where: { uk_attendance_emp_date: { employeeId: req.employeeId, date: currentDay } },
        update: { status: 'LEAVE', leaveReason: req.leaveType || 'Approved Leave', workedMinutes: 0 },
        create: { employeeId: req.employeeId, date: currentDay, status: 'LEAVE', leaveReason: req.leaveType || 'Approved Leave', workedMinutes: 0 }
      });
      leaveDays++;
    }
  }
  console.log(`Injected ${leaveDays} LEAVE days into the attendance table.`);

  // 3. Backfill ABSENT entries for all working days up to today
  console.log('Backfilling ABSENT entries for past working days...');
  const activeEmployees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });
  const weekendDays = (settings.weekendDays || 'SUNDAY').split(',');
  const allHolidays = await prisma.holiday.findMany();
  const holidayDates = new Set(allHolidays.map(h => h.date.toISOString().slice(0,10)));

  // We will check the last 30 days
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  
  let backfillAbsents = 0;
  
  for (let d = new Date(thirtyDaysAgo); d < today; d.setUTCDate(d.getUTCDate() + 1)) {
    const currentDay = new Date(d);
    const dayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][currentDay.getUTCDay()];
    
    if (!weekendDays.includes(dayName) && !holidayDates.has(currentDay.toISOString().slice(0, 10))) {
      // Find employees who do NOT have an entry for this day
      const entriesForDay = await prisma.attendanceEntry.findMany({ where: { date: currentDay } });
      const presentIds = new Set(entriesForDay.map(e => e.employeeId));
      
      for (const emp of activeEmployees) {
        if (!presentIds.has(emp.id)) {
          await prisma.attendanceEntry.create({
            data: {
              employeeId: emp.id,
              date: currentDay,
              status: 'ABSENT',
              leaveReason: 'Did not report to work',
              workedMinutes: 0
            }
          });
          backfillAbsents++;
        }
      }
    }
  }
  
  console.log(`Backfilled ${backfillAbsents} ABSENT entries for the last 30 days.`);

  console.log('Retroactive fix complete!');
}

run().catch(console.error).finally(() => prisma.$disconnect());
