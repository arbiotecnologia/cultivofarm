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
 *
 * `aliases` (opcional) mapeia valores legados/alternativos da URL para o valor
 * canônico da aba. O parâmetro é retrocompatível: telas que não passam aliases
 * mantêm exatamente o comportamento anterior. A gravação sempre usa o valor
 * canônico — aliases são aceitos apenas na leitura.
 */
export function useTabParam<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  aliases?: Readonly<Record<string, T>>,
): [T, (next: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(key);
  const aliasKey = aliases ? Object.keys(aliases).sort().join("|") : "";
  const value = useMemo<T>(() => {
    if (!raw) return fallback;
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    const canonico = aliases?.[raw];
    if (canonico && (allowed as readonly string[]).includes(canonico)) return canonico;
    return fallback;
    // `allowed` costuma ser um literal constante; comparamos pelo conteúdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, fallback, allowed.join("|"), aliasKey]);

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
