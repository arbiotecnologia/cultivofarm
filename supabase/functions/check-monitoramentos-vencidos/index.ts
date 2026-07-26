// Job interno: requer x-internal-secret. Executado por cron.
import { authenticate, corsHeaders, json, requirePost } from "../_shared/auth-guard.ts";

Deno.serve(async (req) => {
  const early = requirePost(req);
  if (early) return early;

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { caller, supabase } = auth;

  // Somente cron interno OU administrador podem disparar.
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

    const results: string[] = [];
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

      const { data: jaAvisado } = await supabase
        .from("monitoramento_avisos")
        .select("id")
        .eq("registro_consultor_id", mon.id)
        .eq("tipo", "vencido")
        .gte("enviado_em", today)
        .maybeSingle();
      if (jaAvisado) continue;

      // Cria notificação operacional via RPC seguro (respeita schema real).
      await supabase.rpc("rpc_create_notificacao_operacional", {
        _usuario_id: mon.consultor_responsavel,
        _tipo: "alerta",
        _titulo: "Monitoramento Vencido",
        _mensagem: `A reavaliação do talhão ${mon.talhoes?.nome ?? "—"} (${
          mon.clientes?.nome ?? "—"
        }) venceu em ${mon.data_proxima_visita}.`,
        _link: `/visita-tecnica/${mon.id}`,
      });

      if (mon.talhao_id) {
        await supabase
          .from("alertas_agronomicos")
          .update({ nivel_risco: "alto" })
          .eq("talhao_id", mon.talhao_id)
          .eq("status", "monitoramento");
      }

      await supabase.from("monitoramento_avisos").insert({
        registro_consultor_id: mon.id,
        tipo: "vencido",
      });

      // Push via segredo interno (sem service_role no header).
      try {
        await fetch(
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
      } catch (pushErr) {
        console.error("Erro ao enviar push:", pushErr);
      }

      results.push(mon.id);
    }

    return new Response(JSON.stringify({ processed: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return json(500, { error: (error as Error).message });
  }
});
