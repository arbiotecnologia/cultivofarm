import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  escapeHtml,
  TemplateRenderError,
} from "@/features/comunicacao/render/renderTemplate";

describe("renderTemplate", () => {
  it("substitui variáveis permitidas", () => {
    const r = renderTemplate(
      { canal: "in_app", corpo: "Olá {{nome}}", variaveisPermitidas: ["nome"] },
      { variaveis: { nome: "Ana" } },
    );
    expect(r.corpo).toBe("Olá Ana");
    expect(r.missing).toEqual([]);
  });

  it("faz escape HTML em canal email", () => {
    const r = renderTemplate(
      { canal: "email", assunto: "{{t}}", corpo: "Corpo {{v}}", variaveisPermitidas: ["t","v"] },
      { variaveis: { t: "<b>x</b>", v: "a & b" } },
    );
    expect(r.assunto).toBe("&lt;b&gt;x&lt;/b&gt;");
    expect(r.corpo).toBe("Corpo a &amp; b");
  });

  it("não faz escape em canal whatsapp por padrão", () => {
    const r = renderTemplate(
      { canal: "whatsapp", corpo: "{{v}}", variaveisPermitidas: ["v"] },
      { variaveis: { v: "a & b" } },
    );
    expect(r.corpo).toBe("a & b");
  });

  it("bloqueia variável não permitida", () => {
    expect(() =>
      renderTemplate(
        { canal: "in_app", corpo: "{{secret}}", variaveisPermitidas: ["nome"] },
        { variaveis: { secret: "x" } },
      ),
    ).toThrow(TemplateRenderError);
  });

  it("lista variáveis ausentes sem lançar", () => {
    const r = renderTemplate(
      { canal: "in_app", corpo: "{{a}}-{{b}}", variaveisPermitidas: ["a","b"] },
      { variaveis: { a: "x" } },
    );
    expect(r.corpo).toBe("x-");
    expect(r.missing).toEqual(["b"]);
  });

  it("bloqueia HTML perigoso", () => {
    expect(() =>
      renderTemplate(
        { canal: "email", corpo: "<script>alert(1)</script>{{v}}", variaveisPermitidas: ["v"] },
        { variaveis: { v: "ok" } },
      ),
    ).toThrow(/HTML/);
  });

  it("bloqueia placeholder com sintaxe inválida", () => {
    expect(() =>
      renderTemplate(
        { canal: "in_app", corpo: "{{ ok-name }}", variaveisPermitidas: ["ok-name"] },
        { variaveis: { "ok-name": "x" } },
      ),
    ).toThrow(/sintaxe/);
  });

  it("aplica limite de saída", () => {
    expect(() =>
      renderTemplate(
        { canal: "in_app", corpo: "x".repeat(50), variaveisPermitidas: [] },
        { variaveis: {}, maxOutputChars: 10 },
      ),
    ).toThrow(/excede/);
  });

  it("escapeHtml cobre caracteres perigosos", () => {
    expect(escapeHtml(`<a href="x">'&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;");
  });
});
