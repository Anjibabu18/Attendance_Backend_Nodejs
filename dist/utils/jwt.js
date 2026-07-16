"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.createRefreshToken = exports.createAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const getSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret.startsWith('change-me')) {
        throw new Error('JWT_SECRET must be configured with at least 32 characters and must not use the default value');
    }
    return secret;
};
const getIssuer = () => {
    return process.env.JWT_ISSUER || 'attendance-app';
};
const createAccessToken = (username, role) => {
    return jsonwebtoken_1.default.sign({ role }, getSecret(), {
        subject: username,
        issuer: getIssuer(),
        expiresIn: '15m',
    });
};
exports.createAccessToken = createAccessToken;
const createRefreshToken = (username, role) => {
    return jsonwebtoken_1.default.sign({ role, type: 'refresh' }, getSecret(), {
        subject: username,
        issuer: getIssuer(),
        expiresIn: '30d',
    });
};
exports.createRefreshToken = createRefreshToken;
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, getSecret(), {
        issuer: getIssuer(),
    });
};
exports.verifyToken = verifyToken;
