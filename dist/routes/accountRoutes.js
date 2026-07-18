"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../prisma"));
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const userService_1 = require("../services/userService");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.requireAuth);
router.post('/password', async (req, res) => {
    try {
        const username = req.user.username;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ error: 'Current password and a new password of at least 6 characters are required' });
        }
        const user = await prisma_1.default.appUser.findUnique({ where: { username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const ok = await (0, userService_1.verifyPassword)(currentPassword, user.passwordHash);
        if (!ok)
            return res.status(400).json({ error: 'Current password is incorrect' });
        await prisma_1.default.appUser.update({
            where: { id: user.id },
            data: { passwordHash: await bcryptjs_1.default.hash(newPassword, 10) },
        });
        res.json({ ok: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/devices/current', async (req, res) => {
    const deviceId = String(req.query.deviceId || '');
    if (!deviceId)
        return res.json({ deviceId, approved: false, registered: false });
    const user = await prisma_1.default.appUser.findUnique({ where: { username: req.user.username }, include: { employee: true } });
    if (!user || !user.employee)
        return res.json({ deviceId, approved: false, registered: false });
    if (user.employee.deviceFingerprint === deviceId) {
        return res.json({ deviceId, approved: true, registered: true });
    }
    const reqObj = await prisma_1.default.deviceRequest.findFirst({ where: { employeeId: user.employee.id, deviceId } });
    res.json({ deviceId, approved: reqObj?.approved || false, registered: !!reqObj });
});
router.get('/devices/all', async (req, res) => {
    const user = await prisma_1.default.appUser.findUnique({ where: { username: req.user.username }, include: { employee: true } });
    if (!user || !user.employee)
        return res.json([]);
    const devices = await prisma_1.default.deviceRequest.findMany({ where: { employeeId: user.employee.id } });
    // Include legacy device if it exists and isn't already in the table
    if (user.employee.deviceFingerprint && !devices.some(d => d.deviceId === user.employee.deviceFingerprint)) {
        devices.unshift({
            id: -1, // special ID for legacy device
            employeeId: user.employee.id,
            deviceId: user.employee.deviceFingerprint,
            label: 'Legacy Device',
            approved: true,
            createdAt: new Date()
        });
    }
    res.json(devices);
});
router.post('/devices/register', async (req, res) => {
    try {
        const { deviceId, label } = req.body;
        if (!deviceId)
            throw new Error('Device ID is required');
        const user = await prisma_1.default.appUser.findUnique({ where: { username: req.user.username }, include: { employee: true } });
        if (!user || !user.employee)
            throw new Error('Employee not found');
        const existing = await prisma_1.default.deviceRequest.findFirst({ where: { employeeId: user.employee.id, deviceId } });
        if (existing)
            return res.json({ ok: true, message: 'Already pending or approved' });
        // Check device limit
        const deviceCount = await prisma_1.default.deviceRequest.count({ where: { employeeId: user.employee.id } });
        if (deviceCount >= 3) {
            throw new Error('You have reached the maximum limit of 3 registered devices. Please remove an old device first.');
        }
        await prisma_1.default.deviceRequest.create({
            data: {
                employeeId: user.employee.id,
                deviceId,
                label: label || 'Mobile Device'
            }
        });
        res.json({ ok: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/devices/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const user = await prisma_1.default.appUser.findUnique({ where: { username: req.user.username }, include: { employee: true } });
        if (!user || !user.employee)
            throw new Error('Employee not found');
        if (id === -1) {
            await prisma_1.default.employee.update({
                where: { id: user.employee.id },
                data: { deviceFingerprint: null }
            });
            return res.json({ ok: true });
        }
        const dr = await prisma_1.default.deviceRequest.findUnique({ where: { id } });
        if (!dr || dr.employeeId !== user.employee.id)
            throw new Error('Device not found or not owned by you');
        await prisma_1.default.deviceRequest.delete({ where: { id } });
        res.json({ ok: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
exports.default = router;
