import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawArBioHeader, drawArBioFooter } from "./arBioHeader";
import { formatDateDisplay } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { formatarArea, formatarOuTraco, formatarPercentual, PLACEHOLDER_VAZIO } from "@/lib/catalogo/formatUnidades";

export interface PedidoPdfInput {
  /** Empresa fornecedora/emitente já resolvida pelo chamador (vendedor B2B autorizado ou tenant ativo). */
  empresaNome: string | null;
  pedido: {
    numero: string;
    status?: string | null;
    created_at: string;
    requested_delivery_date?: string | null;
    estimated_delivery_date?: string | null;
    approved_at?: string | null;
    cultura?: string | null;
    area_total_ha?: number | null;
    subtotal: number;
    desconto_total: number;
    total: number;
    payment_method?: string | null;
    payment_due_date?: string | null;
    observacoes?: string | null;
    commercial_notes?: string | null;
  };
  cliente_nome?: string | null;
  parceiro_nome?: string | null;
  baixado_por?: {
    nome?: string | null;
    email?: string | null;
    perfil?: string | null;
  } | null;
  itens: Array<{
    produto_codigo_snapshot?: string | null;
    produto_nome_snapshot?: string | null;
    nome?: string | null;
    quantidade: number;
    unidade_medida?: string | null;
    preco_tabela_snapshot?: number | null;
    preco_unitario?: number | null;
    desconto_percentual?: number | null;
    subtotal: number;
  }>;
}

export async function generatePedidoPdf(input: PedidoPdfInput): Promise<{
  blobUrl: string;
  filename: string;
}> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = await drawArBioHeader(doc, {
    subtitulo: `Pedido Comercial — ${input.pedido.numero}`,
    totalRegistros: input.itens.length,
    empresaNome: input.empresaNome,
  });

  const info: [string, string][] = [
    ["Data emissão", formatDateDisplay(input.pedido.created_at)],
    [
      "Entrega desejada",
      input.pedido.requested_delivery_date
        ? formatDateDisplay(input.pedido.requested_delivery_date)
        : PLACEHOLDER_VAZIO,
    ],
    [
      "Entrega prevista",
      input.pedido.estimated_delivery_date
        ? formatDateDisplay(input.pedido.estimated_delivery_date)
        : PLACEHOLDER_VAZIO,
    ],
    [
      "Aprovado em",
      input.pedido.approved_at ? formatDateDisplay(input.pedido.approved_at) : PLACEHOLDER_VAZIO,
    ],
    ["Parceiro", formatarOuTraco(input.parceiro_nome)],
    ["Cliente", formatarOuTraco(input.cliente_nome)],
    ["Cultura", formatarOuTraco(input.pedido.cultura)],
    [
      "Área",
      input.pedido.area_total_ha != null
        ? formatarArea(input.pedido.area_total_ha)
        : PLACEHOLDER_VAZIO,
    ],
    ["Pagamento", formatarOuTraco(input.pedido.payment_method)],
    [
      "Vencimento",
      input.pedido.payment_due_date
        ? formatDateDisplay(input.pedido.payment_due_date)
        : PLACEHOLDER_VAZIO,
    ],
  ];

  doc.setFontSize(10);
  info.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 100, y);
    y += 14;
  });

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

  autoTable(doc, {
    startY: y + 8,
    head: [["Código", "Produto", "Qtd", "Unit. (tabela)", "Desc. %", "Subtotal"]],
    body: input.itens.map((i) => {
      const cheio = Number(i.preco_tabela_snapshot ?? i.preco_unitario ?? 0);
      const descPct = Number(i.desconto_percentual ?? 0);
      const unidade = i.unidade_medida ? ` ${i.unidade_medida}` : "";
      return [
        formatarOuTraco(i.produto_codigo_snapshot),
        i.produto_nome_snapshot ?? i.nome ?? "Item",
        `${i.quantidade}${unidade}`,
        brl(cheio),
        descPct > 0 ? formatarPercentual(descPct) : PLACEHOLDER_VAZIO,
        brl(Number(i.subtotal ?? 0)),
      ];
    }),
    foot: [
      ["", "", "", "", "Subtotal", brl(Number(input.pedido.subtotal ?? 0))],
      ["", "", "", "", "Desconto", `- ${brl(Number(input.pedido.desconto_total ?? 0))}`],
      ["", "", "", "", "Total", brl(Number(input.pedido.total ?? 0))],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [20, 60, 35] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    margin: { left: margin, right: margin },
  });

  let afterY = (doc as any).lastAutoTable?.finalY ?? y;

  const renderNote = (title: string, body: string) => {
    afterY += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, margin, afterY);
    afterY += 14;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(body, 515);
    doc.text(lines, margin, afterY);
    afterY += lines.length * 12;
  };

  if (input.pedido.observacoes) renderNote("Observações", input.pedido.observacoes);
  if (input.pedido.commercial_notes)
    renderNote("Notas comerciais", input.pedido.commercial_notes);

  drawArBioFooter(doc);

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const numeroSafe = (input.pedido.numero ?? "pedido")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  const filename = `pedido-${numeroSafe}-${yyyymmdd}.pdf`;
  return { blobUrl, filename };
}
