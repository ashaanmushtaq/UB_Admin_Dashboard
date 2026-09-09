-- ============================================================================
-- Super Admin Platform Role, Tenant Subscriptions, and Expiry Enforcement
-- ============================================================================

-- 1. Create platform_admins table for Super Admin identity (completely outside any tenant)
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'super_admin',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on platform_admins
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. Function to check if caller is an active platform super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_admins
        WHERE id = auth.uid() AND is_active = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;

-- Policy on platform_admins: Super admins can read platform admin records
DROP POLICY IF EXISTS "Super admins view platform admins" ON public.platform_admins;
CREATE POLICY "Super admins view platform admins" ON public.platform_admins
    FOR SELECT TO authenticated
    USING (is_super_admin());

-- 3. Add subscription tracking columns to public.tenants
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) NOT NULL DEFAULT 'trial',
    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days');

-- Add check constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_plan_type_check') THEN
        ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_type_check CHECK (plan_type IN ('trial', 'premium'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_subscription_status_check') THEN
        ALTER TABLE public.tenants ADD CONSTRAINT tenants_subscription_status_check CHECK (subscription_status IN ('active', 'suspended', 'expired'));
    END IF;
END $$;

-- 4. Update get_current_tenant_id() to enforce live suspension & expiry
-- If a tenant is suspended or expired, this returns NULL immediately,
-- blocking ALL tenant business data queries across the entire database engine.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.tenant_id
    FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND t.is_active = true
      AND t.subscription_status = 'active'
      AND t.subscription_end_date > now()
    LIMIT 1;
$$;

-- 5. Update RLS policies on public.tenants
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can view all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admins can insert tenants" ON public.tenants;

-- Super admins can view all tenants; Tenant members can view their own tenant (even if suspended/expired so UI can show message)
CREATE POLICY "Users can view their own tenant" ON public.tenants
    FOR SELECT TO authenticated
    USING (
        is_super_admin()
        OR id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Super admins can update tenants" ON public.tenants
    FOR UPDATE TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can insert tenants" ON public.tenants
    FOR INSERT TO authenticated
    WITH CHECK (is_super_admin());

-- 6. RPC: List all tenants for Super Admin Dashboard
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
    owner_email VARCHAR(255)
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
        COALESCE(p.full_name, 'Unknown') AS owner_name,
        COALESCE(u.email::VARCHAR(255), 'N/A') AS owner_email
    FROM public.tenants t
    LEFT JOIN LATERAL (
        SELECT prof.id, prof.full_name
        FROM public.profiles prof
        WHERE prof.tenant_id = t.id AND prof.role = 'owner'
        ORDER BY prof.created_at ASC
        LIMIT 1
    ) p ON true
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;

-- 7. RPC: Super Admin suspend/reactivate/extend tenant
CREATE OR REPLACE FUNCTION public.admin_update_tenant_subscription(
    p_tenant_id UUID,
    p_status VARCHAR(50),
    p_extend_days INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant RECORD;
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: Super Admin role required';
    END IF;

    IF p_status NOT IN ('active', 'suspended', 'expired') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;

    UPDATE public.tenants
    SET 
        subscription_status = p_status,
        subscription_end_date = CASE 
            WHEN p_extend_days IS NOT NULL AND p_extend_days > 0 
                THEN GREATEST(now(), subscription_end_date) + (p_extend_days || ' days')::INTERVAL
            ELSE subscription_end_date
        END,
        updated_at = now()
    WHERE id = p_tenant_id
    RETURNING id, name, subscription_status, subscription_end_date INTO v_tenant;

    IF v_tenant.id IS NULL THEN
        RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant.id,
        'name', v_tenant.name,
        'status', v_tenant.subscription_status,
        'end_date', v_tenant.subscription_end_date
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_tenant_subscription(UUID, VARCHAR, INT) TO authenticated;

-- 8. RPC: Client-side tenant subscription query for banner / suspended view
CREATE OR REPLACE FUNCTION public.get_tenant_subscription(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
    v_is_allowed BOOLEAN := false;
BEGIN
    -- Allowed if super admin OR user belongs to this tenant
    IF is_super_admin() THEN
        v_is_allowed := true;
    ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tenant_id = p_tenant_id) THEN
        v_is_allowed := true;
    END IF;

    IF NOT v_is_allowed THEN
        RETURN jsonb_build_object('allowed', false);
    END IF;

    SELECT 
        id,
        name,
        plan_type,
        subscription_status,
        subscription_end_date,
        (is_active AND subscription_status = 'active' AND subscription_end_date > now()) AS is_effective_active
    INTO v_rec
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_rec.id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'id', v_rec.id,
        'name', v_rec.name,
        'plan_type', v_rec.plan_type,
        'subscription_status', v_rec.subscription_status,
        'subscription_end_date', v_rec.subscription_end_date,
        'is_effective_active', v_rec.is_effective_active
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_subscription(UUID) TO authenticated;
