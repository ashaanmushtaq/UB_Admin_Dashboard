-- Migration: 20260910000002_harden_tenant_guard_trigger.sql
-- Correctly differentiate authenticated tenant users from super admins and backend service role

CREATE OR REPLACE FUNCTION public.guard_tenant_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Only restrict if the caller is an authenticated user who is NOT a platform super admin.
    -- Backend service role and direct SQL migrations have auth.uid() = NULL and are fully permitted.
    -- Super admins have auth.uid() of a platform admin where is_super_admin() = true and are fully permitted.
    IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN
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
    END IF;

    -- Update timestamp
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
