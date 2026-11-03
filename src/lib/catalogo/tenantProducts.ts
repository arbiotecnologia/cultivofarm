/**
 * Catálogo EXCLUSIVO por empresa (decisão 01/11/2026). Contrato das RPCs candidatas
 * `tenant_product_list/save/set_archived` (scripts/tenant-exclusive-catalog-20261101).
 * O tenant é sempre derivado no servidor; o payload nunca carrega empresa/dono.
 */
import { Constants } from "@/integrations/supabase/cultivofarm.types";

/** Valores do enum real `tipo_produto`; o servidor continua recusando qualquer outro (22P02). */
export const TIPOS_PRODUTO = Constants.public.Enums.tipo_produto as readonly string[];
export const TENANT_PRODUCT_FIELDS = [
  "nome", "codigo", "descricao", "tipo", "classe_catalogo", "familia_catalogo", "modo_acao",
  "modo_aplicacao", "funcao_completa", "e_insumo", "b2b_enabled", "dose_ml_ha", "estoque_minimo",
  "valor_dose_brl", "valor_ha_brl", "valor_litro_brl",
] as const;
export type TenantProductField = (typeof TENANT_PRODUCT_FIELDS)[number];
const NUMERIC: TenantProductField[] = ["dose_ml_ha", "estoque_minimo", "valor_dose_brl", "valor_ha_brl", "valor_litro_brl"];

export interface TenantProduct {
  id: string;
  owner_organization_id: string;
  nome: string;
  codigo: string | null;
  descricao: string | null;
  tipo: string | null;
  ativo: boolean | null;
  valor_ha_brl: number | null;
  updated_at: string;
}

export interface TenantProductAck { product_id: string; updated_at: string; replayed: boolean }

export type TenantProductDraft = Partial<Record<TenantProductField, string | number | boolean | null>>;

/** Valida e normaliza o rascunho; lança erro legível antes de qualquer envio. */
export function buildTenantProductPayload(draft: TenantProductDraft, create: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (!Object.prototype.hasOwnProperty.call(draft, k)) continue;
    if (!(TENANT_PRODUCT_FIELDS as readonly string[]).includes(k)) throw new Error(`Campo não permitido: ${k}`);
    if (v === undefined) continue;
    if (NUMERIC.includes(k as TenantProductField)) {
      if (v === null || v === "") { out[k] = null; continue; }
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido em ${k}`);
      out[k] = n;
    } else if (k === "b2b_enabled") {
      // omitido = servidor grava false; nulo nunca é enviado (coluna NOT NULL, default LIVE true)
      if (typeof v !== "boolean") throw new Error("Valor inválido em b2b_enabled");
      out[k] = v;
    } else if (k === "tipo") {
      if (typeof v !== "string" || !TIPOS_PRODUTO.includes(v)) throw new Error("Selecione um tipo de produto válido");
      out[k] = v;
    } else if (k === "e_insumo") {
      if (v !== null && typeof v !== "boolean") throw new Error(`Valor inválido em ${k}`);
      out[k] = v;
    } else {
      out[k] = v === null ? null : String(v).trim();
    }
  }
  const nome = out.nome;
  if (create && (typeof nome !== "string")) throw new Error("Informe o nome do produto");
  if (nome !== undefined && (typeof nome !== "string" || nome.length < 2 || nome.length > 200)) {
    throw new Error("O nome deve ter entre 2 e 200 caracteres");
  }
  if (create && typeof out.tipo !== "string") throw new Error("Selecione o tipo do produto");
  return out;
}

/** ACK do servidor precisa referir o produto pedido (edição) e trazer versão. */
export function parseTenantProductAck(data: unknown, expectedId: string | null): TenantProductAck {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d.product_id !== "string" || typeof d.updated_at !== "string" || typeof d.replayed !== "boolean") {
    throw new Error("Resposta do servidor inválida");
  }
  if (expectedId && d.product_id !== expectedId) throw new Error("Resposta do servidor de outro produto");
  return { product_id: d.product_id, updated_at: d.updated_at, replayed: d.replayed };
}

export function tenantProductErrorMessage(code: string | undefined, message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("duplicate_name")) return "Já existe um produto com esse nome na sua empresa.";
  if (m.includes("version_conflict") || m.includes("cas_required")) return "O produto foi alterado por outra pessoa. Recarregue e tente de novo.";
  if (code === "42501" || m.includes("forbidden")) return "Você não tem permissão para gerenciar produtos desta empresa.";
  if (m.includes("not_found")) return "Produto não encontrado na sua empresa.";
  if (m.includes("tipo_required") || m.includes("tipo_invalid") || code === "22P02") return "Selecione um tipo de produto válido.";
  if (code === "PGRST202" || m.includes("Could not find the function")) return "Cadastro de produtos da empresa ainda não está disponível neste ambiente.";
  return "Não foi possível salvar o produto.";
}
