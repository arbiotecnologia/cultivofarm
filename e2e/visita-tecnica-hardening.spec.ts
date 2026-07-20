/**
 * E2E — Fase 12.8 Hardening · Visita Técnica Mobile (mínimo)
 *
 * Cobre as regras críticas das RPCs blindadas nas Fases 2–8:
 *   1) rpc_finalizar_visita_v2 → bloqueia sem check-in
 *   2) rpc_finalizar_visita_v2 → bloqueia sem diagnóstico
 *   3) rpc_finalizar_visita_v2 → version_conflict (optimistic lock)
 *   4) rpc_enviar_visita_aprovacao → só aceita status "finalizado"
 *
 * Execução: chamadas diretas às RPCs via supabase-js autenticado.
 * Requer credenciais de um consultor/admin de teste com um registro em rascunho.
 *
 * Variáveis:
 *   - E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   - E2E_CONSULTOR_USER, E2E_CONSULTOR_PASSWORD
 *   - E2E_REGISTRO_RASCUNHO_ID   (uuid de um registro em rascunho controlado)
 *
 * Sem essas variáveis o spec inteiro é pulado (test.skip).
 */
import { test, expect } from "../playwright-fixture";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const USER = process.env.E2E_CONSULTOR_USER ?? "";
const PASS = process.env.E2E_CONSULTOR_PASSWORD ?? "";
const REGISTRO_ID = process.env.E2E_REGISTRO_RASCUNHO_ID ?? "";

const HAS_CREDS = SB_URL && SB_KEY && USER && PASS && REGISTRO_ID;

test.describe("Hardening Visita Técnica — RPCs blindadas", () => {
  test.skip(!HAS_CREDS, "Credenciais E2E de visita técnica não configuradas");

  let sb: SupabaseClient;

  test.beforeAll(async () => {
    sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email: USER, password: PASS });
    if (error) throw error;
  });

  test("finalizar sem check-in ou diagnóstico é bloqueado", async () => {
    const { data: registro } = await sb
      .from("registros_consultor")
      .select("version")
      .eq("id", REGISTRO_ID)
      .single();

    const { data, error } = await sb.rpc("rpc_finalizar_visita_v2", {
      p_registro_id: REGISTRO_ID,
      p_expected_version: registro?.version ?? 1,
    });

    // Espera erro de negócio (checkin_obrigatorio ou diagnostico_obrigatorio)
    // Se o registro estiver completo, o teste deve ser ajustado — aqui exigimos rascunho vazio.
    const combined = `${error?.message ?? ""} ${JSON.stringify(data ?? {})}`;
    expect(combined).toMatch(/checkin_obrigatorio|diagnostico_obrigatorio/i);
  });

  test("finalizar com versão desatualizada retorna version_conflict", async () => {
    const { error } = await sb.rpc("rpc_finalizar_visita_v2", {
      p_registro_id: REGISTRO_ID,
      p_expected_version: 0, // propositalmente stale
    });
    expect(error?.message ?? "").toMatch(/version_conflict|stale/i);
  });

  test("enviar para aprovação exige status finalizado", async () => {
    const { data: registro } = await sb
      .from("registros_consultor")
      .select("version,status")
      .eq("id", REGISTRO_ID)
      .single();

    if (registro?.status === "finalizado") {
      test.info().annotations.push({ type: "skip-reason", description: "registro já finalizado" });
      return;
    }

    const { error } = await sb.rpc("rpc_enviar_visita_aprovacao", {
      p_registro_id: REGISTRO_ID,
      p_expected_version: registro?.version ?? 1,
    });
    expect(error?.message ?? "").toMatch(/status_invalido|nao_finalizado|invalid/i);
  });

  test("check-in por técnico não atribuído é bloqueado (forbidden_visita_nao_atribuido)", async () => {
    const OUTSIDE_USER = process.env.E2E_OUTSIDE_USER ?? "";
    const OUTSIDE_PASS = process.env.E2E_OUTSIDE_PASSWORD ?? "";
    test.skip(!OUTSIDE_USER || !OUTSIDE_PASS, "Credenciais E2E_OUTSIDE_* não configuradas");

    const sbOutside = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const { error: signErr } = await sbOutside.auth.signInWithPassword({
      email: OUTSIDE_USER, password: OUTSIDE_PASS,
    });
    if (signErr) throw signErr;

    const { error } = await sbOutside.rpc("rpc_realizar_checkin_visita", {
      p_registro_id: REGISTRO_ID,
      p_client_uuid: crypto.randomUUID(),
      p_tipo: "chegada_fazenda",
      p_latitude: -15.0,
      p_longitude: -47.0,
      p_precisao: 10,
      p_justificativa_sem_gps: null,
      p_observacoes: "e2e outsider",
      p_captured_at_local: new Date().toISOString(),
      p_solicitacao_id: null,
      p_cliente_id: null,
      p_fazenda_id: null,
      p_talhao_id: null,
      p_foto_path: null,
    });

    expect(error?.message ?? "").toMatch(/forbidden_visita_nao_atribuido|forbidden|42501/i);
  });

  test("gestão de equipe: atribuir sem permissão é bloqueado", async () => {
    const OUTSIDE_USER = process.env.E2E_OUTSIDE_USER ?? "";
    const OUTSIDE_PASS = process.env.E2E_OUTSIDE_PASSWORD ?? "";
    test.skip(!OUTSIDE_USER || !OUTSIDE_PASS, "Credenciais E2E_OUTSIDE_* não configuradas");

    const sbOutside = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    await sbOutside.auth.signInWithPassword({ email: OUTSIDE_USER, password: OUTSIDE_PASS });

    const { error } = await sbOutside.rpc("rpc_assign_visit_technician", {
      p_registro_id: REGISTRO_ID,
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_role: "tecnico",
    });
    expect(error?.message ?? "").toMatch(/forbidden_gestao_equipe|forbidden|42501/i);
  });

  test("remover técnico sem motivo é bloqueado", async () => {
    const { error } = await sb.rpc("rpc_remove_visit_technician", {
      p_registro_id: REGISTRO_ID,
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_reason: null,
    });
    expect(error?.message ?? "").toMatch(/motivo_remocao_obrigatorio|forbidden_gestao_equipe|atribuicao_inexistente/i);
  });

  test("remover técnico com presença ativa é bloqueado", async () => {
    const TARGET = process.env.E2E_ACTIVE_TECNICO_ID ?? "";
    test.skip(!TARGET, "E2E_ACTIVE_TECNICO_ID não configurado");
    const { error } = await sb.rpc("rpc_remove_visit_technician", {
      p_registro_id: REGISTRO_ID,
      p_user_id: TARGET,
      p_reason: "teste e2e",
    });
    expect(error?.message ?? "").toMatch(/remocao_bloqueada_presenca_ativa/i);
  });

  test("force checkout exige motivo", async () => {
    const TARGET = process.env.E2E_ACTIVE_TECNICO_ID ?? "";
    test.skip(!TARGET, "E2E_ACTIVE_TECNICO_ID não configurado");
    const { error } = await sb.rpc("rpc_force_checkout_visita", {
      p_registro_id: REGISTRO_ID,
      p_target_user_id: TARGET,
      p_reason: "",
    });
    expect(error?.message ?? "").toMatch(/motivo_obrigatorio/i);
  });

  test("helper has_completed_visit_presence responde boolean", async () => {
    const { data, error } = await sb.rpc("has_completed_visit_presence", {
      p_registro_id: REGISTRO_ID,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("boolean");
  });

  test("checkin RPC rejeita tipo=checkout (deve usar RPC dedicada)", async () => {
    const { error } = await sb.rpc("rpc_realizar_checkin_visita", {
      p_registro_id: REGISTRO_ID,
      p_client_uuid: crypto.randomUUID(),
      p_tipo: "checkout",
      p_latitude: null, p_longitude: null, p_precisao: null,
      p_justificativa_sem_gps: "teste",
      p_observacoes: null,
      p_captured_at_local: new Date().toISOString(),
      p_solicitacao_id: null, p_cliente_id: null, p_fazenda_id: null,
      p_talhao_id: null, p_foto_path: null,
    });
    expect(error?.message ?? "").toMatch(/use_rpc_realizar_checkout_visita/i);
  });
});

