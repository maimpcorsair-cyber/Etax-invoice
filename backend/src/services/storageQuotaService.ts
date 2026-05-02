import { prisma } from '../config/database';

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  usedPercent: number;
  documentCount: number;
}

export async function getStorageUsage(companyId: string): Promise<StorageUsage> {
  const [company, documentCount] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { storageUsedBytes: true, storageQuotaBytes: true } }),
    prisma.documentIntake.count({ where: { companyId, fileBase64: { not: null } } }),
  ]);
  const used = Number(company.storageUsedBytes);
  const quota = Number(company.storageQuotaBytes);
  return { usedBytes: used, quotaBytes: quota, usedPercent: quota > 0 ? Math.round((used / quota) * 100) : 0, documentCount };
}

export async function checkStorageQuota(companyId: string, fileSizeBytes: number): Promise<{ allowed: boolean; used: number; quota: number }> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { storageUsedBytes: true, storageQuotaBytes: true } });
  const used = Number(company.storageUsedBytes);
  const quota = Number(company.storageQuotaBytes);
  return { allowed: used + fileSizeBytes <= quota, used, quota };
}

export async function incrementStorageUsed(companyId: string, bytes: number): Promise<void> {
  await prisma.company.update({ where: { id: companyId }, data: { storageUsedBytes: { increment: bytes } } });
}

export async function decrementStorageUsed(companyId: string, bytes: number): Promise<void> {
  await prisma.company.update({ where: { id: companyId }, data: { storageUsedBytes: { decrement: bytes } } });
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
