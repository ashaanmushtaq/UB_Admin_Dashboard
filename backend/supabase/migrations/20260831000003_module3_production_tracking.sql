-- ============================================================================
-- Module 3: Production Stage Tracking Migration Script
-- Multi-tenant Garments Wholesale ERP (Gents Suits Business)
-- ============================================================================

-- 1. ENUM FOR PRODUCTION STAGES
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_stage') THEN
        CREATE TYPE production_stage AS ENUM (
            'order_received',
            'cutting',
            'tailoring',
            'ironing',
            'kaj_overlock',
            'packing',
            'ready_for_dispatch',
            'delivered'
        );
    END IF;
END $$;

-- 2. PRODUCTION ORDERS TABLE
CREATE TABLE IF NOT EXISTS production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    suit_type VARCHAR(100) DEFAULT '2-Piece Suit', -- '2-Piece Suit', '3-Piece Suit', 'Sherwani', 'Kurta Pajama'
    total_quantity INT NOT NULL CHECK (total_quantity > 0),
    current_stage production_stage NOT NULL DEFAULT 'order_received',
    is_urgent BOOLEAN DEFAULT false NOT NULL,
    target_delivery_date DATE,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_production_orders_tenant_num UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_production_orders_tenant ON production_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_stage ON production_orders(tenant_id, current_stage);

-- 3. ORDER FABRIC LINKS (Fabric consumption tracking per order)
CREATE TABLE IF NOT EXISTS order_fabric_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    fabric_purchase_id UUID NOT NULL REFERENCES fabric_purchases(id) ON DELETE RESTRICT,
    meters_used NUMERIC(12, 2) NOT NULL CHECK (meters_used > 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_fabric_links_tenant ON order_fabric_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_fabric_links_order ON order_fabric_links(tenant_id, order_id);

-- 4. ORDER STAGE LOGS (Stage transition history & employee assignment)
CREATE TABLE IF NOT EXISTS order_stage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    stage production_stage NOT NULL,
    assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at TIMESTAMPTZ,
    quantity_in INT NOT NULL CHECK (quantity_in >= 0),
    quantity_completed INT DEFAULT 0 CHECK (quantity_completed >= 0),
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_stage_logs_tenant ON order_stage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_stage_logs_order ON order_stage_logs(tenant_id, order_id);

-- 5. UPDATED_AT TRIGGERS
DROP TRIGGER IF EXISTS set_production_orders_updated_at ON production_orders;
CREATE TRIGGER set_production_orders_updated_at BEFORE UPDATE ON production_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_order_stage_logs_updated_at ON order_stage_logs;
CREATE TRIGGER set_order_stage_logs_updated_at BEFORE UPDATE ON order_stage_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. VIEWS FOR ORDER SUMMARY & STAGE TIMELINES

-- View: Production Order Summaries (Order details + fabric meters + progress)
CREATE OR REPLACE VIEW v_production_order_summaries AS
SELECT 
    po.id AS order_id,
    po.tenant_id,
    po.order_number,
    po.customer_name,
    po.customer_phone,
    po.suit_type,
    po.total_quantity,
    po.current_stage,
    po.is_urgent,
    po.target_delivery_date,
    po.notes,
    COALESCE(fl.total_meters_used, 0) AS total_meters_used,
    po.created_at,
    po.updated_at
FROM production_orders po
LEFT JOIN (
    SELECT order_id, SUM(meters_used) AS total_meters_used
    FROM order_fabric_links
    GROUP BY order_id
) fl ON fl.order_id = po.id;

-- View: Detailed Stage History per Order
CREATE OR REPLACE VIEW v_order_stage_history AS
SELECT 
    osl.id AS log_id,
    osl.tenant_id,
    osl.order_id,
    osl.stage,
    osl.assigned_employee_id,
    e.full_name AS assigned_employee_name,
    e.role AS assigned_employee_role,
    osl.started_at,
    osl.completed_at,
    osl.quantity_in,
    osl.quantity_completed,
    (osl.quantity_in - osl.quantity_completed) AS quantity_pending,
    osl.notes,
    osl.created_at
FROM order_stage_logs osl
LEFT JOIN employees e ON e.id = osl.assigned_employee_id;

-- View: Order Fabric Usage Details
CREATE OR REPLACE VIEW v_order_fabric_usage AS
SELECT 
    ofl.id AS link_id,
    ofl.tenant_id,
    ofl.order_id,
    ofl.fabric_purchase_id,
    fp.fabric_name,
    fp.fabric_type,
    s.name AS supplier_name,
    fp.invoice_no,
    ofl.meters_used,
    ofl.notes,
    ofl.created_at
FROM order_fabric_links ofl
JOIN fabric_purchases fp ON fp.id = ofl.fabric_purchase_id
JOIN suppliers s ON s.id = fp.supplier_id;

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_fabric_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_stage_logs ENABLE ROW LEVEL SECURITY;

-- Production Orders Policies
DROP POLICY IF EXISTS "Tenant users can view production orders" ON production_orders;
CREATE POLICY "Tenant users can view production orders" ON production_orders
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners, shop staff, and production staff can manage orders" ON production_orders;
CREATE POLICY "Owners, shop staff, and production staff can manage orders" ON production_orders
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Order Fabric Links Policies
DROP POLICY IF EXISTS "Tenant users can view order fabric links" ON order_fabric_links;
CREATE POLICY "Tenant users can view order fabric links" ON order_fabric_links
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff can manage order fabric links" ON order_fabric_links;
CREATE POLICY "Tenant staff can manage order fabric links" ON order_fabric_links
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Order Stage Logs Policies
DROP POLICY IF EXISTS "Tenant users can view order stage logs" ON order_stage_logs;
CREATE POLICY "Tenant users can view order stage logs" ON order_stage_logs
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant staff can manage order stage logs" ON order_stage_logs;
CREATE POLICY "Tenant staff can manage order stage logs" ON order_stage_logs
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- 8. STORED RPC FUNCTIONS

-- Helper function to create a new production order and automatically initialize the first stage log
CREATE OR REPLACE FUNCTION create_production_order(
    p_order_number VARCHAR(100),
    p_customer_name VARCHAR(255),
    p_customer_phone VARCHAR(50) DEFAULT NULL,
    p_suit_type VARCHAR(100) DEFAULT '2-Piece Suit',
    p_total_quantity INT DEFAULT 1,
    p_is_urgent BOOLEAN DEFAULT false,
    p_target_delivery_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_order_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO production_orders (
        tenant_id, order_number, customer_name, customer_phone,
        suit_type, total_quantity, current_stage, is_urgent,
        target_delivery_date, notes, created_by
    ) VALUES (
        v_tenant_id, p_order_number, p_customer_name, p_customer_phone,
        p_suit_type, p_total_quantity, 'order_received', p_is_urgent,
        p_target_delivery_date, p_notes, auth.uid()
    )
    RETURNING id INTO v_order_id;

    -- Create initial stage log for order_received
    INSERT INTO order_stage_logs (
        tenant_id, order_id, stage, started_at, quantity_in, created_by
    ) VALUES (
        v_tenant_id, v_order_id, 'order_received', now(), p_total_quantity, auth.uid()
    );

    RETURN v_order_id;
END;
$$;

-- Helper function to transition an order to a new stage
CREATE OR REPLACE FUNCTION advance_order_stage(
    p_order_id UUID,
    p_next_stage production_stage,
    p_assigned_employee_id UUID DEFAULT NULL,
    p_quantity_in INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_order_qty INT;
    v_new_log_id UUID;
    v_qty_in INT;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    -- Get total order quantity
    SELECT total_quantity INTO v_order_qty
    FROM production_orders
    WHERE id = p_order_id AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    v_qty_in := COALESCE(p_quantity_in, v_order_qty);

    -- Complete previous open stage log if exists
    UPDATE order_stage_logs
    SET completed_at = now(),
        quantity_completed = COALESCE(quantity_completed, quantity_in),
        updated_at = now()
    WHERE order_id = p_order_id 
      AND tenant_id = v_tenant_id 
      AND completed_at IS NULL;

    -- Update order current stage
    UPDATE production_orders
    SET current_stage = p_next_stage,
        updated_at = now()
    WHERE id = p_order_id AND tenant_id = v_tenant_id;

    -- Insert new stage log entry
    INSERT INTO order_stage_logs (
        tenant_id, order_id, stage, assigned_employee_id,
        started_at, quantity_in, notes, created_by
    ) VALUES (
        v_tenant_id, p_order_id, p_next_stage, p_assigned_employee_id,
        now(), v_qty_in, p_notes, auth.uid()
    )
    RETURNING id INTO v_new_log_id;

    RETURN v_new_log_id;
END;
$$;

-- Helper function to log fabric consumption for an order
CREATE OR REPLACE FUNCTION link_order_fabric(
    p_order_id UUID,
    p_fabric_purchase_id UUID,
    p_meters_used NUMERIC(12, 2),
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_link_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO order_fabric_links (
        tenant_id, order_id, fabric_purchase_id, meters_used, notes
    ) VALUES (
        v_tenant_id, p_order_id, p_fabric_purchase_id, p_meters_used, p_notes
    )
    RETURNING id INTO v_link_id;

    RETURN v_link_id;
END;
$$;
