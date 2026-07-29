import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawArBioFooter, drawArBioHeader } from "./arBioHeader";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";
import {
  calcularValorLitro,
  calcularCustoHa,
  formatarMoedaOuTraco,
  formatarOuTraco,
  formatarDose,
  REFERENCIA_DOSE_LITRO,
} from "@/lib/catalogo/formatUnidades";

export interface MicrorganismoCatalogoItem {
  codigo: string | null;
  nome: string;
  nome_cientifico: string | null;
  tipo: string;
  funcao_agronomica: string | null;
  concentracao_ufc_ml: number | null;
  dose_ml_ha: number | null;
  valor_dose_brl: number | null;
  valor_litro_brl?: number | null;
  fornecedor: string | null;
  b2b_enabled: boolean;
  ativo: boolean;
}

const tipoLabels: Record<string, string> = {
  bacteria: "Bactéria",
  fungo: "Fungo",
  levedura: "Levedura",
  consorcio: "Consórcio",
};

export async function generateCatalogoMicrorganismosPdf(items: MicrorganismoCatalogoItem[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const startY = await drawArBioHeader(doc, {
    subtitulo: "Catálogo de Microrganismos",
    totalRegistros: items.length,
  });

  autoTable(doc, {
    startY,
    head: [["Código", "Microrganismo", "Tipo", "UFC/mL", "Dose (mL/ha)", "Dose 100 mL", "R$/L", "Custo/ha", "Função", "B2B", "Status"]],
    body: items.map((m) => {
      const litro = m.valor_litro_brl ?? calcularValorLitro(m.valor_dose_brl ?? null);
      const custoHa = calcularCustoHa(m.dose_ml_ha, m.valor_dose_brl);
      return [
        formatarOuTraco(m.codigo),
        m.nome_cientifico ? `${m.nome}\n${m.nome_cientifico}` : m.nome,
        formatarOuTraco(tipoLabels[m.tipo] || m.tipo),
        formatarOuTraco(formatConcentracaoDisplay(m.concentracao_ufc_ml)),
        formatarDose(m.dose_ml_ha, { comSufixo: false }),
        formatarMoedaOuTraco(m.valor_dose_brl),
        formatarMoedaOuTraco(litro),
        formatarMoedaOuTraco(custoHa),
        formatarOuTraco(m.funcao_agronomica),
        m.b2b_enabled ? "Sim" : "Não",
        m.ativo ? "Ativo" : "Inativo",
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
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(REFERENCIA_DOSE_LITRO, 40, doc.internal.pageSize.getHeight() - 70);
    },
  });

  drawArBioFooter(doc);
  const today = new Date().toISOString().slice(0, 10);
  doc.save(`catalogo-microrganismos-${today}.pdf`);
}
