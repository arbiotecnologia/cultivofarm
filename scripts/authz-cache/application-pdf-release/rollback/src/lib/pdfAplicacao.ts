import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDateDisplay, formatDateTimeDisplay, formatTimeDisplay } from "@/lib/date-utils";
import { formatOS } from "./osLabel";


export interface AplicacaoPdfData {
  empresa: { nome: string; logoUrl?: string | null };
  aplicacao: any;
  doseRecomendada?: number;
}

export async function generateAplicacaoPdf(data: AplicacaoPdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;
  const a = data.aplicacao;

  // Header
  doc.setFillColor(34, 102, 64);
  doc.rect(0, 0, pageWidth, 60, "F");
  
  // Try to add logo if available
  if (data.empresa.logoUrl) {
    try {
      const logoBase64 = await fetchAsDataUrl(data.empresa.logoUrl);
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", margin, 10, 40, 40, undefined, "FAST");
      }
    } catch (e) {
      console.error("Error adding logo to PDF:", e);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(data.empresa.nome || "Relatório de Aplicação", data.empresa.logoUrl ? margin + 50 : margin, 35);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório Detalhado de Manejo de Campo", data.empresa.logoUrl ? margin + 50 : margin, 50);

  y = 90;
  doc.setTextColor(0, 0, 0);

  // Identification block
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Identificação da Aplicação", margin, y);
  y += 10;

  const dataAplicacao = formatDateDisplay(a.data_aplicacao);
  const horario = formatTimeDisplay(a.hora_inicio) || "—";

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    body: [
      ["Ordem de Serviço", formatOS(a.os)],
      ["Data", dataAplicacao],
      ["Horário Início", horario],
      ["Fazenda", a.os?.fazendas?.nome || "—"],
      ["Talhão", a.os?.talhoes?.nome || "—"],
      ["Produto", a.os?.produtos?.nome || "—"],
      ["Responsável", a.responsavel || "—"],
      ["Status", (a.resultado_inicial || "Executado").toUpperCase()],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  // Comparative Doses
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Comparativo de Manejo", margin, y);
  y += 10;

  const doseAplicada = a.dose_aplicada || 0;
  const doseRec = data.doseRecomendada || 0;
  const desvio = doseRec > 0 ? ((doseAplicada - doseRec) / doseRec) * 100 : 0;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 6 },
    head: [["Item", "Recomendado", "Aplicado", "Desvio"]],
    body: [
      [
        "Dose (mL/ha)",
        `${doseRec} mL/ha`,
        `${doseAplicada} mL/ha`,
        `${desvio > 0 ? "+" : ""}${desvio.toFixed(1)}%`
      ],
      [
        "Área Total",
        "—",
        `${a.area_aplicada_ha || 0} ha`,
        "—"
      ],
      [
        "Volume de Calda",
        "—",
        `${a.volume_calda_l_ha || 0} L/ha`,
        "—"
      ]
    ],
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  // Technical Details
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Detalhes Técnicos e Clima", margin, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    body: [
      ["Modo de Aplicação", a.modo_aplicacao || "—"],
      ["Equipamento", [a.equipamento, a.equipamento_modelo].filter(Boolean).join(" ") || "—"],
      ["Tipo de Bico", a.bico_tipo || "—"],
      ["Pressão (bar)", a.pressao_bar || "—"],
      ["Temperatura", a.temperatura_c ? `${a.temperatura_c}°C` : "—"],
      ["Umidade Relativa", a.umidade_pct ? `${a.umidade_pct}%` : "—"],
      ["Velocidade Vento", a.vento_kmh ? `${a.vento_kmh} km/h` : "—"],
      ["Localização (GPS)", a.latitude ? `${Number(a.latitude).toFixed(6)}, ${Number(a.longitude).toFixed(6)}` : "—"],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  // Observations & Rectification
  if (a.motivo_retificacao || a.observacoes) {
    if (y > pageHeight - 100) { doc.addPage(); y = margin; }
    
    if (a.motivo_retificacao) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Justificativa de Retificação", margin, y);
      y += 14;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(a.motivo_retificacao, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 10;
    }

    if (a.observacoes) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Observações", margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(a.observacoes, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 10;
    }
  }

  // Evidence Gallery
  const { data: vinculos } = await supabase
    .from("aplicacao_evidencias_vinculos")
    .select(`
      evidencia:evidencia_id (
        *,
        aplicacoes_origem:aplicacoes!aplicacao_evidencias_versao_origem_id_fkey(versao)
      )
    `)
    .eq("aplicacao_id", a.id)
    .order("created_at", { ascending: true });

  const evidencias = vinculos?.map((v: any) => v.evidencia).filter((e: any) => e.tipo === "foto") || [];

  if (evidencias && evidencias.length > 0) {
    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Evidências Fotográficas (${evidencias.length})`, margin, y);
    y += 18;

    const cellWidth = (pageWidth - margin * 2 - 12) / 2;
    const cellHeight = 160;
    const captionHeight = 24;
    const rowHeight = cellHeight + captionHeight + 8;
    let col = 0;

    for (let i = 0; i < evidencias.length; i++) {
      const ev = evidencias[i];
      try {
        const { data: s } = await supabase.storage
          .from("aplicacao-evidencias")
          .createSignedUrl(ev.storage_path, 600);
        
        if (!s?.signedUrl) continue;
        
        const dataUrl = await fetchAsDataUrl(s.signedUrl);
        if (!dataUrl) continue;

        if (y + rowHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
          col = 0;
        }

        const x = margin + col * (cellWidth + 12);
        doc.addImage(dataUrl, "JPEG", x, y, cellWidth, cellHeight, undefined, "FAST");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        
        const origVersao = (ev as any).aplicacoes_origem?.versao;
        const originText = origVersao ? ` [v${origVersao}]` : "";
        
        const captionLines = doc.splitTextToSize(
          `${i + 1}. ${ev.legenda || "Sem legenda"}${originText}`,
          cellWidth
        );
        doc.text(captionLines.slice(0, 2), x, y + cellHeight + 12);

        col++;
        if (col >= 2) {
          col = 0;
          y += rowHeight;
        }
      } catch (e) {
        console.error("Error adding evidence image:", e);
      }
    }
  }

  // Footer
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${data.empresa.nome} • Gerado em ${formatDateTimeDisplay(new Date())} • Página ${i}/${totalPages}`,
      margin,
      pageHeight - 20
    );
  }

  return doc;
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
