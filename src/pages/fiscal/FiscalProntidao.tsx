/**
 * Fase Fiscal 3.7 — Central de Prontidão para Homologação (SOMENTE LEITURA).
 *
 * - Consome apenas as 5 views fiscais canônicas via hooks tipados.
 * - Nunca emite, transmite, cancela, inutiliza ou consulta documento externo.
 * - Nenhuma mutação, insert, update, delete, upsert, RPC ou functions.invoke.
 * - Gates externos permanecem PENDENTES até evidência real (fora daqui).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useFiscalReadiness,
  safeErrorMessage,
  type AggregateResult,
  type DocumentsBreakdown,
} from "@/hooks/useFiscalReadiness";
import {
  BLOCK_STATUS_LABEL,
  DOCUMENT_MODELS,
  EXTERNAL_GATES,
  SAFE_ENVIRONMENTS,
  classifyAggregate,
  classifyCompany,
  classifyReconciliation,
  labelForStatus,
  percent,
  prioritizeBlockers,
  type BlockStatus,
  type Blocker,
  type CompanyRow,
} from "@/lib/fiscal/readinessValidation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CatalogoFiscalCobertura } from "@/components/fiscal/CatalogoFiscalCobertura";
import { ProntidaoNfeSecao } from "@/components/fiscal/ProntidaoNfeSecao";
import { TransporteSefazSecao } from "@/components/fiscal/TransporteSefazSecao";
import {
  AlertTriangle, CheckCircle2, HelpCircle, Lock, RefreshCcw, ShieldOff,
} from "lucide-react";

const ROUTE = "/fiscal/prontidao";

function StatusBadge(props: { status: BlockStatus }) {
  const map: Record<BlockStatus, { icon: JSX.Element; className: string }> = {
    pronto: {
      icon: <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden />,
      className: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
    },
    atencao: {
      icon: <AlertTriangle className="w-3 h-3 mr-1" aria-hidden />,
      className: "border-amber-500/60 text-amber-700 dark:text-amber-300",
    },
    bloqueado: {
      icon: <Lock className="w-3 h-3 mr-1" aria-hidden />,
      className: "border-destructive/60 text-destructive",
    },
    nao_verificado: {
      icon: <HelpCircle className="w-3 h-3 mr-1" aria-hidden />,
      className: "border-muted-foreground/40 text-muted-foreground",
    },
  };
  const { icon, className } = map[props.status];
  return (
    <Badge
      variant="outline"
      className={className}
      aria-label={`Status: ${BLOCK_STATUS_LABEL[props.status]}`}
      data-status={props.status}
    >
      {icon}
      {BLOCK_STATUS_LABEL[props.status]}
    </Badge>
  );
}

function Banner() {
  return (
    <Alert data-testid="fiscal-readiness-banner">
      <ShieldOff className="h-4 w-4" aria-hidden />
      <AlertTitle>HOMOLOGAÇÃO — SEM VALOR FISCAL</AlertTitle>
      <AlertDescription>
        Preparação para homologação com emissão desativada. Esta central é
        somente leitura: nenhuma ação transmite, autoriza, cancela, inutiliza
        ou consulta documento fiscal externo.
      </AlertDescription>
    </Alert>
  );
}

interface BlockShellProps {
  title: string;
  description: string;
  status: BlockStatus;
  loading: boolean;
  error: unknown;
  empty: boolean;
  linkTo?: string;
  linkLabel?: string;
  canFollowLink: boolean;
  testId: string;
  children: React.ReactNode;
}

function BlockShell(props: BlockShellProps) {
  return (
    <Card data-testid={props.testId}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{props.title}</CardTitle>
            <CardDescription>{props.description}</CardDescription>
          </div>
          <StatusBadge status={props.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Carregando…
          </p>
        )}
        {!!props.error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Não verificado</AlertTitle>
            <AlertDescription className="text-xs">
              {safeErrorMessage(props.error)}
            </AlertDescription>
          </Alert>
        )}
        {!props.loading && !props.error && props.empty && (
          <p className="text-sm text-muted-foreground">
            Sem dados suficientes para avaliar. Marcado como “Não verificado”.
          </p>
        )}
        {!props.loading && !props.error && !props.empty && props.children}
        {props.linkTo && props.linkLabel && (
          <div className="pt-1">
            {props.canFollowLink ? (
              <Link
                to={props.linkTo}
                className="text-xs underline underline-offset-2 text-primary"
                aria-label={props.linkLabel}
              >
                {props.linkLabel}
              </Link>
            ) : (
              <span
                className="text-xs text-muted-foreground"
                aria-label={`${props.linkLabel} — indisponível para o perfil`}
              >
                {props.linkLabel} · indisponível para o perfil
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompanyDetails(props: { row: CompanyRow }) {
  const { row } = props;
  const envSafe = row.fiscal_environment === null
    ? null
    : SAFE_ENVIRONMENTS.has(row.fiscal_environment);
  return (
    <dl className="grid grid-cols-2 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Configuração</dt>
      <dd>{labelForStatus(row.configuration_status)}</dd>
      <dt className="text-muted-foreground">Ambiente</dt>
      <dd>
        {labelForStatus(row.fiscal_environment)}
        {envSafe === false && (
          <Badge variant="destructive" className="ml-2">Ambiente produtivo</Badge>
        )}
      </dd>
      <dt className="text-muted-foreground">NF-e habilitada (config.)</dt>
      <dd>{row.nfe_enabled === null ? "Não verificado" : row.nfe_enabled ? "Sim" : "Não"}</dd>
      <dt className="text-muted-foreground">NFS-e habilitada (config.)</dt>
      <dd>{row.nfse_enabled === null ? "Não verificado" : row.nfse_enabled ? "Sim" : "Não"}</dd>
      <dt className="text-muted-foreground">Contabilidade validada</dt>
      <dd>{row.accounting_validated === null ? "Não verificado" : row.accounting_validated ? "Sim" : "Não"}</dd>
      <dt className="text-muted-foreground">Preenchimento</dt>
      <dd>
        {row.filled_score !== null && row.max_score !== null
          ? `${row.filled_score}/${row.max_score}`
          : "Não verificado"}
      </dd>
    </dl>
  );
}

function AggregateDetails(props: {
  agg: AggregateResult;
  okLabel: string;
  pendingLabel: string;
}) {
  const p = percent(props.agg.ok, props.agg.total);
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <Metric label="Total" value={String(props.agg.total)} />
      <Metric label={props.okLabel} value={String(props.agg.ok)} />
      <Metric
        label={props.pendingLabel}
        value={String(props.agg.pending)}
        emphasize={props.agg.pending > 0}
      />
      <div className="col-span-3 text-xs text-muted-foreground" aria-live="polite">
        {p === null ? "Percentual não verificado." : `Preparação: ${p}%.`}
      </div>
    </div>
  );
}

function DocumentsDetails(props: { data: DocumentsBreakdown }) {
  return (
    <div className="space-y-2 text-sm">
      <Metric label="Pendências (total)" value={String(props.data.total)} emphasize={props.data.total > 0} />
      <ul className="grid grid-cols-2 gap-1 text-xs">
        {DOCUMENT_MODELS.map((m) => (
          <li key={m} className="flex justify-between border-b border-dashed py-1">
            <span className="text-muted-foreground">{m}</span>
            <span>{props.data.byModel[m]}</span>
          </li>
        ))}
        <li className="flex justify-between border-b border-dashed py-1">
          <span className="text-muted-foreground">Sem modelo</span>
          <span>{props.data.byModel.UNKNOWN}</span>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Antiguidade não é exposta pela view canônica. Marcada como
        “Não verificado”.
      </p>
    </div>
  );
}

function Metric(props: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {props.label}
      </div>
      <div className={props.emphasize ? "text-lg font-semibold text-amber-700 dark:text-amber-300" : "text-lg font-semibold"}>
        {props.value}
      </div>
    </div>
  );
}

export default function FiscalProntidao() {
  const { role } = useAuth();
  const access = getAccessLevel(role, ROUTE);
  const flagOn = FEATURE_FLAGS.fiscalReadinessCenterUi === true;
  const {
    company, products, services, customers, documents,
  } = useFiscalReadiness();

  const now = new Date();
  const lastUpdate = useMemo(() => {
    const stamps = [
      company.dataUpdatedAt,
      products.dataUpdatedAt,
      services.dataUpdatedAt,
      customers.dataUpdatedAt,
      documents.dataUpdatedAt,
    ].filter((v): v is number => typeof v === "number" && v > 0);
    if (stamps.length === 0) return null;
    return new Date(Math.max(...stamps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    company.dataUpdatedAt, products.dataUpdatedAt, services.dataUpdatedAt,
    customers.dataUpdatedAt, documents.dataUpdatedAt,
  ]);

  const canFollowConfigProd = getAccessLevel(role, "/configuracoes/fiscal/produtos") !== "none";
  const canFollowConfigSvc = getAccessLevel(role, "/configuracoes/fiscal/servicos") !== "none";
  const canFollowConfigCli = getAccessLevel(role, "/configuracoes/fiscal/clientes") !== "none";
  const canFollowRecon = getAccessLevel(role, "/fiscal/reconciliacao") !== "none";
  const canFollowEmpresa = getAccessLevel(role, "/configuracoes/fiscal/empresa") !== "none";

  const companyStatus = classifyCompany(company.data ?? null);
  const productsStatus: BlockStatus = products.data
    ? classifyAggregate({ total: products.data.total, ok: products.data.ok, pending: products.data.pending })
    : "nao_verificado";
  const servicesStatus: BlockStatus = services.data
    ? classifyAggregate({ total: services.data.total, ok: services.data.ok, pending: services.data.pending })
    : "nao_verificado";
  const customersStatus: BlockStatus = customers.data
    ? classifyAggregate({ total: customers.data.total, ok: customers.data.ok, pending: customers.data.pending })
    : "nao_verificado";
  const documentsStatus = classifyReconciliation(documents.data?.total ?? null);

  const blockers: Blocker[] = useMemo(() => {
    const items: Blocker[] = [];
    if (companyStatus === "bloqueado") {
      items.push({
        block: "empresa",
        severity: "bloqueado",
        message: "Empresa marcada como produção antes da homologação.",
      });
    } else if (companyStatus === "atencao") {
      items.push({
        block: "empresa",
        severity: "atencao",
        message: "Configuração da empresa incompleta ou em revisão.",
      });
    } else if (companyStatus === "nao_verificado") {
      items.push({
        block: "empresa",
        severity: "nao_verificado",
        message: "Configuração da empresa ainda não verificada.",
      });
    }
    if (products.data && products.data.pending > 0) {
      items.push({
        block: "produtos",
        severity: "atencao",
        message: `${products.data.pending} produto(s) sem classificação ou validação mínima.`,
      });
    }
    if (services.data && services.data.pending > 0) {
      items.push({
        block: "servicos",
        severity: "atencao",
        message: `${services.data.pending} serviço(s) com referência incompleta.`,
      });
    }
    if (customers.data && customers.data.pending > 0) {
      items.push({
        block: "clientes",
        severity: "atencao",
        message: `${customers.data.pending} cliente(s) sem IBGE preenchido.`,
      });
    }
    if (documents.data && documents.data.total > 0) {
      items.push({
        block: "documentos",
        severity: "atencao",
        message: `${documents.data.total} documento(s) pendentes de reconciliação.`,
      });
    }
    return prioritizeBlockers(items);
  }, [
    companyStatus, products.data, services.data, customers.data, documents.data,
  ]);

  const refreshAll = () => {
    company.refetch(); products.refetch(); services.refetch();
    customers.refetch(); documents.refetch();
  };

  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-readiness-forbidden">
        <Alert variant="destructive">
          <AlertTitle>Acesso negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar a Central de Prontidão.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="p-6 space-y-4" data-testid="fiscal-readiness-preparation">
        <Banner />
        <Card>
          <CardHeader>
            <CardTitle>Central de Prontidão — Preparação</CardTitle>
            <CardDescription>
              Rota isolada. Ativação depende da flag
              <code className="mx-1">fiscalReadinessCenterUi</code>. Nesta fase
              nenhuma consulta é executada.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Central lê apenas as 5 views fiscais canônicas via contagens
            agregadas. Não executa mutações, nem chama RPC/Edge Functions.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="fiscal-readiness-root">
      <Banner />
      <ProntidaoNfeSecao />
      <TransporteSefazSecao />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Central de Prontidão Fiscal</h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Última atualização:{" "}
            {lastUpdate ? lastUpdate.toLocaleString("pt-BR") : "não verificada"}
            {" · Consulta em "}{now.toLocaleDateString("pt-BR")}
          </p>
        </div>
        <Button
          variant="outline" size="sm" onClick={refreshAll}
          data-testid="fiscal-readiness-refresh"
          aria-label="Atualizar consultas somente leitura"
        >
          <RefreshCcw className="w-4 h-4 mr-1" aria-hidden />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <BlockShell
          title="Empresa"
          description="Configuração fiscal e ambiente da empresa."
          status={companyStatus}
          loading={company.isLoading}
          error={company.error}
          empty={!company.isLoading && !company.error && company.data === null}
          linkTo="/configuracoes/fiscal/empresa"
          linkLabel="Abrir configuração da empresa"
          canFollowLink={canFollowEmpresa}
          testId="fiscal-readiness-empresa"
        >
          {company.data && <CompanyDetails row={company.data} />}
        </BlockShell>

        <BlockShell
          title="Produtos"
          description="Classificação mínima e validação contábil."
          status={productsStatus}
          loading={products.isLoading}
          error={products.error}
          empty={!products.isLoading && !products.error && !products.data}
          linkTo="/configuracoes/fiscal/produtos"
          linkLabel="Abrir perfis fiscais de produtos"
          canFollowLink={canFollowConfigProd}
          testId="fiscal-readiness-produtos"
        >
          {products.data && (
            <AggregateDetails agg={products.data} okLabel="Ok" pendingLabel="Pendentes" />
          )}
        </BlockShell>

        <BlockShell
          title="Serviços"
          description="Referências e validação contábil."
          status={servicesStatus}
          loading={services.isLoading}
          error={services.error}
          empty={!services.isLoading && !services.error && !services.data}
          linkTo="/configuracoes/fiscal/servicos"
          linkLabel="Abrir perfis fiscais de serviços"
          canFollowLink={canFollowConfigSvc}
          testId="fiscal-readiness-servicos"
        >
          {services.data && (
            <AggregateDetails agg={services.data} okLabel="Ok" pendingLabel="Pendentes" />
          )}
        </BlockShell>

        <BlockShell
          title="Clientes"
          description="Cobertura de município (IBGE)."
          status={customersStatus}
          loading={customers.isLoading}
          error={customers.error}
          empty={!customers.isLoading && !customers.error && !customers.data}
          linkTo="/configuracoes/fiscal/clientes"
          linkLabel="Abrir perfis fiscais de clientes"
          canFollowLink={canFollowConfigCli}
          testId="fiscal-readiness-clientes"
        >
          {customers.data && (
            <AggregateDetails agg={customers.data} okLabel="Com IBGE" pendingLabel="Sem IBGE" />
          )}
        </BlockShell>

        <BlockShell
          title="Documentos e reconciliação"
          description="Pendências por modelo. Antiguidade não exposta pela view."
          status={documentsStatus}
          loading={documents.isLoading}
          error={documents.error}
          empty={!documents.isLoading && !documents.error && !documents.data}
          linkTo="/fiscal/reconciliacao"
          linkLabel="Abrir fila de reconciliação"
          canFollowLink={canFollowRecon}
          testId="fiscal-readiness-documentos"
        >
          {documents.data && <DocumentsDetails data={documents.data} />}
        </BlockShell>
      </div>

      <CatalogoFiscalCobertura />

      <Card data-testid="fiscal-readiness-blockers">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bloqueios priorizados</CardTitle>
          <CardDescription>
            Derivados exclusivamente das views. Nenhuma correção é aplicada
            a partir desta tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blockers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum bloqueio identificado nas consultas disponíveis.
            </p>
          ) : (
            <ol className="space-y-2 text-sm">
              {blockers.map((b, i) => (
                <li
                  key={`${b.block}-${i}`}
                  className="flex items-start justify-between gap-3 border rounded p-2"
                >
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {b.block}
                    </div>
                    <div>{b.message}</div>
                  </div>
                  <StatusBadge status={b.severity} />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card data-testid="fiscal-readiness-external-gates">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gates externos</CardTitle>
          <CardDescription>
            Todos permanecem PENDENTES até evidência real registrada fora
            deste app. Nenhum teste estático os aprova.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {EXTERNAL_GATES.map((g) => (
              <li key={g.key} className="border rounded p-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{g.label}</div>
                  <div className="text-xs text-muted-foreground">{g.detail}</div>
                </div>
                <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">
                  Pendente
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
