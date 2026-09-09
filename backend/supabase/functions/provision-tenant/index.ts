import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Verify caller has super_admin role using their JWT
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: isSuper, error: superErr } = await callerClient.rpc("is_super_admin");
    if (superErr || !isSuper) {
      return new Response(JSON.stringify({ error: "Access denied: Super Admin privileges required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request parameters
    const body = await req.json();
    const {
      name,
      display_name,
      logo_url,
      owner_email,
      owner_password,
      owner_full_name,
      plan_type = "trial",
    } = body;

    if (!name || !owner_email || !owner_password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, owner_email, owner_password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const plan = plan_type === "premium" ? "premium" : "trial";
    const durationDays = plan === "premium" ? 365 : 30;
    const ownerName = owner_full_name || `${name} Owner`;
    const shopDisplayName = display_name || name;
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let tenantId: string | null = null;
    let userId: string | null = null;

    try {
      // 3. Create Tenant
      const { data: tenant, error: tenantErr } = await admin
        .from("tenants")
        .insert({
          name,
          display_name: shopDisplayName,
          logo_url: logo_url || null,
          slug,
          company_name: name,
          plan_type: plan,
          subscription_status: "active",
          subscription_start_date: startDate.toISOString(),
          subscription_end_date: endDate.toISOString(),
          is_active: true,
        })
        .select("id, name, display_name, slug, plan_type, subscription_status, subscription_end_date")
        .single();

      if (tenantErr) throw new Error(`Create tenant failed: ${tenantErr.message}`);
      tenantId = tenant.id;

      // 4. Create Owner Auth User
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: owner_email,
        password: owner_password,
        email_confirm: true,
        user_metadata: { full_name: ownerName, role: "owner" },
      });

      if (authErr) throw new Error(`Create auth user failed: ${authErr.message}`);
      userId = authUser.user.id;

      // 5. Create Owner Profile
      const { error: profileErr } = await admin.from("profiles").insert({
        id: userId,
        tenant_id: tenantId,
        full_name: ownerName,
        role: "owner",
        is_active: true,
      });

      if (profileErr) throw new Error(`Create profile failed: ${profileErr.message}`);

      return new Response(
        JSON.stringify({
          success: true,
          tenant,
          owner: {
            id: userId,
            email: owner_email,
            full_name: displayName,
            role: "owner",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      // Rollback compensation
      if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
      if (tenantId) await admin.from("tenants").delete().eq("id", tenantId).catch(() => {});
      throw err;
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
