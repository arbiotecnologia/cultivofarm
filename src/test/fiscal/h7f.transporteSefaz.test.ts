/**
 * FASE H7f — Transporte NF-e 4.00 SEFAZ-MG HOMOLOGAÇÃO.
 *
 * Cobre o módulo SOAP puro (envelope, corpos, parsing, sanitização, retry) e
 * faz regressão estática sobre a Edge Function, o SQL de apply/rollback e o
 * postcheck. Nenhuma requisição de rede é feita.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildConsReciNFe,
  buildConsSitNFe,
  buildConsStatServ,
  buildEnvEvento,
  buildEnviNFe,
  buildSoapEnvelope,
  isAuthorized,
  isRetryable,
  parseSefazResult,
  sanitizeSefazText,
  summarizeResponse,
  SefazSoapError,
} from "../../../supabase/functions/_shared/fiscal/nfe/sefazSoap";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const EDGE = "supabase/functions/fiscal-sefaz-transport/index.ts";
const APPLY = "restoration/homologacao-h7/80-h7f-transporte-sefaz-apply.sql";
const ROLLBACK = "restoration/homologacao-h7/81-h7f-transporte-sefaz-rollback.sql";
const POSTCHECK = "restoration/homologacao-h7/82-h7f-postcheck.sql";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof SefazSoapError ? e.code : `UNEXPECTED:${String(e)}`;
  }
  return "NO_ERROR";
}

const SIGNED_NFE =
  '<?xml version="1.0"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe31">' +
  "<ide><tpAmb>2</tpAmb></ide></infNFe><Signature>x</Signature></NFe>";

describe("H7f — corpos SOAP", () => {
  it("monta envelope SOAP 1.2 com o namespace do serviço", () => {
    const env = buildSoapEnvelope("NFeStatusServico4", buildConsStatServ("2"));
    expect(env).toContain("soap12:Envelope");
    expect(env).toContain("wsdl/NFeStatusServico4");
    expect(env).toContain("<cUF>31</cUF>");
  });

  it("recusa tpAmb=1 em todos os corpos", () => {
    expect(codeOf(() => buildConsStatServ("1"))).toBe("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
    expect(codeOf(() => buildConsSitNFe("1", "3".repeat(44)))).toBe("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
    expect(codeOf(() => buildConsReciNFe("1", "3112345678901"))).toBe("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
    expect(
      codeOf(() => buildEnviNFe({ tpAmb: "1", idLote: "1", signedNfeXml: SIGNED_NFE })),
    ).toBe("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
  });

  it("valida chave de acesso e recibo", () => {
    expect(codeOf(() => buildConsSitNFe("2", "123"))).toBe("SEFAZ_ACCESS_KEY_INVALID");
    expect(codeOf(() => buildConsReciNFe("2", "abc"))).toBe("SEFAZ_RECEIPT_INVALID");
  });

  it("bloqueia lote com documento não assinado", () => {
    expect(
      codeOf(() =>
        buildEnviNFe({ tpAmb: "2", idLote: "1", signedNfeXml: "<NFe><infNFe/></NFe>" })
      ),
    ).toBe("SEFAZ_DOCUMENT_NOT_SIGNED");
    expect(
      codeOf(() => buildEnvEvento({ tpAmb: "2", idLote: "1", signedEventXml: "<evento/>" })),
    ).toBe("SEFAZ_EVENT_NOT_SIGNED");
  });

  it("bloqueia documento assinado cujo tpAmb é produção", () => {
    const prod = SIGNED_NFE.replace("<tpAmb>2</tpAmb>", "<tpAmb>1</tpAmb>");
    expect(codeOf(() => buildEnviNFe({ tpAmb: "2", idLote: "1", signedNfeXml: prod })))
      .toBe("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
  });

  it("aceita lote válido e remove o prólogo XML interno", () => {
    const lote = buildEnviNFe({ tpAmb: "2", idLote: "1", signedNfeXml: SIGNED_NFE });
    expect(lote).toContain("<idLote>1</idLote>");
    expect(lote).toContain("<indSinc>1</indSinc>");
    expect(lote.indexOf("<?xml")).toBe(-1);
  });
});

describe("H7f — leitura do retorno", () => {
  const retorno =
    '<retEnviNFe versao="4.00"><tpAmb>2</tpAmb><cStat>104</cStat><xMotivo>Lote processado</xMotivo>' +
    "<protNFe><infProt><chNFe>" + "3".repeat(44) + "</chNFe><dhRecbto>2026-08-26T10:00:00-03:00</dhRecbto>" +
    "<nProt>131260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>" +
    "</infProt></protNFe></retEnviNFe>";

  it("extrai protocolo, chave e cStat do documento", () => {
    const r = parseSefazResult(retorno);
    expect(r.protocolCStat).toBe("100");
    expect(r.nProt).toBe("131260000000001");
    expect(r.chNFe).toHaveLength(44);
    expect(r.tpAmb).toBe("2");
    expect(isAuthorized(r)).toBe(true);
    expect(isRetryable(r)).toBe(false);
  });

  it("rejeição transitória permanece retentável e duplicidade não", () => {
    expect(isRetryable(parseSefazResult("<x><cStat>108</cStat></x>"))).toBe(true);
    expect(isRetryable(parseSefazResult("<x><cStat>204</cStat></x>"))).toBe(false);
    expect(isRetryable(parseSefazResult("<x><cStat>539</cStat></x>"))).toBe(false);
  });

  it("status de serviço em operação é lido", () => {
    const r = parseSefazResult("<retConsStatServ><tpAmb>2</tpAmb><cStat>107</cStat></retConsStatServ>");
    expect(r.cStat).toBe("107");
  });
});

describe("H7f — sanitização", () => {
  it("remove PEM, JWT, chave publicável e base64 longo", () => {
    const dirty =
      "-----BEGIN PRIVATE KEY-----MIIEvQIBADAN-----END PRIVATE KEY----- " +
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r " +
      "sb_secret_abcdefghijklmnop " + "A".repeat(150);
    const clean = sanitizeSefazText(dirty, 1000);
    expect(clean).not.toContain("BEGIN PRIVATE KEY");
    expect(clean).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(clean).not.toContain("sb_secret_");
    expect(clean).not.toContain("A".repeat(150));
    expect(clean).toContain("[REDACTED]");
  });

  it("resumo persistido contém apenas campos públicos", () => {
    const summary = summarizeResponse({
      httpStatus: 200,
      result: parseSefazResult("<x><tpAmb>2</tpAmb><cStat>107</cStat><xMotivo>Ok</xMotivo></x>"),
      durationMs: 12,
    });
    expect(Object.keys(summary).sort()).toEqual(
      ["cStat", "durationMs", "httpStatus", "protocolCStat", "tpAmb", "xMotivo"],
    );
  });
});

describe("H7f — regressão estática da Edge Function", () => {
  const src = read(EDGE);

  it("usa a allowlist canônica e nunca hardcoda host de produção", () => {
    expect(src).toContain("resolveSefazEndpoint");
    expect(src).toContain("assertSefazEndpointAllowed");
    expect(src).not.toMatch(/(^|[^h])nfe\.fazenda\.mg\.gov\.br/);
  });

  it("opera somente em tpAmb=2", () => {
    expect(src).toContain('const TPAMB = "2"');
  });

  it("exige perfil fiscal interno server-side", () => {
    expect(src).toContain("fn_fiscal_can_operate");
    expect(src).toContain("permission_denied");
  });

  it("passa por idempotência e registro append-only", () => {
    expect(src).toContain("rpc_fiscal_sefaz_transmit_begin_v1");
    expect(src).toContain("rpc_fiscal_sefaz_transmit_record_v1");
    expect(src).toContain("idempotentReplay");
  });

  it("não reenvia em replay", () => {
    expect(src).toMatch(/idempotentReplay === true[\s\S]{0,200}replayed: true/);
  });

  it("zera o material mTLS e não loga segredo", () => {
    expect(src).toContain("material.keyPem = \"\"");
    expect(src).not.toMatch(/console\.log/);
    expect(src).toContain("sanitizeSefazText");
  });

  it("não assina documento: consome apenas XML já assinado", () => {
    expect(src).not.toContain("signNfeXml");
    expect(src).toContain("SEFAZ_DOCUMENT_NOT_SIGNED");
  });
});

describe("H7f — regressão estática do SQL", () => {
  const apply = read(APPLY);

  it("cria a tabela com RLS, grants mínimos e sem acesso anon", () => {
    expect(apply).toContain("ENABLE ROW LEVEL SECURITY");
    expect(apply).toContain("REVOKE ALL ON public.fiscal_sefaz_transmissions FROM anon");
    expect(apply).toContain("GRANT SELECT ON public.fiscal_sefaz_transmissions TO authenticated");
    expect(apply).not.toMatch(/GRANT[^;]*TO anon/);
  });

  it("restringe host e ambiente na própria estrutura", () => {
    expect(apply).toContain("endpoint_host = 'hnfe.fazenda.mg.gov.br'");
    expect(apply).toContain("environment_code = '2'");
    expect(apply).toContain("FISCAL_PRODUCTION_ENDPOINT_BLOCKED");
  });

  it("garante append-only, imutabilidade e idempotência", () => {
    expect(apply).toContain("FISCAL_TRANSMISSION_APPEND_ONLY");
    expect(apply).toContain("FISCAL_TRANSMISSION_IMMUTABLE");
    expect(apply).toContain("FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH");
    expect(apply).toContain("pg_advisory_xact_lock");
    expect(apply).toContain("ux_fiscal_sefaz_tx_idem");
  });

  it("SECURITY DEFINER sempre com search_path explícito", () => {
    const definers = apply.match(/SECURITY DEFINER/g) ?? [];
    const paths = apply.match(/SET search_path TO 'public', 'pg_temp'/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });

  it("RPCs de escrita restritas a service_role", () => {
    expect(apply).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_sefaz_transmit_begin_v1[\s\S]{0,160}FROM PUBLIC, anon, authenticated/);
    expect(apply).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_sefaz_transmit_record_v1[\s\S]{0,120}FROM PUBLIC, anon, authenticated/);
  });

  it("não reenvia documento já autorizado", () => {
    expect(apply).toContain("alreadyAuthorized");
    expect(apply).toContain("c_stat IN ('100','150')");
  });

  it("rollback é autocontido e abortivo", () => {
    const rb = read(ROLLBACK);
    expect(rb).toContain("H7F ROLLBACK ABORT");
    expect(rb).toContain("DROP TABLE    IF EXISTS public.fiscal_sefaz_transmissions");
  });

  it("postcheck cobre os invariantes do gate", () => {
    const pc = read(POSTCHECK);
    for (const t of ["H7F-1", "H7F-2", "H7F-3", "H7F-4", "H7F-5", "H7F-6",
                     "H7F-7", "H7F-8", "H7F-9", "H7F-10", "H7F-11"]) {
      expect(pc).toContain(t);
    }
    expect(pc.trim().endsWith("ROLLBACK;")).toBe(true);
  });
});
