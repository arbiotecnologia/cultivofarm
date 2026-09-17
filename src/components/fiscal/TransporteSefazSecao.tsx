/**
 * FASE H7f — Painel de transporte SEFAZ (HOMOLOGAÇÃO MG) na Central de Prontidão.
 *
 * Somente leitura: mostra ambiente, host permitido e as últimas transmissões
 * já sanitizadas pela RPC. Não expõe payload SOAP, certificado ou chave, e não
 * oferece nenhuma ação de emissão — o gate de transmissão é server-side.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isFiscallyAuthorized,
  useFiscalSefazTransmissions,
  type SefazTransmissionOutcome,
  type SefazTransmissionState,
} from "@/hooks/useFiscalSefazTransmissions";

// H7G-004: rótulo de transporte ≠ rótulo fiscal.
const STATE_LABEL: Record<SefazTransmissionState, string> = {
  PENDING: "Aguardando",
  SENT: "Enviado",
  SUCCEEDED: "Transporte concluído",
  FAILED: "Falhou",
  BLOCKED: "Bloqueado",
};

const OUTCOME_LABEL: Record<SefazTransmissionOutcome, string> = {
  PENDING: "Sem resultado",
  PROCESSING: "Em processamento",
  AUTHORIZED: "Autorizada",
  REJECTED: "Rejeitada",
  EVENT_REGISTERED: "Evento registrado",
  SERVICE_INFO: "Disponibilidade do serviço",
  TRANSPORT_ERROR: "Erro de transporte",
};

function stateVariant(state: SefazTransmissionState) {
  if (state === "SUCCEEDED") return "secondary" as const;
  if (state === "FAILED" || state === "BLOCKED") return "destructive" as const;
  return "secondary" as const;
}

function outcomeVariant(outcome: SefazTransmissionOutcome) {
  if (outcome === "AUTHORIZED" || outcome === "EVENT_REGISTERED") return "default" as const;
  if (outcome === "REJECTED" || outcome === "TRANSPORT_ERROR") return "destructive" as const;
  return "outline" as const;
}


export function TransporteSefazSecao({ invoiceId }: { invoiceId?: string | null }) {
  const { data, isLoading, isError } = useFiscalSefazTransmissions(invoiceId);
  const items = data?.items ?? [];

  return (
    <Card data-testid="fiscal-sefaz-transport">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Transporte SEFAZ</CardTitle>
            <CardDescription>
              Ambiente de homologação MG. A emissão em produção permanece
              bloqueada no servidor.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Homologação (tpAmb 2)</Badge>
            <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">
              Produção bloqueada
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Endpoint permitido: <span className="font-mono">hnfe.fazenda.mg.gov.br</span>
        </p>

        {isLoading && <Skeleton className="h-16 w-full" />}

        {isError && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o histórico de transporte agora.
          </p>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma transmissão registrada. O transporte só é liberado após o
            certificado A1 de homologação ser importado.
          </p>
        )}

        {items.length > 0 && (
          <ul className="space-y-2 text-sm">
            {items.slice(0, 10).map((t) => (
              <li
                key={t.transmissionId}
                className="flex flex-wrap items-start justify-between gap-3 rounded border p-2"
              >
                <div className="min-w-0">
                  <div className="font-medium">{t.service}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.cStat ? `cStat ${t.cStat}` : "sem retorno"}
                    {t.xMotivo ? ` — ${t.xMotivo}` : ""}
                  </div>
                  {t.nProt && (
                    <div className="text-xs text-muted-foreground">Protocolo {t.nProt}</div>
                  )}
                  {isFiscallyAuthorized(t) && (
                    <div className="text-xs text-muted-foreground">
                      Autorização fiscal confirmada pelo protocolo.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={outcomeVariant(t.outcome)}>{OUTCOME_LABEL[t.outcome]}</Badge>
                  <Badge variant={stateVariant(t.state)}>{STATE_LABEL[t.state]}</Badge>
                </div>

              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
