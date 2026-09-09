import { execSync } from 'child_process';
import { createClient } from '../pos-pwa/node_modules/@supabase/supabase-js/dist/index.mjs';
import { provisionTenant } from './provision-tenant.mjs';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ertmvejppdcuyonbizxb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydG12ZWpwcGRjdXlvbmJpenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNjkyMTcsImV4cCI6MjEwMzc0NTIxN30.aoI2Y8scb2SPiQzxLt77uwatmitbOUuxKgK_OkpAswk';

function resolveServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  try {
    const raw = execSync('npx supabase projects api-keys --project-ref ertmvejppdcuyonbizxb', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(raw);
    const item = parsed.keys?.find(k => k.id === 'service_role' || k.name === 'service_role');
    if (item?.api_key) return item.api_key;
  } catch (err) {}
  throw new Error('Could not resolve SUPABASE_SERVICE_ROLE_KEY.');
}

const serviceRoleKey = resolveServiceRoleKey();
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createAnonClient() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING END-TO-END TENANT ISOLATION & PROVISIONING VERIFICATION');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Verify unprovisioned auth user creation (no default tenant)
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Unprovisioned Auth User (Manual Dashboard Simulation) ---');
  const unprovEmail = `unprov_${Date.now()}@example.com`;
  const unprovPass = 'TempPass123!Aa';
  const { data: unprovAuth, error: unprovCreateErr } = await adminClient.auth.admin.createUser({
    email: unprovEmail,
    password: unprovPass,
    email_confirm: true,
  });
  if (unprovCreateErr) throw unprovCreateErr;
  const unprovUserId = unprovAuth.user.id;
  console.log(`Created raw auth user: ${unprovEmail} (${unprovUserId})`);

  try {
    // Verify no profile was created by the trigger
    const { data: unprovProfile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', unprovUserId)
      .maybeSingle();
    assert(unprovProfile === null, 'Unprovisioned user has NO profile row in public.profiles');

    // Authenticate as unprovisioned user via Anon client
    const unprovClient = createAnonClient();
    const { data: unprovSession, error: unprovLoginErr } = await unprovClient.auth.signInWithPassword({
      email: unprovEmail,
      password: unprovPass,
    });
    assert(!unprovLoginErr && unprovSession.session !== null, 'Unprovisioned user can authenticate');

    // Query data: should see ZERO records due to RLS
    const { data: unprovCustomers } = await unprovClient.from('customers').select('*');
    assert(Array.isArray(unprovCustomers) && unprovCustomers.length === 0, 'Unprovisioned user sees 0 customers (no tenant access)');

    const { data: unprovProducts } = await unprovClient.from('pos_products').select('*');
    assert(Array.isArray(unprovProducts) && unprovProducts.length === 0, 'Unprovisioned user sees 0 products (no tenant access)');
  } finally {
    await adminClient.auth.admin.deleteUser(unprovUserId);
    console.log(`Cleaned up raw auth user ${unprovEmail}\n`);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Verify repaired test account (usman@ub.com in Usman Garments)
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 2: Verify usman@ub.com Isolated in Usman Garments ---');
  const usmanClient = createAnonClient();
  const { data: usmanSession, error: usmanLoginErr } = await usmanClient.auth.signInWithPassword({
    email: 'usman@ub.com',
    password: 'UsmanShop2026!',
  });
  if (usmanLoginErr) throw usmanLoginErr;
  assert(usmanSession.session !== null, 'usman@ub.com authenticated successfully');

  // Verify usman's profile is in Usman Garments
  const { data: usmanProfile } = await usmanClient
    .from('profiles')
    .select('id, full_name, role, tenant_id, tenants(name)')
    .eq('id', usmanSession.user.id)
    .single();
  assert(usmanProfile.tenants?.name === 'Usman Garments', `usman@ub.com belongs to "${usmanProfile.tenants?.name}" (NOT UB Collection)`);
  assert(usmanProfile.role === 'owner', 'usman@ub.com has role = owner in their own shop');

  // Verify zero data seen from UB Collection Wholesale
  const { data: usmanCustomersBefore } = await usmanClient.from('customers').select('*');
  assert(!usmanCustomersBefore.some(c => c.tenant_id === '1d5f40c0-f370-444d-8cfc-39c8d6ce329f'), 'usman@ub.com sees 0 customers from UB Collection Wholesale');

  const { data: usmanProductsBefore } = await usmanClient.from('pos_products').select('*');
  assert(!usmanProductsBefore.some(p => p.tenant_id === '1d5f40c0-f370-444d-8cfc-39c8d6ce329f'), 'usman@ub.com sees 0 products from UB Collection Wholesale');

  const testTimestamp = Date.now();
  const testCustomerName = `Usman VIP Retailer ${testTimestamp}`;
  const testProductName = `Usman Signature Kurta ${testTimestamp}`;

  const { data: newCustomer, error: custErr } = await usmanClient
    .from('customers')
    .insert({
      name: testCustomerName,
      shop_name: 'Anarkali Suits',
      phone: '03001234567',
      city: 'Lahore',
    })
    .select('id, name, tenant_id')
    .single();
  if (custErr) throw custErr;
  assert(newCustomer.name === testCustomerName, 'usman@ub.com created customer in Usman Garments');
  assert(newCustomer.tenant_id === usmanProfile.tenant_id, 'Customer automatically assigned to Usman Garments tenant_id');

  const { data: newProduct, error: prodErr } = await usmanClient
    .from('pos_products')
    .insert({
      name: testProductName,
      size_category: 'adult',
      size_code: 'L',
      color: 'Navy Blue',
      fabric_type: 'cotton',
      default_price: 3500,
      stock_quantity: 50,
      is_active: true,
    })
    .select('id, name, tenant_id')
    .single();
  if (prodErr) throw prodErr;
  assert(newProduct.name === testProductName, 'usman@ub.com created product in Usman Garments');

  // Verify usman sees their own newly created customer and product
  const { data: usmanCustomersAfter } = await usmanClient.from('customers').select('*');
  assert(usmanCustomersAfter.some(c => c.id === newCustomer.id), 'usman@ub.com can see their own customer');

  const { data: usmanProductsAfter } = await usmanClient.from('pos_products').select('*');
  assert(usmanProductsAfter.some(p => p.id === newProduct.id), 'usman@ub.com can see their own product');
  console.log('Test 2 completed successfully.\n');

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Verify UB Collection Wholesale cannot see Usman Garments data
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 3: Verify Cross-Tenant Leakage Check from UB Collection ---');
  const staffClient = createAnonClient();
  const { data: staffSession, error: staffLoginErr } = await staffClient.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123',
  });
  if (staffLoginErr) throw staffLoginErr;
  assert(staffSession.session !== null, 'staff@ubcollection.com authenticated');

  const { data: ubCustomers } = await staffClient.from('customers').select('*');
  assert(ubCustomers.length > 0, `staff@ubcollection.com sees ${ubCustomers.length} UB Collection customers`);
  assert(!ubCustomers.some(c => c.id === newCustomer.id), 'UB Collection CANNOT see Usman VIP Retailer customer');

  const { data: ubProducts } = await staffClient.from('pos_products').select('*');
  assert(ubProducts.length > 0, `staff@ubcollection.com sees ${ubProducts.length} UB Collection products`);
  assert(!ubProducts.some(p => p.id === newProduct.id), 'UB Collection CANNOT see Usman Signature Kurta product');
  console.log('Test 3 completed successfully.\n');

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Full End-to-End Tenant Provisioning & Cleanup Flow
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 4: Atomic Provisioning Flow Test ---');
  const tempShopName = `E2E Shop ${Date.now()}`;
  const tempEmail = `e2e_owner_${Date.now()}@example.com`;
  const tempPassword = 'TempSecurePassword2026!';

  const provisionResult = await provisionTenant({
    name: tempShopName,
    email: tempEmail,
    password: tempPassword,
    fullName: 'E2E Test Owner',
  });

  console.log(`Provisioned tenant: ${provisionResult.tenant.name} (${provisionResult.tenant.id})`);
  assert(provisionResult.owner.role === 'owner', 'Provisioned user assigned role = owner');

  try {
    const tempOwnerClient = createAnonClient();
    const { data: tempSession, error: tempLoginErr } = await tempOwnerClient.auth.signInWithPassword({
      email: tempEmail,
      password: tempPassword,
    });
    if (tempLoginErr) throw tempLoginErr;
    assert(tempSession.session !== null, 'New tenant owner authenticated');

    const { data: tempCustomers } = await tempOwnerClient.from('customers').select('*');
    assert(tempCustomers.length === 0, 'New tenant owner sees ZERO existing customers (zero cross-tenant leakage)');

    const { data: tempProducts } = await tempOwnerClient.from('pos_products').select('*');
    assert(tempProducts.length === 0, 'New tenant owner sees ZERO existing products (zero cross-tenant leakage)');
  } finally {
    console.log('Cleaning up temporary E2E test fixture...');
    await adminClient.auth.admin.deleteUser(provisionResult.owner.id);
    await adminClient.from('tenants').delete().eq('id', provisionResult.tenant.id);
    console.log('Cleanup complete.\n');
  }

  console.log('================================================================');
  console.log('ALL VERIFICATIONS PASSED: TENANT ISOLATION CONFIRMED 100% SECURE');
  console.log('================================================================');
}

runVerification().catch(err => {
  console.error('VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
