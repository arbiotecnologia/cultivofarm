import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Mantém a aba ativa na URL (`?key=valor`), preservando os demais parâmetros.
 *
 * Motivação: `<Tabs defaultValue>` guarda a aba apenas em estado interno do
 * Radix — qualquer remontagem da árvore (refresh, atualização de sessão, HMR)
 * devolve a UI para a primeira aba. Ancorar na URL torna a seleção estável e
 * permite deep link / botão voltar.
 *
 * Valores fora da lista permitida caem no fallback, sem quebrar a tela.
 */
export function useTabParam<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(key);
  const value = useMemo<T>(
    () => (raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback),
    // `allowed` costuma ser um literal constante; comparamos pelo conteúdo.
    [raw, fallback, allowed.join("|")],
  );

  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (!next || next === fallback) params.delete(key);
          else params.set(key, next);
          return params;
        },
        { replace: true },
      );
    },
    [key, fallback, setSearchParams],
  );

  return [value, setValue];
}
