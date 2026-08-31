-- ============================================================================
-- Module 1: Fabric Procurement & Supplier Ledger Migration Script
-- Multi-tenant Garments Wholesale ERP (Gents Suits Business)
-- ============================================================================

-- 1. CUSTOM ENUM TYPES
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM (
            'cash',
            'cheque',
            'bank_transfer',
            'jazzcash',
            'easypaisa'
        );
    END IF;
END $$;

-- 2. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    ntn_tax_id VARCHAR(50),
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_suppliers_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- 3. FABRIC PURCHASES TABLE
CREATE TABLE IF NOT EXISTS fabric_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    invoice_no VARCHAR(100),
    fabric_type standard_fabric_type NOT NULL DEFAULT 'washing_wear',
    fabric_name VARCHAR(255) NOT NULL,
    quantity_meters NUMERIC(12, 2) NOT NULL CHECK (quantity_meters > 0),
    unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC(12, 2) GENERATED ALWAYS AS (quantity_meters * unit_cost) STORED,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fabric_purchases_tenant ON fabric_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fabric_purchases_supplier ON fabric_purchases(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_fabric_purchases_date ON fabric_purchases(tenant_id, received_date);

-- 4. SUPPLIER PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    purchase_id UUID REFERENCES fabric_purchases(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    method payment_method NOT NULL DEFAULT 'bank_transfer',
    reference_no VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant ON supplier_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON supplier_payments(purchase_id);

-- 5. UPDATED_AT TRIGGERS
DROP TRIGGER IF EXISTS set_suppliers_updated_at ON suppliers;
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_fabric_purchases_updated_at ON fabric_purchases;
CREATE TRIGGER set_fabric_purchases_updated_at BEFORE UPDATE ON fabric_purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_supplier_payments_updated_at ON supplier_payments;
CREATE TRIGGER set_supplier_payments_updated_at BEFORE UPDATE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. VIEWS FOR AUTO-CALCULATED BALANCES & RUNNING LEDGER

-- View: Fabric Purchase Summaries (Total Cost, Total Paid, Remaining Balance per receipt)
CREATE OR REPLACE VIEW v_fabric_purchase_summaries AS
SELECT 
    fp.id AS purchase_id,
    fp.tenant_id,
    fp.supplier_id,
    s.name AS supplier_name,
    fp.invoice_no,
    fp.fabric_type,
    fp.fabric_name,
    fp.quantity_meters,
    fp.unit_cost,
    fp.total_cost,
    COALESCE(SUM(sp.amount), 0) AS total_paid,
    (fp.total_cost - COALESCE(SUM(sp.amount), 0)) AS remaining_balance,
    fp.received_date,
    fp.created_at
FROM fabric_purchases fp
JOIN suppliers s ON s.id = fp.supplier_id
LEFT JOIN supplier_payments sp ON sp.purchase_id = fp.id
GROUP BY fp.id, s.name, fp.tenant_id, fp.supplier_id, fp.invoice_no, fp.fabric_type, fp.fabric_name, fp.quantity_meters, fp.unit_cost, fp.total_cost, fp.received_date, fp.created_at;

-- View: Supplier Balances (Total Purchased, Total Paid, Current Balance per supplier)
CREATE OR REPLACE VIEW v_supplier_balances AS
SELECT 
    s.id AS supplier_id,
    s.tenant_id,
    s.name AS supplier_name,
    s.company_name,
    s.phone,
    COALESCE(p.total_purchased, 0) AS total_purchased_amount,
    COALESCE(pay.total_paid, 0) AS total_paid_amount,
    (COALESCE(p.total_purchased, 0) - COALESCE(pay.total_paid, 0)) AS current_balance_due
FROM suppliers s
LEFT JOIN (
    SELECT supplier_id, SUM(total_cost) AS total_purchased
    FROM fabric_purchases
    GROUP BY supplier_id
) p ON p.supplier_id = s.id
LEFT JOIN (
    SELECT supplier_id, SUM(amount) AS total_paid
    FROM supplier_payments
    GROUP BY supplier_id
) pay ON pay.supplier_id = s.id;

-- View: Supplier Ledger (Chronological transactions & windowed running balance)
CREATE OR REPLACE VIEW v_supplier_ledger AS
WITH ledger_entries AS (
    SELECT 
        fp.id AS transaction_id,
        fp.tenant_id,
        fp.supplier_id,
        fp.received_date AS transaction_date,
        'fabric_purchase' AS entry_type,
        CONCAT('Fabric Received: ', fp.fabric_name, ' (', fp.quantity_meters, 'm @ ', fp.unit_cost, ')') AS description,
        fp.invoice_no AS reference_no,
        fp.total_cost AS debit_amount,
        0.00 AS credit_amount,
        fp.created_at
    FROM fabric_purchases fp

    UNION ALL

    SELECT 
        sp.id AS transaction_id,
        sp.tenant_id,
        sp.supplier_id,
        sp.payment_date AS transaction_date,
        'supplier_payment' AS entry_type,
        CONCAT('Payment Made via ', sp.method, CASE WHEN sp.notes IS NOT NULL THEN CONCAT(' (', sp.notes, ')') ELSE '' END) AS description,
        sp.reference_no,
        0.00 AS debit_amount,
        sp.amount AS credit_amount,
        sp.created_at
    FROM supplier_payments sp
)
SELECT 
    le.transaction_id,
    le.tenant_id,
    le.supplier_id,
    le.transaction_date,
    le.entry_type,
    le.description,
    le.reference_no,
    le.debit_amount,
    le.credit_amount,
    SUM(le.debit_amount - le.credit_amount) OVER (
        PARTITION BY le.tenant_id, le.supplier_id 
        ORDER BY le.transaction_date ASC, le.created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance,
    le.created_at
FROM ledger_entries le;

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

-- Suppliers RLS Policies
DROP POLICY IF EXISTS "Tenant users can view suppliers" ON suppliers;
CREATE POLICY "Tenant users can view suppliers" ON suppliers
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can manage suppliers" ON suppliers;
CREATE POLICY "Owners and shop staff can manage suppliers" ON suppliers
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Fabric Purchases RLS Policies
DROP POLICY IF EXISTS "Tenant users can view fabric purchases" ON fabric_purchases;
CREATE POLICY "Tenant users can view fabric purchases" ON fabric_purchases
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners, shop staff, cutting masters can record fabric purchases" ON fabric_purchases;
CREATE POLICY "Owners, shop staff, cutting masters can record fabric purchases" ON fabric_purchases
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff', 'cutting_master'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff', 'cutting_master'));

-- Supplier Payments RLS Policies
DROP POLICY IF EXISTS "Tenant users can view supplier payments" ON supplier_payments;
CREATE POLICY "Tenant users can view supplier payments" ON supplier_payments
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can manage supplier payments" ON supplier_payments;
CREATE POLICY "Owners and shop staff can manage supplier payments" ON supplier_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- 8. STORED FUNCTIONS (RPC API LOGIC)

-- Helper function to record a fabric purchase receipt easily
CREATE OR REPLACE FUNCTION record_fabric_purchase(
    p_supplier_id UUID,
    p_fabric_name VARCHAR(255),
    p_fabric_type standard_fabric_type,
    p_quantity_meters NUMERIC(12,2),
    p_unit_cost NUMERIC(12,2),
    p_invoice_no VARCHAR(100) DEFAULT NULL,
    p_received_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_purchase_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO fabric_purchases (
        tenant_id, supplier_id, invoice_no, fabric_type, fabric_name,
        quantity_meters, unit_cost, received_date, notes, created_by
    ) VALUES (
        v_tenant_id, p_supplier_id, p_invoice_no, p_fabric_type, p_fabric_name,
        p_quantity_meters, p_unit_cost, p_received_date, p_notes, auth.uid()
    )
    RETURNING id INTO v_purchase_id;

    RETURN v_purchase_id;
END;
$$;

-- Helper function to record a supplier payment easily
CREATE OR REPLACE FUNCTION record_supplier_payment(
    p_supplier_id UUID,
    p_amount NUMERIC(12,2),
    p_method payment_method,
    p_purchase_id UUID DEFAULT NULL,
    p_reference_no VARCHAR(100) DEFAULT NULL,
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_payment_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO supplier_payments (
        tenant_id, supplier_id, purchase_id, amount, payment_date,
        method, reference_no, notes, created_by
    ) VALUES (
        v_tenant_id, p_supplier_id, p_purchase_id, p_amount, p_payment_date,
        p_method, p_reference_no, p_notes, auth.uid()
    )
    RETURNING id INTO v_payment_id;

    RETURN v_payment_id;
END;
$$;
