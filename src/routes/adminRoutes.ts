import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middlewares/authMiddleware';
import * as adminController from '../controllers/adminController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware for all Admin routes
router.use(requireAuth);
router.use(requireRole(['ROLE_ADMIN']));

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

router.get('/office-location', adminController.listOfficeLocations);
router.get('/office-location/active', adminController.activeOfficeLocation);
router.post('/office-location/active', adminController.saveActiveOfficeLocation);
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

export default router;

