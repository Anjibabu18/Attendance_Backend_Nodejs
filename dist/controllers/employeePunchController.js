"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endBreak = exports.startBreak = exports.todayBreaks = exports.today = exports.postCheckOut = exports.postCheckIn = exports.device = exports.qr = exports.place = void 0;
const client_1 = require("@prisma/client");
const attendancePunchService_1 = require("../services/attendancePunchService");
const qrService_1 = require("../services/qrService");
const prisma = new client_1.PrismaClient();
const isMissingBreakTable = (error) => error?.code === 'P2021' || String(error?.message || '').includes('break_entries') || String(error?.message || '').includes('does not exist');
const currentEmployee = async (userId) => {
    const employee = await prisma.employee.findUnique({
        where: { userId },
    });
    if (!employee) {
        throw new Error('Employee profile missing');
    }
    return employee;
};
const place = async (req, res) => {
    try {
        const latitude = parseFloat(req.query.latitude);
        const longitude = parseFloat(req.query.longitude);
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        const result = await (0, attendancePunchService_1.evaluatePlace)(employee, latitude, longitude);
        res.json({
            office: {
                id: result.office.id,
                officeName: result.office.officeName,
                latitude: result.office.latitude,
                longitude: result.office.longitude,
                radiusMeters: result.office.radiusMeters,
            },
            latitude,
            longitude,
            distanceMeters: result.distanceMeters,
            allowedRadiusMeters: result.office.radiusMeters,
            insideRadius: result.insideRadius,
        });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.place = place;
const qr = async (req, res) => {
    try {
        const token = req.query.token;
        const qrToken = await (0, qrService_1.validateQr)(token);
        res.json(await (0, qrService_1.qrResponse)(qrToken));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.qr = qr;
const device = async (req, res) => {
    try {
        const deviceId = req.query.deviceId;
        const approved = await (0, qrService_1.deviceApproved)(req.user.username, deviceId);
        res.json({ approved });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.device = device;
const postCheckIn = async (req, res) => {
    try {
        const latitude = parseFloat(req.body.latitude);
        const longitude = parseFloat(req.body.longitude);
        const deviceId = req.body.deviceId;
        const qrTokenStr = req.body.qrToken;
        const dailyCode = req.body.dailyCode;
        const file = req.file;
        const faceDescriptorStr = req.body.faceDescriptor;
        let faceDescriptor = null;
        if (faceDescriptorStr) {
            try {
                faceDescriptor = JSON.parse(faceDescriptorStr);
            }
            catch (e) { }
        } // multer populates this
        await (0, qrService_1.validateApprovedDevice)(req.user.username, deviceId);
        // Hardcode requireQrForPunch to true to fulfill the Permanent QR requirement
        const requireQrForPunch = true;
        if (requireQrForPunch) {
            if (!qrTokenStr) {
                return res.status(400).json({ error: 'QR token is required for punch-in' });
            }
            const qrData = await (0, qrService_1.validateQr)(qrTokenStr);
            const resp = await (0, qrService_1.qrResponse)(qrData);
            if (resp.mode === "FIXED_QR_DAILY_CODE") {
                if (!dailyCode || dailyCode !== resp.dailyCode) {
                    return res.status(400).json({ error: 'Invalid daily code' });
                }
            }
        }
        if (!file) {
            return res.status(400).json({ error: 'Selfie photo is required for punch' });
        }
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        if (employee.assignedOfficeLocationId) {
            const location = await prisma.officeLocation.findUnique({
                where: { id: employee.assignedOfficeLocationId }
            });
            if (location && location.officeIpAddress) {
                const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
                const ipStr = Array.isArray(clientIp) ? clientIp[0] : clientIp;
                if (!ipStr || !ipStr.includes(location.officeIpAddress)) {
                    return res.status(403).json({ error: `Punch rejected: Device not connected to the required office network.` });
                }
            }
        }
        const entry = await (0, attendancePunchService_1.checkIn)(employee, latitude, longitude, file.buffer, faceDescriptor);
        res.json(entry);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.postCheckIn = postCheckIn;
const postCheckOut = async (req, res) => {
    try {
        const latitude = parseFloat(req.body.latitude);
        const longitude = parseFloat(req.body.longitude);
        const deviceId = req.body.deviceId;
        const qrTokenStr = req.body.qrToken;
        const dailyCode = req.body.dailyCode;
        const file = req.file;
        const faceDescriptorStr = req.body.faceDescriptor;
        let faceDescriptor = null;
        if (faceDescriptorStr) {
            try {
                faceDescriptor = JSON.parse(faceDescriptorStr);
            }
            catch (e) { }
        }
        await (0, qrService_1.validateApprovedDevice)(req.user.username, deviceId);
        // Hardcode requireQrForPunch to true to fulfill the Permanent QR requirement
        const requireQrForPunch = true;
        if (requireQrForPunch) {
            if (!qrTokenStr) {
                return res.status(400).json({ error: 'QR token is required for punch-out' });
            }
            const qrData = await (0, qrService_1.validateQr)(qrTokenStr);
            const resp = await (0, qrService_1.qrResponse)(qrData);
            if (resp.mode === "FIXED_QR_DAILY_CODE") {
                if (!dailyCode || dailyCode !== resp.dailyCode) {
                    return res.status(400).json({ error: 'Invalid daily code' });
                }
            }
        }
        if (!file) {
            return res.status(400).json({ error: 'Selfie photo is required for punch' });
        }
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        if (employee.assignedOfficeLocationId) {
            const location = await prisma.officeLocation.findUnique({
                where: { id: employee.assignedOfficeLocationId }
            });
            if (location && location.officeIpAddress) {
                const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
                const ipStr = Array.isArray(clientIp) ? clientIp[0] : clientIp;
                if (!ipStr || !ipStr.includes(location.officeIpAddress)) {
                    return res.status(403).json({ error: `Punch rejected: Device not connected to the required office network.` });
                }
            }
        }
        const entry = await (0, attendancePunchService_1.checkOut)(employee, latitude, longitude, file.buffer, faceDescriptor);
        res.json(entry);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.postCheckOut = postCheckOut;
const today = async (req, res) => {
    try {
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        const todayDate = new Date();
        todayDate.setUTCHours(0, 0, 0, 0);
        const entry = await prisma.attendanceEntry.findFirst({
            where: { employeeId: employee.id, date: todayDate },
        });
        if (!entry)
            return res.json(null);
        // Normalize date and time fields for frontend
        res.json({
            ...entry,
            date: entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : String(entry.date).slice(0, 10),
            inTime: entry.inTime instanceof Date ? entry.inTime.toISOString().slice(11, 19) : (entry.inTime ? String(entry.inTime).slice(11, 19) : null),
            outTime: entry.outTime instanceof Date ? entry.outTime.toISOString().slice(11, 19) : (entry.outTime ? String(entry.outTime).slice(11, 19) : null),
        });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.today = today;
const todayBreaks = async (req, res) => {
    try {
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        const todayDate = new Date();
        todayDate.setUTCHours(0, 0, 0, 0);
        const breaks = await prisma.breakEntry.findMany({
            where: { employeeId: employee.id, date: todayDate },
            orderBy: { startTime: 'asc' }
        });
        res.json(breaks);
    }
    catch (error) {
        if (isMissingBreakTable(error))
            return res.json([]);
        res.status(400).json({ error: error.message });
    }
};
exports.todayBreaks = todayBreaks;
const startBreak = async (req, res) => {
    try {
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        const todayDate = new Date();
        todayDate.setUTCHours(0, 0, 0, 0);
        const attendance = await prisma.attendanceEntry.findFirst({
            where: { employeeId: employee.id, date: todayDate }
        });
        if (!attendance || !attendance.inTime) {
            return res.status(400).json({ error: 'Must punch in before taking a break' });
        }
        const activeBreak = await prisma.breakEntry.findFirst({
            where: { employeeId: employee.id, date: todayDate, endTime: null }
        });
        if (activeBreak) {
            return res.status(400).json({ error: 'Already on a break' });
        }
        const breakEntry = await prisma.breakEntry.create({
            data: {
                employeeId: employee.id,
                date: todayDate,
                startTime: new Date()
            }
        });
        res.json(breakEntry);
    }
    catch (error) {
        if (isMissingBreakTable(error))
            return res.status(400).json({ error: 'Break tracking is not enabled for this database yet' });
        res.status(400).json({ error: error.message });
    }
};
exports.startBreak = startBreak;
const endBreak = async (req, res) => {
    try {
        const user = await prisma.appUser.findUnique({ where: { username: req.user.username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const employee = await currentEmployee(user.id);
        const todayDate = new Date();
        todayDate.setUTCHours(0, 0, 0, 0);
        const activeBreak = await prisma.breakEntry.findFirst({
            where: { employeeId: employee.id, date: todayDate, endTime: null }
        });
        if (!activeBreak) {
            return res.status(400).json({ error: 'No active break found' });
        }
        const endTime = new Date();
        const durationMinutes = Math.round((endTime.getTime() - activeBreak.startTime.getTime()) / 60000);
        const updatedBreak = await prisma.breakEntry.update({
            where: { id: activeBreak.id },
            data: { endTime, durationMinutes }
        });
        res.json(updatedBreak);
    }
    catch (error) {
        if (isMissingBreakTable(error))
            return res.status(400).json({ error: 'Break tracking is not enabled for this database yet' });
        res.status(400).json({ error: error.message });
    }
};
exports.endBreak = endBreak;
