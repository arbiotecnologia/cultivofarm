/**
 * Fase F4 — Seção de geração, validação XSD e assinatura do XML da NF-e 55.
 *
 * Teto explícito: SIGNED. Nenhum botão transmite documento à SEFAZ.
 * Artefatos são imutáveis: cada correção gera uma nova versão de execução.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSignature,
  Lock,
  RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useDownloadFiscalXml,
  useFiscalXmlStatus,
  useGenerateFiscalXml,
  type FiscalXmlRun,
  type FiscalXmlState,
} from "@/hooks/useFiscalXmlEngine";

const STATE_LABEL: Record<FiscalXmlState, string> = {
  PREPARED: "Preparado",
  GENERATED: "XML gerado",
  XSD_VALIDATED: "Validado (XSD 4.00)",
  SIGNED: "Assinado (homologação)",
  FAILED: "Falhou",
};

// F4.1: fail-closed até que o bundle XSD oficial, o validador XSD 1.0 real,
// a Edge Function e o runtime harness estejam certificados no staging.
const F4_1_RUNTIME_CERTIFIED = false;

function StateBadge({ state }: { state: FiscalXmlState }) {
  const tone =
    state === "SIGNED"
      ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
      : state === "FAILED"
        ? "border-destructive/60 text-destructive"
        : "border-amber-500/60 text-amber-700 dark:text-amber-300";
  return (
    <Badge variant="outline" data-state={state} className={tone}>
      {state === "SIGNED" ? (
        <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden />
      ) : state === "FAILED" ? (
        <AlertTriangle className="w-3 h-3 mr-1" aria-hidden />
      ) : (
        <Lock className="w-3 h-3 mr-1" aria-hidden />
      )}
      {STATE_LABEL[state] ?? state}
    </Badge>
  );
}

function Hash({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="text-xs text-muted-foreground font-mono break-all">
      <span className="font-sans">{label}: </span>
      {value}
    </p>
  );
}

function RunCard({ run }: { run: FiscalXmlRun }) {
  const download = useDownloadFiscalXml();

  const open = async (artifact: "signed" | "unsigned") => {
    try {
      const url = await download.mutateAsync({ runId: run.runId, artifact });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Não foi possível abrir o arquivo", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-testid="fiscal-xml-run">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Execução v{run.runVersion}</span>
          <StateBadge state={run.state} />
          <Badge variant="secondary">Esquema {run.schemaVersion}</Badge>
          <Badge variant="secondary">tpAmb {run.environmentCode} (homologação)</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            type="button" size="sm" variant="outline"
            disabled={!run.hasUnsigned || download.isPending}
            onClick={() => open("unsigned")}
            data-testid="fiscal-xml-download-unsigned"
          >
            <Download className="w-4 h-4 mr-1" aria-hidden /> XML
          </Button>
          <Button
            type="button" size="sm" variant="outline"
            disabled={!run.hasSigned || download.isPending}
            onClick={() => open("signed")}
            data-testid="fiscal-xml-download-signed"
          >
            <FileSignature className="w-4 h-4 mr-1" aria-hidden /> XML assinado
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground font-mono break-all">Chave: {run.accessKey}</p>
      <Hash label="SHA-256 payload" value={run.payloadSha256} />
      <Hash label="SHA-256 XML" value={run.unsignedSha256} />
      <Hash label="SHA-256 assinado" value={run.signedSha256} />

      {run.signature?.certificateSubject ? (
        <p className="text-xs text-muted-foreground">
          Assinado por {run.signature.certificateSubject} · {run.signature.algorithm} · validade até{" "}
          {run.signature.certificateNotAfter?.slice(0, 10)}
        </p>
      ) : null}

      {run.state === "FAILED" ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>{run.errorCode ?? "Falha na execução"}</AlertTitle>
          <AlertDescription className="space-y-1">
            {(run.validation?.issues ?? []).slice(0, 8).map((i) => (
              <p key={`${i.path}-${i.code}`} className="text-xs font-mono">
                {i.path} — {i.code}: {i.message}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function GeracaoXmlNfeSecao({ invoiceId }: { invoiceId: string | null }) {
  const status = useFiscalXmlStatus(invoiceId);
  const generate = useGenerateFiscalXml();
  const [lastKey, setLastKey] = useState<string | null>(null);

  const latest = useMemo(() => status.data?.runs?.[0] ?? null, [status.data]);
  const canGenerate = F4_1_RUNTIME_CERTIFIED && !!invoiceId && !generate.isPending &&
    (!latest || latest.state === "SIGNED" || latest.state === "FAILED");

  const handleGenerate = async () => {
    if (!invoiceId) return;
    const key = `xml-${invoiceId}-${Date.now()}`;
    setLastKey(key);
    try {
      const res = await generate.mutateAsync({ invoiceId, idempotencyKey: key });
      if (res.state === "SIGNED") {
        toast.success("XML gerado, validado e assinado", {
          description: "Homologação apenas — nenhum documento foi transmitido.",
        });
      } else {
        toast.error(res.code ?? "Execução não concluída");
      }
    } catch (err) {
      toast.error("Falha ao gerar o XML", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      void status.refetch();
    }
  };

  return (
    <Card data-testid="fiscal-xml-section">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            XML NF-e 4.00 — bloqueado para certificação F4.1
            <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">
              <Lock className="w-3 h-3 mr-1" aria-hidden /> Teto: assinado
            </Badge>
          </CardTitle>
          <CardDescription>
            A emissão permanece desabilitada até a validação por XSD oficial real, a verificação
            criptográfica e o fluxo HTTP do staging concluírem o harness obrigatório. Nada é
            transmitido à SEFAZ.
          </CardDescription>
        </div>
        <Button
          type="button" variant="ghost" size="sm"
          onClick={() => void status.refetch()}
          disabled={status.isFetching}
          aria-label="Atualizar execuções"
        >
          <RefreshCcw className={status.isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} aria-hidden />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {!F4_1_RUNTIME_CERTIFIED ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Motor XML indisponível</AlertTitle>
            <AlertDescription>
              A validação anterior era apenas um precheck manual e não comprova conformidade XSD
              NF-e 4.00. A geração e a assinatura estão bloqueadas até a certificação F4.1.
            </AlertDescription>
          </Alert>
        ) : null}

        {!invoiceId ? (
          <Alert>
            <AlertTitle>Salve o rascunho primeiro</AlertTitle>
            <AlertDescription>
              A geração do XML exige documento salvo, tributos calculados e numeração reservada.
            </AlertDescription>
          </Alert>
        ) : null}

        {status.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Não foi possível carregar as execuções</AlertTitle>
            <AlertDescription>
              {status.error instanceof Error ? status.error.message : "Erro desconhecido"}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            data-testid="fiscal-xml-gerar"
          >
            <FileSignature className="w-4 h-4 mr-1" aria-hidden />
            {generate.isPending ? "Processando..." : "Geração bloqueada"}
          </Button>
          {lastKey ? (
            <span className="text-xs text-muted-foreground self-center font-mono">
              idempotência: {lastKey}
            </span>
          ) : null}
        </div>

        {(status.data?.runs ?? []).length === 0 && !status.isLoading ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução registrada para este documento.</p>
        ) : null}

        <div className="space-y-2">
          {(status.data?.runs ?? []).map((run) => (
            <RunCard key={run.runId} run={run} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default GeracaoXmlNfeSecao;
