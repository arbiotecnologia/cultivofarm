export const FINISHED_PRODUCT_ORIGIN = "compra_produto_acabado_revenda" as const;

export type StockContentUnit = "kg" | "g" | "l" | "ml";

export interface StockQuantityLike {
  id?: string;
  quantidade?: number | string | null;
  volume_total?: number | string | null;
  origem_estoque?: string | null;
  unidade_comercial?: string | null;
  conteudo_por_unidade?: number | string | null;
  unidade_conteudo?: string | null;
  quantidade_conteudo?: number | string | null;
  quantidade_reservada?: number | string | null;
}

export interface StockContent {
  value: number;
  unit: StockContentUnit;
}

const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

export function isStockContentUnit(value: unknown): value is StockContentUnit {
  return value === "kg" || value === "g" || value === "l" || value === "ml";
}

export function stockUnitLabel(unit: StockContentUnit): string {
  return unit === "ml" ? "mL" : unit === "l" ? "L" : unit;
}

export function formatStockNumber(value: number): string {
  return Number.isFinite(value) ? numberFormatter.format(value) : "—";
}

export function formatStockValue(value: number, unit: StockContentUnit): string {
  return `${formatStockNumber(value)} ${stockUnitLabel(unit)}`;
}

export function isFinishedProductStock(item: StockQuantityLike | null | undefined): boolean {
  return item?.origem_estoque === FINISHED_PRODUCT_ORIGIN;
}

export function requiresWholePacks(item: StockQuantityLike | null | undefined): boolean {
  return isFinishedProductStock(item) && item?.unidade_comercial === "unidade";
}

/** O snapshot de sólidos usa kg/g; volume_total permanece NULL e nunca vira litros. */
export function stockContentTotal(
  item: StockQuantityLike,
  quantity: number = Number(item.quantidade),
): StockContent | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (isFinishedProductStock(item)) {
    if (!isStockContentUnit(item.unidade_conteudo)) return null;
    const perPack = Number(item.conteudo_por_unidade);
    if (!Number.isFinite(perPack) || perPack <= 0) return null;
    return { value: quantity * perPack, unit: item.unidade_conteudo };
  }
  const liters = Number(item.volume_total);
  if (!Number.isFinite(liters) || liters < 0) return null;
  return { value: liters, unit: "l" };
}

export function formatStockContent(item: StockQuantityLike, quantity?: number): string {
  const content = stockContentTotal(item, quantity);
  return content ? formatStockValue(content.value, content.unit) : "—";
}

export function formatStockPackage(item: StockQuantityLike): string {
  const quantity = Number(item.quantidade);
  if (!Number.isFinite(quantity) || quantity <= 0) return "—";
  if (!isFinishedProductStock(item)) {
    const liters = Number(item.volume_total);
    if (liters > 0) {
      const unit = liters / quantity;
      const unitText = Number.isInteger(unit) ? String(unit) : unit.toFixed(2);
      return `${quantity}× ${unitText} L`;
    }
    return `${quantity} un`;
  }
  const content = stockContentTotal(item, 1);
  return content ? `${formatStockNumber(quantity)}× ${formatStockValue(content.value, content.unit)}` : `${formatStockNumber(quantity)} un`;
}

export function isValidStockQuantity(
  item: StockQuantityLike,
  raw: string | number,
  available: number,
): boolean {
  if (raw === "" || raw === null || raw === undefined) return false;
  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > available) return false;
  return !requiresWholePacks(item) || Number.isInteger(quantity);
}

export type StockContentTotals = Partial<Record<StockContentUnit, number>>;

export function addStockContent(
  totals: StockContentTotals,
  item: StockQuantityLike,
  quantity?: number,
): StockContentTotals {
  const content = stockContentTotal(item, quantity);
  if (!content) return totals;
  totals[content.unit] = (totals[content.unit] ?? 0) + content.value;
  return totals;
}

export function formatStockContentTotals(totals: StockContentTotals): string {
  const parts = (["kg", "g", "l", "ml"] as const)
    .filter((unit) => totals[unit] !== undefined)
    .map((unit) => formatStockValue(totals[unit] ?? 0, unit));
  return parts.length ? parts.join(" · ") : "—";
}
