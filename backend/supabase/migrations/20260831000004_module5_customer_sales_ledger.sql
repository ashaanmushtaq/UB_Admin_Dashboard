-- ============================================================================
-- Module 5: Customer & Sales Ledger Migration Script
-- Multi-tenant Garments Wholesale ERP (Gents Suits Business)
-- ============================================================================

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    ntn_tax_id VARCHAR(50),
    credit_limit NUMERIC(12, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_customers_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

-- 2. CUSTOMER SALES TABLE (Bulk Sales / Invoices)
CREATE TABLE IF NOT EXISTS customer_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    production_order_id UUID REFERENCES production_orders(id) ON DELETE SET NULL,
    invoice_no VARCHAR(100) NOT NULL,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_customer_sales_tenant_inv UNIQUE (tenant_id, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_customer_sales_tenant ON customer_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_sales_customer ON customer_sales(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sales_due_date ON customer_sales(tenant_id, due_date);

-- 3. CUSTOMER PAYMENTS TABLE (Payments received from customers)
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES customer_sales(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    method payment_method NOT NULL DEFAULT 'cash',
    reference_no VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_tenant ON customer_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(tenant_id, customer_id);

-- 4. UPDATED_AT TRIGGERS
DROP TRIGGER IF EXISTS set_customers_updated_at ON customers;
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_customer_sales_updated_at ON customer_sales;
CREATE TRIGGER set_customer_sales_updated_at BEFORE UPDATE ON customer_sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_customer_payments_updated_at ON customer_payments;
CREATE TRIGGER set_customer_payments_updated_at BEFORE UPDATE ON customer_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. VIEWS FOR CUSTOMER BALANCES & RUNNING LEDGER

-- View: Customer Balances (Total Sales, Total Paid, Total Pending Dues)
CREATE OR REPLACE VIEW v_customer_balances AS
SELECT 
    c.id AS customer_id,
    c.tenant_id,
    c.name AS customer_name,
    c.company_name,
    c.phone,
    c.city,
    c.credit_limit,
    COALESCE(s.total_sales, 0) AS total_sales_amount,
    COALESCE(p.total_paid, 0) AS total_paid_amount,
    (COALESCE(s.total_sales, 0) - COALESCE(p.total_paid, 0)) AS current_balance_due
FROM customers c
LEFT JOIN (
    SELECT customer_id, SUM(total_amount) AS total_sales
    FROM customer_sales
    GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
    SELECT customer_id, SUM(amount) AS total_paid
    FROM customer_payments
    GROUP BY customer_id
) p ON p.customer_id = c.id;

-- View: Customer Ledger (Chronological transactions & windowed running balance)
CREATE OR REPLACE VIEW v_customer_ledger AS
WITH ledger_entries AS (
    SELECT 
        cs.id AS transaction_id,
        cs.tenant_id,
        cs.customer_id,
        cs.sale_date AS transaction_date,
        'sale' AS entry_type,
        CONCAT('Sale Invoice #', cs.invoice_no, CASE WHEN cs.notes IS NOT NULL THEN CONCAT(' (', cs.notes, ')') ELSE '' END) AS description,
        cs.invoice_no AS reference_no,
        cs.total_amount AS debit_amount,
        0.00 AS credit_amount,
        cs.created_at
    FROM customer_sales cs

    UNION ALL

    SELECT 
        cp.id AS transaction_id,
        cp.tenant_id,
        cp.customer_id,
        cp.payment_date AS transaction_date,
        'payment' AS entry_type,
        CONCAT('Payment Received via ', cp.method, CASE WHEN cp.notes IS NOT NULL THEN CONCAT(' (', cp.notes, ')') ELSE '' END) AS description,
        cp.reference_no,
        0.00 AS debit_amount,
        cp.amount AS credit_amount,
        cp.created_at
    FROM customer_payments cp
)
SELECT 
    le.transaction_id,
    le.tenant_id,
    le.customer_id,
    le.transaction_date,
    le.entry_type,
    le.description,
    le.reference_no,
    le.debit_amount,
    le.credit_amount,
    SUM(le.debit_amount - le.credit_amount) OVER (
        PARTITION BY le.tenant_id, le.customer_id 
        ORDER BY le.transaction_date ASC, le.created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance,
    le.created_at
FROM ledger_entries le;

-- 6. DUE DATE NOTIFICATION TRIGGER / FUNCTION
-- Triggers a notification when a sale with a due date is recorded
CREATE OR REPLACE FUNCTION trigger_notify_sale_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_name VARCHAR(255);
    v_msg TEXT;
BEGIN
    IF NEW.due_date IS NOT NULL THEN
        SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;

        v_msg := CONCAT(
            'Payment reminder: Sale Invoice #', NEW.invoice_no, 
            ' for ', v_customer_name, ' of PKR ', TO_CHAR(NEW.total_amount, 'FM999,999,990.00'), 
            ' is due on ', TO_CHAR(NEW.due_date, 'YYYY-MM-DD'), '.'
        );

        INSERT INTO notifications (
            tenant_id,
            recipient_profile_id,
            title,
            message,
            type,
            channel,
            metadata
        ) VALUES (
            NEW.tenant_id,
            NEW.created_by,
            'Customer Due Date Reminder',
            v_msg,
            'customer_due_reminder',
            'in_app',
            jsonb_build_object(
                'sale_id', NEW.id,
                'customer_id', NEW.customer_id,
                'invoice_no', NEW.invoice_no,
                'due_date', NEW.due_date,
                'amount', NEW.total_amount,
                'whatsapp_integration_note', 'Future hook for WhatsApp API due reminder dispatch'
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_sale_due_date ON customer_sales;
CREATE TRIGGER trg_notify_sale_due_date
    AFTER INSERT ON customer_sales
    FOR EACH ROW
    EXECUTE FUNCTION trigger_notify_sale_due_date();

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

-- Customers RLS Policies
DROP POLICY IF EXISTS "Tenant users can view customers" ON customers;
CREATE POLICY "Tenant users can view customers" ON customers
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff can manage customers" ON customers;
CREATE POLICY "Tenant staff can manage customers" ON customers
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Customer Sales RLS Policies
DROP POLICY IF EXISTS "Tenant users can view customer sales" ON customer_sales;
CREATE POLICY "Tenant users can view customer sales" ON customer_sales
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff can manage customer sales" ON customer_sales;
CREATE POLICY "Tenant staff can manage customer sales" ON customer_sales
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Customer Payments RLS Policies
DROP POLICY IF EXISTS "Tenant users can view customer payments" ON customer_payments;
CREATE POLICY "Tenant users can view customer payments" ON customer_payments
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff can manage customer payments" ON customer_payments;
CREATE POLICY "Tenant staff can manage customer payments" ON customer_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- 8. STORED RPC FUNCTIONS

-- Helper function to record a customer sale
CREATE OR REPLACE FUNCTION record_customer_sale(
    p_customer_id UUID,
    p_invoice_no VARCHAR(100),
    p_total_amount NUMERIC(12, 2),
    p_production_order_id UUID DEFAULT NULL,
    p_due_date DATE DEFAULT NULL,
    p_sale_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_sale_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO customer_sales (
        tenant_id, customer_id, production_order_id, invoice_no,
        sale_date, due_date, total_amount, notes, created_by
    ) VALUES (
        v_tenant_id, p_customer_id, p_production_order_id, p_invoice_no,
        p_sale_date, p_due_date, p_total_amount, p_notes, auth.uid()
    )
    RETURNING id INTO v_sale_id;

    RETURN v_sale_id;
END;
$$;

-- Helper function to record a customer payment
CREATE OR REPLACE FUNCTION record_customer_payment(
    p_customer_id UUID,
    p_amount NUMERIC(12, 2),
    p_method payment_method DEFAULT 'cash',
    p_sale_id UUID DEFAULT NULL,
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

    INSERT INTO customer_payments (
        tenant_id, customer_id, sale_id, amount,
        payment_date, method, reference_no, notes, created_by
    ) VALUES (
        v_tenant_id, p_customer_id, p_sale_id, p_amount,
        p_payment_date, p_method, p_reference_no, p_notes, auth.uid()
    )
    RETURNING id INTO v_payment_id;

    RETURN v_payment_id;
END;
$$;
