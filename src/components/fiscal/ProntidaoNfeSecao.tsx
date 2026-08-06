/**
 * Fase F3 — Seção somente leitura de prontidão NF-e 55.
 * Exibe emitente, destinatários, operações/CFOP, tributos e numeração,
 * com pendências acionáveis vindas do servidor.
 */
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Lock, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useFiscalNfeReadiness,
  type NfeReadinessPendency,
} from "@/hooks/useFiscalNfeReadiness";

const OVERALL_LABEL: Record<string, string> = {
  READY_HOMOLOGATION: "Pronto para homologação",
  PARTIAL: "Parcial — pendências não bloqueantes",
  NOT_READY: "Bloqueado — pendências obrigatórias",
};


const SECTION_LABEL: Record<string, string> = {
  EMITENTE: "Emitente",
  DESTINATARIOS: "Destinatários",
  OPERACOES: "Operações / CFOP",
  TRIBUTOS: "Tributos",
  CERTIFICADO: "Certificado digital",
  HOMOLOGACAO: "Homologação",
};

function Metric(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <p className="text-lg font-semibold">{props.value}</p>
      {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
    </div>
  );
}

export function ProntidaoNfeSecao() {
  const { data, isLoading, isError, error, refetch, isFetching } = useFiscalNfeReadiness();

  const { blocks, warns } = useMemo(() => {
    const list: NfeReadinessPendency[] = data?.pendencies ?? [];
    return {
      blocks: list.filter((p) => p.severity === "BLOCK"),
      warns: list.filter((p) => p.severity !== "BLOCK"),
    };
  }, [data]);

  return (
    <Card data-testid="fiscal-nfe-readiness-section">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Prontidão NF-e modelo 55
            {data ? (
              <Badge
                variant="outline"
                data-status={data.overallStatus}
                className={
                  data.overallStatus === "READY"
                    ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                    : data.overallStatus === "PARTIAL"
                      ? "border-amber-500/60 text-amber-700 dark:text-amber-300"
                      : "border-destructive/60 text-destructive"
                }
              >
                {data.overallStatus === "READY" ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden />
                ) : (
                  <Lock className="w-3 h-3 mr-1" aria-hidden />
                )}
                {OVERALL_LABEL[data.overallStatus] ?? data.overallStatus}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Emitente, destinatários, operações, tributos e numeração — apurados no servidor.
            Nenhum documento é transmitido nesta tela.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Recarregar prontidão NF-e"
        >
          <RefreshCcw className="w-4 h-4 mr-2" aria-hidden />
          Atualizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando prontidão…</p> : null}

        {isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" aria-hidden />
            <AlertTitle>Prontidão indisponível</AlertTitle>
            <AlertDescription>{(error as Error)?.message}</AlertDescription>
          </Alert>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                label="Emitente"
                value={data.emitter.status}
                hint={`CRT ${data.emitter.crt ?? "—"} · UF ${data.emitter.uf ?? "—"} · Série ${data.emitter.series ?? "—"} · Ambiente ${data.emitter.environment ?? "—"}`}
              />
              <Metric
                label="Certificado / validação contábil"
                value={`${data.emitter.certificateLinked ? "Vinculado" : "Ausente"} · ${data.emitter.accountingValidated ? "Validado" : "Pendente"}`}
              />
              <Metric
                label="Destinatários prontos"
                value={`${data.recipients.ready} / ${data.recipients.total}`}
              />
              <Metric
                label="Políticas de operação publicadas"
                value={String(data.operations.publishedPolicies)}
              />
              <Metric
                label="Regras tributárias publicadas"
                value={String(data.taxes.publishedRules)}
                hint={
                  data.taxes.missingMandatoryKinds.length > 0
                    ? `Faltam: ${data.taxes.missingMandatoryKinds.join(", ")}`
                    : "ICMS, PIS e COFINS cobertos"
                }
              />
              <Metric label="Séries ativas" value={String(data.numbering.activeSeries)} />
            </div>

            {blocks.length > 0 ? (
              <div className="space-y-2" data-testid="fiscal-nfe-blockers">
                <p className="text-sm font-medium">Pendências bloqueantes</p>
                <ul className="space-y-1">
                  {blocks.map((p) => (
                    <li key={`${p.section}-${p.code}`} className="text-sm flex gap-2">
                      <Lock className="w-4 h-4 mt-0.5 text-destructive shrink-0" aria-hidden />
                      <span>
                        <strong>{SECTION_LABEL[String(p.section)] ?? p.section ?? "Geral"}:</strong>{" "}
                        {p.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {warns.length > 0 ? (
              <div className="space-y-2" data-testid="fiscal-nfe-warnings">
                <p className="text-sm font-medium">Avisos</p>
                <ul className="space-y-1">
                  {warns.map((p) => (
                    <li key={`${p.section}-${p.code}`} className="text-sm flex gap-2">
                      <AlertTriangle
                        className="w-4 h-4 mt-0.5 text-amber-600 shrink-0"
                        aria-hidden
                      />
                      <span>{p.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Apurado em {data.generatedAt} · modelo {data.documentModel}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default ProntidaoNfeSecao;
