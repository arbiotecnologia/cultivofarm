/**
 * Fase Fiscal 3.1 — Tela de Configuração Fiscal da Empresa.
 *
 * - Somente configuração INTERNA. Não emite, não integra provedor, não coleta
 *   certificado/senha/token.
 * - Feature flag `fiscalConfigurationUi` protege o conteúdo. Com flag OFF,
 *   a tela exibe estado "Módulo fiscal em preparação" — sem formulário.
 * - Guarda de rota (RoleGuard + ACCESS_MAP) já bloqueia URL direta para
 *   perfis não autorizados; esta tela adiciona a trava de leitura vs escrita.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useFiscalCompanySettings,
  useUpdateFiscalCompanySettings,
  computeReadiness,
} from "@/hooks/useFiscalCompanySettings";
import {
  companyFiscalFormSchema,
  rowToFormValues,
  ALLOWED_ENVIRONMENTS,
  ALLOWED_STATUSES,
  LOCKED_PROVIDER,
  type CompanyFiscalFormValues,
} from "@/lib/fiscal/companyFiscalValidation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ShieldOff, Loader2 } from "lucide-react";

const PAGE_TITLE = "Configuração Fiscal da Empresa";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";

function FieldRow({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground" id={`${id}-desc`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export default function FiscalEmpresa() {
  const { role } = useAuth();
  const access = getAccessLevel(role, "/configuracoes/fiscal/empresa");
  const canEdit = access === "rw";
  const uiEnabled = FEATURE_FLAGS.fiscalConfigurationUi === true;

  // Sanity: nunca renderiza formulário se emissão foi indevidamente ligada.
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const settingsQuery = useFiscalCompanySettings({ enabled: uiEnabled && access !== "none" });
  const update = useUpdateFiscalCompanySettings();

  const [values, setValues] = useState<CompanyFiscalFormValues>(() => rowToFormValues(null));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsQuery.data) setValues(rowToFormValues(settingsQuery.data));
  }, [settingsQuery.data]);

  const permissionDenied = useMemo(() => {
    return settingsQuery.error?.message === "permission_denied";
  }, [settingsQuery.error]);

  // ————————————————————————————————————————————————
  // Estado: sem permissão (defesa em profundidade além do RoleGuard)
  // ————————————————————————————————————————————————
  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-empresa-forbidden">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>
            Você não tem acesso à configuração fiscal da empresa.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ————————————————————————————————————————————————
  // Estado: flag desligada — módulo em preparação
  // ————————————————————————————————————————————————
  if (!uiEnabled) {
    return (
      <div className="p-6 max-w-3xl" data-testid="fiscal-empresa-preparation">
        <Card>
          <CardHeader>
            <CardTitle>{PAGE_TITLE}</CardTitle>
            <CardDescription>Módulo fiscal em preparação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>{EMISSION_BANNER}</AlertTitle>
              <AlertDescription>
                Esta tela ficará disponível quando a configuração fiscal for
                habilitada. Nenhuma emissão de nota está ativa neste ambiente.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ————————————————————————————————————————————————
  // Estado: loading
  // ————————————————————————————————————————————————
  if (settingsQuery.isLoading) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-loading">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando configuração fiscal…
        </div>
      </div>
    );
  }

  // ————————————————————————————————————————————————
  // Estado: erro de permissão em runtime
  // ————————————————————————————————————————————————
  if (permissionDenied) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-permission-denied">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão para ler a configuração fiscal</AlertTitle>
          <AlertDescription>
            Solicite acesso ao administrador. Nenhum dado foi alterado.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ————————————————————————————————————————————————
  // Estado: erro genérico
  // ————————————————————————————————————————————————
  if (settingsQuery.isError) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-error">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Não foi possível carregar a configuração fiscal</AlertTitle>
          <AlertDescription>
            Tente novamente em instantes. Se o problema persistir, contate o
            suporte.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ————————————————————————————————————————————————
  // Estado: vazio (singleton não existe ainda)
  // ————————————————————————————————————————————————
  if (!settingsQuery.data) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-empty">
        <Card>
          <CardHeader>
            <CardTitle>{PAGE_TITLE}</CardTitle>
            <CardDescription>{EMISSION_BANNER}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Configuração fiscal ainda não inicializada</AlertTitle>
              <AlertDescription>
                Aguarde a preparação inicial pelo administrador do sistema.
                Nenhuma emissão está habilitada.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const readonly = !canEdit;
  const readiness = computeReadiness(settingsQuery.data);

  function set<K extends keyof CompanyFiscalFormValues>(key: K, val: CompanyFiscalFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!settingsQuery.data) return;
    setErrors({});
    const parsed = companyFiscalFormSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      toast({
        title: "Verifique os campos",
        description: "Há dados inválidos no formulário.",
        variant: "destructive",
      });
      return;
    }
    try {
      await update.mutateAsync({ id: settingsQuery.data.id, values: parsed.data });
      toast({ title: "Configuração fiscal salva." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") {
        toast({
          title: "Sem permissão para salvar",
          description: "Contate o administrador do sistema.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Não foi possível salvar",
          description: "Tente novamente em instantes.",
          variant: "destructive",
        });
      }
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-4" data-testid="fiscal-empresa-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
        <p className="text-sm text-muted-foreground">
          Configuração interna. Nenhuma nota é emitida por esta tela.
        </p>
      </header>

      <Alert data-testid="fiscal-emission-banner">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription>
          Provedor fiscal: <strong>{LOCKED_PROVIDER}</strong>. Produção:{" "}
          <strong>desabilitada</strong>. Trava técnica ativa:{" "}
          <strong>{String(emissionLock)}</strong>.
        </AlertDescription>
      </Alert>

      {readiness ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo de prontidão</CardTitle>
            <CardDescription>
              Derivado do singleton fiscal (equivalente a <code>v_fiscal_company_readiness</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Ambiente</div>
              <div className="font-medium">{readiness.fiscal_environment ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="font-medium">{readiness.configuration_status ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Preenchimento</div>
              <div className="font-medium">
                {readiness.filled_score ?? 0}/{readiness.max_score ?? 0}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Validado contabilmente</div>
              <div className="font-medium">
                {readiness.accounting_validated ? "Sim" : "Não"}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6" aria-describedby="fiscal-emission-banner">
        <fieldset disabled={readonly || update.isPending} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldRow id="cnpj" label="CNPJ" description="Somente números — validação algorítmica.">
                <Input
                  id="cnpj"
                  inputMode="numeric"
                  value={values.cnpj ?? ""}
                  onChange={(e) => set("cnpj", e.target.value)}
                  aria-invalid={!!errors.cnpj}
                  aria-describedby="cnpj-desc"
                />
                {errors.cnpj ? (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.cnpj}
                  </p>
                ) : null}
              </FieldRow>
              <FieldRow id="legal_name" label="Razão social">
                <Input
                  id="legal_name"
                  value={values.legal_name ?? ""}
                  onChange={(e) => set("legal_name", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="trade_name" label="Nome fantasia">
                <Input
                  id="trade_name"
                  value={values.trade_name ?? ""}
                  onChange={(e) => set("trade_name", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="fiscal_email" label="E-mail fiscal">
                <Input
                  id="fiscal_email"
                  type="email"
                  value={values.fiscal_email ?? ""}
                  onChange={(e) => set("fiscal_email", e.target.value)}
                  aria-invalid={!!errors.fiscal_email}
                />
                {errors.fiscal_email ? (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.fiscal_email}
                  </p>
                ) : null}
              </FieldRow>
              <FieldRow id="phone" label="Telefone">
                <Input
                  id="phone"
                  value={values.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="tax_regime" label="Regime tributário">
                <Input
                  id="tax_regime"
                  value={values.tax_regime ?? ""}
                  onChange={(e) => set("tax_regime", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="crt" label="CRT">
                <Input id="crt" value={values.crt ?? ""} onChange={(e) => set("crt", e.target.value)} />
              </FieldRow>
              <FieldRow id="primary_cnae" label="CNAE principal">
                <Input
                  id="primary_cnae"
                  value={values.primary_cnae ?? ""}
                  onChange={(e) => set("primary_cnae", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="municipal_registration" label="Inscrição municipal (IM)">
                <Input
                  id="municipal_registration"
                  value={values.municipal_registration ?? ""}
                  onChange={(e) => set("municipal_registration", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="state_registration" label="Inscrição estadual (IE)">
                <Input
                  id="state_registration"
                  value={values.state_registration ?? ""}
                  onChange={(e) => set("state_registration", e.target.value)}
                />
              </FieldRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endereço fiscal</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldRow id="postal_code" label="CEP">
                <Input
                  id="postal_code"
                  value={values.postal_code ?? ""}
                  onChange={(e) => set("postal_code", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="street" label="Logradouro">
                <Input
                  id="street"
                  value={values.street ?? ""}
                  onChange={(e) => set("street", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="number" label="Número">
                <Input
                  id="number"
                  value={values.number ?? ""}
                  onChange={(e) => set("number", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="complement" label="Complemento">
                <Input
                  id="complement"
                  value={values.complement ?? ""}
                  onChange={(e) => set("complement", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="neighborhood" label="Bairro">
                <Input
                  id="neighborhood"
                  value={values.neighborhood ?? ""}
                  onChange={(e) => set("neighborhood", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="city" label="Cidade">
                <Input
                  id="city"
                  value={values.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="state" label="UF">
                <Input
                  id="state"
                  maxLength={2}
                  value={values.state ?? ""}
                  onChange={(e) => set("state", e.target.value.toUpperCase())}
                />
              </FieldRow>
              <FieldRow id="municipality_ibge_code" label="Código IBGE do município">
                <Input
                  id="municipality_ibge_code"
                  inputMode="numeric"
                  value={values.municipality_ibge_code ?? ""}
                  onChange={(e) => set("municipality_ibge_code", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="country_code" label="Código do país">
                <Input
                  id="country_code"
                  value={values.country_code ?? ""}
                  onChange={(e) => set("country_code", e.target.value)}
                />
              </FieldRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ambiente fiscal (intenção)</CardTitle>
              <CardDescription>
                Este bloco descreve a intenção de configuração. Não habilita
                transmissão de documentos fiscais para o fisco.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldRow id="fiscal_environment" label="Ambiente">
                <select
                  id="fiscal_environment"
                  className="h-10 border rounded-md px-3 bg-background"
                  value={values.fiscal_environment ?? "NOT_CONFIGURED"}
                  onChange={(e) =>
                    set(
                      "fiscal_environment",
                      e.target.value as (typeof ALLOWED_ENVIRONMENTS)[number],
                    )
                  }
                >
                  {ALLOWED_ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow id="configuration_status" label="Status de configuração">
                <select
                  id="configuration_status"
                  className="h-10 border rounded-md px-3 bg-background"
                  value={values.configuration_status ?? "DRAFT"}
                  onChange={(e) =>
                    set(
                      "configuration_status",
                      e.target.value as (typeof ALLOWED_STATUSES)[number],
                    )
                  }
                >
                  {ALLOWED_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <div className="md:col-span-2">
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground mb-2">
                  Estes toggles indicam apenas intenção de configuração. Não
                  transmitem documentos fiscais.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">NF-e (intenção)</div>
                  <div className="text-xs text-muted-foreground">
                    Emissão real permanece desativada.
                  </div>
                </div>
                <Switch
                  id="nfe_enabled"
                  checked={values.nfe_enabled === true}
                  onCheckedChange={(v) => set("nfe_enabled", v)}
                  aria-label="Ativar intenção de NF-e"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">NFS-e (intenção)</div>
                  <div className="text-xs text-muted-foreground">
                    Emissão real permanece desativada.
                  </div>
                </div>
                <Switch
                  id="nfse_enabled"
                  checked={values.nfse_enabled === true}
                  onCheckedChange={(v) => set("nfse_enabled", v)}
                  aria-label="Ativar intenção de NFS-e"
                />
              </div>
              <FieldRow id="nfe_series" label="Série NF-e (referência)">
                <Input
                  id="nfe_series"
                  value={values.nfe_series ?? ""}
                  onChange={(e) => set("nfe_series", e.target.value)}
                />
              </FieldRow>
              <FieldRow id="nfse_series" label="Série NFS-e (referência)">
                <Input
                  id="nfse_series"
                  value={values.nfse_series ?? ""}
                  onChange={(e) => set("nfse_series", e.target.value)}
                />
              </FieldRow>
            </CardContent>
          </Card>
        </fieldset>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending} data-testid="fiscal-empresa-save">
              {update.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                  Salvando…
                </>
              ) : (
                "Salvar configuração"
              )}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="fiscal-empresa-readonly-note">
            Modo somente leitura. Solicite alterações ao administrador.
          </p>
        )}
      </form>
    </div>
  );
}
