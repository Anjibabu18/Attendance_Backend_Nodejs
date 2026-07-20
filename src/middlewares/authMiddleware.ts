import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: {
    username: string;
    role: string;
  };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);
    
    // Check if it's an access token (refresh tokens have type='refresh')
    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Cannot use refresh token for access' });
    }

    req.user = {
      username: decoded.sub as string,
      role: decoded.role,
    };
    next();
  } catch (error: any) {
    console.error('[authMiddleware] verifyToken failed:', error?.message || error);
    return res.status(401).json({ error: 'Invalid or expired token', detail: error?.message });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    
    next();
  };
};
