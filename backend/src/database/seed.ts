import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { withSystemRlsContext } from '../config/rls';

const COMPANY_ID = 'company-demo-001';
const ADMIN_ID = 'user-admin-001';
const ACCOUNTANT_ID = 'user-acct-001';

const THAI_COMPANIES = [
  'สยามเทคโนโลยี', 'กรุงเทพดิจิทัล', 'ไทยโปรเซสซิ่ง', 'เอเชียซอฟต์', 'อีโคซัพพลาย',
  'ภูมิพัฒน์', 'เมกะซัพพลาย', 'วีไอพี เทรดดิ้ง', 'ไททัน เซอร์วิส', 'ฟิวเจอร์เวย์',
  'ซันไรส์ โซลูชัน', 'โอเรียนท์ อินดัสตรี', 'เจริญกิจ', 'สหพัฒน์โลจิสติกส์', 'อินโนเวทีฟ เอ็นเตอร์ไพรส์',
  'คิงส์แมน กรุ๊ป', 'ยูไนเต็ด ออฟฟิศ', 'สตาร์ลิงก์ คอนซัลต์', 'พรีเมียม โปรดักส์', 'ไพรม์มาร์ท',
  'เน็กซัส คอร์ป', 'ธนวัฒน์ การค้า', 'แอลฟ่า อินโนเวชั่น', 'บลูโอเชียน ซัพพลาย', 'เซ็นทรัลเมดิคอล',
  'รัตนกิจ', 'ราชาออโต้', 'มิลเลนเนียม ฟู้ด', 'เพชรการพิมพ์', 'เอสทีซี โลจิสติกส์',
  'ยูนิตี้ อินเตอร์เทรด', 'โกลเด้น ฮาร์ดแวร์', 'เวิลด์คลาส เมดิค', 'นิวเจน เอ็นเนอร์จี', 'มาสเตอร์พีซ ดิจิทัล',
  'ไอเดียล โฮลดิ้ง', 'ฟาสต์ลิงก์ ซัพพลาย', 'กรีนฟิลด์ อะโกร', 'ซิกมา เพาเวอร์', 'โอเรียลตัล ทราเวล',
  'เทรนดี้ รีเทล', 'ซิตี้มอลล์', 'สมาร์ทแพลน', 'เอ็กซ์ตร้า พริ้นท์', 'ดีไซน์วัน',
  'ทรัพย์มั่งคั่ง', 'โลตัส อินดัสตรี', 'แกรนด์ฟู้ดส์', 'บราโว เซอร์วิส', 'มิตรแท้ คอร์ป',
];

const PREFIXES = ['บริษัท', 'ห้างหุ้นส่วนจำกัด', 'บริษัท', 'บริษัท'];
const CITIES = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'ชลบุรี', 'ระยอง', 'เชียงใหม่', 'ขอนแก่น', 'นครราชสีมา', 'ภูเก็ต'];
const STREETS = ['ถนนสุขุมวิท', 'ถนนพระราม 4', 'ถนนพหลโยธิน', 'ถนนศรีนครินทร์', 'ถนนรัชดาภิเษก', 'ถนนสีลม', 'ถนนเพชรบุรี', 'ถนนแจ้งวัฒนะ'];
const CUSTOMER_PRODUCTS = [
  { code: 'SW-001', nameTh: 'ซอฟต์แวร์พัฒนาระบบ', nameEn: 'Software Development', unit: 'ชั่วโมง', unitPrice: 2500 },
  { code: 'SW-002', nameTh: 'บำรุงรักษาระบบรายปี', nameEn: 'Annual System Maintenance', unit: 'ปี', unitPrice: 120000 },
  { code: 'SW-003', nameTh: 'ที่ปรึกษาด้านเทคโนโลยี', nameEn: 'Technology Consulting', unit: 'วัน', unitPrice: 15000 },
  { code: 'HW-001', nameTh: 'เซิร์ฟเวอร์ Dell PowerEdge R750', nameEn: 'Dell PowerEdge R750 Server', unit: 'เครื่อง', unitPrice: 250000 },
  { code: 'TRN-001', nameTh: 'ฝึกอบรมการใช้งานระบบ', nameEn: 'System Training', unit: 'วัน', unitPrice: 25000 },
  { code: 'ACC-001', nameTh: 'บริการบัญชีและเอกสาร', nameEn: 'Accounting and Document Services', unit: 'เดือน', unitPrice: 18000 },
  { code: 'LOG-001', nameTh: 'บริการโลจิสติกส์', nameEn: 'Logistics Service', unit: 'เที่ยว', unitPrice: 8000 },
  { code: 'DES-001', nameTh: 'ออกแบบกราฟิก', nameEn: 'Graphic Design', unit: 'งาน', unitPrice: 12000 },
];

const seedUsers = [
  { id: ADMIN_ID, email: 'admin@siamtech.co.th', name: 'ผู้ดูแลระบบ', role: 'super_admin' as const, password: 'Admin@123456' },
  { id: ACCOUNTANT_ID, email: 'accountant@siamtech.co.th', name: 'สมชาย บัญชี', role: 'accountant' as const, password: 'Account@123456' },
];

type DbClient = Prisma.TransactionClient;

function hashSeedPassword(password: string) {
  return bcrypt.hash(password, 12);
}

function thaiAddress(index: number) {
  const street = STREETS[index % STREETS.length];
  const city = CITIES[index % CITIES.length];
  const building = `${100 + index} อาคาร${String.fromCharCode(65 + (index % 5))}`;
  const branch = String(index % 10).padStart(5, '0');
  return {
    nameTh: `${PREFIXES[index % PREFIXES.length]} ${THAI_COMPANIES[index] ?? `ลูกค้าตัวอย่าง ${index + 1}`}`,
    nameEn: `${THAI_COMPANIES[index] ?? `Sample Company ${index + 1}`} Co., Ltd.`,
    taxId: `01055${String(9000000 + index).slice(-8)}`.slice(0, 13),
    branchCode: branch,
    branchNameTh: branch === '00000' ? 'สำนักงานใหญ่' : `สาขา ${branch}`,
    branchNameEn: branch === '00000' ? 'Head Office' : `Branch ${branch}`,
    addressTh: `${building} ${street} ${city} ${10000 + (index % 50)}`,
    addressEn: `${building} ${street}, ${city}, Thailand ${10000 + (index % 50)}`,
    email: `contact${index + 1}@example${(index % 9) + 1}.co.th`,
    phone: `02-${String(100 + (index % 800)).padStart(3, '0')}-${String(1000 + index).slice(-4)}`,
  };
}

function pick<T>(arr: T[], index: number) {
  return arr[index % arr.length];
}

function randomDate(start: Date, end: Date, seed: number) {
  const value = start.getTime() + ((end.getTime() - start.getTime()) * ((seed * 9301 + 49297) % 233280)) / 233280;
  return new Date(value);
}

function buildItems(invoiceIndex: number) {
  const itemCount = (invoiceIndex % 4) + 1;
  return Array.from({ length: itemCount }, (_, i) => {
    const product = CUSTOMER_PRODUCTS[(invoiceIndex + i) % CUSTOMER_PRODUCTS.length];
    const quantity = ((invoiceIndex + i) % 5) + 1;
    const discount = ((invoiceIndex + i) % 3) * 5;
    const amount = quantity * product.unitPrice;
    const discountAmt = (amount * discount) / 100;
    const net = amount - discountAmt;
    const vatType: 'vat7' | 'vatExempt' | 'vatZero' =
      (invoiceIndex + i) % 6 === 0 ? 'vatExempt' : (invoiceIndex + i) % 7 === 0 ? 'vatZero' : 'vat7';
    const vatAmount = vatType === 'vat7' ? net * 0.07 : 0;

    return {
      productId: undefined,
      nameTh: product.nameTh,
      nameEn: product.nameEn,
      descriptionTh: `${product.nameTh} สำหรับลูกค้าองค์กร`,
      descriptionEn: `${product.nameEn} for enterprise customers`,
      quantity,
      unit: product.unit,
      unitPrice: product.unitPrice,
      discount,
      vatType,
      amount: Number(net.toFixed(2)),
      vatAmount: Number(vatAmount.toFixed(2)),
      totalAmount: Number((net + vatAmount).toFixed(2)),
    };
  });
}

function companySeed(companyIndex: number) {
  const base = thaiAddress(companyIndex);
  const id = `company-demo-${String(companyIndex + 1).padStart(3, '0')}`;
  const taxId = `01056${String(8000000 + companyIndex).slice(-8)}`.slice(0, 13);
  return {
    id,
    nameTh: base.nameTh,
    nameEn: base.nameEn,
    taxId,
    branchCode: '00000',
    branchNameTh: 'สำนักงานใหญ่',
    branchNameEn: 'Head Office',
    addressTh: base.addressTh,
    addressEn: base.addressEn,
    phone: base.phone,
    email: base.email,
    website: null as string | null,
    logoUrl: null as string | null,
  };
}

async function upsertCompany(db: DbClient, company: ReturnType<typeof companySeed>) {
  await db.company.upsert({
    where: { id: company.id },
    update: {
      nameTh: company.nameTh,
      nameEn: company.nameEn,
      taxId: company.taxId,
      branchCode: company.branchCode,
      branchNameTh: company.branchNameTh,
      branchNameEn: company.branchNameEn,
      addressTh: company.addressTh,
      addressEn: company.addressEn,
      phone: company.phone,
      email: company.email,
      website: company.website,
      logoUrl: company.logoUrl,
    },
    create: company,
  });
}

async function upsertAdminForCompany(db: DbClient, companyId: string, index: number) {
  const email = `admin+${index}@demo-etax.co.th`;
  const passwordHash = await hashSeedPassword('Admin@123456');
  await db.user.upsert({
    where: { email },
    update: {
      companyId,
      name: `Admin ${index}`,
      role: 'admin',
      passwordHash,
      isActive: true,
    },
    create: {
      companyId,
      email,
      name: `Admin ${index}`,
      passwordHash,
      role: 'admin',
      isActive: true,
    },
  });
  return email;
}

async function upsertSubscriptionWithDb(db: DbClient, companyId: string, plan: 'starter' | 'business' | 'enterprise') {
  const docLimit = plan === 'starter' ? 100 : plan === 'business' ? 500 : null;
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

  await db.companySubscription.upsert({
    where: { companyId },
    update: {
      plan,
      status: 'active',
      billingInterval: 'month',
      docLimit,
      currentPeriodStart,
      currentPeriodEnd,
      activatedAt: new Date(),
    },
    create: {
      companyId,
      plan,
      status: 'active',
      billingInterval: 'month',
      docLimit,
      currentPeriodStart,
      currentPeriodEnd,
      activatedAt: new Date(),
    },
  });
}

async function seedCompanyData(db: DbClient, companyId: string, seedOffset: number, customerCount: number, invoiceCount: number) {
  const customerSeeds = Array.from({ length: customerCount }, (_, index) => {
    const company = thaiAddress(seedOffset + index);
    return {
      companyId,
      nameTh: company.nameTh,
      nameEn: company.nameEn,
      taxId: company.taxId,
      branchCode: company.branchCode,
      branchNameTh: company.branchNameTh,
      branchNameEn: company.branchNameEn,
      addressTh: company.addressTh,
      addressEn: company.addressEn,
      email: company.email,
      phone: company.phone,
      contactPerson: `ฝ่ายบัญชี ${index + 1}`,
      isActive: true,
    };
  });

  await db.customer.createMany({
    data: customerSeeds,
    skipDuplicates: true,
  });

  await db.product.createMany({
    data: CUSTOMER_PRODUCTS.map((product, index) => ({
      companyId,
      code: product.code,
      nameTh: product.nameTh,
      nameEn: product.nameEn,
      descriptionTh: `${product.nameTh} สำหรับใช้งานตัวอย่าง`,
      descriptionEn: `${product.nameEn} sample line item`,
      unit: product.unit,
      unitPrice: product.unitPrice,
      vatType: index % 5 === 0 ? 'vatExempt' : index % 7 === 0 ? 'vatZero' : 'vat7',
      isActive: true,
    })),
    skipDuplicates: true,
  });

  const customers = await db.customer.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
  });

  const invoices = Array.from({ length: invoiceCount }, (_, index) => {
    const globalIndex = seedOffset * 1000 + index + 1;
    const typeRoll = index % 5;
    const type = pick(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'] as const, typeRoll);
    const customer = customers[index % customers.length];
    const invoiceDate = randomDate(new Date('2024-01-05'), new Date('2026-04-20'), globalIndex);
    const items = buildItems(globalIndex);
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = items.reduce((sum, item) => sum + item.vatAmount, 0);
    const discount = Number(((globalIndex % 4) * 250).toFixed(2));
    const total = subtotal + vatAmount - discount;
    const statuses = ['draft', 'pending', 'approved', 'submitted', 'rejected', 'cancelled'] as const;
    const status = statuses[globalIndex % statuses.length];
    const languages = ['th', 'en', 'both'] as const;
    const language = languages[globalIndex % languages.length];

    return {
      companyId,
      invoiceNumber: `${type === 'tax_invoice_receipt' ? 'T01' : type === 'tax_invoice' ? 'T02' : type === 'receipt' ? 'T03' : type === 'credit_note' ? 'T04' : 'T05'}-2026${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(globalIndex).padStart(6, '0')}`,
      type,
      status,
      language,
      invoiceDate,
      dueDate: type === 'tax_invoice' ? new Date(invoiceDate.getTime() + 14 * 24 * 60 * 60 * 1000) : null,
      buyerId: customer.id,
      seller: {
        nameTh: 'บริษัท สยาม เทคโนโลยี จำกัด',
        nameEn: 'Siam Technology Co., Ltd.',
        taxId: '0105560123456',
        branchCode: '00000',
        branchNameTh: 'สำนักงานใหญ่',
        addressTh: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
        addressEn: '123 Sukhumvit Road, Khlong Toei, Bangkok 10110, Thailand',
        phone: '02-123-4567',
        email: 'info@siamtech.co.th',
      },
      subtotal,
      vatAmount,
      discount,
      total,
      notes: `เอกสารตัวอย่างลำดับที่ ${globalIndex}`,
      paymentMethod: type === 'tax_invoice_receipt' || type === 'receipt' ? 'transfer' : 'credit',
      referenceDocNumber: type === 'receipt' || type === 'credit_note' || type === 'debit_note'
        ? `REF-${String(globalIndex).padStart(6, '0')}`
        : null,
      referenceInvoiceId: null,
      isPaid: type === 'tax_invoice_receipt' || type === 'receipt',
      paidAt: type === 'tax_invoice_receipt' || type === 'receipt' ? invoiceDate : null,
      paidAmount: type === 'tax_invoice_receipt' || type === 'receipt' ? total : null,
      createdBy: globalIndex % 7 === 0 ? ACCOUNTANT_ID : ADMIN_ID,
      items: {
        create: items.map((item) => ({
          ...item,
          productId: undefined,
        })),
      },
    };
  });

  for (const invoice of invoices) {
    await db.invoice.upsert({
      where: {
        companyId_invoiceNumber: {
          companyId,
          invoiceNumber: invoice.invoiceNumber,
        },
      },
      update: {
        ...invoice,
        items: undefined,
      },
      create: invoice,
    });
  }
}

async function main() {
  const seedMode = process.env.SEED_MODE ?? 'bootstrap';
  const isBootstrap = seedMode !== 'full';
  const extraCompanyCount = isBootstrap ? 0 : 4;
  const primaryCustomerCount = isBootstrap ? 8 : 50;
  const primaryInvoiceCount = isBootstrap ? 12 : 300;
  const extraCustomerCount = isBootstrap ? 0 : 10;
  const extraInvoiceCount = isBootstrap ? 0 : 30;

  await withSystemRlsContext(prisma, async (db) => {
    const existingCompany = await db.company.findUnique({ where: { id: COMPANY_ID } });

    if (!existingCompany) {
      await db.company.create({
        data: {
          id: COMPANY_ID,
          nameTh: 'บริษัท สยาม เทคโนโลยี จำกัด',
          nameEn: 'Siam Technology Co., Ltd.',
          taxId: '0105560123456',
          branchCode: '00000',
          branchNameTh: 'สำนักงานใหญ่',
          branchNameEn: 'Head Office',
          addressTh: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
          addressEn: '123 Sukhumvit Road, Khlong Toei, Bangkok 10110, Thailand',
          phone: '02-123-4567',
          email: 'info@siamtech.co.th',
        },
      });
    }

    for (const user of seedUsers) {
      const passwordHash = await hashSeedPassword(user.password);
      await db.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          role: user.role,
          companyId: COMPANY_ID,
          passwordHash,
          isActive: true,
        },
        create: {
          id: user.id,
          companyId: COMPANY_ID,
          email: user.email,
          name: user.name,
          passwordHash,
          role: user.role,
          isActive: true,
        },
      });
    }

    await upsertSubscriptionWithDb(db, COMPANY_ID, 'business');
    await seedCompanyData(db, COMPANY_ID, 0, primaryCustomerCount, primaryInvoiceCount);

    const extraPlans: Array<'starter' | 'business' | 'enterprise'> = ['starter', 'business', 'enterprise', 'starter'];
    const seededCompanies = [COMPANY_ID];
    for (let i = 0; i < extraCompanyCount; i++) {
      const company = companySeed(100 + i);
      await upsertCompany(db, company);
      await upsertAdminForCompany(db, company.id, i + 1);
      await upsertSubscriptionWithDb(db, company.id, extraPlans[i]);
      await seedCompanyData(db, company.id, 100 + i * 50, extraCustomerCount, extraInvoiceCount);
      seededCompanies.push(company.id);
    }

    const launchCoupon = await db.coupon.upsert({
      where: { code: 'LAUNCH20' },
      update: {
        name: 'Launch Campaign 20%',
        discountType: 'percent',
        discountValue: 20,
        maxRedemptions: 200,
        active: true,
      },
      create: {
        code: 'LAUNCH20',
        name: 'Launch Campaign 20%',
        description: 'Opening campaign for new online signups',
        discountType: 'percent',
        discountValue: 20,
        maxRedemptions: 200,
        active: true,
      },
    });

    await db.coupon.upsert({
      where: { code: 'PROMPTPAY500' },
      update: {
        name: 'PromptPay 500 THB off',
        discountType: 'fixed',
        discountValue: 500,
        maxDiscountAmount: 500,
        active: true,
      },
      create: {
        code: 'PROMPTPAY500',
        name: 'PromptPay 500 THB off',
        description: 'PromptPay-only launch offer',
        discountType: 'fixed',
        discountValue: 500,
        maxDiscountAmount: 500,
        active: true,
      },
    });

    const paidSignup = await db.pendingSignup.create({
      data: {
        companyNameTh: 'บริษัท โกลว์ดิจิทัล จำกัด',
        companyNameEn: 'Glow Digital Co., Ltd.',
        taxId: '0105560999001',
        addressTh: '99 ถนนสีลม กรุงเทพมหานคร 10500',
        adminName: 'ศิริพร แอดมิน',
        adminEmail: 'billing+glow@example.com',
        phone: '081-234-5678',
        plan: 'business',
        paymentMethod: 'stripe',
        couponCode: launchCoupon.code,
        subtotalAmount: 2490,
        discountAmount: 498,
        totalAmount: 1992,
        status: 'activated',
        locale: 'th',
        activatedAt: new Date(),
      },
    });

    await db.billingTransaction.create({
      data: {
        companyId: seededCompanies[0],
        pendingSignupId: paidSignup.id,
        couponId: launchCoupon.id,
        plan: 'business',
        channel: 'stripe',
        status: 'activated',
        subtotalAmount: 2490,
        discountAmount: 498,
        totalAmount: 1992,
        couponCode: launchCoupon.code,
        externalReference: `seed-stripe-${Date.now()}`,
        paidAt: new Date(),
        metadata: { seeded: true },
      },
    });

    const promptPaySignup = await db.pendingSignup.create({
      data: {
        companyNameTh: 'บริษัท บลูสกาย ซัพพลาย จำกัด',
        companyNameEn: 'Blue Sky Supply Co., Ltd.',
        taxId: '0105560999002',
        addressTh: '88 ถนนพระราม 4 กรุงเทพมหานคร 10110',
        adminName: 'นที ชำระเงิน',
        adminEmail: 'billing+bluesky@example.com',
        phone: '082-000-1122',
        plan: 'starter',
        paymentMethod: 'promptpay_qr',
        couponCode: 'PROMPTPAY500',
        subtotalAmount: 990,
        discountAmount: 500,
        totalAmount: 490,
        status: 'pending',
        locale: 'th',
      },
    });

    await db.billingTransaction.create({
      data: {
        pendingSignupId: promptPaySignup.id,
        plan: 'starter',
        channel: 'promptpay_qr',
        status: 'awaiting_payment',
        subtotalAmount: 990,
        discountAmount: 500,
        totalAmount: 490,
        couponCode: 'PROMPTPAY500',
        externalReference: 'PP-SEED0001',
        qrPayload: 'SEED-PROMPTPAY-PAYLOAD',
        qrImageDataUrl: 'data:image/png;base64,SEED',
        metadata: { seeded: true },
      },
    });
  }, { role: 'seed-script' });

  console.log(
    isBootstrap
      ? 'Seeded bootstrap dataset for production deploy'
      : `Seeded main company + ${extraCompanyCount} extra companies (multi-company dataset)`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
