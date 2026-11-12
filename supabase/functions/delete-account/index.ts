// 243Kulture — delete-account Edge Function
// Requires JWT (verify_jwt = true). Uses service_role only on the server.
// Flow: validate session → mark deletion request → auth.admin.deleteUser → cascade cleans profiles.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let confirm = "";
  try {
    const body = await req.json();
    confirm = String(body?.confirm ?? "");
  } catch {
    confirm = "";
  }

  // Require explicit confirm token from the client (second step in UI).
  if (confirm !== "DELETE") {
    return new Response(JSON.stringify({ error: "Confirmation required", code: "confirm_required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Audit row + profile flag (best-effort before hard delete)
  await admin.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", user.id);
  const { data: reqRow } = await admin
    .from("account_deletion_requests")
    .insert({
      user_id: user.id,
      status: "processing",
      source: "app",
      note: `edge:delete-account:${user.id}`,
    })
    .select("id")
    .maybeSingle();

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    if (reqRow?.id) {
      await admin
        .from("account_deletion_requests")
        .update({ status: "failed", note: delErr.message })
        .eq("id", reqRow.id);
    }
    return new Response(JSON.stringify({ error: delErr.message, code: "delete_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // user_id becomes NULL via ON DELETE SET NULL; keep completed audit.
  if (reqRow?.id) {
    await admin
      .from("account_deletion_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        note: `edge:delete-account:completed:${user.id}`,
      })
      .eq("id", reqRow.id);
  }

  return new Response(
    JSON.stringify({ ok: true, deleted_user_id: user.id, request_id: reqRow?.id ?? null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
