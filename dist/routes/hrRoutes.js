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
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const hrController = __importStar(require("../controllers/hrController"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Middleware for all HR routes
router.use(authMiddleware_1.requireAuth);
router.use((0, authMiddleware_1.requireRole)(['ROLE_HR', 'ROLE_ADMIN']));
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
exports.default = router;
