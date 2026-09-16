import jsPDF from "jspdf";
import logoAsset from "@/assets/logo-cultivofarm.png.asset.json";

const logoUrl = logoAsset.url;

const COMPANY_NAME = "Cultivo Farm";
const DISCLAIMER =
  "Documento gerado pelo Cultivo Farm. Recomendações de bioinsumos exigem prescrição agronômica detalhada.";

let cachedLogo: string | null = null;

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    cachedLogo = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

export interface ArBioHeaderOptions {
  subtitulo: string;
  totalRegistros?: number;
}

/**
 * Desenha cabeçalho padronizado Cultivo Farm no topo da página atual.
 * Retorna a coordenada Y abaixo do cabeçalho, pronta para o conteúdo.
 */
export async function drawArBioHeader(
  doc: jsPDF,
  { subtitulo, totalRegistros }: ArBioHeaderOptions
): Promise<number> {
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await getLogoDataUrl();

  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, 24, 44, 44, undefined, "FAST");
    } catch {
      // ignore
    }
  }

  const textX = logo ? margin + 56 : margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 60, 35);
  doc.text(COMPANY_NAME, textX, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(subtitulo, textX, 58);

  // Data emissão (direita)
  const dataStr = new Date().toLocaleString("pt-BR");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Emitido em ${dataStr}`, pageWidth - margin, 42, { align: "right" });
  if (totalRegistros !== undefined) {
    doc.text(`${totalRegistros} registro(s)`, pageWidth - margin, 56, { align: "right" });
  }

  // Linha divisória
  doc.setDrawColor(20, 60, 35);
  doc.setLineWidth(1);
  doc.line(margin, 78, pageWidth - margin, 78);

  doc.setTextColor(0, 0, 0);
  return 92;
}

/** Desenha rodapé com disclaimer e numeração em todas as páginas. */
export function drawArBioFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(DISCLAIMER, margin, pageHeight - 26, { maxWidth: pageWidth - margin * 2 - 60 });
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 26, { align: "right" });
  }
}
