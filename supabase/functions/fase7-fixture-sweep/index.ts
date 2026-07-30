import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: claims } = await admin.auth.getClaims(token);
  const uid = claims?.claims?.sub as string | undefined;
  const { data: role } = uid
    ? await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "administrador").maybeSingle()
    : { data: null };
  if (!role) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const removed: string[] = [];
  const errors: string[] = [];
  let page = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of page.data?.users ?? []) {
    if (u.email?.endsWith("@harness.invalid")) {
      await admin.from("user_roles").delete().eq("user_id", u.id);
      await admin.from("partner_users").delete().eq("user_id", u.id);
      await admin.from("profiles").delete().eq("user_id", u.id);
      await admin.from("financial_audit_log").delete().eq("performed_by", u.id);
      await admin.from("partner_order_audit_logs").delete().eq("usuario_id", u.id);
      await admin.from("commercial_audit_log").delete().eq("performed_by", u.id);
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) errors.push(`${error.message} ${JSON.stringify(error)}`.slice(0, 200));
      else removed.push(u.id.slice(0, 8));
    }
  }
  return new Response(JSON.stringify({ removed: removed.length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
