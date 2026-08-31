# UB Collection ERP - Backend (Supabase Setup & CLI Guide)

This directory contains the database migration scripts, seed data, and CLI configuration for the multi-tenant Garments Wholesale ERP system.

## Setup Instructions

### 1. Install Supabase CLI
If you haven't installed the Supabase CLI, install it via npm or Scoop / Homebrew:
```bash
npm install -g supabase
```

### 2. Login to your Supabase Account
```bash
supabase login
```

### 3. Create or Link Remote Supabase Project
To link to your existing or new project created on [app.supabase.com](https://app.supabase.com):
```bash
cd backend
supabase link --project-ref <YOUR_SUPABASE_PROJECT_REF>
```

### 4. Push Database Migrations & Seed Data
Apply all migration files (`20260831000000_module0_foundation.sql`, `20260831000001_module1_fabric_supplier_ledger.sql`, `20260831000002_module2_employee_management.sql`) and seed data to your remote Supabase instance:
```bash
supabase db push
```

Or for local development:
```bash
supabase start
supabase db reset
```

## Migration Files Overview
- `20260831000000_module0_foundation.sql`: Multi-tenant foundation, custom enums (`app_role`, `size_category`, `standard_fabric_type`), `tenants`, `profiles`, `roles`, `product_categories`, `products`, `product_variants`, RLS policies, and helper functions (`get_current_tenant_id()`, `get_current_user_role()`).
- `20260831000001_module1_fabric_supplier_ledger.sql`: `suppliers`, `fabric_purchases`, `supplier_payments`, payment method enum (`cash`, `cheque`, `bank_transfer`, `jazzcash`, `easypaisa`), auto-calculated balance views (`v_supplier_balances`, `v_supplier_ledger`), and stored RPC functions.
- `20260831000002_module2_employee_management.sql`: `employees`, `employee_earnings`, `employee_payments`, `notifications` table + payment notification trigger, `v_employee_balances`, `v_employee_ledger`, and stored RPC functions.
- `seed.sql`: Baseline reference data for system roles, demo tenant, default suit product catalog, suppliers, fabric purchases, staff profiles, and sample transactions.
