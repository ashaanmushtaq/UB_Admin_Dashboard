-- ============================================================================
-- Module 2: Employee Management & Payment/Advance Tracking Migration Script
-- Multi-tenant Garments Wholesale ERP (Gents Suits Business)
-- ============================================================================

-- 1. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    role app_role NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    cnic_id VARCHAR(50),
    address TEXT,
    employment_type VARCHAR(50) NOT NULL DEFAULT 'monthly', -- 'monthly', 'piece_rate', 'daily_wage'
    base_rate NUMERIC(12, 2) DEFAULT 0.00,
    joining_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(tenant_id, role);

-- 2. EMPLOYEE EARNINGS TABLE (Work done / salary postings)
CREATE TABLE IF NOT EXISTS employee_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    earning_date DATE NOT NULL DEFAULT CURRENT_DATE,
    earning_type VARCHAR(50) NOT NULL DEFAULT 'salary', -- 'salary', 'piece_rate', 'overtime', 'bonus', 'allowance'
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    quantity_completed NUMERIC(12, 2) DEFAULT 1,
    rate_per_unit NUMERIC(12, 2) DEFAULT NULL,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_earnings_tenant ON employee_earnings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_earnings_emp ON employee_earnings(tenant_id, employee_id);

-- 3. EMPLOYEE PAYMENTS TABLE (Salary payouts & advances)
CREATE TABLE IF NOT EXISTS employee_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_type VARCHAR(50) NOT NULL DEFAULT 'salary_payout', -- 'salary_payout', 'advance', 'piece_rate_payout', 'bonus_payout', 'reimbursement'
    method payment_method NOT NULL DEFAULT 'cash',
    reference_no VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_payments_tenant ON employee_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_payments_emp ON employee_payments(tenant_id, employee_id);

-- 4. NOTIFICATIONS TABLE (In-app notifications + WhatsApp/SMS metadata hook)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipient_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'employee_payment',
    channel VARCHAR(50) NOT NULL DEFAULT 'in_app', -- 'in_app', 'whatsapp_queued', 'sms_queued'
    is_read BOOLEAN DEFAULT false NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_emp ON notifications(recipient_employee_id);

-- 5. UPDATED_AT TRIGGERS
DROP TRIGGER IF EXISTS set_employees_updated_at ON employees;
CREATE TRIGGER set_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_employee_earnings_updated_at ON employee_earnings;
CREATE TRIGGER set_employee_earnings_updated_at BEFORE UPDATE ON employee_earnings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_employee_payments_updated_at ON employee_payments;
CREATE TRIGGER set_employee_payments_updated_at BEFORE UPDATE ON employee_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. VIEWS FOR EMPLOYEE BALANCES & RUNNING LEDGER

-- View: Employee Balances (Total Earned, Total Paid, Remaining Balance)
CREATE OR REPLACE VIEW v_employee_balances AS
SELECT 
    e.id AS employee_id,
    e.tenant_id,
    e.user_id,
    e.full_name,
    e.role,
    e.phone,
    e.employment_type,
    e.base_rate,
    COALESCE(earn.total_earned, 0) AS total_earned,
    COALESCE(pay.total_paid, 0) AS total_paid,
    (COALESCE(earn.total_earned, 0) - COALESCE(pay.total_paid, 0)) AS remaining_balance
FROM employees e
LEFT JOIN (
    SELECT employee_id, SUM(amount) AS total_earned
    FROM employee_earnings
    GROUP BY employee_id
) earn ON earn.employee_id = e.id
LEFT JOIN (
    SELECT employee_id, SUM(amount) AS total_paid
    FROM employee_payments
    GROUP BY employee_id
) pay ON pay.employee_id = e.id;

-- View: Employee Ledger (Chronological transactions & windowed running balance)
CREATE OR REPLACE VIEW v_employee_ledger AS
WITH ledger_entries AS (
    SELECT 
        ee.id AS transaction_id,
        ee.tenant_id,
        ee.employee_id,
        ee.earning_date AS transaction_date,
        'earning' AS entry_type,
        CONCAT('Earned (', ee.earning_type, '): ', COALESCE(ee.description, 'Work completed')) AS description,
        NULL AS reference_no,
        ee.amount AS debit_amount,
        0.00 AS credit_amount,
        ee.created_at
    FROM employee_earnings ee

    UNION ALL

    SELECT 
        ep.id AS transaction_id,
        ep.tenant_id,
        ep.employee_id,
        ep.payment_date AS transaction_date,
        'payment' AS entry_type,
        CONCAT('Payment (', ep.payment_type, ' via ', ep.method, '): ', COALESCE(ep.notes, 'Payout')) AS description,
        ep.reference_no,
        0.00 AS debit_amount,
        ep.amount AS credit_amount,
        ep.created_at
    FROM employee_payments ep
)
SELECT 
    le.transaction_id,
    le.tenant_id,
    le.employee_id,
    le.transaction_date,
    le.entry_type,
    le.description,
    le.reference_no,
    le.debit_amount,
    le.credit_amount,
    SUM(le.debit_amount - le.credit_amount) OVER (
        PARTITION BY le.tenant_id, le.employee_id 
        ORDER BY le.transaction_date ASC, le.created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance,
    le.created_at
FROM ledger_entries le;

-- 7. NOTIFICATION TRIGGER LOGIC FOR PAYMENTS
CREATE OR REPLACE FUNCTION trigger_notify_employee_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_employee_name VARCHAR(255);
    v_user_id UUID;
    v_total_earned NUMERIC(12,2);
    v_total_paid NUMERIC(12,2);
    v_remaining_balance NUMERIC(12,2);
    v_msg TEXT;
BEGIN
    -- Fetch employee details
    SELECT full_name, user_id INTO v_employee_name, v_user_id
    FROM employees
    WHERE id = NEW.employee_id;

    -- Calculate updated totals
    SELECT COALESCE(SUM(amount), 0) INTO v_total_earned
    FROM employee_earnings WHERE employee_id = NEW.employee_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM employee_payments WHERE employee_id = NEW.employee_id;

    v_remaining_balance := v_total_earned - v_total_paid;

    -- Compose notification message
    v_msg := CONCAT(
        'Payment of PKR ', TO_CHAR(NEW.amount, 'FM999,999,990.00'), 
        ' (', NEW.payment_type, ') received via ', NEW.method, 
        '. Your remaining balance is PKR ', TO_CHAR(v_remaining_balance, 'FM999,999,990.00'), '.'
    );

    -- Insert in-app notification record (with metadata structured for future WhatsApp/SMS dispatch)
    INSERT INTO notifications (
        tenant_id,
        recipient_profile_id,
        recipient_employee_id,
        title,
        message,
        type,
        channel,
        metadata
    ) VALUES (
        NEW.tenant_id,
        v_user_id,
        NEW.employee_id,
        'Payment Received',
        v_msg,
        'employee_payment',
        'in_app',
        jsonb_build_object(
            'payment_id', NEW.id,
            'amount', NEW.amount,
            'payment_type', NEW.payment_type,
            'method', NEW.method,
            'remaining_balance', v_remaining_balance,
            'whatsapp_integration_note', 'Future hook for WhatsApp API dispatch'
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_employee_payment ON employee_payments;
CREATE TRIGGER trg_notify_employee_payment
    AFTER INSERT ON employee_payments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_notify_employee_payment();

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Employees RLS Policies
DROP POLICY IF EXISTS "Tenant users can view employees" ON employees;
CREATE POLICY "Tenant users can view employees" ON employees
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can manage employees" ON employees;
CREATE POLICY "Owners and shop staff can manage employees" ON employees
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Employee Earnings RLS Policies
DROP POLICY IF EXISTS "Tenant users can view earnings" ON employee_earnings;
CREATE POLICY "Tenant users can view earnings" ON employee_earnings
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners, shop staff, cutting masters can record earnings" ON employee_earnings;
CREATE POLICY "Owners, shop staff, cutting masters can record earnings" ON employee_earnings
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff', 'cutting_master'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff', 'cutting_master'));

-- Employee Payments RLS Policies
DROP POLICY IF EXISTS "Tenant users can view employee payments" ON employee_payments;
CREATE POLICY "Tenant users can view employee payments" ON employee_payments
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can record employee payments" ON employee_payments;
CREATE POLICY "Owners and shop staff can record employee payments" ON employee_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Notifications RLS Policies
DROP POLICY IF EXISTS "Users can view their tenant notifications" ON notifications;
CREATE POLICY "Users can view their tenant notifications" ON notifications
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

-- 9. STORED RPC FUNCTIONS

-- Record Employee Earning
CREATE OR REPLACE FUNCTION record_employee_earning(
    p_employee_id UUID,
    p_amount NUMERIC(12,2),
    p_earning_type VARCHAR(50) DEFAULT 'salary',
    p_quantity_completed NUMERIC(12,2) DEFAULT 1,
    p_rate_per_unit NUMERIC(12,2) DEFAULT NULL,
    p_earning_date DATE DEFAULT CURRENT_DATE,
    p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_earning_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO employee_earnings (
        tenant_id, employee_id, earning_date, earning_type,
        amount, quantity_completed, rate_per_unit, description, created_by
    ) VALUES (
        v_tenant_id, p_employee_id, p_earning_date, p_earning_type,
        p_amount, p_quantity_completed, p_rate_per_unit, p_description, auth.uid()
    )
    RETURNING id INTO v_earning_id;

    RETURN v_earning_id;
END;
$$;

-- Record Employee Payment (Fires Notification Trigger)
CREATE OR REPLACE FUNCTION record_employee_payment(
    p_employee_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_type VARCHAR(50) DEFAULT 'salary_payout',
    p_method payment_method DEFAULT 'cash',
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

    INSERT INTO employee_payments (
        tenant_id, employee_id, payment_date, amount,
        payment_type, method, reference_no, notes, created_by
    ) VALUES (
        v_tenant_id, p_employee_id, p_payment_date, p_amount,
        p_payment_type, p_method, p_reference_no, p_notes, auth.uid()
    )
    RETURNING id INTO v_payment_id;

    RETURN v_payment_id;
END;
$$;
