import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (INTERNAL_SECRET && authHeader !== `Bearer ${INTERNAL_SECRET}`) {
    return new Response("Forbidden", { status: 403 });
  }

  const results: any[] = [];
  const RUN = crypto.randomUUID().slice(0, 8);
  const PWD = `Campo-E2E-${crypto.randomUUID()}`;
  
  const ROLES: Record<string, string[]> = {
    consultor: ["consultor_tecnico"],
    tecnico: ["tecnico_agronomo"],
    produtor: ["cliente_produtor"],
    outro_produtor: ["cliente_produtor"],
    sem_acesso: []
  };

  const userIds: Record<string, string> = {};
  const clients: Record<string, any> = {};
  const createdUsers: string[] = [];

  try {
    // 1. Setup usuários
    for (const [p, roles] of Object.entries(ROLES)) {
      const email = `campo-e2e-${p}-${RUN}@arbio-staging.test`;
      const { data, error } = await svc.auth.admin.createUser({
        email, password: PWD, email_confirm: true,
        user_metadata: { nome: `Campo E2E ${p} ${RUN}` }
      });
      if (error) throw error;
      const uid = data.user!.id;
      userIds[p] = uid;
      createdUsers.push(uid);

      for (const r of roles) {
        await svc.from("user_roles").insert({ user_id: uid, role: r });
      }

      const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email, password: PWD });
      clients[p] = c;
    }

    const clienteId = '00000000-0000-4000-a000-000000000001';
    const visitaId = '00000000-0000-4000-a000-000000000007';

    // Vincular produtor ao cliente do seed
    await svc.from("user_clientes").insert({ user_id: userIds.produtor, cliente_id: clienteId });

    // 2. Testes de RLS e RPC
    
    // T1: Consultor pode ver a visita se atribuído? (Atribuição manual via SVC)
    await svc.from("registros_consultor").update({ consultor_id: userIds.consultor }).eq("id", visitaId);
    const { data: v1 } = await clients.consultor.from("registros_consultor").select("id").eq("id", visitaId).single();
    results.push({ id: "T1", name: "Consultor vê visita atribuída", status: v1 ? "PASS" : "FAIL" });

    // T2: Outro produtor NÃO pode ver a visita (RLS)
    const { data: v2 } = await clients.outro_produtor.from("registros_consultor").select("id").eq("id", visitaId);
    results.push({ id: "T2", name: "Outro produtor não vê visita alheia", status: v2?.length === 0 ? "PASS" : "FAIL" });

    // T3: Consultor pode salvar campo?
    const { error: e3 } = await clients.consultor.rpc("rpc_salvar_campo_visita", {
      p_id: visitaId,
      p_payload: { observacoes: "Teste E2E" },
      p_expected_version: 0
    });
    results.push({ id: "T3", name: "Consultor salva campo da visita", status: !e3 ? "PASS" : "FAIL", evidence: e3?.message });

    // T4: Técnico pode criar recomendação?
    const { data: r4, error: e4 } = await clients.tecnico.rpc("rpc_upsert_recomendacao_visita", {
      p_id: null,
      p_registro_id: visitaId,
      p_payload: { recomendacao: "Teste recomendação", dose: "1L/ha" }
    });
    results.push({ id: "T4", name: "Técnico cria recomendação", status: !e4 ? "PASS" : "FAIL", evidence: e4?.message });

    // T5: Produtor vê recomendação se visita ainda em rascunho? (Deve falhar/vazio por RLS hardened)
    const { data: v5 } = await clients.produtor.from("registros_consultor_recomendacoes").select("id").eq("registro_id", visitaId);
    results.push({ id: "T5", name: "Produtor não vê recomendação em rascunho", status: v5?.length === 0 ? "PASS" : "FAIL" });

    // T6: Finalizar visita e verificar visibilidade do produtor
    await svc.from("registros_consultor").update({ status: 'finalizado' }).eq("id", visitaId);
    const { data: v6 } = await clients.produtor.from("registros_consultor_recomendacoes").select("id").eq("registro_id", visitaId);
    results.push({ id: "T6", name: "Produtor vê recomendação após finalização", status: v6?.length > 0 ? "PASS" : "FAIL" });

  } catch (err) {
    results.push({ id: "ERROR", name: "Falha catastrófica no harness", status: "FAIL", evidence: err.message });
  } finally {
    // Cleanup de usuários
    for (const uid of createdUsers) {
      await svc.auth.admin.deleteUser(uid);
    }
    // Restaurar visita para rascunho se necessário para re-run
    await svc.from("registros_consultor").update({ status: 'rascunho', consultor_id: null }).eq("id", '00000000-0000-4000-a000-000000000007');
    await svc.from("registros_consultor_recomendacoes").delete().eq("registro_id", '00000000-0000-4000-a000-000000000007');
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
});
