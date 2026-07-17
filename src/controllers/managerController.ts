import prisma from '../prisma';
import { Response } from 'express';

import { AuthRequest } from '../middlewares/authMiddleware';
import { monthSummary, startOfMonth, endOfMonth, timeOnly } from '../services/attendanceReportService';



const assignedEmployeeIds = async (username: string) => {
  const manager = await prisma.appUser.findUnique({ where: { username } });
  if (!manager) return [] as number[];
  const assignments = await prisma.managerAssignment.findMany({ where: { managerUserId: manager.id } });
  return assignments.map(a => a.employeeId);
};

const teamWhere = async (username: string) => {
  const ids = await assignedEmployeeIds(username);
  return ids.length ? { id: { in: ids } } : {};
};

export const team = async (req: AuthRequest, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({ where: await teamWhere(req.user!.username), include: { companyRole: true, assignedOfficeLocation: true } });
    res.json(employees);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const teamAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) throw new Error('Month parameter is required');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const employees = await prisma.employee.findMany({ where: await teamWhere(req.user!.username), include: { assignedOfficeLocation: true } });
    const rows = await Promise.all(employees.map(async employee => {
      const summary = await monthSummary(employee.id, month);
      const todayEntry = await prisma.attendanceEntry.findFirst({ where: { employeeId: employee.id, date: today } });
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        employeeNumber: employee.employeeNumber,
        office: employee.assignedOfficeLocation?.officeName || 'Default office',
        todayStatus: todayEntry?.status || 'ABSENT',
        inTime: timeOnly(todayEntry?.inTime),
        outTime: timeOnly(todayEntry?.outTime),
        presentDays: summary.presentDays,
        halfDayDays: summary.halfDayDays,
        leaveDays: summary.leaveDays,
        workingDays: summary.workingDays,
      };
    }));
    res.json(rows);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const pendingRegularizations = async (req: AuthRequest, res: Response) => {
  try {
    const ids = await assignedEmployeeIds(req.user!.username);
    res.json(await prisma.regularizationRequest.findMany({ where: { status: 'PENDING', ...(ids.length ? { employeeId: { in: ids } } : {}) }, include: { employee: true }, orderBy: { createdAt: 'desc' } }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const pendingWorkRequests = async (req: AuthRequest, res: Response) => {
  try {
    const ids = await assignedEmployeeIds(req.user!.username);
    res.json(await prisma.workRequest.findMany({ where: { status: 'PENDING', ...(ids.length ? { employeeId: { in: ids } } : {}) }, include: { employee: true }, orderBy: { createdAt: 'desc' } }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const recommendRegularization = async (req: AuthRequest, res: Response) => {
  res.json({ id: Number(req.params.id), managerRecommendation: true, remarks: req.body?.remarks || null });
};

export const recommendWorkRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const saved = await prisma.workRequest.update({ where: { id }, data: { remarks: req.body?.remarks || null }, include: { employee: true } });
    res.json(saved);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

export const rejectWorkRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const user = await prisma.appUser.findUnique({ where: { username: req.user!.username } });
    const saved = await prisma.workRequest.update({ where: { id }, data: { status: 'REJECTED', remarks: req.body?.remarks || null, decidedAt: new Date(), decidedByUserId: user?.id }, include: { employee: true } });
    res.json(saved);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
};

