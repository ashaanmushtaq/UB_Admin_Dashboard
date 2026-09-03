-- ============================================================================
-- Fix Gap: Automatic Profile & Tenant Linking for Auth Users
-- ============================================================================

-- Function to handle new user creation from Supabase Auth (Dashboard or Client API)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_full_name VARCHAR(255);
    v_role app_role;
BEGIN
    -- 1. Fetch default active tenant or create fallback tenant
    SELECT id INTO v_tenant_id FROM public.tenants WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
    
    IF v_tenant_id IS NULL THEN
        INSERT INTO public.tenants (name, slug, company_name)
        VALUES ('UB Collection Wholesale', 'ub-collection-wholesale', 'UB Collection Wholesale ERP')
        RETURNING id INTO v_tenant_id;
    END IF;

    -- 2. Determine full_name from metadata or email
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        SPLIT_PART(NEW.email, '@', 1),
        'Staff User'
    );

    -- 3. Determine role from metadata or default to 'owner' for first user, 'shop_staff' for others
    IF (SELECT COUNT(*) FROM public.profiles) = 0 THEN
        v_role := 'owner';
    ELSE
        v_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'shop_staff');
    END IF;

    -- 4. Insert or update corresponding profile
    INSERT INTO public.profiles (id, tenant_id, full_name, role)
    VALUES (NEW.id, v_tenant_id, v_full_name, v_role)
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        updated_at = now();

    RETURN NEW;
END;
$$;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- Ensure at least one default tenant exists
INSERT INTO public.tenants (name, slug, company_name)
SELECT 'UB Collection Wholesale', 'ub-collection-wholesale', 'UB Collection Wholesale ERP'
WHERE NOT EXISTS (SELECT 1 FROM public.tenants);

-- Immediately link any unlinked existing auth users
INSERT INTO public.profiles (id, tenant_id, full_name, role)
SELECT 
    u.id,
    (SELECT id FROM public.tenants WHERE is_active = true ORDER BY created_at ASC LIMIT 1),
    COALESCE(u.raw_user_meta_data->>'full_name', SPLIT_PART(u.email, '@', 1), 'Staff User'),
    'owner'::app_role
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
