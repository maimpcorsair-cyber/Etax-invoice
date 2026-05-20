import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { auditLog } from './auditService';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from './accessPolicyService';

const PROJECT_LINE_INVITE_TTL = process.env.PROJECT_LINE_INVITE_TTL ?? '30d';

export type ProjectLineMemberInviteToken = {
  type: 'project_line_member_invite';
  companyId: string;
  projectId: string;
  lineGroupLinkId: string;
  lineProjectMemberId: string;
  lineUserId: string;
};

export type GoogleInviteProfile = {
  email: string;
  googleSub: string;
  name?: string | null;
};

export class ProjectLineInviteError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ProjectLineInviteError';
    this.statusCode = statusCode;
  }
}

function getFrontendBaseUrl() {
  const firstConfigured = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'https://etax-invoice.vercel.app')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  return (firstConfigured ?? 'https://etax-invoice.vercel.app').replace(/\/+$/, '');
}

export function signProjectLineMemberInvite(input: Omit<ProjectLineMemberInviteToken, 'type'>) {
  return jwt.sign(
    { type: 'project_line_member_invite', ...input },
    process.env.JWT_SECRET!,
    { expiresIn: PROJECT_LINE_INVITE_TTL as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyProjectLineMemberInvite(token: string) {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as ProjectLineMemberInviteToken;
  if (payload.type !== 'project_line_member_invite') {
    throw new ProjectLineInviteError('Invalid project invite token', 401);
  }
  return payload;
}

export function buildProjectLineMemberInviteUrl(input: Omit<ProjectLineMemberInviteToken, 'type'>) {
  return `${getFrontendBaseUrl()}/join/project/${signProjectLineMemberInvite(input)}`;
}

function fallbackName(email: string, displayName?: string | null, googleName?: string | null) {
  return googleName?.trim()
    || displayName?.trim()
    || email.split('@')[0].replace(/[._-]+/g, ' ').trim()
    || email;
}

function projectRoleFromLineRole(role: string) {
  if (role === 'project_owner') return 'owner';
  if (role === 'approver') return 'approver';
  if (role === 'viewer' || role === 'line_guest') return 'viewer';
  return 'member';
}

async function fetchInviteContext(token: string) {
  const payload = verifyProjectLineMemberInvite(token);
  const context = await withSystemRlsContext(prisma, (tx) => tx.lineProjectMember.findFirst({
    where: {
      id: payload.lineProjectMemberId,
      companyId: payload.companyId,
      projectId: payload.projectId,
      lineGroupLinkId: payload.lineGroupLinkId,
      lineUserId: payload.lineUserId,
      lineGroupLink: { isActive: true },
      project: { status: { not: 'archived' } },
    },
    include: {
      project: { select: { id: true, code: true, name: true, customerName: true } },
      lineGroupLink: { select: { id: true, groupName: true, pictureUrl: true, memberCount: true } },
      linkedUser: { select: { id: true, name: true, email: true, role: true } },
    },
  }), { role: 'project_line_invite' });

  if (!context) {
    throw new ProjectLineInviteError('Project invite is invalid or expired', 404);
  }

  return context;
}

export async function getProjectLineMemberInvitePreview(token: string) {
  const invite = await fetchInviteContext(token);
  const company = await withSystemRlsContext(prisma, (tx) => tx.company.findUnique({
    where: { id: invite.companyId },
    select: { id: true, nameTh: true, nameEn: true },
  }), { companyId: invite.companyId, role: 'project_line_invite' });

  return {
    company: company ? { id: company.id, name: company.nameTh || company.nameEn || 'Billboy workspace' } : null,
    project: invite.project,
    lineGroup: invite.lineGroupLink,
    member: {
      id: invite.id,
      displayName: invite.displayName,
      pictureUrl: invite.pictureUrl,
      role: invite.role,
      linkedUser: invite.linkedUser,
    },
  };
}

export async function acceptProjectLineMemberInvite(input: {
  inviteToken: string;
  googleProfile?: GoogleInviteProfile;
  existingUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  language?: 'th' | 'en';
}) {
  const invite = await fetchInviteContext(input.inviteToken);
  if (invite.linkedUserId && input.existingUserId && invite.linkedUserId !== input.existingUserId) {
    throw new ProjectLineInviteError('This LINE member is already linked to another user', 409);
  }

  let user = input.existingUserId
    ? await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
        where: { id: input.existingUserId },
        include: { company: true },
      }), { companyId: invite.companyId, userId: input.existingUserId, role: 'project_line_invite' })
    : null;

  if (user && user.companyId !== invite.companyId) {
    throw new ProjectLineInviteError('This invite belongs to another workspace', 403);
  }

  if (!user && input.googleProfile) {
    const email = input.googleProfile.email.toLowerCase();
    user = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({
      where: { email },
      include: { company: true },
    }), { companyId: invite.companyId, role: 'project_line_invite' });

    if (user && user.companyId !== invite.companyId) {
      throw new ProjectLineInviteError('This Google email is already used in another workspace', 403);
    }

    if (!user) {
      const policy = await resolveCompanyAccessPolicy(invite.companyId);
      if (!hasFeatureAccess(policy, 'invite_users')) {
        throw new ProjectLineInviteError('This plan cannot add more team members. Please ask the admin to upgrade or add the email manually.', 403);
      }
      const userLimit = getUsageLimit(policy, 'users');
      if (userLimit !== null && getUsageValue(policy, 'users') >= userLimit) {
        throw new ProjectLineInviteError(getLimitErrorMessage('users', policy), 403);
      }

      user = await withSystemRlsContext(prisma, (tx) => tx.user.create({
        data: {
          companyId: invite.companyId,
          email,
          name: fallbackName(email, invite.displayName, input.googleProfile?.name),
          googleSub: input.googleProfile?.googleSub,
          role: 'viewer',
        },
        include: { company: true },
      }), { companyId: invite.companyId, role: 'project_line_invite' });
    }
  }

  if (!user) {
    throw new ProjectLineInviteError('Please sign in with Google to join this project team', 401);
  }
  if (!user.isActive) {
    throw new ProjectLineInviteError('This user account is inactive', 403);
  }
  if (input.googleProfile && user.googleSub && user.googleSub !== input.googleProfile.googleSub) {
    throw new ProjectLineInviteError('This Google account does not match the registered account', 403);
  }

  const projectMemberRole = projectRoleFromLineRole(invite.role) as Prisma.ProjectMemberCreateInput['role'];
  const updatedUser = await withSystemRlsContext(prisma, async (tx) => {
    const existingLineLink = await tx.lineUserLink.findUnique({
      where: { lineUserId: invite.lineUserId },
      select: { userId: true },
    });
    if (existingLineLink && existingLineLink.userId !== user.id) {
      throw new ProjectLineInviteError('This LINE account is already linked to another user', 409);
    }

    const existingUserLine = await tx.lineUserLink.findUnique({
      where: { userId: user.id },
      select: { lineUserId: true },
    });
    if (existingUserLine && existingUserLine.lineUserId !== invite.lineUserId) {
      throw new ProjectLineInviteError('This user is already linked to another LINE account', 409);
    }

    const savedUser = await tx.user.update({
      where: { id: user.id },
      data: {
        googleSub: input.googleProfile?.googleSub ?? user.googleSub,
        name: input.googleProfile?.name?.trim() || user.name,
        lastLoginAt: new Date(),
      },
      include: { company: true },
    });

    await tx.lineUserLink.upsert({
      where: { lineUserId: invite.lineUserId },
      create: {
        userId: savedUser.id,
        lineUserId: invite.lineUserId,
        displayName: invite.displayName ?? savedUser.name,
        pictureUrl: invite.pictureUrl,
        isActive: true,
      },
      update: {
        userId: savedUser.id,
        displayName: invite.displayName ?? savedUser.name,
        pictureUrl: invite.pictureUrl,
        isActive: true,
        linkedAt: new Date(),
      },
    });

    await tx.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: invite.projectId,
          userId: savedUser.id,
        },
      },
      create: {
        projectId: invite.projectId,
        userId: savedUser.id,
        role: projectMemberRole,
      },
      update: {
        role: projectMemberRole,
      },
    });

    await tx.lineProjectMember.update({
      where: { id: invite.id },
      data: {
        linkedUserId: savedUser.id,
        role: invite.role === 'line_guest' ? 'linked_user' : invite.role,
        lastSeenAt: new Date(),
      },
    });

    return savedUser;
  }, {
    companyId: invite.companyId,
    userId: user.id,
    role: user.role,
  });

  await auditLog({
    companyId: invite.companyId,
    userId: updatedUser.id,
    role: updatedUser.role,
    systemMode: true,
    action: 'project.line_member_joined',
    resourceType: 'project',
    resourceId: invite.projectId,
    details: {
      projectId: invite.projectId,
      lineProjectMemberId: invite.id,
      lineGroupLinkId: invite.lineGroupLinkId,
      via: input.googleProfile ? 'google_invite' : 'authenticated_invite',
    },
    ipAddress: input.ipAddress ?? '',
    userAgent: input.userAgent ?? '',
    language: input.language ?? 'en',
  });

  return {
    user: updatedUser,
    project: invite.project,
    lineGroup: invite.lineGroupLink,
    member: {
      id: invite.id,
      displayName: invite.displayName,
      pictureUrl: invite.pictureUrl,
      role: invite.role === 'line_guest' ? 'linked_user' : invite.role,
    },
  };
}
