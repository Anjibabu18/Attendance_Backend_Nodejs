"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDailyPhoto = exports.uploadCompanyRolePhoto = exports.rejectDeviceRequest = exports.approveDeviceRequest = exports.pendingDeviceRequests = exports.rejectLeaveCancellation = exports.approveLeaveCancellation = exports.saveAttendanceRange = exports.saveAttendance = exports.rejectCompOff = exports.approveCompOff = exports.pendingCompOffs = exports.rejectWorkRequest = exports.approveWorkRequest = exports.pendingWorkRequests = exports.rejectRegularization = exports.approveRegularization = exports.pendingRegularizations = exports.rejectLeaveRequest = exports.approveLeaveRequest = exports.pendingLeaveRequests = exports.attendanceReport = exports.attendanceExport = exports.attendanceSummary = exports.attendance = exports.scanMissingCheckouts = exports.resolveException = exports.listExceptions = exports.setPayrollLock = exports.getPayrollLock = exports.payrollExport = exports.payroll = exports.analytics = exports.listEmployees = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const RequestService = __importStar(require("../services/requestService"));
const analyticsService_1 = require("../services/analyticsService");
const attendanceReportService_1 = require("../services/attendanceReportService");
const mailService_1 = require("../services/mailService");
const cloudinaryService_1 = require("../services/cloudinaryService");
const notificationService_1 = require("../services/notificationService");
const listEmployees = async (req, res) => {
    try {
        const employees = await prisma_1.default.employee.findMany({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.listEmployees = listEmployees;
const analytics = async (req, res) => {
    try {
        const month = req.query.month;
        if (!month)
            throw new Error('Month parameter is required');
        res.json(await (0, analyticsService_1.monthAnalytics)(month));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.analytics = analytics;
const payroll = async (req, res) => {
    try {
        const month = req.query.month;
        if (!month)
            throw new Error('Month parameter is required');
        res.json(await (0, attendanceReportService_1.payrollRegister)(month));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.payroll = payroll;
const payrollExport = async (req, res) => {
    try {
        const month = req.query.month;
        if (!month)
            throw new Error('Month parameter is required');
        res.header('Content-Type', 'text/csv');
        res.attachment(`payroll-${month}.csv`);
        res.send(await (0, attendanceReportService_1.payrollCsv)(month));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.payrollExport = payrollExport;
const getPayrollLock = async (req, res) => {
    try {
        const month = req.query.month;
        if (!month)
            throw new Error('Month parameter is required');
        res.json(await (0, attendanceReportService_1.payrollLockView)(month));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.getPayrollLock = getPayrollLock;
const setPayrollLock = async (req, res) => {
    try {
        const month = req.query.month;
        const locked = String(req.query.locked) === 'true';
        if (!month)
            throw new Error('Month parameter is required');
        await prisma_1.default.payrollLock.upsert({
            where: { month },
            update: { locked, updatedAt: new Date(), updatedBy: req.user.username },
            create: { month, locked, updatedBy: req.user.username },
        });
        res.json(await (0, attendanceReportService_1.payrollLockView)(month));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.setPayrollLock = setPayrollLock;
const listExceptions = async (req, res) => {
    try {
        const exceptions = await prisma_1.default.attendanceException.findMany({
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
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.listExceptions = listExceptions;
const resolveException = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const saved = await prisma_1.default.attendanceException.update({ where: { id }, data: { resolved: true }, include: { employee: true } });
        res.json(saved);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.resolveException = resolveException;
const scanMissingCheckouts = async (req, res) => {
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const entries = await prisma_1.default.attendanceEntry.findMany({
            where: { inTime: { not: null }, outTime: null, date: { lt: today } },
            include: { employee: { include: { user: true } } },
        });
        let createdExceptions = 0;
        for (const entry of entries) {
            const message = `Checked in on ${entry.date.toISOString().slice(0, 10)} but checkout is still missing`;
            const existing = await prisma_1.default.attendanceException.findFirst({
                where: { employeeId: entry.employeeId, type: 'MISSING_CHECKOUT', message, resolved: false },
            });
            if (existing)
                continue;
            await prisma_1.default.attendanceException.create({ data: { employeeId: entry.employeeId, type: 'MISSING_CHECKOUT', message } });
            createdExceptions++;
            await (0, mailService_1.notifyUser)(entry.employee.user.username, 'Missing checkout reminder', `${message}. Please submit an attendance correction if needed.`);
            await (0, notificationService_1.notify)(entry.employee.user.id, '⚠️ Missing Checkout', `You didn't punch out on ${entry.date.toISOString().split('T')[0]}. Please submit a correction.`);
        }
        res.json({ openEntries: entries.length, createdExceptions });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.scanMissingCheckouts = scanMissingCheckouts;
const attendance = async (req, res) => {
    try {
        const employeeId = Number(req.query.employeeId);
        const month = req.query.month;
        if (!employeeId || !month)
            throw new Error('employeeId and month are required');
        res.json(await prisma_1.default.attendanceEntry.findMany({ where: { employeeId, date: { gte: (0, attendanceReportService_1.startOfMonth)(month), lt: (0, attendanceReportService_1.endOfMonth)(month) } }, orderBy: { date: 'asc' } }));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.attendance = attendance;
const attendanceSummary = async (req, res) => {
    try {
        const employeeId = Number(req.query.employeeId);
        const month = req.query.month;
        if (!employeeId || !month)
            throw new Error('employeeId and month are required');
        res.json(await (0, attendanceReportService_1.monthSummary)(employeeId, month));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.attendanceSummary = attendanceSummary;
const attendanceExport = async (req, res) => {
    try {
        const employeeId = Number(req.query.employeeId);
        const month = req.query.month;
        if (!employeeId || !month)
            throw new Error('employeeId and month are required');
        const employee = await prisma_1.default.employee.findUnique({ where: { id: employeeId } });
        if (!employee)
            throw new Error('Employee not found');
        const entries = await prisma_1.default.attendanceEntry.findMany({ where: { employeeId, date: { gte: (0, attendanceReportService_1.startOfMonth)(month), lt: (0, attendanceReportService_1.endOfMonth)(month) } }, orderBy: { date: 'asc' } });
        res.header('Content-Type', 'text/csv');
        res.attachment(`attendance-${employee.employeeNumber}-${month}.csv`);
        res.send((0, attendanceReportService_1.attendanceCsv)(employee, month, entries));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.attendanceExport = attendanceExport;
const attendanceReport = async (req, res) => {
    try {
        const employeeId = Number(req.query.employeeId);
        const month = req.query.month;
        if (!employeeId || !month)
            throw new Error('employeeId and month are required');
        const employee = await prisma_1.default.employee.findUnique({ where: { id: employeeId } });
        if (!employee)
            throw new Error('Employee not found');
        const summary = await (0, attendanceReportService_1.monthSummary)(employeeId, month);
        const body = (0, attendanceReportService_1.simplePdf)('Attendance Report', [`Employee: ${employee.name} (${employee.employeeNumber})`, `Month: ${month}`, `Working Days: ${summary.workingDays}`, `Present: ${summary.presentDays}`, `Half Days: ${summary.halfDayDays}`, `Leave: ${summary.leaveDays}`, `Worked Minutes: ${summary.totalWorkedMinutes}`]);
        res.header('Content-Type', 'application/pdf');
        res.attachment(`attendance-${employee.employeeNumber}-${month}.pdf`);
        res.send(body);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.attendanceReport = attendanceReport;
// Leaves
const pendingLeaveRequests = async (req, res) => {
    try {
        const leaves = await prisma_1.default.leaveRequest.findMany({
            where: { status: 'PENDING' },
            include: { employee: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(leaves);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.pendingLeaveRequests = pendingLeaveRequests;
const approveLeaveRequest = async (req, res) => {
    try {
        res.json(await RequestService.approveLeaveRequest(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.approveLeaveRequest = approveLeaveRequest;
const rejectLeaveRequest = async (req, res) => {
    try {
        res.json(await RequestService.rejectLeaveRequest(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.rejectLeaveRequest = rejectLeaveRequest;
// Regularization
const pendingRegularizations = async (req, res) => {
    try {
        const reqs = await prisma_1.default.regularizationRequest.findMany({
            where: { status: 'PENDING' },
            include: { employee: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reqs);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.pendingRegularizations = pendingRegularizations;
const approveRegularization = async (req, res) => {
    try {
        res.json(await RequestService.approveRegularization(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.approveRegularization = approveRegularization;
const rejectRegularization = async (req, res) => {
    try {
        res.json(await RequestService.rejectRegularization(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.rejectRegularization = rejectRegularization;
// Work
const pendingWorkRequests = async (req, res) => {
    try {
        const reqs = await prisma_1.default.workRequest.findMany({
            where: { status: 'PENDING' },
            include: { employee: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reqs);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.pendingWorkRequests = pendingWorkRequests;
const approveWorkRequest = async (req, res) => {
    try {
        res.json(await RequestService.approveWorkRequest(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.approveWorkRequest = approveWorkRequest;
const rejectWorkRequest = async (req, res) => {
    try {
        res.json(await RequestService.rejectWorkRequest(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.rejectWorkRequest = rejectWorkRequest;
// Comp Off
const pendingCompOffs = async (req, res) => {
    try {
        const reqs = await prisma_1.default.compOffRequest.findMany({
            where: { status: 'PENDING' },
            include: { employee: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reqs);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.pendingCompOffs = pendingCompOffs;
const approveCompOff = async (req, res) => {
    try {
        res.json(await RequestService.approveCompOff(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.approveCompOff = approveCompOff;
const rejectCompOff = async (req, res) => {
    try {
        res.json(await RequestService.rejectCompOff(parseInt(req.params.id), req.user.username, req.body?.remarks));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
};
exports.rejectCompOff = rejectCompOff;
const toDateOnly = (value) => {
    const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00Z`);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};
const timeDate = (value) => {
    if (!value)
        return null;
    return new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}Z`);
};
const workedMinutes = (inTime, outTime) => {
    if (!inTime || !outTime)
        return null;
    const diff = Math.round((outTime.getTime() - inTime.getTime()) / 60000);
    return Math.max(0, diff);
};
const saveAttendance = async (req, res) => {
    try {
        const employeeId = Number(req.body.employeeId);
        const date = toDateOnly(req.body.date);
        const inTime = timeDate(req.body.inTime);
        const outTime = timeDate(req.body.outTime);
        const minutes = workedMinutes(inTime, outTime);
        const status = inTime ? (minutes !== null && minutes < 240 ? 'HALF_DAY' : 'PRESENT') : 'ABSENT';
        const saved = await prisma_1.default.attendanceEntry.upsert({
            where: { uk_attendance_emp_date: { employeeId, date } },
            update: { inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status },
            create: { employeeId, date, inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status },
        });
        res.json(saved);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.saveAttendance = saveAttendance;
const saveAttendanceRange = async (req, res) => {
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
            await prisma_1.default.attendanceEntry.upsert({
                where: { uk_attendance_emp_date: { employeeId, date: current } },
                update: { inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status },
                create: { employeeId, date: current, inTime, outTime, workedMinutes: minutes, leaveReason: req.body.leaveReason || null, status: status },
            });
            updatedDays++;
        }
        res.json({ updatedDays });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.saveAttendanceRange = saveAttendanceRange;
const approveLeaveCancellation = async (req, res) => {
    try {
        const saved = await prisma_1.default.leaveRequest.update({ where: { id: Number(req.params.id) }, data: { status: 'CANCELLED', hrRemarks: req.body?.remarks || null, decidedAt: new Date() }, include: { employee: { include: { user: true } } } });
        await (0, notificationService_1.notify)(saved.employee.user?.id, '✅ Leave Cancellation Approved', `Your request to cancel leave on ${saved.fromDate.toISOString().split('T')[0]} was approved.`);
        res.json(saved);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.approveLeaveCancellation = approveLeaveCancellation;
const rejectLeaveCancellation = async (req, res) => {
    try {
        const saved = await prisma_1.default.leaveRequest.update({ where: { id: Number(req.params.id) }, data: { status: 'APPROVED', hrRemarks: req.body?.remarks || null, decidedAt: new Date() }, include: { employee: { include: { user: true } } } });
        await (0, notificationService_1.notify)(saved.employee.user?.id, '❌ Leave Cancellation Rejected', `Your request to cancel leave on ${saved.fromDate.toISOString().split('T')[0]} was rejected.`);
        res.json(saved);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.rejectLeaveCancellation = rejectLeaveCancellation;
const pendingDeviceRequests = async (req, res) => {
    try {
        const pending = await prisma_1.default.deviceRequest.findMany({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.pendingDeviceRequests = pendingDeviceRequests;
const approveDeviceRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const dr = await prisma_1.default.deviceRequest.findUnique({ where: { id } });
        if (!dr)
            throw new Error('Device request not found');
        await prisma_1.default.deviceRequest.update({ where: { id }, data: { approved: true } });
        await (0, notificationService_1.notify)(dr.employeeId ? (await prisma_1.default.employee.findUnique({ where: { id: dr.employeeId } }))?.userId : null, '📱 Device Approved', `Your device ${dr.label} is now approved for punches.`);
        res.json({ ok: true, id, approved: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.approveDeviceRequest = approveDeviceRequest;
const rejectDeviceRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const dr = await prisma_1.default.deviceRequest.findUnique({ where: { id } });
        await prisma_1.default.deviceRequest.delete({ where: { id } });
        if (dr) {
            await (0, notificationService_1.notify)(dr.employeeId ? (await prisma_1.default.employee.findUnique({ where: { id: dr.employeeId } }))?.userId : null, '❌ Device Rejected', `Your device ${dr.label} registration was rejected.`);
        }
        res.json({ ok: true, id, approved: false });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.rejectDeviceRequest = rejectDeviceRequest;
const uploadCompanyRolePhoto = async (req, res) => {
    try {
        const file = req.file;
        if (!file)
            throw new Error('Photo file is required');
        const upload = await (0, cloudinaryService_1.uploadGroupPhoto)(file.buffer, `company-role-${req.params.id}`);
        const saved = await prisma_1.default.companyRole.update({ where: { id: Number(req.params.id) }, data: { photoUrl: upload.url } });
        res.json(saved);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.uploadCompanyRolePhoto = uploadCompanyRolePhoto;
const uploadDailyPhoto = async (req, res) => {
    try {
        const file = req.file;
        if (!file)
            throw new Error('Photo file is required');
        const date = String(req.query.date || new Date().toISOString().slice(0, 10));
        const upload = await (0, cloudinaryService_1.uploadDailyGroupPhoto)(file.buffer, `daily-group-${date}`);
        res.json({ id: Date.now(), date, photoUrl: upload.url });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.uploadDailyPhoto = uploadDailyPhoto;
