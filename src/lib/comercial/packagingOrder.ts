/**
 * B2B_PARTNER_PACKAGING_ORDER_V1 — pedido por embalagem INTEIRA (sólidos e pedido misto).
 * O cliente envia só {item_id, item_tipo:'produto', packaging_id, quantidade inteira}; o preço é sempre
 * resolvido no servidor (preço vigente da embalagem do vendedor). Peso líquido é informação de frete.
 * Sem o contrato instalado e confirmado pelo leitor, nenhuma linha de embalagem é montada (fail-closed).
 */
export const PACKAGING_ORDER_CONTRACT = "B2B_PARTNER_PACKAGING_ORDER_V1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OFFER_KEYS = "codigo,descricao,packaging_id,peso_liquido_kg,preco_tabela_brl,product_id,rotulo,unidade_conteudo,version";

export type UnidadeConteudo = "kg" | "g" | "ml" | "l";
export interface PackagingOffer {
  product_id: string;
  packaging_id: string;
  codigo: string;
  descricao: string | null;
  rotulo: string | null;
  unidade_conteudo: UnidadeConteudo;
  peso_liquido_kg: number;
  version: number;
  /** Preço de tabela da embalagem — SOMENTE exibição; o servidor recalcula com a condição. */
  preco_tabela_brl: number;
}
export type PackagingOffersByProduct = Map<string, PackagingOffer[]>;

export function parsePackagingOffers(raw: unknown, partnerId: string): PackagingOffersByProduct {
  const fail = () => { throw new Error("packaging_contract_unavailable"); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const d = raw as Record<string, unknown>;
  if (Object.keys(d).sort().join(",") !== "contract,offers,partner_id" || d.contract !== PACKAGING_ORDER_CONTRACT ||
      d.partner_id !== partnerId || !Array.isArray(d.offers)) fail();
  const out: PackagingOffersByProduct = new Map();
  const seen = new Set<string>();
  for (const r of d.offers as unknown[]) {
    if (!r || typeof r !== "object" || Array.isArray(r)) fail();
    const o = r as Record<string, unknown>;
    if (Object.keys(o).sort().join(",") !== OFFER_KEYS) fail();
    const peso = o.peso_liquido_kg, preco = o.preco_tabela_brl, version = o.version;
    if (typeof o.product_id !== "string" || !UUID.test(o.product_id) || typeof o.packaging_id !== "string" || !UUID.test(o.packaging_id) ||
        seen.has(o.packaging_id) || typeof o.codigo !== "string" || !o.codigo.trim() ||
        !(o.descricao === null || typeof o.descricao === "string") || !(o.rotulo === null || typeof o.rotulo === "string") ||
        !["kg", "g", "ml", "l"].includes(o.unidade_conteudo as string) ||
        typeof peso !== "number" || !Number.isFinite(peso) || peso <= 0 ||
        typeof preco !== "number" || !Number.isFinite(preco) || preco <= 0 ||
        typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) fail();
    seen.add(o.packaging_id as string);
    const offer: PackagingOffer = {
      product_id: o.product_id as string, packaging_id: o.packaging_id as string, codigo: o.codigo as string,
      descricao: (o.descricao as string | null) ?? null, rotulo: (o.rotulo as string | null) ?? null,
      unidade_conteudo: o.unidade_conteudo as UnidadeConteudo, peso_liquido_kg: peso as number, version: version as number,
      preco_tabela_brl: preco as number,
    };
    const list = out.get(offer.product_id) ?? [];
    list.push(offer); out.set(offer.product_id, list);
  }
  return out;
}

/** Ausência EXATA do endpoint (pré-instalação): só PGRST202 nomeando o leitor; qualquer outro erro falha fechado. */
const ENDPOINT_RE = /\bpublic\.get_partner_packaging_offers_secure\(\s*p_partner_id\s*\)/;
export function isPackagingReaderAbsent(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && error.code === "PGRST202" && typeof error.message === "string" &&
    /^Could not find the function /.test(error.message) && ENDPOINT_RE.test(error.message);
}

export function packagingLabel(o: Pick<PackagingOffer, "rotulo" | "descricao" | "codigo">): string {
  return o.rotulo?.trim() || o.descricao?.trim() || o.codigo;
}

/** Quantidade de embalagens: inteiro positivo seguro (sem venda fracionada). */
export function isWholePackagingQty(q: unknown): q is number {
  return typeof q === "number" && Number.isSafeInteger(q) && q > 0;
}

export interface OrderLineSource {
  item_id: string;
  item_tipo: "produto" | "microrganismo";
  quantidade: number;
  unidade_pedido: string;
  volume_ml?: number | null;
  packaging_id?: string | null;
}
const mapUnidade = (u: string) => u === "hectare" ? "hectare" : u === "dose_100ml" ? "dose" : u === "litro" ? "litro" : "unidade";

/**
 * Linha enviada à simulação e à criação. Embalagem: exatamente 4 chaves, sem preço/volume/unidade
 * (o servidor recusa mistura). Líquidos: mesmo formato de sempre (sem regressão).
 */
export function orderLineFor(i: OrderLineSource): Record<string, unknown> {
  if (i.unidade_pedido === "embalagem") {
    if (i.item_tipo !== "produto" || !i.packaging_id || !UUID.test(i.packaging_id) || !isWholePackagingQty(i.quantidade))
      throw new Error("packaging_line_invalid");
    return { item_id: i.item_id, item_tipo: "produto", packaging_id: i.packaging_id, quantidade: i.quantidade };
  }
  if (i.packaging_id) throw new Error("packaging_line_invalid");
  return {
    item_id: i.item_id, item_tipo: i.item_tipo, quantidade: Number(i.quantidade),
    unidade_medida: mapUnidade(i.unidade_pedido),
    volume_ml: i.unidade_pedido === "volume_comercial" ? i.volume_ml ?? null : null,
  };
}
