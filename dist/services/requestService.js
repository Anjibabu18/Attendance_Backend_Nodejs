"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectCompOff = exports.approveCompOff = exports.attachCompOffDocument = exports.createCompOffRequest = exports.listCompOffRequests = exports.rejectWorkRequest = exports.approveWorkRequest = exports.attachWorkDocument = exports.createWorkRequest = exports.listWorkRequests = exports.rejectRegularization = exports.approveRegularization = exports.attachRegularizationDocument = exports.createRegularizationRequest = exports.listRegularizationRequests = exports.rejectLeaveRequest = exports.approveLeaveRequest = exports.attachLeaveDocument = exports.cancelLeaveRequest = exports.createLeaveRequest = exports.listLeaveRequests = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const cloudinaryService_1 = require("./cloudinaryService");
const mailService_1 = require("./mailService");
const attendanceReportService_1 = require("./attendanceReportService");
const notificationService_1 = require("./notificationService");
const requestInclude = {
    employee: true,
    decidedBy: {
        select: { id: true, username: true, role: true, enabled: true, lastLoginAt: true, lastLoginIp: true },
    },
};
const combineDateAndTime = (date, time) => {
    if (!time)
        return null;
    const combined = new Date(date);
    combined.setUTCHours(time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds(), 0);
    return combined;
};
const diffMinutes = (start, end) => {
    if (!start || !end)
        return null;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
};
const minutesLate = (date, inTime, defaultInTime, graceMinutes) => {
    const expected = combineDateAndTime(date, defaultInTime);
    if (!inTime || !expected)
        return 0;
    return Math.max(0, Math.round((inTime.getTime() - expected.getTime()) / 60000) - graceMinutes);
};
// ======================= Leave Requests =======================
const listLeaveRequests = async (employeeId) => {
    return prisma_1.default.leaveRequest.findMany({
        where: { employeeId },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
    });
};
exports.listLeaveRequests = listLeaveRequests;
const createLeaveRequest = async (employee, fromDate, toDate, reason, leaveType, mailSubject, mailMessage) => {
    if (fromDate > toDate)
        throw new Error('fromDate must be before or equal to toDate');
    const lr = await prisma_1.default.leaveRequest.create({
        data: {
            employeeId: employee.id,
            fromDate,
            toDate,
            reason,
            leaveType,
            mailSubject,
            mailMessage,
        },
        include: requestInclude,
    });
    await (0, mailService_1.notifyHr)(`Leave Request: ${employee.name}`, `Employee ${employee.name} requested leave from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}.\nReason: ${reason}`);
    await (0, notificationService_1.notifyAllHr)('📋 New Leave Request', `${employee.name} requested leave from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}.`);
    return lr;
};
exports.createLeaveRequest = createLeaveRequest;
const cancelLeaveRequest = async (id, employee, reason) => {
    const lr = await prisma_1.default.leaveRequest.findUnique({ where: { id } });
    if (!lr || lr.employeeId !== employee.id)
        throw new Error('Leave request not found');
    if (lr.status === 'PENDING') {
        return prisma_1.default.leaveRequest.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: requestInclude,
        });
    }
    else if (lr.status === 'APPROVED') {
        // Requires HR to cancel if already approved (in old Java code, it created a cancellation request)
        // We'll simplify this by just allowing it or throwing error based on logic
        throw new Error('Approved leaves must be cancelled by HR');
    }
    else {
        throw new Error(`Cannot cancel request in status: ${lr.status}`);
    }
};
exports.cancelLeaveRequest = cancelLeaveRequest;
const attachLeaveDocument = async (id, employee, fileBuffer) => {
    const lr = await prisma_1.default.leaveRequest.findUnique({ where: { id } });
    if (!lr || lr.employeeId !== employee.id)
        throw new Error('Leave request not found');
    if (!fileBuffer)
        throw new Error('Document file is required');
    const publicId = `leave-${id}-${Date.now()}`;
    const upload = await (0, cloudinaryService_1.uploadDocument)(fileBuffer, publicId);
    return prisma_1.default.leaveRequest.update({
        where: { id },
        data: { attachmentUrl: upload.url, attachmentName: publicId },
        include: requestInclude,
    });
};
exports.attachLeaveDocument = attachLeaveDocument;
const approveLeaveRequest = async (id, username, hrRemarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const existing = await prisma_1.default.leaveRequest.findUnique({ where: { id } });
    if (!existing)
        throw new Error('Leave request not found');
    await (0, attendanceReportService_1.assertPayrollUnlocked)(existing.fromDate.toISOString().slice(0, 7));
    const req = await prisma_1.default.leaveRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedByUserId: user.id, hrRemarks },
        include: { employee: { include: { user: true } } },
    });
    // Inject LEAVE entries into Attendance
    const start = new Date(req.fromDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(req.toDate);
    end.setUTCHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDay = new Date(d);
        await prisma_1.default.attendanceEntry.upsert({
            where: { uk_attendance_emp_date: { employeeId: req.employeeId, date: currentDay } },
            update: { status: 'LEAVE', leaveReason: req.leaveType || 'Approved Leave', workedMinutes: 0 },
            create: { employeeId: req.employeeId, date: currentDay, status: 'LEAVE', leaveReason: req.leaveType || 'Approved Leave', workedMinutes: 0 }
        });
    }
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Leave Request Approved', `Your leave request from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been approved.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '✅ Leave Approved', `Your leave from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been approved.`);
    return req;
};
exports.approveLeaveRequest = approveLeaveRequest;
const rejectLeaveRequest = async (id, username, hrRemarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const req = await prisma_1.default.leaveRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedByUserId: user.id, hrRemarks },
        include: { employee: { include: { user: true } } },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Leave Request Rejected', `Your leave request from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been rejected.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '❌ Leave Rejected', `Your leave from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been rejected.`);
    return req;
};
exports.rejectLeaveRequest = rejectLeaveRequest;
// ======================= Regularization Requests =======================
const listRegularizationRequests = async (employeeId) => {
    return prisma_1.default.regularizationRequest.findMany({
        where: { employeeId },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
    });
};
exports.listRegularizationRequests = listRegularizationRequests;
const createRegularizationRequest = async (employee, date, inTime, outTime, reason) => {
    const req = await prisma_1.default.regularizationRequest.create({
        data: {
            employeeId: employee.id,
            date,
            requestedInTime: inTime,
            requestedOutTime: outTime,
            reason,
        },
        include: requestInclude,
    });
    await (0, mailService_1.notifyHr)(`Regularization Request: ${employee.name}`, `Employee ${employee.name} requested regularization for ${date.toISOString().split('T')[0]}.\nReason: ${reason}`);
    await (0, notificationService_1.notifyAllHr)('📋 New Correction Request', `${employee.name} requested attendance correction for ${date.toISOString().split('T')[0]}.`);
    return req;
};
exports.createRegularizationRequest = createRegularizationRequest;
const attachRegularizationDocument = async (id, employee, fileBuffer) => {
    const r = await prisma_1.default.regularizationRequest.findUnique({ where: { id } });
    if (!r || r.employeeId !== employee.id)
        throw new Error('Regularization request not found');
    const publicId = `regularization-${id}-${Date.now()}`;
    const upload = await (0, cloudinaryService_1.uploadDocument)(fileBuffer, publicId);
    return prisma_1.default.regularizationRequest.update({
        where: { id },
        data: { attachmentUrl: upload.url, attachmentName: publicId },
        include: requestInclude,
    });
};
exports.attachRegularizationDocument = attachRegularizationDocument;
const approveRegularization = async (id, username, hrRemarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const existing = await prisma_1.default.regularizationRequest.findUnique({ where: { id } });
    if (!existing)
        throw new Error('Regularization request not found');
    await (0, attendanceReportService_1.assertPayrollUnlocked)(existing.date.toISOString().slice(0, 7));
    const req = await prisma_1.default.regularizationRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedByUserId: user.id, hrRemarks },
        include: { employee: { include: { user: true } } },
    });
    const currentEntry = await prisma_1.default.attendanceEntry.findUnique({
        where: { uk_attendance_emp_date: { employeeId: req.employeeId, date: req.date } },
    });
    const settings = await prisma_1.default.attendanceSettings.findFirst();
    const inTime = combineDateAndTime(req.date, req.requestedInTime) || currentEntry?.inTime || null;
    const outTime = combineDateAndTime(req.date, req.requestedOutTime) || currentEntry?.outTime || null;
    const workedMinutes = diffMinutes(inTime, outTime);
    const fullDayMinutes = settings?.fullDayMinutes ?? 480;
    const halfDayMinutes = settings?.halfDayMinutes ?? 240;
    const earlyLeaveGraceMinutes = settings?.earlyLeaveGraceMinutes ?? 10;
    const lateGraceMinutes = settings?.lateGraceMinutes ?? 10;
    const overtimeAfterMinutes = settings?.overtimeAfterMinutes ?? fullDayMinutes;
    const lateMinutes = minutesLate(req.date, inTime, settings?.defaultInTime, lateGraceMinutes);
    const overtimeMinutes = Math.max(0, (workedMinutes || 0) - overtimeAfterMinutes);
    const status = !inTime
        ? 'ABSENT'
        : workedMinutes !== null && workedMinutes < halfDayMinutes
            ? 'HALF_DAY'
            : workedMinutes !== null && workedMinutes < fullDayMinutes - earlyLeaveGraceMinutes
                ? 'HALF_DAY'
                : 'PRESENT';
    await prisma_1.default.attendanceEntry.upsert({
        where: { uk_attendance_emp_date: { employeeId: req.employeeId, date: req.date } },
        update: { inTime, outTime, workedMinutes, lateMinutes, overtimeMinutes, status: status, leaveReason: null },
        create: { employeeId: req.employeeId, date: req.date, inTime, outTime, workedMinutes, lateMinutes, overtimeMinutes, status: status },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Regularization Approved', `Your regularization request for ${req.date.toISOString().split('T')[0]} has been approved.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '✅ Correction Approved', `Your attendance correction for ${req.date.toISOString().split('T')[0]} has been approved.`);
    return req;
};
exports.approveRegularization = approveRegularization;
const rejectRegularization = async (id, username, hrRemarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const req = await prisma_1.default.regularizationRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedByUserId: user.id, hrRemarks },
        include: { employee: { include: { user: true } } },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Regularization Rejected', `Your regularization request for ${req.date.toISOString().split('T')[0]} has been rejected.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '❌ Correction Rejected', `Your attendance correction for ${req.date.toISOString().split('T')[0]} has been rejected.`);
    return req;
};
exports.rejectRegularization = rejectRegularization;
// ======================= Work Requests =======================
const listWorkRequests = async (employeeId) => {
    return prisma_1.default.workRequest.findMany({
        where: { employeeId },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
    });
};
exports.listWorkRequests = listWorkRequests;
const createWorkRequest = async (employee, type, fromDate, toDate, reason) => {
    const req = await prisma_1.default.workRequest.create({
        data: {
            employeeId: employee.id,
            type,
            fromDate,
            toDate,
            reason,
        },
        include: requestInclude,
    });
    await (0, mailService_1.notifyHr)(`Work Request: ${employee.name}`, `Employee ${employee.name} requested ${type} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}.\nReason: ${reason}`);
    await (0, notificationService_1.notifyAllHr)('📋 New Work Request', `${employee.name} requested ${type.replace(/_/g, ' ')} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}.`);
    return req;
};
exports.createWorkRequest = createWorkRequest;
const attachWorkDocument = async (id, employee, fileBuffer) => {
    const w = await prisma_1.default.workRequest.findUnique({ where: { id } });
    if (!w || w.employeeId !== employee.id)
        throw new Error('Work request not found');
    const publicId = `work-${id}-${Date.now()}`;
    const upload = await (0, cloudinaryService_1.uploadDocument)(fileBuffer, publicId);
    return prisma_1.default.workRequest.update({
        where: { id },
        data: { attachmentUrl: upload.url, attachmentName: publicId },
        include: requestInclude,
    });
};
exports.attachWorkDocument = attachWorkDocument;
const approveWorkRequest = async (id, username, remarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const req = await prisma_1.default.workRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedByUserId: user.id, remarks },
        include: { employee: { include: { user: true } } },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Work Request Approved', `Your work request from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been approved.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '✅ Work Request Approved', `Your work request from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been approved.`);
    return req;
};
exports.approveWorkRequest = approveWorkRequest;
const rejectWorkRequest = async (id, username, remarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const req = await prisma_1.default.workRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedByUserId: user.id, remarks },
        include: { employee: { include: { user: true } } },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Work Request Rejected', `Your work request from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been rejected.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '❌ Work Request Rejected', `Your work request from ${req.fromDate.toISOString().split('T')[0]} to ${req.toDate.toISOString().split('T')[0]} has been rejected.`);
    return req;
};
exports.rejectWorkRequest = rejectWorkRequest;
// ======================= Comp Off Requests =======================
const listCompOffRequests = async (employeeId) => {
    return prisma_1.default.compOffRequest.findMany({
        where: { employeeId },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
    });
};
exports.listCompOffRequests = listCompOffRequests;
const createCompOffRequest = async (employee, overtimeDate, requestedDate, overtimeMinutes, reason) => {
    const req = await prisma_1.default.compOffRequest.create({
        data: {
            employeeId: employee.id,
            overtimeDate,
            requestedDate,
            overtimeMinutes,
            reason,
        },
        include: requestInclude,
    });
    await (0, mailService_1.notifyHr)(`Comp-Off Request: ${employee.name}`, `Employee ${employee.name} requested comp-off for overtime on ${overtimeDate.toISOString().split('T')[0]}.\nReason: ${reason}`);
    await (0, notificationService_1.notifyAllHr)('📋 New Comp-Off Request', `${employee.name} requested comp-off for overtime on ${overtimeDate.toISOString().split('T')[0]}.`);
    return req;
};
exports.createCompOffRequest = createCompOffRequest;
const attachCompOffDocument = async (id, employee, fileBuffer) => {
    const c = await prisma_1.default.compOffRequest.findUnique({ where: { id } });
    if (!c || c.employeeId !== employee.id)
        throw new Error('CompOff request not found');
    const publicId = `compoff-${id}-${Date.now()}`;
    const upload = await (0, cloudinaryService_1.uploadDocument)(fileBuffer, publicId);
    return prisma_1.default.compOffRequest.update({
        where: { id },
        data: { attachmentUrl: upload.url, attachmentName: publicId },
        include: requestInclude,
    });
};
exports.attachCompOffDocument = attachCompOffDocument;
const approveCompOff = async (id, username, hrRemarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const req = await prisma_1.default.compOffRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedByUserId: user.id, hrRemarks },
        include: { employee: { include: { user: true } } },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Comp-Off Approved', `Your comp-off request for ${req.requestedDate.toISOString().split('T')[0]} has been approved.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '✅ Comp-Off Approved', `Your comp-off for ${req.requestedDate.toISOString().split('T')[0]} has been approved.`);
    return req;
};
exports.approveCompOff = approveCompOff;
const rejectCompOff = async (id, username, hrRemarks) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username } });
    if (!user)
        throw new Error('User not found');
    const req = await prisma_1.default.compOffRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedByUserId: user.id, hrRemarks },
        include: { employee: { include: { user: true } } },
    });
    await (0, mailService_1.notifyUser)(req.employee.user?.username, 'Comp-Off Rejected', `Your comp-off request for ${req.requestedDate.toISOString().split('T')[0]} has been rejected.`);
    await (0, notificationService_1.notifyUserRecord)(req.employee.user, '❌ Comp-Off Rejected', `Your comp-off for ${req.requestedDate.toISOString().split('T')[0]} has been rejected.`);
    return req;
};
exports.rejectCompOff = rejectCompOff;
