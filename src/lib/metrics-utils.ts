/**
 * Utilitários para formatação de métricas e KPIs do sistema Cultivo Farm.
 * Garante que valores ausentes sejam exibidos como "Sem dados suficientes".
 */

export const SEM_DADOS = "Sem dados suficientes";

/**
 * Formata um valor numérico com unidade.
 * @param value Valor numérico (pode ser null/undefined)
 * @param unit Unidade (ex: "h", "L", "%")
 * @param precision Casas decimais (default 1)
 */
export function formatMetric(value: number | string | null | undefined, unit: string = "", precision: number = 1): string {
  if (value === null || value === undefined || value === "") return SEM_DADOS;
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return SEM_DADOS;

  // Formatação baseada na unidade
  if (unit === "%") {
    return `${numValue.toFixed(precision)}%`;
  }

  if (unit === "L") {
    return `${numValue.toLocaleString("pt-BR", { minimumFractionDigits: precision, maximumFractionDigits: precision })} L`;
  }

  if (unit === "h") {
    return `${numValue.toFixed(precision)}h`;
  }
  
  if (unit === "d") {
    return `${numValue.toFixed(precision)} dias`;
  }

  return `${numValue.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: precision })} ${unit}`.trim();
}

/**
 * Formata um intervalo de tempo (PostgreSQL Interval) em horas.
 * @param interval String de intervalo (ex: "02:30:00" ou "2 days 04:00:00")
 */
export function formatIntervalToHours(interval: string | null | undefined): string {
  if (!interval) return SEM_DADOS;

  try {
    // Regex simples para tentar extrair dias e horas
    // PostgreSQL interval format: "02:30:00" or "1 day 02:30:00" or "2 days 04:30:00"
    let totalHours = 0;
    
    // Extrai dias
    const dayMatch = interval.match(/(\d+)\s+day/);
    if (dayMatch) {
      totalHours += parseInt(dayMatch[1]) * 24;
    }
    
    // Extrai horas, minutos, segundos (HH:MM:SS)
    const timeMatch = interval.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (timeMatch) {
      totalHours += parseInt(timeMatch[1]);
      totalHours += parseInt(timeMatch[2]) / 60;
      totalHours += parseInt(timeMatch[3]) / 3600;
    } else if (!dayMatch) {
      // Caso seja apenas um número (alguns drivers retornam segundos ou ms)
      const num = parseFloat(interval);
      if (!isNaN(num)) return formatMetric(num, "h");
      return SEM_DADOS;
    }

    return formatMetric(totalHours, "h");
  } catch (e) {
    console.error("Erro ao formatar intervalo:", e);
    return SEM_DADOS;
  }
}

/**
 * Calcula a taxa de conversão.
 */
export function calculateConversionRate(converted: number, total: number): string {
  if (!total || total === 0) return SEM_DADOS;
  const rate = (converted / total) * 100;
  return formatMetric(rate, "%");
}
