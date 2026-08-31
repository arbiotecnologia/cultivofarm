/**
 * FASE H7k — Painel de preflight fiscal por campo.
 *
 * Mostra, agrupados por seção, os impedimentos estruturados devolvidos por
 * `rpc_fiscal_preflight_v1`, com o campo exato e a ação corretiva. Somente
 * leitura: nenhuma ação de emissão é oferecida aqui e o veredito é sempre o
 * do servidor. Produção fiscal permanece bloqueada no banco.
 */
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SECTION_LABEL,
  groupBySection,
  useFiscalPreflight,
  type PreflightFinding,
} from "@/hooks/useFiscalPreflight";

function FindingList({ findings, tone }: { findings: PreflightFinding[]; tone: "blocker" | "warning" }) {
  return (
    <ul className="space-y-2">
      {groupBySection(findings).map(([section, items]) => (
        <li key={`${tone}-${section}`} className="rounded border p-2">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={tone === "blocker" ? "destructive" : "outline"}>
              {SECTION_LABEL[section] ?? section}
            </Badge>
            <span className="text-xs text-muted-foreground">{items.length} pendência(s)</span>
          </div>
          <ul className="space-y-1">
            {items.map((f, i) => (
              <li key={`${f.code}-${f.field ?? "geral"}-${i}`} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {f.field ?? "geral"}
                  {typeof f.itemSequence === "number" ? ` · item ${f.itemSequence}` : ""}
                </span>
                <div>{f.message}</div>
                {f.action && <div className="text-xs text-muted-foreground">{f.action}</div>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function PreflightNfeSecao({ invoiceId }: { invoiceId: string | null }) {
  const { data, isLoading, isError, refetch, isFetching } = useFiscalPreflight(invoiceId);

  const blockers = data?.blockers ?? [];
  const warnings = data?.warnings ?? [];

  return (
    <Card data-testid="fiscal-preflight">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Preflight fiscal</CardTitle>
            <CardDescription>
              Conferência campo a campo antes de qualquer transmissão. O veredito
              é do servidor; a emissão em produção continua bloqueada.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Homologação (tpAmb 2)</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={!invoiceId || isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Revalidar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!invoiceId && (
          <p className="text-sm text-muted-foreground">
            Salve o rascunho para executar o preflight.
          </p>
        )}

        {invoiceId && isLoading && <Skeleton className="h-20 w-full" />}

        {invoiceId && isError && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Não foi possível executar o preflight agora.
          </p>
        )}

        {data && !isLoading && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {data.status === "READY" && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Pronto
                </Badge>
              )}
              {data.status === "READY_WITH_PREREQUISITES" && (
                <Badge variant="outline" className="gap-1 border-amber-500/60 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Pronto com pré-requisitos externos
                </Badge>
              )}
              {data.status === "BLOCKED" && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Bloqueado
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Itens R$ {Number(data.itemsTotal ?? 0).toFixed(2)} · Documento R${" "}
                {Number(data.documentTotal ?? 0).toFixed(2)} · tolerância R${" "}
                {Number(data.toleranceBRL ?? 0).toFixed(2)}
              </span>
            </div>

            {blockers.length > 0 && <FindingList findings={blockers} tone="blocker" />}

            {warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Pré-requisitos externos (não corrigíveis pelo sistema)
                </p>
                <FindingList findings={warnings} tone="warning" />
              </div>
            )}

            {blockers.length === 0 && warnings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma pendência detectada para este documento.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PreflightNfeSecao;
