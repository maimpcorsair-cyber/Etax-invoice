import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  companyId: string;
  role: string;
  email: string;
}

const roleRank: Record<string, number> = {
  viewer: 0,
  accountant: 1,
  admin: 2,
  super_admin: 3,
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;
    if (!userRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const userRank = roleRank[userRole] ?? -1;
    const allowed = roles.some((role) => userRole === role || userRank >= (roleRank[role] ?? Number.MAX_SAFE_INTEGER));

    if (!allowed) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
