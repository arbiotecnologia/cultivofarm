/**
 * Itens PRÓPRIOS por empresa (Fase 3 — fundação candidata, gate do servidor DESABILITADO).
 *
 * - Empresa/dono derivados no servidor; nenhuma função envia organization_id/owner.
 * - Duplicidade é decidida SOMENTE no servidor (normalização + lock + índice único).
 *   Este módulo apenas traduz o código devolvido em mensagem amigável; não há checagem client-only.
 * - Enquanto o gate do servidor estiver fechado, a UI não oferece criar/editar/arquivar próprios.
 */
import type { RpcClient, TenantCatalogEntity, TenantCatalogScope } from "./tenantCatalogVisibility";

/** Capacidade de CRUD próprio na UI. Só muda após aplicação revisada + certificação dos leitores. */
export const TENANT_OWNED_CATALOG_ENABLED = false as const;

export type CatalogOrigin = "global" | "proprio";
export function catalogOrigin(row: { owner_organization_id?: string | null }): CatalogOrigin {
  return row.owner_organization_id ? "proprio" : "global";
}
export const CATALOG_ORIGIN_LABEL: Record<CatalogOrigin, string> = { global: "Global", proprio: "Próprio" };

/** Globais nunca são editáveis/arquiváveis pela empresa; próprios apenas com gate + permissão. */
export function canManageOwnedItem(row: { owner_organization_id?: string | null }, canManage: boolean, enabled: boolean = TENANT_OWNED_CATALOG_ENABLED) {
  return enabled && canManage && catalogOrigin(row) === "proprio";
}

export type OwnedOperation = "create" | "update" | "archive" | "composition";
export interface OwnedMutation {
  entity: TenantCatalogEntity;
  operation: OwnedOperation;
  entityId: string | null;
  expectedUpdatedAt: string | null;
  payload: Record<string, unknown>;
  reason: string;
  idempotencyKey: string;
}

const FORBIDDEN_KEYS = ["organization_id", "owner_organization_id", "id", "ativo", "b2b_enabled", "codigo"];

export class OwnedCatalogError extends Error {
  constructor(public readonly code: string, message: string, public readonly globalId: string | null = null) {
    super(message);
    this.name = "OwnedCatalogError";
  }
}

const ENTITY_LABEL: Record<TenantCatalogEntity, string> = { produto: "produto", microrganismo: "microrganismo", cultura: "cultura" };

/** Traduz erros do servidor sem vazar detalhes nem existência de itens de outra empresa. */
export function ownedCatalogError(error: unknown, entity: TenantCatalogEntity): OwnedCatalogError {
  const e = (typeof error === "object" && error !== null ? error : {}) as { message?: string; code?: string; details?: string };
  const msg = e.message ?? "";
  const label = ENTITY_LABEL[entity];
  const uuid = typeof e.details === "string" && /^[0-9a-f-]{36}$/i.test(e.details) ? e.details : null;
  if (msg.includes("catalog_owned_duplicate_global_active"))
    return new OwnedCatalogError("duplicate_global_active",
      `Este ${label} já existe no catálogo global. Localize-o no catálogo da empresa e use “Exibir” caso esteja oculto.`, uuid);
  if (msg.includes("catalog_owned_duplicate_global_inactive"))
    return new OwnedCatalogError("duplicate_global_inactive",
      `Este ${label} já existe no catálogo global, mas está inativo. Solicite a ativação à plataforma.`, uuid);
  if (msg.includes("catalog_owned_duplicate_own"))
    return new OwnedCatalogError("duplicate_own", `Sua empresa já tem um ${label} próprio com esse nome.`);
  if (msg.includes("catalog_ownership_disabled"))
    return new OwnedCatalogError("disabled", "Cadastro de itens próprios ainda não está disponível.");
  if (e.code === "40001" || msg.includes("catalog_owned_stale"))
    return new OwnedCatalogError("stale", "O item mudou desde que foi aberto. Reabra para conferir os dados.");
  if (msg.includes("catalog_owned_idempotency_conflict"))
    return new OwnedCatalogError("idempotency", "Esta solicitação já foi usada com outros dados. Reabra a edição.");
  if (msg.includes("catalog_owned_component_unavailable"))
    return new OwnedCatalogError("component", "Um dos componentes não está disponível para sua empresa.");
  if (e.code === "42501" || msg.includes("catalog_owned_not_found"))
    return new OwnedCatalogError("denied", "Sem permissão para alterar este item.");
  return new OwnedCatalogError("unknown", "Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.");
}

export async function mutateOwnedItem(client: RpcClient, m: OwnedMutation, signal?: AbortSignal) {
  if (!TENANT_OWNED_CATALOG_ENABLED) throw new OwnedCatalogError("disabled", "Cadastro de itens próprios ainda não está disponível.");
  if (Object.keys(m.payload).some((k) => FORBIDDEN_KEYS.includes(k)))
    throw new OwnedCatalogError("invalid", "Dados inválidos.");
  const reason = m.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new OwnedCatalogError("invalid", "Informe um motivo entre 10 e 500 caracteres.");
  let q = client.rpc("tenant_catalog_owned_mutate", {
    p_entity_type: m.entity, p_operation: m.operation, p_entity_id: m.entityId,
    p_expected_updated_at: m.expectedUpdatedAt, p_payload: m.payload, p_reason: reason, p_idempotency_key: m.idempotencyKey,
  });
  if (signal && q?.abortSignal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (signal?.aborted) throw new OwnedCatalogError("aborted", "Solicitação encerrada.");
  if (error) throw ownedCatalogError(error, m.entity);
  if (!data || data.id == null || data.idempotency_key !== m.idempotencyKey || data.origin !== "proprio")
    throw ownedCatalogError(null, m.entity);
  return data as { id: string; updated_at: string; replayed: boolean };
}

export const ownedCatalogKeys = {
  list: (s: TenantCatalogScope, entity: TenantCatalogEntity, search: string, offset: number, limit: number) =>
    ["tenant-catalog", s.organizationId, s.userId, "owned", entity, search, offset, limit] as const,
};

/** Guarda de resposta tardia: só aplica se o escopo/geração ainda for o mesmo do disparo. */
export function createResponseFence() {
  let generation = 0;
  return {
    begin(scope: string) { generation += 1; const g = generation; return (current: string) => g === generation && current === scope; },
    invalidate() { generation += 1; },
  };
}
