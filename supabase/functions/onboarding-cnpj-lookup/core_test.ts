// Testes do núcleo da consulta de CNPJ (rodam no Deno via supabase tests).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { consultar, mapear, urlConsulta } from "./core.ts";

const RAW_OK = {
  cnpj: "19131243000197", razao_social: "OPEN KNOWLEDGE BRASIL", nome_fantasia: "",
  descricao_situacao_cadastral: "Ativa", descricao_matriz_filial: "Matriz", porte: "DEMALLOC",
  natureza_juridica: "Associação Privada", data_inicio_atividade: "1993-04-13",
  cnae_fiscal: 9430800, cnae_fiscal_descricao: "Atividades de associações de defesa de direitos sociais",
  descricao_tipo_de_logradouro: "RUA", logradouro: "FRADIQUE COUTINHO 1252", numero: "",
  complemento: "14 AND", bairro: "PINHEIROS", cep: "05416001", uf: "SP", municipio: "SAO PAULO",
  ddd_telefone_1: "1138509662", email: "contato@ok.org.br",
  opcao_pelo_simples: false, opcao_pelo_mei: false,
  qsa: [{ nome_socio: "FULANO DE TAL", cpf_cnpj_socio: "***123456**" }],
};

Deno.test("cnpj inválido → invalid_cnpj sem chamar a rede", async () => {
  let chamou = false;
  const r = await consultar("11111111111111", () => { chamou = true; return Promise.reject(new Error("x")); });
  assert(r.codigo === "invalid_cnpj");
  assert(!chamou);
});

Deno.test("cnpj alfanumérico → unsupported_alpha", async () => {
  const r = await consultar("12ABC3455678-95");
  assert(r.codigo === "unsupported_alpha");
});

Deno.test("404 → not_found", async () => {
  const r = await consultar("19131243000197", (() => Promise.resolve(new Response("{}", { status: 404 }))) as typeof fetch);
  assert(r.codigo === "not_found");
});

Deno.test("429 → rate_limited", async () => {
  const r = await consultar("19131243000197", (() => Promise.resolve(new Response("{}", { status: 429 }))) as typeof fetch);
  assert(r.codigo === "rate_limited");
});

Deno.test("500 → upstream_error", async () => {
  const r = await consultar("19131243000197", (() => Promise.resolve(new Response("{}", { status: 500 }))) as typeof fetch);
  assert(r.codigo === "upstream_error");
});

Deno.test("JSON malformado → malformed", async () => {
  const r = await consultar("19131243000197", (() => Promise.resolve(new Response("<html>", { status: 200 }))) as typeof fetch);
  assert(r.codigo === "malformed");
});

Deno.test("resposta grande → too_large", async () => {
  const grande = "x".repeat(70 * 1024);
  const r = await consultar("19131243000197", (() => Promise.resolve(new Response(grande, { status: 200 }))) as typeof fetch);
  assert(r.codigo === "too_large");
});

Deno.test("timeout → timeout", async () => {
  const lento = (() => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("{}", { status: 200 })), 500))) as typeof fetch;
  const r = await consultar("19131243000197", lento, 50);
  assert(r.codigo === "timeout");
});

Deno.test("sucesso mapeia somente campos permitidos", async () => {
  const corpo = JSON.stringify(RAW_OK);
  const r = await consultar("19131243000197", (() => Promise.resolve(new Response(corpo, { status: 200 }))) as typeof fetch);
  assert(r.codigo === "ok");
  if (r.codigo !== "ok") return;
  assert(r.dados.razao_social === "OPEN KNOWLEDGE BRASIL");
  assert(r.dados.situacao_cadastral === "ATIVA");
  assert(r.dados.socios_sugeridos[0] === "FULANO DE TAL");
  // QSA nunca vira CPF/persistência: só nomes.
  const chaves = Object.keys(r.dados).join(",");
  assert(!chaves.includes("qsa") && !chaves.includes("cpf"));
});

Deno.test("mapear rejeita cnpj divergente do consultado", () => {
  assert(mapear("19131243000197", { ...RAW_OK, cnpj: "00000000000191" }) === null);
  assert(mapear("19131243000197", null) === null);
});

Deno.test("url fixa com cnpj normalizado", () => {
  assert(urlConsulta("19131243000197") === "https://brasilapi.com.br/api/cnpj/v1/19131243000197");
});
