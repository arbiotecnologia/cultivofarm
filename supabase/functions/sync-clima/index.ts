import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fazenda_id } = await req.json();
    if (!fazenda_id) {
      return new Response(JSON.stringify({ error: "fazenda_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get farm coordinates
    const { data: fazenda, error: fazendaError } = await supabase
      .from("fazendas")
      .select("id, nome, latitude, longitude")
      .eq("id", fazenda_id)
      .single();

    if (fazendaError || !fazenda) {
      return new Response(JSON.stringify({ error: "Fazenda não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!fazenda.latitude || !fazenda.longitude) {
      return new Response(
        JSON.stringify({ error: "Fazenda sem coordenadas cadastradas. Atualize latitude e longitude da fazenda." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lat = fazenda.latitude;
    const lon = fazenda.longitude;

    // Fetch last 7 days weather from Open-Meteo
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max,shortwave_radiation_sum&start_date=${startDate}&end_date=${endDate}&timezone=America/Sao_Paulo`;

    const weatherRes = await fetch(apiUrl);
    if (!weatherRes.ok) {
      const errText = await weatherRes.text();
      return new Response(
        JSON.stringify({ error: `Erro na API Open-Meteo: ${weatherRes.status} - ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const weather = await weatherRes.json();
    const daily = weather.daily;

    if (!daily || !daily.time || !daily.time.length) {
      return new Response(JSON.stringify({ error: "Sem dados climáticos disponíveis para estas coordenadas" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build records to insert
    const records = daily.time.map((date: string, i: number) => ({
      fazenda_id,
      data_hora: `${date}T12:00:00-03:00`,
      temperatura: daily.temperature_2m_mean?.[i] ?? null,
      umidade: daily.relative_humidity_2m_mean?.[i] ?? null,
      chuva_mm: daily.precipitation_sum?.[i] ?? 0,
      vento_kmh: daily.wind_speed_10m_max?.[i] ?? null,
      radiacao_solar: daily.shortwave_radiation_sum?.[i] ?? null,
    }));

    // Delete existing data for same period to avoid duplicates
    await supabase
      .from("clima_dados")
      .delete()
      .eq("fazenda_id", fazenda_id)
      .gte("data_hora", `${startDate}T00:00:00`)
      .lte("data_hora", `${endDate}T23:59:59`);

    // Insert new records
    const { error: insertError } = await supabase.from("clima_dados").insert(records);

    if (insertError) {
      return new Response(JSON.stringify({ error: `Erro ao salvar dados: ${insertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        fazenda: fazenda.nome,
        registros: records.length,
        periodo: `${startDate} a ${endDate}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
