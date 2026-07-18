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
const adminController = __importStar(require("../controllers/adminController"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Middleware for all Admin routes
router.use(authMiddleware_1.requireAuth);
router.use((0, authMiddleware_1.requireRole)(['ROLE_ADMIN']));
router.get('/reports/statutory', adminController.statutoryReport);
router.get('/employees', adminController.listEmployees);
router.post('/employees', adminController.createEmployee);
router.get('/employees/:id/detail', adminController.employeeDetail);
router.post('/employees/import', upload.single('file'), adminController.importEmployees);
router.post('/employees/passwords/bulk-reset', adminController.bulkResetPasswords);
router.post('/employees/bulk-edit', adminController.bulkEditEmployees);
router.post('/employees/:id', adminController.updateEmployee);
router.post('/employees/:id/office-location', adminController.assignEmployeeOfficeLocation);
router.post('/employees/:id/reset-device-binding', adminController.resetDeviceBinding);
router.post('/employees/:id/password', adminController.resetEmployeePassword);
router.post('/employees/:id/status', adminController.updateEmployeeStatus);
router.post('/employees/:id/username', adminController.updateEmployeeUsername);
router.post('/employees/:id/enabled', adminController.setEmployeeEnabled);
router.get('/employees/:id/leave-balances', adminController.employeeLeaveBalances);
router.get('/managers', adminController.listManagers);
router.post('/manager', adminController.createManager);
router.post('/hr', adminController.createHr);
router.get('/manager-assignments', adminController.listManagerAssignments);
router.post('/manager-assignments', adminController.assignManager);
router.get('/settings/attendance', adminController.getAttendanceSettings);
router.post('/settings/attendance', adminController.saveAttendanceSettings);
router.get('/holidays', adminController.listHolidays);
router.post('/holidays', adminController.createHoliday);
router.delete('/holidays/:id', adminController.deleteHoliday);
router.get('/analytics', adminController.analytics);
router.get('/production-checklist', adminController.productionChecklist);
router.get('/audit-logs', adminController.auditLogs);
router.get('/audit-logs.csv', adminController.auditLogsCsv);
router.get('/office-location', adminController.listOfficeLocations);
router.get('/office-location/active', adminController.activeOfficeLocation);
router.post('/office-location/active', adminController.saveActiveOfficeLocation);
router.put('/office-location/:id', adminController.updateOfficeLocation);
router.delete('/office-location/:id', adminController.deleteOfficeLocation);
router.post('/leave-balances', adminController.setLeaveBalance);
router.post('/roster', adminController.assignRoster);
router.get('/backup/employees.csv', adminController.employeesCsv);
router.post('/company/photo', upload.single('file'), adminController.uploadCompanyPhoto);
// Org Setup
router.get('/departments', adminController.listDepartments);
router.post('/departments', adminController.createDepartment);
router.get('/shifts', adminController.listShifts);
router.post('/shifts', adminController.createShift);
router.get('/company-roles', adminController.listCompanyRoles);
router.post('/company-roles', adminController.createCompanyRole);
router.post('/company-roles/:id/photo', upload.single('file'), adminController.uploadCompanyRolePhoto);
// Production Controls
router.get('/production/devices', adminController.productionDevices);
router.get('/production/exceptions', adminController.productionExceptions);
router.get('/production/sessions', adminController.productionSessions);
router.get('/production/backup', adminController.productionBackup);
router.post('/production/policies', adminController.saveProductionPolicy);
router.post('/production/devices/:id/approval', adminController.approveProductionDevice);
router.post('/production/qr', adminController.generateQr);
router.get('/production/qr/latestToken', adminController.getLatestQrToken);
router.get('/production/qr/:token.png', adminController.getQrImage);
exports.default = router;
