"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugAdmin = exports.me = exports.refresh = exports.login = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const zod_1 = require("zod");
const userService_1 = require("../services/userService");
const jwt_1 = require("../utils/jwt");
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
const getClientAddress = (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor && typeof forwardedFor === 'string') {
        return forwardedFor.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
};
const login = async (req, res) => {
    try {
        const { username, password } = loginSchema.parse(req.body);
        const remoteAddress = getClientAddress(req);
        // TODO: loginAttemptService.assertAllowed(username, remoteAddress)
        const user = await (0, userService_1.findByUsername)(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid login' });
        }
        const isPasswordValid = await (0, userService_1.verifyPassword)(password, user.passwordHash);
        if (!isPasswordValid) {
            // TODO: loginAttemptService.recordFailure(...)
            return res.status(401).json({ error: 'Invalid login' });
        }
        if (!user.enabled) {
            return res.status(401).json({ error: 'User is disabled' });
        }
        // Record success
        const userAgent = req.headers['user-agent'];
        (0, userService_1.updateLastLogin)(user.id, remoteAddress, userAgent).catch((error) => console.error('Last login update failed:', error));
        // Generate tokens
        const accessToken = (0, jwt_1.createAccessToken)(user.username, user.role);
        const refreshToken = (0, jwt_1.createRefreshToken)(user.username, user.role);
        // If employee, fetch employee details
        if (user.role === 'ROLE_EMPLOYEE') {
            const employee = await prisma_1.default.employee.findUnique({
                where: { userId: user.id },
            });
            if (!employee) {
                return res.status(409).json({ error: 'Employee profile missing' });
            }
            return res.json({
                token: accessToken,
                refreshToken,
                role: user.role,
                employeeId: employee.id,
                name: employee.name,
            });
        }
        return res.json({
            token: accessToken,
            refreshToken,
            role: user.role,
            employeeId: null,
            name: user.username,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Login failed', detail: error?.message || 'Internal server error' });
    }
};
exports.login = login;
const refresh = async (req, res) => {
    try {
        const { refreshToken } = refreshSchema.parse(req.body);
        const decoded = (0, jwt_1.verifyToken)(refreshToken);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid refresh token type' });
        }
        const username = decoded.sub;
        const role = decoded.role;
        const user = await (0, userService_1.findByUsername)(username);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'User not found or disabled' });
        }
        const newAccessToken = (0, jwt_1.createAccessToken)(username, role);
        const newRefreshToken = (0, jwt_1.createRefreshToken)(username, role);
        return res.json({
            token: newAccessToken,
            refreshToken: newRefreshToken,
        });
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
};
exports.refresh = refresh;
const me = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({
        username: req.user.username,
        role: req.user.role,
    });
};
exports.me = me;
const debugAdmin = async (req, res) => {
    try {
        const adminCount = await prisma_1.default.appUser.count({ where: { role: 'ROLE_ADMIN' } });
        const admin = await prisma_1.default.appUser.findFirst({ where: { role: 'ROLE_ADMIN' }, select: { id: true, username: true, role: true, enabled: true } });
        return res.json({ ok: true, adminCount, admin });
    }
    catch (error) {
        console.error('Debug admin error:', error);
        return res.status(500).json({ ok: false, error: error?.message || 'Debug failed' });
    }
};
exports.debugAdmin = debugAdmin;
