-- ============================================================================
-- Module 8: Staff Attendance Tracking Migration Script
-- Multi-tenant Garments Wholesale ERP (Gents Suits Business)
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    clock_in TIMESTAMPTZ DEFAULT now() NOT NULL,
    clock_out TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'present', -- 'present', 'half_day', 'absent', 'on_leave'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_tenant ON staff_attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_emp ON staff_attendance(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(tenant_id, attendance_date);

-- RLS POLICIES
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can view staff attendance" ON staff_attendance;
CREATE POLICY "Tenant users can view staff attendance" ON staff_attendance
    FOR SELECT TO authenticated USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Staff can insert attendance" ON staff_attendance;
CREATE POLICY "Staff can insert attendance" ON staff_attendance
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- RPC to Clock In
CREATE OR REPLACE FUNCTION clock_in_staff(
    p_employee_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_att_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    INSERT INTO staff_attendance (
        tenant_id, employee_id, attendance_date, clock_in, notes
    ) VALUES (
        v_tenant_id, p_employee_id, CURRENT_DATE, now(), p_notes
    )
    RETURNING id INTO v_att_id;

    RETURN v_att_id;
END;
$$;

-- RPC to Clock Out
CREATE OR REPLACE FUNCTION clock_out_staff(
    p_attendance_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant authorization failed';
    END IF;

    UPDATE staff_attendance
    SET clock_out = now()
    WHERE id = p_attendance_id AND tenant_id = v_tenant_id;

    RETURN true;
END;
$$;
