-- Migration: 20260910000001_fix_tenant_guard_service_role.sql
-- Allow service_role, postgres, and super_admin to update all tenant fields in guard_tenant_updates

CREATE OR REPLACE FUNCTION public.guard_tenant_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Super admins and service_role / postgres backend processes can update all fields
    IF is_super_admin() 
       OR current_user IN ('postgres', 'service_role', 'supabase_admin')
       OR (current_setting('request.jwt.claim.role', true) = 'service_role')
       OR (auth.role() = 'service_role') THEN
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
