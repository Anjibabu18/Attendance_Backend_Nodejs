"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAuthentication = exports.generateAuthentication = exports.verifyRegistration = exports.generateRegistration = void 0;
const server_1 = require("@simplewebauthn/server");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma = new client_1.PrismaClient();
const PRODUCTION_FRONTEND_URL = 'https://attendance-two-smoky.vercel.app';
const normalizeOrigin = (value) => {
    if (!value)
        return null;
    try {
        return new URL(value).origin;
    }
    catch {
        return null;
    }
};
const deriveRpId = () => {
    if (process.env.WEBAUTHN_RP_ID)
        return process.env.WEBAUTHN_RP_ID;
    const origin = normalizeOrigin(process.env.WEBAUTHN_ORIGIN || process.env.FRONTEND_URL || PRODUCTION_FRONTEND_URL);
    return origin ? new URL(origin).hostname : 'localhost';
};
const RP_ID = deriveRpId();
const ORIGIN = normalizeOrigin(process.env.WEBAUTHN_ORIGIN || process.env.FRONTEND_URL || PRODUCTION_FRONTEND_URL) || 'http://localhost:5173';
const ALLOWED_ORIGINS = Array.from(new Set([
    ORIGIN,
    normalizeOrigin(process.env.FRONTEND_URL),
    normalizeOrigin(PRODUCTION_FRONTEND_URL),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
].filter(Boolean)));
// In-memory challenge store (use Redis in production)
const userChallenges = {};
const generateRegistration = async (req, res) => {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const userCredentials = await prisma.webAuthnCredential.findMany({
            where: { userId: user.id },
        });
        const options = await (0, server_1.generateRegistrationOptions)({
            rpName: 'WorkTrack Attendance',
            rpID: RP_ID,
            userName: user.username,
            attestationType: 'none',
            excludeCredentials: userCredentials.map((cred) => ({
                id: cred.id,
                transports: cred.transports ? cred.transports.split(',') : undefined,
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
        });
        userChallenges[user.id] = options.challenge;
        res.json(options);
    }
    catch (error) {
        console.error('Registration generation error', error);
        res.status(500).json({ error: error.message });
    }
};
exports.generateRegistration = generateRegistration;
const verifyRegistration = async (req, res) => {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const expectedChallenge = userChallenges[user.id];
        if (!expectedChallenge)
            return res.status(400).json({ error: 'No active registration challenge' });
        const body = req.body;
        let verification;
        try {
            verification = await (0, server_1.verifyRegistrationResponse)({
                response: body,
                expectedChallenge,
                expectedOrigin: ALLOWED_ORIGINS,
                expectedRPID: RP_ID,
            });
        }
        catch (error) {
            console.error('Registration verification failed:', error);
            return res.status(400).json({ error: error.message });
        }
        const { verified, registrationInfo } = verification;
        if (verified && registrationInfo) {
            // v13 API: registrationInfo.credential contains id, publicKey, counter
            const { credential } = registrationInfo;
            const credentialID = credential.id; // base64url string in v13
            const credentialPublicKey = credential.publicKey; // Uint8Array
            const counter = credential.counter;
            await prisma.webAuthnCredential.create({
                data: {
                    id: credentialID,
                    publicKey: Buffer.from(credentialPublicKey),
                    counter,
                    userId: user.id,
                    transports: body.response?.transports ? body.response.transports.join(',') : null,
                },
            });
            delete userChallenges[user.id];
            res.json({ verified: true });
        }
        else {
            res.status(400).json({ error: 'Verification failed' });
        }
    }
    catch (error) {
        console.error('Registration verification error', error);
        res.status(500).json({ error: error.message });
    }
};
exports.verifyRegistration = verifyRegistration;
const generateAuthentication = async (req, res) => {
    try {
        const { username } = req.query;
        if (!username)
            return res.status(400).json({ error: 'Username required' });
        const user = await prisma.appUser.findUnique({
            where: { username: String(username) },
            include: { webAuthnCredentials: true },
        });
        if (!user || user.webAuthnCredentials.length === 0) {
            return res.status(400).json({ error: 'User does not exist or has no biometric credentials registered' });
        }
        const options = await (0, server_1.generateAuthenticationOptions)({
            rpID: RP_ID,
            allowCredentials: user.webAuthnCredentials.map((cred) => ({
                id: cred.id,
                transports: cred.transports ? cred.transports.split(',') : undefined,
            })),
            userVerification: 'preferred',
        });
        userChallenges[user.id] = options.challenge;
        res.json(options);
    }
    catch (error) {
        console.error('Auth generation error', error);
        res.status(500).json({ error: error.message });
    }
};
exports.generateAuthentication = generateAuthentication;
const verifyAuthentication = async (req, res) => {
    try {
        const { username, response } = req.body;
        if (!username || !response)
            return res.status(400).json({ error: 'Username and response required' });
        const user = await prisma.appUser.findUnique({
            where: { username: String(username) },
            include: { webAuthnCredentials: true, employee: true },
        });
        if (!user)
            return res.status(400).json({ error: 'User not found' });
        const expectedChallenge = userChallenges[user.id];
        if (!expectedChallenge)
            return res.status(400).json({ error: 'No active authentication challenge. Please try again.' });
        const authenticator = user.webAuthnCredentials.find((c) => c.id === response.id);
        if (!authenticator)
            return res.status(400).json({ error: 'Credential not found on this account' });
        let verification;
        try {
            // v13 API: credential is passed directly as an object
            verification = await (0, server_1.verifyAuthenticationResponse)({
                response,
                expectedChallenge,
                expectedOrigin: ALLOWED_ORIGINS,
                expectedRPID: RP_ID,
                credential: {
                    id: authenticator.id,
                    publicKey: new Uint8Array(authenticator.publicKey),
                    counter: authenticator.counter,
                    transports: authenticator.transports ? authenticator.transports.split(',') : undefined,
                },
            });
        }
        catch (error) {
            console.error('Auth verification error:', error);
            return res.status(400).json({ error: error.message });
        }
        const { verified, authenticationInfo } = verification;
        if (verified && authenticationInfo) {
            await prisma.webAuthnCredential.update({
                where: { id: authenticator.id },
                data: { counter: authenticationInfo.newCounter },
            });
            delete userChallenges[user.id];
            const secret = process.env.JWT_SECRET || 'fallback_secret';
            const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, role: user.role, sub: user.username }, secret, { expiresIn: '24h' });
            res.json({
                token,
                role: user.role,
                employeeId: user.employee?.id || null,
                name: user.employee?.name || null,
            });
        }
        else {
            res.status(400).json({ error: 'Biometric verification failed' });
        }
    }
    catch (error) {
        console.error('Auth verification error', error);
        res.status(500).json({ error: error.message });
    }
};
exports.verifyAuthentication = verifyAuthentication;
