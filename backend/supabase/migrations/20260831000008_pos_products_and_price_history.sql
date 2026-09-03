-- ============================================================================
-- Module 9 & 10: POS Products, Customer Price History & Installment Payment Plans
-- ============================================================================

-- 1. POS PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS pos_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    size_category size_category NOT NULL DEFAULT 'adult',
    size_code VARCHAR(20) NOT NULL DEFAULT 'M',
    color VARCHAR(50) NOT NULL DEFAULT 'Navy Blue',
    fabric_type standard_fabric_type NOT NULL DEFAULT 'washing_wear',
    default_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    barcode VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_products_tenant ON pos_products(tenant_id);

-- 2. CUSTOMER PRODUCT PRICE HISTORY TABLE
CREATE TABLE IF NOT EXISTS customer_product_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    customer_name VARCHAR(255),
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    price_charged NUMERIC(12, 2) NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 1,
    invoice_no VARCHAR(100),
    sale_id UUID REFERENCES customer_sales(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cust_prod_history_tenant ON customer_product_price_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cust_prod_history_cust ON customer_product_price_history(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_prod_history_prod ON customer_product_price_history(tenant_id, customer_id, product_id);

-- 3. CUSTOMER PAYMENT PLANS TABLE (Installments / Cheques / Settlement Plans)
CREATE TABLE IF NOT EXISTS customer_payment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES customer_sales(id) ON DELETE CASCADE,
    invoice_no VARCHAR(100) NOT NULL,
    installment_no INTEGER NOT NULL DEFAULT 1,
    total_installments INTEGER NOT NULL DEFAULT 1,
    amount_due NUMERIC(12, 2) NOT NULL CHECK (amount_due > 0),
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    due_date DATE NOT NULL,
    payment_method payment_method NOT NULL DEFAULT 'cash',
    cheque_no VARCHAR(100),
    cheque_clearing_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'planned', -- 'planned' | 'received' | 'overdue' | 'cancelled'
    received_at TIMESTAMPTZ,
    payment_id UUID REFERENCES customer_payments(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_tenant ON customer_payment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_cust ON customer_payment_plans(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_sale ON customer_payment_plans(tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_due ON customer_payment_plans(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payment_plans_cheque ON customer_payment_plans(tenant_id, cheque_clearing_date);

-- 4. RLS POLICIES
ALTER TABLE pos_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant staff manage pos_products" ON pos_products;
CREATE POLICY "Tenant staff manage pos_products" ON pos_products
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff manage customer_product_price_history" ON customer_product_price_history;
CREATE POLICY "Tenant staff manage customer_product_price_history" ON customer_product_price_history
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff manage customer_payment_plans" ON customer_payment_plans;
CREATE POLICY "Tenant staff manage customer_payment_plans" ON customer_payment_plans
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- 5. AUTOMATIC TENANT_ID TRIGGERS
DROP TRIGGER IF EXISTS trg_set_tenant_id_pos_products ON pos_products;
CREATE TRIGGER trg_set_tenant_id_pos_products BEFORE INSERT ON pos_products FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_customer_product_price_history ON customer_product_price_history;
CREATE TRIGGER trg_set_tenant_id_customer_product_price_history BEFORE INSERT ON customer_product_price_history FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_customer_payment_plans ON customer_payment_plans;
CREATE TRIGGER trg_set_tenant_id_customer_payment_plans BEFORE INSERT ON customer_payment_plans FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

-- 6. TRIGGER FUNCTION: NOTIFICATIONS FOR UPCOMING INSTALLMENTS AND CHEQUES
CREATE OR REPLACE FUNCTION trigger_notify_payment_plan_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_name VARCHAR(255);
    v_msg TEXT;
    v_title TEXT;
    v_type TEXT;
BEGIN
    SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;

    -- Case A: Cheque Clearing Notification
    IF NEW.payment_method = 'cheque' AND NEW.cheque_clearing_date IS NOT NULL THEN
        v_title := 'Cheque Deposit & Clearing Reminder';
        v_type := 'cheque_clearing_reminder';
        v_msg := CONCAT(
            'Cheque Reminder: Cheque #', COALESCE(NEW.cheque_no, 'N/A'), 
            ' from ', v_customer_name, ' for PKR ', TO_CHAR(NEW.amount_due, 'FM999,999,990.00'), 
            ' is set for clearing on ', TO_CHAR(NEW.cheque_clearing_date, 'YYYY-MM-DD'), '.'
        );

        INSERT INTO notifications (
            tenant_id, title, message, type, channel, metadata
        ) VALUES (
            NEW.tenant_id, v_title, v_msg, v_type, 'in_app',
            jsonb_build_object(
                'plan_id', NEW.id,
                'customer_id', NEW.customer_id,
                'invoice_no', NEW.invoice_no,
                'cheque_no', NEW.cheque_no,
                'clearing_date', NEW.cheque_clearing_date,
                'amount', NEW.amount_due
            )
        );
    END IF;

    -- Case B: Installment Due Date Notification
    IF NEW.due_date IS NOT NULL THEN
        v_title := 'Installment Payment Reminder';
        v_type := 'installment_due_reminder';
        v_msg := CONCAT(
            'Installment #', NEW.installment_no, ' of ', NEW.total_installments, 
            ' for ', v_customer_name, ' (Invoice #', NEW.invoice_no, ') of PKR ', 
            TO_CHAR(NEW.amount_due, 'FM999,999,990.00'), ' is due on ', TO_CHAR(NEW.due_date, 'YYYY-MM-DD'), '.'
        );

        INSERT INTO notifications (
            tenant_id, title, message, type, channel, metadata
        ) VALUES (
            NEW.tenant_id, v_title, v_msg, v_type, 'in_app',
            jsonb_build_object(
                'plan_id', NEW.id,
                'customer_id', NEW.customer_id,
                'invoice_no', NEW.invoice_no,
                'installment_no', NEW.installment_no,
                'due_date', NEW.due_date,
                'amount', NEW.amount_due
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_plan_due ON customer_payment_plans;
CREATE TRIGGER trg_notify_payment_plan_due
    AFTER INSERT ON customer_payment_plans
    FOR EACH ROW
    EXECUTE FUNCTION trigger_notify_payment_plan_due();
