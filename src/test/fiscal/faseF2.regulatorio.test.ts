/**
 * Fase F2 — Testes estáticos do cadastro regulatório de microrganismos.
 *
 * Verificam invariantes que NÃO podem regredir:
 *  - o cliente nunca infere classificação fiscal;
 *  - toda escrita passa por RPC auditada existente na migration;
 *  - checklist de 12 chaves e exigência de justificativa;
 *  - a seção está montada na tela fiscal canônica.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const migration = read("restoration/fase-f2/migration.sql");
const hook = read("src/hooks/useMicroorganismRegulatory.ts");
const secao = read("src/components/fiscal/RegulatorioMicrorganismosSecao.tsx");
const tela = read("src/pages/configuracoes/FiscalProdutos.tsx");

const RPCS = [
  "rpc_regulatory_dossier_ensure_draft",
  "rpc_regulatory_dossier_update_draft",
  "rpc_regulatory_presentation_upsert",
  "rpc_regulatory_ncm_candidate_add",
  "rpc_regulatory_ncm_candidate_decide",
  "rpc_regulatory_checklist_set",
  "rpc_regulatory_document_register",
  "rpc_regulatory_dossier_submit",
  "rpc_regulatory_review_decide",
  "rpc_regulatory_dossier_publish",
  "rpc_regulatory_dossier_block",
  "rpc_regulatory_dossier_new_version",
  "rpc_microorganism_regulatory_overview",
  "rpc_regulatory_dossier_detail",
];

const CHECKLIST_KEYS = [
  "FINALIDADE_REGULATORIA", "CEPA", "FORMULACAO", "GARANTIA_ROTULO",
  "REGISTRO_MAPA", "TITULAR_FABRICANTE", "NCM_CEST_TIPI", "GTIN",
  "UNIDADE_CONVERSAO", "ORIGEM", "CFOP", "TRIBUTACAO",
];

describe("Fase F2 — contrato de RPCs regulatórias", () => {
  it("toda RPC usada pelo hook existe na migration", () => {
    for (const rpc of RPCS) {
      expect(hook, `hook não referencia ${rpc}`).toContain(rpc);
      expect(
        migration.includes(`CREATE OR REPLACE FUNCTION public.${rpc}(`),
        `migration não define ${rpc}`,
      ).toBe(true);
    }
  });

  it("todas as RPCs de escrita exigem autorização explícita no servidor", () => {
    expect(migration).toContain("fn_regulatory_can_prepare");
    expect(migration).toContain("fn_regulatory_can_approve");
    expect(migration).toContain("fn_regulatory_can_read");
    expect(migration).toContain("REGULATORY_FORBIDDEN");
  });

  it("NOT_APPLICABLE exige justificativa no servidor", () => {
    expect(migration).toContain("REGULATORY_JUSTIFICATION_REQUIRED");
    expect(migration).toMatch(
      /p_state = 'NOT_APPLICABLE'[\s\S]{0,160}REGULATORY_JUSTIFICATION_REQUIRED/,
    );
  });
});

describe("Fase F2 — checklist obrigatório", () => {
  it("as 12 chaves canônicas estão no hook e na migration", () => {
    expect(CHECKLIST_KEYS).toHaveLength(12);
    for (const key of CHECKLIST_KEYS) {
      expect(hook, `hook sem chave ${key}`).toContain(key);
      expect(migration, `migration sem chave ${key}`).toContain(key);
    }
  });

  it("o hook rotula todas as chaves para exibição humana", () => {
    for (const key of CHECKLIST_KEYS) {
      expect(hook).toMatch(new RegExp(`${key}:\\s*"`));
    }
  });
});

describe("Fase F2 — nenhuma inferência no cliente", () => {
  it("a seção não contém NCM, CEST ou CFOP literais sugeridos", () => {
    // Qualquer sequência de 8 dígitos seria um NCM embutido; 7 dígitos, um CEST.
    expect(secao).not.toMatch(/\b\d{8}\b/);
    expect(secao).not.toMatch(/\bCFOP\s*[:=]\s*["']\d/);
  });

  it("a seção trata ausência de dado como 'não informado'", () => {
    expect(secao).toContain("não informado");
  });

  it("o hook não deriva classificação a partir de espécie ou nome", () => {
    expect(hook).not.toMatch(/if\s*\(\s*\/?.*especie/i);
    expect(hook).not.toMatch(/default(Ncm|Cest|Cfop)/i);
  });

  it("o hook usa os tipos canônicos gerados, sem boundary solta", () => {
    expect(hook).not.toMatch(/as unknown as/);
    expect(hook).not.toContain("callRegulatoryRpc");
    expect(hook).toContain(
      'import type { Database, Json } from "@/integrations/supabase/cultivofarm.types"',
    );
    expect(hook).toContain("Database[\"public\"][\"Functions\"]");
  });

});

describe("Fase F2 — integração na tela fiscal", () => {
  it("a seção regulatória está montada em FiscalProdutos", () => {
    expect(tela).toContain(
      'import { RegulatorioMicrorganismosSecao } from "@/components/fiscal/RegulatorioMicrorganismosSecao"',
    );
    expect(tela).toContain("<RegulatorioMicrorganismosSecao />");
  });

  it("a seção expõe testids estáveis para auditoria de UI", () => {
    for (const id of [
      "regulatorio-micro-secao",
      "regulatorio-micro-lista",
      "regulatorio-dossie-sheet",
      "reg-validados",
      "reg-bloqueados",
    ]) {
      expect(secao).toContain(id);
    }
  });

  it("a seção falha fechada quando a leitura é negada", () => {
    expect(secao).toContain("permission_denied");
    expect(secao).toContain("Sem permissão para ler dossiês regulatórios");
  });
});

describe("Fase F2 — publicação e trilha", () => {
  it("publicação grava snapshot imutável com hash", () => {
    expect(migration).toContain("microorganism_regulatory_publication_snapshots");
    expect(migration).toContain("snapshot_sha256");
  });

  it("documentos exigem hash de conteúdo", () => {
    expect(migration).toContain("content_sha256");
    expect(secao).toContain("SHA-256");
  });

  it("candidatos de NCM exigem fonte oficial", () => {
    expect(migration).toContain("p_source_key");
    expect(secao).toContain("Chave da fonte oficial");
  });
});

describe("Fase F2 — correção pós-auditoria na UI", () => {
  it("explica fonte oficial obrigatória, segregação e escopo de evidências", () => {
    expect(secao).toContain('data-testid="regulatorio-regras"');
    expect(secao).toMatch(/Fonte oficial/);
    expect(secao).toMatch(/Segregação de funções/);
    expect(secao).toMatch(/dossiers\/&lt;dossiê&gt;/);
  });

  it("traduz os códigos de erro do servidor para o operador", () => {
    const codigos = [
      "REGULATORY_NCM_SOURCE_REQUIRED",
      "REGULATORY_NCM_SOURCE_NOT_OFFICIAL",
      "REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED",
      "REGULATORY_GTIN_CHECK_DIGIT_INVALID",
      "REGULATORY_STORAGE_PATH_INVALID",
      "REGULATORY_STORAGE_PATH_OUT_OF_SCOPE",
      "REGULATORY_STORAGE_OBJECT_MISSING",
      "REGULATORY_STORAGE_IMMUTABLE",
      "REGULATORY_SEGREGATION_OF_DUTIES",
      "REGULATORY_APPROVALS_INCOMPLETE",
      "REGULATORY_OVERRIDE_JUSTIFICATION_WEAK",
    ];
    for (const codigo of codigos) {
      expect(secao).toContain(codigo);
    }
  });

  it("não reimplementa as regras no cliente: apenas traduz o erro do servidor", () => {
    expect(secao).not.toMatch(/gov\.br.*test\(|checkDigit|mod10/i);
    expect(secao).toContain("SERVER_ERROR_MESSAGES[err.message] ?? err.message");
  });
});
