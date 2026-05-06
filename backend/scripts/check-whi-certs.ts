import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Delete the corrupt NaN cert
  await prisma.$queryRawUnsafe(`DELETE FROM wht_certificates WHERE "certificateNumber" LIKE '%NaN%'`);
  console.log('Deleted NaN certs');
  // Reset sequence so nextval starts fresh
  await prisma.$queryRawUnsafe(`DROP SEQUENCE IF EXISTS wht_seq_0105545123456_202605`);
  console.log('Dropped sequence');
  await prisma.$queryRawUnsafe(`CREATE SEQUENCE wht_seq_0105545123456_202605`);
  console.log('Recreated sequence');
  // Verify
  const certs = await prisma.$queryRawUnsafe(`SELECT id, "certificateNumber" FROM wht_certificates ORDER BY "certificateNumber"`);
  console.log('Remaining certs:', JSON.stringify(certs, null, 2));
  const seqs = await prisma.$queryRawUnsafe(`SELECT last_value::text FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'wht_seq_0105545123456_202605'`);
  console.log('Sequence state:', JSON.stringify(seqs, null, 2));
}
main().then(() => { prisma.$disconnect(); process.exit(0); }).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
