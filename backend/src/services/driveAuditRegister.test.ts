import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartyDirectoryRows, buildProjectRollupRows, preferredDriveFirstUrl } from './driveAuditRegister';

test('preferredDriveFirstUrl prefers Drive over fallback storage URLs', () => {
  assert.equal(preferredDriveFirstUrl({
    driveUrl: 'https://drive.google.com/file/d/drive-id/view',
    s3Url: 'https://storage.example/s3-file',
    fileUrl: 'https://app.example/file',
    pdfUrl: 'https://app.example/pdf',
  }), 'https://drive.google.com/file/d/drive-id/view');

  assert.equal(preferredDriveFirstUrl({
    s3Url: 'https://storage.example/s3-file',
    fileUrl: 'https://app.example/file',
  }), 'https://storage.example/s3-file');

  // WHT / payroll path: only driveUrl or the legacy pdfUrl are ever present.
  assert.equal(preferredDriveFirstUrl({
    driveUrl: 'https://drive.google.com/file/d/wht/view',
    pdfUrl: 'https://app.example/wht.pdf',
  }), 'https://drive.google.com/file/d/wht/view');
  assert.equal(preferredDriveFirstUrl({ pdfUrl: 'https://app.example/wht.pdf' }), 'https://app.example/wht.pdf');
  assert.equal(preferredDriveFirstUrl({}), null);
  assert.equal(preferredDriveFirstUrl(null), null);
});

test('buildPartyDirectoryRows keeps every uploaded document in the register', () => {
  const rows = buildPartyDirectoryRows([
    {
      nameTh: 'บริษัท ทดสอบ จำกัด',
      taxId: '0105559999999',
      useCase: 'b2b',
      verificationStatus: 'ready',
      partyRole: 'both',
      documents: [
        {
          documentType: 'company_registration',
          status: 'verified',
          driveUrl: 'https://drive.google.com/file/d/reg/view',
          s3Url: 'https://storage.example/reg.pdf',
          driveFolderUrl: 'https://drive.google.com/drive/folders/customer',
        },
        {
          documentType: 'vat_certificate',
          status: 'uploaded',
          s3Url: 'https://storage.example/vat.pdf',
        },
      ],
    },
  ], 'customer');

  assert.equal(rows.length, 2);
  assert.equal(rows[0].documentType, 'company_registration');
  assert.equal(rows[0].attachmentUrl, 'https://drive.google.com/file/d/reg/view');
  assert.equal(rows[1].documentType, 'vat_certificate');
  assert.equal(rows[1].attachmentUrl, 'https://storage.example/vat.pdf');
});

test('buildProjectRollupRows adds Drive folder and synced file count', () => {
  const [row] = buildProjectRollupRows([
    {
      code: 'P-001',
      name: 'Bangkok Site',
      status: 'active',
      budgetAmount: '10000',
      driveFolderUrl: 'https://drive.google.com/drive/folders/project',
      invoices: [{ total: 7000, status: 'approved' }, { total: 1000, status: 'cancelled' }],
      purchaseInvoices: [{ total: 2500 }],
      expenseVouchers: [{ totalAmount: '1000', status: 'approved' }, { totalAmount: '500', status: 'rejected' }],
      documentIntakes: [{ driveUrl: 'https://drive.google.com/file/d/file/view' }, { driveSyncStatus: 'failed' }],
    },
  ]);

  assert.equal(row.project, 'P-001 Bangkok Site');
  assert.equal(row.revenue, 7000);
  assert.equal(row.actual, 3500);
  assert.equal(row.balance, 6500);
  assert.equal(row.files, '1/2 synced');
  assert.equal(row.folderUrl, 'https://drive.google.com/drive/folders/project');
});
