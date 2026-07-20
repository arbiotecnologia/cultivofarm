import { format } from "date-fns";

export const BI_VISITAS_HEADERS = {
  codigo_visita: "Código",
  cliente_nome: "Cliente",
  fazenda_nome: "Fazenda",
  talhao_nome: "Talhão",
  consultor_nome: "Consultor",
  status_visita: "Status",
  created_at: "Solicitação",
  data_checkin: "Check-in",
  data_finalizacao: "Finalização",
  possui_recomendacao: "Recomendação",
  possui_os: "Conversão OS"
};

export const BI_LABORATORIO_HEADERS = {
  numero_os: "OS",
  cliente_nome: "Cliente",
  fazenda_nome: "Fazenda",
  produto_nome: "Produto",
  microrganismo_nome: "Microrganismo",
  status_esteira_oficial: "Status",
  cq_resultado: "Qualidade",
  created_at: "Abertura",
  data_programada: "Programação",
  data_inicio_producao: "Produção",
  volume_solicitado_l: "Volume Solicitado (L)",
  pode_finalizar: "Pode Finalizar"
};


export const BI_ENTREGAS_HEADERS = {
  numero_os: "OS",
  cliente_nome: "Cliente",
  fazenda_nome: "Fazenda",
  produto_nome: "Produto",
  entrega_status: "Status Entrega",
  entrega_confirmada: "Confirmada",
  data_entrega: "Data Entrega",
  volume_solicitado_l: "Volume Solicitado (L)"
};

export const BI_GARGALOS_HEADERS = {
  tipo: "Tipo de Gargalo",
  gravidade: "Gravidade",
  etapa: "Etapa",
  cliente: "Cliente",
  fazenda: "Fazenda",
  proxima_acao: "Próxima Ação",
  origem: "Origem"
};

export function sanitizeCSVValue(value: any): string {
  if (value === null || value === undefined) return "";
  
  let stringValue = Array.isArray(value) ? value.join("; ") : String(value);

  const trimmed = stringValue.trimStart();
  // Proteção contra CSV Injection (fórmulas de planilha)
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    stringValue = "'" + stringValue;
  }

  if (
    stringValue.includes(",") || 
    stringValue.includes("\"") || 
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  
  return stringValue;
}

export function formatDateForExport(date: string | Date | null): string {
  if (!date) return "";
  try {
    return format(new Date(date), "dd/MM/yyyy HH:mm:ss");
  } catch (e) {
    return String(date);
  }
}

export function buildExportFilename(prefix: string): string {
  const dateStr = format(new Date(), "yyyy-MM-dd");
  return `ar-bio-bi-${prefix}-${dateStr}.csv`;
}

export function exportToCSV(data: any[], headers: Record<string, string>, filename: string) {
  if (!data || !data.length) return;

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  const csvRows = [];
  csvRows.push(headerLabels.join(","));

  data.forEach((row) => {
    const values = headerKeys.map((key) => {
      let val = row[key];
      // Formatação especial se necessário
      if (key.includes("at") || key.includes("data_") || key === "created_at") {
        val = formatDateForExport(val);
      }
      return sanitizeCSVValue(val);
    });
    csvRows.push(values.join(","));
  });

  const csvContent = csvRows.join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
