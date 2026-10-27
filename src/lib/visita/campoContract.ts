import type { PendingCampo } from "@/lib/offlineDb";

export interface CampoOwner { userId: string; organizationId: string }

/** Unowned legacy entries and other actors/tenants are never adopted or replayed. */
export function campoOwnedBy(entry: Pick<PendingCampo, "ownerUserId" | "ownerOrganizationId">, actor: CampoOwner | null): boolean {
  return !!actor && !!actor.userId && !!actor.organizationId &&
    entry.ownerUserId === actor.userId && entry.ownerOrganizationId === actor.organizationId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Expected CAS sent to the server: 0 (no row yet) or the observed positive version. */
export function isValidCampoExpected(expected: unknown): expected is number {
  return typeof expected === "number" && Number.isSafeInteger(expected) && expected >= 0;
}

export interface CampoEnvelope { id: string; versao: number; replayed: boolean }

/**
 * Accepts only the full server envelope matching the request identity and the CAS sent:
 * id (uuid), registro_consultor_id === parent, client_uuid === sent key (insert/replay) or the
 * same key/legacy NULL (update), replayed only on expected 0, versao exactly expected 0 -> 1 or
 * N -> N+1. Never invents a version; anything else is invalid_response.
 */
export function parseCampoResult(data: unknown, expected: number, registroId: string, clientUuid: string | null): CampoEnvelope {
  if (!isValidCampoExpected(expected)) throw new Error("invalid_response");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_response");
  const res = data as Record<string, unknown>;
  const v = res.versao;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new Error("invalid_response");
  if (typeof res.id !== "string" || !UUID.test(res.id)) throw new Error("invalid_response");
  if (res.registro_consultor_id !== registroId) throw new Error("invalid_response");
  if (typeof res.replayed !== "boolean") throw new Error("invalid_response");
  if (res.replayed && expected !== 0) throw new Error("invalid_response");
  const cu = res.client_uuid;
  if (expected === 0) {
    if (clientUuid == null || cu !== clientUuid) throw new Error("invalid_response");
  } else if (!(cu === null || (clientUuid != null && cu === clientUuid))) {
    throw new Error("invalid_response");
  }
  if (v !== (expected === 0 ? 1 : expected + 1)) throw new Error("invalid_response");
  return { id: res.id, versao: v, replayed: res.replayed };
}

/** Validates a hydrated server row: identity of this visit and a positive safe version. */
export function parseCampoRow(data: unknown, registroId: string): { id: string; versao: number } & Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_response");
  const d = data as Record<string, unknown>;
  if (typeof d.id !== "string" || d.registro_consultor_id !== registroId) throw new Error("invalid_response");
  if (typeof d.versao !== "number" || !Number.isSafeInteger(d.versao) || d.versao < 1) throw new Error("invalid_response");
  return d as { id: string; versao: number } & Record<string, unknown>;
}

/** Business conflicts (PT409): never retried automatically; the draft stays local. */
export function isCampoConflict(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e?.code === "PT409") return true;
  const m = typeof e?.message === "string" ? e.message : "";
  return /version_conflict|visita_locked|versao_deve_incrementar|versao_inicial_invalida/.test(m);
}

export const CAMPO_CONFLICT_MESSAGE =
  "Os dados de campo foram alterados em outro lugar ou a visita não está mais editável. Seu rascunho foi mantido; reconsulte para revisar.";
