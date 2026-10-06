import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useSalvarRascunhoPlano, usePublicarRascunhoPlano, mensagemErroComCorrelacao } from "@/hooks/usePlataformaSaaS";
import { confirmacaoPublicarValida, confirmacaoPublicarNormalizada, motivoComercialNormalizado } from "@/components/plataforma/commercialDraftState";

const sql = readFileSync("supabase/migrations/20261006191816_1f5205f4-9482-4fed-ba16-a5f7baaf0cb5.sql", "utf8");
const editor = readFileSync("src/components/plataforma/VersaoComercialEditor.tsx", "utf8");
const fn = (name: string) => sql.slice(sql.indexOf(`FUNCTION public.${name}`), sql.indexOf("$function$;", sql.indexOf(`FUNCTION public.${name}`)) + 1 || undefined);

describe("Correção pós-revisão — catálogo B2B (SQL)", () => {
  it("can_view_catalog_internal exige _uid = auth.uid() e não usa fn_authz_uid_scope_ok", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.can_view_catalog_internal"), sql.indexOf("get_partner_catalog_secure"));
    expect(body).toContain("_uid = auth.uid()");
    expect(body).not.toContain("fn_authz_uid_scope_ok");
    expect(body).toContain("o.status = 'ativa'");
    expect(body).toContain("catalogo_precos");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.can_view_catalog_internal(uuid) FROM PUBLIC, anon;");
  });
  it("get_partner_catalog_secure vincula partner à organização e ao partner_users", () => {
    const body = fn("get_partner_catalog_secure");
    expect(body).toContain("pa.deleted_at IS NULL");
    expect(body).toContain("s.org_partner IS DISTINCT FROM p_partner_id");
    expect(body).toContain("s.user_partner IS DISTINCT FROM p_partner_id");
    expect(body).toContain("forbidden_financial_terms");
    expect(body).toContain("feature_not_entitled");
    expect(body).toContain("p.b2b_enabled = true");
    expect(body).not.toContain("COALESCE(p.b2b_enabled,true)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_partner_catalog_secure(uuid) FROM PUBLIC, anon;");
  });
  it("catálogo técnico: só ficha aprovada; técnico e interno sem preço", () => {
    const body = fn("get_partner_catalog_tecnico_secure");
    expect(body).toContain("ptp.status_validacao = 'aprovado'");
    expect(body).toContain("mtp.status_validacao = 'aprovado'");
    expect(body).toContain("v_show_fin := v_is_partner AND NOT v_is_tec");
    expect(body).toContain("s.user_partner IS DISTINCT FROM s.org_partner");
    expect(body).toContain("NOT s.partner_valid");
  });
  it("preço-base deixa de ser executável por authenticated", () => {
    expect(sql).toContain("fn_b2b_resolve_base_unit_price(uuid, uuid, uuid, text, numeric, date) FROM PUBLIC, anon, authenticated");
  });
});

describe("Editor comercial — payloads reais", () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);
  beforeEach(() => rpc.mockReset());

  it("Salvar rascunho chama platform_save_plan_version_draft com a assinatura do banco", async () => {
    rpc.mockResolvedValue({ data: "d1", error: null });
    const { result } = renderHook(() => useSalvarRascunhoPlano(), { wrapper });
    await act(() => result.current.mutateAsync({
      draftId: null, planKey: "base", priceAmount: "59.90", currency: "BRL", billingCycle: "monthly", trialDays: null,
      limits: {}, effectiveFrom: null, features: [{ feature_key: "visitas_tecnicas", enabled: true }], reason: "ok", idempotencyKey: "k1",
    }));
    expect(rpc).toHaveBeenCalledWith("platform_save_plan_version_draft", {
      _draft_id: null, _plan_key: "base", _price_amount: "59.90", _currency: "BRL", _billing_cycle: "monthly", _trial_days: null,
      _limits: {}, _effective_from: null, _features: [{ feature_key: "visitas_tecnicas", enabled: true }], _reason: "ok", _idempotency_key: "k1",
    });
  });

  it("Publicar chama platform_publish_plan_version_draft e expõe código de correlação no erro", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "platform_forbidden" } });
    const { result } = renderHook(() => usePublicarRascunhoPlano(), { wrapper });
    let err: unknown;
    await act(async () => {
      try { await result.current.mutateAsync({ draftId: "d1", reason: "ok", confirmation: "PUBLICAR", idempotencyKey: "k2" }); }
      catch (e) { err = e; }
    });
    expect(rpc).toHaveBeenCalledWith("platform_publish_plan_version_draft", {
      _draft_id: "d1", _reason: "ok", _idempotency_key: "k2", _confirmation: "PUBLICAR",
    });
    expect(mensagemErroComCorrelacao(err)).toMatch(/código: [0-9A-F]{8}\)$/);
  });

  it("confirmação PUBLICAR tolera espaços, mas não minúsculas; motivo mínimo 2", () => {
    expect(confirmacaoPublicarValida("  PUBLICAR ")).toBe(true);
    expect(confirmacaoPublicarNormalizada(" PUBLICAR ")).toBe("PUBLICAR");
    expect(confirmacaoPublicarValida("publicar")).toBe(false);
    expect(motivoComercialNormalizado(" a ")).toBeNull();
    expect(motivoComercialNormalizado("ok")).toBe("ok");
  });

  it("editor usa moedas fechadas, limites estruturados e erro visível", () => {
    expect(editor).toContain("Limites de uso do plano");
    expect(editor).not.toContain("Limites em JSON");
    expect(editor).toContain('role="alert"');
    expect(editor).toContain("confirmacaoPublicarNormalizada(confirmation)");
  });
});
