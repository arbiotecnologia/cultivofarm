import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FISCAL_CONFIGURATION_STATUS,
  FISCAL_ENVIRONMENT,
  FISCAL_PROVIDER,
} from "@/lib/fiscal/labels";
import { Info } from "lucide-react";

/**
 * Banner de prontidão fiscal.
 * Fase Fiscal 2: apenas leitura das views internas de prontidão.
 * Nenhum serviço fiscal externo é chamado.
 */
export function FiscalReadinessBanner() {
  const { data: company } = useQuery({
    queryKey: ["fiscal-readiness-company"],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_fiscal_company_readiness" as any)
        .select("*")
        .maybeSingle();
      return data as any;
    },
  });

  const pendingScore = company
    ? Math.max(0, (company.max_score ?? 0) - (company.filled_score ?? 0))
    : null;

  return (
    <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
      <Info className="h-4 w-4" />
      <AlertTitle>Emissão integrada ainda não habilitada.</AlertTitle>
      <AlertDescription className="text-xs mt-1 space-y-0.5">
        <div>
          Este módulo registra documentos fiscais manualmente. A emissão de
          NF-e e NFS-e via provedor não está ativa.
        </div>
        {company && (
          <div className="opacity-80">
            Configuração fiscal da empresa: <strong>{FISCAL_CONFIGURATION_STATUS.label(company.configuration_status)}</strong>
            {" · "}Ambiente: <strong>{FISCAL_ENVIRONMENT.label(company.fiscal_environment)}</strong>
            {" · "}Provedor: <strong>{FISCAL_PROVIDER.label(company.fiscal_provider)}</strong>
            {pendingScore !== null && pendingScore > 0 && (
              <> {" · "}Campos fiscais pendentes: <strong>{pendingScore}</strong>/{company.max_score}</>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
