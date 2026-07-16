import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middlewares/authMiddleware';
import * as hrController from '../controllers/hrController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware for all HR routes
router.use(requireAuth);
router.use(requireRole(['ROLE_HR', 'ROLE_ADMIN']));

// Employees and reports
router.get('/employees', hrController.listEmployees);
router.get('/analytics', hrController.analytics);
router.get('/attendance', hrController.attendance);
router.post('/attendance', hrController.saveAttendance);
router.post('/attendance/range', hrController.saveAttendanceRange);
router.get('/attendance/summary', hrController.attendanceSummary);
router.get('/attendance/export', hrController.attendanceExport);
router.get('/attendance/report.pdf', hrController.attendanceReport);
router.get('/payroll', hrController.payroll);
router.get('/payroll/export', hrController.payrollExport);
router.get('/payroll-lock', hrController.getPayrollLock);
router.post('/payroll-lock', hrController.setPayrollLock);
router.get('/exceptions', hrController.listExceptions);
router.post('/exceptions/scan-missing-checkouts', hrController.scanMissingCheckouts);
router.post('/exceptions/:id/resolve', hrController.resolveException);

// Leave Requests
router.get('/leave-requests/pending', hrController.pendingLeaveRequests);
router.post('/leave-requests/:id/approve', hrController.approveLeaveRequest);
router.post('/leave-requests/:id/reject', hrController.rejectLeaveRequest);
router.post('/leave-requests/:id/approve-cancellation', hrController.approveLeaveCancellation);
router.post('/leave-requests/:id/reject-cancellation', hrController.rejectLeaveCancellation);

// Regularization
router.get('/regularization-requests/pending', hrController.pendingRegularizations);
router.post('/regularization-requests/:id/approve', hrController.approveRegularization);
router.post('/regularization-requests/:id/reject', hrController.rejectRegularization);

// Work
router.get('/work-requests/pending', hrController.pendingWorkRequests);
router.post('/work-requests/:id/approve', hrController.approveWorkRequest);
router.post('/work-requests/:id/reject', hrController.rejectWorkRequest);

// Comp Off
router.get('/comp-off-requests/pending', hrController.pendingCompOffs);
router.post('/comp-off-requests/:id/approve', hrController.approveCompOff);
router.post('/comp-off-requests/:id/reject', hrController.rejectCompOff);

// Device approvals and photos
router.get('/device-requests/pending', hrController.pendingDeviceRequests);
router.post('/device-requests/:id/approve', hrController.approveDeviceRequest);
router.post('/device-requests/:id/reject', hrController.rejectDeviceRequest);
router.post('/company-roles/:id/photo', upload.single('file'), hrController.uploadCompanyRolePhoto);
router.post('/daily-group-photos', upload.single('file'), hrController.uploadDailyPhoto);

export default router;
