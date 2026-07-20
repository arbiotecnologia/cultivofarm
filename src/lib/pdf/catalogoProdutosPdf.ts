import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawArBioFooter, drawArBioHeader } from "./arBioHeader";
import { brl } from "@/lib/financial/format";
import { calcularValorLitro } from "@/lib/catalogo/pricing";

export interface ProdutoCatalogoItem {
  codigo: string | null;
  nome: string;
  tipo: string;
  dose_ml_ha: number | null;
  modo_aplicacao: string | null;
  valor_ha_brl: number | null;
  valor_dose_brl?: number | null;
  valor_litro_brl?: number | null;
  funcao_completa: string | null;
  ativo: boolean;
  b2b_enabled: boolean;
}

export async function generateCatalogoProdutosPdf(items: ProdutoCatalogoItem[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const startY = await drawArBioHeader(doc, {
    subtitulo: "Catálogo de Produtos Bioinsumos",
    totalRegistros: items.length,
  });

  autoTable(doc, {
    startY,
    head: [["Código", "Nome", "Tipo", "Dose (mL/ha)", "Aplicação", "Dose 100 mL", "R$/L", "Custo/ha", "B2B", "Status"]],
    body: items.map((p) => {
      const litro = p.valor_litro_brl ?? calcularValorLitro(p.valor_dose_brl ?? null);
      return [
        p.codigo || "—",
        p.nome,
        p.tipo || "—",
        p.dose_ml_ha != null ? String(p.dose_ml_ha) : "—",
        p.modo_aplicacao || "—",
        p.valor_dose_brl != null ? brl(p.valor_dose_brl) : "—",
        litro != null ? brl(litro) : "—",
        p.valor_ha_brl != null ? brl(p.valor_ha_brl) : "—",
        p.b2b_enabled ? "Sim" : "Não",
        p.ativo ? "Ativo" : "Inativo",
      ];
    }),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [20, 60, 35], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 245] },
    margin: { left: 40, right: 40, bottom: 60 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("Referência: 1 L = 10 doses de 100 mL.", 40, doc.internal.pageSize.getHeight() - 70);
    },
  });

  drawArBioFooter(doc);
  const today = new Date().toISOString().slice(0, 10);
  doc.save(`catalogo-produtos-${today}.pdf`);
}
