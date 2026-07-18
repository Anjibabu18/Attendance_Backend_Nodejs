import prisma from '../prisma';
import { Response } from 'express';

import { AuthRequest } from '../middlewares/authMiddleware';
import bcrypt from 'bcryptjs';
import { monthAnalytics } from '../services/analyticsService';
import { uploadGroupPhoto } from '../services/cloudinaryService';
import { auditCsv, listAuditEvents } from '../services/auditService';
import { notifyAllByRole } from '../services/notificationService';


const toDateOnly = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00Z`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const timeDate = (value: string) => new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}Z`);
const timeString = (value?: Date | null, fallback = '09:00:00') => value ? value.toISOString().slice(11, 19) : fallback;

const settingsView = (settings: any) => ({
  defaultInTime: timeString(settings?.defaultInTime, '09:00:00'),
  defaultOutTime: timeString(settings?.defaultOutTime, '18:00:00'),
  weekendDays: settings?.weekendDays || 'SUNDAY',
  fullDayMinutes: settings?.fullDayMinutes ?? 480,
  halfDayMinutes: settings?.halfDayMinutes ?? 240,
  lateGraceMinutes: settings?.lateGraceMinutes ?? 10,
  earlyLeaveGraceMinutes: settings?.earlyLeaveGraceMinutes ?? 10,
  overtimeAfterMinutes: settings?.overtimeAfterMinutes ?? 480,
  lateDeductionPerMinute: settings?.lateDeductionPerMinute ?? 1,
  overtimePayPerHour: settings?.overtimePayPerHour ?? 0,
  unpaidLeaveDailyRate: settings?.unpaidLeaveDailyRate ?? 500,
  standardMonthlySalary: settings?.standardMonthlySalary ?? 25000,
  requireQrForPunch: settings?.requireQrForPunch ?? false,
  permanentOfficeQr: settings?.permanentOfficeQr ?? false,
  qrTokenValidityMinutes: settings?.qrTokenValidityMinutes ?? 10080,
});


export const listDepartments = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await prisma.department.findMany());
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    res.json(await prisma.department.create({ data: { name } }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const listShifts = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await prisma.shift.findMany());
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createShift = async (req: AuthRequest, res: Response) => {
  try {
    const { name, inTime, outTime, flexible } = req.body;
    res.json(await prisma.shift.create({ 
      data: { name, inTime: new Date(inTime), outTime: new Date(outTime), flexible } 
    }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const listCompanyRoles = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await prisma.companyRole.findMany());
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createCompanyRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    res.json(await prisma.companyRole.create({ data: { name } }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

import { qrResponse } from '../services/qrService';
import * as crypto from 'crypto';

export const generateQr = async (req: AuthRequest, res: Response) => {
  try {
    const officeId = Number(req.body.officeId ?? req.body.officeLocationId);
    if (!Number.isInteger(officeId) || officeId <= 0) {
      return res.status(400).json({ error: 'Select a valid office location before generating QR' });
    }

    const officeLocation = await prisma.officeLocation.findUnique({ where: { id: Number(officeId) } });
    if (!officeLocation) {
      return res.status(404).json({ error: 'Office location not found. Save office location first, then generate QR.' });
    }

    const existing = await prisma.officeQrToken.findFirst({
      where: { officeLocationId: officeId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: { officeLocation: true }
    });
    if (existing) {
      return res.json(await qrResponse(existing));
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10);
    const qrToken = await prisma.officeQrToken.create({
      data: {
        token,
        officeLocationId: officeId,
        expiresAt
      },
      include: { officeLocation: true }
    });
    const resp = await qrResponse(qrToken);
    res.json(resp);
  } catch (error: any) {
    console.error('QR generation failed', error);
    res.status(500).json({ error: `QR generation failed: ${error.message}` });
  }
};

export const getLatestQrToken = async (req: AuthRequest, res: Response) => {
  try {
    const officeId = req.query.officeId ? parseInt(req.query.officeId as string) : undefined;
    const whereClause = officeId ? { officeLocationId: officeId } : {};
    const latest = await prisma.officeQrToken.findFirst({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { officeLocation: true }
    });
    if (!latest) return res.json({ token: null });
    const resp = await qrResponse(latest);
    res.json(resp);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getQrImage = async (req: AuthRequest, res: Response) => {
  try {
    // In a real app we would generate the PNG using a library like qrcode
    const token = String(req.params.token).replace('.png', '');
    res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(token)}`);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};


export const listEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({ include: { user: true, companyRole: true, assignedOfficeLocation: true, department: true, shift: true } });
    res.json(employees.map(e => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      name: e.name,
      username: e.user.username,
      loginRole: e.user.role,
      enabled: e.user.enabled,
      lastLoginAt: e.user.lastLoginAt,
      lastLoginIp: e.user.lastLoginIp,
      companyRole: e.companyRole,
      assignedOfficeLocation: e.assignedOfficeLocation,
      department: e.department,
      shift: e.shift,
      status: e.status,
      profilePhotoUrl: e.profilePhotoUrl,
      joinDate: e.joinDate?.toISOString().slice(0, 10) ?? null,
      exitDate: e.exitDate?.toISOString().slice(0, 10) ?? null,
    })));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};


export const employeeDetail = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.params.id);
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const year = Number(req.query.year || month.slice(0, 4) || new Date().getUTCFullYear());
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const [employee, attendance, leaveBalances, assignments, exceptions, recentRequests] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          user: { select: { id: true, username: true, role: true, enabled: true, lastLoginAt: true, lastLoginIp: true } },
          companyRole: true,
          assignedOfficeLocation: true,
          department: true,
          shift: true,
        },
      }),
      prisma.attendanceEntry.findMany({
        where: { employeeId, date: { gte: start, lt: end } },
        orderBy: { date: 'asc' },
      }),
      prisma.leaveBalance.findMany({ where: { employeeId, year }, orderBy: { leaveType: 'asc' } }),
      prisma.managerAssignment.findMany({
        where: { employeeId },
        include: { manager: { select: { id: true, username: true, enabled: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.attendanceException.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      Promise.all([
        prisma.leaveRequest.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.regularizationRequest.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.workRequest.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.compOffRequest.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      ]),
    ]);

    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const summary = attendance.reduce((acc, row) => {
      acc.workingDays += 1;
      if (row.status === 'PRESENT') acc.presentDays += 1;
      if (row.status === 'HALF_DAY') acc.halfDays += 1;
      if (row.status === 'LEAVE') acc.leaveDays += 1;
      if (row.status === 'ABSENT') acc.absentDays += 1;
      acc.workedMinutes += row.workedMinutes || 0;
      acc.lateMinutes += row.lateMinutes || 0;
      acc.overtimeMinutes += row.overtimeMinutes || 0;
      return acc;
    }, { workingDays: 0, presentDays: 0, halfDays: 0, leaveDays: 0, absentDays: 0, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0 });

    const [leaveRequests, regularizationRequests, workRequests, compOffRequests] = recentRequests;
    const requests = [
      ...leaveRequests.map((r) => ({ id: r.id, type: 'Leave', status: r.status, date: r.fromDate.toISOString().slice(0, 10), title: r.leaveType || 'Leave request' })),
      ...regularizationRequests.map((r) => ({ id: r.id, type: 'Correction', status: r.status, date: r.date.toISOString().slice(0, 10), title: 'Attendance correction' })),
      ...workRequests.map((r) => ({ id: r.id, type: 'Work', status: r.status, date: r.fromDate.toISOString().slice(0, 10), title: r.type })),
      ...compOffRequests.map((r) => ({ id: r.id, type: 'Comp off', status: r.status, date: r.requestedDate.toISOString().slice(0, 10), title: 'Comp off request' })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10);

    res.json({
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        username: employee.user.username,
        loginRole: employee.user.role,
        enabled: employee.user.enabled,
        lastLoginAt: employee.user.lastLoginAt,
        lastLoginIp: employee.user.lastLoginIp,
        status: employee.status,
        joinDate: employee.joinDate?.toISOString().slice(0, 10) || null,
        exitDate: employee.exitDate?.toISOString().slice(0, 10) || null,
        profilePhotoUrl: employee.profilePhotoUrl,
        companyRole: employee.companyRole,
        department: employee.department,
        shift: employee.shift ? { ...employee.shift, inTime: timeString(employee.shift.inTime), outTime: timeString(employee.shift.outTime) } : null,
        assignedOfficeLocation: employee.assignedOfficeLocation,
      },
      summary,
      attendance: attendance.map((row) => ({
        id: row.id,
        date: row.date.toISOString().slice(0, 10),
        status: row.status,
        inTime: timeString(row.inTime, ''),
        outTime: timeString(row.outTime, ''),
        workedMinutes: row.workedMinutes || 0,
        lateMinutes: row.lateMinutes || 0,
        overtimeMinutes: row.overtimeMinutes || 0,
      })),
      leaveBalances: leaveBalances.map((b) => ({ ...b, remainingDays: b.allocatedDays - b.usedDays })),
      managers: assignments.map((a) => a.manager),
      exceptions,
      requests,
    });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeNumber, name, username, password, companyRoleId, officeLocationId, departmentId, shiftId, joinDate } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.appUser.create({ data: { username, passwordHash, role: 'ROLE_EMPLOYEE' } });
    const employee = await prisma.employee.create({
      data: {
        employeeNumber, name, userId: user.id,
        companyRoleId: companyRoleId || null,
        assignedOfficeLocationId: officeLocationId || null,
        departmentId: departmentId || null,
        shiftId: shiftId || null,
        joinDate: joinDate ? toDateOnly(joinDate) : new Date(),
      },
      include: { user: true, companyRole: true, assignedOfficeLocation: true, department: true, shift: true },
    });
    res.json(employee);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { employeeNumber, name, companyRoleId, officeLocationId, departmentId, shiftId, joinDate } = req.body;
    const employee = await prisma.employee.update({
      where: { id },
      data: { employeeNumber, name, companyRoleId: companyRoleId || null, assignedOfficeLocationId: officeLocationId || null, departmentId: departmentId || null, shiftId: shiftId || null, joinDate: joinDate ? toDateOnly(joinDate) : undefined },
      include: { user: true, companyRole: true, assignedOfficeLocation: true, department: true, shift: true },
    });
    res.json(employee);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const resetDeviceBinding = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const employee = await prisma.employee.update({
      where: { id },
      data: { deviceFingerprint: null },
    });
    res.json(employee);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createHr = async (req: AuthRequest, res: Response) => {
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    res.json(await prisma.appUser.create({ data: { username: req.body.username, passwordHash, role: 'ROLE_HR' } }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createManager = async (req: AuthRequest, res: Response) => {
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    res.json(await prisma.appUser.create({ data: { username: req.body.username, passwordHash, role: 'ROLE_MANAGER' } }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const listManagers = async (req: AuthRequest, res: Response) => {
  try { res.json(await prisma.appUser.findMany({ where: { role: 'ROLE_MANAGER' }, select: { id: true, username: true, enabled: true } })); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const assignManager = async (req: AuthRequest, res: Response) => {
  try {
    const { managerUserId, employeeIds } = req.body as { managerUserId: number; employeeIds: number[] };
    await prisma.managerAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.managerAssignment.createMany({ data: employeeIds.map(employeeId => ({ managerUserId, employeeId })), skipDuplicates: true });
    res.json({ assigned: employeeIds.length });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const listManagerAssignments = async (req: AuthRequest, res: Response) => {
  try { res.json(await prisma.managerAssignment.findMany({ include: { manager: true, employee: true }, orderBy: { createdAt: 'desc' } })); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getAttendanceSettings = async (req: AuthRequest, res: Response) => {
  try { res.json(settingsView(await prisma.attendanceSettings.findFirst())); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const saveAttendanceSettings = async (req: AuthRequest, res: Response) => {
  try {
    const data = {
      defaultInTime: timeDate(req.body.defaultInTime || '09:00'),
      defaultOutTime: timeDate(req.body.defaultOutTime || '18:00'),
      weekendDays: req.body.weekendDays || 'SUNDAY',
      fullDayMinutes: Number(req.body.fullDayMinutes ?? 480),
      halfDayMinutes: Number(req.body.halfDayMinutes ?? 240),
      lateGraceMinutes: Number(req.body.lateGraceMinutes ?? 10),
      earlyLeaveGraceMinutes: Number(req.body.earlyLeaveGraceMinutes ?? 10),
      overtimeAfterMinutes: Number(req.body.overtimeAfterMinutes ?? 480),
      lateDeductionPerMinute: Number(req.body.lateDeductionPerMinute ?? 1),
      overtimePayPerHour: Number(req.body.overtimePayPerHour ?? 0),
      unpaidLeaveDailyRate: Number(req.body.unpaidLeaveDailyRate ?? 500),
      standardMonthlySalary: Number(req.body.standardMonthlySalary ?? 25000),
      requireQrForPunch: Boolean(req.body.requireQrForPunch),
      permanentOfficeQr: Boolean(req.body.permanentOfficeQr),
      qrTokenValidityMinutes: Number(req.body.qrTokenValidityMinutes ?? 10080),
    };
    const existing = await prisma.attendanceSettings.findFirst();
    const saved = existing ? await prisma.attendanceSettings.update({ where: { id: existing.id }, data }) : await prisma.attendanceSettings.create({ data });

    // Notify all employees about settings change
    const inDisplay = req.body.defaultInTime || '09:00';
    const outDisplay = req.body.defaultOutTime || '18:00';
    notifyAllByRole('ROLE_EMPLOYEE', '⚙️ Schedule Updated', `Office timings updated: In ${inDisplay} → Out ${outDisplay}.`).catch(() => {});
    notifyAllByRole('ROLE_HR', '⚙️ Settings Updated', `Admin updated attendance settings. In: ${inDisplay}, Out: ${outDisplay}.`).catch(() => {});

    res.json(settingsView(saved));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const listHolidays = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string | undefined;
    const where = month ? { date: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(new Date(`${month}-01T00:00:00Z`).setUTCMonth(new Date(`${month}-01T00:00:00Z`).getUTCMonth() + 1)) } } : {};
    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
    res.json(holidays.map(h => ({ id: Number(h.id), date: h.date.toISOString().slice(0, 10), name: h.name })));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const createHoliday = async (req: AuthRequest, res: Response) => {
  try {
    const saved = await prisma.holiday.upsert({ where: { date: toDateOnly(req.body.date) }, update: { name: req.body.name }, create: { date: toDateOnly(req.body.date), name: req.body.name } });
    res.json({ id: Number(saved.id), date: saved.date.toISOString().slice(0, 10), name: saved.name });
  }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const deleteHoliday = async (req: AuthRequest, res: Response) => {
  try { await prisma.holiday.delete({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const analytics = async (req: AuthRequest, res: Response) => {
  try { res.json(await monthAnalytics(req.query.month as string)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const productionChecklist = async (req: AuthRequest, res: Response) => {
  try {
    const [employees, hr, manager] = await Promise.all([
      prisma.employee.count(),
      prisma.appUser.count({ where: { role: 'ROLE_HR' } }),
      prisma.appUser.count({ where: { role: 'ROLE_MANAGER' } }),
    ]);
    res.json({ employees, hrAccount: hr > 0, managerAccount: manager > 0 });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const listOfficeLocations = async (req: AuthRequest, res: Response) => {
  try { res.json(await prisma.officeLocation.findMany({ where: { active: true }, orderBy: { id: 'asc' } })); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const activeOfficeLocation = async (req: AuthRequest, res: Response) => {
  try { res.json(await prisma.officeLocation.findFirst({ where: { active: true }, orderBy: { id: 'asc' } })); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const saveActiveOfficeLocation = async (req: AuthRequest, res: Response) => {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const radiusMeters = Number(req.body.radiusMeters || 100);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Latitude must be a number between -90 and 90. Example: 17.4931753");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Longitude must be a number between -180 and 180. Example: 78.4132323");
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) throw new Error("Radius must be a positive number in meters");
    const saved = await prisma.officeLocation.create({ data: { officeName: req.body.officeName, latitude, longitude, radiusMeters, officeIpAddress: req.body.officeIpAddress || null, active: true } });
    res.json(saved);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const setLeaveBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, leaveType, year, allocatedDays, usedDays } = req.body;
    const saved = await prisma.leaveBalance.upsert({
      where: { uk_leave_balance_emp_type_year: { employeeId: Number(employeeId), leaveType, year: Number(year) } },
      update: { allocatedDays: Number(allocatedDays), usedDays: Number(usedDays ?? 0) },
      create: { employeeId: Number(employeeId), leaveType, year: Number(year), allocatedDays: Number(allocatedDays), usedDays: Number(usedDays ?? 0) },
      include: { employee: true },
    });
    res.json({ ...saved, employeeName: saved.employee.name, employeeNumber: saved.employee.employeeNumber, remainingDays: saved.allocatedDays - saved.usedDays });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const employeeLeaveBalances = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.params.id);
    const year = Number(req.query.year || new Date().getUTCFullYear());
    const rows = await prisma.leaveBalance.findMany({ where: { employeeId, year }, include: { employee: true } });
    res.json(rows.map(b => ({ ...b, employeeName: b.employee.name, employeeNumber: b.employee.employeeNumber, remainingDays: b.allocatedDays - b.usedDays })));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const auditLogs = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listAuditEvents(Number(req.query.limit || 80)));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const auditLogsCsv = async (req: AuthRequest, res: Response) => {
  try {
    res.header('Content-Type', 'text/csv');
    res.attachment(`attendance-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(await auditCsv());
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

const parseOptionalNumber = (value: any) => value === undefined || value === null || value === '' ? null : Number(value);

export const deleteOfficeLocation = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.employee.updateMany({ where: { assignedOfficeLocationId: id }, data: { assignedOfficeLocationId: null } });
    await prisma.officeLocation.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const updateOfficeLocation = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const radiusMeters = Number(req.body.radiusMeters || 100);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Latitude must be a number between -90 and 90");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Longitude must be a number between -180 and 180");
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) throw new Error("Radius must be a positive number in meters");
    
    const updated = await prisma.officeLocation.update({
      where: { id },
      data: {
        officeName: req.body.officeName,
        latitude,
        longitude,
        radiusMeters,
        officeIpAddress: req.body.officeIpAddress || null,
        active: req.body.active ?? true
      }
    });
    res.json(updated);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const assignEmployeeOfficeLocation = async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.update({
      where: { id: Number(req.params.id) },
      data: { assignedOfficeLocationId: parseOptionalNumber(req.body.officeLocationId) },
      include: { assignedOfficeLocation: true, user: true, companyRole: true, department: true, shift: true },
    });
    res.json(employee);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const resetEmployeePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) throw new Error('New password must be at least 6 characters');
    const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.id) } });
    if (!employee) throw new Error('Employee not found');
    await prisma.appUser.update({ where: { id: employee.userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    res.json({ ok: true });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const updateEmployeeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const saved = await prisma.employee.update({
      where: { id: Number(req.params.id) },
      data: { status: req.body.status, exitDate: req.body.exitDate ? toDateOnly(req.body.exitDate) : null },
      include: { user: true, companyRole: true, assignedOfficeLocation: true, department: true, shift: true },
    });
    res.json(saved);
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const updateEmployeeUsername = async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.id) } });
    if (!employee) throw new Error('Employee not found');
    await prisma.appUser.update({ where: { id: employee.userId }, data: { username: req.body.username } });
    res.json(await prisma.employee.findUnique({ where: { id: employee.id }, include: { user: true, companyRole: true, assignedOfficeLocation: true, department: true, shift: true } }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const bulkResetPasswords = async (req: AuthRequest, res: Response) => {
  try {
    const ids = (req.body.employeeIds || []).map(Number).filter(Boolean);
    const { newPassword } = req.body;
    if (!ids.length) throw new Error('Select at least one employee');
    if (!newPassword || String(newPassword).length < 6) throw new Error('New password must be at least 6 characters');
    const employees = await prisma.employee.findMany({ where: { id: { in: ids } } });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.appUser.updateMany({ where: { id: { in: employees.map(e => e.userId) } }, data: { passwordHash } });
    res.json({ updated: employees.length });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const bulkEditEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const ids = (req.body.employeeIds || []).map(Number).filter(Boolean);
    if (!ids.length) throw new Error('Select at least one employee');
    const data: any = {};
    if ('officeLocationId' in req.body) data.assignedOfficeLocationId = parseOptionalNumber(req.body.officeLocationId);
    if ('departmentId' in req.body) data.departmentId = parseOptionalNumber(req.body.departmentId);
    if ('shiftId' in req.body) data.shiftId = parseOptionalNumber(req.body.shiftId);
    if (req.body.status) data.status = req.body.status;
    const result = Object.keys(data).length ? await prisma.employee.updateMany({ where: { id: { in: ids } }, data }) : { count: 0 };
    if (req.body.newPassword) {
      const employees = await prisma.employee.findMany({ where: { id: { in: ids } } });
      await prisma.appUser.updateMany({ where: { id: { in: employees.map(e => e.userId) } }, data: { passwordHash: await bcrypt.hash(req.body.newPassword, 10) } });
      res.json({ updated: Math.max(result.count, employees.length) });
      return;
    }
    res.json({ updated: result.count });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const assignRoster = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = Number(req.body.employeeId);
    const shiftId = Number(req.body.shiftId);
    await prisma.employee.update({ where: { id: employeeId }, data: { shiftId } });
    const start = toDateOnly(req.body.fromDate);
    const end = toDateOnly(req.body.toDate);
    const assignedDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    res.json({ assignedDays });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const employeesCsv = async (req: AuthRequest, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({ include: { user: true, department: true, shift: true, companyRole: true, assignedOfficeLocation: true }, orderBy: { id: 'asc' } });
    const rows = ['employeeNumber,name,username,status,department,shift,companyRole,office'];
    for (const e of employees) {
      rows.push([e.employeeNumber, e.name, e.user.username, e.status, e.department?.name || '', e.shift?.name || '', e.companyRole?.name || '', e.assignedOfficeLocation?.officeName || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
    res.header('Content-Type', 'text/csv');
    res.attachment('attendance-employees-backup.csv');
    res.send(rows.join('\n'));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const importEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) throw new Error('CSV file is required');
    const lines = file.buffer.toString('utf8').split(/\r?\n/).filter((line: string) => line.trim());
    let created = 0;
    for (const line of lines.slice(1)) {
      const [employeeNumber, name, username, password] = line.split(',').map((v: string) => v.replace(/^"|"$/g, '').trim());
      if (!employeeNumber || !name || !username || !password) continue;
      const exists = await prisma.employee.findUnique({ where: { employeeNumber } });
      if (exists) continue;
      const user = await prisma.appUser.create({ data: { username, passwordHash: await bcrypt.hash(password, 10), role: 'ROLE_EMPLOYEE' } });
      await prisma.employee.create({ data: { employeeNumber, name, userId: user.id, joinDate: new Date() } });
      created++;
    }
    res.json({ created });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const setEmployeeEnabled = async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.id) } });
    if (!employee) throw new Error('Employee not found');
    await prisma.appUser.update({ where: { id: employee.userId }, data: { enabled: Boolean(req.body.enabled) } });
    res.json({ ok: true });
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

export const uploadCompanyPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) throw new Error('Photo file is required');
    const upload = await uploadGroupPhoto(file.buffer, 'company-group-photo');
    res.json({ groupPhotoUrl: upload.url });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const productionDevices = async (req: AuthRequest, res: Response) => { res.json([]); };
export const productionExceptions = async (req: AuthRequest, res: Response) => { res.json(await prisma.attendanceException.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })); };
export const productionSessions = async (req: AuthRequest, res: Response) => { res.json([]); };
export const productionBackup = async (req: AuthRequest, res: Response) => {
  const [employees, users] = await Promise.all([prisma.employee.count(), prisma.appUser.count()]);
  res.json({ employees, users, checkedAt: new Date().toISOString() });
};
export const saveProductionPolicy = async (req: AuthRequest, res: Response) => { res.json({ ok: true, versionName: req.body.versionName || 'Production policy', savedAt: new Date().toISOString() }); };
export const approveProductionDevice = async (req: AuthRequest, res: Response) => { res.json({ ok: true, id: Number(req.params.id), approved: Boolean(req.body.approved) }); };

export const statutoryReport = async (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const employees = await prisma.employee.findMany({
      include: {
        user: true,
        department: true,
        companyRole: true,
        attendanceEntries: {
          where: { date: { gte: start, lt: end } }
        }
      },
      orderBy: { id: 'asc' }
    });

    const settings = await prisma.attendanceSettings.findFirst() || {
      standardMonthlySalary: 25000,
      overtimePayPerHour: 0
    };
    
    // We assume standard 30 days for monthly daily rate calculation
    const dailyRate = settings.standardMonthlySalary / 30;

    const rows = ['Employee ID,Name,Department,Role,Total Days,Present,Half Days,Absent,Paid Leaves,Overtime Hours,Base Pay,Overtime Pay,Total Payment,Status'];
    
    for (const e of employees) {
      const present = e.attendanceEntries.filter(a => a.status === 'PRESENT').length;
      const halfDays = e.attendanceEntries.filter(a => a.status === 'HALF_DAY').length;
      const absent = e.attendanceEntries.filter(a => a.status === 'ABSENT').length;
      const leaves = e.attendanceEntries.filter(a => a.status === 'LEAVE').length; // Assuming all approved leaves are paid
      const overtimeMinutes = e.attendanceEntries.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);
      
      const overtimeHours = (overtimeMinutes / 60).toFixed(2);
      const overtimePay = (overtimeMinutes / 60) * settings.overtimePayPerHour;
      
      // Shift complete gives full daily payment
      const basePay = (present + (halfDays * 0.5) + leaves) * dailyRate;
      const totalPayment = basePay + overtimePay;
      
      rows.push([
        e.employeeNumber,
        e.name,
        e.department?.name || '',
        e.companyRole?.name || '',
        30,
        present,
        halfDays,
        absent,
        leaves,
        overtimeHours,
        Math.round(basePay),
        Math.round(overtimePay),
        Math.round(totalPayment),
        e.status
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }

    res.header('Content-Type', 'text/csv');
    res.attachment(`statutory-report-${month}.csv`);
    res.send(rows.join('\n'));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
};


