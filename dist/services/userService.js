"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.updateLastLogin = exports.findByUsername = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const findByUsername = async (username) => {
    return prisma_1.default.appUser.findUnique({
        where: { username },
    });
};
exports.findByUsername = findByUsername;
const updateLastLogin = async (userId, ip, userAgent) => {
    return prisma_1.default.appUser.update({
        where: { id: userId },
        data: {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            lastUserAgent: userAgent ? userAgent.substring(0, 255) : null,
        },
    });
};
exports.updateLastLogin = updateLastLogin;
const verifyPassword = async (password, hash) => {
    return bcryptjs_1.default.compare(password, hash);
};
exports.verifyPassword = verifyPassword;
