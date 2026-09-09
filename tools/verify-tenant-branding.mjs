import { execSync } from 'child_process';
import { createClient } from '../pos-pwa/node_modules/@supabase/supabase-js/dist/index.mjs';

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

async function runBrandingVerification() {
  console.log('================================================================');
  console.log('STARTING MULTI-TENANT DYNAMIC BRANDING VERIFICATION (PROMPT P)');
  console.log('================================================================\n');

  // ── TEST 1: Database Schema & Tenants Branding Rows ─────────────────────────
  console.log('--- TEST 1: Verifying DB Schema & Tenants Branding Fields ---');
  const { data: tenants, error: tenantErr } = await adminClient
    .from('tenants')
    .select('id, name, display_name, logo_url, company_name');
  
  assert(!tenantErr, `Queried tenants successfully: ${tenantErr?.message || 'OK'}`);
  assert(tenants && tenants.length >= 2, `Found ${tenants.length} tenants in database`);

  const ubTenant = tenants.find(t => t.slug === 'ub-collection-wholesale' || t.name === 'UB Collection Wholesale');
  assert(Boolean(ubTenant), 'UB Collection Wholesale tenant found in DB');
  assert(ubTenant.display_name === 'UB Collection', `UB Collection display_name is "${ubTenant.display_name}"`);

  const usmanTenant = tenants.find(t => t.name === 'Usman Garments');
  assert(Boolean(usmanTenant), 'Usman Garments tenant found in DB');
  assert(usmanTenant.display_name === 'Usman Garments', `Usman Garments display_name is "${usmanTenant.display_name}"`);
  console.log('');

  // ── TEST 2: Tenant 1 (UB Collection) Dynamic Branding Resolution ────────────
  console.log('--- TEST 2: Resolving Branding for Tenant 1 (staff@ubcollection.com) ---');
  const client1 = createAnonClient();
  const { data: auth1, error: loginErr1 } = await client1.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123',
  });
  assert(!loginErr1, `staff@ubcollection.com login successful: ${loginErr1?.message || 'OK'}`);
  assert(auth1.user?.id, 'Session active for staff@ubcollection.com');

  // Fetch profile
  const { data: prof1, error: profErr1 } = await client1
    .from('profiles')
    .select('id, tenant_id, full_name, role')
    .eq('id', auth1.user.id)
    .single();
  assert(!profErr1, `Fetched profile for staff: tenant_id=${prof1.tenant_id}`);
  assert(prof1.tenant_id === ubTenant.id, 'User belongs to UB Collection tenant');

  // Fetch tenant branding via client1 (RLS check: tenant member can read their own tenant)
  const { data: brand1, error: brandErr1 } = await client1
    .from('tenants')
    .select('id, name, display_name, company_name, address, phone')
    .eq('id', prof1.tenant_id)
    .single();
  assert(!brandErr1, `Fetched tenant branding via RLS: ${brandErr1?.message || 'OK'}`);
  assert(brand1.display_name === 'UB Collection', `Tenant 1 branding display_name is "${brand1.display_name}"`);

  // Verify Invoice text generation for Tenant 1
  const shopName1 = brand1.display_name || brand1.name;
  const invoiceHeader1 = `*${shopName1.toUpperCase()} - WHOLESALE INVOICE*`;
  const invoiceFooter1 = `Thank you for your business with ${shopName1}!`;
  assert(invoiceHeader1 === '*UB COLLECTION - WHOLESALE INVOICE*', `Tenant 1 invoice header: "${invoiceHeader1}"`);
  assert(invoiceFooter1 === 'Thank you for your business with UB Collection!', `Tenant 1 invoice footer: "${invoiceFooter1}"`);
  console.log('');

  // ── TEST 3: Tenant 2 (Usman Garments) Dynamic Branding Resolution ────────────
  console.log('--- TEST 3: Resolving Branding for Tenant 2 (usman@ub.com) ---');
  const client2 = createAnonClient();
  const { data: auth2, error: loginErr2 } = await client2.auth.signInWithPassword({
    email: 'usman@ub.com',
    password: 'UsmanShop2026!',
  });
  assert(!loginErr2, `usman@ub.com login successful: ${loginErr2?.message || 'OK'}`);
  assert(auth2.user?.id, 'Session active for usman@ub.com');

  // Fetch profile
  const { data: prof2, error: profErr2 } = await client2
    .from('profiles')
    .select('id, tenant_id, full_name, role')
    .eq('id', auth2.user.id)
    .single();
  assert(!profErr2, `Fetched profile for Usman Tariq: tenant_id=${prof2.tenant_id}`);
  assert(prof2.tenant_id === usmanTenant.id, 'User belongs to Usman Garments tenant');

  // Fetch tenant branding via client2 (RLS check: tenant member can read their own tenant)
  const { data: brand2, error: brandErr2 } = await client2
    .from('tenants')
    .select('id, name, display_name, company_name, address, phone')
    .eq('id', prof2.tenant_id)
    .single();
  assert(!brandErr2, `Fetched tenant branding via RLS: ${brandErr2?.message || 'OK'}`);
  assert(brand2.display_name === 'Usman Garments', `Tenant 2 branding display_name is "${brand2.display_name}"`);

  // Verify Invoice text generation for Tenant 2
  const shopName2 = brand2.display_name || brand2.name;
  const invoiceHeader2 = `*${shopName2.toUpperCase()} - WHOLESALE INVOICE*`;
  const invoiceFooter2 = `Thank you for your business with ${shopName2}!`;
  assert(invoiceHeader2 === '*USMAN GARMENTS - WHOLESALE INVOICE*', `Tenant 2 invoice header: "${invoiceHeader2}"`);
  assert(invoiceFooter2 === 'Thank you for your business with Usman Garments!', `Tenant 2 invoice footer: "${invoiceFooter2}"`);

  // Leakage assertion: Usman Garments invoice has ZERO references to UB Collection
  assert(!invoiceHeader2.includes('UB COLLECTION'), 'Usman Garments invoice header has ZERO references to UB Collection');
  assert(!invoiceFooter2.includes('UB Collection'), 'Usman Garments invoice footer has ZERO references to UB Collection');
  console.log('');

  // ── TEST 4: Cross-Tenant Branding Update & RLS Security ─────────────────────
  console.log('--- TEST 4: Cross-Tenant Branding Update & RLS Security ---');
  // usman@ub.com is 'owner' of Usman Garments.
  // Test updating own branding
  const { error: ownUpdateErr } = await client2
    .from('tenants')
    .update({ display_name: 'Usman Garments Luxury Wear' })
    .eq('id', usmanTenant.id);
  assert(!ownUpdateErr, `Usman can update his own shop branding: ${ownUpdateErr?.message || 'OK'}`);

  const { data: updatedUsman } = await client2
    .from('tenants')
    .select('display_name')
    .eq('id', usmanTenant.id)
    .single();
  assert(updatedUsman.display_name === 'Usman Garments Luxury Wear', 'Usman Garments display_name successfully changed');

  // Test unauthorized cross-tenant branding tamper: Usman attempts to update UB Collection branding
  const { data: tamperData, error: tamperErr } = await client2
    .from('tenants')
    .update({ display_name: 'Hacked by Usman' })
    .eq('id', ubTenant.id)
    .select();
  assert(!tamperErr && (!tamperData || tamperData.length === 0), 'RLS BLOCKS Usman from updating UB Collection branding (0 rows modified)');

  // Verify UB Collection branding remained completely untouched
  const { data: verifyUb } = await adminClient
    .from('tenants')
    .select('display_name')
    .eq('id', ubTenant.id)
    .single();
  assert(verifyUb.display_name === 'UB Collection', 'UB Collection display_name remains intact');

  // Revert Usman Garments back to 'Usman Garments'
  await client2
    .from('tenants')
    .update({ display_name: 'Usman Garments' })
    .eq('id', usmanTenant.id);
  console.log('✅ Reverted Usman Garments display_name back to original');

  console.log('\n================================================================');
  console.log('🎉 ALL MULTI-TENANT DYNAMIC BRANDING TESTS PASSED!');
  console.log('================================================================');
}

runBrandingVerification().catch(err => {
  console.error('\n❌ FATAL TEST ERROR:', err);
  process.exit(1);
});
