import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Fase 3 — testes do renderer dos documentos de entrega.
 * Sem canvas/browser real: jsPDF e autoTable sao mockados para capturar o
 * conteudo textual efetivamente renderizado.
 */

const textCalls: string[] = [];
const tableCalls: any[] = [];
let pages = 1;
let savedName = "";

vi.mock("jspdf", () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    setFillColor() {} setDrawColor() {} setLineWidth() {} setTextColor() {}
    setFont() {} setFontSize() {} rect() {} roundedRect() {} line() {} addImage() {}
    getTextWidth() { return 40; }
    splitTextToSize(t: string) { textCalls.push(String(t)); return [String(t)]; }
    text(t: any) { textCalls.push(Array.isArray(t) ? t.join(" ") : String(t)); }
    getNumberOfPages() { return pages; }
    setPage() {}
    addPage() { pages += 1; }
    save(name: string) { savedName = name; }
    lastAutoTable = { finalY: 60 };
  }
  return { default: FakeDoc };
});

vi.mock("jspdf-autotable", () => ({
  default: (doc: any, opts: any) => {
    tableCalls.push(opts);
    const flat = (v: any): string =>
      Array.isArray(v) ? v.map(flat).join(" ")
        : v && typeof v === "object" ? flat(v.content ?? "")
          : String(v ?? "");
    textCalls.push(flat(opts.head), flat(opts.body), flat(opts.foot));
    doc.lastAutoTable = { finalY: (doc.lastAutoTable?.finalY ?? 60) + 20 };
  },
}));

import {
  gerarDocumentoEntregaPDF,
  rotuloOrigem,
  rotuloAcaoDocumento,
  resumirItens,
  formatarVolume,
  formatarTelefone,
  formatarDocumento,
  hashAbreviado,
  rotuloReemissao,
  nomeArquivoDocumento,
  avisoDocumento,
  seloDocumento,
  AVISO_COMPROVANTE,
  AVISO_ROMANEIO,
  possuiComprovanteDefinitivo,
  decidirReemissaoNoDownload,
  deveReemitirNoDownload,
  REEMISSAO_NA_ABERTURA_DO_PREVIEW,
  selecionarComprovanteDefinitivo,
  numeroComprovanteDefinitivo,
  ehComprovanteDefinitivo,
} from "@/lib/comprovanteEntregaPdf";

const branding = { nome_empresa: "Cultivo Farm", logo_url: null, cor_primaria: "160 84% 22%" };

const item = (over: Record<string, unknown> = {}) => ({
  produto: "Bio Tricho",
  microrganismo: "Trichoderma harzianum",
  lote: "L-2026-001",
  fabricacao: "2026-01-10",
  validade: "2026-07-10",
  embalagem: "Bombona",
  quantidade: 2,
  volume_unitario_ml: 5000,
  volume_total_ml: 10000,
  ...over,
});

const payloadBase = (over: Record<string, unknown> = {}) => ({
  doc_tipo: "romaneio" as const,
  titulo: "Romaneio de Entrega",
  definitivo: false,
  numero_documento: "RM-2026-000001",
  emitido_em: "2026-08-12T10:00:00Z",
  snapshot_hash: null,
  reemissoes: 0,
  aviso: null,
  conteudo: {
    emitente: { razao_social: "Cultivo Farm LTDA", cnpj: "12345678000199", cidade: "Unaí", uf: "MG" },
    destinatario: { nome: "Fazenda Boa Vista", cpf_cnpj: "98765432000155", cidade: "Unaí", uf: "MG" },
    ordem_servico: { numero_os: "OS-1024", tipo: "ordem_servico" },
    itens: [item()],
    transporte: { modalidade: "Própria", motorista: "João", motorista_telefone: "38999998888" },
    recebimento: {},
  },
  ...over,
});

beforeEach(() => {
  textCalls.length = 0;
  tableCalls.length = 0;
  pages = 1;
  savedName = "";
});

describe("comprovanteEntregaPdf — isolamento de camada", () => {
  const src = readFileSync(resolve(__dirname, "../../lib/comprovanteEntregaPdf.ts"), "utf8");

  it("não importa Supabase nem executa consultas", () => {
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/\bsupabase\b/);
    expect(src).not.toMatch(/\.rpc\(|\.from\(/);
  });
});

describe("helpers de formatação", () => {
  it("volume humano em mL e L", () => {
    expect(formatarVolume(500)).toBe("500 mL");
    expect(formatarVolume(10000)).toBe("10 L");
    expect(formatarVolume(1500)).toBe("1,50 L");
    expect(formatarVolume(0)).toBe("—");
    expect(formatarVolume(null)).toBe("—");
  });

  it("telefone e documento", () => {
    expect(formatarTelefone("38999998888")).toBe("(38) 99999-8888");
    expect(formatarDocumento("12345678000199")).toBe("12.345.678/0001-99");
    expect(formatarDocumento(null)).toBe("—");
  });

  it("hash abreviado preserva prefixo e sufixo", () => {
    const h = "a".repeat(30) + "bcdefg";
    expect(hashAbreviado(h)).toBe("aaaaaaaaaa…bcdefg");
    expect(hashAbreviado(null)).toBeNull();
  });

  it("reemissão só aparece com contador > 0", () => {
    expect(rotuloReemissao(0)).toBeNull();
    expect(rotuloReemissao(1)).toContain("2ª via");
    expect(rotuloReemissao(2)).toContain("3ª via");
  });

  it("resumo soma itens, embalagens e volume", () => {
    expect(resumirItens([item(), item({ quantidade: 3, volume_total_ml: 3000 })])).toEqual({
      itens: 2,
      embalagens: 5,
      volumeTotalMl: 13000,
    });
  });

  it("nome de arquivo por tipo documental", () => {
    expect(nomeArquivoDocumento({ doc_tipo: "romaneio", numero_documento: "RM-1" })).toBe("romaneio-entrega-RM-1.pdf");
    expect(nomeArquivoDocumento({ doc_tipo: "comprovante", numero_documento: "CE-2026-000003" }))
      .toBe("comprovante-entrega-CE-2026-000003.pdf");
  });
});

describe("origem documental amigável", () => {
  it("OS de laboratório", () => {
    expect(rotuloOrigem({ tipo: "ordem_servico", numero_os: "OS-10" }))
      .toEqual({ label: "Ordem de Serviço", valor: "OS-10" });
  });
  it("OS de Produção", () => {
    expect(rotuloOrigem({ tipo: "ordem_servico_onfarm", numero_os: "ONF-3" }))
      .toEqual({ label: "OS de Produção", valor: "ONF-3" });
  });
  it("Pedido Parceiro B2B sem nome técnico", () => {
    const r = rotuloOrigem({ tipo: "partner_order", numero_os: "PED-77" });
    expect(r).toEqual({ label: "Pedido Parceiro B2B", valor: "PED-77" });
    expect(r!.label).not.toMatch(/partner_order/);
  });
  it("sem origem retorna nulo", () => {
    expect(rotuloOrigem(null)).toBeNull();
  });
});

describe("rótulos de ação na tela de entregas", () => {
  it("antes da confirmação", () => {
    expect(rotuloAcaoDocumento({ confirmada: false })).toBe("Gerar romaneio");
  });
  it("após confirmação, primeira emissão", () => {
    expect(rotuloAcaoDocumento({ confirmada: true })).toBe("Baixar comprovante");
  });
  it("após confirmação, com snapshot existente", () => {
    expect(rotuloAcaoDocumento({ confirmada: true, possuiSnapshot: true })).toBe("Reemitir comprovante");
  });
});

describe("detecção de comprovante definitivo (snapshot canônico)", () => {
  const legado = {
    id: "11111111-1111-1111-1111-111111111111",
    tipo: "formulario_entrega",
    numero_formulario: "AR-ENT-000123",
    gerado_em: "2026-08-01T10:00:00Z",
    metadata: { origem: "rpc_gerar_formulario_entrega" },
  };
  const definitivo = {
    id: "22222222-2222-2222-2222-222222222222",
    tipo: "comprovante_entrega",
    numero_formulario: "CE-2026-000007",
    gerado_em: "2026-08-05T10:00:00Z",
    metadata: {
      comprovante_snapshot_v1: { doc_tipo: "comprovante" },
      comprovante_numero: "CE-2026-000007",
      comprovante_reemissoes: 0,
    },
  };

  it("entrega sem relação carregada não conta como snapshot", () => {
    expect(possuiComprovanteDefinitivo({})).toBe(false);
    expect(possuiComprovanteDefinitivo(null)).toBe(false);
    expect(possuiComprovanteDefinitivo({ entrega_comprovantes: [] })).toBe(false);
    expect(rotuloAcaoDocumento({ confirmada: true, possuiSnapshot: possuiComprovanteDefinitivo({}) })).toBe(
      "Baixar comprovante",
    );
  });

  it("formulário legado sem snapshot não conta como reemissão", () => {
    const entrega = { entrega_comprovantes: [legado] };
    expect(ehComprovanteDefinitivo(legado)).toBe(false);
    expect(possuiComprovanteDefinitivo(entrega)).toBe(false);
    expect(numeroComprovanteDefinitivo(entrega)).toBeNull();
    expect(rotuloAcaoDocumento({ confirmada: true, possuiSnapshot: possuiComprovanteDefinitivo(entrega) })).toBe(
      "Baixar comprovante",
    );
  });

  it("snapshot canônico habilita reemissão", () => {
    const entrega = { entrega_comprovantes: [legado, definitivo] };
    expect(possuiComprovanteDefinitivo(entrega)).toBe(true);
    expect(numeroComprovanteDefinitivo(entrega)).toBe("CE-2026-000007");
    expect(rotuloAcaoDocumento({ confirmada: true, possuiSnapshot: possuiComprovanteDefinitivo(entrega) })).toBe(
      "Reemitir comprovante",
    );
  });

  it("relação objeto único também é aceita", () => {
    expect(possuiComprovanteDefinitivo({ entrega_comprovantes: definitivo })).toBe(true);
  });

  it("seleção é determinística pelo mais recente", () => {
    const antigo = { ...definitivo, id: "0", gerado_em: "2026-07-01T10:00:00Z", metadata: { ...definitivo.metadata, comprovante_numero: "CE-2026-000001" } };
    const entrega = { entrega_comprovantes: [definitivo, antigo, legado] };
    expect(selecionarComprovanteDefinitivo(entrega)?.id).toBe(definitivo.id);
    expect(selecionarComprovanteDefinitivo({ entrega_comprovantes: [antigo, definitivo] })?.id).toBe(definitivo.id);
  });

  it("metadata nula ou inválida não conta", () => {
    expect(ehComprovanteDefinitivo({ metadata: null })).toBe(false);
    expect(ehComprovanteDefinitivo({ metadata: "texto" as unknown })).toBe(false);
    expect(ehComprovanteDefinitivo({ metadata: { comprovante_snapshot_v1: null } })).toBe(false);
  });

  it("entrega não confirmada permanece em romaneio mesmo com snapshot", () => {
    const entrega = { entrega_comprovantes: [definitivo] };
    expect(rotuloAcaoDocumento({ confirmada: false, possuiSnapshot: possuiComprovanteDefinitivo(entrega) })).toBe(
      "Gerar romaneio",
    );
  });
});

describe("avisos e selos", () => {
  it("romaneio", () => {
    expect(avisoDocumento({ doc_tipo: "romaneio", aviso: null })).toBe(AVISO_ROMANEIO);
    expect(seloDocumento("romaneio")).toBe("DOCUMENTO OPERACIONAL — RECEBIMENTO NÃO CONFIRMADO");
  });
  it("comprovante", () => {
    expect(avisoDocumento({ doc_tipo: "comprovante", aviso: null })).toBe(AVISO_COMPROVANTE);
    expect(seloDocumento("comprovante")).toBe("ENTREGA CONFIRMADA");
  });
  it("aviso do payload tem precedência", () => {
    expect(avisoDocumento({ doc_tipo: "comprovante", aviso: "Aviso do servidor" })).toBe("Aviso do servidor");
  });
});

describe("renderização — romaneio", () => {
  it("não exibe linguagem de entrega confirmada nem assinatura de recebimento", async () => {
    await gerarDocumentoEntregaPDF(payloadBase() as any, branding);
    const all = textCalls.join("\n");
    expect(all).toContain("DOCUMENTO OPERACIONAL — RECEBIMENTO NÃO CONFIRMADO");
    expect(all).toContain(AVISO_ROMANEIO);
    expect(all).not.toContain("Assinatura do recebedor");
    expect(all).not.toContain("ENTREGA CONFIRMADA");
    expect(all).not.toContain("Recebido por");
    expect(savedName).toBe("romaneio-entrega-RM-2026-000001.pdf");
  });

  it("usa travessão e nunca 'Não informado'", async () => {
    await gerarDocumentoEntregaPDF(
      payloadBase({ conteudo: { ...payloadBase().conteudo, transporte: {} } }) as any,
      branding,
    );
    expect(textCalls.join("\n")).not.toContain("Não informado");
  });
});

describe("renderização — comprovante", () => {
  const comprovante = payloadBase({
    doc_tipo: "comprovante",
    titulo: "Comprovante de Entrega",
    definitivo: true,
    numero_documento: "CE-2026-000003",
    snapshot_hash: "f".repeat(64),
    reemissoes: 1,
    conteudo: {
      ...payloadBase().conteudo,
      recebimento: {
        recebido_por_nome: "Maria Souza",
        cargo: "Encarregada",
        documento: "12345678909",
        confirmado_em: "2026-08-11T18:30:00Z",
        confirmado_por: "operador.arbio",
        observacoes: "Uma bombona com avaria leve",
      },
    },
  });

  it("mostra recebedor, data/hora, aviso definitivo e assinatura", async () => {
    await gerarDocumentoEntregaPDF(comprovante as any, branding);
    const all = textCalls.join("\n");
    expect(all).toContain("Recebido por");
    expect(all).toContain("Maria Souza");
    expect(all).toContain("Data/hora da confirmação");
    expect(all).toContain("Registrado no sistema por");
    expect(all).toContain("ENTREGA CONFIRMADA");
    expect(all).toContain(AVISO_COMPROVANTE);
    expect(all).toContain("Assinatura do recebedor — Maria Souza");
    expect(all).toMatch(/2ª via/);
    expect(savedName).toBe("comprovante-entrega-CE-2026-000003.pdf");
  });

  it("exibe origem amigável e nunca UUID/nome técnico", async () => {
    await gerarDocumentoEntregaPDF(
      { ...comprovante, conteudo: { ...comprovante.conteudo, ordem_servico: { tipo: "partner_order", numero_os: "PED-77" } } } as any,
      branding,
    );
    const all = textCalls.join("\n");
    expect(all).toContain("Pedido Parceiro B2B");
    expect(all).not.toContain("partner_order");
    expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});

describe("multi-item e paginação", () => {
  it("renderiza 12 itens com cabeçalho de tabela repetido por página e rodapé de resumo", async () => {
    const itens = Array.from({ length: 12 }, (_, i) => item({ lote: `L-${i}` }));
    await gerarDocumentoEntregaPDF(payloadBase({ conteudo: { ...payloadBase().conteudo, itens } }) as any, branding);
    const tabela = tableCalls.find((t) => JSON.stringify(t.head).includes("Produtos entregues"));
    expect(tabela).toBeTruthy();
    expect(tabela.body).toHaveLength(12);
    expect(typeof tabela.didDrawPage).toBe("function");
    expect(tabela.margin.bottom).toBeGreaterThan(20);
    expect(JSON.stringify(tabela.foot)).toContain("12 itens");
    expect(JSON.stringify(tabela.foot)).toContain("120 L");
  });

  it("suporta entrega sem itens sem quebrar", async () => {
    await gerarDocumentoEntregaPDF(payloadBase({ conteudo: { ...payloadBase().conteudo, itens: [] } }) as any, branding);
    expect(textCalls.join("\n")).toContain("Nenhum item vinculado");
  });

  it("gera o PDF mesmo quando a logo não carrega", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockRejectedValue(new Error("CORS"));
    await gerarDocumentoEntregaPDF(payloadBase() as any, { ...branding, logo_url: "https://x/logo.png" });
    expect(savedName).toBe("romaneio-entrega-RM-2026-000001.pdf");
    fetchSpy.mockRestore();
  });
});

describe("semantica de reemissao no preview (Fase 3 - C)", () => {
  it("romaneio nunca reemite", () => {
    expect(decidirReemissaoNoDownload({ docTipo: "romaneio", possuiSnapshotAntes: false })).toBe(false);
    expect(decidirReemissaoNoDownload({ docTipo: "romaneio", possuiSnapshotAntes: true })).toBe(false);
  });

  it("primeira emissão não vira reemissão", () => {
    expect(decidirReemissaoNoDownload({ docTipo: "comprovante", possuiSnapshotAntes: false })).toBe(false);
  });

  it("comprovante já emitido reemite uma única vez no download", () => {
    expect(decidirReemissaoNoDownload({ docTipo: "comprovante", possuiSnapshotAntes: true })).toBe(true);
  });

  it("doc_tipo ausente/desconhecido nunca reemite", () => {
    expect(decidirReemissaoNoDownload({ docTipo: null, possuiSnapshotAntes: true })).toBe(false);
    expect(decidirReemissaoNoDownload({ docTipo: undefined, possuiSnapshotAntes: true })).toBe(false);
  });

  it("deveReemitirNoDownload replica a decisão com a nomenclatura da Fase 3", () => {
    expect(deveReemitirNoDownload({ docTipo: "comprovante", eraComprovanteExistente: true })).toBe(true);
    expect(deveReemitirNoDownload({ docTipo: "comprovante", eraComprovanteExistente: false })).toBe(false);
    expect(deveReemitirNoDownload({ docTipo: "romaneio", eraComprovanteExistente: true })).toBe(false);
    expect(deveReemitirNoDownload({ docTipo: null, eraComprovanteExistente: true })).toBe(false);
  });

  it("a abertura do preview é declarada como não-reemissão", () => {
    expect(REEMISSAO_NA_ABERTURA_DO_PREVIEW).toBe(false);
  });
});

describe("fluxo da tela de Entregas (estático)", () => {
  const src = readFileSync(resolve(__dirname, "../../pages/Entregas.tsx"), "utf8");
  const preview = readFileSync(resolve(__dirname, "../../components/entregas/PreviewDocumentoEntrega.tsx"), "utf8");

  it("abertura do preview sempre chama a RPC com p_reemissao=false", () => {
    expect(src).toContain("buscarPayloadDocumento(e.id, REEMISSAO_NA_ABERTURA_DO_PREVIEW)");
    // a única chamada com `true` é a do download explícito de reemissão
    const comTrue = src.match(/buscarPayloadDocumento\([^)]*true\)/g) ?? [];
    expect(comTrue).toHaveLength(1);
    expect(src).toContain("reemitir ? await buscarPayloadDocumento(previewEntregaId, true)");
  });

  it("a decisão de reemissão usa o helper puro e o estado anterior ao preview", () => {
    expect(src).toContain("deveReemitirNoDownload({");
    expect(src).toContain("eraComprovanteExistente: previewSnapshotAntes");
    expect(src).toContain("const possuiSnapshotAntes = possuiComprovanteDefinitivo(e);");
  });

  it("o download é protegido contra duplo clique", () => {
    expect(src).toContain("if (downloadingPreview) return;");
    expect(src).toContain("setDownloadingPreview(true)");
    expect(src).toContain("setDownloadingPreview(false)");
    expect(src).toContain("downloading={downloadingPreview}");
    expect(preview).toContain("disabled={!payload || downloading}");
  });

  it("a listagem carrega a relação entrega_comprovantes com campos mínimos", () => {
    expect(src).toContain("entrega_comprovantes!entrega_comprovantes_entrega_id_fkey");
    for (const campo of ["id", "tipo", "numero_formulario", "metadata", "gerado_em"]) {
      expect(src).toContain(campo);
    }
  });

  it("download invalida a query de entregas", () => {
    expect(src).toContain('queryClient.invalidateQueries({ queryKey: ["entregas"] });');
  });

  it("fechar o preview limpa o estado sem reemitir", () => {
    expect(src).toContain("setPreviewSnapshotAntes(false)");
  });

  it("mapa de erros cobre os gates da Fase 2", () => {
    expect(src).toContain("COMPROVANTE_OS_OBRIGATORIA");
    expect(src).toContain("COMPROVANTE_VOLUME_OBRIGATORIO");
    expect(src).toContain("COMPROVANTE_PARAMS_INVALIDOS");
  });

  it("painel legado aparece como Evidências", () => {
    expect(src).toContain("Evidências");
    expect(src).toContain("Evidências e termos da entrega");
    expect(src).not.toMatch(/>\s*Documento\s*</);
    // funcionalidades preservadas
    expect(src).toContain("EntregaComprovantePanel");
    expect(src).toContain("EmbalagensEntregaPanel");
    expect(src).toContain("TermoEntregaPanel");
  });

  it("preview revoga Object URLs via ref (sem leak)", () => {
    expect(preview).toContain("URL.revokeObjectURL(urlRef.current)");
    expect(preview).toContain("useEffect(() => () => revogarUrl()");
    expect(preview).not.toContain("supabase");
  });
});
