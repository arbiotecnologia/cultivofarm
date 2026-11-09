import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pauseStateKey, readPauseState, writePauseState } from "@/lib/authz/pauseRetainedState";

/**
 * Preferência NÃO sensível (valor do filtro de status) de /comercial/pedidos-b2b,
 * refletida na URL para sobreviver a reload e retida em memória volátil durante
 * pausas de autorização. A retenção continua por usuário+empresa+papéis; uma
 * troca de identidade não herda o status que estava no endereço.
 * Época de autorização fica fora da chave de propósito: renovação/revalidação
 * do mesmo ator não reseta o filtro. Dados, detalhes e queries continuam
 * cercados pelos gates/fences existentes. Logout/troca de identidade limpa
 * a memória via clearAllPauseStates (useAuth). Valor inválido cai no padrão.
 */
export function usePedidosB2BStatusFilter(allowed: readonly string[], fallback: string) {
  const { user, profile, roles = [] } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("status");
  const queryValue = query && allowed.includes(query) ? query : null;
  const previousIdentity = useRef<string | null>(null);
  const identityOk = !!user?.id && profile?.user_id === user.id && profile?.ativo === true && !!profile?.organization_id;
  const key = identityOk
    ? `${pauseStateKey({ userId: user!.id, organizationId: profile!.organization_id, roles, epoch: 0 })}:pedidos-b2b:status`
    : null;
  const read = (k: string | null, preferQuery: boolean) => {
    if (preferQuery && queryValue) return queryValue;
    const v = k ? readPauseState<string>(k) : null;
    return typeof v === "string" && allowed.includes(v) ? v : fallback;
  };
  // Só a primeira identidade resolvida nesta montagem pode adotar o status da URL.
  // Depois de A→B/logout, o efeito abaixo substitui o parâmetro pelo valor de B.
  const mayAdoptQuery = key !== null && previousIdentity.current === null;
  const [state, setState] = useState(() => ({ key, value: read(key, true) }));
  if (key) previousIdentity.current = key;
  // Troca de identidade/empresa/papéis com a página montada: sem herança.
  const current = state.key === key ? state : { key, value: read(key, mayAdoptQuery) };
  if (current !== state) setState(current);
  useEffect(() => {
    if (!key || queryValue === current.value) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("status", current.value);
      return next;
    }, { replace: true });
  }, [key, current.value, queryValue, setSearchParams]);
  const setValue = useCallback((next: string) => {
    const v = allowed.includes(next) ? next : fallback;
    setState({ key, value: v });
    if (key) {
      writePauseState(key, v);
      setSearchParams((previous) => {
        const params = new URLSearchParams(previous);
        params.set("status", v);
        return params;
      }, { replace: true });
    }
  }, [key, allowed, fallback, setSearchParams]);
  return [current.value, setValue] as const;
}
