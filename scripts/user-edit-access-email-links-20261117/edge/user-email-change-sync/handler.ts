// CANDIDATO NÃO IMPLANTADO. Destino: supabase/functions/user-email-change-sync/handler.ts
// O TITULAR (JWT verificado) pede a sincronização do próprio profiles.email depois que o Auth confirmou.
// Sem parâmetros: alvo = sub verificado. O SQL só grava quando auth.users.email já é o canônico do pedido e o perfil está ativo.
import { type AuthPort, verifyActor } from "../_shared/user-admin/verify-actor.ts";
export interface Deps {
  enabled: boolean; urlOk: boolean; auth: AuthPort;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  cors(origin: string | null): Record<string, string>; trusted(origin: string | null): boolean; log?(o: unknown): void;
}
export async function handle(req: Request, d: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...d.cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store, private" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: d.cors(origin) });
  if (!d.enabled) return json({ error: "disabled" }, 503);
  if (!d.urlOk) return json({ error: "unavailable" }, 503);
  if (origin && !d.trusted(origin)) return json({ error: "origin_forbidden" }, 403);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const v = await verifyActor(req.headers.get("Authorization"), d.auth);
  if (!v.ok) return json({ error: v.error }, v.status);
  const raw = await req.text().catch(() => "");
  if (raw.length > 64 || (raw.trim() !== "" && raw.trim() !== "{}")) return json({ error: "invalid_args" }, 400);   // nenhum alvo no corpo
  const { data, error } = await d.rpc("user_email_change_sync_service_v1", { p_holder: v.sub });
  if (error) { d.log?.({ fn: "user-email-change-sync", code: error.code ?? null }); return json({ error: error.code === "42501" ? "forbidden" : "failed" }, error.code === "42501" ? 403 : 400); }
  return json(data);
}
