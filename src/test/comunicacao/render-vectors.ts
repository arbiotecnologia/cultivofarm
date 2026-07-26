/**
 * Vetores de contrato entre o renderer frontend e o renderer canônico
 * (supabase/functions/_shared/communication-render.ts). Ambas as
 * implementações devem produzir SAÍDA IDÊNTICA.
 */
export interface RenderVector {
  name: string;
  template: {
    canal: "email" | "whatsapp" | "in_app" | "push";
    assunto?: string | null;
    corpo: string;
    variaveisPermitidas: string[];
  };
  input: { variaveis: Record<string, unknown>; escapeHtml?: boolean };
  expect:
    | { kind: "ok"; assunto?: string; corpo: string; missing: string[] }
    | { kind: "throw"; code: string };
}

export const RENDER_VECTORS: RenderVector[] = [
  {
    name: "email escapa HTML por padrão",
    template: { canal: "email", assunto: "Olá {{nome}}", corpo: "Bem-vindo {{nome}}", variaveisPermitidas: ["nome"] },
    input: { variaveis: { nome: "<Maria>" } },
    expect: { kind: "ok", assunto: "Olá &lt;Maria&gt;", corpo: "Bem-vindo &lt;Maria&gt;", missing: [] },
  },
  {
    name: "whatsapp não escapa HTML",
    template: { canal: "whatsapp", corpo: "Fone: {{fone}}", variaveisPermitidas: ["fone"] },
    input: { variaveis: { fone: "<11> 99999-0000" } },
    expect: { kind: "ok", corpo: "Fone: <11> 99999-0000", missing: [] },
  },
  {
    name: "variável ausente vira string vazia e reporta missing",
    template: { canal: "in_app", corpo: "Oi {{nome}}", variaveisPermitidas: ["nome"] },
    input: { variaveis: {} },
    expect: { kind: "ok", corpo: "Oi ", missing: ["nome"] },
  },
  {
    name: "variável não permitida lança",
    template: { canal: "email", corpo: "Segredo: {{token}}", variaveisPermitidas: [] },
    input: { variaveis: { token: "x" } },
    expect: { kind: "throw", code: "VARIAVEL_NAO_PERMITIDA" },
  },
  {
    name: "HTML perigoso bloqueia",
    template: { canal: "email", corpo: "<script>a</script>", variaveisPermitidas: [] },
    input: { variaveis: {} },
    expect: { kind: "throw", code: "HTML_PERIGOSO" },
  },
  {
    name: "placeholder inválido bloqueia",
    template: { canal: "email", corpo: "{{ma@il}}", variaveisPermitidas: [] },
    input: { variaveis: {} },
    expect: { kind: "throw", code: "PLACEHOLDER_INVALIDO" },
  },
];
