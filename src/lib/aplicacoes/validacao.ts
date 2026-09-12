/**
 * Validação pura dos campos numéricos e temporais do registro de aplicação.
 * Mantida fora do componente para permitir testes focados sem render.
 */
export type EntradaAplicacao = {
  osId?: string | null;
  doseAplicada?: string | number | null;
  areaAplicada?: string | number | null;
  volumeCalda?: string | number | null;
  pressaoBar?: string | number | null;
  umidade?: string | number | null;
  vento?: string | number | null;
  temperatura?: string | number | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  rectifyId?: string | null;
  motivoRetificacao?: string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Retorna a primeira mensagem de erro bloqueante, ou null quando válido. */
export function validarAplicacao(e: EntradaAplicacao): string | null {
  if (!e.osId) return "Selecione a OS";

  const dose = num(e.doseAplicada);
  const area = num(e.areaAplicada);
  if (dose === null || area === null) return "Informe dose e área";
  if (Number.isNaN(dose) || dose <= 0) return "Dose aplicada deve ser um número maior que zero";
  if (Number.isNaN(area) || area <= 0) return "Área aplicada deve ser um número maior que zero";

  const opcionais: Array<[string, number | null, number, number]> = [
    ["Volume de calda", num(e.volumeCalda), 0, 100000],
    ["Pressão", num(e.pressaoBar), 0, 100],
    ["Umidade", num(e.umidade), 0, 100],
    ["Vento", num(e.vento), 0, 200],
    ["Temperatura", num(e.temperatura), -50, 60],
  ];
  for (const [nome, valor, min, max] of opcionais) {
    if (valor === null) continue;
    if (Number.isNaN(valor)) return `${nome} deve ser um número válido`;
    if (valor < min || valor > max) return `${nome} deve estar entre ${min} e ${max}`;
  }

  if (e.horaInicio && e.horaFim) {
    const ini = new Date(e.horaInicio).getTime();
    const fim = new Date(e.horaFim).getTime();
    if (Number.isNaN(ini) || Number.isNaN(fim)) return "Horário inválido";
    if (fim <= ini) return "A hora de término deve ser posterior à hora de início";
  }
  if (e.horaInicio && Number.isNaN(new Date(e.horaInicio).getTime())) return "Horário inválido";
  if (e.horaFim && Number.isNaN(new Date(e.horaFim).getTime())) return "Horário inválido";

  if (e.rectifyId && !e.motivoRetificacao) return "Informe o motivo da retificação";

  return null;
}
