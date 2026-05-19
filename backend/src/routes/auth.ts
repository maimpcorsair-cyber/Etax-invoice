import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { auditLog } from '../services/auditService';
import {
  acceptProjectLineMemberInvite,
  ProjectLineInviteError,
} from '../services/projectLineInviteService';
import { getLineUserProfile } from '../services/lineService';
import { CURRENT_LEGAL_VERSION } from '../config/legalVersion';
import { logger } from '../config/logger';
import { loginRateLimit } from '../middleware/rateLimit';

export const authRouter = Router();

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const googleLoginSchema = z.object({
  credential: z.string().min(1),
  projectInviteToken: z.string().min(1).optional(),
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
  legalAcceptedVersion?: string | null;
  company: {
    nameTh: string;
    nameEn: string | null;
    taxId: string;
  };
  lineUserLink?: {
    lineUserId?: string;
    isActive: boolean;
    displayName: string | null;
    pictureUrl: string | null;
  } | null;
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
    // PDPA — frontend blocks the app behind a re-consent modal when the
    // legal bundle has been bumped past the version this user accepted.
    legal: {
      acceptedVersion: user.legalAcceptedVersion ?? null,
      currentVersion: CURRENT_LEGAL_VERSION,
      reConsentRequired: !user.legalAcceptedVersion || user.legalAcceptedVersion !== CURRENT_LEGAL_VERSION,
    },
    line: user.lineUserLink
      ? {
          linked: user.lineUserLink.isActive,
          displayName: user.lineUserLink.displayName,
          pictureUrl: user.lineUserLink.pictureUrl,
        }
      : {
          linked: false,
          displayName: null,
          pictureUrl: null,
        },
  };
}

async function refreshMissingLineProfile<T extends {
  id: string;
  companyId: string;
  role: string;
  lineUserLink?: {
    lineUserId: string;
    isActive: boolean;
    displayName: string | null;
    pictureUrl: string | null;
  } | null;
}>(user: T): Promise<T> {
  const link = user.lineUserLink;
  if (!link?.isActive || link.pictureUrl) {
    return user;
  }

  try {
    const profile = await getLineUserProfile(link.lineUserId);
    if (!profile?.displayName && !profile?.pictureUrl) {
      return user;
    }

    const updatedLink = await withSystemRlsContext(prisma, (tx) => tx.lineUserLink.update({
      where: { userId: user.id },
      data: {
        displayName: profile.displayName ?? link.displayName,
        pictureUrl: profile.pictureUrl ?? link.pictureUrl,
      },
    }), {
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
    });

    return {
      ...user,
      lineUserLink: updatedLink,
    };
  } catch (err) {
    logger.warn('[Auth] Unable to refresh LINE profile picture', {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return user;
  }
}

authRouter.get('/google/config', (_req, res) => {
  res.json({
    enabled: !!googleClientId,
    clientId: googleClientId ?? null,
  });
});

authRouter.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: true, lineUserLink: true },
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
      include: { company: true, lineUserLink: true },
    }), {
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
    });

    const userWithLineProfile = await refreshMissingLineProfile(updatedUser);
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
      user: serializeUser(userWithLineProfile),
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

    const { credential, projectInviteToken } = googleLoginSchema.parse(req.body);
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

    if (projectInviteToken) {
      const joined = await acceptProjectLineMemberInvite({
        inviteToken: projectInviteToken,
        googleProfile: {
          email,
          googleSub: payload.sub,
          name: payload.name,
        },
        ipAddress: req.ip ?? '',
        userAgent: req.get('user-agent') ?? '',
        language: req.headers['accept-language']?.startsWith('th') ? 'th' : 'en',
      });

      const token = issueToken(joined.user);
      res.json({
        token,
        user: serializeUser(joined.user),
        projectInvite: {
          projectId: joined.project.id,
          projectCode: joined.project.code,
          projectName: joined.project.name,
          lineGroupName: joined.lineGroup.groupName,
        },
      });
      return;
    }

    const user = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
      where: { email },
      include: { company: true, lineUserLink: true },
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
      include: { company: true, lineUserLink: true },
    }), {
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
    });

    const userWithLineProfile = await refreshMissingLineProfile(updatedUser);
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
      user: serializeUser(userWithLineProfile),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }

    if (err instanceof ProjectLineInviteError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    if (err instanceof Error) {
      if (err.message.includes('Wrong recipient') || err.message.includes('payload audience')) {
        logger.warn('[Auth] Google Sign-In audience mismatch', { message: err.message });
        res.status(401).json({
          error: 'Google Sign-In configuration mismatch. Please refresh the page and try again, or ask the admin to check GOOGLE_CLIENT_ID.',
        });
        return;
      }

      res.status(401).json({ error: 'Google authentication failed' });
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
      include: { company: true, lineUserLink: true },
    }), { userId: payload.userId, role: 'auth' });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }

    const userWithLineProfile = await refreshMissingLineProfile(user);

    res.json(serializeUser(userWithLineProfile));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});
