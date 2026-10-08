// Fase 0.1: broadcast restrito a internal/service_role/administrador.
// Usuário comum não pode disparar push (nem para si). Assinaturas continuam via tabela push_subscriptions (RLS auth.uid()=user_id).
import { authenticate, corsHeaders, json, requirePost } from "../_shared/auth-guard.ts";

const MAX_TARGETS = 500;
const MAX_TITLE = 120;
const MAX_BODY = 400;
const MAX_URL = 500;
const MAX_TAG = 60;

interface PushPayload {
  user_ids: unknown;
  title: unknown;
  body: unknown;
  url?: unknown;
  tag?: unknown;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);

const isInternalLink = (u: string): boolean =>
  /^\/[A-Za-z0-9_\-./?=&%]{0,500}$/.test(u);

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

Deno.serve(async (req) => {
  const early = requirePost(req);
  if (early) return early;

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { caller, supabase } = auth;

  // P1 containment: this legacy contract carries no proven source/tenant.
  // Never read subscriptions or send, even if a delivery flag is changed.
  return json(503, { error: "NOTIF_EXTERNAL_DELIVERY_DISABLED" });

  const canDispatch =
    caller.kind === "internal" ||
    (caller.kind === "user" && caller.roles.includes("administrador"));
  if (!canDispatch) return json(403, { error: "Sem autorização para disparar push" });

  let payload: PushPayload;
  try {
    payload = (await req.json()) as PushPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const title = typeof payload.title === "string" ? payload.title.slice(0, MAX_TITLE) : "";
  const body = typeof payload.body === "string" ? payload.body.slice(0, MAX_BODY) : "";
  const url = typeof payload.url === "string" ? payload.url.slice(0, MAX_URL) : "/app";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, MAX_TAG) : "default";
  if (!title || !body) return json(400, { error: "title e body são obrigatórios" });
  if (!isInternalLink(url)) return json(400, { error: "url deve ser interna" });
  if (!isStringArray(payload.user_ids) || payload.user_ids.length === 0) {
    return json(400, { error: "user_ids deve ser um array de UUIDs" });
  }
  const targetUserIds = Array.from(new Set(payload.user_ids as string[]));
  if (targetUserIds.length > MAX_TARGETS) {
    return json(400, { error: `Máximo de ${MAX_TARGETS} destinatários` });
  }
  if (!targetUserIds.every((id) => UUID_RE.test(id))) {
    return json(400, { error: "user_ids inválido" });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@ar-bio.com";
  if (!vapidPublic || !vapidPrivate) {
    return json(503, { error: "Push não configurado (VAPID ausente)" });
  }

  const { data: subs, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .in("user_id", targetUserIds);
  if (subError) return json(500, { error: "Falha ao carregar assinaturas" });

  const notification = JSON.stringify({ title, body, url, tag });
  const results = await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        throw new Error("NOTIF_EXTERNAL_DELIVERY_DISABLED");
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
        return { success: true };
      } catch (err) {
        const anyErr = err as { statusCode?: number };
        if (anyErr.statusCode === 410 || anyErr.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        return { success: false };
      }
    }),
  );

  return new Response(
    JSON.stringify({
      dispatched: results.length,
      succeeded: results.filter((r) => r.success).length,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
