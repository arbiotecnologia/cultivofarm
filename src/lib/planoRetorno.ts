
import { EncerramentoState } from "@/components/visita/EncerramentoCard";

const PLANO_RETORNO_TAG = "[PLANO DE RETORNO]";

export function serializePlanoRetorno(state: EncerramentoState): string {
  if (state.proximoPasso !== "programar_nova_visita") return "";
  
  const lines = [
    PLANO_RETORNO_TAG,
    `Data: ${state.dataProximaVisita}`,
    `Motivo: ${state.retornoMotivo || "Não informado"}`,
    `Turno: ${state.retornoTurno}`,
    `Duração: ${state.retornoDuracaoMin} min`,
    `Lembrete: ${state.retornoLembreteDias} dias antes`,
    state.retornoObservacoes ? `Obs: ${state.retornoObservacoes}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

export function parsePlanoRetorno(text: string | null): Partial<EncerramentoState> | null {
  if (!text || !text.includes(PLANO_RETORNO_TAG)) return null;

  try {
    const section = text.split(PLANO_RETORNO_TAG)[1].trim();
    const lines = section.split("\n");
    
    const getValue = (key: string) => {
      const line = lines.find(l => l.startsWith(`${key}:`));
      return line ? line.split(`${key}:`)[1].trim() : null;
    };

    return {
      dataProximaVisita: getValue("Data") || "",
      retornoMotivo: getValue("Motivo") || "",
      retornoTurno: (getValue("Turno") as any) || "qualquer",
      retornoDuracaoMin: Number(getValue("Duração")?.split(" ")[0]) || 60,
      retornoLembreteDias: Number(getValue("Lembrete")?.split(" ")[0]) || 1,
      retornoObservacoes: getValue("Obs") || "",
      proximoPasso: "programar_nova_visita"
    };
  } catch (e) {
    console.error("Erro ao fazer parse do plano de retorno:", e);
    return null;
  }
}

export function stripPlanoRetorno(text: string | null): string {
  if (!text) return "";
  return text.split(PLANO_RETORNO_TAG)[0].trim();
}
