import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { solicitacaoId, action } = await req.json();

    const supabase = createClient(
      Deno.env.get("VITE_SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Buscar dados da solicitação
    const { data: sol, error: solError } = await supabase
      .from("portal_solicitacoes")
      .select("*, clientes(nome), fazendas(nome), talhoes(nome)")
      .eq("id", solicitacaoId)
      .single();

    if (solError || !sol) throw new Error("Solicitação não encontrada");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");

    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
      console.log("Calendar Sync: Credentials missing, skipping sync.");
      return new Response(JSON.stringify({ skipped: true, reason: "Credentials not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventData = {
      summary: `Visita A.R Bio: ${sol.clientes?.nome || "Cliente"}`,
      description: `
        Fazenda: ${sol.fazendas?.nome || "—"}
        Talhão: ${sol.talhoes?.nome || "—"}
        Demanda: ${sol.tipo_demanda}
        Descrição: ${sol.descricao || "—"}
        Link: ${Deno.env.get("VITE_SUPABASE_URL")?.replace(".supabase.co", ".lovable.app")}/agenda-tecnica?id=${sol.id}
      `.trim(),
      start: {
        dateTime: sol.data_prevista_atendimento,
        timeZone: "America/Sao_Paulo",
      },
      end: {
        dateTime: new Date(new Date(sol.data_prevista_atendimento).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        timeZone: "America/Sao_Paulo",
      },
    };

    let response;
    if (action === "delete" && sol.external_event_id) {
      response = await fetch(`${GOOGLE_GATEWAY}/calendars/primary/events/${sol.external_event_id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
        },
      });
    } else if (sol.external_event_id) {
      response = await fetch(`${GOOGLE_GATEWAY}/calendars/primary/events/${sol.external_event_id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      });
    } else {
      response = await fetch(`${GOOGLE_GATEWAY}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      });
    }

    let result;
    try {
      result = response.status === 204 ? {} : await response.json();
    } catch (e) {
      result = { error: "Failed to parse response", details: await response.text() };
    }
    
    if (response.ok) {
      if (result.id || action === "delete") {
        if (result.id) {
          await supabase.from("portal_solicitacoes").update({ external_event_id: result.id }).eq("id", sol.id);
        }
        await supabase.from("agenda_sync_log").insert({
          solicitacao_id: sol.id,
          provider: "google",
          external_event_id: result.id || sol.external_event_id,
          status: "synced",
          last_synced_at: new Date().toISOString()
        });
      }
    } else {
       await supabase.from("agenda_sync_log").insert({
          solicitacao_id: sol.id,
          provider: "google",
          status: "failed",
          error_message: typeof result === 'string' ? result : JSON.stringify(result)
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
