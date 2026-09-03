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
import { useMutation } from "@tanstack/react-query";
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

export function useSefazStatusSmoke() {
  return useMutation<SefazStatusView, Error, void>({
    mutationKey: ["fiscal", "smoke", "sefaz-status"],
    mutationFn: async () => {
      const started = Date.now();
      const { data, error } = await supabase.functions.invoke("fiscal-sefaz-transport", {
        body: { action: "status", idempotency_key: smokeIdempotencyKey() },
      });
      const elapsed = Date.now() - started;
      if (error) throw new Error(error.message);
      const payload = (data ?? {}) as Record<string, unknown>;
      if (payload.error) throw new Error(String(payload.code ?? payload.error));
      return sanitizeSefazStatusResponse(payload, elapsed);
    },
  });
}
