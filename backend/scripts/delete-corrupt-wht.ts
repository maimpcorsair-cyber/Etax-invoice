import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Try to find the 0NaN cert
  const certs = await prisma.$queryRawUnsafe<{id: string; certificateNumber: string}[]>(
    "SELECT id, \"certificateNumber\" FROM \"wht_certificates\" WHERE \"certificateNumber\" = 'WHT-0105545123456-202605-0NaN'"
  );
  console.log('Found:', certs.length);
  if (certs.length > 0) {
    console.log('ID:', certs[0].id);
    // Delete by id
    await prisma.$queryRawUnsafe(
      `DELETE FROM "wht_certificates" WHERE id = '${certs[0].id}'`
    );
    console.log('Deleted');
  }
  
  // Verify
  const remaining = await prisma.$queryRawUnsafe<{certificateNumber: string}[]>(
    'SELECT "certificateNumber" FROM "wht_certificates" ORDER BY "certificateNumber"'
  );
  console.log('Remaining:', remaining.map(c => c.certificateNumber).join(', '));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });