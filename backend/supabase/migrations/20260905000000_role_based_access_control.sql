-- Role-based access control hardening.
-- RLS is the source of truth; the dashboard only mirrors these permissions.

CREATE OR REPLACE FUNCTION current_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION can_view_production_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM production_orders po
        WHERE po.id = p_order_id
          AND po.tenant_id = get_current_tenant_id()
          AND (
              get_current_user_role() IN ('owner', 'cutting_master')
              OR (get_current_user_role() = 'shop_staff' AND po.created_by = auth.uid())
              OR EXISTS (
                  SELECT 1
                  FROM order_stage_logs osl
                  JOIN employees e ON e.id = osl.assigned_employee_id
                  WHERE osl.order_id = po.id
                    AND e.user_id = auth.uid()
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION can_edit_production_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM production_orders
        WHERE id = p_order_id
          AND tenant_id = get_current_tenant_id()
          AND get_current_user_role() IN ('owner', 'cutting_master')
    );
$$;

-- Remove every broad policy introduced by the foundation/module migrations.
DROP POLICY IF EXISTS "Tenant users can view categories" ON product_categories;

DROP POLICY IF EXISTS "Owners and shop staff can manage categories" ON product_categories;

DROP POLICY IF EXISTS "Tenant users can view products" ON products;

DROP POLICY IF EXISTS "Owners and shop staff can manage products" ON products;

DROP POLICY IF EXISTS "Tenant users can view product variants" ON product_variants;

DROP POLICY IF EXISTS "Owners and shop staff can manage product variants" ON product_variants;

DROP POLICY IF EXISTS "Tenant users can view suppliers" ON suppliers;

DROP POLICY IF EXISTS "Owners and shop staff can manage suppliers" ON suppliers;

DROP POLICY IF EXISTS "Tenant users manage suppliers" ON suppliers;

DROP POLICY IF EXISTS "Tenant users can view fabric purchases" ON fabric_purchases;

DROP POLICY IF EXISTS "Owners, shop staff, cutting masters can record fabric purchases" ON fabric_purchases;

DROP POLICY IF EXISTS "Tenant users manage fabric purchases" ON fabric_purchases;

DROP POLICY IF EXISTS "Tenant users can view supplier payments" ON supplier_payments;

DROP POLICY IF EXISTS "Owners and shop staff can manage supplier payments" ON supplier_payments;

DROP POLICY IF EXISTS "Tenant users manage supplier payments" ON supplier_payments;

DROP POLICY IF EXISTS "Tenant users can view employees" ON employees;

DROP POLICY IF EXISTS "Owners and shop staff can manage employees" ON employees;

DROP POLICY IF EXISTS "Tenant users manage employees" ON employees;

DROP POLICY IF EXISTS "Tenant users can view earnings" ON employee_earnings;

DROP POLICY IF EXISTS "Owners, shop staff, cutting masters can record earnings" ON employee_earnings;

DROP POLICY IF EXISTS "Tenant users manage employee earnings" ON employee_earnings;

DROP POLICY IF EXISTS "Tenant users can view employee payments" ON employee_payments;

DROP POLICY IF EXISTS "Owners and shop staff can record employee payments" ON employee_payments;

DROP POLICY IF EXISTS "Tenant users manage employee payments" ON employee_payments;

DROP POLICY IF EXISTS "Tenant users can view production orders" ON production_orders;

DROP POLICY IF EXISTS "Owners, shop staff, and production staff can manage orders" ON production_orders;

DROP POLICY IF EXISTS "Tenant users manage production orders" ON production_orders;

DROP POLICY IF EXISTS "Tenant users can view order fabric links" ON order_fabric_links;

DROP POLICY IF EXISTS "Tenant staff can manage order fabric links" ON order_fabric_links;

DROP POLICY IF EXISTS "Tenant users manage order fabric links" ON order_fabric_links;

DROP POLICY IF EXISTS "Tenant users can view order stage logs" ON order_stage_logs;

DROP POLICY IF EXISTS "Tenant staff can manage order stage logs" ON order_stage_logs;

DROP POLICY IF EXISTS "Tenant users manage order stage logs" ON order_stage_logs;

DROP POLICY IF EXISTS "Tenant users can view customers" ON customers;

DROP POLICY IF EXISTS "Tenant staff can manage customers" ON customers;

DROP POLICY IF EXISTS "Tenant users manage customers" ON customers;

DROP POLICY IF EXISTS "Tenant users can view customer sales" ON customer_sales;

DROP POLICY IF EXISTS "Tenant staff can manage customer sales" ON customer_sales;

DROP POLICY IF EXISTS "Tenant users manage customer sales" ON customer_sales;

DROP POLICY IF EXISTS "Tenant users can view customer payments" ON customer_payments;

DROP POLICY IF EXISTS "Tenant staff can manage customer payments" ON customer_payments;

DROP POLICY IF EXISTS "Tenant users manage customer payments" ON customer_payments;

DROP POLICY IF EXISTS "Tenant users can view staff attendance" ON staff_attendance;

DROP POLICY IF EXISTS "Staff can insert attendance" ON staff_attendance;

DROP POLICY IF EXISTS "Tenant staff manage pos_products" ON pos_products;

DROP POLICY IF EXISTS "Tenant staff manage customer_product_price_history" ON customer_product_price_history;

DROP POLICY IF EXISTS "Tenant staff manage customer_payment_plans" ON customer_payment_plans;

DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON profiles;

CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() AND tenant_id = get_current_tenant_id());

CREATE POLICY "Owners can view tenant profiles" ON profiles
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

-- Catalog: only owner and shop staff can use the catalog.
CREATE POLICY "Owner and shop staff read categories" ON product_categories
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage categories" ON product_categories
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff read products" ON products
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage products" ON products
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff read variants" ON product_variants
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage variants" ON product_variants
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Fabric and supplier ledger: owner only. Cutting masters can see only purchases they recorded.
CREATE POLICY "Owner manages suppliers" ON suppliers
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Cutting master reads own purchase suppliers" ON suppliers
    FOR SELECT TO authenticated
    USING (
        tenant_id = get_current_tenant_id()
        AND get_current_user_role() = 'cutting_master'
        AND EXISTS (
            SELECT 1 FROM fabric_purchases fp
            WHERE fp.supplier_id = suppliers.id AND fp.created_by = auth.uid()
        )
    );

CREATE POLICY "Owner manages fabric purchases" ON fabric_purchases
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Cutting master reads own fabric purchases" ON fabric_purchases
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'cutting_master' AND created_by = auth.uid());

CREATE POLICY "Owner manages supplier payments" ON supplier_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

-- Employee records and wages: owner-wide, every other role own employee record only.
CREATE POLICY "Owner manages employees" ON employees
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Staff reads own employee record" ON employees
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Owner manages earnings" ON employee_earnings
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Staff reads own earnings" ON employee_earnings
    FOR SELECT TO authenticated
    USING (
        tenant_id = get_current_tenant_id()
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    );

CREATE POLICY "Owner manages payments" ON employee_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Staff reads own payments" ON employee_payments
    FOR SELECT TO authenticated
    USING (
        tenant_id = get_current_tenant_id()
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    );

-- Production: owner and cutting master coordinate all work. Shop staff can view orders they created;
-- assigned production staff can view their assigned orders and logs.
CREATE POLICY "Authorized users read production orders" ON production_orders
    FOR SELECT TO authenticated
    USING (can_view_production_order(id));

CREATE POLICY "Production leads manage orders" ON production_orders
    FOR ALL TO authenticated
    USING (can_edit_production_order(id))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'cutting_master'));

CREATE POLICY "Authorized users read fabric links" ON order_fabric_links
    FOR SELECT TO authenticated
    USING (can_view_production_order(order_id));

CREATE POLICY "Production leads manage fabric links" ON order_fabric_links
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'cutting_master'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'cutting_master'));

CREATE POLICY "Authorized users read stage logs" ON order_stage_logs
    FOR SELECT TO authenticated
    USING (can_view_production_order(order_id));

CREATE POLICY "Production leads manage stage logs" ON order_stage_logs
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'cutting_master'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'cutting_master'));

CREATE POLICY "Assigned staff update stage logs" ON order_stage_logs
    FOR UPDATE TO authenticated
    USING (
        tenant_id = get_current_tenant_id()
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = assigned_employee_id AND e.user_id = auth.uid())
    )
    WITH CHECK (
        tenant_id = get_current_tenant_id()
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = assigned_employee_id AND e.user_id = auth.uid())
    );

-- Customer ledger: owner/shop staff only. Drivers use the restricted view below.
CREATE POLICY "Owner and shop staff read customers" ON customers
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage customers" ON customers
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff read sales" ON customer_sales
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage sales" ON customer_sales
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff read customer payments" ON customer_payments
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage customer payments" ON customer_payments
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Attendance and notifications are personal for staff, tenant-wide for owner.
CREATE POLICY "Owner reads all attendance" ON staff_attendance
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Staff reads own attendance" ON staff_attendance
    FOR SELECT TO authenticated
    USING (
        tenant_id = get_current_tenant_id()
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    );

CREATE POLICY "Owner manages attendance" ON staff_attendance
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Staff manages own attendance" ON staff_attendance
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = get_current_tenant_id()
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    );

CREATE POLICY "Staff updates own attendance" ON staff_attendance
    FOR UPDATE TO authenticated
    USING (tenant_id = get_current_tenant_id() AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.user_id = auth.uid()))
    WITH CHECK (tenant_id = get_current_tenant_id() AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));

CREATE POLICY "Owner reads all notifications" ON notifications
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

CREATE POLICY "Users read own notifications" ON notifications
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id() AND (recipient_profile_id = auth.uid() OR recipient_employee_id = current_employee_id()));

-- POS extension tables follow the customer/catalog rules.
CREATE POLICY "Owner and shop staff manage POS products" ON pos_products
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage customer price history" ON customer_product_price_history
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

CREATE POLICY "Owner and shop staff manage payment plans" ON customer_payment_plans
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Views must invoke the caller's RLS policies; otherwise a view owner can bypass them.
ALTER VIEW v_fabric_purchase_summaries SET (security_invoker = true);

ALTER VIEW v_supplier_balances SET (security_invoker = true);

ALTER VIEW v_supplier_ledger SET (security_invoker = true);

ALTER VIEW v_employee_balances SET (security_invoker = true);

ALTER VIEW v_employee_ledger SET (security_invoker = true);

ALTER VIEW v_production_order_summaries SET (security_invoker = true);

ALTER VIEW v_order_stage_history SET (security_invoker = true);

ALTER VIEW v_order_fabric_usage SET (security_invoker = true);

ALTER VIEW v_customer_balances SET (security_invoker = true);

ALTER VIEW v_customer_ledger SET (security_invoker = true);

DROP VIEW IF EXISTS v_driver_delivery_contacts;

CREATE VIEW v_driver_delivery_contacts
WITH (security_barrier = true)
AS
SELECT DISTINCT
    po.id AS order_id,
    po.order_number,
    c.name AS customer_name,
    c.address,
    c.phone,
    po.target_delivery_date,
    po.current_stage
FROM production_orders po
JOIN customer_sales cs ON cs.production_order_id = po.id
JOIN customers c ON c.id = cs.customer_id
JOIN order_stage_logs osl ON osl.order_id = po.id AND osl.stage = 'ready_for_dispatch'
JOIN employees e ON e.id = osl.assigned_employee_id
WHERE e.user_id = auth.uid()
  AND e.role = 'driver';

GRANT SELECT ON v_driver_delivery_contacts TO authenticated;

-- RPCs must execute as the caller so the policies above apply to inserts/updates.
ALTER FUNCTION record_fabric_purchase(UUID, VARCHAR, standard_fabric_type, NUMERIC, NUMERIC, VARCHAR, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION record_supplier_payment(UUID, NUMERIC, payment_method, UUID, VARCHAR, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION record_employee_earning(UUID, NUMERIC, VARCHAR, NUMERIC, NUMERIC, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION record_employee_payment(UUID, NUMERIC, VARCHAR, payment_method, VARCHAR, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION create_production_order(VARCHAR, VARCHAR, VARCHAR, VARCHAR, INT, BOOLEAN, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION advance_order_stage(UUID, production_stage, UUID, INT, TEXT) SECURITY INVOKER;

ALTER FUNCTION link_order_fabric(UUID, UUID, NUMERIC, TEXT) SECURITY INVOKER;

ALTER FUNCTION record_customer_sale(UUID, VARCHAR, NUMERIC, UUID, DATE, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION record_customer_payment(UUID, NUMERIC, payment_method, UUID, VARCHAR, DATE, TEXT) SECURITY INVOKER;

ALTER FUNCTION clock_in_staff(UUID, TEXT) SECURITY INVOKER;

ALTER FUNCTION clock_out_staff(UUID) SECURITY INVOKER;
