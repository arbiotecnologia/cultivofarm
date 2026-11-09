import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pauseStateKey, readPauseState, writePauseState } from "@/lib/authz/pauseRetainedState";

export const PEDIDOS_B2B_DEFAULT_STATUS = "all";

type FilterState = { key: string | null; value: string };

/**
 * Preferência NÃO sensível (valor do filtro de status) de /comercial/pedidos-b2b,
 * retida SOMENTE em memória volátil (Map) durante pausas de autorização,
 * por usuário+empresa+papéis. Reload completo descarta o Map e volta a Todos.
 * Uma query status válida é uma intenção de navegação de uso único: ela é
 * aplicada e removida da URL, nunca usada para persistir escolhas posteriores.
 * Época de autorização fica fora da chave de propósito: renovação/revalidação
 * do mesmo ator não reseta o filtro. Dados, detalhes e queries continuam
 * cercados pelos gates/fences existentes. Logout/troca de identidade limpa
 * a memória via clearAllPauseStates (useAuth). Valor inválido cai no padrão.
 */
export function usePedidosB2BStatusFilter(allowed: readonly string[], fallback: string) {
  const { user, profile, roles = [] } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const identityOk = !!user?.id && profile?.user_id === user.id && profile?.ativo === true && !!profile?.organization_id;
  const key = identityOk
    ? `${pauseStateKey({ userId: user!.id, organizationId: profile!.organization_id, roles, epoch: 0 })}:pedidos-b2b:status`
    : null;
  const read = (k: string | null) => {
    const v = k ? readPauseState<string>(k) : null;
    return typeof v === "string" && allowed.includes(v) ? v : fallback;
  };
  const [state, setState] = useState<FilterState>(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("status")) return { key, value: read(key), consume: false };
    const requested = params.get("status");
    return {
      key,
      value: requested !== null && allowed.includes(requested) ? requested : fallback,
      consume: true,
    };
  });
  // Troca de identidade/empresa/papéis com a página montada: sem herança e
  // sem reinterpretar uma intenção de navegação capturada para o ator anterior.
  const current = state.key === key ? state : { key, value: read(key), consume: false };
  if (current !== state) setState(current);

  useEffect(() => {
    if (!current.consume || current.key !== key) return;
    const params = new URLSearchParams(location.search);
    if (key) writePauseState(key, current.value);
    params.delete("status");
    setState({ key, value: current.value, consume: false });
    if (params.has("status") || location.search.includes("status=")) {
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
    }
  }, [current.consume, current.key, current.value, key, location.hash, location.pathname, location.search, navigate]);

  const setValue = useCallback((next: string) => {
    const v = allowed.includes(next) ? next : fallback;
    setState({ key, value: v, consume: false });
    if (key) writePauseState(key, v);
  }, [key, allowed, fallback]);
  return [current.value, setValue] as const;
}
