import type { CatalogoVolume } from "@/hooks/useCatalogoVolumes";

export interface LinhaVasilhame {
  volumeId: string;
  qtd: number;
}

export interface SuggestParams {
  volumes: CatalogoVolume[];
  /** Preço unitário (volume completo) ao invés do preço por litro */
  priceOf: (v: CatalogoVolume) => number;
  /** Litros necessários */
  Lneed: number;
  /** Combinar múltiplos vasilhames diferentes */
  combine: boolean;
}

const MAX_NODES = 200_000;

/**
 * Sugere o conjunto de vasilhames que atende `Lneed`.
 *
 * Critérios de ordenação (lex):
 *  1. menor sobra total
 *  2. menor custo total
 *  3. menor número total de unidades
 *
 * Quando `combine=false`, escolhe um único volume minimizando
 * (unidades asc, sobra asc, preço-por-litro asc).
 */
export function suggestVasilhames({ volumes, priceOf, Lneed, combine }: SuggestParams): LinhaVasilhame[] {
  const ativos = volumes.filter((v) => v.volume_ml > 0);
  if (!ativos.length || Lneed <= 0) return [];

  // Ordena do maior para o menor — explorar grandes primeiro maximiza a poda.
  const sorted = [...ativos].sort((a, b) => b.volume_ml - a.volume_ml);

  if (!combine) {
    let best: { v: CatalogoVolume; units: number; sobra: number; pl: number } | null = null;
    for (const v of sorted) {
      const litros = v.volume_ml / 1000;
      const units = Math.max(1, Math.ceil(Lneed / litros));
      const sobra = units * litros - Lneed;
      const p = priceOf(v);
      const pl = p > 0 ? p / litros : Number.POSITIVE_INFINITY;
      const isBetter =
        !best ||
        units < best.units ||
        (units === best.units && sobra < best.sobra - 1e-9) ||
        (units === best.units && Math.abs(sobra - best.sobra) < 1e-9 && pl < best.pl);
      if (isBetter) best = { v, units, sobra, pl };
    }
    return best ? [{ volumeId: best.v.id, qtd: best.units }] : [];
  }

  // Trabalha em mL inteiros para evitar drift de ponto-flutuante.
  const targetML = Math.ceil(Lneed * 1000);
  const counts = new Array(sorted.length).fill(0);

  let bestSobra = Number.POSITIVE_INFINITY;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestUnits = Number.POSITIVE_INFINITY;
  let bestCombo: number[] | null = null;
  let nodes = 0;
  let bailout = false;

  const search = (idx: number, totalML: number, totalCost: number, totalUnits: number) => {
    if (bailout) return;
    nodes++;
    if (nodes > MAX_NODES) {
      bailout = true;
      return;
    }

    if (totalML >= targetML) {
      const sobra = totalML - targetML;
      if (
        sobra < bestSobra ||
        (sobra === bestSobra && totalCost < bestCost - 1e-9) ||
        (sobra === bestSobra && Math.abs(totalCost - bestCost) < 1e-9 && totalUnits < bestUnits)
      ) {
        bestSobra = sobra;
        bestCost = totalCost;
        bestUnits = totalUnits;
        bestCombo = [...counts];
      }
      return;
    }

    if (idx >= sorted.length) return;

    // Poda: já excede a sobra do melhor com custo/quantidade pior — sem chance de melhorar.
    if (totalML - targetML > bestSobra) return;

    const v = sorted[idx];
    const vML = v.volume_ml;
    const vCost = priceOf(v);
    const remainingML = targetML - totalML;
    const maxNeeded = Math.ceil(remainingML / vML);

    // Limite: o suficiente para cobrir sozinho. Permite +1 apenas se for o último volume
    // (assim o último degrau pode "fechar" com sobra mínima).
    const isLast = idx === sorted.length - 1;
    const cap = isLast ? maxNeeded : maxNeeded;

    for (let k = 0; k <= cap; k++) {
      counts[idx] = k;
      search(idx + 1, totalML + k * vML, totalCost + k * vCost, totalUnits + k);
      if (bailout) return;
    }
    counts[idx] = 0;
  };

  search(0, 0, 0, 0);

  if (!bestCombo) {
    // Fallback guloso: pega o maior que cabe; fecha com o menor.
    const out: Record<string, number> = {};
    let rem = targetML;
    for (const v of sorted) {
      while (rem >= v.volume_ml) {
        out[v.id] = (out[v.id] || 0) + 1;
        rem -= v.volume_ml;
      }
    }
    if (rem > 0) {
      const smallest = sorted[sorted.length - 1];
      if (smallest) out[smallest.id] = (out[smallest.id] || 0) + 1;
    }
    return Object.entries(out).map(([volumeId, qtd]) => ({ volumeId, qtd }));
  }

  return sorted
    .map((v, i) => ({ volumeId: v.id, qtd: bestCombo![i] }))
    .filter((l) => l.qtd > 0);
}

/** Compara dois conjuntos ignorando ordem. */
export function sameLinhas(a: LinhaVasilhame[], b: LinhaVasilhame[]): boolean {
  if (a.length !== b.length) return false;
  const ma = new Map(a.map((l) => [l.volumeId, l.qtd]));
  for (const l of b) {
    if (ma.get(l.volumeId) !== l.qtd) return false;
  }
  return true;
}
