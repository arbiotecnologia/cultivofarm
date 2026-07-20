// Helpers puros para o ReservarEstoqueDialog: formatação de embalagem,
// cálculo de totais (un e L) e validação por embalagem.

export interface EstoqueItemLike {
  id: string;
  quantidade?: number | null;
  volume_total?: number | null;
  status?: string | null;
}

/** "3× 1 L" / "1× 20 L" / "3 un" / "—" */
export function fmtEmb(it: EstoqueItemLike): string {
  const q = Number(it.quantidade ?? 0);
  const v = Number(it.volume_total ?? 0);
  if (q > 0 && v > 0) {
    const unit = v / q;
    const unitStr = Number.isInteger(unit) ? `${unit}` : unit.toFixed(2);
    return `${q}× ${unitStr} L`;
  }
  return q > 0 ? `${q} un` : "—";
}

/** Soma unidades e litros para os itens selecionados, conforme qtys editadas. */
export function computeTotals(
  selected: EstoqueItemLike[],
  qtys: Record<string, string | number>
): { totalUn: number; totalL: number } {
  let totalUn = 0;
  let totalL = 0;
  for (const it of selected) {
    const q = Number(qtys[it.id] ?? 0);
    if (!q || isNaN(q)) continue;
    totalUn += q;
    const tot = Number(it.quantidade ?? 0);
    const vol = Number(it.volume_total ?? 0);
    if (tot > 0 && vol > 0) totalL += (q * vol) / tot;
  }
  return { totalUn, totalL };
}

/** Retorna ids cujas quantidades estão inválidas (vazias, <=0 ou > disponível). */
export function findInvalidIds(
  selected: EstoqueItemLike[],
  qtys: Record<string, string | number>
): string[] {
  return selected
    .filter((it) => {
      const raw = qtys[it.id];
      const q = Number(raw);
      return raw === "" || raw == null || isNaN(q) || q <= 0 || q > Number(it.quantidade ?? 0);
    })
    .map((it) => it.id);
}

/** Restringe um valor digitado ao intervalo [1, max] (mantém "" inalterado). */
export function clampQty(value: string, max: number): string {
  if (value === "") return "";
  if (!isFinite(max) || max <= 0) return "";
  const n = Number(value);
  if (isNaN(n) || !isFinite(n)) return "";
  return String(Math.min(Math.max(n, 1), max));
}
