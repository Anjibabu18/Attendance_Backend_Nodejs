import prisma from '../prisma';
import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/authMiddleware';
import { payrollCsv, payrollRegister } from '../services/attendanceReportService';

const router = Router();


router.use(requireAuth);
router.use(requireRole(['ROLE_ADMIN', 'ROLE_HR']));

router.get('/board', async (req, res) => {
  try {
    let targetDate = new Date();
    if (req.query.date && typeof req.query.date === 'string') {
      const parsed = new Date(req.query.date);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }
    targetDate.setUTCHours(0, 0, 0, 0);

    const [employees, entries, exceptions] = await Promise.all([
      prisma.employee.findMany({ include: { companyRole: true, assignedOfficeLocation: true } }),
      prisma.attendanceEntry.findMany({ where: { date: targetDate }, include: { employee: { include: { companyRole: true, assignedOfficeLocation: true } } } }),
      prisma.attendanceException.findMany({ where: { resolved: false }, include: { employee: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    const entryMap = new Map(entries.map(e => [e.employeeId, e]));
    const rows = employees.map(emp => {
      const e = entryMap.get(emp.id);
      let status = "NOT_ARRIVED";
      if (e?.inTime && e?.outTime) status = "CHECKED_OUT";
      else if (e?.inTime) status = "CHECKED_IN";
      return {
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName: emp.name,
        department: emp.companyRole?.name || "No department",
        office: emp.assignedOfficeLocation?.officeName || "No office",
        status,
        inTime: e?.inTime?.toISOString().split('T')[1].slice(0, 5) || "",
        outTime: e?.outTime?.toISOString().split('T')[1].slice(0, 5) || "",
        workedMinutes: e?.workedMinutes || 0,
        lateMinutes: e?.lateMinutes || 0,
        overtimeMinutes: e?.overtimeMinutes || 0
      };
    });

    const occupancy: Record<string, number> = {};
    const mapPoints: Array<Record<string, any>> = [];
    const alerts: Array<Record<string, any>> = [];

    entries.forEach(e => {
      const office = e.employee.assignedOfficeLocation?.officeName || "Unknown";
      if (e.inTime && !e.outTime) {
        occupancy[office] = (occupancy[office] || 0) + 1;
      }
      if (e.checkInLatitude != null && e.checkInLongitude != null) {
        mapPoints.push({ employeeName: e.employee.name, office, latitude: e.checkInLatitude, longitude: e.checkInLongitude, status: "IN" });
      }
      if (e.checkOutLatitude != null && e.checkOutLongitude != null) {
        mapPoints.push({ employeeName: e.employee.name, office, latitude: e.checkOutLatitude, longitude: e.checkOutLongitude, status: "OUT" });
      }
      if (e.lateMinutes && e.lateMinutes > 0) {
        alerts.push({ employeeName: e.employee.name, employeeNumber: e.employee.employeeNumber, type: "LATE", message: `Late by ${e.lateMinutes} mins` });
      }
    });

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        employees: employees.length,
        present: entries.filter(e => e.status === 'PRESENT').length,
        halfDay: entries.filter(e => e.status === 'HALF_DAY').length,
        leave: entries.filter(e => e.status === 'LEAVE').length,
        exceptions: exceptions.length,
      },
      rows,
      occupancy,
      alerts,
      mapPoints,
      live: entries.map(e => ({ employeeName: e.employee.name, employeeNumber: e.employee.employeeNumber, status: e.status, inTime: e.inTime, outTime: e.outTime })),
      exceptions: exceptions.map(e => ({ type: e.type, message: e.message, employeeName: e.employee?.name || '--', createdAt: e.createdAt })),
      timeline: entries.slice(0, 10).map(e => ({ title: e.employee.name, detail: e.status, at: e.inTime || e.date })),
    });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/payroll-preview', async (req, res) => {
  try {
    const month = req.query.month as string;
    const rows = await payrollRegister(month);
    res.json({
      month,
      employees: rows.length,
      netPay: rows.reduce((sum, r) => sum + r.netPay, 0),
      deductions: rows.reduce((sum, r) => sum + r.totalDeductions, 0),
      overtimeMinutes: rows.reduce((sum, r) => sum + r.overtimeMinutes, 0),
      rows: rows.slice(0, 8),
    });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/payroll.csv', async (req, res) => {
  try {
    const month = req.query.month as string;
    res.header('Content-Type', 'text/csv');
    res.attachment(`payroll-attendance-${month}.csv`);
    res.send(await payrollCsv(month));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: open\ndata: {}\n\n');
});

export default router;
