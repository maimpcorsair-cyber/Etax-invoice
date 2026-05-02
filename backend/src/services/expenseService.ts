import prisma from '../config/database';
import { withRlsContext } from '../config/rls';

export async function generateVoucherNumber(companyId: string): Promise<string> {
  const prefix = 'PC';
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');

  const count = await withRlsContext(prisma, { companyId, role: 'tenant', systemMode: false }, async (tx) => {
    return tx.expenseVoucher.count({
      where: { companyId, voucherDate: { gte: new Date(`${year}-${month}-01`) } },
    });
  });

  const seq = String(count + 1).padStart(6, '0');
  return `${prefix}-${year}${month}-${seq}`;
}

export async function getExpenseLimit(companyId: string): Promise<number | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { expenseLimit: true },
  });
  return company?.expenseLimit ? Number(company.expenseLimit) : null;
}
