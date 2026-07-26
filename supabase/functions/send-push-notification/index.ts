import {
  authenticate,
  corsHeaders,
  hasAnyRole,
  json,
  requirePost,
} from "../_shared/auth-guard.ts";
import webpush from "https://esm.sh/web-push@3.6.6";

interface PushPayload {
  user_ids: unknown;
  title: unknown;
  body: unknown;
  url?: unknown;
  tag?: unknown;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);
}

Deno.serve(async (req) => {
  const early = requirePost(req);
  if (early) return early;

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { caller, supabase } = auth;

  let payload: PushPayload;
  try {
    payload = (await req.json()) as PushPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 400) : "";
  const url = typeof payload.url === "string" ? payload.url.slice(0, 500) : "/app";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 60) : "default";
  if (!title || !body) return json(400, { error: "title e body são obrigatórios" });
  if (!isStringArray(payload.user_ids) || payload.user_ids.length === 0) {
    return json(400, { error: "user_ids deve ser um array de UUIDs" });
  }

  // Autorização de destinatários:
  // - internal (cron): livre.
  // - usuário staff (administrador/gestor/administrativo): pode enviar para qualquer user_id.
  // - qualquer outro usuário autenticado: só pode enviar para si mesmo.
  const canBroadcast =
    caller.kind === "internal" ||
    hasAnyRole(caller, ["administrador", "gestor", "administrativo"]);

  const targetUserIds = payload.user_ids as string[];
  if (!canBroadcast) {
    if (caller.kind !== "user") return json(403, { error: "Sem autorização" });
    const onlySelf = targetUserIds.every((id) => id === caller.userId);
    if (!onlySelf) return json(403, { error: "Sem autorização para outros usuários" });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@ar-bio.com";
  if (!vapidPublic || !vapidPrivate) {
    return json(503, { error: "Push não configurado (VAPID ausente)" });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const { data: subs, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .in("user_id", targetUserIds);

  if (subError) return json(500, { error: subError.message });

  const notification = JSON.stringify({ title, body, url, tag });
  const results = await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification,
        );
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
        return { id: sub.id, success: true };
      } catch (err) {
        const anyErr = err as { statusCode?: number; message?: string };
        if (anyErr.statusCode === 410 || anyErr.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        return { id: sub.id, success: false };
      }
    }),
  );

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
