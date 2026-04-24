-- Seed data for development
-- Demo company, admin user, sample customers and products

-- Demo company
INSERT INTO companies (id, name_th, name_en, tax_id, branch_code, branch_name_th, branch_name_en, address_th, address_en, phone, email)
VALUES (
    'company-demo-001',
    'บริษัท สยาม เทคโนโลยี จำกัด',
    'Siam Technology Co., Ltd.',
    '0105560123456',
    '00000',
    'สำนักงานใหญ่',
    'Head Office',
    '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
    '123 Sukhumvit Road, Khlong Toei, Bangkok 10110, Thailand',
    '02-123-4567',
    'info@siamtech.co.th'
);

-- Admin user (password: Admin@123456)
INSERT INTO users (id, company_id, email, name, password_hash, role)
VALUES (
    'user-admin-001',
    'company-demo-001',
    'admin@siamtech.co.th',
    'ผู้ดูแลระบบ',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBtQvS3sCbQy6m',  -- Admin@123456
    'admin'
);

-- Accountant user (password: Account@123)
INSERT INTO users (id, company_id, email, name, password_hash, role)
VALUES (
    'user-acct-001',
    'company-demo-001',
    'accountant@siamtech.co.th',
    'สมชาย บัญชี',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBtQvS3sCbQy6m',
    'accountant'
);

-- Sample customers
INSERT INTO customers (company_id, name_th, name_en, tax_id, branch_code, address_th, address_en, email, phone)
VALUES
(
    'company-demo-001',
    'บริษัท เอบีซี จำกัด',
    'ABC Co., Ltd.',
    '0105550098765',
    '00000',
    '456 ถนนพระราม 4 แขวงสีลม เขตบางรัก กรุงเทพฯ 10500',
    '456 Rama IV Road, Silom, Bang Rak, Bangkok 10500',
    'contact@abc.co.th',
    '02-234-5678'
),
(
    'company-demo-001',
    'ห้างหุ้นส่วนจำกัด ไทยการค้า',
    'Thai Trade Limited Partnership',
    '0103550034567',
    '00000',
    '789 ถนนพัฒนาการ แขวงสวนหลวง เขตสวนหลวง กรุงเทพฯ 10250',
    '789 Phatthanakan Road, Suan Luang, Bangkok 10250',
    'info@thaitrade.co.th',
    '02-345-6789'
),
(
    'company-demo-001',
    'บริษัท อินเตอร์เนชั่นแนล เทรด จำกัด',
    'International Trade Co., Ltd.',
    '0105560087654',
    '00001',
    '100 อาคารซีพีทาวเวอร์ ถนนสีลม กรุงเทพฯ 10500',
    '100 CP Tower Building, Silom Road, Bangkok 10500',
    'international@intl-trade.co.th',
    '02-456-7890'
);

-- Sample products / services
INSERT INTO products (company_id, code, name_th, name_en, unit, unit_price, vat_type)
VALUES
('company-demo-001', 'SW-001', 'ซอฟต์แวร์พัฒนาระบบ', 'Software Development', 'ชั่วโมง', 2500.00, 'vat7'),
('company-demo-001', 'SW-002', 'บำรุงรักษาระบบรายปี', 'Annual System Maintenance', 'ปี', 120000.00, 'vat7'),
('company-demo-001', 'SW-003', 'ที่ปรึกษาด้านเทคโนโลยี', 'Technology Consulting', 'วัน', 15000.00, 'vat7'),
('company-demo-001', 'HW-001', 'เซิร์ฟเวอร์ Dell PowerEdge R750', 'Dell PowerEdge R750 Server', 'เครื่อง', 250000.00, 'vat7'),
('company-demo-001', 'TRN-001', 'ฝึกอบรมการใช้งานระบบ', 'System Training', 'วัน', 25000.00, 'vatExempt');
