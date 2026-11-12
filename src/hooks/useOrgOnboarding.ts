import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OnboardingDados } from "@/lib/saas/orgOnboarding";
import { sanitizarPayloadOnboarding } from "@/lib/saas/orgOnboarding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface OnboardingState {
  required: boolean;
  blocked?: boolean;
  is_admin?: boolean;
  organization_id?: string;
  status?: string;
  nome?: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  email_corporativo?: string | null;
  fuso_horario?: string | null;
  dados?: OnboardingDados;
  plano?: string | null;
  review_pending?: boolean;
  review?: { origem: string; motivo_codigo: string; submetido_em: string } | null;
  /** Evidência registrada pelo servidor (Edge) para o CNPJ atual; nunca derivada do navegador. */
  evidencia?: {
    id: string; cnpj: string; razao_social: string | null; situacao_cadastral: string | null;
    fonte: string; consultado_em: string; vigente: boolean;
  } | null;
}

/** Fallback periódico curto enquanto a aba está visível (ms). */
export const ONBOARDING_POLL_MS = 20_000;
/** Aba oculta por mais que isto: ao voltar, não exibe conteúdo antigo antes de revalidar (ms). */
export const ONBOARDING_RETURN_REVALIDATE_MS = 15_000;
const BROADCAST_CHANNEL = "cultivo:org-onboarding-state";

export interface OnboardingScope { userId: string | null | undefined; organizationId: string | null | undefined }

export function onboardingStateKey(scope?: OnboardingScope) {
  return ["org_onboarding_state", scope?.userId ?? null, scope?.organizationId ?? null] as const;
}

/** Bloqueio efetivo: o servidor indica pendência OU revisão (nunca depende só de `required`). */
export function onboardingStateBloqueia(state: OnboardingState | undefined): boolean {
  if (!state) return false;
  return state.required === true || state.review_pending === true || state.status === "aguardando_revisao";
}

/**
 * Estado do cadastro da organização, revalidado em aba já aberta:
 * polling curto visível, foco, volta à aba, `online`, retomada de bfcache (`pageshow`)
 * e aviso entre abas do mesmo navegador (BroadcastChannel). A chave inclui usuário e
 * organização; respostas de outra organização são rejeitadas (proteção contra obsoletas).
 */
export function useOnboardingState(enabled: boolean, scope?: OnboardingScope) {
  const qc = useQueryClient();
  const key = onboardingStateKey(scope);
  const query = useQuery<OnboardingState>({
    queryKey: key,
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: ONBOARDING_POLL_MS,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      let req = db.rpc("org_onboarding_state");
      if (signal && typeof req?.abortSignal === "function") req = req.abortSignal(signal);
      const { data, error } = await req;
      if (error) throw new Error(error.message);
      const st = (data ?? { required: false }) as OnboardingState;
      if (scope?.organizationId && st.organization_id && st.organization_id !== scope.organizationId) {
        throw new Error("org_onboarding_state: resposta de outra organização descartada");
      }
      return st;
    },
  });

  // Revalidação ao voltar/retomar + bloqueio de conteúdo antigo após ausência longa.
  const [hiddenSince, setHiddenSince] = useState<number | null>(null);
  const [revalidando, setRevalidando] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (!enabled) return;
    let oculto: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    const revalidar = (bloquear: boolean) => {
      if (bloquear) setRevalidando(true);
      void qc.refetchQueries({ queryKey: keyRef.current, exact: true }, { cancelRefetch: true })
        .finally(() => setRevalidando(false));
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") { oculto = Date.now(); setHiddenSince(oculto); return; }
      const longo = oculto !== null && Date.now() - oculto >= ONBOARDING_RETURN_REVALIDATE_MS;
      oculto = null; setHiddenSince(null);
      revalidar(longo);
    };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) revalidar(true); };
    const onOnline = () => revalidar(false);
    let canal: BroadcastChannel | null = null;
    try {
      canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(BROADCAST_CHANNEL) : null;
      if (canal) canal.onmessage = () => revalidar(false);
    } catch { canal = null; }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      canal?.close();
    };
  }, [enabled, qc]);

  // Aviso entre abas quando esta aba observa mudança de status (apenas um sinal, sem dados).
  const statusAtual = query.data ? `${onboardingStateBloqueia(query.data)}:${query.data.status ?? ""}` : null;
  const statusAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (statusAtual === null) return;
    if (statusAnterior.current !== null && statusAnterior.current !== statusAtual) {
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const c = new BroadcastChannel(BROADCAST_CHANNEL); c.postMessage("changed"); c.close();
        }
      } catch { /* opcional */ }
    }
    statusAnterior.current = statusAtual;
  }, [statusAtual]);

  void hiddenSince;
  return Object.assign(query, { revalidando });
}

export function useSalvarOnboarding() {
  return useMutation({
    retry: false,
    mutationFn: async (d: OnboardingDados) => {
      const { error } = await db.rpc("org_onboarding_save", {
        _dados: sanitizarPayloadOnboarding(d as Record<string, unknown>),
      });
      if (error) throw new Error(error.message);
    },
  });
}

export function useConcluirOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const { data, error } = await db.rpc("org_onboarding_complete");
      if (error) throw new Error(error.message);
      return data as { status: "ativa" | "aguardando_revisao"; idempotent: boolean; motivo?: string };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["org_onboarding_state"] });
      await qc.invalidateQueries({ queryKey: ["organization-profile"] });
    },
  });
}
