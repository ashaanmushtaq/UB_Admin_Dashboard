-- Prevent manually-created auth users from inheriting an existing tenant.
-- Tenant + owner creation must happen through an explicit provisioning flow.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Deliberately do not create a profile here. profiles.tenant_id is NOT NULL,
    -- so an auth user without explicit provisioning has no profile and no application access.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();
