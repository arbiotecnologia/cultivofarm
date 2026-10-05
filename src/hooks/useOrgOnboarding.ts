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
}

export function useOnboardingState(enabled: boolean) {
  return useQuery<OnboardingState>({
    queryKey: ["org_onboarding_state"],
    enabled,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("org_onboarding_state");
      if (error) throw new Error(error.message);
      return (data ?? { required: false }) as OnboardingState;
    },
  });
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
      return data as { status: string; idempotent: boolean };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["org_onboarding_state"] });
      await qc.invalidateQueries({ queryKey: ["organization-profile"] });
    },
  });
}
