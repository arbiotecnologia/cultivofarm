export type Price = { price_id: string; preco_centavos: number; valid_from: string; valid_until: string | null; ativo: boolean };
export type Offer = { packaging_id: string; codigo: string; descricao: string | null; peso_liquido_kg: number; version: number; ativo: boolean; prices: Price[] };
export type AdminState = { product_id: string; unidade_conteudo: "kg" | "g" | "ml" | "l" | null; offers: Offer[] };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("ACK inválido"); return v as Record<string, unknown>; };
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
export function parsePackagingState(raw: unknown, productId: string): AdminState {
  const d = obj(raw);
  if (d.contract !== "SOLID_PACK_ADMIN_V1" || d.product_id !== productId || !uuid(productId) ||
      !integer(d.config_version) || d.config_version < 0 || !Array.isArray(d.offers) ||
      ![null, "kg", "g", "ml", "l"].includes(d.unidade_conteudo as string | null)) throw new Error("Leitura de apresentação inválida");
  const ids = new Set<string>();
  const offers = d.offers.map(rawOffer => {
    const o = obj(rawOffer); const weight = Number(o.peso_liquido_kg);
    if (!uuid(o.packaging_id) || ids.has(o.packaging_id) || typeof o.codigo !== "string" || !o.codigo ||
        !integer(o.version) || o.version < 1 || typeof o.ativo !== "boolean" || !Number.isFinite(weight) || weight <= 0 ||
        !Array.isArray(o.prices)) throw new Error("Apresentação inválida");
    ids.add(o.packaging_id);
    const priceIds = new Set<string>();
    const prices = o.prices.map(rawPrice => {
      const p = obj(rawPrice);
      if (!uuid(p.price_id) || priceIds.has(p.price_id) || !integer(p.preco_centavos) || p.preco_centavos <= 0 ||
          typeof p.valid_from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.valid_from) ||
          !(p.valid_until === null || typeof p.valid_until === "string") || typeof p.ativo !== "boolean") throw new Error("Preço inválido");
      priceIds.add(p.price_id); return p as Price;
    });
    return { packaging_id: o.packaging_id, codigo: o.codigo, descricao: typeof o.descricao === "string" ? o.descricao : null,
      peso_liquido_kg: weight, version: o.version, ativo: o.ativo, prices };
  });
  return { product_id: productId, unidade_conteudo: d.unidade_conteudo as AdminState["unidade_conteudo"], offers };
}
export type Command = { rpc: "solid_pack_offer_save_v1" | "solid_pack_offer_archive_v1" | "solid_pack_offer_reactivate_v1" | "solid_pack_price_set_v1"; args: Record<string, unknown> };
export function weightKg(text: string, unit: "kg" | "g"): number {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text)) throw new Error("Peso inválido");
  const kg = Number(text.replace(",", ".")) / (unit === "g" ? 1000 : 1);
  if (!Number.isFinite(kg) || kg <= 0 || kg >= 1e9 || Math.abs(kg * 1000 - Math.round(kg * 1000)) > 1e-7) throw new Error("Peso deve ser exato em gramas");
  return kg;
}
/** Preço pt-BR estrito: "10", "10,00", "10.00", "R$ 10,00", "1.234,56". Nunca adivinha separador ambíguo. */
export function cents(input: string): number {
  const text = input.replace(/^\s*R\$\s*/i, "").trim();
  const invalid = "Preço inválido: use reais com até 2 casas, ex.: 10,00";
  let normalized: string;
  if (/^\d+$/.test(text) || /^\d+[.,]\d{1,2}$/.test(text)) normalized = text.replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) normalized = text.replace(/\./g, "").replace(",", ".");
  else throw new Error(invalid);
  const [whole, decimal = ""] = normalized.split(".");
  const value = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 99999999999999) throw new Error("Preço deve ser maior que zero");
  return value;
}
/** Vigência como data civil ISO válida (o input date entrega AAAA-MM-DD). */
export function civilDate(text: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3])
    throw new Error("Vigência inválida: escolha a data no calendário");
  return text;
}
export function validatePackagingAck(raw: unknown, command: Command): Record<string, unknown> {
  const d = obj(raw); const a = command.args;
  if (d.replayed !== undefined && typeof d.replayed !== "boolean") throw new Error("ACK inválido");
  if (!uuid(d.packaging_id)) throw new Error("ACK inválido");
  if (command.rpc === "solid_pack_offer_save_v1") {
    if (d.codigo !== a.p_codigo || !integer(d.version) || d.version < 1 ||
        (a.p_expected_version !== null && d.version !== Number(a.p_expected_version) + 1) ||
        d.previous_packaging_id !== a.p_packaging_id || d.price_required !== true) throw new Error("ACK de apresentação inválido");
  } else {
    if (d.packaging_id !== a.p_packaging_id) throw new Error("ACK de outro registro");
    if (command.rpc === "solid_pack_offer_archive_v1" && d.archived !== true) throw new Error("ACK inválido");
    if (command.rpc === "solid_pack_offer_reactivate_v1" && (d.reactivated !== true || d.price_required !== true)) throw new Error("ACK inválido");
    if (command.rpc === "solid_pack_price_set_v1" && (!uuid(d.price_id) || d.preco_centavos !== a.p_preco_centavos ||
        d.valid_from !== a.p_valid_from || d.previous_price_id !== a.p_expected_price_id)) throw new Error("ACK de preço inválido");
  }
  return d;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
/** One retained exact request after uncertainty; no automatic retry or draft rebasing. */
export class PackagingAttempt {
  private busy = false;
  private retained: { signature: string; scope: string; command: Command; args: Record<string, unknown> } | null = null;
  get pending() { return this.retained !== null; }
  resume(rpc: Rpc, scope: string, current: () => boolean, reconcile: () => Promise<void>) {
    if (!this.retained || this.retained.scope !== scope) throw new Error("Tentativa indisponível neste contexto");
    return this.send(rpc, scope, current, this.retained.command, reconcile);
  }
  async send(rpc: Rpc, scope: string, current: () => boolean, command: Command, reconcile: () => Promise<void>) {
    if (this.busy) throw new Error("Aguarde a alteração em andamento terminar.");
    if (!current()) throw new Error("Sessão em revalidação ou contexto alterado. Nada foi gravado; aguarde alguns segundos e clique novamente.");
    const signature = JSON.stringify([scope, command]);
    if (this.retained && this.retained.signature !== signature) throw new Error("Reconcilie a mesma tentativa antes de mudar a intenção");
    this.busy = true;
    if (!this.retained) {
      const exact = JSON.parse(JSON.stringify(command)) as Command;
      this.retained = { signature, scope, command: exact, args: Object.freeze({ ...exact.args, p_idempotency_key: crypto.randomUUID() }) };
    }
    try {
      const { data, error } = await rpc(this.retained.command.rpc, this.retained.args);
      if (!current()) throw new Error("Contexto alterado; resultado não adotado");
      if (error) {
        if (["42501", "22023", "PT409"].includes(error.code ?? "")) this.retained = null;
        throw new Error(error.message ?? "Resultado não confirmado");
      }
      const ack = validatePackagingAck(data, this.retained.command);
      await reconcile();
      if (!current()) throw new Error("Contexto alterado; resultado não adotado");
      this.retained = null;
      return ack;
    } finally { this.busy = false; }
  }
}