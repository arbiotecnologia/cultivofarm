import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pauseStateKey, readPauseState, writePauseState } from "@/lib/authz/pauseRetainedState";

/**
 * Preferência NÃO sensível (valor do filtro de status) de /comercial/pedidos-b2b,
 * retida em memória volátil (pauseRetainedState) por usuário+empresa+papéis.
 * Época de autorização fica fora da chave de propósito: renovação/revalidação
 * do mesmo ator não reseta o filtro. Dados, detalhes e queries continuam
 * cercados pelos gates/fences existentes. Logout/troca de identidade limpa
 * tudo via clearAllPauseStates (useAuth). Valor inválido cai no padrão.
 */
export function usePedidosB2BStatusFilter(allowed: readonly string[], fallback: string) {
  const { user, profile, roles = [] } = useAuth();
  const identityOk = !!user?.id && profile?.user_id === user.id && profile?.ativo === true && !!profile?.organization_id;
  const key = identityOk
    ? `${pauseStateKey({ userId: user!.id, organizationId: profile!.organization_id, roles, epoch: 0 })}:pedidos-b2b:status`
    : null;
  const read = (k: string | null) => {
    const v = k ? readPauseState<string>(k) : null;
    return typeof v === "string" && allowed.includes(v) ? v : fallback;
  };
  const [state, setState] = useState(() => ({ key, value: read(key) }));
  // Troca de identidade/empresa/papéis com a página montada: sem herança.
  const current = state.key === key ? state : { key, value: read(key) };
  if (current !== state) setState(current);
  const setValue = useCallback((next: string) => {
    const v = allowed.includes(next) ? next : fallback;
    setState({ key, value: v });
    if (key) writePauseState(key, v);
  }, [key, allowed, fallback]);
  return [current.value, setValue] as const;
}
