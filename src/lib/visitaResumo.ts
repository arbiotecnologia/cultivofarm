import { formatDateDisplay } from "@/lib/date-utils";

export function gerarResumoEncerramento(dados: {
  tipo?: string;
  data?: string;
  diagnostico?: {
    problema?: string;
    severidade?: string;
    incidencia?: number;
  };
  conduta?: string;
  proximoPassoLabel?: string;
  dataProximaVisita?: string;
}) {
  const dataFormatada = dados.data ? formatDateDisplay(dados.data) : formatDateDisplay(new Date());
  const tipo = dados.tipo || "Visita técnica";
  
  let resumo = `${tipo} realizada em ${dataFormatada}.`;

  if (dados.diagnostico?.problema) {
    resumo += ` Identificado(a) ${dados.diagnostico.problema}`;
    if (dados.diagnostico.severidade || dados.diagnostico.incidencia) {
      const detalhes = [];
      if (dados.diagnostico.severidade) detalhes.push(`severidade ${dados.diagnostico.severidade}`);
      if (dados.diagnostico.incidencia) detalhes.push(`${dados.diagnostico.incidencia}% de incidência`);
      resumo += ` (${detalhes.join(", ")}).`;
    } else {
      resumo += ".";
    }
  }

  if (dados.conduta) {
    resumo += ` Conduta técnica: ${dados.conduta}.`;
  }

  if (dados.proximoPassoLabel) {
    resumo += ` Próximo passo definido: ${dados.proximoPassoLabel}`;
    if (dados.dataProximaVisita) {
      const dataRetorno = formatDateDisplay(dados.dataProximaVisita + "T12:00:00");
      resumo += ` para o dia ${dataRetorno}`;
    }
    resumo += ".";
  }

  return resumo;
}
