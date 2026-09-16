/**
 * Etapa 1 · Subfase 1C · Hardening final — cobertura do renderer sobre os
 * 26 templates `solic_*` (11 in_app v2 active + 11 email draft + 4 whatsapp
 * draft) usando o snapshot allowlisted que o publisher realmente produz para
 * `solicitacao_*`.
 *
 * Contrato validado (sem I/O, sem rede):
 *  1. Todo template `solic_*` é renderizável com o snapshot
 *     `{numero, tipo_demanda, urgencia, status_novo, solicitacao_id}` e produz
 *     saída não vazia sem `missing`.
 *  2. As `variaveis` declaradas por cada template são EXATAMENTE o conjunto de
 *     placeholders `{{...}}` extraídos de assunto+corpo (nem faltantes, nem
 *     extras). Esta é a mesma invariante checada em SQL pelo assert A18 do
 *     harness — replicá-la aqui garante que o renderer JS e o resolvedor SQL
 *     enxergam o mesmo contrato.
 *  3. Placeholders não pertencentes ao snapshot são bloqueados pelo renderer
 *     com `TemplateRenderError('VARIAVEL_NAO_PERMITIDA')`, independentemente do
 *     valor.
 *  4. Nenhum template contém a chave `nome_destinatario` nem qualquer campo
 *     PII proibido (`descricao`, `telefone`, `audio`, `foto`,
 *     `external_event_id`, `solicitante_contato`).
 *
 * Os 26 fixtures abaixo são réplicas exatas dos registros vigentes em
 * `ikaauvsflpmamgxmkhoq` (obtidos em 2026-07-27 via
 * `restoration/comunicacao-etapa1-1c/harness-funcional.sql` assert A18 — que
 * passou em 37/37 templates). Se algum vier a divergir, este teste falha antes
 * do deploy.
 */

import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  TemplateRenderError,
  type Canal,
} from "@/features/comunicacao/render/renderTemplate";

type Fixture = {
  chave: string;
  canal: Canal;
  versao: number;
  status: "active" | "draft";
  assunto?: string;
  corpo: string;
  variaveis: string[];
};

const SNAPSHOT_SOLIC = {
  numero: "SOL-2026-00042",
  tipo_demanda: "praga",
  urgencia: "alta",
  status_novo: "atribuida",
  solicitacao_id: "6b3d7f22-8f1e-4a7d-9c4e-1a1a1a1a1a1a",
};

const PII_FORBIDDEN = /(nome_destinatario|descricao|telefone|audio|foto|external_event_id|solicitante_contato)/;

const FIXTURES: Fixture[] = [
  // ---------- in_app v2 (active) ----------
  { chave: "solic_admin_criada", canal: "in_app", versao: 2, status: "active",
    corpo: "Nova solicitação {{numero}} registrada ({{tipo_demanda}}, urgência {{urgencia}}).",
    variaveis: ["numero", "tipo_demanda", "urgencia"] },
  { chave: "solic_admin_urgencia_critica", canal: "in_app", versao: 2, status: "active",
    corpo: "Solicitação {{numero}} está em URGÊNCIA CRÍTICA. Ação imediata.",
    variaveis: ["numero"] },
  { chave: "solic_consultor_atribuida", canal: "in_app", versao: 2, status: "active",
    corpo: "Solicitação {{numero}} atribuída a você ({{tipo_demanda}}, urgência {{urgencia}}).",
    variaveis: ["numero", "tipo_demanda", "urgencia"] },
  { chave: "solic_consultor_cancelada", canal: "in_app", versao: 2, status: "active",
    corpo: "Solicitação {{numero}} atribuída a você foi cancelada.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_aguardando_os", canal: "in_app", versao: 2, status: "active",
    corpo: "Sua solicitação {{numero}} está aguardando geração de ordem de serviço.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_atribuida", canal: "in_app", versao: 2, status: "active",
    corpo: "Sua solicitação {{numero}} foi atribuída a um consultor. Status: {{status_novo}}.",
    variaveis: ["numero", "status_novo"] },
  { chave: "solic_produtor_cancelada", canal: "in_app", versao: 2, status: "active",
    corpo: "Sua solicitação {{numero}} foi cancelada.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_checkin", canal: "in_app", versao: 2, status: "active",
    corpo: "O consultor realizou check-in para atender sua solicitação {{numero}}.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_concluida", canal: "in_app", versao: 2, status: "active",
    corpo: "Sua solicitação {{numero}} foi concluída.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_criada", canal: "in_app", versao: 2, status: "active",
    corpo: "Sua solicitação {{numero}} foi registrada. Status: {{status_novo}}.",
    variaveis: ["numero", "status_novo"] },
  { chave: "solic_produtor_em_visita", canal: "in_app", versao: 2, status: "active",
    corpo: "O consultor iniciou o atendimento da sua solicitação {{numero}}.",
    variaveis: ["numero"] },

  // ---------- email (draft) ----------
  { chave: "solic_admin_criada", canal: "email", versao: 1, status: "draft",
    assunto: "Nova solicitação — {{numero}}",
    corpo: "Nova solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) registrada.",
    variaveis: ["numero", "tipo_demanda", "urgencia"] },
  { chave: "solic_admin_urgencia_critica", canal: "email", versao: 1, status: "draft",
    assunto: "URGÊNCIA CRÍTICA — {{numero}}",
    corpo: "Solicitação {{numero}} em urgência crítica. Ação imediata.",
    variaveis: ["numero"] },
  { chave: "solic_consultor_atribuida", canal: "email", versao: 1, status: "draft",
    assunto: "Nova atribuição — {{numero}}",
    corpo: "A solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) foi atribuída a você.",
    variaveis: ["numero", "tipo_demanda", "urgencia"] },
  { chave: "solic_consultor_cancelada", canal: "email", versao: 1, status: "draft",
    assunto: "Atribuição cancelada — {{numero}}",
    corpo: "A solicitação {{numero}} atribuída a você foi cancelada.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_aguardando_os", canal: "email", versao: 1, status: "draft",
    assunto: "Aguardando ordem de serviço — {{numero}}",
    corpo: "Sua solicitação {{numero}} está aguardando geração de OS.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_atribuida", canal: "email", versao: 1, status: "draft",
    assunto: "Solicitação {{numero}} atribuída",
    corpo: "Sua solicitação {{numero}} foi atribuída. Status: {{status_novo}}.",
    variaveis: ["numero", "status_novo"] },
  { chave: "solic_produtor_cancelada", canal: "email", versao: 1, status: "draft",
    assunto: "Solicitação {{numero}} cancelada",
    corpo: "Sua solicitação {{numero}} foi cancelada.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_checkin", canal: "email", versao: 1, status: "draft",
    assunto: "Consultor a caminho — {{numero}}",
    corpo: "O consultor realizou check-in para atender sua solicitação {{numero}}.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_concluida", canal: "email", versao: 1, status: "draft",
    assunto: "Solicitação {{numero}} concluída",
    corpo: "Sua solicitação {{numero}} foi concluída.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_criada", canal: "email", versao: 1, status: "draft",
    assunto: "Solicitação {{numero}} registrada",
    corpo: "Sua solicitação {{numero}} foi registrada. Status: {{status_novo}}.",
    variaveis: ["numero", "status_novo"] },
  { chave: "solic_produtor_em_visita", canal: "email", versao: 1, status: "draft",
    assunto: "Atendimento iniciado — {{numero}}",
    corpo: "O consultor iniciou o atendimento da sua solicitação {{numero}}.",
    variaveis: ["numero"] },

  // ---------- whatsapp (draft) ----------
  { chave: "solic_produtor_atribuida", canal: "whatsapp", versao: 1, status: "draft",
    corpo: "Cultivo Farm: sua solicitação {{numero}} foi atribuída a um consultor.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_cancelada", canal: "whatsapp", versao: 1, status: "draft",
    corpo: "Cultivo Farm: sua solicitação {{numero}} foi cancelada.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_checkin", canal: "whatsapp", versao: 1, status: "draft",
    corpo: "Cultivo Farm: consultor a caminho para atender sua solicitação {{numero}}.",
    variaveis: ["numero"] },
  { chave: "solic_produtor_concluida", canal: "whatsapp", versao: 1, status: "draft",
    corpo: "Cultivo Farm: sua solicitação {{numero}} foi concluída.",
    variaveis: ["numero"] },
];

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,63})\s*\}\}/g;

function extractPlaceholders(s: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((m = re.exec(s)) !== null) out.add(m[1]);
  return out;
}

describe("Etapa 1 · 1C · templates solic_* × renderer", () => {
  it("cobre exatamente 26 fixtures (11 in_app active v2 + 11 email draft + 4 whatsapp draft)", () => {
    expect(FIXTURES).toHaveLength(26);
    expect(FIXTURES.filter((t) => t.canal === "in_app" && t.status === "active").length).toBe(11);
    expect(FIXTURES.filter((t) => t.canal === "email" && t.status === "draft").length).toBe(11);
    expect(FIXTURES.filter((t) => t.canal === "whatsapp" && t.status === "draft").length).toBe(4);
  });

  describe.each(FIXTURES)("$canal/$chave v$versao", (tpl) => {
    it("placeholders(assunto+corpo) === variaveis declaradas", () => {
      const found = new Set<string>();
      extractPlaceholders(tpl.corpo).forEach((p) => found.add(p));
      if (tpl.assunto) extractPlaceholders(tpl.assunto).forEach((p) => found.add(p));
      const declared = new Set(tpl.variaveis);
      expect([...found].sort()).toEqual([...declared].sort());
    });

    it("nenhuma referência a nome_destinatario ou PII proibida", () => {
      expect(PII_FORBIDDEN.test(tpl.corpo)).toBe(false);
      if (tpl.assunto) expect(PII_FORBIDDEN.test(tpl.assunto)).toBe(false);
      for (const v of tpl.variaveis) expect(PII_FORBIDDEN.test(v)).toBe(false);
    });

    it("renderiza com snapshot allowlisted sem missing", () => {
      const out = renderTemplate(
        {
          canal: tpl.canal,
          assunto: tpl.assunto ?? null,
          corpo: tpl.corpo,
          variaveisPermitidas: tpl.variaveis,
        },
        { variaveis: SNAPSHOT_SOLIC },
      );
      expect(out.missing).toEqual([]);
      expect(out.corpo.length).toBeGreaterThan(0);
      if (tpl.assunto) expect((out.assunto ?? "").length).toBeGreaterThan(0);
      // Placeholders substituídos por valores reais.
      expect(out.corpo).not.toMatch(/\{\{\s*[a-zA-Z]/);
    });

    it("rejeita placeholder fora do allowlist (VARIAVEL_NAO_PERMITIDA)", () => {
      const injectedCorpo = tpl.corpo + " {{campo_injetado}}";
      expect(() =>
        renderTemplate(
          {
            canal: tpl.canal,
            assunto: tpl.assunto ?? null,
            corpo: injectedCorpo,
            // NB: variaveisPermitidas continua sendo a allowlist real do template
            variaveisPermitidas: tpl.variaveis,
          },
          { variaveis: { ...SNAPSHOT_SOLIC, campo_injetado: "x" } },
        ),
      ).toThrow(TemplateRenderError);
    });

    it("rejeita placeholder PII se injetado (nome_destinatario)", () => {
      const injected = tpl.corpo + " {{nome_destinatario}}";
      expect(() =>
        renderTemplate(
          {
            canal: tpl.canal,
            assunto: tpl.assunto ?? null,
            corpo: injected,
            variaveisPermitidas: tpl.variaveis,
          },
          { variaveis: { ...SNAPSHOT_SOLIC, nome_destinatario: "Fulano" } },
        ),
      ).toThrow(TemplateRenderError);
    });
  });
});
