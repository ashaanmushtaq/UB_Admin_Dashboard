-- Migration: 20260909000002_add_tenant_payments_and_details.sql
-- Add owner phone, address, city, notes, and tenant_payments table for tracking payment confirmations.

-- 1. Add city and notes to tenants table (address and phone already exist on tenants & profiles)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Create tenant_payments table
CREATE TABLE IF NOT EXISTS public.tenant_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'cheque', 'other')),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_no VARCHAR(255),
    notes TEXT,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_tenant_payments_tenant_id ON public.tenant_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_payment_date ON public.tenant_payments(payment_date DESC);

-- Enable RLS
ALTER TABLE public.tenant_payments ENABLE ROW LEVEL SECURITY;

-- Super Admin has full access to tenant_payments
DROP POLICY IF EXISTS "Super Admins have full access to tenant_payments" ON public.tenant_payments;
CREATE POLICY "Super Admins have full access to tenant_payments" ON public.tenant_payments
    FOR ALL TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- Tenant members can view their own tenant payments
DROP POLICY IF EXISTS "Tenant members can view own tenant payments" ON public.tenant_payments;
CREATE POLICY "Tenant members can view own tenant payments" ON public.tenant_payments
    FOR SELECT TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- 3. Drop existing admin_list_tenants() to avoid signature collision
DROP FUNCTION IF EXISTS public.admin_list_tenants();

-- Recreate admin_list_tenants RPC with phone, address, city, notes, total_paid, latest_payment_date
CREATE OR REPLACE FUNCTION public.admin_list_tenants()
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    slug VARCHAR(255),
    company_name VARCHAR(255),
    plan_type VARCHAR(50),
    subscription_status VARCHAR(50),
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    is_effective_active BOOLEAN,
    created_at TIMESTAMPTZ,
    owner_id UUID,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    notes TEXT,
    total_paid NUMERIC(12, 2),
    latest_payment_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: Super Admin role required';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.name,
        t.slug,
        t.company_name,
        t.plan_type,
        CASE 
            WHEN t.subscription_status = 'suspended' THEN 'suspended'::VARCHAR(50)
            WHEN t.subscription_end_date <= now() THEN 'expired'::VARCHAR(50)
            ELSE t.subscription_status
        END AS subscription_status,
        t.subscription_start_date,
        t.subscription_end_date,
        (t.is_active AND t.subscription_status = 'active' AND t.subscription_end_date > now()) AS is_effective_active,
        t.created_at,
        p.id AS owner_id,
        COALESCE(p.full_name, 'Unknown')::VARCHAR(255) AS owner_name,
        COALESCE(u.email::VARCHAR(255), 'N/A')::VARCHAR(255) AS owner_email,
        COALESCE(p.phone, t.phone, '')::VARCHAR(50) AS owner_phone,
        t.address,
        t.city,
        t.notes,
        COALESCE(pmt.total_amount, 0)::NUMERIC(12, 2) AS total_paid,
        pmt.latest_date AS latest_payment_date
    FROM public.tenants t
    LEFT JOIN LATERAL (
        SELECT prof.id, prof.full_name, prof.phone
        FROM public.profiles prof
        WHERE prof.tenant_id = t.id AND prof.role = 'owner'
        ORDER BY prof.created_at ASC
        LIMIT 1
    ) p ON true
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
        SELECT 
            SUM(tp.amount) AS total_amount,
            MAX(tp.payment_date) AS latest_date
        FROM public.tenant_payments tp
        WHERE tp.tenant_id = t.id
    ) pmt ON true
    ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;

-- 4. RPC to get payment history for a tenant
CREATE OR REPLACE FUNCTION public.admin_get_tenant_payments(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    amount NUMERIC(12, 2),
    payment_method VARCHAR(50),
    payment_date DATE,
    reference_no VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: Super Admin role required';
    END IF;

    RETURN QUERY
    SELECT 
        tp.id,
        tp.tenant_id,
        tp.amount,
        tp.payment_method,
        tp.payment_date,
        tp.reference_no,
        tp.notes,
        tp.created_at
    FROM public.tenant_payments tp
    WHERE tp.tenant_id = p_tenant_id
    ORDER BY tp.payment_date DESC, tp.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_tenant_payments(UUID) TO authenticated;
