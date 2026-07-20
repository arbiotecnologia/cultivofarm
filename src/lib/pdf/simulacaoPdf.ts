import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawArBioHeader, drawArBioFooter } from "./arBioHeader";
import { formatDateDisplay } from "@/lib/date-utils";

export interface SimulacaoPdfInput {
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
  });

  const info: [string, string][] = [
    ["Data", formatDateDisplay(input.simulacao.created_at)],
    ["Parceiro", input.parceiro_nome ?? "—"],
    ["Cliente", input.cliente_nome ?? "—"],
    ["Técnico", input.tecnico_nome ?? "—"],
    ["Cultura", input.simulacao.cultura ?? "—"],
    [
      "Área",
      input.simulacao.area_total_ha != null
        ? `${Number(input.simulacao.area_total_ha).toFixed(2)} ha`
        : "—",
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
    doc.text(linha || "—", margin, y);
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
      `R$ ${Number(i.valor_unitario_cheio ?? 0).toFixed(2)}`,
      `R$ ${Number(i.subtotal ?? 0).toFixed(2)}`,
    ]),
    foot: [[
      "Total (tabela)",
      "",
      "",
      `R$ ${Number(input.simulacao.total_cheio ?? 0).toFixed(2)}`,
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
