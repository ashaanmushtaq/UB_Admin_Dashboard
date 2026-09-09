import { execSync } from 'child_process';
import { createClient } from '../pos-pwa/node_modules/@supabase/supabase-js/dist/index.mjs';

const url = process.env.SUPABASE_URL || 'https://ertmvejppdcuyonbizxb.supabase.co';

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
  } catch (err) {
    // ignore and fall through
  }
  throw new Error('Could not resolve SUPABASE_SERVICE_ROLE_KEY. Please set it in your environment or ensure supabase CLI is authenticated.');
}

const key = resolveServiceRoleKey();
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tenantId;
let createdUserId;

async function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

export async function provisionTenant({ name, email, password, fullName = null, planType = 'trial', displayName = null, reassign = false }) {
  const ownerFullName = fullName || name + ' Owner';
  const shopDisplayName = displayName || name;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;

  const plan = planType === 'premium' ? 'premium' : 'trial';
  const durationDays = plan === 'premium' ? 365 : 30;
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // 1. Create tenant
  const tenant = await checked(
    await admin.from('tenants').insert({
      name,
      display_name: shopDisplayName,
      slug,
      company_name: name,
      plan_type: plan,
      subscription_status: 'active',
      subscription_start_date: startDate.toISOString(),
      subscription_end_date: endDate.toISOString(),
      is_active: true,
    }).select('id, name, display_name, slug, plan_type, subscription_end_date').single(),
    'create tenant'
  );
  tenantId = tenant.id;

  // 2. Create or find owner auth user
  let userId;
  const { data: usersList, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw new Error(`list users: ${listErr.message}`);
  const existingUser = usersList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    if (!reassign) {
      throw new Error(`Auth user ${email} already exists. Pass --reassign-existing if you wish to reassign this user to the new tenant.`);
    }
    userId = existingUser.id;
    await checked(
      await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { full_name: ownerFullName, role: 'owner' },
        email_confirm: true,
      }),
      'update existing auth user'
    );
  } else {
    const auth = await checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: ownerFullName, role: 'owner' },
      }),
      'create owner auth user'
    );
    userId = auth.user.id;
    createdUserId = userId;
  }

  // 3. Upsert owner profile bound strictly to new tenant_id
  await checked(
    await admin.from('profiles').upsert({
      id: userId,
      tenant_id: tenantId,
      full_name: ownerFullName,
      role: 'owner',
      is_active: true,
      updated_at: new Date().toISOString(),
    }),
    'create owner profile'
  );

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan_type: tenant.plan_type,
      subscription_end_date: tenant.subscription_end_date,
    },
    owner: {
      id: userId,
      email,
      role: 'owner',
      full_name: displayName,
    },
  };
}

// If run directly from CLI
if (process.argv[1]?.endsWith('provision-tenant.mjs')) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node tools/provision-tenant.mjs <shop-name> <owner-email> <owner-password> [owner-full-name] [trial|premium] [--reassign-existing]');
    process.exit(1);
  }
  const reassignExisting = args.includes('--reassign-existing');
  const filteredArgs = args.filter(a => a !== '--reassign-existing');
  const [tenantName, ownerEmail, ownerPassword, ownerFullName, planArg] = filteredArgs;
  const planType = planArg === 'premium' ? 'premium' : 'trial';

  try {
    const result = await provisionTenant({
      name: tenantName,
      email: ownerEmail,
      password: ownerPassword,
      fullName: ownerFullName,
      planType,
      reassign: reassignExisting,
    });
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } catch (error) {
    console.error('Provisioning failed:', error.message);
    if (createdUserId) {
      console.log(`Compensating: Deleting created auth user ${createdUserId}...`);
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    if (tenantId) {
      console.log(`Compensating: Deleting created tenant ${tenantId}...`);
      await admin.from('tenants').delete().eq('id', tenantId).catch(() => {});
    }
    process.exit(1);
  }
}
