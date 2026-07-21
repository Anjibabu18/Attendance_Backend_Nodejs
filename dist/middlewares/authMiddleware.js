"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = void 0;
const jwt_1 = require("../utils/jwt");
const requireAuth = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    else if (req.query.token && typeof req.query.token === 'string') {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({ error: 'Missing or invalid authorization header or token query param' });
    }
    try {
        const decoded = (0, jwt_1.verifyToken)(token);
        // Check if it's an access token (refresh tokens have type='refresh')
        if (decoded.type === 'refresh') {
            return res.status(401).json({ error: 'Cannot use refresh token for access' });
        }
        req.user = {
            username: decoded.sub,
            role: decoded.role,
        };
        next();
    }
    catch (error) {
        console.error('[authMiddleware] verifyToken failed:', error?.message || error);
        return res.status(401).json({ error: 'Invalid or expired token', detail: error?.message });
    }
};
exports.requireAuth = requireAuth;
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
};
exports.requireRole = requireRole;
