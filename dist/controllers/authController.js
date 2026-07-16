"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.me = exports.refresh = exports.login = void 0;
const zod_1 = require("zod");
const userService_1 = require("../services/userService");
const jwt_1 = require("../utils/jwt");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
        await (0, userService_1.updateLastLogin)(user.id, remoteAddress, userAgent);
        // Generate tokens
        const accessToken = (0, jwt_1.createAccessToken)(user.username, user.role);
        const refreshToken = (0, jwt_1.createRefreshToken)(user.username, user.role);
        // If employee, fetch employee details
        if (user.role === 'ROLE_EMPLOYEE') {
            const employee = await prisma.employee.findUnique({
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
        return res.status(500).json({ error: 'Internal server error' });
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
