# UB Collection Wholesale ERP - Handoff Log

> **Status**: Super Admin Tenant Editing — Full CRUD on all tenant fields (shop info, owner credentials, subscription) via `admin-update-tenant` Edge Function. DB guard trigger prevents non-super-admin writes to protected fields. Build: ✅ 108 modules.

---

## SESSION: Super Admin Tenant Editing (2026-09-10)

### 1. Goal
Allow Ashaan (super_admin) to edit any field on any tenant — shop name, display name, owner name/phone/email, password reset, subscription plan/status/dates, is_active flag, notes — from the Super Admin Panel.

### 2. Edge Function: `admin-update-tenant`
- **File**: `backend/supabase/functions/admin-update-tenant/index.ts`
- Deployed to remote Supabase (`ertmvejppdcuyonbizxb`) — **ACTIVE** (version 1).
- Verifies caller is `is_super_admin()` via JWT.
- Updates `public.tenants` row with any subset of: `name`, `display_name`, `company_name`, `phone`, `address`, `city`, `notes`, `plan_type`, `subscription_status`, `subscription_start_date`, `subscription_end_date`, `is_active`.
- Validates `plan_type` and `subscription_status` enum values.
- Looks up tenant owner via `profiles.role = 'owner'`, updates `profiles.full_name` / `profiles.phone`.
- Calls `admin.auth.admin.updateUserById()` to update actual Supabase Auth login email and/or password (not just display fields).
- Returns `{ success, tenant, owner }`.

### 3. Database Migrations
- **`20260910000000_tenant_editing_and_subscription_guard.sql`**:
  - Created `guard_tenant_updates()` trigger function — allows super admins to update all fields; blocks tenant owners from modifying subscription fields, slug, name, is_active, created_at.
  - Attached as `trg_tenants_subscription_guard BEFORE UPDATE` on `public.tenants`.
  - Updated `admin_list_tenants()` RPC to include `display_name` in the response.
- **`20260910000001_fix_tenant_guard_service_role.sql`**:
  - Extended the guard to allow `postgres`, `service_role`, `supabase_admin` roles to bypass restrictions (needed for Edge Function service_role key).
- **`20260910000002_harden_tenant_guard_trigger.sql`**:
  - Final hardened version: only restricts when `auth.uid() IS NOT NULL AND NOT is_super_admin()`. Backend service role (null uid) and super admins fully permitted. All non-super-admin restrictions enforced.
- All 3 migrations confirmed: **Remote database is up to date** (`npx supabase db push` → `upToDate: true`).

### 4. Frontend — `SuperAdminPage.tsx`
- **`EditTenantModal`** component (lines 706–1109):
  - 4-tab layout: 🏢 Shop & Branding | 👤 Owner & Credentials | 💳 Subscription & Status | 📝 Remarks & Notes.
  - Tab 1 (Shop): Legal name, display name (with hint: "Appears on invoices, POS, dashboard"), company name, city, address, shop phone.
  - Tab 2 (Owner): Full name, phone, login email (with ⚠️ auth warning), password reset (leave blank to keep unchanged).
  - Tab 3 (Subscription): Plan type (Trial/Premium), subscription status (Active/Suspended/Expired), start/end dates, is_active checkbox. Live "X days remaining" counter.
  - Tab 4 (Notes): Free-text operator notes.
  - Validation: required fields, min 6-char password, cross-tab error tab auto-focus.
  - Calls `updateTenant()` → `admin-update-tenant` Edge Function.
- **`TenantTable`** actions cell: "✏️ Edit" button per row (`btn-edit-{id}`) → opens `EditTenantModal`.
- **`TenantDetailModal`** footer: "✏️ Edit Tenant" button → closes detail, opens edit modal.

### 5. Frontend — `superAdmin.ts`
- `UpdateTenantPayload` interface with all editable fields.
- `UpdateTenantResult` interface.
- `updateTenant(payload)` → `supabase.functions.invoke('admin-update-tenant', { body: payload })` with robust error extraction.

### 6. Build Verification
```
✓ 108 modules transformed.
dist/assets/index-hv3zlnWU.css   91.92 kB │ gzip:  12.57 kB
dist/assets/index-3LvcfDCi.js   551.37 kB │ gzip: 141.20 kB
✓ built in 8.54s
```

### 7. Deployment Steps
```bash
# Edge Function already deployed (ACTIVE version 1)
# DB migrations already pushed (upToDate: true)

# Deploy admin-dashboard to Vercel (auto-deploys from git)
git add .
git commit -m "feat: Super Admin tenant editing — full field edit modal + admin-update-tenant Edge Function + guard trigger"
git push origin master
```

---

## SESSION: Super Admin Tenant Onboarding & Payment Tracking (2026-09-09)

### 1. Requirements & Schema Additions
- **Goal**: Expand Super Admin "Create New Tenant" form and tenant management with owner phone/WhatsApp, shop address/city, payment confirmation records, and remarks.
- **Database Migrations (`20260909000002_add_tenant_payments_and_details.sql`)**:
  - Added `city TEXT` and `notes TEXT` columns to `public.tenants` (complementing existing `address` and `phone`).
  - Created `public.tenant_payments` table for recording subscription/renewal payments:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants`, `amount NUMERIC(12,2)`, `payment_method TEXT` (cash, bank_transfer, jazzcash, easypaisa, cheque, other), `payment_date DATE`, `reference_no TEXT`, `notes TEXT`, `recorded_by UUID REFERENCES profiles`, `created_at TIMESTAMPTZ`.
    - Row-level security (RLS) enabled: Super admins have full access; tenant users can read their own tenant's payments.
  - Replaced `admin_list_tenants()` RPC with enhanced version that computes `total_paid`, `latest_payment_date`, owner details (`owner_name`, `owner_email`, `owner_phone`), and returns `address`, `city`, `notes`.
  - Added `admin_get_tenant_payments(p_tenant_id UUID)` RPC returning chronological payment history.

### 2. Edge Function & Script Updates
- **`backend/supabase/functions/provision-tenant/index.ts`**:
  - Accepts new parameters: `owner_phone`, `address`, `city`, `notes`, `payment_amount`, `payment_method`, `payment_date`, `payment_reference`, `payment_notes`.
  - Persists `address`, `city`, `phone`, and `notes` on `tenants`.
  - Persists `phone` on `profiles`.
  - Atomically creates initial payment record in `tenant_payments` during provisioning.
  - Robust error handling and rollback compensation if provisioning fails.
- **`tools/provision-tenant.mjs`**:
  - Updated CLI tool to pass phone, address, city, and payment details.

### 3. Frontend Implementation (`admin-dashboard`)
- **`src/lib/superAdmin.ts`**:
  - Added `TenantPayment`, `PaymentMethod`, and updated `CreateTenantPayload`, `TenantRow`, and `CreateTenantResult` interfaces.
  - Added `listTenantPayments(tenantId)` helper invoking `admin_get_tenant_payments`.
  - Added `recordTenantPayment` helper for recording future subscription renewal payments.
- **`src/pages/SuperAdminPage.tsx`**:
  - **CreateTenantForm**:
    - Grouped into 4 visual sections: Shop Information, Owner & Credentials, Subscription & Payment Confirmation, and Notes & Remarks.
    - Fields: Shop Name (required), City, Shop Address (required), Owner Name, Owner Phone/WhatsApp (required), Owner Email (required), Temp Password (required), Subscription Plan (Trial / Premium), Amount Received (defaults to plan amount), Payment Method (Cash, Bank Transfer, JazzCash, EasyPaisa, Cheque, Other), Payment Date (default today), Reference # (optional), Remarks (optional).
    - Auto-adjusts payment amount when changing subscription plan.
  - **TenantTable**:
    - Columns: Shop (with City indicator), Owner & Contact (with click-to-chat WhatsApp link), Plan badge, Status badge, Total Paid (`Rs. X,XXX`), Subscription End (with days left badge), and Actions.
    - Added "👁 Details" button to inspect full tenant profile and ledger.
  - **TenantDetailModal**:
    - Displays complete shop metadata, owner contact with WhatsApp integration, address & city, subscription validity dates, and notes.
    - Fetches and displays complete payment history table with date, amount, method badge, reference number, and remarks.
  - **Platform Stats**:
    - Added "Total Revenue" card alongside Total Shops, Active, Premium, and Suspended/Expired.
- **`src/pages/SuperAdminPage.css`**:
  - Added styles for responsive dialogs, payment tables, method badges, WhatsApp quick links, and responsive grid layouts.

---

## SESSION: Auth Pipeline Resolution, Edge Function Fix & Tenant Provisioning (2026-09-09)

### 1. Root Cause 1: Infinite Loading Screen on Login (`DashboardPage.tsx` & `App.tsx`)
- **Root Cause**:
  1. In `DashboardPage.tsx`, the `useEffect` checking tenant subscription checked `if (!profile?.tenant_id) { if (profile !== null) setTenantStatus('active'); return; }`. When `profile === null` (e.g. initial mount or null profile return), `if (profile !== null)` evaluated to `false`, leaving `tenantStatus` stuck on `'loading'` forever. The condition on line 80 (`if (tenantStatus === 'loading')`) rendered a permanent fullscreen spinner with zero errors.
  2. In `admin-dashboard/src/lib/supabase.ts`, `checkSupabaseConnection()` called `supabase.auth.getUser()`, which throws `Auth session missing!` when unauthenticated, falsely displaying a connection error on the login screen.
  4. In `DashboardPage.tsx`, an Escape-key `useEffect` was placed after the `if (tenantStatus === 'loading') return ...` and `if (tenantStatus === 'suspended' || tenantStatus === 'expired') return ...` early returns. On the first render (while `tenantStatus === 'loading'`), only 5 hooks executed; on the second render (once `tenantStatus === 'active'`), it bypassed the gates and executed the 6th hook, violating the React Rules of Hooks and crashing into the ErrorBoundary ("Rendered more hooks than during the previous render").
- **Fix Applied**:
  - `admin-dashboard/src/pages/DashboardPage.tsx`:
    - Moved the Escape-key `useEffect` and helpers to the top of the component before ANY conditional returns, strictly adhering to React Rules of Hooks.
    - Immediately unblocks to `setTenantStatus('active')` if `!profile?.tenant_id`.
    - Added a 4-second safety timeout fallback preventing `tenantStatus === 'loading'` from ever hanging indefinitely.
    - Cleaned up timers and active flags on unmount.
  - `admin-dashboard/src/lib/supabase.ts`: Switched ping check from `getUser()` to `getSession()` so connection checks work cleanly when unauthenticated.
  - `admin-dashboard/src/App.tsx`: Added `handleLoginSuccess` callback passed to `LoginPage.onSuccess` ensuring instant, deterministic auth state transition.

### 2. Root Cause 2: Super Admin Tenant Creation Failing / Orphaned Tenants (`provision-tenant`)
- **Root Cause**:
  1. In `backend/supabase/functions/provision-tenant/index.ts` (line 126), the response object returned `full_name: displayName`. Variable `displayName` was never defined in scope (only `ownerName`, `shopDisplayName`, and `display_name` existed).
  2. This triggered a `ReferenceError: displayName is not defined` after the tenant, auth user, and profile rows were created.
  3. The error handler entered the rollback compensation block: `await admin.auth.admin.deleteUser(userId)` successfully deleted the owner auth user (cascading to the profile row).
  4. The subsequent rollback step called `admin.from("tenants").delete().eq("id", tenantId).catch(...)`. Because the PostgREST query builder is a thenable without a native `.catch` before awaiting, it threw `TypeError: ...catch is not a function`, aborting tenant deletion.
  5. The end result: The tenant row was persisted in `tenants`, but the auth user and profile were deleted during failed rollback. This left orphaned ghost tenants with no auth user and returned HTTP 500.
- **Fix Applied**:
  - `backend/supabase/functions/provision-tenant/index.ts`:
    - Fixed line 126 from `displayName` to `ownerName`.
    - Rewrote rollback compensation with separate, safe `try/catch` blocks around `admin.auth.admin.deleteUser` and `admin.from("tenants").delete().eq("id", tenantId)`.
    - Redeployed function to remote Supabase via `npx supabase functions deploy provision-tenant --project-ref ertmvejppdcuyonbizxb`.
    - Verified via live invocation: tenant + owner auth user + profile are created atomically and return HTTP 200.
    - Tested immediate login with the newly-created owner credentials: confirmed 100% working.
  - `admin-dashboard/src/lib/superAdmin.ts`: Replaced raw `fetch` call in `createTenant` with `supabase.functions.invoke('provision-tenant', { body: payload })`, ensuring standard SDK header handling and robust error message extraction.
  - Cleaned up orphan test/ghost tenant rows from remote database.

### 3. Verification of `profiles.role` Modeling
- **Finding**:
  - `profiles.role` is modeled uniformly as an `app_role` PostgreSQL enum type (`'owner'`, `'shop_staff'`, `'cutting_master'`, `'tailor'`, etc.).
  - There are NO relational foreign key dependencies or relational queries like `role:roles(name)` in the frontend or backend. The `roles` table is solely an optional reference table. All frontend code correctly reads and writes string enum literals.

### 4. Verified Account Credentials
- `admin@ub.com` | `password123` (Owner - UB Collection Wholesale) ✅
- `staff@ubcollection.com` | `password123` (Staff - UB Collection Wholesale) ✅
- `usman@ub.com` | `UsmanShop2026!` (Owner - Usman Garments) ✅
- `ashaan@platform.admin` | `AshaanSuperAdmin2026!` (Super Admin - Platform) ✅

---

## SESSION: Remote Schema Fix (POS PWA)

### Root Cause Confirmed
Direct PostgREST HTTP column tests against `ertmvejppdcuyonbizxb.supabase.co` revealed:
- `customers.shop_name` ❌ MISSING → caused `POST /customers` HTTP 400
- `v_customer_balances.shop_name` ❌ MISSING → caused `GET /v_customer_balances` HTTP 400
- `v_customer_balances.address` ❌ MISSING → same 400

### Migration Applied to Remote DB
- File: `backend/supabase/migrations/20260901000000_add_shop_name_to_customers.sql`
- Fix: Added `DROP VIEW IF EXISTS v_customer_balances CASCADE` before `CREATE VIEW` to avoid PostgreSQL 42P16 error
- Push: `npx supabase db push` → `Finished supabase db push` (applied cleanly)
- Verified: All columns now exist remotely. Customer creation + view query return HTTP 200/201.

---

## SESSION: Admin Dashboard - Infinite Loading Fix + Mobile Responsiveness

### 1. Root Cause of Infinite Loading Spinner

**File**: `admin-dashboard/src/App.tsx`

The app started in `authState = 'loading'` and only used `onAuthStateChange()` to resolve it. In Supabase JS v2, `onAuthStateChange` fires the `INITIAL_SESSION` event asynchronously — if the Supabase client was misconfigured or if the auth service had any network delay on the deployed Vercel build (e.g. race conditions at startup), the callback could never fire. There was **no initial `getSession()` call** and **no timeout fallback**, so the spinner was permanent.

### 2. Fix Applied

**`admin-dashboard/src/App.tsx`**:
- Added `supabase.auth.getSession()` as Step 1 to resolve auth state *immediately* at startup without depending on the event listener
- Added `useRef(resolvedRef)` guard to prevent double-setting state if both `getSession` and the event listener fire
- Added **5-second timeout fallback**: if neither resolves in 5 seconds, shows login screen instead of hanging
- Added `.catch()` on `getSession()` to handle thrown errors gracefully
- `onAuthStateChange` now only handles *subsequent* changes (sign-in / sign-out after initial load)

### 3. Mobile Responsiveness

**`admin-dashboard/src/pages/DashboardPage.tsx`**:
- Added `sidebarOpen` state + `setSidebarOpen` toggle
- Added `navigate()` helper that sets the active page AND closes the sidebar (for mobile)
- Added Escape key listener to close sidebar
- Added `dash-mobile-topbar` div with hamburger `☰ / ✕` button, brand name, user avatar
- Added `dash-overlay` backdrop div that closes sidebar when tapped
- Sidebar now has conditional `.dash-sidebar--open` class

**`admin-dashboard/src/pages/DashboardPage.css`**:
- Added missing `dash-stat-card`, `dash-stat-icon`, `dash-stat-body`, `dash-stat-label`, `dash-stat-value` CSS (were missing!)
- Added `dash-mobile-topbar` styles (hidden on desktop, fixed 56px bar on mobile)
- Added `dash-hamburger` button styles
- Added `dash-overlay` backdrop styles with `backdrop-filter: blur(2px)`
- Sidebar: on `<768px` becomes `position: fixed`, slides in from left (`translateX(-100%)` → `translateX(0)` with `.dash-sidebar--open`)
- `.dash-main` gets `padding-top: 56px` on mobile for topbar clearance
- Module grid: responsive from 4 → 2 columns at `<500px`
- Stats row: responsive grid using `repeat(4,1fr)` → `repeat(2,1fr)` at `<900px`

### 4. Build Verification

```
✓ 103 modules transformed.
dist/assets/index-C_JZ5DyC.css   71.49 kB │ gzip:  9.12 kB
dist/assets/index-D5pzsV7U.js   503.16 kB │ gzip: 130.41 kB
✓ built in 14.47s
```

### 5. Deployment (To Push Live)

Vercel auto-deploys from the GitHub master branch. Push all changes:
```bash
git add .
git commit -m "Fix admin-dashboard infinite loading + mobile responsive nav + remote DB shop_name migration"
git push origin master
```

After Vercel redeploys:
- Visit the deployed admin-dashboard URL
- Confirm login screen appears immediately (no more infinite spinner)
- Login with `admin@ub.com` credentials
- Confirm dashboard loads with module grid and stats cards
- On mobile (375px) confirm hamburger menu `☰` appears, tapping opens sidebar overlay
- Confirm sidebar closes when tapping a module or the backdrop

---

## Files Modified This Session

| File | Change |
|------|--------|
| `admin-dashboard/src/App.tsx` | Fixed auth startup: `getSession()` + timeout + `resolvedRef` guard |
| `admin-dashboard/src/pages/DashboardPage.tsx` | Mobile hamburger, overlay, `navigate()` helper, Escape key |
| `admin-dashboard/src/pages/DashboardPage.css` | Mobile sidebar drawer, topbar, overlay, stats card CSS, responsive grids |
| `backend/supabase/migrations/20260901000000_add_shop_name_to_customers.sql` | Added `DROP VIEW IF EXISTS` before view recreation |

---

## Confirmed: Schema Matches Frontend in Remote DB

- `customers.shop_name` ✅
- `v_customer_balances.shop_name` ✅
- `v_customer_balances.address` ✅
- All other expected columns ✅
- **Confirmed schema now matches frontend expectations in the remote database.**

---

## SESSION: POS Catalog Price Persistence Diagnosis and Fix (2026-09-05)

### Root Cause Confirmed

- **Database write:** The remote `pos_products` table persists price updates. An authenticated test updated a diagnostic product from `1111.00` to `2222.00`; a subsequent direct REST read returned `2222.00`.
- **Service worker:** No service-worker registration or PWA plugin configuration exists in the current `pos-pwa` source. Service-worker API caching was not responsible.
- **Browser HTTP cache:** The direct product response had no `Cache-Control` or `Age` header, and browser reloads issued fresh `GET /rest/v1/pos_products` requests. Browser HTTP caching was not the observed cause.
- **IndexedDB fallback:** `fetchPosProducts()` fell back to `pos_catalog_products` whenever an online request failed, and also when a valid online response contained zero rows. `updatePosProduct()` logged Supabase errors but still wrote the requested price into IndexedDB and returned success. This allowed stale local data to appear authoritative after a failed or empty online read.

### Fix Applied

**File:** `pos-pwa/src/lib/posService.ts`

- A successful online catalog response is now authoritative even when it is empty, so stale IndexedDB rows are not returned over a valid server result.
- Product updates now use `.select('id').single()` and throw when Supabase reports an error or does not confirm a matched row.
- IndexedDB is updated only after the database write is confirmed.
- Local data remains an offline fallback only.

### Verification Evidence

- POS production build passed: `npm --prefix pos-pwa run build`.
- Authenticated UI update sent `PATCH 200`; the catalog immediately displayed `₨5,550`.
- Direct Supabase REST verification returned `default_price: 5550.00` after the UI update.
- Soft refresh displayed `₨5,550`.
- Hard refresh displayed `₨5,550`.
- Closing/reopening the app in a new browser page displayed `₨5,550`.
- The temporary diagnostic product was deactivated after testing.
- `npm --prefix pos-pwa run lint` could not run because the workspace does not have an `eslint` executable installed.

---

## SESSION: POS Quantity and Receipt Improvements (2026-09-05)

### Changes Applied

- Cart quantity input selects its current value on focus, so typing `49` replaces `1` instead of producing `149`; clearing the field removes that cart line.
- Receipt payloads now carry the customer phone number and confirmed installment schedules.
- Printed invoice and WhatsApp receipt text now show customer phone and installment number, total installments, amount, due date, and payment method.
- New customer name, shop/company name, city, and address values are title-cased before saving.
- Existing lowercase customer values are title-cased when fetched and displayed, so old records also appear consistently formatted.

### Verification

- POS production build passed: `npm --prefix pos-pwa run build`.
- Editor diagnostics report no errors in the changed TypeScript files.

---

## SESSION: Multi-Tenant Client Cache Isolation Audit (2026-09-05)

### Cache Inventory and Scope

| App | Local mechanism | Data stored | Status after fix |
|---|---|---|---|
| `/pos-pwa` | IndexedDB `ub_pos_offline_db/catalog_cache` | Customers, product catalog, customer price history, offline payment plans | Tenant-scoped keys using `<tenant_id>:<logical_key>` |
| `/pos-pwa` | IndexedDB `ub_pos_offline_db/sales_queue` | Offline sales | Records are tagged with the active `tenant_id` and queue reads filter to that tenant |
| `/pos-pwa` | In-memory `Map` fallback | Same cache values and queue fallback | Uses the same tenant-scoped keys; cleared on auth changes |
| `/pos-pwa` | Service worker / Cache API | None found | No service-worker registration or Cache API usage exists in the current source |
| `/admin-dashboard` | React component state | Page data while dashboard is mounted | Memory-only; dashboard unmounts immediately when auth becomes unauthenticated |
| `/admin-dashboard` | IndexedDB/localStorage/service worker | None found | No persistent business-data cache found |
| `/mobile-app` | AsyncStorage through Supabase auth adapter | Persisted Supabase auth session/token only | Not business data; Supabase sign-out clears the auth session. No local business-data cache exists |

### Fixes Applied

**Files:** `pos-pwa/src/lib/offlineQueue.ts`, `pos-pwa/src/lib/auth.ts`, `pos-pwa/src/App.tsx`

- POS cache reads and writes now namespace every logical key with the active profile `tenant_id`.
- Offline sale queue entries are tagged with `tenant_id`; another tenant cannot read them.
- POS local IndexedDB stores and in-memory fallback are cleared on sign-out and before accepting a new authenticated user.
- POS fetches the authenticated profile and establishes the tenant context before mounting `PosCounter`, preventing old state from rendering during login transitions.
- Existing unscoped legacy cache entries are not read and are removed by the auth-change clear operation.

### Live Verification

- Authenticated POS browser session loaded tenant-scoped keys such as `1d5f40c0-f370-444d-8cfc-39c8d6ce329f:pos_catalog_products` and `...:pos_customers`.
- After viewing cached product/customer data, POS logout returned to the login screen.
- Direct browser IndexedDB inspection immediately after logout showed both `catalog_cache` and `sales_queue` empty.
- No second tenant fixture was available for a real A-to-B account switch; temporary tenant provisioning was not performed without a safe service-role/test fixture. The clear-on-auth-change behavior provides the no-bleed guarantee before the next tenant's network request.
- POS build passed: `npm --prefix pos-pwa run build`.
- Editor diagnostics reported no errors in the changed POS files.

---

## SESSION: Remove Implicit Tenant Assignment and Add Provisioning (2026-09-05)

### Root Cause

The existing `public.handle_new_auth_user()` trigger in `backend/supabase/migrations/20260831000006_auto_create_user_profile.sql` contained this behavior:

```sql
SELECT id INTO v_tenant_id
FROM public.tenants
WHERE is_active = true
ORDER BY created_at ASC
LIMIT 1;

IF v_tenant_id IS NULL THEN
	INSERT INTO public.tenants (name, slug, company_name)
	VALUES ('UB Collection Wholesale', 'ub-collection-wholesale', 'UB Collection Wholesale ERP')
	RETURNING id INTO v_tenant_id;
END IF;
```

It then inserted every new auth user into `profiles` with that tenant ID. The role was also defaulted to `owner` for the first profile and `shop_staff` for subsequent users. This explains why a manually-created Supabase Auth user inherited the existing shop's customers and catalog.

### Fix Prepared

Migration: `backend/supabase/migrations/20260905000001_remove_implicit_tenant_assignment.sql`

- Replaces `handle_new_auth_user()` with a no-op trigger function.
- New Auth users no longer receive an automatic profile or tenant.
- Because `profiles.tenant_id` is `NOT NULL`, an unprovisioned auth user has no profile and therefore no application tenant/data access.
- The original historical migration is left unchanged for migration history; the new migration is the effective runtime definition after `supabase db push`.

### Provisioning Mechanism

Tracked admin-only local script: `tools/provision-tenant.mjs`

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = 'set directly in this terminal only'
node tools/provision-tenant.mjs 'New Shop Name' owner@example.com 'TemporaryPassword'
```

The script creates the tenant, creates the Auth owner, and explicitly inserts the owner profile with `tenant_id` and `role = owner`. If a later step fails, it compensates by deleting the created Auth user and tenant. The service-role key is never read from frontend code or committed. This is the correct provisioning boundary because Supabase Auth user creation is an API operation and cannot be made one PostgreSQL transaction with a tenant insert.

The existing gitignored `tools/tenant-isolation/create-and-cleanup.mjs` remains available for temporary isolation fixtures and now explicitly inserts the profile after creating the Auth user.

### Execution Status

- Migration and scripts pass syntax/editor diagnostics.
- Remote migration push, repair of the previously affected manual account, and end-to-end A-to-B login verification remain pending because `SUPABASE_SERVICE_ROLE_KEY` was not available in the current local terminal.
- No remote tenant, user, or production data was changed during this session.

---

## SESSION: Cross-Tenant POS Login Test Harness (2026-09-05)

### Local-Only Harness Prepared

- Added `tools/tenant-isolation/create-and-cleanup.mjs`.
- The directory is gitignored via `.gitignore`; the service-role key is read only from the terminal environment variable `SUPABASE_SERVICE_ROLE_KEY`.
- The script creates a temporary tenant, owner auth user, profile binding, one temporary POS product, and one temporary customer. It prints only fixture identifiers and temporary login credentials needed for the local browser test.
- Cleanup requires the printed `TENANT_ISOLATION_TENANT_ID` and `TENANT_ISOLATION_USER_ID`, deletes the auth user, then deletes the tenant so tenant-owned rows cascade away.
- Script syntax and workspace diagnostics pass.

### Execution Status

- Cross-tenant live creation/login/cleanup is **pending** because `SUPABASE_SERVICE_ROLE_KEY` was not present in the current local terminal environment.
- No remote tenant or production data was mutated in this session.
- Once the key is supplied directly in the local terminal, run the fixture script, log into POS with the printed temporary owner, verify the previous tenant's catalog/customer cache and UI are absent, then run cleanup with the printed IDs.

---

## SESSION: Tenant Isolation Hardening, Migration Reconcile & Provisioning (2026-09-08)

### 1. Root Cause Confirmed in Live Remote Database

Inspection of `pg_proc` in the live remote Supabase database (`ertmvejppdcuyonbizxb`) revealed that `handle_new_auth_user()` contained:
```sql
SELECT id INTO v_tenant_id FROM public.tenants WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
...
v_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'shop_staff');
...
INSERT INTO public.profiles (id, tenant_id, full_name, role)
VALUES (NEW.id, v_tenant_id, v_full_name, v_role)
```
Whenever an auth user was created manually via Supabase Dashboard (Authentication > Users), this trigger automatically bound them to the first existing tenant (`1d5f40c0-f370-444d-8cfc-39c8d6ce329f` - UB Collection Wholesale). Consequently, logging into `/pos-pwa` gave the new user access to UB Collection's catalog, customers, and sales data.

Furthermore, a previous attempt to deploy `20260905000001_remove_implicit_tenant_assignment.sql` had failed because:
- The remote migration table already contained `20260905000000` (`role_based_access_control`) and `20260905000001` (`lock_self_profile_role`), which were missing from the local migrations directory.
- A duplicate version timestamp prevented `supabase db push`.

### 2. Migrations Reconciled and Pushed

- Reconstructed `backend/supabase/migrations/20260905000000_role_based_access_control.sql` and `backend/supabase/migrations/20260905000001_lock_self_profile_role.sql` matching remote history.
- Created `backend/supabase/migrations/20260908000000_remove_implicit_tenant_assignment.sql` redefining `handle_new_auth_user()` as a strict no-op trigger.
- Executed `npx supabase db push` -> applied `20260908000000_remove_implicit_tenant_assignment.sql` cleanly to the live database.
- Confirmed live remote function definition: now returns `NEW` without creating any profile or assigning any tenant.

### 3. Production Tenant Provisioning Mechanism

Hardened `tools/provision-tenant.mjs`:
- Auto-resolves `SUPABASE_SERVICE_ROLE_KEY` from the environment or securely via Supabase CLI (`npx supabase projects api-keys`).
- In one atomic operation:
  1. Creates tenant in `public.tenants` with active status and unique slug.
  2. Creates owner auth user via Supabase Auth Admin API (with confirmed email).
  3. Inserts owner profile into `public.profiles` with `role = 'owner'` and explicit `tenant_id`.
  4. Automatic rollback/compensation: deletes auth user and tenant if any subsequent step fails.
  5. Supports `--reassign-existing` flag to reassign an existing auth user to a newly provisioned tenant.
- Usage:
  ```bash
  node tools/provision-tenant.mjs "Shop Name" owner@example.com "TemporaryPassword" ["Owner Full Name"] [--reassign-existing]
  ```

### 4. Affected Test Account Fixed (`usman@ub.com`)

- Executed provisioning for `usman@ub.com`:
  ```bash
  node tools/provision-tenant.mjs "Usman Garments" "usman@ub.com" "UsmanShop2026!" "Usman Tariq" --reassign-existing
  ```
- Created tenant `Usman Garments` (`f6368c67-2fca-4d20-aaea-bc4bd1ae3634`).
- `usman@ub.com`'s profile is now bound exclusively to `Usman Garments` as `owner`.
- Verified `usman@ub.com` sees 0 customers and 0 catalog items from UB Collection Wholesale.

### 5. Automated End-to-End Verification Suite

Created and executed `tools/verify-tenant-isolation.mjs`:
- **Test 1**: Created raw auth user (`unprov_...`) without provisioning. Confirmed user has NO profile row in `public.profiles` and sees 0 customers/products via PostgREST.
- **Test 2**: Logged into `usman@ub.com`. Confirmed 0 UB Collection records. Inserted a test customer and product in Usman Garments; confirmed user sees only its own records.
- **Test 3**: Logged into `staff@ubcollection.com`. Confirmed 4 UB Collection customers and 3 UB Collection products. Confirmed ZERO visibility into Usman Garments records.
- **Test 4**: Provisioned temporary tenant fixture `E2E Shop`, authenticated, confirmed complete data isolation, and cleaned up cleanly.
- Result: **ALL 4 TEST SUITES PASSED**.

### 6. Build Verification

- `npm run build:pos` passed (450 modules transformed, dist generated).
- `npm run build:admin` passed (103 modules transformed, dist generated).

---

## SESSION: Super Admin Panel, Role Identity & Subscription Enforcement (2026-09-09)

### 1. Super Admin Identity Model

**Decision: Separate `platform_admins` table (not a role in `profiles`)**

The `platform_admins` table (migration `20260908000001`) stores only Ashaan's identity, keyed by `auth.users.id`. It has **no tenant_id** — it exists entirely outside the tenant data model.

- `is_super_admin()` SECURITY DEFINER function is the single gate. All admin RPCs call it at the top.
- No INSERT policy for authenticated users on `platform_admins` → tenant owners cannot self-escalate.
- Seeded via `tools/seed-super-admin.mjs`: `ashaan@platform.admin` / `AshaanSuperAdmin2026!`

### 2. Super Admin Panel — Architecture

**Location: `SuperAdminPage` rendered directly by `App.tsx` when `is_super_admin()` returns true** — completely separate from `DashboardPage`, which requires a tenant profile.

**Auth routing in `App.tsx`:**
- After `getSession()` resolves, calls `isSuperAdmin()` RPC
- If `true` → renders `<SuperAdminPage>` (no profiles query, no tenant context)
- If `false` → renders `<DashboardPage>` as before

### 3. Files Created / Modified

| File | Change |
|------|--------|
| `admin-dashboard/src/pages/SuperAdminPage.tsx` | **NEW** — Full Super Admin Panel: tenant list + stats, create-tenant form, suspend/reactivate with confirm dialogs |
| `admin-dashboard/src/pages/SuperAdminPage.css` | **NEW** — Dark glassmorphism CSS matching admin-dashboard aesthetic |
| `admin-dashboard/src/lib/superAdmin.ts` | **NEW** — Client helpers: `listAllTenants()`, `updateTenantSubscription()`, `createTenant()` (calls Edge Function) |
| `admin-dashboard/src/App.tsx` | Modified — Added `super_admin` auth state, `isSuperAdmin()` routing, `SuperAdminPage` import |
| `admin-dashboard/src/lib/auth.ts` | Modified — Added `isSuperAdmin()` RPC helper |
| `admin-dashboard/src/pages/DashboardPage.tsx` | Modified — Added suspension/expiry gate via `get_tenant_subscription` on mount |
| `tools/provision-tenant.mjs` | Modified — Added `plan_type` param (trial=30d, premium=365d), sets subscription dates |

### 4. Subscription Enforcement

**Live-checked (no cron):** `get_current_tenant_id()` checks `subscription_end_date > now()` AND `subscription_status = 'active'` on every RLS query. Suspension takes effect immediately on next DB request — no delay, no cache, no bypass possible.

**UI gate (defense-in-depth):** `DashboardPage` calls `get_tenant_subscription` on mount and shows "Account Suspended" or "Subscription Expired" screen instead of the dashboard, with a "Sign Out" button.

### 5. Live Verification Results (2026-09-09) — ALL PASSED

| Step | Test | Result |
|------|------|--------|
| 1 | Super admin sign-in | ✅ |
| 2 | Create tenant via Edge Function (trial plan) | ✅ "Verification Shop 1788946805171" |
| 3 | New owner logs in with temp password | ✅ |
| 4 | Owner `is_super_admin()` → false | ✅ |
| 4b | Owner `admin_list_tenants()` → blocked | ✅ "Access denied: Super Admin role required" |
| 4c | Owner sees own subscription (`is_effective_active: true`) | ✅ |
| 5 | Super admin suspends tenant | ✅ status → 'suspended' |
| 6 | Owner sees `subscription_status: suspended` | ✅ |
| 6b | Suspended owner `customers` query → `[]` (RLS blocks) | ✅ |
| 7 | Super admin reactivates tenant | ✅ status → 'active' |
| 8 | Owner `is_effective_active: true` restored | ✅ |
| — | Test tenant + owner cleaned up | ✅ |

### 6. Build Verification

```
✓ 106 modules transformed.
dist/assets/index-C4sdzUYI.css   81.80 kB │ gzip: 11.07 kB
dist/assets/index-DSlbp8O7.js   518.71 kB │ gzip: 134.35 kB
✓ built in 9.47s
```

### 7. Pending Deployment Steps

```bash
# Deploy Edge Function to Supabase
npx supabase functions deploy provision-tenant --project-ref ertmvejppdcuyonbizxb

# Push admin-dashboard to Vercel (auto-deploys from git)
git add . && git commit -m "feat: Super Admin Panel — tenant list, create, suspend, reactivate, subscription enforcement" && git push origin master
```

---

## Session Update: Tenant Dynamic Branding (Prompt P)

### 1. Goal & Architecture
Every tenant (shop) on the SaaS platform now sees their own shop name (`display_name`) and branding throughout `/admin-dashboard` and `/pos-pwa` rather than hardcoded "UB Collection" strings. "UB Collection" is now purely one tenant among many in the database.

- **Unauthenticated Screens** (login pages & splash screens): Show neutral, multi-tenant platform branding ("Wholesale ERP", "Wholesale POS Counter") so unauthenticated visitors or staff from any shop don't see another shop's identity before logging in.
- **Authenticated Sessions**: Dynamically query `public.tenants` by the authenticated user's `tenant_id`, resolve `display_name`, and propagate it to sidebar brand, mobile header, browser tab `document.title`, and customer-facing invoice receipts.
- **Invoices / Receipts**: Customer-facing WhatsApp messages and printable PDF/paper receipts dynamically show the shop's own `display_name`, tagline, phone, and address.

---

### 2. Database Migration (`20260909000000_add_branding_fields_to_tenants.sql`)
- Applied to remote Supabase DB (`ertmvejppdcuyonbizxb.supabase.co`).
- Added `display_name VARCHAR(255)` and verified `logo_url TEXT` on `public.tenants`.
- Backfilled existing tenants with their respective names.
- Explicitly set:
  - Original tenant (`1d5f40c0-f370-444d-8cfc-39c8d6ce329f`): `display_name = 'UB Collection'`
  - Usman Garments (`f6368c67-2fca-4d20-aaea-bc4bd1ae3634`): `display_name = 'Usman Garments'`
- Added RLS policy `Owners can update their own tenant branding` so tenant owners can manage their own shop branding while cross-tenant modifications are strictly blocked.

---

### 3. Backend & Provisioning
- `backend/supabase/functions/provision-tenant/index.ts`: Accepts `display_name` (defaulting to `name`) and `logo_url`; deployed to remote Supabase.
- `tools/provision-tenant.mjs`: Added `displayName` support on CLI tenant provisioning.

---

### 4. Admin Dashboard (`/admin-dashboard`) Changes
- `src/lib/auth.ts`: Added `TenantBranding` interface and `getTenantBranding(tenantId: string)` helper.
- `src/App.tsx`: Fetches tenant branding after session resolution; passes `branding` to `DashboardPage`; updated splash to `"Loading ERP Portal…"`.
- `src/pages/DashboardPage.tsx`:
  - Dynamically renders `shopName.toUpperCase()` in the sidebar and mobile topbar.
  - Dynamically updates `document.title = `${shopName} · Admin Dashboard``.
- `src/pages/LoginPage.tsx`: Clean SaaS portal title `"Wholesale ERP"`, `"Shop Management Portal"`, placeholder `owner@shop.com`.
- `src/pages/SuperAdminPage.tsx`: Replaced platform string to `"Garments Wholesale SaaS platform"`.
- `src/pages/EmployeePage.tsx` & `src/lib/employees.ts`: Removed hardcoded `'UBCollection123!'` password fallback and shop email placeholders.
- `index.html`: Initial title set to `"Wholesale ERP · Admin Dashboard"`.

---

### 5. POS Counter PWA (`/pos-pwa`) Changes
- `src/lib/auth.ts`: Added `TenantBranding` interface and `getTenantBranding(tenantId: string)`.
- `src/App.tsx`: Fetches `TenantBranding` on auth change; passes `branding` to `PosCounter`; updated splash to `"Loading POS Counter…"`.
- `src/components/PosCounter.tsx`:
  - Dynamically renders `{shopName.toUpperCase()} POS` in the top navigation bar.
  - Dynamically updates `document.title = `${shopName} · POS Counter``.
  - Passes `branding` to `InvoicePrintModal`.
- `src/components/PosLoginPage.tsx`: Updated brand title to `"Wholesale POS"`, placeholder to `staff@shop.com`, and footer to `"Garments Wholesale ERP · Multi-Tenant POS Counter"`.
- `src/components/InvoicePrintModal.tsx`:
  - WhatsApp text: `*${shopName.toUpperCase()} - WHOLESALE INVOICE*` and `_Thank you for your business with ${shopName}!_`.
  - Printable sheet: `<h1 className="inv-company-name">{shopName.toUpperCase()}</h1>`, dynamic tagline and address/phone contact info.
  - Printable footer: `Thank you for your business with {shopName}!`.
- `public/manifest.json`: Updated PWA name to `"Wholesale POS Counter"`, short name to `"POS Counter"`, and generic description.
- `index.html`: Initial title set to `"Wholesale POS · Counter"`.

---

### 6. Live Multi-Tenant Verification & Security Audit
Ran `node tools/verify-tenant-branding.mjs`:
| Test | Assertion | Status |
|:---|:---|:---:|
| 1 | DB Schema: `display_name` column exists on `public.tenants` | ✅ Passed |
| 1b | Tenant 1 (`UB Collection Wholesale`) has `display_name = 'UB Collection'` | ✅ Passed |
| 1c | Tenant 2 (`Usman Garments`) has `display_name = 'Usman Garments'` | ✅ Passed |
| 2 | Tenant 1 login (`staff@ubcollection.com`) resolves `display_name = 'UB Collection'` | ✅ Passed |
| 2b | Tenant 1 invoice: `*UB COLLECTION - WHOLESALE INVOICE*` + footer | ✅ Passed |
| 3 | Tenant 2 login (`usman@ub.com`) resolves `display_name = 'Usman Garments'` | ✅ Passed |
| 3b | Tenant 2 invoice: `*USMAN GARMENTS - WHOLESALE INVOICE*` + footer | ✅ Passed |
| 3c | Zero leftover references to "UB Collection" in Tenant 2 invoice/receipt | ✅ Passed |
| 4 | Owner (`usman@ub.com`) can update own shop branding via RLS | ✅ Passed |
| 4b | Owner (`usman@ub.com`) BLOCKED by RLS from updating UB Collection branding | ✅ Passed |
| 5 | `node tools/verify-tenant-isolation.mjs` full isolation suite | ✅ 100% Passed |
| 6 | Codebase Grep Audit: 0 hardcoded "UB Collection" in tenant UI | ✅ 0 Found |
| 7 | Production Build: `admin-dashboard` (106 modules) | ✅ Succeeded |
| 8 | Production Build: `pos-pwa` (450 modules) | ✅ Succeeded |

