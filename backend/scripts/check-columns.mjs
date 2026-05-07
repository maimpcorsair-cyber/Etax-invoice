import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Check all Company columns to understand the mapping
  const r = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'companies' 
    AND column_name ~ '^(name|address).*$'
    ORDER BY column_name
  `);
  console.log('Company name/address columns:', JSON.stringify(r.rows, null, 2));

  // Check if there's any actual data
  const sample = await pool.query('SELECT id, name_th, nameTh, name_en, nameEn, address_th FROM companies LIMIT 5');
  console.log('Sample company data:', JSON.stringify(sample.rows, null, 2));

  // Check which indexes exist
  const idxs = await pool.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'companies' 
    AND indexname LIKE '%name%'
  `);
  console.log('Name-related indexes:', JSON.stringify(idxs.rows, null, 2));
}

main().then(() => pool.end()).catch(console.error);