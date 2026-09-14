/**
 * Volume unitário da entrega calculado a partir do ITEM DE ESTOQUE.
 *
 * Regra canônica (mesma do servidor):
 *   volume_unitario_ml = (estoque.volume_total [L] / estoque.quantidade) * 1000
 *
 * NÃO usar o último envase do lote: um lote pode ter várias embalagens
 * (envases) diferentes e o último registro não representa o item entregue.
 * O valor calculado aqui é apenas PREVIEW na tela — a autoridade do
 * `volume_entregue_ml` é sempre o servidor.
 */

function numeroPositivoFinito(valor: unknown): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Volume por unidade, em mL, do item de estoque. `null` quando indeterminável. */
export function volumeUnitarioMlDoEstoque(item: any): number | null {
  const volumeTotalL = numeroPositivoFinito(item?.volume_total);
  const quantidade = numeroPositivoFinito(item?.quantidade);
  if (volumeTotalL === null || quantidade === null) return null;
  const ml = (volumeTotalL / quantidade) * 1000;
  return Number.isFinite(ml) && ml > 0 ? ml : null;
}

export type PreviewVolume = {
  /** Soma em mL apenas das linhas com volume determinável. */
  volumeMl: number;
  /** true quando ao menos uma linha não pôde ser calculada (sem fallback zero). */
  indeterminado: boolean;
};

/**
 * Soma o volume previsto das linhas. Linhas sem volume determinável NÃO viram
 * zero silencioso: marcam o preview como indeterminado.
 */
export function calcularVolumePreviewMl(
  linhas: { item: any; quantidade: number | string }[],
): PreviewVolume {
  let volumeMl = 0;
  let indeterminado = false;

  for (const linha of linhas) {
    const qtd = numeroPositivoFinito(linha?.quantidade);
    const unitario = volumeUnitarioMlDoEstoque(linha?.item);
    if (qtd === null || unitario === null) {
      indeterminado = true;
      continue;
    }
    volumeMl += qtd * unitario;
  }

  return { volumeMl, indeterminado };
}
