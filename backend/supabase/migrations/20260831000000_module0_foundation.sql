-- ============================================================================
-- Module 0: Foundation Migration Script
-- Multi-tenant Garments Wholesale ERP (Gents Suits Business)
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CUSTOM ENUM TYPES
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM (
            'owner',
            'shop_staff',
            'cutting_master',
            'tailor',
            'iron_presser',
            'packing_staff',
            'kaj_overlock_staff',
            'driver',
            'helper'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'size_category') THEN
        CREATE TYPE size_category AS ENUM ('kid', 'adult');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'standard_fabric_type') THEN
        CREATE TYPE standard_fabric_type AS ENUM (
            'silk',
            'washing_wear',
            'cotton',
            'wool',
            'terry_rayon',
            'custom'
        );
    END IF;
END $$;

-- 3. CORE SHARED TABLES

-- Tenants Table (Organizations / Wholesale Businesses)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- System Roles Metadata Table
CREATE TABLE IF NOT EXISTS roles (
    id app_role PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles Table (Users bound to Supabase Auth & Tenant)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role app_role NOT NULL DEFAULT 'shop_staff',
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);

-- 4. PRODUCT & VARIANT TABLES

-- Product Categories Table
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_categories_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant ON product_categories(tenant_id);

-- Products Base Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100),
    description TEXT,
    default_fabric_type standard_fabric_type NOT NULL DEFAULT 'washing_wear',
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_products_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

-- Product Variants Table (Size, Color, Fabric variants)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    size_category size_category NOT NULL DEFAULT 'adult',
    size_code VARCHAR(20) NOT NULL, -- e.g., 'XS', 'S', 'M', 'L', '38', '40', '42'
    color VARCHAR(50) NOT NULL,     -- e.g., 'Navy Blue', 'Charcoal', 'Black', 'Maroon'
    fabric_type standard_fabric_type NOT NULL DEFAULT 'washing_wear',
    custom_fabric_note TEXT,        -- Details for custom fabric requests
    wholesale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    retail_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_price NUMERIC(12, 2) DEFAULT 0.00,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_variants_tenant_sku UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_variants_tenant ON product_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_attributes ON product_variants(tenant_id, size_category, size_code, color, fabric_type);

-- 5. HELPER SECURITY DEFINER FUNCTIONS & TRIGGERS

-- Helper function to fetch current user's tenant_id safely (preventing RLS recursion)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id 
    FROM profiles 
    WHERE id = auth.uid() 
    LIMIT 1;
$$;

-- Helper function to fetch current user's role safely
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role 
    FROM profiles 
    WHERE id = auth.uid() 
    LIMIT 1;
$$;

-- Trigger Function: Automatic updated_at timestamp updating
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS set_tenants_updated_at ON tenants;
CREATE TRIGGER set_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_categories_updated_at ON product_categories;
CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_products_updated_at ON products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_variants_updated_at ON product_variants;
CREATE TRIGGER set_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tenant-scoped business tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Policy: Roles Table (Read-only for authenticated users)
DROP POLICY IF EXISTS "Allow authenticated read to roles" ON roles;
CREATE POLICY "Allow authenticated read to roles" ON roles
    FOR SELECT TO authenticated USING (true);

-- Policies: Tenants Table
DROP POLICY IF EXISTS "Users can view their own tenant" ON tenants;
CREATE POLICY "Users can view their own tenant" ON tenants
    FOR SELECT TO authenticated
    USING (id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners can update their own tenant details" ON tenants;
CREATE POLICY "Owners can update their own tenant details" ON tenants
    FOR UPDATE TO authenticated
    USING (id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (id = get_current_tenant_id() AND get_current_user_role() = 'owner');

-- Policies: Profiles Table
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON profiles;
CREATE POLICY "Users can view profiles in their tenant" ON profiles
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners can manage profiles in their tenant" ON profiles;
CREATE POLICY "Owners can manage profiles in their tenant" ON profiles
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner')
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() = 'owner');

-- Policies: Product Categories Table
DROP POLICY IF EXISTS "Tenant users can view categories" ON product_categories;
CREATE POLICY "Tenant users can view categories" ON product_categories
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can manage categories" ON product_categories;
CREATE POLICY "Owners and shop staff can manage categories" ON product_categories
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Policies: Products Table
DROP POLICY IF EXISTS "Tenant users can view products" ON products;
CREATE POLICY "Tenant users can view products" ON products
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can manage products" ON products;
CREATE POLICY "Owners and shop staff can manage products" ON products
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));

-- Policies: Product Variants Table
DROP POLICY IF EXISTS "Tenant users can view product variants" ON product_variants;
CREATE POLICY "Tenant users can view product variants" ON product_variants
    FOR SELECT TO authenticated
    USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Owners and shop staff can manage product variants" ON product_variants;
CREATE POLICY "Owners and shop staff can manage product variants" ON product_variants
    FOR ALL TO authenticated
    USING (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'))
    WITH CHECK (tenant_id = get_current_tenant_id() AND get_current_user_role() IN ('owner', 'shop_staff'));
