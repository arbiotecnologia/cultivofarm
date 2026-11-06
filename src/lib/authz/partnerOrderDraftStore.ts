import { safePartnerOrderDraft, type SafePartnerOrderDraft } from "./safePartnerOrderDraft";

/**
 * Retenção mínima das ESCOLHAS do pedido B2B após recarregar a aba (sessionStorage).
 * Guarda só ids, quantidades e data desejada (via safePartnerOrderDraft): nunca preço, hash, token,
 * recibo, chave idempotente ou texto livre. Escopo = usuário + tenant + parceiro; expira em 8 h.
 * Nunca concede autoridade: a tela só restaura depois de catálogo/volumes/embalagens frescos e
 * com o monitor de acesso confirmando o vetor atual; dados corrompidos/expirados/de outro escopo são apagados.
 * Logout, troca de identidade/tenant/papel (epoch), perfil inativo e expiração limpam tudo (clearAll).
 */
export const PARTNER_ORDER_DRAFT_PREFIX = "cf:b2b-order-draft:v1:";
export const PARTNER_ORDER_DRAFT_TTL_MS = 8 * 60 * 60 * 1000;

export interface PartnerOrderDraftScope { userId: string; tenantId: string; partnerId: string }

const UUIDISH = /^[0-9A-Za-z-]{1,64}$/;
const validScope = (s: PartnerOrderDraftScope | null | undefined): s is PartnerOrderDraftScope =>
  !!s && UUIDISH.test(s.userId) && UUIDISH.test(s.tenantId) && UUIDISH.test(s.partnerId);
const keyOf = (s: PartnerOrderDraftScope) => `${PARTNER_ORDER_DRAFT_PREFIX}${s.userId}:${s.tenantId}:${s.partnerId}`;

function store(): Storage | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

export function savePartnerOrderDraft(scope: PartnerOrderDraftScope | null, draft: SafePartnerOrderDraft | null, now = Date.now()): void {
  const st = store(); if (!st || !validScope(scope)) return;
  const safe = draft && draft.partnerId === scope.partnerId ? safePartnerOrderDraft(draft) : null;
  if (!safe || (safe.items.length === 0 && !safe.requestedDeliveryDate)) { try { st.removeItem(keyOf(scope)); } catch { /* noop */ } return; }
  const record = { v: 1, u: scope.userId, t: scope.tenantId, p: scope.partnerId, savedAt: now, expiresAt: now + PARTNER_ORDER_DRAFT_TTL_MS,
    draft: { partnerId: safe.partnerId, addItemId: null, requestedDeliveryDate: safe.requestedDeliveryDate, items: safe.items } };
  try { st.setItem(keyOf(scope), JSON.stringify(record)); } catch { /* quota/privado: sem retenção, sem erro */ }
}

export function loadPartnerOrderDraft(scope: PartnerOrderDraftScope | null, now = Date.now()): SafePartnerOrderDraft | null {
  const st = store(); if (!st || !validScope(scope)) return null;
  const k = keyOf(scope); let raw: string | null = null;
  try { raw = st.getItem(k); } catch { return null; }
  if (!raw) return null;
  const drop = () => { try { st.removeItem(k); } catch { /* noop */ } return null; };
  let rec: unknown;
  try { rec = JSON.parse(raw); } catch { return drop(); }
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return drop();
  const r = rec as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== "draft,expiresAt,p,savedAt,t,u,v" || r.v !== 1 || r.u !== scope.userId || r.t !== scope.tenantId ||
      r.p !== scope.partnerId || typeof r.savedAt !== "number" || typeof r.expiresAt !== "number" || r.savedAt > now + 60_000 ||
      r.expiresAt <= now || r.expiresAt - r.savedAt > PARTNER_ORDER_DRAFT_TTL_MS) return drop();
  const d = r.draft as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || Array.isArray(d) || Object.keys(d).sort().join(",") !== "addItemId,items,partnerId,requestedDeliveryDate" ||
      d.partnerId !== scope.partnerId || !Array.isArray(d.items)) return drop();
  for (const it of d.items as unknown[]) {
    if (!it || typeof it !== "object" || Array.isArray(it)) return drop();
    const keys = Object.keys(it).sort().join(",");
    if (keys !== "itemId,quantity,volumeId" && keys !== "itemId,packagingId,quantity") return drop();
    for (const [kk, vv] of Object.entries(it)) if (kk === "quantity" ? typeof vv !== "number" : typeof vv !== "string") return drop();
  }
  const safe = safePartnerOrderDraft(d as unknown as SafePartnerOrderDraft);
  return safe ? { ...safe, addItemId: null } : drop();
}

/** Logout, troca de identidade/tenant/papel, revogação e expiração: apaga todas as escolhas retidas. */
export function clearAllPartnerOrderDrafts(): void {
  const st = store(); if (!st) return;
  try {
    const ks: string[] = [];
    for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(PARTNER_ORDER_DRAFT_PREFIX)) ks.push(k); }
    ks.forEach((k) => st.removeItem(k));
  } catch { /* noop */ }
}
