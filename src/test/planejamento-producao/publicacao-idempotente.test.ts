import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  gerarChaveIdempotencia,
  mensagemPublicacao,
  mensagemSucessoPublicacao,
  rpcIndisponivel,
} from "@/lib/planejamento-producao/planejamento";

const SQL = readFileSync(
  "restoration/planejamento-producao/sql/20260913030000_h10_planejamento_producao_hardening.sql",
  "utf8",
);

describe("chave de idempotência", () => {
  it("inclui o planejamento e tem tamanho aceito pela RPC", () => {
    const k = gerarChaveIdempotencia("11111111-1111-1111-1111-111111111111");
    expect(k).toContain("11111111-1111-1111-1111-111111111111");
    expect(k.trim().length).toBeGreaterThanOrEqual(8);
  });

  it("é estável quando a semente é informada e distinta quando não é", () => {
    expect(gerarChaveIdempotencia("p1", "s1")).toBe(gerarChaveIdempotencia("p1", "s1"));
    expect(gerarChaveIdempotencia("p1")).not.toBe(gerarChaveIdempotencia("p1"));
  });
});

describe("detecção de RPC ausente", () => {
  it("reconhece função inexistente e cache do PostgREST", () => {
    expect(rpcIndisponivel({ code: "42883", message: "function does not exist" })).toBe(true);
    expect(rpcIndisponivel({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
  });
  it("não confunde com erro de permissão", () => {
    expect(rpcIndisponivel({ code: "42501", message: "permissao_negada" })).toBe(false);
  });
});

describe("mensagens de publicação", () => {
  it("traduz permissão, conflito e concorrência sem vazar detalhe técnico", () => {
    expect(mensagemPublicacao({ message: "permissao_negada" })).toMatch(/permissão/i);
    expect(mensagemPublicacao({ message: "chave_idempotencia_conflitante" })).toMatch(/já foi registrada/i);
    expect(mensagemPublicacao({ message: "deadlock detected" })).toMatch(/andamento/i);
    expect(mensagemPublicacao({ message: "already_published" })).toMatch(/já foram geradas/i);
  });
  it("usa texto padrão quando o erro não tem mensagem", () => {
    expect(mensagemPublicacao({})).toMatch(/Falha ao publicar/);
  });
  it("distingue replay de publicação nova", () => {
    expect(mensagemSucessoPublicacao({ replay: true, os_created: 3 })).toMatch(/já havia sido publicado/i);
    expect(mensagemSucessoPublicacao({ replay: false, os_created: 3 })).toMatch(/^3 ordem/);
  });
});

describe("script SQL preparado (não aplicado)", () => {
  it("é transacional e sem operações destrutivas", () => {
    expect(SQL).toContain("BEGIN;");
    expect(SQL.trim().endsWith("COMMIT;")).toBe(true);
    expect(SQL).not.toMatch(/\bCASCADE\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
    expect(SQL).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(SQL).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(SQL).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(SQL).not.toMatch(/^\s*UPDATE\s+public\./im);
  });

  it("mantém papéis já autorizados, sem políticas amplas", () => {
    expect(SQL).toContain("has_role(auth.uid(),'administrador')");
    expect(SQL).toContain("has_role(auth.uid(),'producao')");
    expect(SQL).toContain("has_role(auth.uid(),'gestor')");
    expect(SQL).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(SQL).not.toMatch(/TO\s+anon/i);
  });

  it("define a RPC idempotente com search_path fixo e validação de papel", () => {
    expect(SQL).toContain("FUNCTION public.rpc_planejamento_publicar_v1");
    expect(SQL).toContain("SET search_path TO 'public'");
    expect(SQL).toContain("pg_advisory_xact_lock");
    expect(SQL).toContain("nao_autenticado");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.rpc_planejamento_publicar_v1(uuid, text) TO authenticated;");
  });

  it("faz diagnóstico prévio de duplicidade sem deduplicar", () => {
    expect(SQL).toContain("h10_planejamento_duplicidade_historica");
    expect(SQL).toMatch(/HAVING count\(\*\) > 1/);
  });
});
