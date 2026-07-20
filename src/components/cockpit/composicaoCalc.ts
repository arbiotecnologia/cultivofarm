// Helpers puros para o ComposicaoProducaoCard: cálculo de distribuição
// da composição pelo volume total, classificação de status por linha,
// rateio de buckets (lote consolidado + micro específico) e agregação global.
//
// Não importa React/Supabase — 100% pura para permitir testes unitários
// dos cenários de borda: produção < demanda, múltiplos lotes por micro,
// vencimento parcial, lote consolidado, tolerâncias, etc.

import type { ProductComposicao } from "@/hooks/useProductProfile";
import type { DisponibilidadeBucket, DisponibilidadeOSData } from "@/hooks/useDisponibilidadeOS";

export const TOLERANCIA_PCT = 0.02;
export const TOLERANCIA_MIN_L = 0.05; // 50 mL

export type LineStatus =
  | "ok"
  | "falta"
  | "excedente"
  | "sem_estoque"
  | "aguardando_envase"
  | "sem_producao";

export interface LinhaCalc {
  key: string;
  microId: string | null;
  nome: string;
  cientifico?: string | null;
  tipo: "microrganismo" | "insumo";
  pct: number;
  volumeL: number;
  volumeML: number;
}

export interface LinhaComStatus extends LinhaCalc {
  bucket: DisponibilidadeBucket;
  status: LineStatus;
  deltaL: number;
  motivo: string;
}

export type GlobalStatus =
  | "sem_producao"
  | "aguardando"
  | "falta"
  | "excedente"
  | "ok";

export interface AgregadoGlobal {
  globalStatus: GlobalStatus;
  totalPlan: number;
  totalEnv: number;
  totalRes: number;
  totalDisp: number;
  totalDelta: number;
  countFalta: number;
  countExced: number;
  countAguard: number;
}

export function emptyBucket(): DisponibilidadeBucket {
  return { envasadoL: 0, reservadoL: 0, disponivelL: 0, vencidoL: 0 };
}

const fmtL = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Distribui `totalL` entre os componentes pela proporção (ou pelo volume_ml
 * quando não houver proporção). Ajusta o resíduo de arredondamento no
 * último item para que a soma em mL bata exatamente com `totalL * 1000`. */
export function calcular(composicao: ProductComposicao[], totalL: number): LinhaCalc[] {
  if (composicao.length === 0) return [];
  const somaProp = composicao.reduce((s, c) => s + (c.proporcao ?? 0), 0);
  const somaVol = composicao.reduce((s, c) => s + (c.volume_ml ?? 0), 0);
  const usarProp = somaProp > 0;
  const base = usarProp ? somaProp : somaVol;

  const linhas = composicao.map<LinhaCalc>((c, i) => {
    const peso = usarProp ? c.proporcao ?? 0 : c.volume_ml ?? 0;
    const pct = base > 0 ? (peso / base) * 100 : 0;
    const volumeL = (totalL * pct) / 100;
    return {
      key: `${c.microrganismo_id ?? c.component_insumo_id ?? i}`,
      microId: c.microrganismo_id,
      nome: c.microrganismo?.nome ?? c.insumo_nome ?? "Componente",
      cientifico: c.microrganismo?.nome_cientifico,
      tipo: c.microrganismo ? "microrganismo" : "insumo",
      pct,
      volumeL,
      volumeML: volumeL * 1000,
    };
  });

  const somaML = linhas.reduce((s, l) => s + Math.round(l.volumeML), 0);
  const alvoML = Math.round(totalL * 1000);
  const diff = alvoML - somaML;
  if (linhas.length > 0 && diff !== 0) {
    const ult = linhas[linhas.length - 1];
    ult.volumeML += diff;
    ult.volumeL = ult.volumeML / 1000;
  }
  return linhas;
}

/** Classifica o status de uma linha em função do planejado vs. bucket
 * de disponibilidade. Aplica tolerância = max(2%, 50 mL). */
export function classify(
  planejadoL: number,
  b: DisponibilidadeBucket,
  temLote: boolean,
): { status: LineStatus; deltaL: number; motivo: string } {
  const deltaL = b.disponivelL - planejadoL;
  const detalhe = `envasado ${fmtL(b.envasadoL)} L · reservado ${fmtL(b.reservadoL)} L · vencido ${fmtL(b.vencidoL)} L`;
  if (!temLote) return { status: "sem_producao", deltaL, motivo: "nenhum lote vinculado à OS" };
  if (b.envasadoL <= 0.0001)
    return {
      status: "aguardando_envase",
      deltaL,
      motivo: `envasado 0 L de ${fmtL(planejadoL)} L planejados`,
    };
  const tol = Math.max(planejadoL * TOLERANCIA_PCT, TOLERANCIA_MIN_L);
  if (b.disponivelL <= 0.0001 && (b.reservadoL > 0 || b.vencidoL > 0))
    return { status: "sem_estoque", deltaL, motivo: detalhe };
  if (deltaL < -tol) return { status: "falta", deltaL, motivo: detalhe };
  if (deltaL > tol)
    return { status: "excedente", deltaL, motivo: `${detalhe} · sobra ${fmtL(deltaL)} L` };
  return {
    status: "ok",
    deltaL,
    motivo: `envasado ${fmtL(b.envasadoL)} L · livre ${fmtL(b.disponivelL)} L`,
  };
}

/** Constrói o bucket de disponibilidade para cada linha da composição,
 * combinando (quando aplicável) o bucket agregado por microrganismo com
 * a fatia proporcional do lote consolidado (produto composto sem
 * microrganismo_id explícito). */
export function buildBucketPorLinha(
  linhasBase: LinhaCalc[],
  disp: Pick<DisponibilidadeOSData, "porMicrorganismo" | "consolidadoSemMicro" | "temLoteConsolidado">,
): DisponibilidadeBucket[] {
  const microsLinhas = linhasBase.filter((l) => l.tipo === "microrganismo" && l.microId);
  const somaPctMicros = microsLinhas.reduce((s, l) => s + l.pct, 0);

  return linhasBase.map((l) => {
    let bucket: DisponibilidadeBucket;
    if (l.microId && disp.porMicrorganismo[l.microId]) {
      bucket = { ...disp.porMicrorganismo[l.microId] };
      if (disp.temLoteConsolidado && somaPctMicros > 0) {
        const frac = l.pct / somaPctMicros;
        bucket.envasadoL += disp.consolidadoSemMicro.envasadoL * frac;
        bucket.reservadoL += disp.consolidadoSemMicro.reservadoL * frac;
        bucket.disponivelL += disp.consolidadoSemMicro.disponivelL * frac;
        bucket.vencidoL += disp.consolidadoSemMicro.vencidoL * frac;
      }
    } else if (l.microId && disp.temLoteConsolidado && somaPctMicros > 0) {
      const frac = l.pct / somaPctMicros;
      bucket = {
        envasadoL: disp.consolidadoSemMicro.envasadoL * frac,
        reservadoL: disp.consolidadoSemMicro.reservadoL * frac,
        disponivelL: disp.consolidadoSemMicro.disponivelL * frac,
        vencidoL: disp.consolidadoSemMicro.vencidoL * frac,
      };
    } else {
      bucket = emptyBucket();
    }
    return bucket;
  });
}

/** Agrega totais e decide o status global do cabeçalho. */
export function agregarGlobal(linhas: LinhaComStatus[], temLote: boolean): AgregadoGlobal {
  const totalPlan = linhas.reduce((s, l) => s + l.volumeL, 0);
  const totalEnv = linhas.reduce((s, l) => s + l.bucket.envasadoL, 0);
  const totalRes = linhas.reduce((s, l) => s + l.bucket.reservadoL, 0);
  const totalDisp = linhas.reduce((s, l) => s + l.bucket.disponivelL, 0);
  const totalDelta = totalDisp - totalPlan;
  const countFalta = linhas.filter((l) => l.status === "falta" || l.status === "sem_estoque").length;
  const countExced = linhas.filter((l) => l.status === "excedente").length;
  const countAguard = linhas.filter((l) => l.status === "aguardando_envase").length;

  const globalStatus: GlobalStatus = !temLote
    ? "sem_producao"
    : countFalta > 0
      ? "falta"
      : countAguard > 0 && totalEnv <= 0.0001
        ? "aguardando"
        : countExced > 0
          ? "excedente"
          : "ok";

  return { globalStatus, totalPlan, totalEnv, totalRes, totalDisp, totalDelta, countFalta, countExced, countAguard };
}
