"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const userService_1 = require("../services/userService");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(authMiddleware_1.requireAuth);
router.post('/password', async (req, res) => {
    try {
        const username = req.user.username;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ error: 'Current password and a new password of at least 6 characters are required' });
        }
        const user = await prisma.appUser.findUnique({ where: { username } });
        if (!user)
            return res.status(401).json({ error: 'User not found' });
        const ok = await (0, userService_1.verifyPassword)(currentPassword, user.passwordHash);
        if (!ok)
            return res.status(400).json({ error: 'Current password is incorrect' });
        await prisma.appUser.update({
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
    res.json({ deviceId: String(req.query.deviceId || ''), approved: true, registered: true });
});
exports.default = router;
