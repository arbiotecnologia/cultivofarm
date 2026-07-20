import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";

export interface ReciboBranding {
  nome_empresa: string;
  logo_url: string | null;
  cor_primaria: string; // HSL string "H S% L%"
}

export interface ReciboEntregaData {
  entrega: any;
  clienteNome?: string | null;
  produtoNome?: string | null;
  loteCodigo?: string | null;
  osId?: string | null;
  numeroOs?: string | null;
  volumePorUnidade?: number | null;
  saldoReservadoRestante?: number | null; // null = não exibir
}

const DISCLAIMER =
  "Documento informativo de entrega. Recomendações agronômicas vinculadas a esta entrega devem ser acompanhadas por profissional habilitado, mediante prescrição técnica registrada. Este comprovante não substitui receituário agronômico nem laudo técnico.";

function hslToRgb(hsl: string): [number, number, number] {
  // Aceita "H S% L%" ou "hsl(H, S%, L%)"
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

export async function gerarReciboEntregaPDF(
  data: ReciboEntregaData,
  branding: ReciboBranding,
) {
  const { entrega } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const [pr, pg, pb] = hslToRgb(branding.cor_primaria);

  // ===== Cabeçalho (faixa colorida) =====
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, pageW, 28, "F");

  // Logo
  let textStart = 14;
  if (branding.logo_url) {
    const img = await loadImageDataUrl(branding.logo_url);
    if (img) {
      const maxH = 18;
      const ratio = img.w / img.h;
      const h = maxH;
      const w = h * ratio;
      try {
        doc.addImage(img.dataUrl, "PNG", 12, 5, w, h);
        textStart = 12 + w + 6;
      } catch { /* ignore */ }
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Comprovante de Entrega", textStart, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(branding.nome_empresa, textStart, 21);
  const idCurto = String(entrega.id || "").slice(0, 8).toUpperCase();
  const emissao = formatDateTimeDisplay(new Date());
  const headerRight = `Nº ${idCurto}    Emitido em ${emissao}`;
  doc.text(headerRight, pageW - 14, 21, { align: "right" });

  // ===== Conteúdo =====
  doc.setTextColor(30, 30, 30);

  const nz = (v: unknown, fallback = "Não informado"): string => {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s.length === 0 ? fallback : s;
  };

  type Row = [string, string];
  const rows1: Row[] = [["Cliente", nz(data.clienteNome)]];
  if (data.osId) {
    rows1.push(["OS", data.numeroOs || `OS-${String(data.osId).slice(0, 8).toUpperCase()}`]);
  }
  rows1.push(["Produto", nz(data.produtoNome)]);
  rows1.push(["Lote", nz(data.loteCodigo)]);

  const rows2: Row[] = [
    ["Data de saída", entrega.data_saida ? formatDateDisplay(entrega.data_saida) : "Não informado"],
    ["Motorista", nz(entrega.motorista)],
    ["Veículo", nz(entrega.veiculo)],
    ["Status", nz(entrega.status)],
  ];

  const qtd = entrega.quantidade_entregue;
  const volumeUn = data.volumePorUnidade ?? null;
  const volumeTotalMl =
    entrega.volume_entregue_ml ??
    (volumeUn && qtd ? volumeUn * qtd : null);
  const volumeStr = volumeTotalMl ? `${(volumeTotalMl / 1000).toFixed(2)} L` : "Não informado";

  const qtdStr =
    qtd === null || qtd === undefined
      ? "Não informado"
      : volumeUn
        ? `${qtd} un × ${volumeUn} mL`
        : `${qtd} un`;

  const rows3: Row[] = [
    ["Quantidade entregue", qtdStr],
    ["Volume estimado", volumeStr],
  ];
  if (data.osId && data.saldoReservadoRestante !== null && data.saldoReservadoRestante !== undefined) {
    rows3.push(["Saldo reservado restante (OS)", `${data.saldoReservadoRestante} un`]);
  }

  const renderBlock = (title: string, rows: [string, string][], startY: number) => {
    autoTable(doc, {
      startY,
      head: [[{ content: title, colSpan: 2, styles: { fillColor: [pr, pg, pb], textColor: 255, halign: "left", fontStyle: "bold" } }]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 2.5, textColor: [30, 30, 30] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [245, 247, 245] }, 1: {} },
      margin: { left: 14, right: 14 },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  let y = 38;
  y = renderBlock("Cliente / OS / Produto", rows1, y) + 4;
  y = renderBlock("Dados da Entrega", rows2, y) + 4;
  y = renderBlock("Quantidades e Saldos", rows3, y) + 6;

  // ===== Rodapé =====
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.5);
  doc.line(14, pageH - 26, pageW - 14, pageH - 26);

  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  const wrapped = doc.splitTextToSize(DISCLAIMER, pageW - 28);
  doc.text(wrapped, 14, pageH - 22);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Gerado por ${branding.nome_empresa}`, 14, pageH - 8);
  doc.text(emissao, pageW - 14, pageH - 8, { align: "right" });

  doc.save(`comprovante-entrega-${idCurto}.pdf`);
}
