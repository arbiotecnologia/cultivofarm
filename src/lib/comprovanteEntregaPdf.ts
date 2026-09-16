import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";

/**
 * Documento de entrega Cultivo Farm (layout v2 — Fase 3).
 *
 * O conteudo NAO e montado no frontend: ele vem integralmente do motor
 * canonico `rpc_get_comprovante_entrega_data`, que decide entre:
 *  - Romaneio (operacional, antes da confirmacao fisica);
 *  - Comprovante (definitivo, com snapshot imutavel e numeracao CE-YYYY-NNNNNN).
 *
 * Esta camada apenas RENDERIZA o payload. Nenhuma consulta a banco, nenhum
 * import de Supabase, nenhuma regra documental recomposta no cliente.
 */

export interface DocumentoEntregaBranding {
  nome_empresa: string;
  logo_url: string | null;
  cor_primaria: string; // HSL "H S% L%"
  slogan?: string | null;
}

export interface DocumentoEntregaPayload {
  doc_tipo: "romaneio" | "comprovante";
  titulo: string;
  definitivo: boolean;
  numero_documento: string;
  emitido_em?: string | null;
  snapshot_hash?: string | null;
  reemissoes?: number | null;
  aviso?: string | null;
  conteudo: any;
}

export const TRACO = "—";

export const AVISO_COMPROVANTE =
  "Este documento comprova exclusivamente a entrega física dos produtos nele relacionados. " +
  "Não substitui documento fiscal, receituário agronômico, prescrição técnica ou laudo técnico quando legalmente exigíveis.";

export const AVISO_ROMANEIO =
  "Documento operacional para conferência e transporte. O recebimento físico ainda não foi confirmado.";

export const SELO_ROMANEIO = "DOCUMENTO OPERACIONAL — RECEBIMENTO NÃO CONFIRMADO";
export const SELO_COMPROVANTE = "ENTREGA CONFIRMADA";

/* ============================ Helpers puros ============================ */

export function hslToRgb(hsl: string): [number, number, number] {
  const m = String(hsl).replace(/hsl\(|\)|,/g, " ").trim().split(/\s+/);
  const h = parseFloat(m[0]) || 0;
  const s = (parseFloat(m[1]) || 0) / 100;
  const l = (parseFloat(m[2]) || 0) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + mm) * 255), Math.round((g + mm) * 255), Math.round((b + mm) * 255)];
}

/** Valor textual ou travessao quando legitimamente ausente. */
export const txt = (v: unknown, fallback = TRACO): string => {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length === 0 ? fallback : s;
};

export const dataOuTraco = (v: unknown): string => (v ? formatDateDisplay(String(v)) : TRACO);

export const dataHoraOuTraco = (v: unknown): string =>
  v ? formatDateTimeDisplay(new Date(String(v))) : TRACO;

export function formatarDocumento(doc?: string | null): string {
  const d = String(doc ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return txt(doc);
}

export function formatarTelefone(tel?: string | null): string {
  const d = String(tel ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return txt(tel);
}

/** Volume humano: abaixo de 1 L em mL, acima em L. */
export function formatarVolume(ml: unknown): string {
  const n = Number(ml);
  if (!Number.isFinite(n) || n <= 0) return TRACO;
  if (n < 1000) return `${Number(n.toFixed(n % 1 === 0 ? 0 : 1))} mL`;
  const litros = n / 1000;
  return `${litros.toFixed(litros % 1 === 0 ? 0 : 2).replace(".", ",")} L`;
}

export function enderecoEmitente(em: any): string {
  const partes = [
    [em?.logradouro, em?.numero].filter(Boolean).join(", "),
    em?.complemento,
    em?.bairro,
    [em?.cidade, em?.uf].filter(Boolean).join("/"),
    em?.cep,
  ].filter((p) => p && String(p).trim().length > 0);
  return partes.length ? partes.join(" — ") : TRACO;
}

/**
 * Rotulo amigavel da origem documental. Nunca expor nome tecnico de coluna,
 * `partner_order` ou UUID cru.
 */
export function rotuloOrigem(os: any): { label: string; valor: string } | null {
  if (!os) return null;
  const tipo = String(os.tipo ?? "");
  const label =
    tipo === "ordem_servico_onfarm"
      ? "OS de Produção"
      : tipo === "partner_order"
        ? "Pedido Parceiro B2B"
        : "Ordem de Serviço";
  const numero = txt(os.numero_os, "");
  if (!numero) return null;
  return { label, valor: numero };
}

export interface ResumoEntrega {
  itens: number;
  embalagens: number;
  volumeTotalMl: number;
}

/** Soma puramente visual a partir do payload — nao altera regra de negocio. */
export function resumirItens(itens: any[]): ResumoEntrega {
  const lista = Array.isArray(itens) ? itens : [];
  return lista.reduce<ResumoEntrega>(
    (acc, it) => {
      const qtd = Number(it?.quantidade);
      const vol = Number(it?.volume_total_ml);
      acc.itens += 1;
      acc.embalagens += Number.isFinite(qtd) && qtd > 0 ? qtd : 0;
      acc.volumeTotalMl += Number.isFinite(vol) && vol > 0 ? vol : 0;
      return acc;
    },
    { itens: 0, embalagens: 0, volumeTotalMl: 0 },
  );
}

export function avisoDocumento(payload: Pick<DocumentoEntregaPayload, "doc_tipo" | "aviso">): string {
  if (payload.aviso && String(payload.aviso).trim().length > 0) return String(payload.aviso).trim();
  return payload.doc_tipo === "comprovante" ? AVISO_COMPROVANTE : AVISO_ROMANEIO;
}

export function seloDocumento(docTipo: DocumentoEntregaPayload["doc_tipo"]): string {
  return docTipo === "comprovante" ? SELO_COMPROVANTE : SELO_ROMANEIO;
}

/** Hash abreviado para leitura humana; valor completo permanece no payload. */
export function hashAbreviado(hash?: string | null): string | null {
  const h = String(hash ?? "").trim();
  if (!h) return null;
  if (h.length <= 20) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export function rotuloReemissao(reemissoes?: number | null): string | null {
  const n = Number(reemissoes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n === 1 ? "2ª via — reemissão do mesmo documento" : `${n + 1}ª via — reemissão do mesmo documento`;
}

/** Regex de UUID canonico — usado apenas para BLOQUEAR exibicao de identificador tecnico. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nome amigavel do operador interno para o documento externo.
 * Nunca imprime UUID: o identificador tecnico permanece apenas na auditoria.
 * Snapshots historicos sem `confirmado_por_nome` caem no travessao neutro.
 */
export function nomeOperadorDocumento(recebimento: any): string {
  const nome = String(recebimento?.confirmado_por_nome ?? "").trim();
  if (nome && !RE_UUID.test(nome)) return nome;
  return TRACO;
}



export function nomeArquivoDocumento(payload: Pick<DocumentoEntregaPayload, "doc_tipo" | "numero_documento">): string {
  const prefixo = payload.doc_tipo === "comprovante" ? "comprovante-entrega" : "romaneio-entrega";
  const numero = String(payload.numero_documento ?? "documento").replace(/[^\w.-]+/g, "-");
  return `${prefixo}-${numero}.pdf`;
}

/** Rotulo do botao na tela de entregas, em funcao do estado do documento. */
export function rotuloAcaoDocumento(opts: { confirmada: boolean; possuiSnapshot?: boolean }): string {
  if (!opts.confirmada) return "Gerar romaneio";
  return opts.possuiSnapshot ? "Reemitir comprovante" : "Baixar comprovante";
}

/* ================== Deteccao de snapshot definitivo (Fase 2) ================== */

/**
 * Chave canonica gravada por `fn_comprovante_entrega_montar_v1` em
 * `entrega_comprovantes.metadata` no momento da PRIMEIRA emissao definitiva.
 * Formularios legados (`formulario_entrega`, `termo_recebimento`, ...) NAO
 * possuem essa chave e, portanto, nao contam como comprovante definitivo.
 */
export const CHAVE_SNAPSHOT_COMPROVANTE = "comprovante_snapshot_v1";

/** Registro minimo de `entrega_comprovantes` carregado apenas para deteccao visual. */
export interface RegistroComprovanteDeteccao {
  id?: string | null;
  tipo?: string | null;
  numero_formulario?: string | null;
  gerado_em?: string | null;
  metadata?: unknown;
}

interface EntregaComSnapshot {
  entrega_comprovantes?: RegistroComprovanteDeteccao | RegistroComprovanteDeteccao[] | null;
}

function metadataDeRegistro(reg: RegistroComprovanteDeteccao | null | undefined): Record<string, unknown> | null {
  const meta = reg?.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

/** Verdadeiro somente quando o registro carrega o snapshot canonico congelado. */
export function ehComprovanteDefinitivo(reg: RegistroComprovanteDeteccao | null | undefined): boolean {
  const meta = metadataDeRegistro(reg);
  if (!meta) return false;
  const snapshot = meta[CHAVE_SNAPSHOT_COMPROVANTE];
  return snapshot !== undefined && snapshot !== null;
}

function listaRegistros(entrega: EntregaComSnapshot | null | undefined): RegistroComprovanteDeteccao[] {
  const rel = entrega?.entrega_comprovantes;
  if (!rel) return [];
  return (Array.isArray(rel) ? rel : [rel]).filter(Boolean) as RegistroComprovanteDeteccao[];
}

/**
 * Seleciona de forma DETERMINISTICA o registro definitivo mais recente.
 * Uso exclusivamente visual (rotulo/flag) — o conteudo do documento continua
 * sendo montado no servidor por `rpc_get_comprovante_entrega_data`.
 */
export function selecionarComprovanteDefinitivo(
  entrega: EntregaComSnapshot | null | undefined,
): RegistroComprovanteDeteccao | null {
  const definitivos = listaRegistros(entrega).filter(ehComprovanteDefinitivo);
  if (definitivos.length === 0) return null;
  const ordenados = [...definitivos].sort((a, b) => {
    const ga = String(a.gerado_em ?? "");
    const gb = String(b.gerado_em ?? "");
    if (ga !== gb) return gb.localeCompare(ga);
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return ordenados[0];
}

/** Helper puro: a entrega ja possui comprovante definitivo emitido? */
export function possuiComprovanteDefinitivo(entrega: EntregaComSnapshot | null | undefined): boolean {
  return selecionarComprovanteDefinitivo(entrega) !== null;
}

/** Numero do comprovante definitivo (`CE-YYYY-000000`), apenas para exibicao. */
export function numeroComprovanteDefinitivo(entrega: EntregaComSnapshot | null | undefined): string | null {
  const reg = selecionarComprovanteDefinitivo(entrega);
  if (!reg) return null;
  const meta = metadataDeRegistro(reg);
  const numero = meta?.["comprovante_numero"];
  const valor = typeof numero === "string" && numero.trim() ? numero : reg.numero_formulario;
  return valor ? String(valor) : null;
}

/* ============================== Renderizacao ============================== */

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number; fmt: string } | null> {
  try {
    if (typeof fetch !== "function" || typeof FileReader === "undefined" || typeof Image === "undefined") return null;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const fmt = String(blob.type).includes("jpeg") || String(blob.type).includes("jpg") ? "JPEG" : "PNG";
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ dataUrl: reader.result as string, w: img.width, h: img.height, fmt });
        img.onerror = () => resolve(null);
        img.src = reader.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const MARGIN = 14;
const HEADER_H = 34;
const FOOTER_TOP = 22;

export async function prepararDocumentoEntregaPDF(
  payload: DocumentoEntregaPayload,
  branding: DocumentoEntregaBranding,
): Promise<jsPDF> {
  const c = payload.conteudo || {};
  const emitente = c.emitente || {};
  const destinatario = c.destinatario || {};
  const origem = rotuloOrigem(c.ordem_servico);
  const transporte = c.transporte || {};
  const recebimento = c.recebimento || {};
  const itens: any[] = Array.isArray(c.itens) ? c.itens : [];
  const definitivo = payload.doc_tipo === "comprovante";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const [pr, pg, pb] = hslToRgb(branding.cor_primaria);

  const logo = branding.logo_url ? await loadImageDataUrl(branding.logo_url) : null;
  const emissao = payload.emitido_em
    ? formatDateTimeDisplay(new Date(payload.emitido_em))
    : formatDateTimeDisplay(new Date());
  const selo = seloDocumento(payload.doc_tipo);
  const aviso = avisoDocumento(payload);
  const reemissao = rotuloReemissao(payload.reemissoes);
  const hashCurto = definitivo ? hashAbreviado(payload.snapshot_hash) : null;

  const drawHeader = (compacto: boolean) => {
    let textX = MARGIN;
    if (logo) {
      const h = compacto ? 10 : 15;
      const w = h * (logo.w / Math.max(logo.h, 1));
      try {
        doc.addImage(logo.dataUrl, logo.fmt, MARGIN, compacto ? 8 : 9, w, h);
        textX = MARGIN + w + 5;
      } catch {
        /* logo indisponivel nao pode quebrar a geracao */
      }
    }

    doc.setTextColor(pr, pg, pb);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(compacto ? 10 : 12);
    doc.text(txt(emitente.nome_fantasia ?? emitente.razao_social, branding.nome_empresa), textX, compacto ? 13 : 14);

    if (!compacto && branding.slogan) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text(String(branding.slogan), textX, 19);
    }

    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(compacto ? 11 : 14);
    doc.text(payload.titulo.toUpperCase(), pageW - MARGIN, compacto ? 12 : 13, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(compacto ? 9 : 11);
    doc.setTextColor(pr, pg, pb);
    doc.text(`Nº ${payload.numero_documento}`, pageW - MARGIN, compacto ? 17 : 19, { align: "right" });

    if (!compacto) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      const linhaDir = [
        `Emissão: ${emissao}`,
        definitivo ? `Entrega: ${dataHoraOuTraco(recebimento.confirmado_em)}` : null,
        origem ? `${origem.label}: ${origem.valor}` : null,
      ].filter(Boolean) as string[];
      linhaDir.forEach((l, i) => doc.text(l, pageW - MARGIN, 24 + i * 4, { align: "right" }));

      // Selo textual discreto (nao depende de cor para o status).
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.setDrawColor(140, 140, 140);
      doc.setLineWidth(0.2);
      const seloW = doc.getTextWidth(selo) + 6;
      doc.roundedRect(MARGIN, 24, seloW, 6, 1, 1, "S");
      doc.text(selo, MARGIN + 3, 28.2);
    }

    doc.setDrawColor(pr, pg, pb);
    doc.setLineWidth(0.6);
    const yLine = compacto ? 21 : HEADER_H;
    doc.line(MARGIN, yLine, pageW - MARGIN, yLine);
    doc.setTextColor(30, 30, 30);
  };

  const drawFooter = () => {
    doc.setDrawColor(200, 205, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, pageH - FOOTER_TOP, pageW - MARGIN, pageH - FOOTER_TOP);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(95, 95, 95);
    doc.text(doc.splitTextToSize(aviso, contentW), MARGIN, pageH - FOOTER_TOP + 4);

    doc.setFontSize(7);
    doc.setTextColor(125, 125, 125);
    const esquerda = [
      payload.numero_documento,
      hashCurto ? `Autenticidade ${hashCurto}` : null,
      reemissao,
    ].filter(Boolean).join("  ·  ");
    doc.text(esquerda, MARGIN, pageH - 7);
    doc.text(
      `Página ${doc.getNumberOfPages()}`,
      pageW - MARGIN,
      pageH - 7,
      { align: "right" },
    );
  };

  drawHeader(false);

  const bloco = (title: string, rows: [string, string][], startY: number): number => {
    autoTable(doc, {
      startY,
      head: [[{
        content: title,
        colSpan: 2,
        styles: { fillColor: [pr, pg, pb], textColor: 255, halign: "left", fontStyle: "bold", fontSize: 8.5 },
      }]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.6, textColor: [30, 30, 30], lineColor: [215, 220, 215] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 40, fillColor: [246, 249, 246] }, 1: {} },
      margin: { left: MARGIN, right: MARGIN, top: 26, bottom: FOOTER_TOP + 6 },
      didDrawPage: (d) => { if (d.pageNumber > 1) drawHeader(true); },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  let y = HEADER_H + 4;

  y = bloco("Emitente", [
    ["Razão social", txt(emitente.razao_social, branding.nome_empresa)],
    ["CNPJ / IE", `${formatarDocumento(emitente.cnpj)}${emitente.inscricao_estadual ? `   ·   IE ${emitente.inscricao_estadual}` : ""}`],
    ["Endereço", enderecoEmitente(emitente)],
    ["Contato", [formatarTelefone(emitente.telefone), emitente.email ? String(emitente.email) : null]
      .filter((v) => v && v !== TRACO).join("  ·  ") || TRACO],
  ], y) + 2.5;

  y = bloco("Destinatário", [
    ["Cliente", txt(destinatario.nome)],
    ["CPF/CNPJ", formatarDocumento(destinatario.cpf_cnpj)],
    ...(destinatario.nome_fantasia ? ([["Nome fantasia", String(destinatario.nome_fantasia)]] as [string, string][]) : []),
    ["Local de entrega", txt(destinatario.local_entrega)],
    ["Município/UF", [destinatario.cidade, destinatario.uf].filter(Boolean).join("/") || TRACO],
    ["Contato", formatarTelefone(destinatario.telefone)],
    ...(destinatario.destinatario_nome
      ? ([["Responsável indicado", String(destinatario.destinatario_nome)]] as [string, string][])
      : []),
    ...(origem ? ([[origem.label, origem.valor]] as [string, string][]) : []),
  ], y) + 2.5;

  const resumo = resumirItens(itens);

  autoTable(doc, {
    startY: y,
    head: [[
      { content: "Produtos entregues", colSpan: 9, styles: { fillColor: [pr, pg, pb], textColor: 255, halign: "left", fontStyle: "bold", fontSize: 8.5 } },
    ], [
      "Produto", "Microrganismo/Cepa", "Lote", "Fabricação", "Validade", "Embalagem", "Qtde.", "Vol. unit.", "Vol. total",
    ]],
    body: itens.length
      ? itens.map((it) => [
          txt(it.produto),
          txt(it.microrganismo),
          txt(it.lote),
          dataOuTraco(it.fabricacao),
          dataOuTraco(it.validade),
          txt(it.embalagem),
          txt(it.quantidade),
          formatarVolume(it.volume_unitario_ml),
          formatarVolume(it.volume_total_ml),
        ])
      : [[{ content: "Nenhum item vinculado à entrega", colSpan: 9, styles: { halign: "center" as const, textColor: [120, 120, 120] as [number, number, number] } }]],
    foot: itens.length
      ? [[
          { content: `Total: ${resumo.itens} ${resumo.itens === 1 ? "item" : "itens"} · ${resumo.embalagens} ${resumo.embalagens === 1 ? "embalagem" : "embalagens"}`, colSpan: 8, styles: { halign: "right" as const } },
          { content: formatarVolume(resumo.volumeTotalMl), styles: { halign: "left" as const } },
        ]]
      : undefined,
    showFoot: "lastPage",
    theme: "grid",
    styles: { fontSize: 7.6, cellPadding: 1.5, textColor: [30, 30, 30], overflow: "linebreak", lineColor: [215, 220, 215] },
    headStyles: { fillColor: [238, 242, 238], textColor: [30, 30, 30], fontStyle: "bold", fontSize: 7.6 },
    footStyles: { fillColor: [246, 249, 246], textColor: [30, 30, 30], fontStyle: "bold", fontSize: 7.8 },
    columnStyles: {
      0: { cellWidth: 33 },
      1: { cellWidth: 30 },
      2: { cellWidth: 20 },
      3: { cellWidth: 17 },
      4: { cellWidth: 17 },
      5: { cellWidth: 20 },
      6: { cellWidth: 12, halign: "right" },
      7: { cellWidth: 17, halign: "right" },
      8: { halign: "right" },
    },
    margin: { left: MARGIN, right: MARGIN, top: 26, bottom: FOOTER_TOP + 6 },
    didDrawPage: (d) => { if (d.pageNumber > 1) drawHeader(true); },
  });
  y = (doc as any).lastAutoTable.finalY + 2.5;

  y = bloco("Transporte", [
    ["Modalidade", txt(transporte.modalidade)],
    ["Motorista", txt(transporte.motorista)],
    ["Telefone", formatarTelefone(transporte.motorista_telefone)],
    ["Veículo", [txt(transporte.veiculo, ""), txt(transporte.veiculo_tipo, "")].filter(Boolean).join(" · ") || TRACO],
    ["Placa", txt(transporte.placa)],
    ["Saída", `${dataOuTraco(transporte.data_saida)}${transporte.hora_saida_prevista ? ` às ${transporte.hora_saida_prevista}` : ""}`],
  ], y) + 2.5;

  if (definitivo) {
    y = bloco("Recebimento", [
      ["Recebido por", txt(recebimento.recebido_por_nome)],
      ["Cargo/função", txt(recebimento.cargo)],
      ["Documento", formatarDocumento(recebimento.documento)],
      ["Data/hora da confirmação", dataHoraOuTraco(recebimento.confirmado_em)],
      ...(recebimento.observacoes
        ? ([["Observações/ressalvas", String(recebimento.observacoes)]] as [string, string][])
        : []),
      ...(recebimento.assinatura_tipo
        ? ([["Evidência de assinatura", String(recebimento.assinatura_tipo)]] as [string, string][])
        : []),
      ["Registrado no sistema por", nomeOperadorDocumento(recebimento)],
    ], y) + 6;

    // Area de assinatura: quebra para nova pagina se nao couber acima do rodape.
    const alturaAssinatura = 20;
    if (y + alturaAssinatura > pageH - FOOTER_TOP - 4) {
      drawFooter();
      doc.addPage();
      drawHeader(true);
      y = 27;
    }
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.line(MARGIN + 6, y + 12, pageW / 2 - 8, y + 12);
    doc.line(pageW / 2 + 8, y + 12, pageW - MARGIN - 6, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Assinatura do recebedor — ${txt(recebimento.recebido_por_nome)}`,
      MARGIN + 6,
      y + 16,
    );
    doc.text(
      `Assinatura do entregador${transporte.motorista ? ` — ${String(transporte.motorista)}` : ""}`,
      pageW / 2 + 8,
      y + 16,
    );
    doc.setTextColor(30, 30, 30);
  } else {
    y = bloco("Conferência", [
      ["Situação", "Aguardando conferência e confirmação física no destino"],
      ["Confirmação", "O recebimento será registrado no sistema após a entrega"],
    ], y) + 2.5;
  }

  // Rodape em todas as paginas.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 205, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, pageH - FOOTER_TOP, pageW - MARGIN, pageH - FOOTER_TOP);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(95, 95, 95);
    doc.text(doc.splitTextToSize(aviso, contentW), MARGIN, pageH - FOOTER_TOP + 4);
    doc.setTextColor(125, 125, 125);
    const esquerda = [
      payload.numero_documento,
      hashCurto ? `Autenticidade ${hashCurto}` : null,
      reemissao,
    ].filter(Boolean).join("  ·  ");
    doc.text(esquerda, MARGIN, pageH - 7);
    doc.text(`Página ${p} de ${total}`, pageW - MARGIN, pageH - 7, { align: "right" });
  }

  return doc;
}

export async function gerarDocumentoEntregaPDF(
  payload: DocumentoEntregaPayload,
  branding: DocumentoEntregaBranding,
) {
  const doc = await prepararDocumentoEntregaPDF(payload, branding);
  doc.save(nomeArquivoDocumento(payload));
}

/* ================== Decisao de reemissao no download (Fase 3) ================== */

/**
 * O preview SEMPRE abre com `p_reemissao=false` (nunca contabiliza reemissao).
 * No clique em "Baixar Documento" decidimos se e necessaria uma NOVA chamada RPC
 * com `p_reemissao=true`:
 *  - romaneio (entrega nao confirmada) => nunca reemite;
 *  - primeira emissao (sem snapshot antes de abrir o preview) => nao reemite;
 *    o snapshot ja foi congelado pela chamada `false`, basta gerar o payload recebido;
 *  - ja existia snapshot definitivo antes do preview => reemissao explicita = true.
 */
export function decidirReemissaoNoDownload(opts: {
  docTipo?: string | null;
  possuiSnapshotAntes: boolean;
}): boolean {
  if (opts.docTipo !== "comprovante") return false;
  return opts.possuiSnapshotAntes === true;
}

/**
 * A abertura da pre-visualizacao NUNCA contabiliza reemissao: a RPC e sempre
 * chamada com `p_reemissao=false`. Constante exportada para permitir assercao
 * em teste sem depender de browser real.
 */
export const REEMISSAO_NA_ABERTURA_DO_PREVIEW = false as const;

/**
 * Alias semantico de `decidirReemissaoNoDownload` usando a nomenclatura da
 * Fase 3: comprovante ja existente => true; primeira emissao => false;
 * romaneio => false.
 */
export function deveReemitirNoDownload(opts: {
  docTipo?: string | null;
  eraComprovanteExistente: boolean;
}): boolean {
  return decidirReemissaoNoDownload({
    docTipo: opts.docTipo,
    possuiSnapshotAntes: opts.eraComprovanteExistente,
  });
}
