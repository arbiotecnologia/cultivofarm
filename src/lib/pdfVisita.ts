import { formatDateTimeDisplay } from "@/lib/date-utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ATTACHMENT_LIMITS, downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";

export interface VisitaPdfData {
  empresa: { nome: string; logoUrl?: string | null };
  cliente?: string | null;
  fazenda?: string | null;
  talhao?: string | null;
  tipoManejo?: string | null;
  cultura?: string | null;
  consultor?: string | null;
  dataVisita: string;
  horaInicio?: string | null;
  horaFim?: string | null;
  status?: string | null;
  checkin?: { latitude?: number | null; longitude?: number | null; dataHora?: string | null; precisao?: number | null } | null;
  coordenadasVistoria?: { latitude?: number | null; longitude?: number | null } | null;
  problemaPrincipal?: string | null;
  nivelPressao?: string | null;
  percentualAfetado?: number | null;
  riscoProdutivo?: string | null;
  descricaoTecnica?: string | null;
  acaoRealizada?: string | null;
  orientacaoCliente?: string | null;
  proximaAcao?: string | null;
  recomendacaoPreliminar?: string | null;
  /** Somente caminhos de Storage; bytes vêm do download autenticado (RLS). URLs gravadas nunca são consumidas. */
  fotos?: { path: string | null; legenda?: string | null }[];
  audios?: { duracao?: number | null; legenda?: string | null }[];
  evidenciasExtras?: { categoria?: string | null; legenda?: string | null; data?: string | null }[];
  recomendacao?: {
    produto?: string;
    dose?: string;
    objetivo?: string;
    estrategia?: string;
    volumeCalda?: string;
    modoAplicacao?: string;
    momentoAplicacao?: string;
    numeroAplicacoes?: string;
    intervalo?: string;
    observacoes?: string;
    cuidadosOperacionais?: string;
  } | null;
  osVinculadas?: {
    numeroOs: string;
    produto: string;
    dose: string;
    area: string;
    volumeTotal: string;
    modoAplicacao: string;
    dataProgramada: string;
    status: string;
    loteProducao?: string;
    dataEntrega?: string;
  }[];
}

/**
 * Generate a PDF report of a technical visit.
 * Returns the jsPDF instance so caller can save() or output().
 *
 * Paginação: TODAS as fotos são incluídas, com quebras automáticas a cada par.
 */
export interface VisitaPdfOptions {
  /** Cancela downloads pendentes (unmount, troca de identidade, novo pedido). */
  signal?: AbortSignal;
  bucket?: string;
}

export async function generateVisitaPdf(data: VisitaPdfData, options: VisitaPdfOptions = {}): Promise<jsPDF> {
  const signal = options.signal ?? new AbortController().signal;
  const bucket = options.bucket ?? "consultor-arquivos";
  let totalBytes = 0;
  /** Download autenticado canônico; falha → null (sem URL gravada, sem assinatura). */
  const authenticatedImage = async (path: string | null | undefined): Promise<string | null> => {
    if (!path) return null;
    try {
      const blob = await downloadAuthenticatedAttachment(bucket, path, signal);
      if (signal.aborted || !blob.size || blob.size > ATTACHMENT_LIMITS.fileBytes || totalBytes + blob.size > ATTACHMENT_LIMITS.totalBytes) return null;
      totalBytes += blob.size;
      return await blobToDataUrl(blob);
    } catch {
      return null;
    }
  };

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // Header
  doc.setFillColor(34, 102, 64);
  doc.rect(0, 0, pageWidth, 60, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(data.empresa.nome || "Relatório de Visita Técnica", margin, 35);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório de Visita Técnica de Campo", margin, 50);

  y = 90;
  doc.setTextColor(0, 0, 0);

  // Identification block
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Identificação", margin, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    head: [],
    body: [
      ["Cliente", data.cliente || "—"],
      ["Fazenda", data.fazenda || "—"],
      ["Talhão", data.talhao ? `${data.talhao}${data.tipoManejo ? ` (${data.tipoManejo})` : ''}` : "—"],
      ["Cultura", data.cultura || "—"],
      ["Consultor", data.consultor || "—"],
      ["Data da visita", data.dataVisita],
      ["Hora início / fim", `${data.horaInicio || "—"} / ${data.horaFim || "—"}`],
      ["Status", data.status || "—"],
      ...(data.coordenadasVistoria?.latitude 
        ? [["Localização (GPS)", `${data.coordenadasVistoria.latitude}, ${data.coordenadasVistoria.longitude}`]] 
        : []),
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // Check-in block
  if (data.checkin) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Check-in de Campo", margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      body: [
        ["Latitude", data.checkin.latitude?.toString() || "—"],
        ["Longitude", data.checkin.longitude?.toString() || "—"],
        ["Precisão", data.checkin.precisao != null ? `±${Math.round(data.checkin.precisao)}m` : "—"],
        ["Data/hora", data.checkin.dataHora || "—"],
      ],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // Diagnosis
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Diagnóstico Técnico", margin, y);
  y += 10;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    body: [
      ["Problema principal", data.problemaPrincipal || "—"],
      ["Nível de pressão", data.nivelPressao || "—"],
      ["% área afetada", data.percentualAfetado != null ? `${data.percentualAfetado}%` : "—"],
      ["Risco produtivo", data.riscoProdutivo || "—"],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // Description blocks
  const longText = (label: string, text?: string | null) => {
    if (!text) return;
    if (y > pageHeight - margin - 60) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(label, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 10;
  };

  longText("Descrição técnica", data.descricaoTecnica);
  longText("Ação realizada", data.acaoRealizada);
  longText("Orientação passada ao cliente", data.orientacaoCliente);
  longText("Próxima ação recomendada", data.proximaAcao);
  longText("Recomendação preliminar", data.recomendacaoPreliminar);

  // Recomendação Detalhada
  if (data.recomendacao) {
    if (y > pageHeight - margin - 150) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Recomendação Técnica Detalhada", margin, y);
    y += 10;
    const r = data.recomendacao;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      body: [
        ["Produto/Biológico", r.produto || "—"],
        ["Dose Recomendada", r.dose || "—"],
        ["Objetivo", r.objetivo || "—"],
        ["Estratégia", r.estrategia || "—"],
        ["Volume de Calda", r.volumeCalda || "—"],
        ["Modo de Aplicação", r.modoAplicacao || "—"],
        ["Momento / Intervalo", `${r.momentoAplicacao || "—"} / ${r.intervalo || "—"}`],
        ["Nº Aplicações", r.numeroAplicacoes || "—"],
      ],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    longText("Cuidados Operacionais", r.cuidadosOperacionais);
    longText("Observações Finais", r.observacoes);
  }

  // OS Vinculadas (Relatório Consolidado)
  if (data.osVinculadas && data.osVinculadas.length > 0) {
    if (y > pageHeight - margin - 150) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Consolidado de Ordens de Serviço (OS)", margin, y);
    y += 10;
    
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 3 },
      head: [["Nº OS", "Produto", "Dose", "Área", "Volume", "Status", "Data Prog.", "Entrega"]],
      body: data.osVinculadas.map(os => [
        os.numeroOs,
        os.produto,
        os.dose,
        os.area,
        os.volumeTotal,
        os.status.toUpperCase(),
        os.dataProgramada,
        os.dataEntrega || "—"
      ]),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // Photos — TODAS, com paginação automática (2 por linha)
  if (data.fotos && data.fotos.length > 0) {
    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Evidências Fotográficas (${data.fotos.length})`, margin, y);
    y += 18;

    const cellWidth = (pageWidth - margin * 2 - 12) / 2;
    const cellHeight = 160;
    const captionHeight = 24;
    const rowHeight = cellHeight + captionHeight + 8;
    let col = 0;
    let unavailablePhotos = 0;

    for (let i = 0; i < data.fotos.length; i++) {
      const foto = data.fotos[i];
      try {
        const dataUrl = await authenticatedImage(foto.path);
        if (!dataUrl) { unavailablePhotos++; continue; }

        // Quebra de página
        if (y + rowHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
          col = 0;
        }

        const x = margin + col * (cellWidth + 12);
        doc.addImage(dataUrl, "JPEG", x, y, cellWidth, cellHeight, undefined, "FAST");

        // Legenda
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const captionLines = doc.splitTextToSize(
          `${i + 1}. ${foto.legenda || "Sem legenda"}`,
          cellWidth
        );
        doc.text(captionLines.slice(0, 2), x, y + cellHeight + 12);

        col++;
        if (col >= 2) {
          col = 0;
          y += rowHeight;
        }
      } catch {
        // skip image errors silently
      }
    }
    if (col > 0) y += rowHeight;
    if (unavailablePhotos > 0) {
      if (y > pageHeight - margin - 20) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`${unavailablePhotos} foto(s) indisponível(is) para este acesso — consulte no sistema.`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
    }
  }

  // Áudios
  if (data.audios && data.audios.length > 0) {
    if (y > pageHeight - margin - 100) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("Áudios da Visita", margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4 },
      head: [["#", "Duração", "Legenda", "Acesso"]],
      body: data.audios.map((a, idx) => [
        String(idx + 1),
        a.duracao ? `${a.duracao}s` : "—",
        a.legenda || "—",
        ACCESS_NOTE,
      ]),
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 60 }, 3: { cellWidth: 200 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // Evidências extras
  if (data.evidenciasExtras && data.evidenciasExtras.length > 0) {
    if (y > pageHeight - margin - 100) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("Evidências Anexas", margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4 },
      head: [["Finalidade", "Legenda", "Data", "Acesso"]],
      body: data.evidenciasExtras.map((ev) => [
        formatCategoria(ev.categoria),
        ev.legenda || "—",
        ev.data || "—",
        ACCESS_NOTE,
      ]),
      columnStyles: { 3: { cellWidth: 200 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

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

/**
 * Compartilha o PDF gerado via Web Share API (mobile).
 * Retorna true se o share foi disparado, false se não disponível (fallback para download).
 */
export async function sharePdf(doc: jsPDF, fileName: string): Promise<boolean> {
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    (navigator as any).canShare &&
    (navigator as any).canShare({ files: [file] })
  ) {
    try {
      await (navigator as any).share({
        files: [file],
        title: "Prontuário de Visita Técnica",
        text: "Compartilhamento do prontuário",
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const ACCESS_NOTE = "Disponível no sistema (acesso autenticado)";

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function formatCategoria(c?: string | null): string {
  if (!c) return "Geral";
  const map: Record<string, string> = {
    laudo: "Laudo",
    documento_cliente: "Documento do cliente",
    recomendacao_anexa: "Recomendação anexa",
    praga: "Praga",
    doenca: "Doença",
    planta_daninha: "Planta daninha",
    nematoide: "Nematoide",
    solo: "Solo",
    aplicacao: "Aplicação",
    geral: "Geral",
  };
  return map[c] || c;
}
