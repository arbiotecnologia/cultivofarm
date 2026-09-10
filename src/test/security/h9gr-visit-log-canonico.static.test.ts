/**
 * H9-GR — regressão estática da correção dos defeitos reais do smoke autenticado.
 *
 * Cobre:
 *  1) um check-in = uma linha canônica de log (trigger é a única fonte);
 *  2) as RPCs de presença não gravam log redundante;
 *  3) finalização passa pelo RPC seguro (status + finalized_at + finalized_by),
 *     sem UPDATE direto de status na página de visita técnica;
 *  4) o código técnico de duplicidade nunca chega cru à interface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const raiz = resolve(__dirname, "../../..");
const FORWARD = resolve(
  raiz,
  "restoration/homologacao-h9/h9gr-forwards/20261024000000_h9gr_visit_checkin_log_canonico_v1.sql",
);
const ROLLBACK = resolve(
  raiz,
  "restoration/homologacao-h9/h9gr-rollbacks/20261024000000_h9gr_visit_checkin_log_canonico_v1_rollback.sql",
);

const ler = (p: string) => readFileSync(p, "utf8");

function corpoFuncao(sql: string, assinaturaInicio: string): string {
  const i = sql.indexOf(assinaturaInicio);
  expect(i, `assinatura não encontrada: ${assinaturaInicio}`).toBeGreaterThan(-1);
  const resto = sql.slice(i);
  const fim = resto.indexOf("END; $function$;");
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe("H9-GR — forward e rollback", () => {
  it("forward e rollback existem e são transacionais", () => {
    expect(existsSync(FORWARD)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
    for (const p of [FORWARD, ROLLBACK]) {
      const sql = ler(p);
      expect(sql).toContain("BEGIN;");
      expect(sql).toContain("COMMIT;");
    }
  });

  it("registra exatamente a versão 20261024000000 no ledger", () => {
    const sql = ler(FORWARD);
    expect(sql).toContain("VALUES ('20261024000000', 'h9gr_visit_checkin_log_canonico_v1')");
    expect(ler(ROLLBACK)).toContain("WHERE version = '20261024000000'");
  });

  it("o trigger é a fonte canônica: ação derivada do tipo real + metadata completa", () => {
    const sql = ler(FORWARD);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.log_visita_checkin()");
    expect(sql).toContain("THEN 'checkout_realizado'");
    expect(sql).toContain("ELSE 'checkin_realizado'");
    for (const chave of ["'lat'", "'lng'", "'precisao'", "'tipo_checkin'", "'checkin_id'", "'client_uuid'"]) {
      expect(sql).toContain(chave);
    }
  });

  it("as RPCs de presença não inserem log redundante em visitas_logs", () => {
    const sql = ler(FORWARD);
    const checkin = corpoFuncao(sql, "CREATE OR REPLACE FUNCTION public.rpc_realizar_checkin_visita(");
    const checkout = corpoFuncao(sql, "CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita(");
    expect(checkin).not.toContain("INSERT INTO public.visitas_logs");
    expect(checkout).not.toContain("INSERT INTO public.visitas_logs");
  });

  it("preserva gate de escopo antes da leitura, lock e idempotência pós-lock", () => {
    const sql = ler(FORWARD);
    for (const trecho of [
      "_visita_scope_ok(v_uid, p_registro_id)",
      "FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE",
      "SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid",
      "idempotency_conflict",
    ]) {
      expect(sql).toContain(trecho);
    }
    // gate de escopo antes do lookup idempotente, nas duas RPCs
    for (const assinatura of [
      "CREATE OR REPLACE FUNCTION public.rpc_realizar_checkin_visita(",
      "CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita(",
    ]) {
      const corpo = corpoFuncao(sql, assinatura);
      expect(corpo.indexOf("_visita_scope_ok")).toBeLessThan(
        corpo.indexOf("WHERE client_uuid = p_client_uuid"),
      );
    }
  });

  it("mantém ACL mínima (authenticated/service_role) e revoga anon", () => {
    const sql = ler(FORWARD);
    expect(sql).toContain("TO authenticated, service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.log_visita_checkin() FROM anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.log_visita_checkin() TO service_role;");
  });

  it("não altera as funções já auditadas de visita segura", () => {
    const sql = ler(FORWARD);
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.start_technical_visit_secure");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.finish_technical_visit_secure");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.rpc_finalizar_visita_v2");
  });
});

describe("H9-GR — finalização atômica no frontend", () => {
  const pagina = ler(resolve(raiz, "src/pages/VisitaTecnica.tsx"));

  it("finaliza pelo RPC seguro e não grava status por update direto", () => {
    expect(pagina).toContain('supabase.rpc("rpc_finalizar_visita_v2"');
    expect(pagina).toContain("p_expected_version");
    expect(pagina).toContain('status: "rascunho"');
    expect(pagina).not.toContain('status: finalizar ? "finalizado" : "rascunho"');
  });

  it("remove o status do payload persistido quando a ação é finalizar", () => {
    expect(pagina).toContain("payloadPersistivel");
    expect(pagina).toContain("_statusIgnorado");
  });
});
