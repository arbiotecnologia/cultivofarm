/**
 * Fase Fiscal 3.17 — Central de Homologação (somente leitura).
 *
 * Consome `rpc_fiscal_homologation_readiness` e apresenta o resultado em
 * pt-BR. Sem qualquer ação de emissão/transmissão/autorização/produção.
 * Sem exposição de material sensível (chaves, tokens, object_path, SQL).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFiscalHomologationReadiness } from "@/hooks/useFiscalHomologationReadiness";
import {
  OVERALL_STATUS_LABEL_PTBR,
  STATUS_LABEL_PTBR,
  type ReadinessChecklistItem,
  type ReadinessItemStatus,
  type ReadinessOverallStatus,
} from "@/lib/fiscal/homologationReadiness";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CamposFaltantesEmpresa from "./CamposFaltantesEmpresa";
import SmokesHomologacaoSecao from "./SmokesHomologacaoSecao";
import NfeIbsCbsPreviewSecao from "./NfeIbsCbsPreviewSecao";
import ProntidaoConexoesSecao from "./ProntidaoConexoesSecao";
import CertificadoValidadeBanner from "@/components/fiscal/certificados/CertificadoValidadeBanner";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Info,
  Loader2,
  RefreshCw,
  ShieldOff,
} from "lucide-react";

interface Props {
  companySettingsId: string | null;
}

const ALLOWED_ROLES = ["administrador", "gestor", "financeiro"] as const;

function StatusBadge({ status }: { status: ReadinessOverallStatus }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "READY" ? "default"
    : status === "BLOCKED" ? "destructive"
    : status === "UNAVAILABLE" ? "outline"
    : "secondary";
  return (
    <Badge variant={variant} data-testid="fiscal-homologacao-status">
      {OVERALL_STATUS_LABEL_PTBR[status]}
    </Badge>
  );
}

function ItemIcon({ status }: { status: ReadinessItemStatus }) {
  if (status === "READY") return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (status === "BLOCKED") return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />;
  if (status === "UNAVAILABLE") return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />;
  if (status === "NOT_CONFIGURED") return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />;
  return <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden />;
}

export default function HomologacaoSecao({ companySettingsId }: Props) {
  const { roles } = useAuth();
  const allowed = useMemo(
    () => Array.isArray(roles) && roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r)),
    [roles],
  );

  const query = useFiscalHomologationReadiness({ enabled: allowed });

  if (!allowed) {
    return (
      <Alert variant="destructive" data-testid="fiscal-homologacao-forbidden">
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>Sem permissão</AlertTitle>
        <AlertDescription>
          A homologação fiscal é visível apenas para administrador, gestor ou financeiro.
        </AlertDescription>
      </Alert>
    );
  }

  const isLoading = query.isLoading;
  const isRefetching = query.isFetching && !query.isLoading;

  const raw = query.data;
  const unavailable = raw && "unavailable" in raw ? raw.unavailable : null;
  const data = raw && !("unavailable" in raw) ? raw : null;

  return (
    <div className="space-y-4" data-testid="fiscal-homologacao-secao">
      <Alert>
        <Info className="h-4 w-4" aria-hidden />
        <AlertTitle>Homologação fiscal — verificação interna</AlertTitle>
        <AlertDescription className="text-xs">
          Esta tela apenas consulta o estado atual. Nenhuma nota é emitida, transmitida ou autorizada aqui.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Estado da homologação</CardTitle>
              <CardDescription>
                Ambiente: <strong>{data?.environment_label ?? "Indisponível"}</strong>
                {data ? (
                  <> · Produção: <strong>{data.production_enabled ? "Habilitada" : "Desabilitada"}</strong></>
                ) : null}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {data ? <StatusBadge status={data.status} /> : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
                disabled={isLoading || isRefetching}
                data-testid="fiscal-homologacao-refresh"
              >
                {isRefetching ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />Atualizando…</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" aria-hidden />Atualizar verificação</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando prontidão…
            </div>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Não foi possível carregar a verificação</AlertTitle>
              <AlertDescription className="text-xs">
                Tente novamente em instantes. Nenhuma informação sensível é exibida por esta tela.
              </AlertDescription>
            </Alert>
          ) : unavailable ? (
            <Alert>
              <CircleDashed className="h-4 w-4" aria-hidden />
              <AlertTitle>Verificação indisponível</AlertTitle>
              <AlertDescription className="text-xs">{unavailable}</AlertDescription>
            </Alert>
          ) : !data ? (
            <Alert>
              <Info className="h-4 w-4" aria-hidden />
              <AlertTitle>Sem dados de prontidão</AlertTitle>
              <AlertDescription className="text-xs">
                Preencha a configuração fiscal para iniciar a verificação.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <ul className="space-y-2 text-sm" data-testid="fiscal-homologacao-checklist">
                {data.checklist.map((item: ReadinessChecklistItem) => (
                  <li
                    key={item.key}
                    className="flex items-start justify-between gap-3 rounded-md border p-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <ItemIcon status={item.status} />
                      <div>
                        <div className="font-medium">{item.label}</div>
                        {typeof item.count === "number" ? (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {item.count} registro(s)
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Badge
                      variant={
                        item.status === "READY" ? "default"
                        : item.status === "BLOCKED" ? "destructive"
                        : item.status === "UNAVAILABLE" ? "outline"
                        : "secondary"
                      }
                    >
                      {STATUS_LABEL_PTBR[item.status]}
                    </Badge>
                  </li>
                ))}
              </ul>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Rascunhos</div>
                  <div className="text-lg font-semibold tabular-nums">{data.counts.drafts_total}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Prontos</div>
                  <div className="text-lg font-semibold tabular-nums">{data.counts.drafts_ready}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Incompletos</div>
                  <div className="text-lg font-semibold tabular-nums">{data.counts.drafts_incomplete}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Bloqueados</div>
                  <div className="text-lg font-semibold tabular-nums">{data.counts.drafts_blocked}</div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CertificadoValidadeBanner companySettingsId={companySettingsId} showAllStates />

      <ProntidaoConexoesSecao companySettingsId={companySettingsId} />

      <CamposFaltantesEmpresa />

      <SmokesHomologacaoSecao companySettingsId={companySettingsId} />
      <NfeIbsCbsPreviewSecao />



      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ir para ajustes</CardTitle>
          <CardDescription>
            Ajuste os itens pendentes nas telas responsáveis. As ações respeitam suas permissões.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/configuracoes/fiscal/empresa" data-testid="fiscal-homologacao-go-empresa">
              Ir para Empresa
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/configuracoes/fiscal/produtos" data-testid="fiscal-homologacao-go-produtos">
              Ir para Produtos
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/configuracoes/fiscal/servicos" data-testid="fiscal-homologacao-go-servicos">
              Ir para Serviços
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/configuracoes/fiscal/clientes" data-testid="fiscal-homologacao-go-clientes">
              Ir para Clientes
            </Link>
          </Button>
          {companySettingsId ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/configuracoes/fiscal/empresa?aba=certificado#certificado-a1" data-testid="fiscal-homologacao-go-cert">
                Ir para Certificado Digital
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to="/fiscal/documentos" data-testid="fiscal-homologacao-criar-rascunho">
              Criar rascunho
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
