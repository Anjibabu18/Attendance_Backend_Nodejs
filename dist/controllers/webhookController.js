"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerScheduledPushesEndpoint = exports.biometricPunch = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const attendancePunchService_1 = require("../services/attendancePunchService");
const WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET || 'zkt-biometric-secret-2026';
const biometricPunch = async (req, res) => {
    try {
        const { secret, employeeNumber, timestamp, punchType } = req.body;
        if (secret !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: 'Unauthorized webhook secret' });
        }
        if (!employeeNumber || !timestamp || !punchType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const employee = await prisma_1.default.employee.findUnique({
            where: { employeeNumber }
        });
        if (!employee) {
            return res.status(404).json({ error: `Employee not found: ${employeeNumber}` });
        }
        // Since this is a hardware punch, we don't have GPS or a selfie photo.
        // We will pass 0, 0 for lat/lng, and a small empty buffer for photo, 
        // or ideally the services support null. But checkIn requires a Buffer.
        const emptyPhotoBuffer = Buffer.from('');
        let entry;
        if (punchType === 'IN') {
            entry = await (0, attendancePunchService_1.checkIn)(employee, 0, 0, emptyPhotoBuffer, null, true);
        }
        else if (punchType === 'OUT') {
            entry = await (0, attendancePunchService_1.checkOut)(employee, 0, 0, emptyPhotoBuffer, null, true);
        }
        else {
            return res.status(400).json({ error: 'Invalid punchType. Must be IN or OUT' });
        }
        return res.json({ success: true, entry });
    }
    catch (error) {
        console.error('Biometric webhook error:', error);
        return res.status(500).json({ error: error.message });
    }
};
exports.biometricPunch = biometricPunch;
const cronService_1 = require("../services/cronService");
const triggerScheduledPushesEndpoint = async (req, res) => {
    try {
        const result = await (0, cronService_1.triggerScheduledPushes)();
        return res.json(result);
    }
    catch (error) {
        console.error('Cron trigger error:', error);
        return res.status(500).json({ error: error.message });
    }
};
exports.triggerScheduledPushesEndpoint = triggerScheduledPushesEndpoint;
