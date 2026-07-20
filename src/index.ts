import prisma from './prisma';
import './config/env';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes';
import employeeRoutes from './routes/employeeRoutes';
import hrRoutes from './routes/hrRoutes';
import adminRoutes from './routes/adminRoutes';
import managerRoutes from './routes/managerRoutes';
import realtimeRoutes from './routes/realtimeRoutes';
import accountRoutes from './routes/accountRoutes';
import webauthnRoutes from './routes/webauthnRoutes';
import webhookRoutes from './routes/webhookRoutes';


const app = express();

const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.length === 0 || allowedOrigins.includes(normalized)) return true;
  return /^https:\/\/attendance-two-smoky\.vercel\.app$/.test(normalized)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(normalized)
    || normalized === 'https://attendance.anushatechnologies.com';
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

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

app.get('/api/company', async (req, res) => {
  res.json({ name: 'Anusha Technologies', logoUrl: '/vd-logo.png' });
});

// Test DB connection endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const usersCount = await prisma.appUser.count();
    res.json({ status: 'OK', usersCount });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ status: 'ERROR', message: 'Database connection failed' });
  }
});

const timeString = (value: Date | null | undefined, fallback: string) => {
  if (!value) return fallback;
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
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/holidays', async (req, res) => {
  try {
    const month = req.query.month as string | undefined;
    const start = month ? new Date(`${month}-01T00:00:00Z`) : null;
    const end = start ? new Date(start) : null;
    if (end) end.setUTCMonth(end.getUTCMonth() + 1);
    const where = start && end ? { date: { gte: start, lt: end } } : {};
    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
    res.json(holidays.map(h => ({ id: Number(h.id), date: h.date.toISOString().slice(0, 10), name: h.name })));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

app.get('/api/daily-group-photos', async (req, res) => {
  res.json([]);
});

app.get('/api/notifications', async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization' });
    const { verifyToken } = await import('./utils/jwt');
    const decoded: any = verifyToken(authHeader.substring(7));
    const user = await prisma.appUser.findUnique({ where: { username: decoded.sub as string } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

app.post('/api/notifications/read', async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization' });
    const { verifyToken } = await import('./utils/jwt');
    const decoded: any = verifyToken(authHeader.substring(7));
    const user = await prisma.appUser.findUnique({ where: { username: decoded.sub as string } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

app.get('/api/notifications/stream', async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization || req.query.token;
    let tokenStr = authHeader;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      tokenStr = authHeader.substring(7);
    }
    if (!tokenStr) return res.status(401).json({ error: 'Missing authorization' });
    
    const { verifyToken } = await import('./utils/jwt');
    const decoded: any = verifyToken(tokenStr as string);
    const user = await prisma.appUser.findUnique({ where: { username: decoded.sub as string } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('event: open\ndata: {}\n\n');

    const { addSseClient } = await import('./services/notificationService');
    addSseClient(user.id, res);

  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/webauthn', webauthnRoutes);
app.use('/api/webhooks', webhookRoutes);

import { runAttendanceMissingCheckoutJob } from './jobs/attendanceJob';
app.get('/api/cron/daily-attendance', async (req, res) => {
  // Optional: check Authorization header if Vercel CRON_SECRET is set
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized cron request' });
    }
  }
  await runAttendanceMissingCheckoutJob();
  res.json({ status: 'OK', message: 'Cron job executed' });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

import { startAttendanceCronJob } from './jobs/attendanceJob';
import { startPushReminderJobs } from './jobs/pushReminderJob';
import { startEmailDigestJob } from './jobs/emailDigestJob';
import { startLiveVerificationCronJob } from './jobs/liveVerificationJob';
import { initializeCronJobs } from './services/cronService';

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    runAttendanceMissingCheckoutJob().catch(console.error);
    startAttendanceCronJob();
    startPushReminderJobs();
    startEmailDigestJob();
    startLiveVerificationCronJob();
    initializeCronJobs();
  });
}










