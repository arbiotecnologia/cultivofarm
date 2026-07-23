/**
 * Fase H4-A1 — Foco/destaque de campo via deep-link `?campo=<id>`.
 *
 * Puro no lado do cliente. Não altera valor, não navega, não persiste.
 * - Lê o parâmetro `campo` da URL.
 * - Após a aba ativa ser renderizada, tenta localizar o elemento por `id`
 *   entre as chaves permitidas (allow-list). Alvo inexistente => no-op
 *   (fallback seguro: usuário permanece na aba).
 * - Rola até o campo, aciona `focus` (quando focável) e aplica destaque
 *   temporário via classe utilitária, removendo após ~1600ms.
 * - Consome o parâmetro para evitar re-disparo em navegações internas.
 */
import { useEffect } from "react";
import type { useSearchParams } from "react-router-dom";
import { KNOWN_FIELD_TARGETS } from "@/lib/fiscal/companyMissingFields";

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

const HIGHLIGHT_CLASSES = [
  "ring-2",
  "ring-primary",
  "ring-offset-2",
  "ring-offset-background",
  "rounded-md",
  "transition-shadow",
] as const;

const HIGHLIGHT_MS = 1600;

export interface UseFiscalFieldFocusOptions {
  /** Aba ativa atual — o efeito re-executa quando muda. */
  tab: string;
  /** Se o carregamento inicial de dados terminou (evita alvo ainda ausente). */
  ready: boolean;
  searchParams: URLSearchParams;
  setSearchParams: SetSearchParams;
}

export function focusFieldById(fieldId: string): boolean {
  if (typeof document === "undefined") return false;
  if (!KNOWN_FIELD_TARGETS.has(fieldId)) return false;
  const el = document.getElementById(fieldId);
  if (!el) return false;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    // JSDOM/older browsers: fallback silencioso.
  }
  if (typeof (el as HTMLElement).focus === "function") {
    try {
      (el as HTMLElement).focus({ preventScroll: true });
    } catch {
      /* noop */
    }
  }
  el.classList.add(...HIGHLIGHT_CLASSES);
  window.setTimeout(() => {
    el.classList.remove(...HIGHLIGHT_CLASSES);
  }, HIGHLIGHT_MS);
  return true;
}

export function useFiscalFieldFocus({
  tab,
  ready,
  searchParams,
  setSearchParams,
}: UseFiscalFieldFocusOptions): void {
  useEffect(() => {
    if (!ready) return;
    const campo = searchParams.get("campo");
    if (!campo) return;
    // Aguarda o painel da aba montar (Tabs monta lazy o TabsContent ativo).
    const handle = window.setTimeout(() => {
      const ok = focusFieldById(campo);
      // Consome o parâmetro em ambos os casos (alvo válido OU fallback),
      // sem alterar valor nem outros parâmetros.
      if (searchParams.get("campo") === campo) {
        const next = new URLSearchParams(searchParams);
        next.delete("campo");
        setSearchParams(next, { replace: true });
      }
      // Retorno explícito para o linter.
      void ok;
    }, 60);
    return () => window.clearTimeout(handle);
  }, [tab, ready, searchParams, setSearchParams]);
}
