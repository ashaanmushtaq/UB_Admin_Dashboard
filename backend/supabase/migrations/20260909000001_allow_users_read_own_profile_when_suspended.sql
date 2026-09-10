-- Allow users to read their own profile row even when their tenant is suspended or expired.
-- Without this, suspended/expired users cannot read their tenant_id, preventing the UI
-- from identifying their tenant and displaying the "Account Suspended" screen.

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());
