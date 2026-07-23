/**
 * Fase H4-A — "Campos faltantes da Empresa" na Central de Homologação.
 *
 * Somente leitura. Deriva pendências client-side a partir do singleton
 * `company_fiscal_settings` já lido por `useFiscalCompanySettings`.
 * Cada item leva ao formulário na aba correta via deep-link.
 * Não emite, não persiste, não inventa alíquotas.
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2 } from "lucide-react";
import { useFiscalCompanySettings } from "@/hooks/useFiscalCompanySettings";
import {
  computeCompanyMissingFields,
  SECTION_LABEL,
  type MissingField,
  type MissingSection,
} from "@/lib/fiscal/companyMissingFields";

const ORDER: MissingSection[] = ["empresa", "endereco", "nfe", "nfse"];

function SeverityBadge({ severity }: { severity: MissingField["severity"] }) {
  if (severity === "bloqueia_homologacao") {
    return <Badge variant="destructive">Bloqueia homologação</Badge>;
  }
  return <Badge variant="secondary">Recomendado</Badge>;
}

export default function CamposFaltantesEmpresa() {
  const q = useFiscalCompanySettings();

  if (q.isLoading) {
    return (
      <Card data-testid="fiscal-empresa-missing-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Campos faltantes — Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando pendências…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Alert variant="destructive" data-testid="fiscal-empresa-missing-error">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>Não foi possível verificar as pendências</AlertTitle>
        <AlertDescription className="text-xs">
          Tente novamente em instantes. Nenhuma informação sensível é exibida.
        </AlertDescription>
      </Alert>
    );
  }

  const row = q.data ?? null;
  const result = computeCompanyMissingFields(row);

  if (row === null) {
    return (
      <Card data-testid="fiscal-empresa-missing-not-started">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Campos faltantes — Empresa</CardTitle>
              <CardDescription>Configuração fiscal ainda não iniciada.</CardDescription>
            </div>
            <Badge variant="outline">Não iniciado</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Alert>
            <Info className="h-4 w-4" aria-hidden />
            <AlertTitle>Comece pelo cadastro da empresa</AlertTitle>
            <AlertDescription className="text-xs">
              Nenhum dado fiscal foi presumido. Preencha o que já souber; a homologação
              só será liberada quando todos os campos bloqueantes estiverem preenchidos.
            </AlertDescription>
          </Alert>
          <Link
            to="/configuracoes/fiscal/empresa?aba=empresa"
            className="text-xs underline underline-offset-2 text-primary"
          >
            Abrir configuração da empresa
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="fiscal-empresa-missing">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Campos faltantes — Empresa</CardTitle>
            <CardDescription>
              {result.blocking > 0
                ? `${result.blocking} campo(s) bloqueiam a homologação`
                : result.recommended > 0
                  ? "Sem bloqueios; itens recomendados listados abaixo"
                  : "Nenhuma pendência identificada nesta empresa"}
            </CardDescription>
          </div>
          {result.blocking > 0 ? (
            <Badge variant="destructive" data-testid="fiscal-empresa-missing-badge">
              {result.blocking} bloqueante(s)
            </Badge>
          ) : (
            <Badge variant="default">
              <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden /> Requisitos mínimos ok
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ORDER.map((section) => {
          const items = result.bySection[section];
          const isNa = result.notApplicable.includes(section);
          if (items.length === 0 && !isNa) return null;

          return (
            <div key={section} className="rounded-md border p-3" data-testid={`fiscal-empresa-missing-${section}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-medium">{SECTION_LABEL[section]}</div>
                {isNa ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    <CircleDashed className="h-3 w-3 mr-1" aria-hidden /> Não aplicável
                  </Badge>
                ) : (
                  <Badge variant="secondary">{items.length} pendência(s)</Badge>
                )}
              </div>
              {isNa ? (
                <p className="text-xs text-muted-foreground">
                  {section === "nfe"
                    ? "NF-e desativada nesta configuração. Ative na aba NF-e para exigir os campos correspondentes."
                    : "NFS-e desativada nesta configuração. Ative na aba NFS-e para exigir os campos correspondentes."}
                </p>
              ) : (
                <ul className="space-y-1 text-sm" role="list">
                  {items.map((it) => (
                    <li key={it.key} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{it.label}</span>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={it.severity} />
                        <Link
                          to={it.deepLink}
                          className="text-xs underline underline-offset-2 text-primary"
                          aria-label={`Ir para preencher ${it.label}`}
                        >
                          preencher
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {result.total === 0 && result.notApplicable.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Todos os requisitos mínimos e recomendados foram preenchidos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
