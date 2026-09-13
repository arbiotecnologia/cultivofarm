/**
 * Regras puras da tela de Previsão Climática (/previsao-agronomica).
 *
 * Princípios aplicados nesta auditoria:
 * - Nenhuma fonte meteorológica, fórmula ou faixa agronômica nova é inventada:
 *   as faixas abaixo são apenas sanidade física de entrada manual (validação
 *   de digitação), não parâmetros agronômicos de decisão.
 * - Ausência de dado nunca vira zero. Agregações retornam `null` quando não há
 *   leitura válida, para a tela exibir "—" em vez de um número enganoso.
 * - Datas/horas são exibidas no fuso operacional America/Sao_Paulo.
 */

export const TIMEZONE_OPERACIONAL = "America/Sao_Paulo";

/** Timeout da sincronização climática (Edge Function sync-clima). */
export const SYNC_TIMEOUT_MS = 30_000;

/** Fonte automática usada pela Edge Function existente `sync-clima`. */
export const FONTE_AUTOMATICA = "Open-Meteo";

/** Leitura numérica segura: 0 é valor válido, vazio/NaN é ausência. */
export function numeroOuNulo(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Média apenas das leituras existentes; `null` quando não há nenhuma. */
export function mediaOuNulo(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Soma apenas das leituras existentes; `null` quando não há nenhuma. */
export function somaOuNulo(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/** Formata um valor numérico opcional, sem transformar ausência em zero. */
export function formatMetrica(value: number | null, casas: number, sufixo: string): string {
  if (value === null) return "—";
  return `${value.toFixed(casas)}${sufixo}`;
}

/** Data/hora em America/Sao_Paulo no formato DD/MM/AAAA HH:mm. */
export function formatDataHoraSaoPaulo(value: unknown): string {
  if (typeof value !== "string" && !(value instanceof Date)) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE_OPERACIONAL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** Rótulo curto DD/MM em America/Sao_Paulo (eixo dos gráficos). */
export function formatDiaSaoPaulo(value: unknown): string {
  const completo = formatDataHoraSaoPaulo(value);
  if (completo === "—") return "—";
  return completo.slice(0, 5);
}

/** Idade da leitura mais recente, em horas. `null` quando indeterminada. */
export function horasDesde(value: unknown, agora: Date = new Date()): number | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return (agora.getTime() - d.getTime()) / 3_600_000;
}

export function rotuloFrescor(horas: number | null): string {
  if (horas === null) return "sem leitura";
  if (horas < 1) return "atualizado há menos de 1 hora";
  if (horas < 24) return `atualizado há ${Math.floor(horas)} h`;
  return `atualizado há ${Math.floor(horas / 24)} dia(s)`;
}

// ---------------------------------------------------------------------------
// Coordenadas
// ---------------------------------------------------------------------------

export type CoordResultado =
  | { ok: true; lat: number; lng: number }
  | { ok: false; erro: string };

export function validarCoordenadas(lat: unknown, lng: unknown): CoordResultado {
  const la = numeroOuNulo(lat);
  const ln = numeroOuNulo(lng);
  if (la === null || ln === null) {
    return { ok: false, erro: "Fazenda sem coordenadas cadastradas. Informe latitude e longitude na página de Fazendas." };
  }
  if (la < -90 || la > 90) {
    return { ok: false, erro: "Latitude inválida: deve estar entre -90 e 90." };
  }
  if (ln < -180 || ln > 180) {
    return { ok: false, erro: "Longitude inválida: deve estar entre -180 e 180." };
  }
  if (la === 0 && ln === 0) {
    return { ok: false, erro: "Coordenadas da fazenda inválidas (0, 0). Corrija o cadastro antes de sincronizar." };
  }
  return { ok: true, lat: la, lng: ln };
}

// ---------------------------------------------------------------------------
// Entrada manual
// ---------------------------------------------------------------------------

export interface FormClimaManual {
  data_hora: string; // valor de <input type="datetime-local">, pode ser vazio
  temperatura: string;
  umidade: string;
  chuva_mm: string;
  vento_kmh: string;
  radiacao_solar: string;
}

export interface LeituraManual {
  data_hora: string;
  temperatura: number | null;
  umidade: number | null;
  chuva_mm: number | null;
  vento_kmh: number | null;
  radiacao_solar: number | null;
}

export type ValidacaoManual =
  | { ok: true; leitura: LeituraManual }
  | { ok: false; erro: string };

/** Faixas de sanidade física para digitação (não são limiares agronômicos). */
const FAIXAS: Record<string, { min: number; max: number; label: string }> = {
  temperatura: { min: -60, max: 60, label: "Temperatura deve estar entre -60 °C e 60 °C." },
  umidade: { min: 0, max: 100, label: "Umidade deve estar entre 0% e 100%." },
  chuva_mm: { min: 0, max: 1000, label: "Chuva deve estar entre 0 mm e 1000 mm." },
  vento_kmh: { min: 0, max: 400, label: "Vento deve estar entre 0 km/h e 400 km/h." },
  radiacao_solar: { min: 0, max: 100000, label: "Radiação solar não pode ser negativa." },
};

export function validarLeituraManual(
  form: FormClimaManual,
  agora: Date = new Date()
): ValidacaoManual {
  const campos = ["temperatura", "umidade", "chuva_mm", "vento_kmh", "radiacao_solar"] as const;
  const valores: Record<string, number | null> = {};

  for (const campo of campos) {
    const bruto = (form[campo] ?? "").trim();
    if (bruto === "") {
      valores[campo] = null;
      continue;
    }
    const n = numeroOuNulo(bruto);
    if (n === null) return { ok: false, erro: `Valor inválido em ${campo.replace("_", " ")}.` };
    const faixa = FAIXAS[campo];
    if (n < faixa.min || n > faixa.max) return { ok: false, erro: faixa.label };
    valores[campo] = n;
  }

  if (campos.every((c) => valores[c] === null)) {
    return { ok: false, erro: "Informe ao menos uma medição." };
  }

  let dataHora: Date;
  const bruto = (form.data_hora ?? "").trim();
  if (bruto === "") {
    dataHora = agora;
  } else {
    dataHora = new Date(bruto);
    if (isNaN(dataHora.getTime())) return { ok: false, erro: "Data/hora inválida." };
    if (dataHora.getTime() > agora.getTime() + 60_000) {
      return { ok: false, erro: "Data/hora não pode estar no futuro." };
    }
  }

  return {
    ok: true,
    leitura: {
      data_hora: dataHora.toISOString(),
      temperatura: valores.temperatura,
      umidade: valores.umidade,
      chuva_mm: valores.chuva_mm,
      vento_kmh: valores.vento_kmh,
      radiacao_solar: valores.radiacao_solar,
    },
  };
}

/** Detecta leitura já registrada no mesmo horário (mesmo minuto) da fazenda. */
export function existeLeituraNoMesmoHorario(
  registros: Array<{ data_hora?: unknown }>,
  dataHoraIso: string
): boolean {
  const alvo = new Date(dataHoraIso).getTime();
  if (isNaN(alvo)) return false;
  return registros.some((r) => {
    const t = typeof r?.data_hora === "string" ? new Date(r.data_hora).getTime() : NaN;
    return !isNaN(t) && Math.abs(t - alvo) < 60_000;
  });
}

// ---------------------------------------------------------------------------
// Consolidação climática para o cálculo de risco
// ---------------------------------------------------------------------------

export interface RegistroClima {
  data_hora?: unknown;
  temperatura?: unknown;
  umidade?: unknown;
  chuva_mm?: unknown;
  vento_kmh?: unknown;
}

export interface ResumoClima {
  temperatura: number | null;
  umidade: number | null;
  chuva_mm: number | null;
  chuva_acumulada_3d: number;
  dias_sem_chuva: number;
  leituras: number;
  ultimaLeitura: string | null;
}

/**
 * Consolida as leituras (ordenadas da mais recente para a mais antiga).
 * `dias_sem_chuva` conta apenas dias efetivamente observados — não extrapola
 * períodos sem leitura.
 */
export function resumirClima(registros: RegistroClima[], agora: Date = new Date()): ResumoClima {
  const ordenados = [...(registros ?? [])].sort((a, b) => {
    const ta = new Date(String(a.data_hora)).getTime();
    const tb = new Date(String(b.data_hora)).getTime();
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  if (!ordenados.length) {
    return {
      temperatura: null, umidade: null, chuva_mm: null,
      chuva_acumulada_3d: 0, dias_sem_chuva: 0, leituras: 0, ultimaLeitura: null,
    };
  }

  const limite3d = agora.getTime() - 3 * 24 * 3_600_000;
  const chuva3d = ordenados
    .filter((r) => {
      const t = new Date(String(r.data_hora)).getTime();
      return !isNaN(t) && t >= limite3d;
    })
    .reduce((s, r) => s + (numeroOuNulo(r.chuva_mm) ?? 0), 0);

  let diasSemChuva = 0;
  for (const r of ordenados) {
    if ((numeroOuNulo(r.chuva_mm) ?? 0) > 1) break;
    diasSemChuva++;
  }

  const recente = ordenados[0];
  return {
    temperatura: numeroOuNulo(recente.temperatura),
    umidade: numeroOuNulo(recente.umidade),
    chuva_mm: numeroOuNulo(recente.chuva_mm),
    chuva_acumulada_3d: chuva3d,
    dias_sem_chuva: diasSemChuva,
    leituras: ordenados.length,
    ultimaLeitura: typeof recente.data_hora === "string" ? recente.data_hora : null,
  };
}

/**
 * O cálculo de risco existente depende de temperatura e umidade da leitura
 * mais recente. Sem elas o resultado seria produzido a partir de zeros
 * implícitos — então a tela deve bloquear e explicar, não exibir risco.
 */
export function dadosSuficientesParaRisco(resumo: ResumoClima): boolean {
  return resumo.leituras > 0 && resumo.temperatura !== null && resumo.umidade !== null;
}

export function motivoDadosInsuficientes(resumo: ResumoClima): string {
  if (resumo.leituras === 0) {
    return "Sem leituras climáticas nos últimos 7 dias para esta fazenda.";
  }
  const faltando: string[] = [];
  if (resumo.temperatura === null) faltando.push("temperatura");
  if (resumo.umidade === null) faltando.push("umidade");
  return `A leitura mais recente não possui ${faltando.join(" e ")}. Sem esses valores o risco não pode ser calculado.`;
}
