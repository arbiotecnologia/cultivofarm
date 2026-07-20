import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date().toISOString().split("T")[0];

    // 1. Buscar monitoramentos vencendo hoje ou amanhã
    const { data: monitoramentos, error: fetchError } = await supabaseAdmin
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

    const results = [];

    for (const mon of monitoramentos || []) {
      // Verificar se já avisamos hoje
      const { data: jaAvisado } = await supabaseAdmin
        .from("monitoramento_avisos")
        .select("id")
        .eq("registro_consultor_id", mon.id)
        .eq("tipo", "vencido")
        .gte("enviado_em", today)
        .maybeSingle();

      if (jaAvisado) continue;

      // 2. Criar notificações operacionais
      await supabaseAdmin.from("notificacoes_operacionais").insert({
        user_id: mon.consultor_responsavel,
        tipo: "alerta",
        titulo: "Monitoramento Vencido",
        mensagem: `A reavaliação do talhão ${mon.talhoes?.nome} (${mon.clientes?.nome}) venceu em ${mon.data_proxima_visita}.`,
        link: `/visita-tecnica/${mon.id}`,
        urgencia: "alta"
      });

      // 3. Atualizar alerta agronômico para risco alto
      await supabaseAdmin
        .from("alertas_agronomicos")
        .update({ nivel_risco: "alto" })
        .eq("talhao_id", mon.talhao_id)
        .eq("status", "monitoramento");

      // 4. Registrar aviso enviado
      await supabaseAdmin.from("monitoramento_avisos").insert({
        registro_consultor_id: mon.id,
        tipo: "vencido"
      });

      // 5. Enviar Push Notification
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
          },
          body: JSON.stringify({
            user_ids: [mon.consultor_responsavel],
            title: "Monitoramento Vencido ⚠️",
            body: `Talhão ${mon.talhoes?.nome} aguarda reavaliação.`,
            url: `/visita-tecnica/${mon.id}`
          })
        });
      } catch (pushErr) {
        console.error("Erro ao enviar push:", pushErr);
      }

      results.push(mon.id);
    }

    return new Response(JSON.stringify({ processed: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
