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
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const employeeRoutes_1 = __importDefault(require("./routes/employeeRoutes"));
const hrRoutes_1 = __importDefault(require("./routes/hrRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const managerRoutes_1 = __importDefault(require("./routes/managerRoutes"));
const realtimeRoutes_1 = __importDefault(require("./routes/realtimeRoutes"));
const accountRoutes_1 = __importDefault(require("./routes/accountRoutes"));
const webauthnRoutes_1 = __importDefault(require("./routes/webauthnRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
const isAllowedOrigin = (origin) => {
    if (!origin)
        return true;
    const normalized = origin.replace(/\/$/, '');
    if (allowedOrigins.length === 0 || allowedOrigins.includes(normalized))
        return true;
    return /^https:\/\/attendance-two-smoky\.vercel\.app$/.test(normalized)
        || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(normalized);
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.json({ status: 'OK', service: 'Attendance Node API', version: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'local' });
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Node.js Backend is running' });
});
app.get('/api/version', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Attendance Node API',
        commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
        nodeEnv: process.env.NODE_ENV || null,
        routes: {
            adminManagers: '/api/admin/managers',
            payrollLock: '/api/hr/payroll-lock?month=YYYY-MM',
            officeQr: '/api/admin/production/qr',
        },
    });
});
// Test DB connection endpoint
app.get('/api/db-test', async (req, res) => {
    try {
        const usersCount = await prisma.appUser.count();
        res.json({ status: 'OK', usersCount });
    }
    catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ status: 'ERROR', message: 'Database connection failed' });
    }
});
const timeString = (value, fallback) => {
    if (!value)
        return fallback;
    return value.toISOString().slice(11, 19);
};
app.get('/api/settings/attendance', async (req, res) => {
    try {
        const settings = await prisma.attendanceSettings.findFirst();
        res.json({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.get('/api/holidays', async (req, res) => {
    try {
        const month = req.query.month;
        const start = month ? new Date(`${month}-01T00:00:00Z`) : null;
        const end = start ? new Date(start) : null;
        if (end)
            end.setUTCMonth(end.getUTCMonth() + 1);
        const where = start && end ? { date: { gte: start, lt: end } } : {};
        const holidays = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
        res.json(holidays.map(h => ({ id: Number(h.id), date: h.date.toISOString().slice(0, 10), name: h.name })));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.get('/api/daily-group-photos', async (req, res) => {
    res.json([]);
});
app.get('/api/account/devices/current', async (req, res) => {
    res.json({ deviceId: String(req.query.deviceId || ''), approved: true, registered: true });
});
app.get('/api/notifications', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer '))
            return res.status(401).json({ error: 'Missing authorization' });
        const { verifyToken } = await Promise.resolve().then(() => __importStar(require('./utils/jwt')));
        const decoded = verifyToken(authHeader.substring(7));
        const user = await prisma.appUser.findUnique({ where: { username: decoded.sub } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        res.json(await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/notifications/read', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer '))
            return res.status(401).json({ error: 'Missing authorization' });
        const { verifyToken } = await Promise.resolve().then(() => __importStar(require('./utils/jwt')));
        const decoded = verifyToken(authHeader.substring(7));
        const user = await prisma.appUser.findUnique({ where: { username: decoded.sub } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
        res.json({ ok: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/employee', employeeRoutes_1.default);
app.use('/api/hr', hrRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/manager', managerRoutes_1.default);
app.use('/api/realtime', realtimeRoutes_1.default);
app.use('/api/account', accountRoutes_1.default);
app.use('/api/webauthn', webauthnRoutes_1.default);
app.use('/api/webhooks', webhookRoutes_1.default);
const attendanceJob_1 = require("./jobs/attendanceJob");
app.get('/api/cron/daily-attendance', async (req, res) => {
    // Optional: check Authorization header if Vercel CRON_SECRET is set
    if (process.env.CRON_SECRET) {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized cron request' });
        }
    }
    await (0, attendanceJob_1.runAttendanceMissingCheckoutJob)();
    res.json({ status: 'OK', message: 'Cron job executed' });
});
// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});
const attendanceJob_2 = require("./jobs/attendanceJob");
const pushReminderJob_1 = require("./jobs/pushReminderJob");
const emailDigestJob_1 = require("./jobs/emailDigestJob");
const liveVerificationJob_1 = require("./jobs/liveVerificationJob");
exports.default = app;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        (0, attendanceJob_1.runAttendanceMissingCheckoutJob)().catch(console.error);
        (0, attendanceJob_2.startAttendanceCronJob)();
        (0, pushReminderJob_1.startPushReminderJobs)();
        (0, emailDigestJob_1.startEmailDigestJob)();
        (0, liveVerificationJob_1.startLiveVerificationCronJob)();
    });
}
