export type TipoRisco = "praga" | "doenca" | "daninha" | "nematoide" | "estresse_hidrico";
export type NivelRisco = "baixo" | "medio" | "alto" | "critico";

export interface RiscoResult {
  tipo: TipoRisco;
  nivel: NivelRisco;
  descricao: string;
  sugestao: string;
}

export interface DadosClima {
  temperatura: number | null;
  umidade: number | null;
  chuva_mm: number | null;
  chuva_acumulada_3d: number;
  dias_sem_chuva: number;
}

export interface HistoricoTalhao {
  ocorrencias_praga: number;
  ocorrencias_doenca: number;
  ocorrencias_nematoide: number;
  ocorrencias_daninha: number;
}

export function calcularRiscos(
  clima: DadosClima,
  historico: HistoricoTalhao
): RiscoResult[] {
  const riscos: RiscoResult[] = [];
  const temp = clima.temperatura ?? 0;
  const umid = clima.umidade ?? 0;
  const chuva = clima.chuva_mm ?? 0;

  // Doença fúngica
  if (umid > 80 && temp >= 20 && temp <= 28 && chuva > 5) {
    riscos.push({
      tipo: "doenca",
      nivel: historico.ocorrencias_doenca >= 2 ? "critico" : "alto",
      descricao: "Condições favoráveis para doenças fúngicas: umidade elevada, temperatura entre 20-28°C e chuva recente.",
      sugestao: "Intensificar monitoramento. Considerar manejo preventivo biológico.",
    });
  } else if (umid > 70 && temp >= 18 && temp <= 30) {
    riscos.push({
      tipo: "doenca",
      nivel: "medio",
      descricao: "Condições moderadamente favoráveis para doenças fúngicas.",
      sugestao: "Manter monitoramento regular.",
    });
  } else {
    riscos.push({ tipo: "doenca", nivel: "baixo", descricao: "Risco baixo de doenças fúngicas.", sugestao: "Monitoramento de rotina." });
  }

  // Pragas
  if (temp > 25 && chuva < 5) {
    const nivel: NivelRisco = temp > 30 && clima.dias_sem_chuva > 5 ? "alto" : "medio";
    riscos.push({
      tipo: "praga",
      nivel: historico.ocorrencias_praga >= 3 ? "critico" : nivel,
      descricao: `Temperatura elevada (${temp}°C) e baixa precipitação favorecem pragas.`,
      sugestao: "Avaliar manejo preventivo biológico para insetos-praga.",
    });
  } else {
    riscos.push({ tipo: "praga", nivel: "baixo", descricao: "Risco baixo de pragas.", sugestao: "Monitoramento de rotina." });
  }

  // Plantas daninhas
  if (clima.chuva_acumulada_3d > 30) {
    riscos.push({
      tipo: "daninha",
      nivel: "alto",
      descricao: `Precipitação acumulada de ${clima.chuva_acumulada_3d.toFixed(0)}mm nos últimos 3 dias favorece germinação de plantas daninhas.`,
      sugestao: "Antecipar manejo de plantas daninhas. Avaliar cobertura de solo.",
    });
  } else if (clima.chuva_acumulada_3d > 15) {
    riscos.push({ tipo: "daninha", nivel: "medio", descricao: "Chuva moderada pode favorecer plantas daninhas.", sugestao: "Monitorar emergência de daninhas." });
  } else {
    riscos.push({ tipo: "daninha", nivel: "baixo", descricao: "Risco baixo de plantas daninhas.", sugestao: "Monitoramento de rotina." });
  }

  // Estresse hídrico
  if (clima.dias_sem_chuva >= 7 && temp > 30) {
    riscos.push({
      tipo: "estresse_hidrico",
      nivel: clima.dias_sem_chuva >= 14 ? "critico" : "alto",
      descricao: `${clima.dias_sem_chuva} dias sem chuva com temperatura acima de 30°C.`,
      sugestao: "Avaliar irrigação de suporte. Monitorar sinais de estresse nas culturas.",
    });
  } else if (clima.dias_sem_chuva >= 5) {
    riscos.push({ tipo: "estresse_hidrico", nivel: "medio", descricao: "Período seco moderado.", sugestao: "Monitorar umidade do solo." });
  } else {
    riscos.push({ tipo: "estresse_hidrico", nivel: "baixo", descricao: "Disponibilidade hídrica adequada.", sugestao: "Sem ação necessária." });
  }

  // Nematoides
  if (umid > 60 && temp >= 22 && temp <= 30 && historico.ocorrencias_nematoide >= 2) {
    riscos.push({
      tipo: "nematoide",
      nivel: historico.ocorrencias_nematoide >= 3 ? "critico" : "alto",
      descricao: "Histórico de nematoides com condições de solo favoráveis (umidade e temperatura).",
      sugestao: "Revisar manejo biológico do solo. Considerar rotação de culturas.",
    });
  } else if (historico.ocorrencias_nematoide >= 1) {
    riscos.push({ tipo: "nematoide", nivel: "medio", descricao: "Histórico de nematoides na área.", sugestao: "Manter monitoramento e considerar tratamento preventivo." });
  } else {
    riscos.push({ tipo: "nematoide", nivel: "baixo", descricao: "Sem histórico significativo de nematoides.", sugestao: "Monitoramento de rotina." });
  }

  return riscos;
}

export function getNivelRiscoCor(nivel: NivelRisco): string {
  switch (nivel) {
    case "baixo": return "text-green-600 bg-green-100";
    case "medio": return "text-yellow-700 bg-yellow-100";
    case "alto": return "text-orange-700 bg-orange-100";
    case "critico": return "text-red-700 bg-red-100";
  }
}

export function getNivelRiscoLabel(nivel: NivelRisco): string {
  switch (nivel) {
    case "baixo": return "Baixo";
    case "medio": return "Médio";
    case "alto": return "Alto";
    case "critico": return "Crítico";
  }
}

export function getTipoAlertaLabel(tipo: TipoRisco): string {
  switch (tipo) {
    case "praga": return "Pragas";
    case "doenca": return "Doenças";
    case "daninha": return "Plantas Daninhas";
    case "nematoide": return "Nematoides";
    case "estresse_hidrico": return "Estresse Hídrico";
  }
}
