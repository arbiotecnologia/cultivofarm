// Job interno: requer x-internal-secret ou administrador.
// Idempotente: unique(registro_consultor_id, tipo, data_referencia).
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
    const today = new Date().toISOString().split("T")[0];

    const { data: monitoramentos, error: fetchError } = await supabase
      .from("registros_consultor")
      .select(`
        id,
        consultor_responsavel,
        cliente_id,
        talhao_id,
        data_proxima_visita,
        objetivo_visita,
        clientes:cliente_id(nome),
        talhoes:talhao_id(nome)
      `)
      .eq("necessidade_intervencao", "monitorar")
      .eq("status", "finalizado")
      .lte("data_proxima_visita", today);

    if (fetchError) throw fetchError;

    const created: string[] = [];
    const skipped: string[] = [];
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

      // Idempotência transacional: tenta reservar via unique constraint.
      const { error: reserveErr } = await supabase
        .from("monitoramento_avisos")
        .insert({ registro_consultor_id: mon.id, tipo: "vencido" });

      if (reserveErr) {
        // 23505 = unique_violation -> já processado hoje
        if ((reserveErr as { code?: string }).code === "23505") {
          skipped.push(mon.id);
          continue;
        }
        console.error("reserve error", reserveErr);
        continue;
      }

      // Notificação interna via RPC segura (bypass RLS via service_role client).
      const { error: rpcErr } = await supabase.rpc(
        "rpc_create_notificacao_operacional",
        {
          _usuario_id: mon.consultor_responsavel,
          _tipo: "alerta",
          _titulo: "Monitoramento Vencido",
          _mensagem: `A reavaliação do talhão ${mon.talhoes?.nome ?? "—"} (${
            mon.clientes?.nome ?? "—"
          }) venceu em ${mon.data_proxima_visita}.`,
          _link: `/visita-tecnica/${mon.id}`,
        },
      );
      if (rpcErr) console.error("notif rpc error", rpcErr);

      if (mon.talhao_id) {
        await supabase
          .from("alertas_agronomicos")
          .update({ nivel_risco: "alto" })
          .eq("talhao_id", mon.talhao_id)
          .eq("status", "monitoramento");
      }

      // Push best-effort; falha NÃO desfaz notificação interna.
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
              user_ids: [mon.consultor_responsavel],
              title: "Monitoramento Vencido ⚠️",
              body: `Talhão ${mon.talhoes?.nome ?? "—"} aguarda reavaliação.`,
              url: `/visita-tecnica/${mon.id}`,
            }),
          },
        );
        if (!resp.ok) pushFailed.push(mon.id);
      } catch {
        pushFailed.push(mon.id);
      }

      created.push(mon.id);
    }

    return new Response(
      JSON.stringify({
        processed: created.length,
        skipped: skipped.length,
        push_failed: pushFailed.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return json(500, { error: "Falha interna" });
  }
});
