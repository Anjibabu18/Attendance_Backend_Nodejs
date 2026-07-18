import prisma from '../prisma';
import { Response } from 'express';

import { AuthRequest } from '../middlewares/authMiddleware';
import * as RequestService from '../services/requestService';
import { monthAnalytics } from '../services/analyticsService';
import { attendanceCsv, monthSummary, payrollCsv, payrollLockView, payrollRegister, simplePdf, startOfMonth, endOfMonth } from '../services/attendanceReportService';
import { notifyUser } from '../services/mailService';
import { uploadDailyGroupPhoto, uploadGroupPhoto } from '../services/cloudinaryService';
import { notify } from '../services/notificationService';



export const listEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      include: { assignedOfficeLocation: true, department: true, shift: true, user: true, companyRole: true }
    });
    res.json(employees.map(e => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      name: e.name,
      status: e.status,
      assignedOfficeLocation: e.assignedOfficeLocation,
      department: e.department,
      shift: e.shift,
      enabled: e.user?.enabled,
      username: e.user?.username,
    })));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const analytics = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) throw new Error('Month parameter is required');
    res.json(await monthAnalytics(month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const payroll = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) throw new Error('Month parameter is required');
    res.json(await payrollRegister(month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const payrollExport = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) throw new Error('Month parameter is required');
    res.header('Content-Type', 'text/csv');
    res.attachment(`payroll-${month}.csv`);
    res.send(await payrollCsv(month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const getPayrollLock = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) throw new Error('Month parameter is required');
    res.json(await payrollLockView(month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const setPayrollLock = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string;
    const locked = String(req.query.locked) === 'true';
    if (!month) throw new Error('Month parameter is required');
    await prisma.payrollLock.upsert({
      where: { month },
      update: { locked, updatedAt: new Date(), updatedBy: req.user!.username },
      create: { month, locked, updatedBy: req.user!.username },
    });
    res.json(await payrollLockView(month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const listExceptions = async (req: AuthRequest, res: Response) => {
  try {
    const exceptions = await prisma.attendanceException.findMany({
      where: { resolved: false },
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(exceptions.map(e => ({
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee?.name || '--',
      employeeNumber: e.employee?.employeeNumber || '--',
      type: e.type,
      message: e.message,
      resolved: e.resolved,
      createdAt: e.createdAt,
    })));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const resolveException = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const saved = await prisma.attendanceException.update({ where: { id }, data: { resolved: true }, include: { employee: true } });
    res.json(saved);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const scanMissingCheckouts = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const entries = await prisma.attendanceEntry.findMany({
      where: { inTime: { not: null }, outTime: null, date: { lt: today } },
      include: { employee: { include: { user: true } } },
    });
    let createdExceptions = 0;
    for (const entry of entries) {
      const message = `Checked in on ${entry.date.toISOString().slice(0, 10)} but checkout is still missing`;
      const existing = await prisma.attendanceException.findFirst({
        where: { employeeId: entry.employeeId, type: 'MISSING_CHECKOUT', message, resolved: false },
      });
      if (existing) continue;
      await prisma.attendanceException.create({ data: { employeeId: entry.employeeId, type: 'MISSING_CHECKOUT', message } });
      createdExceptions++;
      await notifyUser(entry.employee.user.username, 'Missing checkout reminder', `${message}. Please submit an attendance correction if needed.`);
      await notify(entry.employee.user.id, '⚠️ Missing Checkout', `You didn't punch out on ${entry.date.toISOString().split('T')[0]}. Please submit a correction.`);
    }
    res.json({ openEntries: entries.length, createdExceptions });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};
export const attendance = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.query.employeeId);
    const month = req.query.month as string;
    if (!employeeId || !month) throw new Error('employeeId and month are required');
    res.json(await prisma.attendanceEntry.findMany({ where: { employeeId, date: { gte: startOfMonth(month), lt: endOfMonth(month) } }, orderBy: { date: 'asc' } }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const attendanceSummary = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.query.employeeId);
    const month = req.query.month as string;
    if (!employeeId || !month) throw new Error('employeeId and month are required');
    res.json(await monthSummary(employeeId, month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const attendanceExport = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.query.employeeId);
    const month = req.query.month as string;
    if (!employeeId || !month) throw new Error('employeeId and month are required');
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    const entries = await prisma.attendanceEntry.findMany({ where: { employeeId, date: { gte: startOfMonth(month), lt: endOfMonth(month) } }, orderBy: { date: 'asc' } });
    res.header('Content-Type', 'text/csv');
    res.attachment(`attendance-${employee.employeeNumber}-${month}.csv`);
    res.send(attendanceCsv(employee, month, entries));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const attendanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.query.employeeId);
    const month = req.query.month as string;
    if (!employeeId || !month) throw new Error('employeeId and month are required');
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    const summary = await monthSummary(employeeId, month);
    const body = simplePdf('Attendance Report', [`Employee: ${employee.name} (${employee.employeeNumber})`, `Month: ${month}`, `Working Days: ${summary.workingDays}`, `Present: ${summary.presentDays}`, `Half Days: ${summary.halfDayDays}`, `Leave: ${summary.leaveDays}`, `Worked Minutes: ${summary.totalWorkedMinutes}`]);
    res.header('Content-Type', 'application/pdf');
    res.attachment(`attendance-${employee.employeeNumber}-${month}.pdf`);
    res.send(body);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};
// Leaves
export const pendingLeaveRequests = async (req: AuthRequest, res: Response) => {
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(leaves);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const approveLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.approveLeaveRequest(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const rejectLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.rejectLeaveRequest(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

// Regularization
export const pendingRegularizations = async (req: AuthRequest, res: Response) => {
  try {
    const reqs = await prisma.regularizationRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reqs);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const approveRegularization = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.approveRegularization(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const rejectRegularization = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.rejectRegularization(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

// Work
export const pendingWorkRequests = async (req: AuthRequest, res: Response) => {
  try {
    const reqs = await prisma.workRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reqs);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const approveWorkRequest = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.approveWorkRequest(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const rejectWorkRequest = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.rejectWorkRequest(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

// Comp Off
export const pendingCompOffs = async (req: AuthRequest, res: Response) => {
  try {
    const reqs = await prisma.compOffRequest.findMany({
      where: { status: 'PENDING' },
      include: { employee: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reqs);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const approveCompOff = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.approveCompOff(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const rejectCompOff = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await RequestService.rejectCompOff(parseInt(req.params.id as string), req.user!.username, req.body?.remarks));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};






const toDateOnly = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00Z`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const timeDate = (value: string | null | undefined) => {
  if (!value) return null;
  return new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}Z`);
};

const workedMinutes = (inTime: Date | null, outTime: Date | null) => {
  if (!inTime || !outTime) return null;
  const diff = Math.round((outTime.getTime() - inTime.getTime()) / 60000);
  return Math.max(0, diff);
};

export const saveAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.body.employeeId);
    const date = toDateOnly(req.body.date);
    const inTime = timeDate(req.body.inTime);
    const outTime = timeDate(req.body.outTime);
    const minutes = workedMinutes(inTime, outTime);
    const status = inTime ? (minutes !== null && minutes < 240 ? 'HALF_DAY' : 'PRESENT') : 'ABSENT';
    const saved = await prisma.attendanceEntry.upsert({
      where: { uk_attendance_emp_date: { employeeId, date } },
      update: { inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status as any },
      create: { employeeId, date, inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status as any },
    });
    res.json(saved);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const saveAttendanceRange = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.body.employeeId);
    const start = toDateOnly(req.body.fromDate);
    const end = toDateOnly(req.body.toDate);
    const inTime = timeDate(req.body.inTime);
    const outTime = timeDate(req.body.outTime);
    const minutes = workedMinutes(inTime, outTime);
    const status = inTime ? (minutes !== null && minutes < 240 ? 'HALF_DAY' : 'PRESENT') : 'ABSENT';
    let updatedDays = 0;
    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const current = new Date(date);
      await prisma.attendanceEntry.upsert({
        where: { uk_attendance_emp_date: { employeeId, date: current } },
        update: { inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status as any },
        create: { employeeId, date: current, inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status as any },
      });
      updatedDays++;
    }
    res.json({ updatedDays });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const approveLeaveCancellation = async (req: AuthRequest, res: Response) => {
  try {
    const saved = await prisma.leaveRequest.update({ where: { id: Number(req.params.id) }, data: { status: 'CANCELLED', hrRemarks: req.body?.remarks || null, decidedAt: new Date() }, include: { employee: { include: { user: true } } } });
    await notify(saved.employee.user?.id, '✅ Leave Cancellation Approved', `Your request to cancel leave on ${saved.fromDate.toISOString().split('T')[0]} was approved.`);
    res.json(saved);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const rejectLeaveCancellation = async (req: AuthRequest, res: Response) => {
  try {
    const saved = await prisma.leaveRequest.update({ where: { id: Number(req.params.id) }, data: { status: 'APPROVED', hrRemarks: req.body?.remarks || null, decidedAt: new Date() }, include: { employee: { include: { user: true } } } });
    await notify(saved.employee.user?.id, '❌ Leave Cancellation Rejected', `Your request to cancel leave on ${saved.fromDate.toISOString().split('T')[0]} was rejected.`);
    res.json(saved);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const pendingDeviceRequests = async (req: AuthRequest, res: Response) => {
  try {
    const pending = await prisma.deviceRequest.findMany({
      where: { approved: false },
      include: { employee: { include: { user: true } } }
    });
    const mapped = pending.map(item => ({
      id: item.id,
      username: item.employee?.user?.username || 'Unknown',
      deviceId: item.deviceId,
      label: item.label,
      approved: item.approved,
      createdAt: item.createdAt
    }));
    res.json(mapped);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const approveDeviceRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const dr = await prisma.deviceRequest.findUnique({ where: { id } });
    if (!dr) throw new Error('Device request not found');

    await prisma.deviceRequest.update({ where: { id }, data: { approved: true } });
    await notify(dr.employeeId ? (await prisma.employee.findUnique({ where: { id: dr.employeeId } }))?.userId : null, '📱 Device Approved', `Your device ${dr.label} is now approved for punches.`);

    res.json({ ok: true, id, approved: true });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const rejectDeviceRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const dr = await prisma.deviceRequest.findUnique({ where: { id } });
    await prisma.deviceRequest.delete({ where: { id } });
    
    if (dr) {
      await notify(dr.employeeId ? (await prisma.employee.findUnique({ where: { id: dr.employeeId } }))?.userId : null, '❌ Device Rejected', `Your device ${dr.label} registration was rejected.`);
    }

    res.json({ ok: true, id, approved: false });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const uploadCompanyRolePhoto = async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) throw new Error('Photo file is required');
    const upload = await uploadGroupPhoto(file.buffer, `company-role-${req.params.id}`);
    const saved = await prisma.companyRole.update({ where: { id: Number(req.params.id) }, data: { photoUrl: upload.url } });
    res.json(saved);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const uploadDailyPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) throw new Error('Photo file is required');
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const upload = await uploadDailyGroupPhoto(file.buffer, `daily-group-${date}`);
    res.json({ id: Date.now(), date, photoUrl: upload.url });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};
