/**
 * E2E — Módulo Protocolos · Culturas, Objetivos de Visita, Recomendações,
 * Catálogo, Simulador e Condições e Preços.
 *
 * Ambiente: STAGING apenas. Nunca apontar para produção.
 *
 * Variáveis:
 *   - E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY
 *   - E2E_ADMIN_USER, E2E_ADMIN_PASSWORD
 * Sem elas o spec inteiro é pulado (test.skip).
 */
import { test, expect } from "../playwright-fixture";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const USER = process.env.E2E_ADMIN_USER ?? "";
const PASS = process.env.E2E_ADMIN_PASSWORD ?? "";
const HAS_CREDS = Boolean(SB_URL && SB_KEY && USER && PASS);

const TAG = `__E2E_CULTURA_${Date.now()}__`;

test.describe("Protocolos — Culturas e fluxos relacionados", () => {
  test.skip(!HAS_CREDS, "Credenciais E2E de administrador não configuradas");

  let sb: SupabaseClient;
  let culturaId = "";

  test.beforeAll(async () => {
    sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email: USER, password: PASS });
    if (error) throw error;
  });

  test.afterAll(async () => {
    if (culturaId) {
      await sb.from("objetivos_visita_sugestoes").delete().eq("cultura_id", culturaId);
      await sb.from("culturas").delete().eq("id", culturaId);
    }
    await sb?.auth.signOut();
  });

  test("cria cultura e bloqueia duplicidade case-insensitive", async () => {
    const ins = await sb.from("culturas").insert([{ nome: TAG }]).select("id").single();
    expect(ins.error).toBeNull();
    culturaId = ins.data!.id;

    const dup = await sb.from("culturas").insert([{ nome: `  ${TAG.toLowerCase()} ` }]);
    expect(dup.error).not.toBeNull();
    expect(dup.error!.code).toBe("23505");
  });

  test("cultura em uso não pode ser excluída fisicamente", async () => {
    const obj = await sb
      .from("objetivos_visita_sugestoes")
      .insert([{ cultura_id: culturaId, texto: `${TAG} objetivo`, ativo: true }]);
    expect(obj.error).toBeNull();

    const del = await sb.from("culturas").delete().eq("id", culturaId);
    expect(del.error).not.toBeNull();
    expect((del.error!.message || "").toLowerCase()).toContain("cultura em uso");
  });

  test("desativação substitui exclusão e é auditada", async () => {
    const upd = await sb.from("culturas").update({ ativo: false }).eq("id", culturaId);
    expect(upd.error).toBeNull();
    const { data } = await sb
      .from("culturas")
      .select("ativo, desativada_em, desativada_por")
      .eq("id", culturaId)
      .single();
    expect(data!.ativo).toBe(false);
    expect(data!.desativada_em).not.toBeNull();
    expect(data!.desativada_por).not.toBeNull();
  });

  test("objetivos de visita da cultura seguem consultáveis", async () => {
    const { data, error } = await sb
      .from("objetivos_visita_sugestoes")
      .select("texto")
      .eq("cultura_id", culturaId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("catálogo unificado responde e não depende de cultura", async () => {
    const produtos = await sb.from("produtos").select("id, codigo, nome").limit(5);
    expect(produtos.error).toBeNull();
    const micros = await sb.from("microrganismos").select("id, codigo, nome").limit(5);
    expect(micros.error).toBeNull();
  });

  test("recomendações por cultura são consultáveis", async () => {
    const prod = await sb.from("product_crop_recommendations").select("id, cultura_id, objetivo_uso").limit(5);
    expect(prod.error).toBeNull();
    const micro = await sb.from("microorganism_crop_recommendations").select("id, cultura_id").limit(5);
    expect(micro.error).toBeNull();
  });

  test("condições e preços permanecem acessíveis ao administrador", async () => {
    const regras = await sb.from("commercial_price_rules").select("id").limit(1);
    expect(regras.error).toBeNull();
    const planos = await sb.from("commercial_payment_plan_assignments").select("id").limit(1);
    expect(planos.error).toBeNull();
  });

  test("reativação limpa a auditoria de desativação", async () => {
    const upd = await sb.from("culturas").update({ ativo: true }).eq("id", culturaId);
    expect(upd.error).toBeNull();
    const { data } = await sb
      .from("culturas")
      .select("ativo, desativada_em, desativada_por")
      .eq("id", culturaId)
      .single();
    expect(data!.ativo).toBe(true);
    expect(data!.desativada_em).toBeNull();
    expect(data!.desativada_por).toBeNull();
  });
});
