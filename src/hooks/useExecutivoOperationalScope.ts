import { useAuth } from "@/hooks/useAuth";

// A cache boundary, never a replacement for the server's actor/tenant checks.
export function useExecutivoOperationalScope() {
  const { user, profile, roles, loading } = useAuth();
  const ready = !loading && Boolean(user?.id) && profile?.user_id === user?.id
    && profile?.ativo === true && profile?.senha_provisoria === false
    && Boolean(profile?.organization_id)
    && roles.some((role) => role === "administrador" || role === "gestor");
  return { ready, key: [user?.id ?? null, profile?.organization_id ?? null, [...roles].sort().join(","), ready] };
}

export interface ExecutivoOperationalPayload<T> {
  items: T[];
  dados_indisponiveis: string[];
  motivo_indisponibilidade: string | null;
}

export function parseExecutivoOperationalPayload<T>(value: unknown, field: "eventos" | "gargalos"): ExecutivoOperationalPayload<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("EXECUTIVO_INVALID_RESPONSE");
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload[field]) || !Array.isArray(payload.dados_indisponiveis)
    || !payload.dados_indisponiveis.every((item) => typeof item === "string")) throw new Error("EXECUTIVO_INVALID_RESPONSE");
  const unavailable = payload.dados_indisponiveis as string[];
  return {
    items: unavailable.length ? [] : payload[field] as T[],
    dados_indisponiveis: unavailable,
    motivo_indisponibilidade: typeof payload.motivo_indisponibilidade === "string" ? payload.motivo_indisponibilidade : null,
  };
}
