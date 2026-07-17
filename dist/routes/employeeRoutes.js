"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const employeePunchController_1 = require("../controllers/employeePunchController");
const pushController_1 = require("../controllers/pushController");
const employeeController_1 = require("../controllers/employeeController");
const streaksController_1 = require("../controllers/streaksController");
const verificationController_1 = require("../controllers/verificationController");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Middleware for all employee routes
router.use(authMiddleware_1.requireAuth);
router.use((0, authMiddleware_1.requireRole)(['ROLE_EMPLOYEE']));
// General Employee routes
router.get('/profile', employeeController_1.profile);
router.post('/profile/photo', upload.single('file'), employeeController_1.uploadProfilePhoto);
router.post('/face-register', employeeController_1.registerFace);
router.get('/attendance', employeeController_1.attendance);
router.get('/attendance/summary', employeeController_1.attendanceSummary);
router.get('/attendance/export', employeeController_1.attendanceExport);
router.get('/attendance/report.pdf', employeeController_1.attendanceReport);
router.get('/attendance/payslip', employeeController_1.payslip);
router.get('/leave-balances', employeeController_1.leaveBalances);
router.get('/streaks', streaksController_1.getStreaks);
router.get('/live-verify/pending', verificationController_1.getPendingVerification);
router.post('/live-verify/:requestId/submit', upload.single('file'), verificationController_1.submitVerification);
// Push notifications
router.get('/push/vapid-key', pushController_1.vapidKey);
router.post('/push/subscribe', pushController_1.subscribe);
router.post('/push/unsubscribe', pushController_1.unsubscribe);
router.post('/push/test', pushController_1.testPush);
// Leaves
router.get('/leave-requests', employeeController_1.listLeaveRequests);
router.post('/leave-requests', employeeController_1.createLeaveRequest);
router.post('/leave-requests/:id/cancel', employeeController_1.cancelLeaveRequest);
router.post('/leave-requests/:id/attachment', upload.single('file'), employeeController_1.uploadLeaveAttachment);
// Regularization
router.get('/regularization-requests', employeeController_1.listRegularizations);
router.post('/regularization-requests', employeeController_1.createRegularization);
router.post('/regularization-requests/:id/attachment', upload.single('file'), employeeController_1.uploadRegularizationAttachment);
// Work
router.get('/work-requests', employeeController_1.listWorkRequests);
router.post('/work-requests', employeeController_1.createWorkRequest);
router.post('/work-requests/:id/attachment', upload.single('file'), employeeController_1.uploadWorkAttachment);
// Comp Off
router.get('/comp-off-requests', employeeController_1.listCompOffs);
router.post('/comp-off-requests', employeeController_1.createCompOff);
router.post('/comp-off-requests/:id/attachment', upload.single('file'), employeeController_1.uploadCompOffAttachment);
// Punch routes
router.get('/breaks/today', employeePunchController_1.todayBreaks);
router.post('/breaks/start', employeePunchController_1.startBreak);
router.post('/breaks/end', employeePunchController_1.endBreak);
router.get('/punch/place', employeePunchController_1.place);
router.get('/punch/today', employeePunchController_1.today);
router.get('/punch/qr', employeePunchController_1.qr);
router.get('/punch/device', employeePunchController_1.device);
router.post('/punch/checkin', upload.single('file'), employeePunchController_1.postCheckIn);
router.post('/punch/checkout', upload.single('file'), employeePunchController_1.postCheckOut);
exports.default = router;
