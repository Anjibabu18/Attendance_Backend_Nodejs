import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middlewares/authMiddleware';
import { place, postCheckIn, postCheckOut, today, qr, device, todayBreaks, startBreak, endBreak } from '../controllers/employeePunchController';
import { vapidKey, subscribe, unsubscribe, testPush } from '../controllers/pushController';
import { profile, uploadProfilePhoto, attendance, attendanceSummary, attendanceExport, attendanceReport, payslip, leaveBalances, listLeaveRequests, createLeaveRequest, cancelLeaveRequest, uploadLeaveAttachment, listRegularizations, createRegularization, uploadRegularizationAttachment, listWorkRequests, createWorkRequest, uploadWorkAttachment, listCompOffs, createCompOff, uploadCompOffAttachment } from '../controllers/employeeController';
import { getStreaks } from '../controllers/streaksController';
import { getPendingVerification, submitVerification } from '../controllers/verificationController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Push notifications (Available to any authenticated user, including Admins)
router.get('/push/vapid-key', requireAuth, vapidKey);
router.post('/push/subscribe', requireAuth, subscribe);
router.post('/push/unsubscribe', requireAuth, unsubscribe);
router.post('/push/test', requireAuth, testPush);

// Middleware for all employee routes
router.use(requireAuth);
router.use(requireRole(['ROLE_EMPLOYEE']));

// General Employee routes
router.get('/profile', profile);
router.post('/profile/photo', upload.single('file'), uploadProfilePhoto);
router.get('/attendance', attendance);
router.get('/attendance/summary', attendanceSummary);
router.get('/attendance/export', attendanceExport);
router.get('/attendance/report.pdf', attendanceReport);
router.get('/attendance/payslip', payslip);
router.get('/leave-balances', leaveBalances);
router.get('/streaks', getStreaks);
router.get('/live-verify/pending', getPendingVerification);
router.post('/live-verify/:requestId/submit', upload.single('file'), submitVerification);

// Leaves
router.get('/leave-requests', listLeaveRequests);
router.post('/leave-requests', createLeaveRequest);
router.post('/leave-requests/:id/cancel', cancelLeaveRequest);
router.post('/leave-requests/:id/attachment', upload.single('file'), uploadLeaveAttachment);

// Regularization
router.get('/regularization-requests', listRegularizations);
router.post('/regularization-requests', createRegularization);
router.post('/regularization-requests/:id/attachment', upload.single('file'), uploadRegularizationAttachment);

// Work
router.get('/work-requests', listWorkRequests);
router.post('/work-requests', createWorkRequest);
router.post('/work-requests/:id/attachment', upload.single('file'), uploadWorkAttachment);

// Comp Off
router.get('/comp-off-requests', listCompOffs);
router.post('/comp-off-requests', createCompOff);
router.post('/comp-off-requests/:id/attachment', upload.single('file'), uploadCompOffAttachment);

// Punch routes
router.get('/breaks/today', todayBreaks);
router.post('/breaks/start', startBreak);
router.post('/breaks/end', endBreak);

router.get('/punch/place', place);
router.get('/punch/today', today);
router.get('/punch/qr', qr);
router.get('/punch/device', device);
router.post('/punch/checkin', upload.single('file'), postCheckIn);
router.post('/punch/checkout', upload.single('file'), postCheckOut);

export default router;

