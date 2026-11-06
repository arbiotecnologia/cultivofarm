import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawArBioHeader, drawArBioFooter } from "./arBioHeader";
import { formatDateDisplay } from "@/lib/date-utils";
import { formatarArea, formatarMoeda, formatarOuTraco, PLACEHOLDER_VAZIO } from "@/lib/catalogo/formatUnidades";

export interface SimulacaoPdfInput {
  /** Empresa fornecedora/emitente já resolvida pelo chamador (vendedor B2B autorizado ou tenant ativo). */
  empresaNome: string | null;
  simulacao: {
    titulo: string | null;
    cultura: string | null;
    area_total_ha: number | null;
    objetivo_tecnico: string | null;
    observacoes: string | null;
    total_cheio: number;
    created_at: string;
  };
  cliente_nome?: string | null;
  parceiro_nome?: string | null;
  tecnico_nome?: string | null;
  baixado_por?: {
    nome?: string | null;
    email?: string | null;
    perfil?: string | null;
  } | null;
  itens: Array<{
    nome: string;
    quantidade: number;
    valor_unitario_cheio: number;
    subtotal: number;
  }>;
}

export async function generateSimulacaoPdf(input: SimulacaoPdfInput): Promise<{
  blobUrl: string;
  filename: string;
}> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = await drawArBioHeader(doc, {
    subtitulo: `Simulação Técnica — ${input.simulacao.titulo ?? "Sem título"}`,
    totalRegistros: input.itens.length,
    empresaNome: input.empresaNome,
  });

  const info: [string, string][] = [
    ["Data", formatDateDisplay(input.simulacao.created_at)],
    ["Parceiro", formatarOuTraco(input.parceiro_nome)],
    ["Cliente", formatarOuTraco(input.cliente_nome)],
    ["Técnico", formatarOuTraco(input.tecnico_nome)],
    ["Cultura", formatarOuTraco(input.simulacao.cultura)],
    [
      "Área",
      input.simulacao.area_total_ha != null
        ? formatarArea(input.simulacao.area_total_ha)
        : PLACEHOLDER_VAZIO,
    ],
  ];

  doc.setFontSize(10);
  info.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 70, y);
    y += 14;
  });

  // Bloco: quem baixou o PDF
  if (input.baixado_por) {
    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text("Emitido por", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const b = input.baixado_por;
    const linha = [b.nome, b.email, b.perfil].filter(Boolean).join(" · ");
    doc.text(linha || PLACEHOLDER_VAZIO, margin, y);
    y += 10;
    doc.text(`Download em ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 14;
    doc.setTextColor(0, 0, 0);
  }


  if (input.simulacao.objetivo_tecnico) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Objetivo técnico", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(input.simulacao.objetivo_tecnico, 515);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 4;
  }

  autoTable(doc, {
    startY: y + 8,
    head: [["Item", "Qtde", "Valor unit. (tabela)", "Subtotal"]],
    body: input.itens.map((i) => [
      i.nome,
      String(i.quantidade),
      formatarMoeda(i.valor_unitario_cheio),
      formatarMoeda(i.subtotal),
    ]),
    foot: [[
      "Total (tabela)",
      "",
      "",
      formatarMoeda(input.simulacao.total_cheio),
    ]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [20, 60, 35] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    margin: { left: margin, right: margin },
  });

  const afterY = (doc as any).lastAutoTable?.finalY ?? y;

  if (input.simulacao.observacoes) {
    let ny = afterY + 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Observações", margin, ny);
    ny += 14;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(input.simulacao.observacoes, 515);
    doc.text(lines, margin, ny);
  }

  // Aviso sobre valores
  doc.setPage(doc.getNumberOfPages());
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 60, 20);
  doc.text(
    "Valores apresentados são de tabela (sem desconto comercial). A negociação final é conduzida pelo gestor do parceiro.",
    margin,
    pageHeight - 56,
    { maxWidth: 515 },
  );
  doc.setTextColor(0, 0, 0);

  drawArBioFooter(doc);

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const filename = `simulacao-${(input.simulacao.titulo ?? "tecnica")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}.pdf`;
  return { blobUrl, filename };
}
