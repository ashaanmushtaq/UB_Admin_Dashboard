-- ============================================================================
-- Migration: Add Branding Fields to Tenants
-- ============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Backfill display_name with name for any tenant missing display_name
UPDATE public.tenants
SET display_name = name
WHERE display_name IS NULL;

-- Specifically set UB Collection Wholesale's display_name to 'UB Collection'
UPDATE public.tenants
SET display_name = 'UB Collection'
WHERE slug = 'ub-collection-wholesale' OR name = 'UB Collection Wholesale';

-- Allow tenant owners to update their own tenant's branding fields
DROP POLICY IF EXISTS "Owners can update their own tenant branding" ON public.tenants;
CREATE POLICY "Owners can update their own tenant branding" ON public.tenants
    FOR UPDATE TO authenticated
    USING (
        id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
    )
    WITH CHECK (
        id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
    );
