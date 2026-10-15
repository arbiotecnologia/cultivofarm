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
  podeDecidirPorPapel,
  mensagemAmigavel,
  normalizarBusca,
  matchTexto,
  textoOuTraco,
  PAPEIS_DECISAO,
  RPC_APROVACAO_TRANSACIONAL_DISPONIVEL,
  RPC_GERACAO_OS_DISPONIVEL,
  MSG_DECISAO_INDISPONIVEL,
  MSG_GERACAO_OS_INDISPONIVEL,
  podeDecidir,
} from "@/lib/fluxo-tecnico/fluxo";

const pagina = fs.readFileSync(
  path.resolve(process.cwd(), "src/pages/FluxoTecnico.tsx"),
  "utf8",
);
const timeline = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/visita/OSFlowTimeline.tsx"),
  "utf8",
);

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

describe("fluxo técnico — autorização por papel", () => {
  it("apenas administrador e gestor decidem", () => {
    expect([...PAPEIS_DECISAO]).toEqual(["administrador", "gestor"]);
    expect(podeDecidirPorPapel("administrador")).toBe(true);
    expect(podeDecidirPorPapel("gestor")).toBe(true);
    for (const r of ["consultor_tecnico", "tecnico_agronomo", "producao", "administrativo", "", null, undefined]) {
      expect(podeDecidirPorPapel(r as any)).toBe(false);
    }
  });

  it("contrato disponível restringe decisões a admin/gestor e enviado_aprovacao", () => {
    expect(RPC_APROVACAO_TRANSACIONAL_DISPONIVEL).toBe(true);
    expect(podeDecidir("administrador", "enviado_aprovacao")).toBe(true);
    expect(podeDecidir("gestor", "enviado_aprovacao")).toBe(true);
    expect(podeDecidir("consultor_tecnico", "enviado_aprovacao")).toBe(false);
    expect(podeDecidir("administrador", "aprovado")).toBe(false);
  });

  it("habilita encaminhamento singular somente sob guard de workspace/RPC", () => {
    expect(RPC_GERACAO_OS_DISPONIVEL).toBe(true);
    expect(MSG_GERACAO_OS_INDISPONIVEL).toContain("nenhuma fabricação foi autorizada");
    // a tela não escreve OS nem chama RPC: conversão vive no hook, sob guard de workspace
    expect(pagina).not.toContain("gerarOSMutation");
    expect(pagina).not.toContain(".insert");
    expect(pagina).not.toContain("rpc_converter_visita_em_os");
  });
});

describe("fluxo técnico — busca e exibição", () => {
  it("busca ignora acentos, caixa e espaços", () => {
    expect(normalizarBusca("  Fazenda   ÁGUA Boa ")).toBe("fazenda agua boa");
    expect(matchTexto(["Fazenda São João"], "sao joao")).toBe(true);
    expect(matchTexto(["Talhão Ipê"], "IPE")).toBe(true);
    expect(matchTexto(["Fazenda Boa Vista", null], " boa ")).toBe(true);
    expect(matchTexto([null, undefined], "")).toBe(true);
    expect(matchTexto([null, 123], "boa")).toBe(false);
  });

  it("exibe traço para valores ausentes", () => {
    expect(textoOuTraco(null)).toBe("—");
    expect(textoOuTraco("  ")).toBe("—");
    expect(textoOuTraco("OS-1")).toBe("OS-1");
  });

  it("nunca devolve mensagem interna do banco", () => {
    const erro = { message: 'permission denied for table registros_consultor', code: "42501" };
    expect(mensagemAmigavel(erro)).not.toMatch(/permission denied|42501/);
    expect(mensagemAmigavel(erro, MSG_DECISAO_INDISPONIVEL)).toBe(MSG_DECISAO_INDISPONIVEL);
  });
});

describe("fluxo técnico — página", () => {
  it("todas as consultas expõem erro e retry, sem virar vazio/zero", () => {
    expect(pagina).toContain("errorAprovacoes");
    expect(pagina).toContain("refetchAprovacoes");
    expect(pagina.match(/Tentar novamente/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(pagina).toContain('errorPendentes || loadingPendentes ? "—"');
    expect(pagina).toContain('errorAprovacoes || loadingAprovacoes\n      ? "—"');
  });

  it("removeu a query morta de registros do dashboard", () => {
    expect(pagina).not.toContain("all-registros-dashboard");
    expect(pagina).not.toContain("allRegistros");
  });

  it("usa colunas mínimas, sem select('*')", () => {
    expect(pagina).not.toMatch(/\.select\(\s*["'`]\*/);
    expect(pagina).not.toContain('select("*,');
    expect(pagina).toContain("SELECT_PENDENTES");
    expect(pagina).toContain('const SELECT_APROVACOES = "id, status_aprovacao, created_at"');
    expect(pagina).toContain("SELECT_OS_ONFARM");
  });

  it("não expõe mensagens internas do banco na UI", () => {
    expect(pagina).not.toMatch(/error\.message/);
    expect(pagina).not.toMatch(/err\?\.message/);
    expect(pagina).not.toContain("_avancar_os_status");
  });

  it("bloqueia decisão e geração automática sem contrato transacional", () => {
    expect(pagina).toContain("MSG_DECISAO_INDISPONIVEL");
    expect(pagina).toContain("MSG_GERACAO_OS_INDISPONIVEL");
    expect(pagina).not.toContain("gerarOSMutation");
    expect(pagina).not.toContain("portal_solicitacoes");
    expect(pagina).not.toContain("rpc_create_portal_notification_secure");
    expect(pagina).not.toContain('from("aprovacoes_tecnicas").insert');
    expect(pagina).not.toMatch(/from\("registros_consultor_status_log"\)/);
  });

  it("restringe a decisão por papel", () => {
    expect(pagina).toContain("podeDecidirPorPapel(role)");
    expect(pagina).toContain("a decisão é exclusiva de administrador ou gestor");
  });

  it("limpa estado ao fechar a revisão ou trocar de item", () => {
    expect(pagina).toContain("const limparSelecao");
    expect(pagina).toContain("const fecharRevisao");
    expect(pagina).toContain("if (!open) fecharRevisao()");
  });

  it("trata a conversa com o produtor com erro e retry", () => {
    expect(pagina).toContain("Não foi possível carregar a conversa com o produtor.");
  });

  it("não inventa transição de OS na tela: transição pertence à esteira", () => {
    for (const morto of [
      "handleOSStatusChange",
      "proximoStatusOS",
      "blockedOSReason",
      "Avançar",
      'from("ordens_servico_onfarm")\n        .update',
    ]) {
      expect(pagina).not.toContain(morto);
    }
  });

  it("deriva a origem da OS do vínculo de visita, sem coluna origem", () => {
    // ordens_servico_onfarm não tem coluna origem: rótulo vem de registro_consultor_id
    expect(pagina).not.toContain("origem");
    expect(pagina).toContain(
      '"id, numero_os, status, created_at, registro_consultor_id, clientes(nome), fazendas(nome)"',
    );
    expect(pagina).toContain('o.registro_consultor_id ? "Visita técnica" : "Sem vínculo de visita"');
    expect(pagina).toContain("<TableHead>Origem</TableHead>");
    expect(pagina).not.toContain("colSpan={4}");
    expect(pagina).toContain("colSpan={5}");
  });

  it("avisa sobre geração de OS apenas quando a recomendação geraria OS", () => {
    expect(pagina).toContain('selectedRegistro.proxima_acao_recomendada === "gerar_os"');
  });

  it("remove mutation e diálogo de decisão inalcançáveis", () => {
    for (const morto of [
      "approvalMutation",
      "handleApproval",
      "actionDialog",
      "openAction",
      "STATUS_APROVACAO",
      "useMutation",
      "Textarea",
      "DialogFooter",
      "validarComentarioDecisao",
      "RegistroStatus",
    ]) {
      expect(pagina).not.toContain(morto);
    }
    expect(pagina).toContain("MSG_DECISAO_INDISPONIVEL");
  });

  it("removeu imports e constantes mortas", () => {
    for (const morto of ["StatusStepper", "parseConduta", "parseNotes", "getClienteLabel", "rowClickProps", "ChartContainer", "recharts", "pieColors", "chartConfig", "PRESSAO_MAP", "URGENCIA_MAP", "OS_TIMELINE_STEPS", "useNavigate"]) {
      expect(pagina).not.toContain(morto);
    }
  });
});

describe("fluxo técnico — timeline da OS", () => {
  it("propaga erro de todas as consultas", () => {
    expect(timeline.match(/if \((?:registroErr|logsErr|osErr|aplicErr)\) throw/g)?.length).toBe(4);
  });

  it("não usa select('*')", () => {
    expect(timeline).not.toMatch(/\.select\(\s*["'`]\*/);
  });

  it("não mantém imports mortos", () => {
    for (const morto of ["date-fns", "ptBR", "formatTimeDisplay", "Clock", "AlertCircle", "ArrowRight"]) {
      expect(timeline).not.toContain(morto);
    }
  });

  it("mostra erro amigável com retry em vez de etapa pendente", () => {
    expect(timeline).toContain("if (isError)");
    expect(timeline).toContain("Não foi possível carregar a linha do tempo desta OS.");
    expect(timeline).toContain("Tentar novamente");
  });
});
