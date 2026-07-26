// Job interno: chama rpc_check_monitoramento_and_notify (transacional).
// - Requer x-internal-secret ou papel administrador.
// - Data em America/Sao_Paulo (resolvida no servidor pela RPC).
// - Push é best-effort APÓS commit; falha de push nunca invalida a notificação.
import { authenticate, corsHeaders, json, requirePost } from "../_shared/auth-guard.ts";

Deno.serve(async (req) => {
  const early = requirePost(req);
  if (early) return early;

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { caller, supabase } = auth;

  if (caller.kind !== "internal" && !caller.roles.includes("administrador")) {
    return json(403, { error: "Somente cron interno" });
  }

  try {
    // Hoje em America/Sao_Paulo (para filtro; a decisão final é feita na RPC).
    const nowBR = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
    );
    const today = nowBR.toISOString().slice(0, 10);

    const { data: monitoramentos, error: fetchError } = await supabase
      .from("registros_consultor")
      .select("id, consultor_responsavel, talhao_id, data_proxima_visita, clientes:cliente_id(nome), talhoes:talhao_id(nome)")
      .eq("necessidade_intervencao", "monitorar")
      .eq("status", "finalizado")
      .lte("data_proxima_visita", today);

    if (fetchError) throw fetchError;

    const created: string[] = [];
    const duplicated: string[] = [];
    const notEligible: string[] = [];
    const rpcFailed: string[] = [];
    const pushFailed: string[] = [];

    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

    for (const mon of (monitoramentos ?? []) as Array<{
      id: string;
      consultor_responsavel: string | null;
      talhao_id: string | null;
      data_proxima_visita: string | null;
      clientes: { nome: string } | null;
      talhoes: { nome: string } | null;
    }>) {
      if (!mon.consultor_responsavel) continue;

      // Chamada transacional: reserva + notificação em uma única transação.
      // Se a notificação falhar dentro da RPC, a reserva TAMBÉM é revertida.
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "rpc_check_monitoramento_and_notify" as never,
        { _registro_id: mon.id } as never,
      );

      if (rpcErr) {
        console.error("check-monitoramentos rpc error");
        rpcFailed.push(mon.id);
        continue;
      }

      const result = (rpcData ?? {}) as {
        created?: boolean;
        reason?: string;
        consultor_id?: string;
        talhao_nome?: string;
      };

      if (!result.created) {
        if (result.reason === "duplicate") duplicated.push(mon.id);
        else notEligible.push(mon.id);
        continue;
      }

      created.push(mon.id);

      // Atualização de risco: best-effort APÓS commit da notificação.
      if (mon.talhao_id) {
        await supabase
          .from("alertas_agronomicos")
          .update({ nivel_risco: "alto" })
          .eq("talhao_id", mon.talhao_id)
          .eq("status", "monitoramento");
      }

      // Push: best-effort APÓS commit; nunca invalida a notificação interna.
      try {
        const resp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": internalSecret,
            },
            body: JSON.stringify({
              user_ids: [result.consultor_id ?? mon.consultor_responsavel],
              title: "Monitoramento Vencido ⚠️",
              body: `Talhão ${result.talhao_nome ?? mon.talhoes?.nome ?? "—"} aguarda reavaliação.`,
              url: `/visita-tecnica/${mon.id}`,
            }),
          },
        );
        if (!resp.ok) pushFailed.push(mon.id);
      } catch {
        pushFailed.push(mon.id);
      }
    }

    return new Response(
      JSON.stringify({
        processed: created.length,
        duplicated: duplicated.length,
        not_eligible: notEligible.length,
        rpc_failed: rpcFailed.length,
        push_failed: pushFailed.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return json(500, { error: "Falha interna" });
  }
});
