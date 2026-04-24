import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { auditLog } from '../services/auditService';

export const authRouter = Router();

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const googleLoginSchema = z.object({
  credential: z.string().min(1),
});

function issueToken(user: { id: string; companyId: string; role: string; email: string }) {
  return jwt.sign(
    { userId: user.id, companyId: user.companyId, role: user.role, email: user.email },
    process.env.JWT_SECRET!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
  );
}

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string;
  passwordHash?: string | null;
  googleSub?: string | null;
  company: {
    nameTh: string;
    nameEn: string | null;
    taxId: string;
  };
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    auth: {
      hasPassword: !!user.passwordHash,
      hasGoogle: true,
    },
    company: {
      nameTh: user.company.nameTh,
      nameEn: user.company.nameEn,
      taxId: user.company.taxId,
    },
  };
}

authRouter.get('/google/config', (_req, res) => {
  res.json({
    enabled: !!googleClientId,
    clientId: googleClientId ?? null,
  });
});

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: true },
    }), { role: 'auth' });

    if (!user || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }

    const updatedUser = await withSystemRlsContext(prisma, (tx) => tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      include: { company: true },
    }), {
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
    });

    const token = issueToken(updatedUser);

    await auditLog({
      companyId: updatedUser.companyId,
      userId: updatedUser.id,
      role: updatedUser.role,
      systemMode: true,
      action: 'user.login',
      resourceType: 'user',
      resourceId: updatedUser.id,
      details: { method: 'password' },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: req.headers['accept-language']?.startsWith('th') ? 'th' : 'en',
    });

    res.json({
      token,
      user: serializeUser(updatedUser),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/google', async (req, res) => {
  try {
    if (!googleClient || !googleClientId) {
      res.status(503).json({ error: 'Google Sign-In is not configured' });
      return;
    }

    const { credential } = googleLoginSchema.parse(req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      res.status(401).json({ error: 'Invalid Google account' });
      return;
    }

    const email = payload.email.toLowerCase();
    const user = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
      where: { email },
      include: { company: true },
    }), { role: 'auth' });

    if (!user) {
      res.status(403).json({ error: 'This Google account is not authorized for the system' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }

    if (user.googleSub && user.googleSub !== payload.sub) {
      res.status(403).json({ error: 'This Google account does not match the registered account' });
      return;
    }

    const updatedUser = await withSystemRlsContext(prisma, (tx) => tx.user.update({
      where: { id: user.id },
      data: {
        googleSub: payload.sub,
        name: payload.name?.trim() || user.name,
        lastLoginAt: new Date(),
      },
      include: { company: true },
    }), {
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
    });

    const token = issueToken(updatedUser);

    await auditLog({
      companyId: updatedUser.companyId,
      userId: updatedUser.id,
      role: updatedUser.role,
      systemMode: true,
      action: 'user.login',
      resourceType: 'user',
      resourceId: updatedUser.id,
      details: { method: 'google', email },
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: req.headers['accept-language']?.startsWith('th') ? 'th' : 'en',
    });

    res.json({
      token,
      user: serializeUser(updatedUser),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }

    if (err instanceof Error) {
      res.status(401).json({ error: err.message || 'Google authentication failed' });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/logout', async (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

authRouter.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'No token' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
      where: { id: payload.userId },
      include: { company: true },
    }), { userId: payload.userId, role: 'auth' });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }

    res.json(serializeUser(user));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});
