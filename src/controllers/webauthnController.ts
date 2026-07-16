import { Request, Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { PrismaClient } from '@prisma/client';
import { createAccessToken, createRefreshToken } from '../utils/jwt';

const prisma = new PrismaClient();

const PRODUCTION_FRONTEND_URL = 'https://attendance-two-smoky.vercel.app';

const normalizeOrigin = (value?: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const deriveRpId = () => {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
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
].filter(Boolean) as string[]));

// In-memory challenge store (use Redis in production)
const userChallenges: Record<number, string> = {};

export const generateRegistration = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const userCredentials = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
    });

    const options = await generateRegistrationOptions({
      rpName: 'WorkTrack Attendance',
      rpID: RP_ID,
      userName: user.username,
      attestationType: 'none',
      excludeCredentials: userCredentials.map((cred: any) => ({
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
  } catch (error: any) {
    console.error('Registration generation error', error);
    res.status(500).json({ error: error.message });
  }
};

export const verifyRegistration = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const expectedChallenge = userChallenges[user.id];
    if (!expectedChallenge) return res.status(400).json({ error: 'No active registration challenge' });

    const body = req.body;
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: ALLOWED_ORIGINS,
        expectedRPID: RP_ID,
      });
    } catch (error: any) {
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
    } else {
      res.status(400).json({ error: 'Verification failed' });
    }
  } catch (error: any) {
    console.error('Registration verification error', error);
    res.status(500).json({ error: error.message });
  }
};

export const generateAuthentication = async (req: Request, res: Response) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const user = await prisma.appUser.findUnique({
      where: { username: String(username) },
      include: { webAuthnCredentials: true },
    });

    if (!user || user.webAuthnCredentials.length === 0) {
      return res.status(400).json({ error: 'User does not exist or has no biometric credentials registered' });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: user.webAuthnCredentials.map((cred: any) => ({
        id: cred.id,
        transports: cred.transports ? cred.transports.split(',') : undefined,
      })),
      userVerification: 'preferred',
    });

    userChallenges[user.id] = options.challenge;
    res.json(options);
  } catch (error: any) {
    console.error('Auth generation error', error);
    res.status(500).json({ error: error.message });
  }
};

export const verifyAuthentication = async (req: Request, res: Response) => {
  try {
    const { username, response } = req.body;
    if (!username || !response) return res.status(400).json({ error: 'Username and response required' });

    const user = await prisma.appUser.findUnique({
      where: { username: String(username) },
      include: { webAuthnCredentials: true, employee: true },
    });

    if (!user) return res.status(400).json({ error: 'User not found' });

    const expectedChallenge = userChallenges[user.id];
    if (!expectedChallenge) return res.status(400).json({ error: 'No active authentication challenge. Please try again.' });

    const authenticator: any = user.webAuthnCredentials.find((c: any) => c.id === response.id);
    if (!authenticator) return res.status(400).json({ error: 'Credential not found on this account' });

    let verification;
    try {
      // v13 API: credential is passed directly as an object
      verification = await verifyAuthenticationResponse({
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
    } catch (error: any) {
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

      const token = createAccessToken(user.username, user.role);
      const refreshToken = createRefreshToken(user.username, user.role);

      res.json({
        token,
        refreshToken,
        role: user.role,
        employeeId: user.employee?.id || null,
        name: user.employee?.name || user.username,
      });
    } else {
      res.status(400).json({ error: 'Biometric verification failed' });
    }
  } catch (error: any) {
    console.error('Auth verification error', error);
    res.status(500).json({ error: error.message });
  }
};
