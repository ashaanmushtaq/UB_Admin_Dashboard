-- ============================================================================
-- Fix: Automatic Tenant ID Insertion & Complete RLS Write Policies
-- ============================================================================

-- 1. Trigger Function to automatically populate tenant_id on ALL inserts if not provided
CREATE OR REPLACE FUNCTION set_default_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := get_current_tenant_id();
    END IF;
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed: Session tenant_id is NULL';
    END IF;
    RETURN NEW;
END;
$$;

-- Apply BEFORE INSERT triggers to every business table

DROP TRIGGER IF EXISTS trg_set_tenant_id_suppliers ON suppliers;
CREATE TRIGGER trg_set_tenant_id_suppliers BEFORE INSERT ON suppliers FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_fabric_purchases ON fabric_purchases;
CREATE TRIGGER trg_set_tenant_id_fabric_purchases BEFORE INSERT ON fabric_purchases FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_supplier_payments ON supplier_payments;
CREATE TRIGGER trg_set_tenant_id_supplier_payments BEFORE INSERT ON supplier_payments FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_employees ON employees;
CREATE TRIGGER trg_set_tenant_id_employees BEFORE INSERT ON employees FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_employee_earnings ON employee_earnings;
CREATE TRIGGER trg_set_tenant_id_employee_earnings BEFORE INSERT ON employee_earnings FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_employee_payments ON employee_payments;
CREATE TRIGGER trg_set_tenant_id_employee_payments BEFORE INSERT ON employee_payments FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_production_orders ON production_orders;
CREATE TRIGGER trg_set_tenant_id_production_orders BEFORE INSERT ON production_orders FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_order_stage_logs ON order_stage_logs;
CREATE TRIGGER trg_set_tenant_id_order_stage_logs BEFORE INSERT ON order_stage_logs FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_order_fabric_links ON order_fabric_links;
CREATE TRIGGER trg_set_tenant_id_order_fabric_links BEFORE INSERT ON order_fabric_links FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_customers ON customers;
CREATE TRIGGER trg_set_tenant_id_customers BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_customer_sales ON customer_sales;
CREATE TRIGGER trg_set_tenant_id_customer_sales BEFORE INSERT ON customer_sales FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_customer_payments ON customer_payments;
CREATE TRIGGER trg_set_tenant_id_customer_payments BEFORE INSERT ON customer_payments FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

DROP TRIGGER IF EXISTS trg_set_tenant_id_staff_attendance ON staff_attendance;
CREATE TRIGGER trg_set_tenant_id_staff_attendance BEFORE INSERT ON staff_attendance FOR EACH ROW EXECUTE FUNCTION set_default_tenant_id();

-- 2. ENSURE COMPREHENSIVE RLS POLICIES FOR ALL BUSINESS TABLES

-- Suppliers
DROP POLICY IF EXISTS "Tenant users manage suppliers" ON suppliers;
CREATE POLICY "Tenant users manage suppliers" ON suppliers
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Fabric Purchases
DROP POLICY IF EXISTS "Tenant users manage fabric purchases" ON fabric_purchases;
CREATE POLICY "Tenant users manage fabric purchases" ON fabric_purchases
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Supplier Payments
DROP POLICY IF EXISTS "Tenant users manage supplier payments" ON supplier_payments;
CREATE POLICY "Tenant users manage supplier payments" ON supplier_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Employees
DROP POLICY IF EXISTS "Tenant users manage employees" ON employees;
CREATE POLICY "Tenant users manage employees" ON employees
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Employee Earnings
DROP POLICY IF EXISTS "Tenant users manage employee earnings" ON employee_earnings;
CREATE POLICY "Tenant users manage employee earnings" ON employee_earnings
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Employee Payments
DROP POLICY IF EXISTS "Tenant users manage employee payments" ON employee_payments;
CREATE POLICY "Tenant users manage employee payments" ON employee_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Production Orders
DROP POLICY IF EXISTS "Tenant users manage production orders" ON production_orders;
CREATE POLICY "Tenant users manage production orders" ON production_orders
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Order Stage Logs
DROP POLICY IF EXISTS "Tenant users manage order stage logs" ON order_stage_logs;
CREATE POLICY "Tenant users manage order stage logs" ON order_stage_logs
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Order Fabric Links
DROP POLICY IF EXISTS "Tenant users manage order fabric links" ON order_fabric_links;
CREATE POLICY "Tenant users manage order fabric links" ON order_fabric_links
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Customers
DROP POLICY IF EXISTS "Tenant users manage customers" ON customers;
CREATE POLICY "Tenant users manage customers" ON customers
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Customer Sales
DROP POLICY IF EXISTS "Tenant users manage customer sales" ON customer_sales;
CREATE POLICY "Tenant users manage customer sales" ON customer_sales
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Customer Payments
DROP POLICY IF EXISTS "Tenant users manage customer payments" ON customer_payments;
CREATE POLICY "Tenant users manage customer payments" ON customer_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
