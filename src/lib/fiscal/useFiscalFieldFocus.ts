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

const FOCUSABLE_SELECTOR = "input, select, textarea, button, [tabindex]";

function isNativelyFocusable(el: Element): boolean {
  const tag = el.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON";
}

export function focusFieldById(fieldId: string): boolean {
  if (typeof document === "undefined") return false;
  if (!KNOWN_FIELD_TARGETS.has(fieldId)) return false;
  const container = document.getElementById(fieldId);
  if (!container) return false;
  // Se o `id` corresponde a um contêiner (ex.: FieldRow wrapper), procura o
  // primeiro controle focável interno; caso contrário mantém o próprio alvo.
  const target: HTMLElement = isNativelyFocusable(container)
    ? container
    : ((container.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null) ?? container);
  try {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    // JSDOM/older browsers: fallback silencioso.
  }
  if (typeof target.focus === "function") {
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
  }
  target.classList.add(...HIGHLIGHT_CLASSES);
  window.setTimeout(() => {
    target.classList.remove(...HIGHLIGHT_CLASSES);
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
    // Formato canônico H4-A2: `?aba=<aba>#<id-real>`. Formato legado H4-A1
    // (`?campo=<id>`) segue aceito para não quebrar links já compartilhados.
    const rawHash = typeof window !== "undefined" ? (window.location.hash ?? "") : "";
    const hashKey = rawHash.startsWith("#") ? decodeURIComponent(rawHash.slice(1)) : "";
    const legacyKey = searchParams.get("campo") ?? "";
    const campo = hashKey || legacyKey;
    if (!campo) return;
    // Aguarda o painel da aba montar (Tabs monta lazy o TabsContent ativo).
    const handle = window.setTimeout(() => {
      const ok = focusFieldById(campo);
      // Consome hash canônico e/ou parâmetro legado sem alterar valores.
      if (hashKey && typeof window !== "undefined" && window.history?.replaceState) {
        const { pathname, search } = window.location;
        window.history.replaceState(null, "", `${pathname}${search}`);
      }
      if (legacyKey && searchParams.get("campo") === legacyKey) {
        const next = new URLSearchParams(searchParams);
        next.delete("campo");
        setSearchParams(next, { replace: true });
      }
      void ok;
    }, 60);
    return () => window.clearTimeout(handle);
  }, [tab, ready, searchParams, setSearchParams]);
}
