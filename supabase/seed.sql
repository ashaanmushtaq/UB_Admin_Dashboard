-- ============================================================================
-- Module 0: Foundation Seed Data
-- ============================================================================

-- 1. SEED SYSTEM ROLES METADATA
INSERT INTO roles (id, name, description) VALUES
    ('owner', 'Business Owner', 'Full administrative control over tenant settings, financials, staff, and operations'),
    ('shop_staff', 'Shop Counter Staff', 'Manages POS counter sales, orders, and customer queries'),
    ('cutting_master', 'Cutting Master', 'Manages fabric cutting and assigns work orders to tailoring teams'),
    ('tailor', 'Stitching Tailor', 'Performs suit stitching, jacket assembly, and trousers creation'),
    ('iron_presser', 'Iron / Steam Presser', 'Performs garment finishing, steam pressing, and final shaping'),
    ('packing_staff', 'Packing & Quality Staff', 'Inspects finished garments, tags variants, and packs orders for delivery'),
    ('kaj_overlock_staff', 'Kaj & Overlock Staff', 'Handles buttonhole creation (Kaj), button attachment, and edge overlocking'),
    ('driver', 'Delivery Driver', 'Transports raw materials and completed bulk suits to shops/customers'),
    ('helper', 'General Helper', 'Assists across all production stages and inventory handling')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. SEED DEFAULT DEMO TENANT
INSERT INTO tenants (id, name, slug, company_name, address, phone, email) VALUES
    ('00000000-0000-0000-0000-000000000001', 'UB Collection Wholesale', 'ub-collection', 'UB Collection Gents Suit Manufacturers', 'Main Bazar Garments Market, Lahore', '+92 300 1234567', 'info@ubcollection.com')
ON CONFLICT (slug) DO NOTHING;

-- 3. SEED DEFAULT PRODUCT CATEGORIES FOR GENTS SUITS
INSERT INTO product_categories (id, tenant_id, name, description) VALUES
    ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000000001', '2-Piece Executive Suits', 'Gents 2-piece coat and trousers suit set'),
    ('11111111-1111-1111-1111-111111111102', '00000000-0000-0000-0000-000000000001', '3-Piece Royal Suits', 'Gents 3-piece coat, waistcoat, and trousers suit set'),
    ('11111111-1111-1111-1111-111111111103', '00000000-0000-0000-0000-000000000001', 'Kids Suit Sets', 'Boy/Kid gents suit sets with flexible waist'),
    ('11111111-1111-1111-1111-111111111104', '00000000-0000-0000-0000-000000000001', 'Custom Tailored Special Suits', 'Custom fabric and bespoke fitted suit sets')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 4. SEED SAMPLE PRODUCTS
INSERT INTO products (id, tenant_id, category_id, name, code, description, default_fabric_type) VALUES
    ('22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111101', 'Classic Italian Cut 2-Piece', 'SUIT-2P-ITA', 'Premium washing-wear & silk fabric executive 2-piece gents suit', 'washing_wear'),
    ('22222222-2222-2222-2222-222222222202', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111103', 'Junior Gentleman Kid Suit', 'SUIT-KID-JR', 'Kid size gents suit set (XS to L)', 'silk'),
    ('22222222-2222-2222-2222-222222222203', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111104', 'Custom Fabric Order Suit', 'SUIT-CUST-01', 'Special request suit with custom specified customer fabric', 'custom')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 5. SEED SAMPLE VARIANTS
INSERT INTO product_variants 
(tenant_id, product_id, sku, size_category, size_code, color, fabric_type, custom_fabric_note, wholesale_price, retail_price, stock_quantity) 
VALUES
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222201', 'SUIT-2P-NAVY-M-WW', 'adult', 'M', 'Navy Blue', 'washing_wear', NULL, 4500.00, 6500.00, 50),
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222201', 'SUIT-2P-BLK-L-WW', 'adult', 'L', 'Black', 'washing_wear', NULL, 4500.00, 6500.00, 40),
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222201', 'SUIT-2P-CHAR-40-SILK', 'adult', '40', 'Charcoal Grey', 'silk', NULL, 5800.00, 8000.00, 25),
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222202', 'SUIT-KID-ROYAL-XS-SILK', 'kid', 'XS', 'Royal Blue', 'silk', NULL, 2800.00, 4000.00, 30),
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222202', 'SUIT-KID-ROYAL-S-SILK', 'kid', 'S', 'Royal Blue', 'silk', NULL, 3000.00, 4200.00, 35),
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222202', 'SUIT-KID-MAROON-M-WW', 'kid', 'M', 'Maroon', 'washing_wear', NULL, 3200.00, 4500.00, 20),
    ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222203', 'SUIT-CUST-SPECIAL-L', 'adult', 'L', 'Custom Gold Embroidered', 'custom', 'Customer supplied imported Turkish Jacquard Velvet fabric', 7500.00, 11000.00, 5)
ON CONFLICT (tenant_id, sku) DO NOTHING;

-- ============================================================================
-- Module 1: Fabric Procurement & Supplier Ledger Seed Data
-- ============================================================================

-- 6. SEED FABRIC SUPPLIERS
INSERT INTO suppliers (id, tenant_id, name, company_name, contact_person, phone, city) VALUES
    ('33333333-3333-3333-3333-333333333301', '00000000-0000-0000-0000-000000000001', 'Grace Fabrics Mills', 'Grace Textile Industry Ltd', 'Tariq Mehmood', '+92 321 8889900', 'Faisalabad'),
    ('33333333-3333-3333-3333-333333333302', '00000000-0000-0000-0000-000000000001', 'Gul Ahmed Wholesalers', 'Gul Ahmed Textile Mills', 'Shehzad Khan', '+92 301 7776655', 'Karachi'),
    ('33333333-3333-3333-3333-333333333303', '00000000-0000-0000-0000-000000000001', 'Al-Karam Silk & Tropical', 'Al-Karam Traders', 'Usman Ali', '+92 333 4443322', 'Lahore')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 7. SEED FABRIC PURCHASES
INSERT INTO fabric_purchases 
(id, tenant_id, supplier_id, invoice_no, fabric_type, fabric_name, quantity_meters, unit_cost, received_date, notes) 
VALUES
    ('44444444-4444-4444-4444-444444444401', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', 'INV-GR-2026-01', 'washing_wear', 'Grace Executive Wash & Wear Charcoal', 500.00, 450.00, '2026-08-01', '500 meters roll shipment for winter gents suit production'),
    ('44444444-4444-4444-4444-444444444402', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', 'INV-GR-2026-02', 'washing_wear', 'Grace Royal Wash & Wear Navy Blue', 300.00, 480.00, '2026-08-15', '300 meters roll shipment'),
    ('44444444-4444-4444-4444-444444444403', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333303', 'INV-AK-2026-88', 'silk', 'Al-Karam Premium Boski Silk Black', 200.00, 850.00, '2026-08-20', '200 meters premium silk for wedding suits')
ON CONFLICT (id) DO NOTHING;

-- 8. SEED SUPPLIER PAYMENTS
INSERT INTO supplier_payments 
(id, tenant_id, supplier_id, purchase_id, amount, payment_date, method, reference_no, notes) 
VALUES
    ('55555555-5555-5555-5555-555555555501', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', 150000.00, '2026-08-05', 'bank_transfer', 'FT-HBL-99201', 'Advance payment for Grace INV-GR-2026-01'),
    ('55555555-5555-5555-5555-555555555502', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', 75000.00, '2026-08-10', 'cheque', 'CHQ-MEEZAN-44012', 'Second installment'),
    ('55555555-5555-5555-5555-555555555503', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333303', '44444444-4444-4444-4444-444444444403', 50000.00, '2026-08-22', 'jazzcash', 'JC-88392019', 'Deposit via JazzCash')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Module 2: Employee Management & Payment/Advance Tracking Seed Data
-- ============================================================================

-- 9. SEED EMPLOYEES
INSERT INTO employees 
(id, tenant_id, full_name, role, phone, cnic_id, employment_type, base_rate, joining_date) 
VALUES
    ('66666666-6666-6666-6666-666666666601', '00000000-0000-0000-0000-000000000001', 'Master Muhammad Aslam', 'cutting_master', '+92 300 9876543', '35202-1234567-1', 'monthly', 65000.00, '2025-01-01'),
    ('66666666-6666-6666-6666-666666666602', '00000000-0000-0000-0000-000000000001', 'Rashid Tailor', 'tailor', '+92 321 4567890', '35202-7654321-3', 'piece_rate', 500.00, '2025-02-15'),
    ('66666666-6666-6666-6666-666666666603', '00000000-0000-0000-0000-000000000001', 'Irfan Steam Presser', 'iron_presser', '+92 333 1122334', '35202-9988776-5', 'monthly', 35000.00, '2025-03-01'),
    ('66666666-6666-6666-6666-666666666604', '00000000-0000-0000-0000-000000000001', 'Kamran Driver', 'driver', '+92 302 5544332', '35202-3344556-7', 'monthly', 32000.00, '2025-04-10')
ON CONFLICT (id) DO NOTHING;

-- 10. SEED EMPLOYEE EARNINGS LOG
INSERT INTO employee_earnings 
(id, tenant_id, employee_id, earning_date, earning_type, amount, quantity_completed, rate_per_unit, description) 
VALUES
    ('77777777-7777-7777-7777-777777777701', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666601', '2026-08-01', 'salary', 65000.00, 1, 65000.00, 'August 2026 Fixed Monthly Salary Allocation'),
    ('77777777-7777-7777-7777-777777777702', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666602', '2026-08-10', 'piece_rate', 25000.00, 50, 500.00, 'Tailored 50 Executive 2-Piece Suits'),
    ('77777777-7777-7777-7777-777777777703', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666602', '2026-08-25', 'piece_rate', 15000.00, 30, 500.00, 'Tailored 30 Royal 3-Piece Suits'),
    ('77777777-7777-7777-7777-777777777704', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666603', '2026-08-01', 'salary', 35000.00, 1, 35000.00, 'August 2026 Fixed Monthly Salary Allocation')
ON CONFLICT (id) DO NOTHING;

-- 11. SEED EMPLOYEE PAYMENTS & ADVANCES (Triggers Notification Generation Automatically)
INSERT INTO employee_payments 
(id, tenant_id, employee_id, payment_date, amount, payment_type, method, reference_no, notes) 
VALUES
    ('88888888-8888-8888-8888-888888888801', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666601', '2026-08-05', '15000.00', 'advance', 'cash', NULL, 'Mid-month cash advance requested by Master Aslam'),
    ('88888888-8888-8888-8888-888888888802', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666601', '2026-08-30', '40000.00', 'salary_payout', 'bank_transfer', 'FT-HBL-11029', 'August salary partial settlement'),
    ('88888888-8888-8888-8888-888888888803', '00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666602', '2026-08-12', '20000.00', 'piece_rate_payout', 'easypaisa', 'EP-7781029', 'Piece-rate payout via EasyPaisa for Rashid Tailor')
ON CONFLICT (id) DO NOTHING;
