/** Rótulo de quantidade de um item de pedido B2B a partir dos SNAPSHOTS gravados (nunca do catálogo atual). */
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const fmtNum = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function orderItemQuantityLabel(i: Record<string, unknown>): string {
  const q = n(i.quantidade) ?? 0;
  const code = typeof i.packaging_codigo_snapshot === "string" && i.packaging_codigo_snapshot ? i.packaging_codigo_snapshot : null;
  if (code || i.packaging_id_snapshot) {
    const kg = n(i.packaging_peso_liquido_kg_snapshot);
    const unit = typeof i.packaging_unidade_conteudo_snapshot === "string" ? i.packaging_unidade_conteudo_snapshot : "kg";
    const size = kg != null && Number.isFinite(kg) ? ` (${fmtNum(kg)} ${unit})` : "";
    return `${fmtNum(q)} ${q === 1 ? "embalagem" : "embalagens"}${code ? ` ${code}` : ""}${size}`;
  }
  const ml = n(i.volume_ml_snapshot) ?? n(i.volume_ml);
  if (ml != null && Number.isFinite(ml) && ml > 0) {
    return `${fmtNum(q)} × ${ml >= 1000 ? `${fmtNum(ml / 1000)} L` : `${fmtNum(ml)} mL`}`;
  }
  return fmtNum(q);
}
