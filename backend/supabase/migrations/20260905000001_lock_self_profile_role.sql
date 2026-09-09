-- Prevent non-owners from changing their own role or tenant through profiles.
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can update safe profile fields" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() AND tenant_id = get_current_tenant_id())
    WITH CHECK (
        id = auth.uid()
        AND tenant_id = get_current_tenant_id()
        AND role = get_current_user_role()
    );
