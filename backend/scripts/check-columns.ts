import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check ALL columns in companies table
  const cols = await prisma.$queryRaw<Array<{column_name: string; data_type: string; is_nullable: string}>>`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'companies'
    ORDER BY column_name
  `;
  console.log('All companies columns:');
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} nullable=${c.is_nullable}`));

  // Check sample data
  const sample = await prisma.$queryRaw`SELECT id, name_th, name_en, address_th FROM companies LIMIT 5`;
  console.log('\nSample:', JSON.stringify(sample, null, 2));
}

main().finally(() => prisma.$disconnect());