/**
 * FASE H7g — Vínculo canônico run↔invoice (H7G-001), motor de eventos SEFAZ
 * server-side (H7G-002), reprodutibilidade da migration (H7G-003) e semântica
 * de resultado (H7G-004).
 *
 * Cobre o builder/assinador de eventos e faz regressão estática sobre as Edge
 * Functions, o SQL canônico, o rollback, o postcheck e os consumidores de UI.
 * Nenhuma requisição de rede é feita.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEventoXml,
  CANCEL_CODE,
  CORRECTION_CODE,
  CCE_COND_USO,
  escapeXml,
  FiscalEventXmlError,
} from "../../../supabase/functions/_shared/fiscal/nfe/buildEventoXml";
import { isFiscallyAuthorized } from "@/hooks/useFiscalSefazTransmissions";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const TRANSPORT = "supabase/functions/fiscal-sefaz-transport/index.ts";
const EVENT_SIGN = "supabase/functions/fiscal-event-sign/index.ts";
const APPLY = "restoration/homologacao-h7/83-h7g-transporte-evento-apply.sql";
const ROLLBACK = "restoration/homologacao-h7/84-h7g-transporte-evento-rollback.sql";
const POSTCHECK = "restoration/homologacao-h7/85-h7g-postcheck.sql";
const MIGRATION = "supabase/migrations/20260926000000_h7g_transporte_evento_sefaz_v1.sql";

const KEY = "31" + "7".repeat(42);
const CNPJ = "12345678000199";

function base(over: Partial<Parameters<typeof buildEventoXml>[0]> = {}) {
  return {
    tpAmb: "2",
    cOrgao: "31",
    cnpj: CNPJ,
    accessKey: KEY,
    eventCode: CANCEL_CODE,
    seqEvento: 1,
    reason: "Cancelamento por erro de digitacao no destinatario",
    protocol: "131260000000001",
    dhEvento: "2026-09-26T10:00:00-03:00",
    ...over,
  };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof FiscalEventXmlError ? e.code : `UNEXPECTED:${String(e)}`;
  }
  return "NO_ERROR";
}

describe("H7g — builder de evento SEFAZ", () => {
  it("monta cancelamento 110111 com protocolo e justificativa", () => {
    const built = buildEventoXml(base());
    expect(built.xml).toContain("<tpEvento>110111</tpEvento>");
    expect(built.xml).toContain("<descEvento>Cancelamento</descEvento>");
    expect(built.xml).toContain("<nProt>131260000000001</nProt>");
    expect(built.xml).toContain(`<chNFe>${KEY}</chNFe>`);
    expect(built.infEventoId).toBe(`ID${CANCEL_CODE}${KEY}01`);
  });

  it("monta CC-e 110110 com a condição de uso normativa", () => {
    const built = buildEventoXml(base({
      eventCode: CORRECTION_CODE,
      reason: "Correcao da descricao complementar do produto informado",
      protocol: null,
    }));
    expect(built.xml).toContain("<tpEvento>110110</tpEvento>");
    expect(built.xml).toContain(escapeXml(CCE_COND_USO).slice(0, 40));
  });

  it("é fail-closed fora de homologação", () => {
    expect(codeOf(() => buildEventoXml(base({ tpAmb: "1" }))))
      .toBe("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
  });

  it("recusa chave, CNPJ, sequência, motivo e protocolo inválidos", () => {
    expect(codeOf(() => buildEventoXml(base({ accessKey: "123" })))).toBe("SEFAZ_ACCESS_KEY_INVALID");
    expect(codeOf(() => buildEventoXml(base({ cnpj: "123" })))).toBe("FISCAL_EVENT_CNPJ_INVALID");
    expect(codeOf(() => buildEventoXml(base({ seqEvento: 0 })))).toBe("FISCAL_EVENT_SEQUENCE_INVALID");
    expect(codeOf(() => buildEventoXml(base({ seqEvento: 21 })))).toBe("FISCAL_EVENT_SEQUENCE_INVALID");
    expect(codeOf(() => buildEventoXml(base({ reason: "curto" })))).toBe("FISCAL_EVENT_REASON_INVALID");
    expect(codeOf(() => buildEventoXml(base({ protocol: null })))).toBe("FISCAL_EVENT_PROTOCOL_REQUIRED");
  });

  it("recusa tipos de evento não oficiais", () => {
    expect(codeOf(() => buildEventoXml(base({ eventCode: "210200" }))))
      .toBe("FISCAL_EVENT_TYPE_UNSUPPORTED");
  });

  it("escapa conteúdo hostil no motivo", () => {
    const built = buildEventoXml(base({
      reason: "Cancelamento <script>alerta & fim</script> por erro cadastral",
    }));
    expect(built.xml).not.toContain("<script>");
    expect(built.xml).toContain("&lt;script&gt;");
  });
});

describe("H7G-001 — vínculo canônico run↔invoice", () => {
  const edge = read(TRANSPORT);

  it("deriva o invoice do run e bloqueia divergência na Edge", () => {
    expect(edge).toContain("SEFAZ_INVOICE_RUN_MISMATCH");
    expect(edge).toContain("canonicalInvoiceId = run.data.fiscal_invoice_id");
    expect(edge).toContain("_invoice_id: canonicalInvoiceId");
  });

  it("exige run assinado, ambiente 2 e chave válida antes de transmitir", () => {
    expect(edge).toContain("SEFAZ_DOCUMENT_NOT_SIGNED");
    expect(edge).toContain("SEFAZ_ACCESS_KEY_INVALID");
    expect(edge).toContain("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
  });

  it("tem defense-in-depth no banco, não só na Edge", () => {
    const sql = read(APPLY);
    expect(sql).toContain("trg_fiscal_sefaz_tx_link_guard");
    expect(sql).toContain("SEFAZ_INVOICE_RUN_MISMATCH");
  });
});

describe("H7G-002 — evento SEFAZ apenas server-side", () => {
  const edge = read(TRANSPORT);
  const sign = read(EVENT_SIGN);

  it("recusa XML de evento fornecido pelo cliente", () => {
    expect(edge).toContain("SEFAZ_EVENT_XML_NOT_ACCEPTED");
    expect(sign).toContain("SEFAZ_EVENT_XML_NOT_ACCEPTED");
    expect(edge).not.toContain("signedEventXml: String(body.event_xml)");
  });

  it("transporta somente evento canônico assinado e carregado do storage", () => {
    expect(edge).toContain("SEFAZ_EVENT_REQUIRED");
    expect(edge).toContain("v_fiscal_sefaz_event_state");
    expect(edge).toContain("SEFAZ_EVENT_NOT_SIGNED");
    expect(edge).toContain("SEFAZ_EVENT_INVOICE_MISMATCH");
    expect(edge).toContain("_event_id: canonicalEventId");
  });

  it("reutiliza fiscal_events, sem motor paralelo de eventos", () => {
    const sql = read(APPLY);
    expect(sql).toContain("public.fiscal_events");
    expect(sql).toContain("rpc_fiscal_event_sefaz_prepare_v1");
    expect(sql).toContain("rpc_fiscal_event_sefaz_mark_signed_v1");
    expect(sql).toContain("rpc_fiscal_event_sefaz_reconcile_v1");
    expect(sql).not.toMatch(/CREATE TABLE[^;]+fiscal_sefaz_events\b/);
  });

  it("assina no servidor com o cofre A1 e nunca devolve XML nem chave", () => {
    expect(sign).toContain("parseSigningBundle");
    expect(sign).toContain("signEventoXml");
    expect(sign).toContain("material.keyPem = \"\"");
    expect(sign).not.toMatch(/signedXml\s*,?\s*\n\s*\}, 200/);
    expect(sign).not.toContain("keyPem:");
  });

  it("exige perfil fiscal interno e idempotência", () => {
    expect(sign).toContain("fn_fiscal_can_operate");
    expect(sign).toContain("idempotency_key_invalid");
    expect(sign).toContain("rpc_fiscal_event_sefaz_prepare_v1");
  });
});

describe("H7G-003 — reprodutibilidade da migration", () => {
  const mig = read(MIGRATION);

  it("existe migration canônica com o estado final H7f+H7g", () => {
    expect(mig).toContain("fiscal_sefaz_transmissions");
    expect(mig).toContain("rpc_fiscal_event_sefaz_prepare_v1");
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS");
  });

  it("é fail-closed contra ambiente com emissão produtiva", () => {
    expect(mig).toContain("production_emission_allowed");
    expect(mig).toContain("H7G ABORT");
  });

  it("não gera drift com o SQL aplicado no staging", () => {
    const apply = read(APPLY);
    for (const marker of [
      "chk_fiscal_sefaz_tx_outcome",
      "trg_fiscal_sefaz_tx_link_guard",
      "v_fiscal_sefaz_event_state",
      "rpc_fiscal_sefaz_transmit_begin_v1",
    ]) {
      expect(apply).toContain(marker);
      expect(mig).toContain(marker);
    }
  });

  it("possui apply, rollback e postcheck correspondentes", () => {
    expect(read(ROLLBACK)).toContain("H7G ROLLBACK ABORT");
    expect(read(POSTCHECK)).toContain("H7G POSTCHECK");
  });
});

describe("H7G-004 — semântica de resultado", () => {
  it("separa transporte de autorização fiscal na Edge", () => {
    const edge = read(TRANSPORT);
    expect(edge).toContain("transportState");
    expect(edge).toContain("outcome === \"AUTHORIZED\"");
  });

  it("deriva outcome server-side a partir de cStat/protocolo", () => {
    const sql = read(APPLY);
    expect(sql).toContain("v_outcome := 'AUTHORIZED'");
    expect(sql).toContain("v_outcome := 'REJECTED'");
    expect(sql).toContain("v_outcome := 'EVENT_REGISTERED'");
    expect(sql).toContain("v_outcome := 'TRANSPORT_ERROR'");
  });

  it("a UI só considera autorizada com outcome canônico e protocolo", () => {
    expect(isFiscallyAuthorized({ outcome: "AUTHORIZED", nProt: "131260000000001" })).toBe(true);
    expect(isFiscallyAuthorized({ outcome: "AUTHORIZED", nProt: null })).toBe(false);
    expect(isFiscallyAuthorized({ outcome: "REJECTED", nProt: "131260000000001" })).toBe(false);
    expect(isFiscallyAuthorized({ outcome: "PROCESSING", nProt: null })).toBe(false);
  });
});

describe("H7G-005 — segurança das RPCs de escrita", () => {
  const sql = read(APPLY);

  it("todas as funções fiscais novas fixam search_path e são SECURITY DEFINER", () => {
    const fns = sql.split(/CREATE OR REPLACE FUNCTION public\./).slice(1);
    const novas = fns.filter((f) => /^(rpc_fiscal_event_sefaz|rpc_fiscal_sefaz|fn_fiscal_sefaz)/.test(f));
    expect(novas.length).toBeGreaterThan(3);
    for (const f of novas) {
      const head = f.slice(0, f.indexOf("AS $$"));
      expect(head).toContain("SECURITY DEFINER");
      expect(head).toMatch(/SET search_path/);
    }
  });

  it("revoga execução dos perfis públicos e concede só a service_role", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_event_sefaz_prepare_v1[\s\S]{0,200}anon/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1");
    expect(sql).toContain("service_role");
  });
});
