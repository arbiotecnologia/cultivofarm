/**
 * Visibilidade de itens GLOBAIS por empresa (Fase 1 — candidato, RPCs ainda NÃO aplicadas).
 *
 * - Preferência por empresa: oculta item global nas NOVAS seleções e na gestão da empresa.
 *   Não é sigilo nem exclusão; não altera ativo/B2B/preço/fórmula global; históricos continuam legíveis.
 * - A empresa é derivada no servidor. Nenhuma função aqui envia organization_id.
 * - Sem fallback silencioso: RPC ausente/erro/resposta malformada vira erro explícito.
 */
/** Cliente mínimo (rpc + abortSignal opcional) — RPCs ainda fora dos tipos gerados. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => any };

export type TenantCatalogEntity = "produto" | "microrganismo" | "cultura";

export const TENANT_VISIBILITY_REASON_MIN = 5;
export const TENANT_VISIBILITY_REASON_MAX = 500;
export const TENANT_VISIBILITY_READ_CHUNK = 500;
export const TENANT_SELECTION_PAGE_MAX = 100;
export const TENANT_SELECTION_INCLUDE_MAX = 50;

/** Escopo completo de cache: identidade + empresa + entidade. Sem identidade/empresa não há chave. */
export interface TenantCatalogScope {
  userId: string;
  organizationId: string;
}

export function tenantScopeReady(s: Partial<TenantCatalogScope> | null | undefined): s is TenantCatalogScope {
  return !!s && typeof s.userId === "string" && s.userId.length > 0
    && typeof s.organizationId === "string" && s.organizationId.length > 0;
}

export const tenantCatalogKeys = {
  root: ["tenant-catalog"] as const,
  scope: (s: TenantCatalogScope) => ["tenant-catalog", s.organizationId, s.userId] as const,
  visibility: (s: TenantCatalogScope, entity: TenantCatalogEntity, ids: readonly string[]) =>
    ["tenant-catalog", s.organizationId, s.userId, "visibility", entity, [...ids].sort().join(",")] as const,
  selection: (s: TenantCatalogScope, entity: TenantCatalogEntity, search: string, offset: number, include: readonly string[]) =>
    ["tenant-catalog", s.organizationId, s.userId, "selection", entity, search, offset, [...include].sort().join(",")] as const,
};

export interface VisibilityState { hidden: boolean; version: number }

const ERROR_MAP: Record<string, string> = {
  catalog_visibility_auth_required: "Sessão inválida ou expirada. Entre novamente.",
  catalog_visibility_platform_actor_denied: "A equipe da plataforma não altera preferências de empresas.",
  catalog_visibility_tenant_unavailable: "Empresa ativa não encontrada para este usuário.",
  catalog_visibility_feature_unavailable: "Seu plano não inclui a personalização do catálogo.",
  catalog_visibility_role_denied: "Somente administrador ou gestor da empresa pode ocultar ou exibir itens.",
  catalog_visibility_reason_required: `Informe um motivo (${TENANT_VISIBILITY_REASON_MIN} a ${TENANT_VISIBILITY_REASON_MAX} caracteres).`,
  catalog_visibility_invalid_payload: "Dados inválidos para a preferência.",
  catalog_visibility_item_not_found: "Item do catálogo não encontrado.",
  catalog_visibility_item_inactive: "Item global inativo não pode ser exibido. A preferência não reativa itens.",
  catalog_visibility_version_conflict: "Outra pessoa alterou esta preferência. Atualize e tente de novo.",
  catalog_visibility_idempotency_conflict: "Operação repetida com dados diferentes. Recarregue e tente de novo.",
  catalog_visibility_no_change: "A preferência já está nesse estado.",
};

export const TENANT_VISIBILITY_UNAVAILABLE = "A personalização do catálogo ainda não está disponível neste ambiente.";

export function mapTenantVisibilityError(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message ?? "";
  for (const [k, v] of Object.entries(ERROR_MAP)) if (msg.includes(k)) return v;
  if (err?.code === "PGRST202" || err?.code === "42883" || /could not find the function|does not exist/i.test(msg)) {
    return TENANT_VISIBILITY_UNAVAILABLE;
  }
  return "Não foi possível concluir a operação de visibilidade.";
}

export class TenantVisibilityError extends Error {
  constructor(message: string, readonly raw?: unknown) { super(message); }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITIES: readonly TenantCatalogEntity[] = ["produto", "microrganismo", "cultura"];

export function validateVisibilityInput(i: {
  entityType: string; entityId: string; hidden: unknown; expectedVersion: unknown; reason: string; idempotencyKey: string;
}): string | null {
  if (!ENTITIES.includes(i.entityType as TenantCatalogEntity)) return "Tipo de item inválido.";
  if (!UUID_RE.test(i.entityId) || !UUID_RE.test(i.idempotencyKey)) return "Identificador inválido.";
  if (typeof i.hidden !== "boolean") return "Estado inválido.";
  if (typeof i.expectedVersion !== "number" || !Number.isInteger(i.expectedVersion) || i.expectedVersion < 0) return "Versão inválida.";
  const r = i.reason.trim();
  if (r.length < TENANT_VISIBILITY_REASON_MIN || r.length > TENANT_VISIBILITY_REASON_MAX) return ERROR_MAP.catalog_visibility_reason_required;
  return null;
}

/** Mutação: exige resposta coerente com o pedido; nunca trata 0 linhas/resposta vazia como sucesso. */
export async function setTenantVisibility(client: RpcClient, i: {
  entityType: TenantCatalogEntity; entityId: string; hidden: boolean; expectedVersion: number; reason: string; idempotencyKey: string;
}): Promise<VisibilityState & { replayed: boolean }> {
  const invalid = validateVisibilityInput(i);
  if (invalid) throw new TenantVisibilityError(invalid);
  const { data, error } = await client.rpc("tenant_catalog_set_visibility", {
    p_entity_type: i.entityType, p_entity_id: i.entityId, p_hidden: i.hidden,
    p_expected_version: i.expectedVersion, p_reason: i.reason.trim(), p_idempotency_key: i.idempotencyKey,
  });
  if (error) throw new TenantVisibilityError(mapTenantVisibilityError(error), error);
  const ok = data && typeof data === "object" && data.entity_id === i.entityId && data.entity_type === i.entityType
    && data.hidden === i.hidden && Number.isInteger(data.version) && data.version === i.expectedVersion + 1
    && typeof data.replayed === "boolean";
  if (!ok) throw new TenantVisibilityError("Resposta do servidor não confirmou a preferência.");
  return { hidden: data.hidden, version: data.version, replayed: data.replayed };
}

/** Sobreposição para a gestão: lê preferências da empresa para IDs visíveis (lotes de 500). */
export async function readTenantVisibility(client: RpcClient, entity: TenantCatalogEntity, ids: readonly string[], signal?: AbortSignal)
: Promise<Map<string, VisibilityState>> {
  const out = new Map<string, VisibilityState>();
  const unique = [...new Set(ids)].filter((x) => UUID_RE.test(x));
  for (let i = 0; i < unique.length; i += TENANT_VISIBILITY_READ_CHUNK) {
    let q = client.rpc("tenant_catalog_read_visibility", { p_entity_type: entity, p_ids: unique.slice(i, i + TENANT_VISIBILITY_READ_CHUNK) });
    if (signal && typeof q?.abortSignal === "function") q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) throw new TenantVisibilityError(mapTenantVisibilityError(error), error);
    if (!Array.isArray(data)) throw new TenantVisibilityError("Resposta de visibilidade inválida.");
    for (const r of data) {
      if (!r || typeof r.entity_id !== "string" || typeof r.hidden !== "boolean" || !Number.isInteger(r.version)) {
        throw new TenantVisibilityError("Resposta de visibilidade inválida.");
      }
      out.set(r.entity_id, { hidden: r.hidden, version: r.version });
    }
  }
  return out;
}

export interface SelectionRow { id: string; nome: string; selectable: boolean; hidden: boolean; ativo: boolean }
export interface SelectionPage { rows: SelectionRow[]; total: number; hasMore: boolean }

/** Seletor de NOVAS seleções: paginado e filtrado no servidor. `include` mostra o valor já vinculado sem torná-lo selecionável. */
export async function fetchTenantSelectionPage(client: RpcClient, p: {
  entity: TenantCatalogEntity; search?: string; limit: number; offset: number; include?: readonly string[]; signal?: AbortSignal;
}): Promise<SelectionPage> {
  const limit = Math.trunc(p.limit);
  if (!(limit >= 1 && limit <= TENANT_SELECTION_PAGE_MAX) || !(p.offset >= 0)) throw new TenantVisibilityError("Paginação inválida.");
  const include = [...new Set((p.include ?? []).filter((x) => UUID_RE.test(x)))];
  if (include.length > TENANT_SELECTION_INCLUDE_MAX) throw new TenantVisibilityError("Itens vinculados demais para exibir.");
  let q = client.rpc("tenant_catalog_selection_page", {
    p_entity_type: p.entity, p_search: (p.search ?? "").trim().slice(0, 80) || null,
    p_limit: limit, p_offset: Math.trunc(p.offset), p_include_ids: include.length ? include : null,
  });
  if (p.signal && typeof q?.abortSignal === "function") q = q.abortSignal(p.signal);
  const { data, error } = await q;
  if (error) throw new TenantVisibilityError(mapTenantVisibilityError(error), error);
  if (!Array.isArray(data)) throw new TenantVisibilityError("Resposta do seletor inválida.");
  let total = 0;
  const rows: SelectionRow[] = (data as Array<Record<string, unknown> | null>).map((r) => {
    if (!r || typeof r.id !== "string" || typeof r.nome !== "string" || typeof r.selectable !== "boolean") {
      throw new TenantVisibilityError("Resposta do seletor inválida.");
    }
    if (r.selectable && r.total != null) total = Number(r.total);
    return { id: r.id as string, nome: r.nome as string, selectable: r.selectable as boolean, hidden: !!r.hidden, ativo: !!r.ativo };
  });
  const selectableCount = rows.filter((r) => r.selectable).length;
  return { rows, total, hasMore: p.offset + selectableCount < total };
}

/** Aplica o filtro de gestão sobre a lista já carregada: ocultos somem por padrão, aparecem com "mostrar ocultos". */
export function applyManagementVisibility<T extends { id: string }>(
  items: readonly T[], vis: ReadonlyMap<string, VisibilityState> | undefined, showHidden: boolean,
): T[] {
  if (!vis || showHidden) return [...items];
  return items.filter((i) => !vis.get(i.id)?.hidden);
}
