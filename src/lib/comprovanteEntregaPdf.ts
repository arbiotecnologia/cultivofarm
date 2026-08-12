import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";

/**
 * Documento de entrega AR Bio (v1).
 *
 * O conteudo NAO e montado no frontend: ele vem integralmente do motor
 * canonico `rpc_get_comprovante_entrega_data`, que decide entre:
 *  - Romaneio (operacional, antes da confirmacao fisica);
 *  - Comprovante (definitivo, com snapshot imutavel e numeracao CE-YYYY-NNNNNN).
 */

export interface DocumentoEntregaBranding {
  nome_empresa: string;
  logo_url: string | null;
  cor_primaria: string; // HSL "H S% L%"
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

const NAO_INFORMADO = "Não informado";

function hslToRgb(hsl: string): [number, number, number] {
  const m = hsl.replace(/hsl\(|\)|,/g, " ").trim().split(/\s+/);
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

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ dataUrl: reader.result as string, w: img.width, h: img.height });
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

const nz = (v: unknown, fallback = NAO_INFORMADO): string => {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length === 0 ? fallback : s;
};

const dataOuTraco = (v: unknown): string => (v ? formatDateDisplay(String(v)) : "—");

function formatarDocumento(doc?: string | null): string {
  const d = String(doc ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return nz(doc);
}

function formatarTelefone(tel?: string | null): string {
  const d = String(tel ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return nz(tel);
}

function enderecoEmitente(em: any): string {
  const partes = [
    [em?.logradouro, em?.numero].filter(Boolean).join(", "),
    em?.complemento,
    em?.bairro,
    [em?.cidade, em?.uf].filter(Boolean).join("/"),
    em?.cep,
  ].filter((p) => p && String(p).trim().length > 0);
  return partes.length ? partes.join(" — ") : NAO_INFORMADO;
}

function litros(ml: unknown): string {
  const n = Number(ml);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${(n / 1000).toFixed(2)} L`;
}

export async function gerarDocumentoEntregaPDF(
  payload: DocumentoEntregaPayload,
  branding: DocumentoEntregaBranding,
) {
  const c = payload.conteudo || {};
  const emitente = c.emitente || {};
  const destinatario = c.destinatario || {};
  const os = c.ordem_servico || null;
  const transporte = c.transporte || {};
  const recebimento = c.recebimento || {};
  const itens: any[] = Array.isArray(c.itens) ? c.itens : [];
  const definitivo = payload.doc_tipo === "comprovante";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const [pr, pg, pb] = hslToRgb(branding.cor_primaria);

  // ===== Cabecalho =====
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, pageW, 30, "F");

  let textStart = 14;
  if (branding.logo_url) {
    const img = await loadImageDataUrl(branding.logo_url);
    if (img) {
      const h = 18;
      const w = h * (img.w / img.h);
      try {
        doc.addImage(img.dataUrl, "PNG", 12, 6, w, h);
        textStart = 12 + w + 6;
      } catch { /* ignore */ }
    }
  }

  const emissao = payload.emitido_em
    ? formatDateTimeDisplay(new Date(payload.emitido_em))
    : formatDateTimeDisplay(new Date());

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(payload.titulo, textStart, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(nz(emitente.razao_social, branding.nome_empresa), textStart, 19);
  doc.text(
    `CNPJ ${formatarDocumento(emitente.cnpj)}${emitente.inscricao_estadual ? `   IE ${emitente.inscricao_estadual}` : ""}`,
    textStart,
    24,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Nº ${payload.numero_documento}`, pageW - 14, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Emitido em ${emissao}`, pageW - 14, 19, { align: "right" });
  doc.text(definitivo ? "Documento definitivo" : "Documento provisório", pageW - 14, 24, { align: "right" });

  doc.setTextColor(30, 30, 30);

  const renderBlock = (title: string, rows: [string, string][], startY: number) => {
    autoTable(doc, {
      startY,
      head: [[{
        content: title,
        colSpan: 2,
        styles: { fillColor: [pr, pg, pb], textColor: 255, halign: "left", fontStyle: "bold" },
      }]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2, textColor: [30, 30, 30] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 48, fillColor: [245, 247, 245] }, 1: {} },
      margin: { left: 14, right: 14 },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  let y = 36;

  // ===== Emitente / Destinatario =====
  y = renderBlock("Emitente", [
    ["Razão social", nz(emitente.razao_social, branding.nome_empresa)],
    ["Endereço", enderecoEmitente(emitente)],
    ["Contato", `${formatarTelefone(emitente.telefone)}${emitente.email ? ` — ${emitente.email}` : ""}`],
  ], y) + 3;

  y = renderBlock("Destinatário", [
    ["Cliente", nz(destinatario.nome)],
    ["CPF/CNPJ", formatarDocumento(destinatario.cpf_cnpj)],
    ["Local de entrega", nz(destinatario.local_entrega, [destinatario.cidade, destinatario.uf].filter(Boolean).join("/") || NAO_INFORMADO)],
    ["Contato", formatarTelefone(destinatario.telefone)],
    ...(destinatario.destinatario_nome ? ([["Responsável indicado", String(destinatario.destinatario_nome)]] as [string, string][]) : []),
    ...(os ? ([["Ordem de serviço", nz(os.numero_os)]] as [string, string][]) : []),
  ], y) + 3;

  // ===== Itens =====
  autoTable(doc, {
    startY: y,
    head: [[
      { content: "Itens entregues", colSpan: 7, styles: { fillColor: [pr, pg, pb], textColor: 255, halign: "left", fontStyle: "bold" } },
    ], [
      "Produto", "Microrganismo", "Lote", "Fabricação", "Validade", "Qtd. / Embalagem", "Volume",
    ]],
    body: itens.length
      ? itens.map((it) => [
          nz(it.produto),
          nz(it.microrganismo, "—"),
          nz(it.lote),
          dataOuTraco(it.fabricacao),
          dataOuTraco(it.validade),
          `${nz(it.quantidade, "—")}${it.embalagem ? ` ${it.embalagem}` : ""}`,
          litros(it.volume_total_ml),
        ])
      : [["Nenhum item vinculado", "—", "—", "—", "—", "—", "—"]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [30, 30, 30] },
    headStyles: { fillColor: [235, 238, 235], textColor: [30, 30, 30], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // ===== Transporte =====
  y = renderBlock("Transporte", [
    ["Modalidade", nz(transporte.modalidade, "—")],
    ["Motorista", `${nz(transporte.motorista)}${transporte.motorista_telefone ? ` — ${formatarTelefone(transporte.motorista_telefone)}` : ""}`],
    ["Veículo", `${nz(transporte.veiculo)}${transporte.placa ? ` — ${transporte.placa}` : ""}`],
    ["Saída", `${dataOuTraco(transporte.data_saida)}${transporte.hora_saida_prevista ? ` às ${transporte.hora_saida_prevista}` : ""}`],
  ], y) + 3;

  // ===== Recebimento =====
  if (definitivo) {
    y = renderBlock("Recebimento", [
      ["Recebido por", nz(recebimento.recebido_por_nome)],
      ["Documento", formatarDocumento(recebimento.documento)],
      ["Cargo", nz(recebimento.cargo, "—")],
      ["Confirmado em", recebimento.confirmado_em ? formatDateTimeDisplay(new Date(recebimento.confirmado_em)) : "—"],
      ["Registrado por (sistema)", nz(recebimento.confirmado_por, "—")],
      ...(recebimento.observacoes ? ([["Ressalvas", String(recebimento.observacoes)]] as [string, string][]) : []),
    ], y) + 4;

    // Assinatura
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.line(20, y + 14, pageW / 2 - 8, y + 14);
    doc.line(pageW / 2 + 8, y + 14, pageW - 20, y + 14);
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text("Assinatura do recebedor", 20, y + 18);
    doc.text("Assinatura do entregador", pageW / 2 + 8, y + 18);
    y += 22;
  } else {
    y = renderBlock("Recebimento", [
      ["Situação", "Pendente de confirmação física"],
    ], y) + 4;
  }

  // ===== Rodape =====
  const aviso = payload.aviso
    || (definitivo
      ? "Este documento comprova exclusivamente a entrega física dos produtos nele relacionados."
      : "Documento operacional. Não comprova o recebimento físico.");

  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.5);
  doc.line(14, pageH - 28, pageW - 14, pageH - 28);

  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(doc.splitTextToSize(aviso, pageW - 28), 14, pageH - 24);

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const rodapeEsq = definitivo && payload.snapshot_hash
    ? `Autenticidade: ${payload.snapshot_hash.slice(0, 32)}…`
    : `Gerado por ${branding.nome_empresa}`;
  doc.text(rodapeEsq, 14, pageH - 8);
  const reemissoes = Number(payload.reemissoes ?? 0);
  doc.text(
    reemissoes > 0 ? `${payload.numero_documento} — 2ª via (${reemissoes})` : payload.numero_documento,
    pageW - 14,
    pageH - 8,
    { align: "right" },
  );

  const prefixo = definitivo ? "comprovante-entrega" : "romaneio-entrega";
  doc.save(`${prefixo}-${payload.numero_documento}.pdf`);
}
