import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OS_FLOW_ORDER,
  canAdvanceOS,
  blockedOSReason,
  requerMotivo,
  validarComentarioDecisao,
  podeDecidirRegistro,
  matchTexto,
  textoOuTraco,
} from "@/lib/fluxo-tecnico/fluxo";

describe("fluxo técnico — transições de OS", () => {
  it("permite apenas o próximo passo da ordem canônica", () => {
    expect(canAdvanceOS("aberta", "aprovada")).toBe(true);
    expect(canAdvanceOS("em_producao", "em_cq")).toBe(true);
  });

  it("bloqueia retrocesso, salto e repetição", () => {
    expect(canAdvanceOS("em_cq", "em_producao")).toBe(false);
    expect(blockedOSReason("em_cq", "em_producao")).toMatch(/retroceder/i);
    expect(canAdvanceOS("aberta", "envase")).toBe(false);
    expect(blockedOSReason("aberta", "envase")).toMatch(/pular etapas/i);
    expect(canAdvanceOS("aberta", "aberta")).toBe(false);
  });

  it("bloqueia qualquer transição a partir de status terminal", () => {
    expect(canAdvanceOS("finalizada", "entregue")).toBe(false);
    expect(canAdvanceOS("cancelada", "aberta")).toBe(false);
    expect(blockedOSReason("finalizada", "cancelada")).toMatch(/encerrada/i);
  });

  it("permite cancelar a partir de qualquer status não terminal", () => {
    for (const s of OS_FLOW_ORDER.filter((x) => x !== "finalizada")) {
      expect(canAdvanceOS(s, "cancelada")).toBe(true);
    }
  });

  it("rejeita status desconhecido ou ausente", () => {
    expect(canAdvanceOS(null, "aberta")).toBe(false);
    expect(canAdvanceOS("aberta", "inexistente")).toBe(false);
    expect(blockedOSReason("aberta", "inexistente")).toMatch(/não reconhecida/i);
  });
});

describe("fluxo técnico — decisão de aprovação", () => {
  it("exige motivo em reprovação e ajuste, não em aprovação", () => {
    expect(requerMotivo("reprovado")).toBe(true);
    expect(requerMotivo("solicitar_ajuste")).toBe(true);
    expect(requerMotivo("aprovado")).toBe(false);
  });

  it("recusa motivo vazio ou só espaços", () => {
    expect(validarComentarioDecisao("reprovado", "   ").ok).toBe(false);
    expect(validarComentarioDecisao("reprovado", "produto indisponível").ok).toBe(true);
    expect(validarComentarioDecisao("aprovado", "").ok).toBe(true);
  });

  it("só decide registros aguardando aprovação", () => {
    expect(podeDecidirRegistro("enviado_aprovacao")).toBe(true);
    expect(podeDecidirRegistro("aprovado")).toBe(false);
    expect(podeDecidirRegistro(null)).toBe(false);
  });
});

describe("fluxo técnico — busca e exibição", () => {
  it("busca tolera espaços, caixa e campos ausentes", () => {
    expect(matchTexto(["Fazenda Boa Vista", null], " boa ")).toBe(true);
    expect(matchTexto([null, undefined], "")).toBe(true);
    expect(matchTexto([null, 123], "boa")).toBe(false);
  });

  it("exibe traço para valores ausentes", () => {
    expect(textoOuTraco(null)).toBe("—");
    expect(textoOuTraco("  ")).toBe("—");
    expect(textoOuTraco("OS-1")).toBe("OS-1");
  });
});

describe("fluxo técnico — guardas na página", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/pages/FluxoTecnico.tsx"),
    "utf8",
  );

  it("usa buscas independentes por aba", () => {
    expect(src).toContain("searchAprov");
    expect(src).toContain("searchOS");
  });

  it("propaga erros das consultas em vez de silenciar", () => {
    expect(src).not.toMatch(/const \{ data \} = await supabase/);
    expect(src).toContain("Tentar novamente");
  });

  it("condiciona a decisão ao status lido (corrida entre usuários)", () => {
    expect(src).toContain('.eq("status", registro.status)');
    expect(src).toContain("já foi decidida por outro usuário");
  });

  it("bloqueia duplo clique e decisão sem motivo", () => {
    expect(src).toContain("if (approvalMutation.isPending) return;");
    expect(src).toContain("validarComentarioDecisao");
  });

  it("trata erros das mutações com mensagem ao usuário", () => {
    expect(src.match(/onError:/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renderiza o histórico da OS acionado pelo botão", () => {
    expect(src).toContain("Histórico da OS");
    expect(src).toContain("OSFlowTimeline");
  });
});
