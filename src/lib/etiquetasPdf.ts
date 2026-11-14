import { jsPDF } from "jspdf";
import { LABEL_TEMPLATES, labelDetails, labelTemplate, snapshotCompany, type LabelData } from "./etiquetas";
import { formatDateDisplay } from "./date-utils";
async function imageData(src: string): Promise<string> {
  const image = new Image(); image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Imagem indisponível para PDF.")); image.src = src; });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("PDF indisponível.");
  ctx.drawImage(image, 0, 0); return canvas.toDataURL("image/png");
}
export async function createLabelsPdf(labels: LabelData[], root: HTMLElement): Promise<jsPDF> {
  if (!labels.length) throw new Error("Selecione recipientes.");
  const first = LABEL_TEMPLATES[labelTemplate(labels[0])];
  const pdf = new jsPDF({ unit: "mm", format: [first.width, first.height], orientation: first.width > first.height ? "landscape" : "portrait" });
  for (const [index, label] of labels.entries()) {
    const size = LABEL_TEMPLATES[labelTemplate(label)];
    if (index) pdf.addPage([size.width, size.height], size.width > size.height ? "landscape" : "portrait");
    const small = size.width === 50, compact = size.height <= 50;
    const margin = small ? 1 : 3; const qrSize = small ? 21 : 25;
    const svg = root.querySelector(`[data-label-id="${label.id}"] svg`);
    if (!svg) throw new Error("QR não disponível.");
    const xml = new XMLSerializer().serializeToString(svg);
    const qr = await imageData(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
    const company = snapshotCompany(label); let y = margin + 2;
    pdf.setFontSize(small ? 6 : 9);
    const text = (value: string, width: number) => { const lines = pdf.splitTextToSize(value, width); const step = small ? 2.3 : 3.5; if (y + lines.length * step > size.height - margin) throw new Error("Conteúdo excede o formato. Corrija para um formato maior antes de imprimir."); pdf.text(lines, margin, y); y += lines.length * step; };
    if (company.logo && !compact) { const logo = await imageData(company.logo); pdf.addImage(logo, "PNG", margin, margin, 12, 8); y += 9; }
    text(company.name, size.width - margin * 2);
    const width = size.width - margin * 2 - qrSize - 2;
    const qrY = Math.min(y, size.height - qrSize - margin);
    pdf.addImage(qr, "PNG", size.width - qrSize - margin, qrY, qrSize, qrSize);
    for (const value of [label.produto_nome, `Lote: ${label.lote_codigo}`, label.codigo_etiqueta,
      label.recipiente_seq != null ? `Recipiente ${label.recipiente_seq}/${label.recipiente_total ?? ""}` : "",
      label.volume != null ? `${label.volume} ${label.unidade || ""}` : "",
      label.fabricado_em ? `Fab: ${formatDateDisplay(label.fabricado_em)}` : "",
      `Val: ${label.validade_em ? formatDateDisplay(label.validade_em) : "Não informada"}`]) if (value) text(value, width);
    if (!compact) { y = Math.max(y, qrY + qrSize + 2); pdf.setFontSize(7); for (const [key, value] of labelDetails(label)) text(`${key}: ${value}`, size.width - margin * 2); }
  }
  return pdf;
}
