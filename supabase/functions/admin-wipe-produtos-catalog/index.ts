// Limpeza transacional do catálogo global, exclusiva de Superadmin de Plataforma.
// A RPC limita o alcance às tabelas globais e falha sem apagar histórico operacional.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

const CONFIRMATION = "APAGAR CATALOGO GLOBAL";
const MIN_REASON_LENGTH = 10;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return handlePreflight(req);
  if (origin && !isTrustedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(origin, { error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json(origin, { error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: isSuperadmin, error: roleErr } = await userClient.rpc(
      "is_platform_superadmin",
      { _user_id: userId },
    );
    if (roleErr) return json(origin, { error: "role_check_failed" }, 500);
    if (!isSuperadmin) return json(origin, { error: "forbidden" }, 403);

    const body = await req.json().catch(() => null) as {
      confirmation?: string;
      reason?: string;
      correlation_id?: string;
    } | null;
    if (body?.confirmation !== CONFIRMATION) {
      return json(origin, { error: "explicit_confirmation_required" }, 409);
    }
    const reason = body.reason?.trim() ?? "";
    if (reason.length < MIN_REASON_LENGTH || reason.length > 500) {
      return json(origin, { error: "reason_required" }, 400);
    }
    if (!body.correlation_id || !isUuid(body.correlation_id)) {
      return json(origin, { error: "correlation_id_required" }, 400);
    }

    const { data, error } = await admin.rpc("platform_wipe_global_product_catalog", {
      p_actor_id: userId,
      p_reason: reason,
      p_correlation_id: body.correlation_id,
    });
    if (error) return json(origin, { error: "wipe_failed" }, 409);
    return json(origin, data);
  } catch (e) {
    console.error("admin_wipe_failed", e instanceof Error ? e.name : "unknown");
    return json(origin, { error: "internal" }, 500);
  }
});

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
