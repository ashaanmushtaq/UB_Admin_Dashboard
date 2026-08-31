# UB Collection - Multi-Tenant Garments Wholesale ERP Monorepo

## System Architecture & Components
This monorepo contains 4 main components for the gents-suits wholesale ERP system:

1. **`/backend`**: Supabase configuration, SQL migrations (`20260831000000_module0_foundation.sql`, `20260831000001_module1_fabric_supplier_ledger.sql`, `20260831000002_module2_employee_management.sql`), and seed scripts (`seed.sql`).
2. **`/admin-dashboard`**: Management Web Application (React 18 + TypeScript + Vite) pre-configured with Supabase client connection status screen.
3. **`/pos-pwa`**: Offline-First Shop Counter POS (React 18 + TypeScript + Vite PWA) with Web App Manifest, Service Worker, and Supabase client status screen.
4. **`/mobile-app`**: Production Staff Mobile App (React Native + Expo + TypeScript) with AsyncStorage session persistence and Supabase client status screen.

---

## Environment Variables (.env)
Each frontend app reads its own `.env` configuration file:

- **`admin-dashboard/.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **`pos-pwa/.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **`mobile-app/.env`**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

---

## Commands to Scaffold & Run Locally

### 1. Linking Supabase Backend
```bash
cd backend
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

### 2. Running Frontend Applications
```bash
# Admin Dashboard (Web)
npm run dev:admin

# POS PWA (Counter Shop)
npm run dev:pos

# Production Staff Mobile App
npm run dev:mobile
```

---

## Roadmap & Module Status
- [x] **Module 0: Setup & Scaffolding** (Monorepo folders, Supabase backend CLI setup, 3 frontend apps with Supabase connection checks)
- [x] **Module 0 (Backend): Foundation & Multi-Tenant Schema** (Postgres enums, tenants, profiles, roles, products, variants, RLS policies)
- [x] **Module 1: Fabric Procurement & Supplier Ledger** (Suppliers, fabric receipts, payment methods, auto balances, running ledger)
- [x] **Module 2: Employee Management + Payment/Advance Tracking** (Staff roles, wage terms, piece-rate earnings, payment vouchers, auto notifications, running ledgers)
- [ ] **Module 3: Production Stage Tracking** (Cutting -> Tailoring -> Ironing -> Kaj & Overlock -> Packing -> Dispatch)
- [ ] **Module 4: Customer & Sales Ledger** (Bulk orders, dues, payments)
- [ ] **Module 5: POS PWA Features** (Offline order taking, counter sales)
- [ ] **Module 6: Admin Web Dashboard Features** (Full ERP analytics & controls)
- [ ] **Module 7: Mobile App Features** (Staff job ticket scanner & stage tracker)
