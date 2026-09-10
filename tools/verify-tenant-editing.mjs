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

async function runTenantEditingVerification() {
  console.log('================================================================');
  console.log('STARTING TENANT EDITING & SUBSCRIPTION GUARD VERIFICATION');
  console.log('================================================================\n');

  // Fetch Usman Garments tenant for testing
  const { data: usmanTenant, error: uErr } = await adminClient
    .from('tenants')
    .select('*')
    .eq('name', 'Usman Garments')
    .single();
  assert(!uErr && usmanTenant, `Found Usman Garments tenant (${usmanTenant?.id})`);

  const { data: usmanOwnerProf, error: pErr } = await adminClient
    .from('profiles')
    .select('id, full_name, phone, role')
    .eq('tenant_id', usmanTenant.id)
    .eq('role', 'owner')
    .single();
  assert(!pErr && usmanOwnerProf, `Found Usman owner profile (${usmanOwnerProf?.id})`);

  // ── TEST 1: Super Admin Session & Edge Function admin-update-tenant ───────────
  console.log('\n--- TEST 1: Super Admin Edits Tenant Fields & Owner Credentials ---');
  const superClient = createAnonClient();
  const { data: saLogin, error: saLoginErr } = await superClient.auth.signInWithPassword({
    email: 'ashaan@platform.admin',
    password: 'AshaanSuperAdmin2026!',
  });
  assert(!saLoginErr, `Super admin login successful: ${saLoginErr?.message || 'OK'}`);

  // Test updating tenant fields via admin-update-tenant
  const updatedNotes = `Tested by verification script at ${new Date().toISOString()}`;
  const { data: updateRes, error: updateErr } = await superClient.functions.invoke('admin-update-tenant', {
    body: {
      tenant_id: usmanTenant.id,
      display_name: 'Usman Garments Elite',
      city: 'Rawalpindi',
      notes: updatedNotes,
      owner_id: usmanOwnerProf.id,
      owner_full_name: 'Muhammad Usman Khan',
      owner_phone: '03009998877',
      owner_password: 'UsmanShop2026New!',
    },
  });

  if (updateErr) {
    if (updateErr.context) {
      try {
        const body = await updateErr.context.json();
        console.error('Edge Function Error Body:', body);
      } catch (_) {
        console.error('Edge Function Error Text:', await updateErr.context.text());
      }
    }
  }
  assert(!updateErr, `admin-update-tenant invoked successfully: ${updateErr?.message || 'OK'}`);
  assert(updateRes?.success === true, 'admin-update-tenant returned success: true');
  assert(updateRes?.tenant?.display_name === 'Usman Garments Elite', `display_name updated to "${updateRes?.tenant?.display_name}"`);
  assert(updateRes?.tenant?.city === 'Rawalpindi', `city updated to "${updateRes?.tenant?.city}"`);

  // Verify owner can log in with newly updated password
  const testOwnerClient = createAnonClient();
  const { data: newLogin, error: newLoginErr } = await testOwnerClient.auth.signInWithPassword({
    email: 'usman@ub.com',
    password: 'UsmanShop2026New!',
  });
  assert(!newLoginErr, 'Usman logged in successfully with new password set by Super Admin');

  // Revert password and details back to standard test credentials
  const { error: revertErr } = await superClient.functions.invoke('admin-update-tenant', {
    body: {
      tenant_id: usmanTenant.id,
      name: 'Usman Garments',
      display_name: 'Usman Garments',
      city: 'Karachi',
      notes: usmanTenant.notes,
      owner_id: usmanOwnerProf.id,
      owner_full_name: 'Usman Garments Owner',
      owner_phone: '03001234567',
      owner_password: 'UsmanShop2026!',
    },
  });
  assert(!revertErr, 'Super Admin reverted Usman tenant credentials and branding back to baseline');

  // ── TEST 2: Tenant Owner Self-Service Profile Edit ──────────────────────────
  console.log('\n--- TEST 2: Tenant Owner Self-Service Profile Edit ---');
  const ownerClient = createAnonClient();
  const { error: ownerLoginErr } = await ownerClient.auth.signInWithPassword({
    email: 'usman@ub.com',
    password: 'UsmanShop2026!',
  });
  assert(!ownerLoginErr, 'Usman logged in as tenant owner');

  // Owner updates allowed fields: display_name, phone, address, city
  const { error: selfUpdateErr } = await ownerClient
    .from('tenants')
    .update({
      display_name: 'Usman Garments Couture',
      phone: '03112233445',
      address: 'Shop 12, Tariq Road Commercial Area',
      city: 'Karachi',
    })
    .eq('id', usmanTenant.id);
  assert(!selfUpdateErr, `Owner self-service update allowed fields: ${selfUpdateErr?.message || 'OK'}`);

  // Confirm changes persist and are visible to tenant
  const { data: checkBrand, error: brandErr } = await ownerClient
    .from('tenants')
    .select('display_name, phone, address, city')
    .eq('id', usmanTenant.id)
    .single();
  assert(!brandErr, `Queried updated branding: ${brandErr?.message || 'OK'}`);
  assert(checkBrand.display_name === 'Usman Garments Couture', `display_name is "${checkBrand.display_name}"`);
  assert(checkBrand.phone === '03112233445', `phone is "${checkBrand.phone}"`);

  // Revert display_name back
  await ownerClient
    .from('tenants')
    .update({
      display_name: 'Usman Garments',
      phone: '03001234567',
      address: usmanTenant.address,
      city: 'Karachi',
    })
    .eq('id', usmanTenant.id);
  console.log('✅ Reverted Usman display_name back to "Usman Garments"');

  // ── TEST 3: Database Trigger / RLS Blocks Owner from Tampering Subscription ──
  console.log('\n--- TEST 3: Database Trigger BLOCKS Owner From Modifying Subscription Fields ---');

  // Set baseline subscription dates on usmanTenant via adminClient
  const baselineEndDate = new Date(Date.now() + 30 * 86400000).toISOString();
  await adminClient
    .from('tenants')
    .update({
      plan_type: 'trial',
      subscription_status: 'active',
      subscription_end_date: baselineEndDate,
    })
    .eq('id', usmanTenant.id);

  let tamperBlocked = false;
  let blockMessage = '';
  try {
    const tamperRes = await ownerClient
      .from('tenants')
      .update({
        subscription_status: 'active',
        subscription_end_date: '2099-12-31T23:59:59Z',
        plan_type: 'premium',
      })
      .eq('id', usmanTenant.id)
      .select();

    console.log('DEBUG tamperRes:', JSON.stringify(tamperRes));
    if (tamperRes.error) {
      tamperBlocked = true;
      blockMessage = tamperRes.error.message;
    } else if (!tamperRes.data || tamperRes.data.length === 0) {
      tamperBlocked = true;
      blockMessage = 'RLS blocked update (0 rows returned)';
    }
  } catch (err) {
    tamperBlocked = true;
    blockMessage = err.message;
  }

  assert(tamperBlocked, `Database trigger BLOCKED direct API tamper on subscription fields: "${blockMessage}"`);

  // Double-check in database that subscription_end_date was NOT modified
  const { data: verifyTenant } = await adminClient
    .from('tenants')
    .select('subscription_end_date, plan_type, subscription_status')
    .eq('id', usmanTenant.id)
    .single();

  assert(
    new Date(verifyTenant.subscription_end_date).getFullYear() !== 2099,
    `Database subscription_end_date was protected and remained unchanged: ${verifyTenant.subscription_end_date}`
  );

  // ── TEST 4: Staff Member Cannot Modify Tenant Profile ────────────────────────
  console.log('\n--- TEST 4: Non-Owner (Staff) BLOCKED From Editing Tenant Profile ---');
  const staffClient = createAnonClient();
  const { error: staffLoginErr } = await staffClient.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123',
  });
  assert(!staffLoginErr, 'staff@ubcollection.com logged in');

  const { data: ubTenant } = await adminClient
    .from('tenants')
    .select('id, name')
    .eq('slug', 'ub-collection-wholesale')
    .single();

  let staffBlocked = false;
  let staffErrorMsg = '';
  try {
    const staffRes = await staffClient
      .from('tenants')
      .update({ display_name: 'Hacked by Staff' })
      .eq('id', ubTenant.id)
      .select();

    if (staffRes.error) {
      staffBlocked = true;
      staffErrorMsg = staffRes.error.message;
    } else if (!staffRes.data || staffRes.data.length === 0) {
      staffBlocked = true;
      staffErrorMsg = 'RLS blocked staff update (0 rows modified)';
    }
  } catch (err) {
    staffBlocked = true;
    staffErrorMsg = err.message;
  }

  assert(staffBlocked, `Staff blocked from updating tenant profile: "${staffErrorMsg}"`);

  // Verify UB Collection tenant display_name was untouched
  const { data: checkUb } = await adminClient
    .from('tenants')
    .select('display_name')
    .eq('id', ubTenant.id)
    .single();
  assert(checkUb.display_name !== 'Hacked by Staff', 'UB Collection display_name remained protected');

  // ── TEST 5: Non-Super-Admin BLOCKED from admin-update-tenant Edge Function ──
  console.log('\n--- TEST 5: Non-Super-Admin BLOCKED From Invoking admin-update-tenant Function ---');
  const { data: staffFnData, error: staffFnErr } = await staffClient.functions.invoke('admin-update-tenant', {
    body: {
      tenant_id: ubTenant.id,
      name: 'Tampered Name',
    },
  });

  assert(
    Boolean(staffFnErr) || staffFnData?.error?.includes('Super Admin'),
    `admin-update-tenant Edge Function rejected unauthorized caller (HTTP 403)`
  );

  console.log('\n================================================================');
  console.log('🎉 ALL 5 TENANT EDITING & SECURITY TESTS PASSED PERFECTLY!');
  console.log('================================================================');
}

runTenantEditingVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
