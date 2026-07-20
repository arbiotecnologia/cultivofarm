import { EncerramentoState } from "../components/visita/EncerramentoCard";

const PLANO_TAG_START = "[PLANO DE MONITORAMENTO]";
const PLANO_TAG_END = "[FIM DO PLANO]";

export const serializePlanoMonitoramento = (state: EncerramentoState): string => {
  const lines = [
    PLANO_TAG_START,
    `Itens: ${state.monitoramentoItens.join(", ")}`,
    `Frequência: ${state.monitoramentoFrequencia} dias`,
    `Gatilhos: ${state.monitoramentoGatilhos}`,
    `Próxima Avaliação: ${state.dataProximaVisita}`,
    PLANO_TAG_END
  ];
  return lines.join("\n");
};

export const parsePlanoMonitoramento = (text: string | null): Partial<EncerramentoState> | null => {
  if (!text || !text.includes(PLANO_TAG_START)) return null;

  try {
    const startIdx = text.indexOf(PLANO_TAG_START);
    const endIdx = text.indexOf(PLANO_TAG_END);
    const content = text.slice(startIdx + PLANO_TAG_START.length, endIdx).trim();
    
    const lines = content.split("\n");
    const result: Partial<EncerramentoState> = {
      monitoramentoItens: [],
      monitoramentoFrequencia: "7",
      monitoramentoGatilhos: "",
      dataProximaVisita: ""
    };

    lines.forEach(line => {
      if (line.startsWith("Itens: ")) {
        result.monitoramentoItens = line.replace("Itens: ", "").split(", ").filter(Boolean);
      } else if (line.startsWith("Frequência: ")) {
        result.monitoramentoFrequencia = line.replace("Frequência: ", "").replace(" dias", "");
      } else if (line.startsWith("Gatilhos: ")) {
        result.monitoramentoGatilhos = line.replace("Gatilhos: ", "");
      } else if (line.startsWith("Próxima Avaliação: ")) {
        result.dataProximaVisita = line.replace("Próxima Avaliação: ", "");
      }
    });

    return result;
  } catch (e) {
    console.error("Erro ao fazer parse do plano de monitoramento:", e);
    return null;
  }
};

export const stripPlanoMonitoramento = (text: string | null): string => {
  if (!text || !text.includes(PLANO_TAG_START)) return text || "";
  
  const startIdx = text.indexOf(PLANO_TAG_START);
  const endIdx = text.indexOf(PLANO_TAG_END);
  
  if (startIdx === -1 || endIdx === -1) return text;
  
  return (text.slice(0, startIdx) + text.slice(endIdx + PLANO_TAG_END.length)).trim();
};
