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

    // 1. Verify caller has super_admin role using caller's JWT
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

    // 2. Parse request body
    const body = await req.json();
    const {
      tenant_id,
      name,
      display_name,
      company_name,
      phone,
      address,
      city,
      notes,
      plan_type,
      subscription_status,
      subscription_start_date,
      subscription_end_date,
      is_active,
      owner_id,
      owner_full_name,
      owner_phone,
      owner_email,
      owner_password,
    } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "Missing required field: tenant_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Prepare tenant update payload
    const tenantUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) tenantUpdates.name = name;
    if (display_name !== undefined) tenantUpdates.display_name = display_name;
    if (company_name !== undefined) tenantUpdates.company_name = company_name;
    if (phone !== undefined) tenantUpdates.phone = phone;
    if (address !== undefined) tenantUpdates.address = address;
    if (city !== undefined) tenantUpdates.city = city;
    if (notes !== undefined) tenantUpdates.notes = notes;
    if (plan_type !== undefined) {
      if (!["trial", "premium"].includes(plan_type)) {
        return new Response(JSON.stringify({ error: "Invalid plan_type. Must be 'trial' or 'premium'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tenantUpdates.plan_type = plan_type;
    }
    if (subscription_status !== undefined) {
      if (!["active", "suspended", "expired"].includes(subscription_status)) {
        return new Response(JSON.stringify({ error: "Invalid subscription_status. Must be 'active', 'suspended', or 'expired'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tenantUpdates.subscription_status = subscription_status;
    }
    if (subscription_start_date !== undefined) tenantUpdates.subscription_start_date = subscription_start_date;
    if (subscription_end_date !== undefined) tenantUpdates.subscription_end_date = subscription_end_date;
    if (is_active !== undefined) tenantUpdates.is_active = Boolean(is_active);

    // Update public.tenants
    const { data: updatedTenant, error: tenantErr } = await admin
      .from("tenants")
      .update(tenantUpdates)
      .eq("id", tenant_id)
      .select("id, name, display_name, slug, company_name, plan_type, subscription_status, subscription_start_date, subscription_end_date, phone, address, city, notes, is_active")
      .single();

    if (tenantErr) {
      return new Response(JSON.stringify({ error: `Update tenant failed: ${tenantErr.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Handle owner updates if owner_id or owner details provided
    let resolvedOwnerId = owner_id;
    if (!resolvedOwnerId) {
      // Look up owner profile for this tenant
      const { data: ownerProf } = await admin
        .from("profiles")
        .select("id, full_name, phone")
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (ownerProf) {
        resolvedOwnerId = ownerProf.id;
      }
    }

    let updatedOwner: Record<string, any> | null = null;

    if (resolvedOwnerId) {
      // 4a. Update profile row
      const profileUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (owner_full_name !== undefined) profileUpdates.full_name = owner_full_name;
      if (owner_phone !== undefined) profileUpdates.phone = owner_phone;

      if (Object.keys(profileUpdates).length > 1) {
        const { data: profData, error: profErr } = await admin
          .from("profiles")
          .update(profileUpdates)
          .eq("id", resolvedOwnerId)
          .select("id, full_name, phone, role")
          .single();

        if (profErr) {
          return new Response(JSON.stringify({ error: `Update profile failed: ${profErr.message}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        updatedOwner = profData;
      }

      // 4b. Update auth credentials if email or password provided
      const authUpdates: Record<string, any> = {};
      if (owner_email) {
        authUpdates.email = owner_email.trim();
        authUpdates.email_confirm = true;
      }
      if (owner_password && owner_password.trim().length > 0) {
        if (owner_password.trim().length < 6) {
          return new Response(JSON.stringify({ error: "Owner password must be at least 6 characters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUpdates.password = owner_password.trim();
      }

      if (owner_full_name !== undefined || owner_phone !== undefined) {
        authUpdates.user_metadata = {
          full_name: owner_full_name || updatedTenant.name + " Owner",
          role: "owner",
          phone: owner_phone || updatedTenant.phone || "",
        };
      }

      if (Object.keys(authUpdates).length > 0) {
        const { data: authUser, error: authErr } = await admin.auth.admin.updateUserById(
          resolvedOwnerId,
          authUpdates
        );

        if (authErr) {
          return new Response(JSON.stringify({ error: `Update auth user credentials failed: ${authErr.message}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        updatedOwner = {
          ...(updatedOwner || {}),
          id: authUser.user.id,
          email: authUser.user.email,
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant: updatedTenant,
        owner: updatedOwner,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
