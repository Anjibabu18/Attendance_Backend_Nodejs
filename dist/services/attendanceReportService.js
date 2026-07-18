"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simplePdf = exports.assertPayrollUnlocked = exports.payrollLockView = exports.attendanceCsv = exports.payrollCsv = exports.csv = exports.payrollRegister = exports.payrollForEmployee = exports.monthSummary = exports.workingDaysInMonth = exports.timeOnly = exports.dateOnly = exports.endOfMonth = exports.startOfMonth = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const startOfMonth = (month) => new Date(`${month}-01T00:00:00Z`);
exports.startOfMonth = startOfMonth;
const endOfMonth = (month) => {
    const end = (0, exports.startOfMonth)(month);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
};
exports.endOfMonth = endOfMonth;
const dateOnly = (date) => date.toISOString().slice(0, 10);
exports.dateOnly = dateOnly;
const timeOnly = (date) => date ? date.toISOString().slice(11, 19) : null;
exports.timeOnly = timeOnly;
const workingDaysInMonth = (month) => {
    const start = (0, exports.startOfMonth)(month);
    const end = (0, exports.endOfMonth)(month);
    let count = 0;
    for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = d.getUTCDay();
        if (day !== 0)
            count++;
    }
    return count;
};
exports.workingDaysInMonth = workingDaysInMonth;
const monthSummary = async (employeeId, month) => {
    const entries = await prisma_1.default.attendanceEntry.findMany({
        where: { employeeId, date: { gte: (0, exports.startOfMonth)(month), lt: (0, exports.endOfMonth)(month) } },
    });
    const presentDays = entries.filter(e => e.status === 'PRESENT').length;
    const halfDayDays = entries.filter(e => e.status === 'HALF_DAY').length;
    const explicitLeaveDays = entries.filter(e => e.status === 'LEAVE').length;
    const workingDays = (0, exports.workingDaysInMonth)(month);
    const leaveDays = Math.max(explicitLeaveDays, workingDays - presentDays - halfDayDays);
    const totalWorkedMinutes = entries.reduce((sum, e) => sum + (e.workedMinutes || 0), 0);
    return {
        month,
        fromDate: (0, exports.dateOnly)((0, exports.startOfMonth)(month)),
        toDate: (0, exports.dateOnly)(new Date((0, exports.endOfMonth)(month).getTime() - 86400000)),
        workingDays,
        presentDays,
        halfDayDays,
        leaveDays,
        totalWorkedMinutes,
    };
};
exports.monthSummary = monthSummary;
const payrollForEmployee = async (employee, month) => {
    const summary = await (0, exports.monthSummary)(employee.id, month);
    const entries = await prisma_1.default.attendanceEntry.findMany({
        where: { employeeId: employee.id, date: { gte: (0, exports.startOfMonth)(month), lt: (0, exports.endOfMonth)(month) } },
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
    const round = (n) => Math.round(n * 100) / 100;
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
exports.payrollForEmployee = payrollForEmployee;
const payrollRegister = async (month) => {
    const employees = await prisma_1.default.employee.findMany();
    return Promise.all(employees.map(e => (0, exports.payrollForEmployee)(e, month)));
};
exports.payrollRegister = payrollRegister;
const csv = (value) => {
    if (value === null || value === undefined)
        return '';
    const s = String(value).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
};
exports.csv = csv;
const payrollCsv = async (month) => {
    const rows = await (0, exports.payrollRegister)(month);
    const header = ['Employee Number', 'Employee Name', 'Month', 'Working Days', 'Present Days', 'Half Days', 'Leave Days', 'Payable Days', 'Late Minutes', 'Overtime Minutes', 'Base Salary', 'Daily Rate', 'Earned Salary', 'Late Deduction', 'Unpaid Leave Deduction', 'Overtime Pay', 'Gross Pay', 'Total Deductions', 'Net Pay'];
    const lines = [header.join(',')];
    rows.forEach(r => lines.push([
        r.employeeNumber, r.employeeName, r.month, r.workingDays, r.presentDays, r.halfDays, r.leaveDays, r.payableDays,
        r.lateMinutes, r.overtimeMinutes, r.baseSalary, r.dailyRate, r.earnedSalary, r.lateDeduction,
        r.unpaidLeaveDeduction, r.overtimePay, r.grossPay, r.totalDeductions, r.netPay,
    ].map(exports.csv).join(',')));
    return lines.join('\n');
};
exports.payrollCsv = payrollCsv;
const attendanceCsv = (employee, month, entries) => {
    const lines = [
        'Employee Number,Employee Name,Month',
        [employee.employeeNumber, employee.name, month].map(exports.csv).join(','),
        '',
        'Date,Status,In Time,Out Time,Worked Minutes,Late Minutes,Early Leave Minutes,Overtime Minutes,Leave Reason,Check In Photo,Check Out Photo',
    ];
    entries.forEach(e => lines.push([
        (0, exports.dateOnly)(e.date), e.status, (0, exports.timeOnly)(e.inTime), (0, exports.timeOnly)(e.outTime), e.workedMinutes, e.lateMinutes,
        e.earlyLeaveMinutes, e.overtimeMinutes, e.leaveReason, e.checkInPhotoUrl, e.checkOutPhotoUrl,
    ].map(exports.csv).join(',')));
    return lines.join('\n');
};
exports.attendanceCsv = attendanceCsv;
const payrollLockView = async (month) => {
    const lock = await prisma_1.default.payrollLock.findUnique({ where: { month } });
    return { month, locked: Boolean(lock?.locked), updatedAt: lock?.updatedAt ?? null, updatedBy: lock?.updatedBy ?? null };
};
exports.payrollLockView = payrollLockView;
const assertPayrollUnlocked = async (month) => {
    const lock = await (0, exports.payrollLockView)(month);
    if (lock.locked)
        throw new Error(`Payroll is locked for ${month}`);
};
exports.assertPayrollUnlocked = assertPayrollUnlocked;
const simplePdf = (title, lines) => {
    const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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
    for (let i = 1; i < offsets.length; i++)
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
};
exports.simplePdf = simplePdf;
