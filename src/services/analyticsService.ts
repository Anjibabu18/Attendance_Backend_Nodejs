import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const monthAnalytics = async (yearMonth: string) => {
  // yearMonth format: 'YYYY-MM'
  const startDate = new Date(`${yearMonth}-01T00:00:00Z`);
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);

  const [entries, employees] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      include: { employee: { include: { department: true, assignedOfficeLocation: true } } },
    }),
    prisma.employee.findMany({ include: { assignedOfficeLocation: true } }),
  ]);

  const present = entries.filter(e => e.status === 'PRESENT').length;
  const half = entries.filter(e => e.status === 'HALF_DAY').length;
  const leave = entries.filter(e => e.status === 'LEAVE').length;
  const lateMinutes = entries.reduce((sum, e) => sum + (e.lateMinutes || 0), 0);
  const overtimeMinutes = entries.reduce((sum, e) => sum + (e.overtimeMinutes || 0), 0);

  const sortObj = (obj: Record<string, number>) =>
    Object.keys(obj).sort().reduce((res: Record<string, number>, key) => { res[key] = obj[key]; return res; }, {});

  // Trends
  const lateTrend: Record<string, number> = {};
  const leaveTrend: Record<string, number> = {};
  const checkInTrend: Record<string, number> = {};
  entries.forEach(e => {
    const d = e.date.toISOString().split('T')[0];
    lateTrend[d] = (lateTrend[d] || 0) + (e.lateMinutes || 0);
    if (e.status === 'LEAVE') leaveTrend[d] = (leaveTrend[d] || 0) + 1;
    if (e.status === 'PRESENT' || e.status === 'HALF_DAY') checkInTrend[d] = (checkInTrend[d] || 0) + 1;
  });

  // Department attendance rate
  const deptTotal: Record<string, number> = {};
  const deptPresent: Record<string, number> = {};
  entries.forEach(e => {
    const dept = e.employee.department?.name || 'Unassigned';
    deptTotal[dept] = (deptTotal[dept] || 0) + 1;
    if (e.status === 'PRESENT' || e.status === 'HALF_DAY') deptPresent[dept] = (deptPresent[dept] || 0) + 1;
  });
  const departmentAttendance: Record<string, number> = {};
  const departmentRate: Record<string, number> = {};
  Object.keys(deptTotal).forEach(dept => {
    departmentAttendance[dept] = deptPresent[dept] || 0;
    departmentRate[dept] = Math.round(((deptPresent[dept] || 0) / deptTotal[dept]) * 100);
  });

  // Office occupancy
  const officeOccupancy: Record<string, number> = {};
  employees.forEach(e => {
    const office = e.assignedOfficeLocation?.officeName || 'Default office';
    officeOccupancy[office] = (officeOccupancy[office] || 0) + 1;
  });

  // Today present
  const latestDateMs = entries.reduce((max, e) => Math.max(max, e.date.getTime()), 0);
  const latestDate = latestDateMs ? new Date(latestDateMs).toISOString().split('T')[0] : '';
  const todayPresent = entries.filter(e => e.date.toISOString().split('T')[0] === latestDate && e.status === 'PRESENT').length;

  // Top late employees
  const latePer: Record<number, { name: string; lateMinutes: number; dept: string }> = {};
  entries.forEach(e => {
    if ((e.lateMinutes || 0) > 0) {
      if (!latePer[e.employeeId]) latePer[e.employeeId] = { name: e.employee.name, lateMinutes: 0, dept: e.employee.department?.name || '-' };
      latePer[e.employeeId].lateMinutes += e.lateMinutes || 0;
    }
  });
  const topLateEmployees = Object.values(latePer).sort((a, b) => b.lateMinutes - a.lateMinutes).slice(0, 5);

  // Top absent employees
  const absentPer: Record<number, { name: string; absentDays: number; dept: string }> = {};
  entries.filter(e => e.status === 'ABSENT').forEach(e => {
    if (!absentPer[e.employeeId]) absentPer[e.employeeId] = { name: e.employee.name, absentDays: 0, dept: e.employee.department?.name || '-' };
    absentPer[e.employeeId].absentDays += 1;
  });
  const topAbsentEmployees = Object.values(absentPer).sort((a, b) => b.absentDays - a.absentDays).slice(0, 5);

  return {
    employees: employees.length,
    presentEntries: present,
    halfDayEntries: half,
    leaveEntries: leave,
    lateMinutes,
    overtimeMinutes,
    todayPresent,
    lateTrend: sortObj(lateTrend),
    leaveTrend: sortObj(leaveTrend),
    checkInTrend: sortObj(checkInTrend),
    departmentAttendance,
    departmentRate,
    officeOccupancy,
    topLateEmployees,
    topAbsentEmployees,
  };
};
