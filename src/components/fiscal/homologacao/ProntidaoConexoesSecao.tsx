/**
 * Fase H5-A — Seção "Prontidão das conexões" (somente leitura).
 *
 * Renderiza os 8 itens calculados por `computeConnectionsReadiness` com
 * deep-link canônico. Nunca renderiza segredo (token, senha, PFX,
 * fingerprint bruto). Produção permanece desabilitada e claramente
 * sinalizada como "não pode ser ativada" enquanto a prontidão não estiver
 * completa e o teste de conexão futuro não for aprovado.
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldOff, ArrowRight, CircleDashed, CircleAlert, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useFiscalCompanySettings } from "@/hooks/useFiscalCompanySettings";
import { useFiscalCertificates } from "@/hooks/useFiscalCertificates";
import {
  computeConnectionsReadiness,
  CONNECTION_STATUS_LABEL_PTBR,
  type ConnectionItemStatus,
} from "@/lib/fiscal/connectionsReadiness";

interface Props {
  companySettingsId: string | null;
}

function StatusIcon({ status }: { status: ConnectionItemStatus }) {
  if (status === "ready_to_test" || status === "filled_untested") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  }
  if (status === "blocked") return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />;
  if (status === "not_applicable" || status === "not_started") {
    return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />;
  }
  return <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden />;
}

function badgeVariantFor(status: ConnectionItemStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "blocked") return "destructive";
  if (status === "ready_to_test" || status === "filled_untested") return "default";
  if (status === "not_applicable" || status === "not_started") return "outline";
  return "secondary";
}

export default function ProntidaoConexoesSecao({ companySettingsId }: Props) {
  const company = useFiscalCompanySettings();
  const certs = useFiscalCertificates(companySettingsId);

  if (company.isLoading) {
    return (
      <Card data-testid="fiscal-prontidao-conexoes">
        <CardHeader>
          <CardTitle className="text-base">Prontidão das conexões</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando prontidão…
        </CardContent>
      </Card>
    );
  }

  if (company.isError) {
    return (
      <Alert variant="destructive" data-testid="fiscal-prontidao-conexoes-error">
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>Não foi possível carregar as conexões</AlertTitle>
        <AlertDescription className="text-xs">
          Tente novamente em instantes. Nenhuma informação sensível é exibida por esta tela.
        </AlertDescription>
      </Alert>
    );
  }

  const row = company.data ?? null;
  const list = certs.data ?? [];
  const readiness = computeConnectionsReadiness(row, list);

  return (
    <Card data-testid="fiscal-prontidao-conexoes">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prontidão das conexões</CardTitle>
        <CardDescription>
          Visão somente leitura por item. Nenhum segredo é exibido; credenciais
          seguem em referência configurada no servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm" data-testid="fiscal-prontidao-conexoes-lista">
          {readiness.items.map((item) => (
            <li
              key={item.key}
              className="flex items-start justify-between gap-3 rounded-md border p-2.5"
              data-testid={`fiscal-conexao-item-${item.key}`}
              data-status={item.status}
            >
              <div className="flex items-start gap-2">
                <StatusIcon status={item.status} />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={badgeVariantFor(item.status)}>
                  {CONNECTION_STATUS_LABEL_PTBR[item.status]}
                </Badge>
                <Link
                  to={item.deepLink}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid={`fiscal-conexao-link-${item.key}`}
                >
                  Abrir <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>

        <Alert data-testid="fiscal-prontidao-conexoes-producao">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Produção desabilitada</AlertTitle>
          <AlertDescription className="text-xs">
            {readiness.prerequisitesReadyForFutureProduction
              ? "Pré-requisitos preenchidos. A produção continua desabilitada e depende de homologação bem-sucedida, credenciais/certificado válidos e autorização humana explícita em fase futura."
              : "Complete os itens acima. Produção permanece desabilitada e só poderá ser considerada após homologação, teste de conexão e autorização humana explícita."}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
