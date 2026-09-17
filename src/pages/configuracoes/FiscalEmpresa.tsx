/**
 * Fase Fiscal 3.15 — Central de Configuração Fiscal.
 *
 * Preparação completa (sem emissão) de dados da empresa, NF-e, NFS-e e
 * referências de integração. Nenhum provedor é chamado, nenhum token/
 * certificado é aceito, `production_enabled` nunca aparece no payload.
 * Concorrência otimista via `configuration_version`.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useFiscalCompanySettings,
  useUpdateFiscalCompanySettings,
  useInitFiscalCompanySettings,
  computeReadiness,
} from "@/hooks/useFiscalCompanySettings";
import {
  companyFiscalFormSchema,
  rowToFormValues,
  ALLOWED_ENVIRONMENTS,
  ALLOWED_STATUSES,
  ALLOWED_PROVIDERS,
  LOCKED_PROVIDER,
  nfeChecklist,
  nfseChecklist,
  NFE_FINALIDADES,
  NFE_NUMBERING_MODES,
  NFE_DANFE_LAYOUTS,
  NFE_CONTINGENCIA,
  NFSE_MODES,
  type CompanyFiscalFormValues,
} from "@/lib/fiscal/companyFiscalValidation";
import {
  CRT_OPTIONS, TAX_REGIME_OPTIONS, UF_OPTIONS, COUNTRY_OPTIONS,
  PRESENCE_OPTIONS, FREIGHT_MODALITY_OPTIONS, RPS_TYPE_OPTIONS,
  NFSE_SPECIAL_REGIME_OPTIONS,
} from "@/lib/fiscal/fiscalOptions";
import {
  FISCAL_ENVIRONMENT,
  FISCAL_CONFIGURATION_STATUS,
  NFE_FINALITY,
  NFE_NUMBERING_MODE,
  NFE_DANFE_LAYOUT,
  NFE_CONTINGENCY,
  NFSE_MODE,
} from "@/lib/fiscal/labels";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCNPJ, formatCEP, formatTelefone, unmask, unmaskCnpj } from "@/lib/masks";
import { MaskedInput } from "@/components/ui/masked-input";
import { validateIE, normalizeIE } from "@/lib/fiscal/ie";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import FiscalCatalogCombobox from "@/components/fiscal/FiscalCatalogCombobox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ShieldOff, Loader2, CheckCircle2, Circle, Info } from "lucide-react";
import CertificadoDigitalSecao from "@/components/fiscal/certificados/CertificadoDigitalSecao";
import HomologacaoSecao from "@/components/fiscal/homologacao/HomologacaoSecao";
import { RtcCompanyCard } from "@/components/fiscal/RtcCompanyCard";
import { CnpjLookupButton } from "@/components/fiscal/CnpjLookupButton";
import { useFiscalFieldFocus } from "@/lib/fiscal/useFiscalFieldFocus";


const PAGE_TITLE = "Central de Configuração Fiscal";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";

function FieldRow({
  id, label, description, children,
}: { id: string; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

type SelectOption = string | { value: string; label: string };
function SelectNative({
  id, value, onChange, options, disabled,
}: {
  id: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: readonly SelectOption[];
  disabled?: boolean;
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const currentValue = value ?? normalized[0]?.value ?? "";
  const missing = value != null && value !== "" && !normalized.some((o) => o.value === value);
  return (
    <select
      id={id}
      disabled={disabled}
      className="h-10 border rounded-md px-3 bg-background disabled:opacity-60"
      value={currentValue}
      onChange={(e) => onChange(e.target.value)}
    >
      {missing ? (
        <option value={value}>{`— manter valor atual (${value}) —`}</option>
      ) : null}
      {normalized.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Checklist({ items }: { items: Array<{ key: string; label: string; ok: boolean }> }) {
  const done = items.filter((i) => i.ok).length;
  const pct = items.length === 0 ? 0 : Math.round((done * 100) / items.length);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Progress value={pct} className="h-2" />
        <span className="tabular-nums">{done}/{items.length}</span>
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2">
            {i.ok
              ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />}
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FiscalEmpresa() {
  const { role, roles } = useAuth();
  const access = getAccessLevel(role, "/configuracoes/fiscal/empresa");
  const canEdit = access === "rw";
  // Gestão de certificados é estritamente admin — financeiro/gestor só visualizam.
  const canManageCertificates = Array.isArray(roles) && roles.includes("administrador");
  const uiEnabled = FEATURE_FLAGS.fiscalConfigurationUi === true;
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const settingsQuery = useFiscalCompanySettings({ enabled: uiEnabled && access !== "none" });
  const update = useUpdateFiscalCompanySettings();
  const init = useInitFiscalCompanySettings();

  const [values, setValues] = useState<CompanyFiscalFormValues>(() => rowToFormValues(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canViewHomologation = Array.isArray(roles) && roles.some((r) => r === "administrador" || r === "gestor" || r === "financeiro");
  type FiscalEmpresaTab = "empresa" | "nfe" | "nfse" | "certificado" | "integracao" | "rtc" | "homologacao" | "revisao";
  const FISCAL_EMPRESA_TABS: readonly FiscalEmpresaTab[] = [
    "empresa","nfe","nfse","certificado","integracao","rtc","homologacao","revisao",
  ] as const;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: FiscalEmpresaTab = (() => {
    const raw = searchParams.get("aba");
    return (FISCAL_EMPRESA_TABS as readonly string[]).includes(raw ?? "")
      ? (raw as FiscalEmpresaTab)
      : "empresa";
  })();
  const [tab, setTab] = useState<FiscalEmpresaTab>(initialTab);
  // Deep-link seguro: só respeita valores conhecidos.
  useEffect(() => {
    const raw = searchParams.get("aba");
    if (raw && (FISCAL_EMPRESA_TABS as readonly string[]).includes(raw) && raw !== tab) {
      setTab(raw as FiscalEmpresaTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const handleTabChange = (v: string) => {
    if ((FISCAL_EMPRESA_TABS as readonly string[]).includes(v)) {
      setTab(v as FiscalEmpresaTab);
      const next = new URLSearchParams(searchParams);
      next.set("aba", v);
      setSearchParams(next, { replace: true });
    }
  };

  // Fase H4-A1 — foco/destaque via `?campo=<id>` (allow-list, fallback seguro).
  useFiscalFieldFocus({
    tab,
    ready: !settingsQuery.isLoading,
    searchParams,
    setSearchParams,
  });


  useEffect(() => {
    if (settingsQuery.data) setValues(rowToFormValues(settingsQuery.data));
  }, [settingsQuery.data]);

  const permissionDenied = useMemo(
    () => settingsQuery.error?.message === "permission_denied",
    [settingsQuery.error],
  );

  const readiness = useMemo(
    () => (settingsQuery.data ? computeReadiness(settingsQuery.data) : null),
    [settingsQuery.data],
  );
  const nfeItems = useMemo(() => nfeChecklist(values), [values]);
  const nfseItems = useMemo(() => nfseChecklist(values), [values]);

  const overallPct = useMemo(() => {
    if (!readiness) return 0;
    const total = readiness.max_score + nfeItems.length + nfseItems.length;
    const done =
      readiness.filled_score + nfeItems.filter((i) => i.ok).length + nfseItems.filter((i) => i.ok).length;
    return total === 0 ? 0 : Math.round((done * 100) / total);
  }, [readiness, nfeItems, nfseItems]);

  const statusBadge = useMemo(() => {
    const s = values.configuration_status ?? "DRAFT";
    if (s === "READY_FOR_HOMOLOGATION") return <Badge variant="default">Pronto para homologação</Badge>;
    if (s === "PENDING_ACCOUNTING") return <Badge variant="secondary">Aguardando contabilidade</Badge>;
    return <Badge variant="outline">Rascunho</Badge>;
  }, [values.configuration_status]);

  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-empresa-forbidden">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você não tem acesso à configuração fiscal da empresa.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!uiEnabled) {
    return (
      <div className="p-6 max-w-3xl" data-testid="fiscal-empresa-preparation">
        <Card>
          <CardHeader>
            <CardTitle>{PAGE_TITLE}</CardTitle>
            <CardDescription>Módulo fiscal em preparação</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>{EMISSION_BANNER}</AlertTitle>
              <AlertDescription>Nenhuma emissão de nota está ativa neste ambiente.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-loading">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando configuração fiscal…
        </div>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-permission-denied">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão para ler a configuração fiscal</AlertTitle>
          <AlertDescription>Solicite acesso ao administrador. Nenhum dado foi alterado.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="p-6" data-testid="fiscal-empresa-error">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Não foi possível carregar a configuração fiscal</AlertTitle>
          <AlertDescription>Tente novamente em instantes.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!settingsQuery.data) {
    return (
      <div className="p-6 max-w-2xl" data-testid="fiscal-empresa-empty">
        <Card>
          <CardHeader>
            <CardTitle>{PAGE_TITLE}</CardTitle>
            <CardDescription>{EMISSION_BANNER}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" aria-hidden />
              <AlertTitle>Configuração fiscal ainda não inicializada</AlertTitle>
              <AlertDescription>
                {canEdit
                  ? "Inicialize a configuração para começar a preencher os dados. Nada será emitido."
                  : "Aguarde a preparação inicial pelo administrador."}
              </AlertDescription>
            </Alert>
            {canEdit ? (
              <Button
                onClick={async () => {
                  try {
                    await init.mutateAsync();
                    toast({ title: "Configuração fiscal inicializada." });
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "unknown";
                    toast({
                      title: msg === "permission_denied"
                        ? "Sem permissão para inicializar"
                        : "Não foi possível inicializar",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={init.isPending}
                data-testid="fiscal-empresa-init"
              >
                {init.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />Inicializando…</> : "Inicializar configuração"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const readonly = !canEdit;

  function set<K extends keyof CompanyFiscalFormValues>(key: K, val: CompanyFiscalFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }
  function setNfe(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, nfe_configuration: { ...(prev.nfe_configuration ?? {}), [key]: val } }));
  }
  function setNfse(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, nfse_configuration: { ...(prev.nfse_configuration ?? {}), [key]: val } }));
  }

  function validateLocal(): boolean {
    setErrors({});
    const parsed = companyFiscalFormSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      return false;
    }
    return true;
  }

  async function onSave() {
    if (!settingsQuery.data) return;
    if (!validateLocal()) {
      toast({ title: "Verifique os campos", description: "Há dados inválidos.", variant: "destructive" });
      return;
    }
    const ieCheck = validateIE(values.state ?? null, values.state_registration, { allowIsento: true });
    if (!ieCheck.ok) {
      toast({ title: "Inscrição Estadual inválida", description: ieCheck.error, variant: "destructive" });
      return;
    }
    const normalizedValues = {
      ...values,
      state_registration: normalizeIE(values.state ?? null, values.state_registration, { allowIsento: true }),
    };
    try {
      await update.mutateAsync({
        id: settingsQuery.data.id,
        expectedVersion: settingsQuery.data.configuration_version ?? 1,
        values: normalizedValues,
      });
      toast({ title: "Configuração fiscal salva." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") {
        toast({ title: "Sem permissão para salvar", variant: "destructive" });
      } else if (msg === "conflict") {
        toast({
          title: "Conflito de versão",
          description: "A configuração foi alterada por outra sessão. Recarregue e tente novamente.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Não foi possível salvar", variant: "destructive" });
      }
    }
  }

  const nfe = (values.nfe_configuration ?? {}) as Record<string, unknown>;
  const nfse = (values.nfse_configuration ?? {}) as Record<string, unknown>;

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4" data-testid="fiscal-empresa-page">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
          {statusBadge}
        </div>
        <p className="text-sm text-muted-foreground">
          Configuração interna. Nenhuma nota é emitida ou transmitida por esta tela.
        </p>
      </header>

      <Alert data-testid="fiscal-emission-banner" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription className="text-xs">
          Legacy provider: <strong>{LOCKED_PROVIDER}</strong> · Ambiente de produção fiscal: <strong>desabilitado</strong> ·
          Trava técnica: <strong>{String(emissionLock)}</strong>. Nenhum token, senha ou certificado é aceito nesta tela.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Progresso geral</CardTitle>
          <CardDescription>Indicador local de preenchimento — não implica homologação.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Progress value={overallPct} className="h-2 flex-1" />
            <span className="tabular-nums text-sm">{overallPct}%</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="nfe">NF-e</TabsTrigger>
          <TabsTrigger value="nfse">NFS-e</TabsTrigger>
          <TabsTrigger value="certificado" data-testid="fiscal-empresa-tab-certificado">Certificado digital</TabsTrigger>
          <TabsTrigger value="integracao">Integração e segurança</TabsTrigger>
          <TabsTrigger value="rtc" data-testid="fiscal-empresa-tab-rtc">Reforma Tributária 2026</TabsTrigger>

          {canViewHomologation ? (
            <TabsTrigger value="homologacao" data-testid="fiscal-empresa-tab-homologacao">Homologação fiscal</TabsTrigger>
          ) : null}
          <TabsTrigger value="revisao">Revisão</TabsTrigger>
        </TabsList>

        <fieldset disabled={readonly || update.isPending} className="mt-4">
          <TabsContent value="empresa" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldRow id="cnpj" label="CNPJ" description="14 posições — desde 07/2026 aceita letras A–Z nas 12 primeiras (IN RFB 2.229/2024).">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex-1">
                      <Input
                        id="cnpj"
                        inputMode="text"
                        autoCapitalize="characters"
                        autoComplete="off"
                        maxLength={18}
                        placeholder="00.000.000/0000-00"
                        value={formatCNPJ(values.cnpj ?? "")}
                        onChange={(e) => set("cnpj", unmaskCnpj(e.target.value).slice(0, 14))}
                        aria-invalid={!!errors.cnpj}
                      />
                      {errors.cnpj ? <p className="text-xs text-destructive" role="alert">{errors.cnpj}</p> : null}
                    </div>
                    <CnpjLookupButton
                      cnpj={values.cnpj}
                      currentValues={values}
                      disabled={readonly || update.isPending}
                      onApply={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                    />
                  </div>
                </FieldRow>

                <FieldRow id="legal_name" label="Razão social">
                  <Input id="legal_name" value={values.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} />
                </FieldRow>
                <FieldRow id="trade_name" label="Nome fantasia">
                  <Input id="trade_name" value={values.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} />
                </FieldRow>
                <FieldRow id="fiscal_email" label="E-mail fiscal">
                  <Input
                    id="fiscal_email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="fiscal@empresa.com.br"
                    value={values.fiscal_email ?? ""}
                    onChange={(e) => set("fiscal_email", e.target.value)}
                    onBlur={(e) => set("fiscal_email", e.target.value.trim())}
                    aria-invalid={!!errors.fiscal_email}
                  />
                  {errors.fiscal_email ? <p className="text-xs text-destructive" role="alert">{errors.fiscal_email}</p> : null}
                </FieldRow>
                <FieldRow id="phone" label="Telefone">
                  <Input
                    id="phone"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={15}
                    placeholder="(00) 00000-0000"
                    value={formatTelefone(values.phone ?? "")}
                    onChange={(e) => set("phone", unmask(e.target.value).slice(0, 11))}
                  />
                </FieldRow>
                <FieldRow id="tax_regime" label="Regime tributário">
                  <SelectNative id="tax_regime" value={values.tax_regime ?? ""} options={TAX_REGIME_OPTIONS} onChange={(v) => set("tax_regime", v)} />
                </FieldRow>
                <FieldRow id="crt" label="CRT" description="Código do Regime Tributário oficial.">
                  <SelectNative id="crt" value={values.crt ?? ""} options={CRT_OPTIONS} onChange={(v) => set("crt", v)} />
                </FieldRow>
                <FieldRow id="primary_cnae" label="CNAE principal" description="Selecione pela tabela oficial do IBGE (busque por código ou atividade).">
                  <FiscalCatalogCombobox
                    id="primary_cnae"
                    catalogType="CNAE"
                    value={values.primary_cnae ?? null}
                    onChange={(code) => set("primary_cnae", code ?? "")}
                    placeholder="Selecionar CNAE…"
                    searchPlaceholder="Ex.: 0111301 ou cultivo de arroz"
                  />
                </FieldRow>
                <FieldRow id="municipal_registration" label="Inscrição municipal (IM)">
                  <Input id="municipal_registration" value={values.municipal_registration ?? ""} onChange={(e) => set("municipal_registration", e.target.value)} />
                </FieldRow>
                <FieldRow id="state_registration" label="Inscrição estadual (IE)" description="Digite ISENTO se não contribuinte.">
                  <MaskedInput
                    id="state_registration"
                    mask="ie"
                    uf={values.state ?? undefined}
                    placeholder={values.state ? "Conforme UF selecionada (ou ISENTO)" : "Selecione a UF primeiro"}
                    autoCapitalize="characters"
                    value={values.state_registration ?? ""}
                    onChange={(e) => set("state_registration", e.target.value)}
                    onBlur={(e) => {
                      const r = validateIE(values.state ?? null, e.target.value, { allowIsento: true });
                      setErrors((prev) => {
                        const next = { ...prev };
                        if (!r.ok) next.state_registration = r.error;
                        else delete next.state_registration;
                        return next;
                      });
                    }}
                  />
                  {errors.state_registration && (
                    <p className="text-xs text-destructive mt-1">{errors.state_registration}</p>
                  )}
                </FieldRow>

              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Endereço fiscal</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldRow id="postal_code" label="CEP">
                  <Input
                    id="postal_code"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={9}
                    placeholder="00000-000"
                    value={formatCEP(values.postal_code ?? "")}
                    onChange={(e) => set("postal_code", unmask(e.target.value).slice(0, 8))}
                  />
                </FieldRow>
                <FieldRow id="street" label="Logradouro"><Input id="street" autoComplete="address-line1" value={values.street ?? ""} onChange={(e) => set("street", e.target.value)} /></FieldRow>
                <FieldRow id="number" label="Número"><Input id="number" inputMode="numeric" value={values.number ?? ""} onChange={(e) => set("number", e.target.value)} /></FieldRow>
                <FieldRow id="complement" label="Complemento"><Input id="complement" value={values.complement ?? ""} onChange={(e) => set("complement", e.target.value)} /></FieldRow>
                <FieldRow id="neighborhood" label="Bairro"><Input id="neighborhood" value={values.neighborhood ?? ""} onChange={(e) => set("neighborhood", e.target.value)} /></FieldRow>
                <FieldRow id="state" label="UF">
                  <SelectNative id="state" value={values.state ?? ""} options={UF_OPTIONS} onChange={(v) => set("state", v)} />
                </FieldRow>
                <FieldRow
                  id="city"
                  label="Cidade"
                  description={values.state ? "Selecione pela tabela oficial do IBGE." : "Selecione a UF primeiro."}
                >
                  <FiscalCatalogCombobox
                    id="city"
                    catalogType="MUNICIPIO_IBGE"
                    parentCode={values.state ?? null}
                    disabled={!values.state}
                    value={values.municipality_ibge_code ?? null}
                    onChange={(code) => set("municipality_ibge_code", code ?? "")}
                    onSelectEntry={(entry) => {
                      const nome = (entry?.metadata as { name?: string } | null)?.name;
                      if (typeof nome === "string" && nome.length > 0) set("city", nome);
                    }}
                    placeholder={values.city ? values.city : "Selecionar município…"}
                    searchPlaceholder="Buscar município…"
                  />
                </FieldRow>
                <FieldRow id="municipality_ibge_code" label="Código IBGE do município" description="Preenchido automaticamente pelo município selecionado.">
                  <Input
                    id="municipality_ibge_code"
                    readOnly
                    aria-readonly="true"
                    placeholder="0000000"
                    value={values.municipality_ibge_code ?? ""}
                  />
                </FieldRow>
                <FieldRow id="country_code" label="Código do país">
                  <SelectNative id="country_code" value={values.country_code ?? "1058"} options={COUNTRY_OPTIONS} onChange={(v) => set("country_code", v)} />
                </FieldRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ambiente fiscal</CardTitle>
                <CardDescription>Nenhuma opção habilita transmissão de documentos ao fisco.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldRow id="fiscal_environment" label="Ambiente">
                  <SelectNative id="fiscal_environment" value={values.fiscal_environment} options={FISCAL_ENVIRONMENT.toOptions(ALLOWED_ENVIRONMENTS)} onChange={(v) => set("fiscal_environment", v as (typeof ALLOWED_ENVIRONMENTS)[number])} />
                </FieldRow>
                <FieldRow id="configuration_status" label="Status de configuração">
                  <SelectNative id="configuration_status" value={values.configuration_status} options={FISCAL_CONFIGURATION_STATUS.toOptions(ALLOWED_STATUSES)} onChange={(v) => set("configuration_status", v as (typeof ALLOWED_STATUSES)[number])} />
                </FieldRow>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nfe" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">NF-e — Preparação</CardTitle>
                <CardDescription>Campos preparatórios. Não emitem, cancelam ou transmitem documentos.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                  <div>
                    <div className="text-sm font-medium">Habilitada para preparação</div>
                    <div className="text-xs text-muted-foreground">Não autoriza emissão.</div>
                  </div>
                  <Switch checked={nfe.enabled_for_preparation === true} onCheckedChange={(v) => setNfe("enabled_for_preparation", v)} />
                </div>
                <FieldRow id="nfe_environment" label="Ambiente NF-e">
                  <SelectNative id="nfe_environment" value={(nfe.environment as string) ?? "NOT_CONFIGURED"} options={FISCAL_ENVIRONMENT.toOptions(ALLOWED_ENVIRONMENTS)} onChange={(v) => setNfe("environment", v)} />
                </FieldRow>
                <FieldRow id="nfe_series" label="Série NF-e"><Input id="nfe_series" value={values.nfe_series ?? ""} onChange={(e) => set("nfe_series", e.target.value)} /></FieldRow>
                <FieldRow id="nfe_numbering_mode" label="Modo de numeração">
                  <SelectNative id="nfe_numbering_mode" value={(nfe.numbering_mode as string) ?? "MANUAL_REFERENCE"} options={NFE_NUMBERING_MODE.toOptions(NFE_NUMBERING_MODES)} onChange={(v) => setNfe("numbering_mode", v)} />
                </FieldRow>
                <FieldRow id="nfe_default_nature" label="Natureza padrão da operação">
                  <Input id="nfe_default_nature" placeholder="Ex.: Venda de mercadoria adquirida de terceiros" value={(nfe.default_nature as string) ?? ""} onChange={(e) => setNfe("default_nature", e.target.value)} />
                </FieldRow>
                <FieldRow id="nfe_default_finality" label="Finalidade padrão">
                  <SelectNative id="nfe_default_finality" value={(nfe.default_finality as string) ?? "NORMAL"} options={NFE_FINALITY.toOptions(NFE_FINALIDADES)} onChange={(v) => setNfe("default_finality", v)} />
                </FieldRow>
                <FieldRow id="nfe_presence_indicator" label="Indicador de presença" description="Código conforme NT2011.004.">
                  <SelectNative id="nfe_presence_indicator" value={(nfe.presence_indicator as string) ?? ""} options={PRESENCE_OPTIONS} onChange={(v) => setNfe("presence_indicator", v)} />
                </FieldRow>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label className="m-0">Consumidor final padrão</Label>
                  <Switch checked={nfe.default_end_consumer === true} onCheckedChange={(v) => setNfe("default_end_consumer", v)} />
                </div>
                <FieldRow id="nfe_freight_modality" label="Modalidade de frete">
                  <SelectNative id="nfe_freight_modality" value={(nfe.freight_modality as string) ?? ""} options={FREIGHT_MODALITY_OPTIONS} onChange={(v) => setNfe("freight_modality", v)} />
                </FieldRow>
                <FieldRow id="nfe_danfe_layout" label="Layout DANFE">
                  <SelectNative id="nfe_danfe_layout" value={(nfe.danfe_layout as string) ?? "PORTRAIT"} options={NFE_DANFE_LAYOUT.toOptions(NFE_DANFE_LAYOUTS)} onChange={(v) => setNfe("danfe_layout", v)} />
                </FieldRow>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label className="m-0">Enviar e-mail após autorização futura</Label>
                  <Switch checked={nfe.send_email_after_authorization === true} onCheckedChange={(v) => setNfe("send_email_after_authorization", v)} />
                </div>
                <FieldRow id="nfe_contingency_mode" label="Modo de contingência">
                  <SelectNative id="nfe_contingency_mode" value={(nfe.contingency_mode as string) ?? "DISABLED"} options={NFE_CONTINGENCY.toOptions(NFE_CONTINGENCIA)} onChange={(v) => setNfe("contingency_mode", v)} />
                </FieldRow>
                <FieldRow id="nfe_cfop_in" label="CFOP interno sugerido" description="Ex.: 5102 — Venda de mercadoria adquirida.">
                  <Input id="nfe_cfop_in" inputMode="numeric" maxLength={4} placeholder="5102" value={(nfe.suggested_cfop_in_state as string) ?? ""} onChange={(e) => setNfe("suggested_cfop_in_state", e.target.value)} />
                </FieldRow>
                <FieldRow id="nfe_cfop_out" label="CFOP interestadual sugerido" description="Ex.: 6102 — Venda interestadual.">
                  <Input id="nfe_cfop_out" inputMode="numeric" maxLength={4} placeholder="6102" value={(nfe.suggested_cfop_interstate as string) ?? ""} onChange={(e) => setNfe("suggested_cfop_interstate", e.target.value)} />
                </FieldRow>
                <div className="md:col-span-2">
                  <FieldRow id="nfe_info" label="Informações adicionais padrão">
                    <Textarea id="nfe_info" rows={3} value={(nfe.default_additional_info as string) ?? ""} onChange={(e) => setNfe("default_additional_info", e.target.value)} />
                  </FieldRow>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Checklist NF-e</CardTitle></CardHeader>
              <CardContent><Checklist items={nfeItems} /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nfse" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">NFS-e — Preparação</CardTitle>
                <CardDescription>Campos preparatórios. Não emitem, cancelam ou transmitem.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                  <div>
                    <div className="text-sm font-medium">Habilitada para preparação</div>
                    <div className="text-xs text-muted-foreground">Não autoriza emissão.</div>
                  </div>
                  <Switch checked={nfse.enabled_for_preparation === true} onCheckedChange={(v) => setNfse("enabled_for_preparation", v)} />
                </div>
                <FieldRow id="nfse_environment" label="Ambiente NFS-e">
                  <SelectNative id="nfse_environment" value={(nfse.environment as string) ?? "NOT_CONFIGURED"} options={FISCAL_ENVIRONMENT.toOptions(ALLOWED_ENVIRONMENTS)} onChange={(v) => setNfse("environment", v)} />
                </FieldRow>
                <FieldRow id="nfse_mode" label="Modo">
                  <SelectNative id="nfse_mode" value={(nfse.mode as string) ?? "MUNICIPAL"} options={NFSE_MODE.toOptions(NFSE_MODES)} onChange={(v) => setNfse("mode", v)} />
                </FieldRow>
                <FieldRow id="nfse_series" label="Série NFS-e"><Input id="nfse_series" value={values.nfse_series ?? ""} onChange={(e) => set("nfse_series", e.target.value)} /></FieldRow>
                <FieldRow id="nfse_rps_series" label="Série RPS"><Input id="nfse_rps_series" value={(nfse.rps_series as string) ?? ""} onChange={(e) => setNfse("rps_series", e.target.value)} /></FieldRow>
                <FieldRow id="nfse_rps_type" label="Tipo RPS">
                  <SelectNative id="nfse_rps_type" value={(nfse.rps_type as string) ?? ""} options={RPS_TYPE_OPTIONS} onChange={(v) => setNfse("rps_type", v)} />
                </FieldRow>
                <FieldRow id="nfse_national_code" label="Cód. tributação nacional"><Input id="nfse_national_code" value={(nfse.national_taxation_code as string) ?? ""} onChange={(e) => setNfse("national_taxation_code", e.target.value)} /></FieldRow>
                <FieldRow id="nfse_municipal_code" label="Cód. tributação municipal"><Input id="nfse_municipal_code" value={(nfse.municipal_taxation_code as string) ?? ""} onChange={(e) => setNfse("municipal_taxation_code", e.target.value)} /></FieldRow>
                <FieldRow id="nfse_lc116" label="Item LC 116" description="Ex.: 1.05 — Licenciamento de programas."><Input id="nfse_lc116" placeholder="0.00" value={(nfse.lc116_item as string) ?? ""} onChange={(e) => setNfse("lc116_item", e.target.value)} /></FieldRow>
                <FieldRow id="nfse_cnae" label="CNAE" description="Selecione pela tabela oficial do IBGE.">
                  <FiscalCatalogCombobox
                    id="nfse_cnae"
                    catalogType="CNAE"
                    value={(nfse.cnae as string) ?? null}
                    onChange={(code) => setNfse("cnae", code ?? "")}
                    placeholder="Selecionar CNAE…"
                    searchPlaceholder="Ex.: 0111301 ou cultivo de arroz"
                  />
                </FieldRow>
                <FieldRow id="nfse_iss_rate" label="Alíquota ISS (%)" description="Normalmente entre 2% e 5%, conforme o município.">
                  <Input id="nfse_iss_rate" type="number" step="0.01" min={0} max={100} placeholder="0.00" value={typeof nfse.iss_rate === "number" ? String(nfse.iss_rate) : ""} onChange={(e) => setNfse("iss_rate", e.target.value === "" ? undefined : Number(e.target.value))} />
                </FieldRow>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label className="m-0">ISS retido por padrão</Label>
                  <Switch checked={nfse.iss_withheld_default === true} onCheckedChange={(v) => setNfse("iss_withheld_default", v)} />
                </div>
                <FieldRow id="nfse_regime" label="Regime especial de tributação">
                  <SelectNative id="nfse_regime" value={(nfse.special_taxation_regime as string) ?? ""} options={NFSE_SPECIAL_REGIME_OPTIONS} onChange={(v) => setNfse("special_taxation_regime", v)} />
                </FieldRow>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label className="m-0">Incentivo fiscal</Label>
                  <Switch checked={nfse.fiscal_incentive === true} onCheckedChange={(v) => setNfse("fiscal_incentive", v)} />
                </div>
                <FieldRow id="nfse_op_nature" label="Natureza da operação">
                  <Input id="nfse_op_nature" value={(nfse.operation_nature as string) ?? ""} onChange={(e) => setNfse("operation_nature", e.target.value)} />
                </FieldRow>
                <FieldRow id="nfse_deductions" label="Deduções padrão">
                  <Input id="nfse_deductions" type="number" step="0.01" min={0} value={typeof nfse.deductions_default === "number" ? String(nfse.deductions_default) : ""} onChange={(e) => setNfse("deductions_default", e.target.value === "" ? undefined : Number(e.target.value))} />
                </FieldRow>
                <div className="md:col-span-2">
                  <FieldRow id="nfse_desc" label="Descrição padrão do serviço">
                    <Textarea id="nfse_desc" rows={3} value={(nfse.default_service_description as string) ?? ""} onChange={(e) => setNfse("default_service_description", e.target.value)} />
                  </FieldRow>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                  <Label className="m-0">Enviar e-mail após autorização futura</Label>
                  <Switch checked={nfse.send_email_after_authorization === true} onCheckedChange={(v) => setNfse("send_email_after_authorization", v)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Checklist NFS-e</CardTitle></CardHeader>
              <CardContent><Checklist items={nfseItems} /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certificado" className="space-y-4">
            <CertificadoDigitalSecao
              companySettingsId={settingsQuery.data.id}
              canEdit={canEdit}
              canManageCertificates={canManageCertificates}
            />

          </TabsContent>

          <TabsContent value="integracao" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" aria-hidden />
              <AlertTitle>Referências, nunca segredos</AlertTitle>
              <AlertDescription className="text-xs">
                Cadastre apenas identificadores curtos que apontam para o cofre seguro. Nunca cole aqui token, senha, chave privada, PFX/P12 ou conteúdo de certificado.
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Provedores e referências</CardTitle>
                <CardDescription>Escolher um provedor NÃO abre conexão nem autoriza emissão.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldRow id="nfe_provider" label="Provedor NF-e">
                  <SelectNative id="nfe_provider" value={values.nfe_provider ?? "NONE"} options={ALLOWED_PROVIDERS} onChange={(v) => set("nfe_provider", v as (typeof ALLOWED_PROVIDERS)[number])} />
                </FieldRow>
                <FieldRow id="nfse_provider" label="Provedor NFS-e">
                  <SelectNative id="nfse_provider" value={values.nfse_provider ?? "NONE"} options={ALLOWED_PROVIDERS} onChange={(v) => set("nfse_provider", v as (typeof ALLOWED_PROVIDERS)[number])} />
                </FieldRow>
                <FieldRow id="nfe_credential_ref" label="Referência de credencial NF-e" description="Cadastre o segredo futuramente no cofre seguro; não cole aqui.">
                  <Input id="nfe_credential_ref" value={values.nfe_credential_ref ?? ""} onChange={(e) => set("nfe_credential_ref", e.target.value)} aria-invalid={!!errors.nfe_credential_ref} />
                  {errors.nfe_credential_ref ? <p className="text-xs text-destructive" role="alert">{errors.nfe_credential_ref}</p> : null}
                </FieldRow>
                <FieldRow id="nfse_credential_ref" label="Referência de credencial NFS-e" description="Cadastre o segredo futuramente no cofre seguro; não cole aqui.">
                  <Input id="nfse_credential_ref" value={values.nfse_credential_ref ?? ""} onChange={(e) => set("nfse_credential_ref", e.target.value)} aria-invalid={!!errors.nfse_credential_ref} />
                  {errors.nfse_credential_ref ? <p className="text-xs text-destructive" role="alert">{errors.nfse_credential_ref}</p> : null}
                </FieldRow>
                <FieldRow id="certificate_ref" label="Referência de certificado" description="Somente um identificador. Não cole PFX/P12/PEM.">
                  <Input id="certificate_ref" value={values.certificate_ref ?? ""} onChange={(e) => set("certificate_ref", e.target.value)} aria-invalid={!!errors.certificate_ref} />
                  {errors.certificate_ref ? <p className="text-xs text-destructive" role="alert">{errors.certificate_ref}</p> : null}
                </FieldRow>
                <FieldRow id="webhook_ref" label="Referência de webhook" description="Somente um identificador. Não cole URL com credencial.">
                  <Input id="webhook_ref" value={values.webhook_ref ?? ""} onChange={(e) => set("webhook_ref", e.target.value)} aria-invalid={!!errors.webhook_ref} />
                  {errors.webhook_ref ? <p className="text-xs text-destructive" role="alert">{errors.webhook_ref}</p> : null}
                </FieldRow>
                <div className="md:col-span-2">
                  <FieldRow id="configuration_notes" label="Anotações internas">
                    <Textarea id="configuration_notes" rows={3} value={values.configuration_notes ?? ""} onChange={(e) => set("configuration_notes", e.target.value)} />
                  </FieldRow>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rtc" className="space-y-4" data-testid="fiscal-empresa-panel-rtc">
            <RtcCompanyCard canEdit={canEdit} />
          </TabsContent>



          {canViewHomologation ? (
            <TabsContent value="homologacao" className="space-y-4">
              <HomologacaoSecao companySettingsId={settingsQuery.data?.id ?? null} />
            </TabsContent>
          ) : null}

          <TabsContent value="revisao" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Revisão de prontidão</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm font-medium mb-2">NF-e</div>
                  <Checklist items={nfeItems} />
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">NFS-e</div>
                  <Checklist items={nfseItems} />
                </div>
              </CardContent>
            </Card>
            <Alert>
              <Info className="h-4 w-4" aria-hidden />
              <AlertTitle>Validação local somente</AlertTitle>
              <AlertDescription className="text-xs">
                O botão de validação checa apenas o preenchimento local. Não consulta SEFAZ, prefeitura ou qualquer serviço externo.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (validateLocal()) toast({ title: "Preenchimento local OK." });
                  else toast({ title: "Existem campos inválidos.", variant: "destructive" });
                }}
                data-testid="fiscal-empresa-validate"
              >
                Validar preenchimento
              </Button>
            </div>
          </TabsContent>
        </fieldset>
      </Tabs>

      {canEdit ? (
        <div className="flex justify-end gap-2 sticky bottom-2 bg-background/80 backdrop-blur-sm p-2 rounded-md border">
          <Button variant="outline" onClick={onSave} disabled={update.isPending} data-testid="fiscal-empresa-save-draft">
            Salvar rascunho
          </Button>
          <Button onClick={onSave} disabled={update.isPending} data-testid="fiscal-empresa-save">
            {update.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />Salvando…</> : "Salvar configuração"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="fiscal-empresa-readonly-note">
          Modo somente leitura. Solicite alterações ao administrador.
        </p>
      )}
    </div>
  );
}
