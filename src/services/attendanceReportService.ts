import { PrismaClient, AttendanceEntry, AttendanceStatus, Employee } from '@prisma/client';

const prisma = new PrismaClient();

export const startOfMonth = (month: string) => new Date(`${month}-01T00:00:00Z`);

export const endOfMonth = (month: string) => {
  const end = startOfMonth(month);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
};

export const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

export const timeOnly = (date?: Date | null) => date ? date.toISOString().slice(11, 19) : null;

export const workingDaysInMonth = (month: string) => {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  let count = 0;
  for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0) count++;
  }
  return count;
};

export const monthSummary = async (employeeId: number, month: string) => {
  const entries = await prisma.attendanceEntry.findMany({
    where: { employeeId, date: { gte: startOfMonth(month), lt: endOfMonth(month) } },
  });
  const presentDays = entries.filter(e => e.status === 'PRESENT').length;
  const halfDayDays = entries.filter(e => e.status === 'HALF_DAY').length;
  const explicitLeaveDays = entries.filter(e => e.status === 'LEAVE').length;
  const workingDays = workingDaysInMonth(month);
  const leaveDays = Math.max(explicitLeaveDays, workingDays - presentDays - halfDayDays);
  const totalWorkedMinutes = entries.reduce((sum, e) => sum + (e.workedMinutes || 0), 0);
  return {
    month,
    fromDate: dateOnly(startOfMonth(month)),
    toDate: dateOnly(new Date(endOfMonth(month).getTime() - 86400000)),
    workingDays,
    presentDays,
    halfDayDays,
    leaveDays,
    totalWorkedMinutes,
  };
};

export const payrollForEmployee = async (employee: Employee, month: string) => {
  const summary = await monthSummary(employee.id, month);
  const entries = await prisma.attendanceEntry.findMany({
    where: { employeeId: employee.id, date: { gte: startOfMonth(month), lt: endOfMonth(month) } },
  });
  const lateMinutes = entries.reduce((sum, e) => sum + (e.lateMinutes || 0), 0);
  const overtimeMinutes = entries.reduce((sum, e) => sum + (e.overtimeMinutes || 0), 0);
  const baseSalary = Number(process.env.STANDARD_MONTHLY_SALARY || 25000);
  const lateDeductionPerMinute = Number(process.env.LATE_DEDUCTION_PER_MINUTE || 1);
  const payableDays = summary.presentDays + summary.halfDayDays * 0.5;
  const dailyRate = summary.workingDays > 0 ? baseSalary / summary.workingDays : 0;
  const earnedSalary = dailyRate * payableDays;
  const lateDeduction = lateMinutes * lateDeductionPerMinute;
  const unpaidLeaveDeduction = Math.max(0, baseSalary - earnedSalary);
  const overtimePay = 0;
  const grossPay = earnedSalary;
  const totalDeductions = lateDeduction + unpaidLeaveDeduction;
  const netPay = Math.max(0, earnedSalary - lateDeduction);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeNumber: employee.employeeNumber,
    month,
    workingDays: summary.workingDays,
    presentDays: summary.presentDays,
    halfDays: summary.halfDayDays,
    leaveDays: summary.leaveDays,
    payableDays,
    lateMinutes,
    overtimeMinutes,
    baseSalary,
    dailyRate: round(dailyRate),
    earnedSalary: round(earnedSalary),
    lateDeduction: round(lateDeduction),
    unpaidLeaveDeduction: round(unpaidLeaveDeduction),
    overtimePay: round(overtimePay),
    grossPay: round(grossPay),
    totalDeductions: round(totalDeductions),
    netPay: round(netPay),
  };
};

export const payrollRegister = async (month: string) => {
  const employees = await prisma.employee.findMany();
  return Promise.all(employees.map(e => payrollForEmployee(e, month)));
};

export const csv = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
};

export const payrollCsv = async (month: string) => {
  const rows = await payrollRegister(month);
  const header = ['Employee Number','Employee Name','Month','Working Days','Present Days','Half Days','Leave Days','Payable Days','Late Minutes','Overtime Minutes','Base Salary','Daily Rate','Earned Salary','Late Deduction','Unpaid Leave Deduction','Overtime Pay','Gross Pay','Total Deductions','Net Pay'];
  const lines = [header.join(',')];
  rows.forEach(r => lines.push([
    r.employeeNumber, r.employeeName, r.month, r.workingDays, r.presentDays, r.halfDays, r.leaveDays, r.payableDays,
    r.lateMinutes, r.overtimeMinutes, r.baseSalary, r.dailyRate, r.earnedSalary, r.lateDeduction,
    r.unpaidLeaveDeduction, r.overtimePay, r.grossPay, r.totalDeductions, r.netPay,
  ].map(csv).join(',')));
  return lines.join('\n');
};

export const attendanceCsv = (employee: Employee, month: string, entries: AttendanceEntry[]) => {
  const lines = [
    'Employee Number,Employee Name,Month',
    [employee.employeeNumber, employee.name, month].map(csv).join(','),
    '',
    'Date,Status,In Time,Out Time,Worked Minutes,Late Minutes,Early Leave Minutes,Overtime Minutes,Leave Reason,Check In Photo,Check Out Photo',
  ];
  entries.forEach(e => lines.push([
    dateOnly(e.date), e.status, timeOnly(e.inTime), timeOnly(e.outTime), e.workedMinutes, e.lateMinutes,
    e.earlyLeaveMinutes, e.overtimeMinutes, e.leaveReason, e.checkInPhotoUrl, e.checkOutPhotoUrl,
  ].map(csv).join(',')));
  return lines.join('\n');
};

export const payrollLockView = async (month: string) => {
  const lock = await prisma.payrollLock.findUnique({ where: { month } });
  return { month, locked: Boolean(lock?.locked), updatedAt: lock?.updatedAt ?? null, updatedBy: lock?.updatedBy ?? null };
};

export const assertPayrollUnlocked = async (month: string) => {
  const lock = await payrollLockView(month);
  if (lock.locked) throw new Error(`Payroll is locked for ${month}`);
};

export const simplePdf = (title: string, lines: string[]) => {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const text = [`BT /F1 14 Tf 50 780 Td (${escape(title)}) Tj`, ...lines.map((line) => `0 -22 Td (${escape(line)}) Tj`), 'ET'].join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(text)} >> stream\n${text}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${obj}\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
};
