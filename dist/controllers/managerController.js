"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectWorkRequest = exports.recommendWorkRequest = exports.recommendRegularization = exports.pendingWorkRequests = exports.pendingRegularizations = exports.teamAttendance = exports.team = void 0;
const client_1 = require("@prisma/client");
const attendanceReportService_1 = require("../services/attendanceReportService");
const prisma = new client_1.PrismaClient();
const assignedEmployeeIds = async (username) => {
    const manager = await prisma.appUser.findUnique({ where: { username } });
    if (!manager)
        return [];
    const assignments = await prisma.managerAssignment.findMany({ where: { managerUserId: manager.id } });
    return assignments.map(a => a.employeeId);
};
const teamWhere = async (username) => {
    const ids = await assignedEmployeeIds(username);
    return ids.length ? { id: { in: ids } } : {};
};
const team = async (req, res) => {
    try {
        const employees = await prisma.employee.findMany({ where: await teamWhere(req.user.username), include: { companyRole: true, assignedOfficeLocation: true } });
        res.json(employees);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.team = team;
const teamAttendance = async (req, res) => {
    try {
        const month = req.query.month;
        if (!month)
            throw new Error('Month parameter is required');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const employees = await prisma.employee.findMany({ where: await teamWhere(req.user.username), include: { assignedOfficeLocation: true } });
        const rows = await Promise.all(employees.map(async (employee) => {
            const summary = await (0, attendanceReportService_1.monthSummary)(employee.id, month);
            const todayEntry = await prisma.attendanceEntry.findFirst({ where: { employeeId: employee.id, date: today } });
            return {
                employeeId: employee.id,
                employeeName: employee.name,
                employeeNumber: employee.employeeNumber,
                office: employee.assignedOfficeLocation?.officeName || 'Default office',
                todayStatus: todayEntry?.status || 'ABSENT',
                inTime: (0, attendanceReportService_1.timeOnly)(todayEntry?.inTime),
                outTime: (0, attendanceReportService_1.timeOnly)(todayEntry?.outTime),
                presentDays: summary.presentDays,
                halfDayDays: summary.halfDayDays,
                leaveDays: summary.leaveDays,
                workingDays: summary.workingDays,
            };
        }));
        res.json(rows);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.teamAttendance = teamAttendance;
const pendingRegularizations = async (req, res) => {
    try {
        const ids = await assignedEmployeeIds(req.user.username);
        res.json(await prisma.regularizationRequest.findMany({ where: { status: 'PENDING', ...(ids.length ? { employeeId: { in: ids } } : {}) }, include: { employee: true }, orderBy: { createdAt: 'desc' } }));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.pendingRegularizations = pendingRegularizations;
const pendingWorkRequests = async (req, res) => {
    try {
        const ids = await assignedEmployeeIds(req.user.username);
        res.json(await prisma.workRequest.findMany({ where: { status: 'PENDING', ...(ids.length ? { employeeId: { in: ids } } : {}) }, include: { employee: true }, orderBy: { createdAt: 'desc' } }));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.pendingWorkRequests = pendingWorkRequests;
const recommendRegularization = async (req, res) => {
    res.json({ id: Number(req.params.id), managerRecommendation: true, remarks: req.body?.remarks || null });
};
exports.recommendRegularization = recommendRegularization;
const recommendWorkRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const saved = await prisma.workRequest.update({ where: { id }, data: { remarks: req.body?.remarks || null }, include: { employee: true } });
        res.json(saved);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.recommendWorkRequest = recommendWorkRequest;
const rejectWorkRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        const saved = await prisma.workRequest.update({ where: { id }, data: { status: 'REJECTED', remarks: req.body?.remarks || null, decidedAt: new Date(), decidedByUserId: user?.id }, include: { employee: true } });
        res.json(saved);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.rejectWorkRequest = rejectWorkRequest;
