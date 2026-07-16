import jwt from 'jsonwebtoken';

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

export const createAccessToken = (username: string, role: string) => {
  return jwt.sign(
    { role },
    getSecret(),
    {
      subject: username,
      issuer: getIssuer(),
      expiresIn: '15m',
    }
  );
};

export const createRefreshToken = (username: string, role: string) => {
  return jwt.sign(
    { role, type: 'refresh' },
    getSecret(),
    {
      subject: username,
      issuer: getIssuer(),
      expiresIn: '30d',
    }
  );
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, getSecret(), {
    issuer: getIssuer(),
  }) as jwt.JwtPayload;
};
