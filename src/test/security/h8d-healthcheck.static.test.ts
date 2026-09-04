/**
 * FASE H8-D — Testes estáticos da suíte de healthcheck de homologação.
 *
 * Validam, sem tocar em banco nem em rede:
 *   1. que a consulta é read-only (nenhum DDL/DML);
 *   2. que o script tem gates fail-closed de identidade e nunca aponta para produção;
 *   3. que a saída JSON é sanitizada (sem segredo, DSN, token ou PII);
 *   4. a classificação de severidade agregada nos cenários OK / WARN / CRITICAL / UNKNOWN.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIR = join(ROOT, "restoration/homologacao-h8");
const FIXTURES = join(DIR, "h8d-fixtures");
const SQL = readFileSync(join(DIR, "h8d-healthcheck.sql"), "utf8");
const SH = readFileSync(join(DIR, "h8d-healthcheck.sh"), "utf8");

const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const PRODUCTION_REF = "navfzbwgwzruipouyfnk";

type Sinal = {
  categoria: string;
  sinal: string;
  status: "OK" | "WARN" | "CRITICAL" | "UNKNOWN";
  medida: string;
  limiar: string;
  resposta: string;
};
type Relatorio = {
  suite: string;
  ambiente: string;
  project_ref: string;
  gerado_em_utc: string;
  resumo: { total: number; ok: number; warn: number; critical: number; unknown: number; status: string };
  sinais: Sinal[];
};

const carregar = (nome: string): Relatorio =>
  JSON.parse(readFileSync(join(FIXTURES, `${nome}.json`), "utf8")) as Relatorio;

/** Regra de agregação implementada pelo script: CRITICAL > WARN > OK; UNKNOWN não escala sozinho. */
const agregar = (sinais: Sinal[]): { status: string; exit: number } => {
  if (sinais.some((s) => s.status === "CRITICAL")) return { status: "CRITICAL", exit: 2 };
  if (sinais.some((s) => s.status === "WARN")) return { status: "WARN", exit: 1 };
  return { status: "OK", exit: 0 };
};

/** Linhas de SQL que abrem comando de escrita fora de comentário/CTE. */
const linhasDeEscrita = (sql: string): string[] =>
  sql
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("--"))
    .filter((l) => /^(insert|update|delete|drop|alter|create|truncate|grant|revoke|refresh|call|do)\b/i.test(l));

describe("H8-D — consulta de healthcheck é read-only", () => {
  it("não contém nenhum comando de escrita", () => {
    expect(linhasDeEscrita(SQL)).toEqual([]);
  });

  it("detecta escrita quando ela existe (teste negativo)", () => {
    const poluido = `${SQL}\nDELETE FROM public.comunicacao_outbox WHERE status = 'sent';\n`;
    expect(linhasDeEscrita(poluido)).toHaveLength(1);
    const comentado = `${SQL}\n-- DELETE FROM public.comunicacao_outbox;\n`;
    expect(linhasDeEscrita(comentado)).toEqual([]);
  });

  it("não usa SELECT * em nenhuma leitura", () => {
    const estrelas = SQL.split("\n").filter(
      (l) => /select\s+\*/i.test(l) && !l.trim().startsWith("--") && !/SELECT \* FROM sig_/i.test(l),
    );
    expect(estrelas).toEqual([]);
  });

  it("não lê colunas de conteúdo sensível", () => {
    const proibidos = [
      "payload_snapshot",
      "template_snapshot",
      "error_message",
      "certificate_ref",
      "nfe_credential_ref",
      "cnpj",
      "fiscal_email",
      "phone",
      "recipient_hash",
    ];
    const usados = proibidos.filter((c) => new RegExp(`(select|,)\\s*[a-z_.]*\\b${c}\\b`, "i").test(SQL));
    expect(usados).toEqual([]);
  });
});

describe("H8-D — script tem gates fail-closed", () => {
  it("exige o project ref de homologação e aborta fora dele", () => {
    expect(SH).toContain(`STAGING_REF_EXPECTED="${STAGING_REF}"`);
    expect(SH).toMatch(/if \[ "\$\{STAGING_REF:-\}" != "\$STAGING_REF_EXPECTED" \]/);
    expect(SH).toMatch(/exit 10/);
  });

  it("aborta se qualquer referência apontar para produção", () => {
    expect(SH).toContain(`PRODUCTION_REF="${PRODUCTION_REF}"`);
    expect(SH).toMatch(/grep -q "\$PRODUCTION_REF" "\$ROOT\/\.env"/);
  });

  it("executa a coleta dentro de uma transação read-only", () => {
    expect(SH).toContain('-c "BEGIN READ ONLY;"');
  });

  it("revalida o guard das 59 migrations repo-only", () => {
    expect(SH).toContain("h7p-guard-repo-only.sh");
  });

  it("não promove nada para produção nem chama deploy", () => {
    expect(SH).not.toMatch(/supabase (functions )?deploy|promote|--linked --project-ref/i);
  });
});

describe("H8-D — saída JSON é sanitizada", () => {
  const arquivos = readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));

  it("existem fixtures para os quatro estados", () => {
    expect(arquivos).toEqual(
      expect.arrayContaining([
        "cenario-ok.json",
        "cenario-warn.json",
        "cenario-critical.json",
        "cenario-unknown.json",
      ]),
    );
  });

  it.each(arquivos)("%s não contém segredo, DSN nem PII", (arquivo) => {
    const bruto = readFileSync(join(FIXTURES, arquivo), "utf8");
    expect(bruto).not.toMatch(/postgres(ql)?:\/\//i);
    expect(bruto).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT
    expect(bruto).not.toMatch(/sb_(secret|publishable)_/);
    expect(bruto).not.toMatch(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i); // e-mail
    expect(bruto).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/); // CPF
    expect(bruto).not.toMatch(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/); // CNPJ
    expect(bruto).not.toContain(PRODUCTION_REF);
  });

  it.each(arquivos)("%s respeita o contrato de relatório", (arquivo) => {
    const r = JSON.parse(readFileSync(join(FIXTURES, arquivo), "utf8")) as Relatorio;
    expect(r.suite).toBe("h8d-healthcheck");
    expect(r.ambiente).toBe("homologacao");
    expect(r.project_ref).toBe(STAGING_REF);
    expect(r.gerado_em_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(r.sinais.length).toBeGreaterThan(20);
    for (const s of r.sinais) {
      expect(["OK", "WARN", "CRITICAL", "UNKNOWN"]).toContain(s.status);
      expect(s.categoria.length).toBeGreaterThan(0);
      expect(s.limiar.length).toBeGreaterThan(0);
      expect(s.resposta.length).toBeGreaterThan(0);
    }
    expect(r.resumo.total).toBe(r.sinais.length);
  });
});

describe("H8-D — classificação de severidade por cenário", () => {
  it("cenário OK: nenhum WARN/CRITICAL, exit 0", () => {
    const r = carregar("cenario-ok");
    expect(r.resumo.critical).toBe(0);
    expect(r.resumo.warn).toBe(0);
    expect(agregar(r.sinais)).toEqual({ status: "OK", exit: 0 });
  });

  it("cenário WARN: escala para WARN e exit 1, sem CRITICAL", () => {
    const r = carregar("cenario-warn");
    expect(r.resumo.critical).toBe(0);
    expect(r.resumo.warn).toBeGreaterThan(0);
    expect(agregar(r.sinais)).toEqual({ status: "WARN", exit: 1 });
  });

  it("cenário CRITICAL: qualquer sinal crítico domina e exit 2", () => {
    const r = carregar("cenario-critical");
    expect(r.resumo.critical).toBeGreaterThan(0);
    expect(agregar(r.sinais)).toEqual({ status: "CRITICAL", exit: 2 });
    const fiscal = r.sinais.find((s) => s.sinal === "ambiente_homologacao");
    expect(fiscal?.status).toBe("CRITICAL");
  });

  it("cenário UNKNOWN: falta de baseline não vira OK nem escala sozinho", () => {
    const r = carregar("cenario-unknown");
    expect(r.resumo.unknown).toBeGreaterThanOrEqual(4);
    expect(agregar(r.sinais)).toEqual({ status: "OK", exit: 0 });
    for (const s of r.sinais.filter((x) => x.status === "UNKNOWN")) {
      expect(s.resposta.length).toBeGreaterThan(10);
    }
  });

  it("execução real registrada mantém invariantes de homologação", () => {
    const r = carregar("baseline-real");
    const por = (n: string) => r.sinais.find((s) => s.sinal === n);
    expect(por("ledger_migrations")?.medida).toBe("658");
    expect(por("security_definer_total")?.medida).toBe("648");
    expect(por("security_definer_sem_search_path")?.medida).toBe("0");
    expect(por("rpcs_executaveis_por_anon")?.medida).toBe("2");
    expect(por("views_security_invoker")?.medida).toBe("23/24");
    expect(por("tabelas_rls_fail_closed")?.medida).toBe("7");
    expect(por("ambiente_homologacao")?.medida).toContain("tpAmb=2");
    expect(por("ambiente_homologacao")?.medida).toContain("producao=false");
    expect(r.resumo.critical).toBe(0);
  });
});
