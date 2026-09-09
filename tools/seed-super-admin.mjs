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
  } catch (err) {}
  throw new Error('Could not resolve SUPABASE_SERVICE_ROLE_KEY.');
}

const key = resolveServiceRoleKey();
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function seedSuperAdmin() {
  const email = 'ashaan@platform.admin';
  const password = 'AshaanSuperAdmin2026!';
  const fullName = 'Ashaan (Platform Operator)';

  const { data: usersList, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  let user = usersList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, is_super_admin: true },
    });
    if (createErr) throw createErr;
    user = newUser.user;
    console.log(`Created auth user ${email} (${user.id})`);
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { full_name: fullName, is_super_admin: true },
    });
    console.log(`Updated auth user ${email} (${user.id})`);
  }

  // Upsert into platform_admins
  const { data: adminRow, error: adminErr } = await admin
    .from('platform_admins')
    .upsert({
      id: user.id,
      email,
      full_name: fullName,
      role: 'super_admin',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (adminErr) throw adminErr;
  console.log('Successfully seeded super admin in platform_admins:', adminRow);
}

seedSuperAdmin().catch(err => {
  console.error('Seed super admin failed:', err);
  process.exit(1);
});
