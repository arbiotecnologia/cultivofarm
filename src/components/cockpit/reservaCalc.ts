// Helpers puros para reserva: unidades, totais dimensionais e validação por embalagem.
import {
  addStockContent,
  formatStockContentTotals,
  formatStockPackage,
  isValidStockQuantity,
  requiresWholePacks,
  stockContentTotal,
  type StockContentTotals,
  type StockQuantityLike,
} from "@/lib/estoque/stockUnits";

export interface EstoqueItemLike extends StockQuantityLike {
  id: string;
  status?: string | null;
}

export function fmtEmb(it: EstoqueItemLike): string {
  return formatStockPackage(it);
}

/** Mantém o retorno legado em litros; sólidos nunca são convertidos para L. */
export function computeTotals(
  selected: EstoqueItemLike[],
  qtys: Record<string, string | number>
): { totalUn: number; totalL: number } {
  let totalUn = 0;
  let totalL = 0;
  for (const it of selected) {
    const quantity = Number(qtys[it.id] ?? 0);
    if (!quantity || isNaN(quantity)) continue;
    totalUn += quantity;
    const fullContent = stockContentTotal(it);
    const fullQuantity = Number(it.quantidade ?? 0);
    if (fullContent && fullQuantity > 0) {
      const proportional = fullContent.value * quantity / fullQuantity;
      if (fullContent.unit === "l") totalL += proportional;
      if (fullContent.unit === "ml") totalL += proportional / 1000;
    }
  }
  return { totalUn, totalL };
}

export function computeContentTotals(
  selected: EstoqueItemLike[],
  qtys: Record<string, string | number>,
): { totalUn: number; contents: StockContentTotals; label: string } {
  let totalUn = 0;
  const contents: StockContentTotals = {};
  for (const item of selected) {
    const quantity = Number(qtys[item.id] ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    totalUn += quantity;
    addStockContent(contents, item, quantity);
  }
  return { totalUn, contents, label: formatStockContentTotals(contents) };
}

export function findInvalidIds(
  selected: EstoqueItemLike[],
  qtys: Record<string, string | number>
): string[] {
  return selected
    .filter((item) => !isValidStockQuantity(item, qtys[item.id], Number(item.quantidade ?? 0)))
    .map((item) => item.id);
}

/** Restringe ao intervalo [1, max]; whole=true impede fração de embalagem. */
export function clampQty(value: string, max: number, whole = false): string {
  if (value === "") return "";
  if (!isFinite(max) || max <= 0) return "";
  const n = Number(value);
  if (isNaN(n) || !isFinite(n)) return "";
  const bounded = Math.min(Math.max(n, 1), max);
  return String(whole ? Math.trunc(bounded) : bounded);
}

export { requiresWholePacks };
