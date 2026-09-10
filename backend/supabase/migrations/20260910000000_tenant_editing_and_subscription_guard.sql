-- Migration: 20260910000000_tenant_editing_and_subscription_guard.sql
-- 1. Database-level trigger preventing tenant owners or any non-super-admins from editing subscription / system fields on public.tenants
-- 2. Update admin_list_tenants() RPC to include display_name

-- 1. Trigger function to guard tenant updates
CREATE OR REPLACE FUNCTION public.guard_tenant_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Super admins can update all fields
    IF is_super_admin() THEN
        NEW.updated_at = now();
        RETURN NEW;
    END IF;

    -- Non-super-admins must be an active owner of this specific tenant
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND tenant_id = OLD.id AND role = 'owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Only a tenant owner or super admin may update this tenant';
    END IF;

    -- Block modifications to protected fields
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Access denied: Tenant ID cannot be modified';
    END IF;

    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'Access denied: Tenant slug cannot be modified';
    END IF;

    IF NEW.name IS DISTINCT FROM OLD.name THEN
        RAISE EXCEPTION 'Access denied: Tenant registered name cannot be modified by tenant owner';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        RAISE EXCEPTION 'Access denied: Tenant active status cannot be modified by tenant owner';
    END IF;

    IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
        RAISE EXCEPTION 'Access denied: Subscription plan cannot be modified by tenant owner';
    END IF;

    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
        RAISE EXCEPTION 'Access denied: Subscription status cannot be modified by tenant owner';
    END IF;

    IF NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date THEN
        RAISE EXCEPTION 'Access denied: Subscription start date cannot be modified by tenant owner';
    END IF;

    IF NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date THEN
        RAISE EXCEPTION 'Access denied: Subscription end date cannot be modified by tenant owner';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Access denied: created_at timestamp cannot be modified';
    END IF;

    -- Allowed fields for tenant owner: display_name, company_name, phone, address, city, logo_url, notes
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_subscription_guard ON public.tenants;
CREATE TRIGGER trg_tenants_subscription_guard
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_tenant_updates();

-- 2. Update admin_list_tenants() RPC to include display_name
DROP FUNCTION IF EXISTS public.admin_list_tenants();

CREATE OR REPLACE FUNCTION public.admin_list_tenants()
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    display_name VARCHAR(255),
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
        COALESCE(t.display_name, t.name)::VARCHAR(255) AS display_name,
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
