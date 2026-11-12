/**
 * H7 — Smokes autenticados de homologação (somente leitura fiscal).
 *
 * Dois testes, ambos com a sessão JWT normal do usuário:
 *   1. `fiscal-event-sign` `action=self_test` — autoteste criptográfico inerte
 *      do cofre A1. Não persiste, não numera, não transmite.
 *   2. `fiscal-sefaz-transport` `action=status` — NFeStatusServico4 de
 *      HOMOLOGAÇÃO. Nenhum documento, chave real ou numeração é enviada.
 *
 * As respostas passam obrigatoriamente pelos sanitizadores puros; nada bruto
 * chega à tela e nada é registrado em console.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  sanitizeSefazStatusResponse,
  sanitizeSelfTestResponse,
  type CertificateSelfTestView,
  type SefazStatusView,
} from "@/lib/fiscal/homologationSmokeGate";

export function useFiscalCertificateSelfTest() {
  return useMutation<CertificateSelfTestView, Error, void>({
    mutationKey: ["fiscal", "smoke", "certificate-self-test"],
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fiscal-event-sign", {
        body: { action: "self_test" },
      });
      if (error) throw new Error(error.message);
      const payload = (data ?? {}) as Record<string, unknown>;
      if (payload.error) throw new Error(String(payload.code ?? payload.error));
      return sanitizeSelfTestResponse(payload);
    },
  });
}

/** Identificador de correlação do smoke — não é numeração fiscal. */
function smokeIdempotencyKey(): string {
  return `H7-SMOKE-STATUS-${crypto.randomUUID()}`;
}

/** Rascunho NF-e de homologação elegível para o smoke de status. */
export interface HomologationDraftOption {
  id: string;
  label: string;
}

/**
 * Lista (via RLS da sessão) os rascunhos NF-e tpAmb=2 da empresa fiscal atual.
 * Somente leitura; o servidor revalida acesso e vínculo do certificado.
 */
export function useHomologationNfeDrafts(companySettingsId: string | null) {
  return useQuery<HomologationDraftOption[], Error>({
    queryKey: ["fiscal", "smoke", "hml-nfe-drafts", companySettingsId],
    enabled: !!companySettingsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("id, series, invoice_number, created_at")
        .match({
          company_settings_id: companySettingsId as string,
          document_model: "NFE",
          environment: "HOMOLOGATION",
          normalized_status: "DRAFT",
        })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id,
        label: `Rascunho série ${r.series ?? "—"} · ${new Date(r.created_at).toLocaleString("pt-BR")} · ${r.id.slice(0, 8)}`,
      }));
    },
  });
}

export function useSefazStatusSmoke() {
  return useMutation<SefazStatusView, Error, { invoiceId: string }>({
    mutationKey: ["fiscal", "smoke", "sefaz-status"],
    mutationFn: async ({ invoiceId }) => {
      if (!invoiceId) throw new Error("Selecione um rascunho NF-e de homologação.");
      const started = Date.now();
      const { data, error } = await supabase.functions.invoke("fiscal-sefaz-transport", {
        body: { action: "status", invoice_id: invoiceId, idempotency_key: smokeIdempotencyKey() },
      });
      const elapsed = Date.now() - started;
      if (error) throw new Error(error.message);
      const payload = (data ?? {}) as Record<string, unknown>;
      if (payload.error) throw new Error(String(payload.code ?? payload.error));
      return sanitizeSefazStatusResponse(payload, elapsed);
    },
  });
}
