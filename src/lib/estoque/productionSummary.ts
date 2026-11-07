import { isFinishedProductStock, stockContentTotal, type StockContentUnit, type StockQuantityLike } from "./stockUnits";

export interface ProductionLot {
  id: string;
  codigo_lote: string | null;
  volume_produzido: number | null;
  produto_id: string | null;
  microrganismo_id: string | null;
  produtos?: { nome?: string | null } | null;
  microrganismos?: { nome_cientifico?: string | null; nome?: string | null } | null;
}

export interface ProductionStock extends StockQuantityLike {
  lote_id: string;
  validade: string | null;
  reservado_para_os_id: string | null;
  quantidade_reservada: number | null;
  expedido_em: string | null;
  status: string | null;
}

interface LegacyBucket {
  produzidoL: number;
  reservadoL: number;
  disponivelL: number;
  vencidoL: number;
}

export interface LegacyGroup extends LegacyBucket {
  key: string;
  label: string;
  tipo: "microrganismo" | "produto";
  lotes: Array<LegacyBucket & { lote_id: string; codigo_lote: string | null }>;
}

interface RevendaBucket {
  entrada: number;
  reservado: number;
  disponivel: number;
  vencido: number;
}

export interface RevendaLot extends RevendaBucket {
  lote_id: string;
  codigo_lote: string | null;
  unit: StockContentUnit;
}

export interface RevendaGroup extends RevendaBucket {
  key: string;
  label: string;
  unit: StockContentUnit;
  lotes: RevendaLot[];
}

const legacyBucket = (): LegacyBucket => ({ produzidoL: 0, reservadoL: 0, disponivelL: 0, vencidoL: 0 });
const revendaBucket = (): RevendaBucket => ({ entrada: 0, reservado: 0, disponivel: 0, vencido: 0 });

export function buildProductionSummary(lotes: ProductionLot[], estoques: ProductionStock[], today: string) {
  const finishedLotIds = new Set(estoques.filter(isFinishedProductStock).map((stock) => stock.lote_id));
  const legacyLotes = lotes.filter((lot) => !finishedLotIds.has(lot.id));
  const legacyIds = new Set(legacyLotes.map((lot) => lot.id));
  const porLote = new Map<string, LegacyBucket>();

  for (const stock of estoques) {
    if (!legacyIds.has(stock.lote_id)) continue;
    const bucket = porLote.get(stock.lote_id) ?? legacyBucket();
    const liters = Number(stock.volume_total) || 0;
    const expired = !!stock.validade && stock.validade < today;
    const sent = !!stock.expedido_em;
    const reserved = !!stock.reservado_para_os_id || Number(stock.quantidade_reservada || 0) > 0;
    if (expired || sent) bucket.vencidoL += liters;
    else if (reserved) bucket.reservadoL += liters;
    else if (stock.status === "disponivel") bucket.disponivelL += liters;
    else bucket.reservadoL += liters;
    porLote.set(stock.lote_id, bucket);
  }

  const micro = new Map<string, LegacyGroup>();
  const prod = new Map<string, LegacyGroup>();
  for (const lot of legacyLotes) {
    const bucket = porLote.get(lot.id) ?? legacyBucket();
    const produzidoL = (Number(lot.volume_produzido) || 0) / 1000;
    const lotRow = { lote_id: lot.id, codigo_lote: lot.codigo_lote, ...bucket, produzidoL };
    const id = lot.microrganismo_id || lot.produto_id;
    if (!id) continue;
    const type = lot.microrganismo_id ? "microrganismo" as const : "produto" as const;
    const label = type === "microrganismo"
      ? lot.microrganismos?.nome_cientifico || lot.microrganismos?.nome || "Microrganismo"
      : lot.produtos?.nome || "Produto";
    const groups = type === "microrganismo" ? micro : prod;
    const group = groups.get(id) ?? { key: id, label, tipo: type, ...legacyBucket(), lotes: [] };
    group.produzidoL += produzidoL;
    group.reservadoL += bucket.reservadoL;
    group.disponivelL += bucket.disponivelL;
    group.vencidoL += bucket.vencidoL;
    group.lotes.push(lotRow);
    groups.set(id, group);
  }

  const lotById = new Map(lotes.map((lot) => [lot.id, lot]));
  const revendaLots = new Map<string, RevendaLot & { produto_id: string; label: string }>();
  for (const stock of estoques) {
    if (!isFinishedProductStock(stock)) continue;
    const lot = lotById.get(stock.lote_id);
    if (!lot?.produto_id) continue;
    const content = stockContentTotal(stock);
    if (!content) continue;
    const key = `${stock.lote_id}:${content.unit}`;
    const bucket = revendaLots.get(key) ?? {
      lote_id: stock.lote_id,
      codigo_lote: lot.codigo_lote,
      unit: content.unit,
      produto_id: lot.produto_id,
      label: lot.produtos?.nome || "Produto",
      ...revendaBucket(),
    };
    bucket.entrada += content.value;
    const expired = !!stock.validade && stock.validade < today;
    const sent = !!stock.expedido_em;
    const reserved = !!stock.reservado_para_os_id || Number(stock.quantidade_reservada || 0) > 0;
    if (expired || sent) bucket.vencido += content.value;
    else if (reserved) bucket.reservado += content.value;
    else if (stock.status === "disponivel") bucket.disponivel += content.value;
    else bucket.reservado += content.value;
    revendaLots.set(key, bucket);
  }

  const revendaMap = new Map<string, RevendaGroup>();
  for (const lot of revendaLots.values()) {
    const key = `${lot.produto_id}:${lot.unit}`;
    const group = revendaMap.get(key) ?? { key, label: lot.label, unit: lot.unit, ...revendaBucket(), lotes: [] };
    group.entrada += lot.entrada;
    group.reservado += lot.reservado;
    group.disponivel += lot.disponivel;
    group.vencido += lot.vencido;
    group.lotes.push({ lote_id: lot.lote_id, codigo_lote: lot.codigo_lote, unit: lot.unit,
      entrada: lot.entrada, reservado: lot.reservado, disponivel: lot.disponivel, vencido: lot.vencido });
    revendaMap.set(key, group);
  }

  const microRows = Array.from(micro.values()).sort((a, b) => b.produzidoL - a.produzidoL);
  const prodRows = Array.from(prod.values()).sort((a, b) => b.produzidoL - a.produzidoL);
  const totals = [...microRows, ...prodRows].reduce((total, group) => ({
    produzidoL: total.produzidoL + group.produzidoL,
    reservadoL: total.reservadoL + group.reservadoL,
    disponivelL: total.disponivelL + group.disponivelL,
    vencidoL: total.vencidoL + group.vencidoL,
  }), legacyBucket());
  const revenda = Array.from(revendaMap.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR") || a.unit.localeCompare(b.unit));
  return { micro: microRows, prod: prodRows, totals, revenda };
}
