import prisma from '../config/database';
import { logger } from '../config/logger';
import { withSystemRlsContext } from '../config/rls';
import {
  encryptGoogleRefreshToken,
  isGoogleRefreshTokenEncrypted,
} from './googleDriveTokenService';

/**
 * Existing Drive connections predate token encryption. Upgrade those rows at
 * startup so the database converges without forcing users to reconnect Drive.
 */
export async function migrateLegacyGoogleRefreshTokens() {
  const users = await withSystemRlsContext(prisma, (tx) => tx.user.findMany({
    where: { googleRefreshToken: { not: null } },
    select: { id: true, googleRefreshToken: true },
  }), { role: 'drive-token-migration' });

  const legacyUsers = users.filter((user) =>
    user.googleRefreshToken && !isGoogleRefreshTokenEncrypted(user.googleRefreshToken));

  if (!legacyUsers.length) return 0;

  await withSystemRlsContext(prisma, async (tx) => {
    await Promise.all(legacyUsers.map((user) => tx.user.update({
      where: { id: user.id },
      data: { googleRefreshToken: encryptGoogleRefreshToken(user.googleRefreshToken) },
    })));
  }, { role: 'drive-token-migration' });

  logger.info('Encrypted legacy Google Drive refresh tokens', { count: legacyUsers.length });
  return legacyUsers.length;
}
