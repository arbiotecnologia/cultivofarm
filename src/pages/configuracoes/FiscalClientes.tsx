/**
 * Fase Fiscal 3.4 — Perfis Fiscais de Clientes.
 * Tela isolada, sem emissão, sem integração externa.
 * Identidade = customer_id (FK real e unique para `clientes.id`).
 * CPF/CNPJ do cliente é apenas lido para exibição e SEMPRE mascarado.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useCustomerFiscalList,
  useCustomerFiscalReadiness,
  useCustomerFiscalProfile,
  useSaveCustomerFiscalProfile,
  OptimisticConflictError,
  DuplicateCustomerProfileError,
  MissingCustomerError,
  type CustomerListItem,
} from "@/hooks/useCustomerFiscalProfiles";
import {
  customerFiscalFormSchema,
  rowToFormValues,
  maskDocument,
  MissingCustomerIdError,
  TAXPAYER_INDICATOR_VALUES,
  type CustomerFiscalFormValues,
} from "@/lib/fiscal/customerFiscalValidation";
import {
  UF_OPTIONS, COUNTRY_OPTIONS, STATE_REG_STATUS_OPTIONS,
  withLegacyOption, type FiscalOption,
  CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS,
  TAXPAYER_INDICATOR_OPTIONS,
  getFiscalStatusLabel,
  getTaxpayerIndicatorLabel,
} from "@/lib/fiscal/fiscalOptions";
import { useFiscalClientesLite } from "@/hooks/useFiscalClientesLite";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCEP, formatTelefone, unmask } from "@/lib/masks";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ShieldOff, Loader2, Pencil, Plus } from "lucide-react";

const PAGE_TITLE = "Perfis Fiscais de Clientes";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";
const PAGE_SIZE = 20;
const STATUS_ALL = "__all__";
const TAX_ALL = "__all_tax__";
const TAX_NONE = "__none__";

// Rótulos de indicador de contribuinte agora vêm da fonte canônica
// (TAXPAYER_INDICATOR_OPTIONS / getTaxpayerIndicatorLabel).

// Campos que compõem o bloco de endereço fiscal substituto.
// Quando `use_main_address = true`, o bloco é recolhido, sem apagar valores.
const FISCAL_ADDRESS_FIELDS: ReadonlySet<StringField> = new Set<StringField>([
  "fiscal_postal_code",
  "fiscal_street",
  "fiscal_number",
  "fiscal_complement",
  "fiscal_neighborhood",
  "fiscal_city",
  "fiscal_municipality_ibge_code",
  "fiscal_state",
  "country_code",
]);

type StringField =
  | "state_registration_status"
  | "municipal_registration"
  | "fiscal_email"
  | "fiscal_phone"
  | "fiscal_postal_code"
  | "fiscal_street"
  | "fiscal_number"
  | "fiscal_complement"
  | "fiscal_neighborhood"
  | "fiscal_city"
  | "fiscal_municipality_ibge_code"
  | "fiscal_state"
  | "country_code";

const STRING_FIELD_META: { key: StringField; label: string; numeric?: boolean; select?: FiscalOption[]; hint?: string }[] = [
  { key: "state_registration_status", label: "Situação da Inscrição Estadual", select: STATE_REG_STATUS_OPTIONS },
  { key: "municipal_registration", label: "Inscrição Municipal" },
  { key: "fiscal_email", label: "E-mail fiscal" },
  { key: "fiscal_phone", label: "Telefone fiscal" },
  { key: "fiscal_postal_code", label: "CEP fiscal" },
  { key: "fiscal_street", label: "Logradouro" },
  { key: "fiscal_number", label: "Número" },
  { key: "fiscal_complement", label: "Complemento" },
  { key: "fiscal_neighborhood", label: "Bairro" },
  { key: "fiscal_city", label: "Município" },
  { key: "fiscal_municipality_ibge_code", label: "Município IBGE (7 dígitos)", numeric: true, hint: "Consulte em ibge.gov.br/localidades." },
  { key: "fiscal_state", label: "UF", select: UF_OPTIONS },
  { key: "country_code", label: "País", select: COUNTRY_OPTIONS },
];

export default function FiscalClientes() {
  const { role } = useAuth();
  const access = getAccessLevel(role, "/configuracoes/fiscal/clientes");
  const canEdit = access === "rw";
  const uiEnabled = FEATURE_FLAGS.fiscalCustomerProfilesUi === true;
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [taxpayer, setTaxpayer] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CustomerListItem | "new" | null>(null);
  // Atalho da Guia Fiscal (?cliente=<customer_id>): abre o perfil existente ou o editor novo com o cliente
  // pré-selecionado; nada é gravado até o usuário salvar pelo fluxo canônico.
  const [searchParams] = useSearchParams();
  const deepCustomerId = searchParams.get("cliente");
  const [presetCustomerId, setPresetCustomerId] = useState<string | null>(null);
  const deepHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!deepCustomerId || deepHandled.current === deepCustomerId || access === "none" || !uiEnabled) return;
    deepHandled.current = deepCustomerId;
    let alive = true;
    (supabase as any).from("customer_fiscal_profiles")
      .select("id, customer_id, taxpayer_indicator, state_registration_status, municipal_registration, fiscal_municipality_ibge_code, fiscal_city, fiscal_state, rural_producer_indicator, foreign_customer_indicator, profile_status, updated_at")
      .eq("customer_id", deepCustomerId).maybeSingle()
      .then(({ data, error }: { data: CustomerListItem | null; error: unknown }) => {
        if (!alive || error) return;
        if (data) setEditing({ ...data, cliente_nome: null, cliente_cpf_cnpj: null } as CustomerListItem);
        else if (canEdit) { setPresetCustomerId(deepCustomerId); setEditing("new"); }
      });
    return () => { alive = false; };
  }, [deepCustomerId, access, uiEnabled, canEdit]);

  const listQuery = useCustomerFiscalList(
    { search, status, taxpayerIndicator: taxpayer, page, pageSize: PAGE_SIZE },
    { enabled: uiEnabled && access !== "none" },
  );
  const customerIds = useMemo(
    () => (listQuery.data?.items ?? []).map((it) => it.customer_id),
    [listQuery.data],
  );
  const readinessQuery = useCustomerFiscalReadiness(customerIds, {
    enabled: uiEnabled && access !== "none",
  });

  const permissionDenied =
    listQuery.error?.message === "permission_denied" ||
    readinessQuery.error?.message === "permission_denied";

  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-clientes-forbidden">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você não tem acesso aos perfis fiscais de clientes.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!uiEnabled) {
    return (
      <div className="p-6 max-w-3xl" data-testid="fiscal-clientes-preparation">
        <Card>
          <CardHeader>
            <CardTitle>{PAGE_TITLE}</CardTitle>
            <CardDescription>Módulo fiscal em preparação</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>{EMISSION_BANNER}</AlertTitle>
              <AlertDescription>
                Esta tela ficará disponível quando os perfis fiscais de
                clientes forem habilitados. Nenhuma emissão está ativa.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="p-6" data-testid="fiscal-clientes-permission-denied">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão para ler perfis fiscais</AlertTitle>
          <AlertDescription>Solicite acesso ao administrador.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const readinessByCustomer = new Map(
    (readinessQuery.data ?? []).map((r) => [r.customer_id ?? "", r] as const),
  );

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE),
  );

  const readinessSummary = {
    withIbge: (readinessQuery.data ?? []).filter((r) => r.has_ibge).length,
    total: readinessQuery.data?.length ?? 0,
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4" data-testid="fiscal-clientes-page">
      <header className="space-y-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
          <p className="text-sm text-muted-foreground">
            Preparação fiscal por cliente. Nenhuma nota fiscal é emitida por esta tela.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setEditing("new")} aria-label="Novo perfil fiscal de cliente">
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        ) : null}
      </header>

      <Alert data-testid="fiscal-emission-banner">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription>
          Trava técnica de emissão ativa: <strong>{String(emissionLock)}</strong>.
          CPF/CNPJ é sempre exibido mascarado.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de prontidão (página atual)</CardTitle>
          <CardDescription>
            Derivado de <code>v_customer_fiscal_readiness</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Perfis na página</div>
            <div className="font-medium">{readinessSummary.total}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Com IBGE fiscal</div>
            <div className="font-medium">{readinessSummary.withIbge}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col sm:flex-row gap-2 md:flex-1 flex-wrap">
            <Input
              placeholder="Buscar por nome ou documento do cliente"
              aria-label="Buscar por nome ou documento do cliente"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="max-w-sm"
            />
            <Select
              value={status ?? STATUS_ALL}
              onValueChange={(v) => { setStatus(v === STATUS_ALL ? null : v); setPage(0); }}
            >
              <SelectTrigger className="max-w-xs" aria-label="Filtrar por status">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STATUS_ALL}>Todos os status</SelectItem>
                {CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={taxpayer ?? TAX_ALL}
              onValueChange={(v) => {
                setTaxpayer(v === TAX_ALL ? null : v);
                setPage(0);
              }}
            >
              <SelectTrigger className="max-w-xs" aria-label="Filtrar por indicador de contribuinte">
                <SelectValue placeholder="Todos os contribuintes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TAX_ALL}>Todos os contribuintes</SelectItem>
                {TAXPAYER_INDICATOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="fiscal-clientes-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
            </div>
          ) : listQuery.isError ? (
            <Alert variant="destructive" data-testid="fiscal-clientes-error">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Não foi possível carregar</AlertTitle>
              <AlertDescription>Tente novamente em instantes.</AlertDescription>
            </Alert>
          ) : (listQuery.data?.items.length ?? 0) === 0 ? (
            <Alert data-testid="fiscal-clientes-empty">
              <AlertTitle>Nenhum perfil de cliente encontrado</AlertTitle>
              <AlertDescription>Ajuste a busca ou crie um novo perfil.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table" aria-label="Perfis fiscais de clientes">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Cliente</th>
                      <th className="p-2">Documento</th>
                      <th className="p-2">Contribuinte</th>
                      <th className="p-2">IE/IM</th>
                      <th className="p-2">Município (IBGE)</th>
                      <th className="p-2">Status</th>
                      <th className="p-2" title="Verificação inicial dos campos essenciais. A revisão contábil e os demais dados fiscais continuam necessários antes da emissão.">Prontidão mínima</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQuery.data!.items.map((it) => {
                      const r = readinessByCustomer.get(it.customer_id);
                      const pending = !r?.has_ibge;
                      const nome = it.cliente_nome ?? "—";
                      const doc = maskDocument(it.cliente_cpf_cnpj);
                      const contrib = it.taxpayer_indicator
                        ? getTaxpayerIndicatorLabel(it.taxpayer_indicator)
                        : "—";
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="p-2">
                            <div className="font-medium">{nome}</div>
                            {it.cliente_codigo ? (
                              <div className="text-xs text-muted-foreground">{it.cliente_codigo}</div>
                            ) : null}
                          </td>
                          <td className="p-2 font-mono text-xs">{doc}</td>
                          <td className="p-2">{contrib}</td>
                          <td className="p-2">
                            <div>{it.state_registration_status ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              IM: {it.municipal_registration ?? "—"}
                            </div>
                          </td>
                          <td className="p-2">
                            {it.fiscal_municipality_ibge_code
                              ? `${it.fiscal_municipality_ibge_code} · ${it.fiscal_city ?? "—"}/${it.fiscal_state ?? "—"}`
                              : "—"}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" title={it.profile_status ?? undefined}>
                              {getFiscalStatusLabel("customer", it.profile_status)}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {pending ? (
                              <Badge variant="destructive" data-testid="pending-badge">Pendente</Badge>
                            ) : (
                              <Badge>OK</Badge>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditing(it)}
                              aria-label={`${canEdit ? "Editar" : "Ver"} perfil fiscal de ${nome}`}
                            >
                              {canEdit ? <Pencil className="h-4 w-4" /> : "Ver"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground">
                  Página {page + 1} de {totalPages} — {listQuery.data?.total ?? 0} perfis
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >Anterior</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >Próxima</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Marker to keep TAX_NONE constant referenced (reserved for future
          "sem indicador" filter without breaking the empty state). */}
      <span className="sr-only" data-taxnone={TAX_NONE} aria-hidden />

      {editing !== null ? (
        <EditDrawer
          item={editing}
          canEdit={canEdit}
          knownProfiledCustomerIds={customerIds}
          presetCustomerId={editing === "new" ? presetCustomerId : null}
          onClose={() => { setEditing(null); setPresetCustomerId(null); }}
        />
      ) : null}
    </div>
  );
}

function EditDrawer({
  item, canEdit, knownProfiledCustomerIds, presetCustomerId = null, onClose,
}: {
  item: CustomerListItem | "new";
  presetCustomerId?: string | null;
  canEdit: boolean;
  knownProfiledCustomerIds?: readonly string[];
  onClose: () => void;
}) {
  const isNew = item === "new";
  const profileId = isNew ? null : item.id;
  const profileQuery = useCustomerFiscalProfile(profileId);
  const save = useSaveCustomerFiscalProfile();

  const [values, setValues] = useState<CustomerFiscalFormValues>(() =>
    rowToFormValues(null),
  );
  const [customerIdInput, setCustomerIdInput] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isNew) {
      setValues(rowToFormValues(null));
      setCustomerIdInput(presetCustomerId ?? "");
      return;
    }
    if (profileQuery.data !== undefined) {
      setValues(rowToFormValues(profileQuery.data));
      setCustomerIdInput(profileQuery.data?.customer_id ?? item.customer_id);
    }
  }, [isNew, profileQuery.data, item, presetCustomerId]);

  function setField<K extends keyof CustomerFiscalFormValues>(
    k: K,
    v: CustomerFiscalFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErrors({});
    const parsed = customerFiscalFormSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      toast({ title: "Verifique os campos", variant: "destructive" });
      return;
    }

    const targetCustomerId = isNew
      ? customerIdInput.trim()
      : (profileQuery.data?.customer_id ?? item.customer_id);

    try {
      await save.mutateAsync({
        current: isNew ? null : profileQuery.data ?? null,
        customerId: targetCustomerId,
        values: parsed.data,
      });
      toast({ title: "Perfil fiscal salvo." });
      onClose();
    } catch (err) {
      if (err instanceof OptimisticConflictError) {
        toast({
          title: "Conflito de atualização",
          description: "Outro usuário alterou este perfil. Recarregue e tente novamente.",
          variant: "destructive",
        });
        return;
      }
      if (err instanceof DuplicateCustomerProfileError) {
        toast({
          title: "Perfil duplicado",
          description: "Já existe um perfil fiscal para este cliente.",
          variant: "destructive",
        });
        return;
      }
      if (err instanceof MissingCustomerIdError) {
        setErrors((e) => ({
          ...e,
          customer_id: "Informe um customer_id válido (UUID).",
        }));
        toast({ title: "Cliente inválido", variant: "destructive" });
        return;
      }
      if (err instanceof MissingCustomerError) {
        setErrors((e) => ({
          ...e,
          customer_id: "Cliente não encontrado no cadastro mestre.",
        }));
        toast({ title: "Cliente não encontrado", variant: "destructive" });
        return;
      }
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") {
        toast({ title: "Sem permissão para salvar", variant: "destructive" });
      } else {
        toast({ title: "Não foi possível salvar", variant: "destructive" });
      }
    }
  }

  const loading = !isNew && profileQuery.isLoading;
  const title = isNew
    ? "Novo perfil fiscal de cliente"
    : canEdit
    ? "Editar perfil fiscal"
    : "Detalhes do perfil fiscal";

  const headerDoc = isNew
    ? "Preencha o vínculo com o cliente e a classificação fiscal."
    : `${item.cliente_nome ?? "Cliente"} — ${maskDocument(item.cliente_cpf_cnpj)}`;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{headerDoc}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" aria-label="Formulário de perfil fiscal de cliente">
            <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="f-customer_id">Cliente</Label>
                {isNew ? (
                  <CustomerPicker
                    value={customerIdInput}
                    onPick={(id) => setCustomerIdInput(id)}
                    invalid={!!errors.customer_id}
                    excludeIds={knownProfiledCustomerIds}
                  />
                ) : (
                  <Input
                    id="f-customer_id"
                    value={customerIdInput}
                    readOnly
                    disabled
                    aria-invalid={!!errors.customer_id}
                  />
                )}
                {errors.customer_id ? (
                  <p className="text-xs text-destructive" role="alert">{errors.customer_id}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Vínculo com o cadastro mestre do cliente. Não pode ser alterado após a criação.
                  </p>
                )}
              </div>

              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="f-taxpayer_indicator">Indicador de contribuinte</Label>
                <Select
                  value={values.taxpayer_indicator ?? ""}
                  onValueChange={(v) => setField("taxpayer_indicator", v === TAX_NONE ? "" : v)}
                >
                  <SelectTrigger id="f-taxpayer_indicator" aria-invalid={!!errors.taxpayer_indicator}>
                    <SelectValue placeholder="Não informado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TAX_NONE}>Não informado</SelectItem>
                    {TAXPAYER_INDICATOR_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.taxpayer_indicator ? (
                  <p className="text-xs text-destructive" role="alert">{errors.taxpayer_indicator}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="f-use_main_address"
                  checked={values.use_main_address ?? true}
                  onCheckedChange={(v) => setField("use_main_address", v !== false)}
                />
                <Label htmlFor="f-use_main_address" className="cursor-pointer">
                  Usar endereço principal do cliente
                </Label>
              </div>
              {(values.use_main_address ?? true) ? (
                <p className="text-xs text-muted-foreground -mt-2" data-testid="fiscal-address-collapsed-hint">
                  O endereço fiscal substituto está oculto porque o cadastro principal do cliente será usado. Desmarque acima para preencher um endereço fiscal específico. Valores já preenchidos são preservados.
                </p>
              ) : null}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="f-rural"
                  checked={values.rural_producer_indicator ?? false}
                  onCheckedChange={(v) => setField("rural_producer_indicator", v === true)}
                />
                <Label htmlFor="f-rural" className="cursor-pointer">
                  Produtor rural
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="f-foreign"
                  checked={values.foreign_customer_indicator ?? false}
                  onCheckedChange={(v) => setField("foreign_customer_indicator", v === true)}
                />
                <Label htmlFor="f-foreign" className="cursor-pointer">
                  Cliente do exterior
                </Label>
              </div>

              {STRING_FIELD_META.filter(({ key }) => {
                // Recolhe (não apaga) o bloco de endereço fiscal substituto
                // enquanto "Usar endereço principal do cliente" estiver ativo.
                if (FISCAL_ADDRESS_FIELDS.has(key) && (values.use_main_address ?? true)) {
                  return false;
                }
                return true;
              }).map(({ key, label, numeric, select, hint }) => {
                const isEmail = key === "fiscal_email";
                const isPhone = key === "fiscal_phone";
                const isCep = key === "fiscal_postal_code";
                const isUf = key === "fiscal_state";
                const isIbge = key === "fiscal_municipality_ibge_code";
                const raw = values[key] ?? "";
                if (select) {
                  const opts = withLegacyOption(select, raw);
                  return (
                    <div key={key} className="grid min-w-0 content-start gap-1.5">
                      <Label htmlFor={`f-${key}`}>{label}</Label>
                      <select
                        id={`f-${key}`}
                        className="h-10 border rounded-md px-3 bg-background disabled:opacity-60"
                        value={raw}
                        onChange={(e) => setField(key, e.target.value)}
                        aria-invalid={!!errors[key]}
                      >
                        <option value="">— selecione —</option>
                        {opts.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {errors[key] ? (
                        <p className="text-xs text-destructive" role="alert">{errors[key]}</p>
                      ) : hint ? (
                        <p className="text-xs text-muted-foreground">{hint}</p>
                      ) : null}
                    </div>
                  );
                }
                let displayValue: string = raw;
                if (isPhone) displayValue = formatTelefone(raw);
                else if (isCep) displayValue = formatCEP(raw);
                const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  if (isPhone) return setField(key, unmask(v).slice(0, 11));
                  if (isCep) return setField(key, unmask(v).slice(0, 8));
                  if (isIbge) return setField(key, unmask(v).slice(0, 7));
                  if (isUf) return setField(key, v.toUpperCase().slice(0, 2));
                  return setField(key, v);
                };
                return (
                  <div key={key} className="grid min-w-0 content-start gap-1.5">
                    <Label htmlFor={`f-${key}`}>{label}</Label>
                    <Input
                      id={`f-${key}`}
                      value={displayValue}
                      onChange={handleChange}
                      onBlur={isEmail ? (e) => setField(key, e.target.value.trim()) : undefined}
                      aria-invalid={!!errors[key]}
                      inputMode={
                        isPhone ? "tel" : isEmail ? "email" : numeric || isCep ? "numeric" : undefined
                      }
                      type={isEmail ? "email" : "text"}
                      spellCheck={isEmail ? false : undefined}
                      autoComplete={
                        isEmail ? "email" : isPhone ? "tel" : isCep ? "postal-code" : undefined
                      }
                      maxLength={
                        isCep ? 9 : isPhone ? 15 : isUf ? 2 : isIbge ? 7 : undefined
                      }
                      placeholder={
                        isCep
                          ? "00000-000"
                          : isPhone
                          ? "(00) 00000-0000"
                          : isEmail
                          ? "email@dominio.com"
                          : isUf
                          ? "UF"
                          : isIbge
                          ? "0000000"
                          : undefined
                      }
                    />
                    {errors[key] ? (
                      <p className="text-xs text-destructive" role="alert">{errors[key]}</p>
                    ) : hint ? (
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
            <SheetFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                {canEdit ? "Cancelar" : "Fechar"}
              </Button>
              {canEdit ? (
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Salvando…" : "Salvar"}
                </Button>
              ) : null}
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * CustomerPicker — seletor de cliente com busca sanitizada.
 * Consome `useFiscalClientesLite`, exibindo nome + código + documento
 * mascarado. Trata explicitamente `permission_denied` e `error`.
 * Não expõe o `id` técnico ao usuário; apenas repassa via `onPick`.
 */
function CustomerPicker({
  value,
  onPick,
  invalid,
  excludeIds,
}: {
  value: string;
  onPick: (customerId: string) => void;
  invalid?: boolean;
  excludeIds?: readonly string[];
}) {
  const [term, setTerm] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [picked, setPicked] = useState<{ id: string; nome: string; doc: string | null; codigo: string | null } | null>(null);
  const listQ = useFiscalClientesLite(term, { excludeIds, excludeProfiled: true });

  useEffect(() => {
    if (!value) setPicked(null);
  }, [value]);

  const status = listQ.data?.status ?? "ok";
  const items = listQ.data?.items ?? [];

  return (
    <div className="relative">
      <Input
        id="f-customer_id"
        value={picked ? `${picked.nome}${picked.codigo ? ` · ${picked.codigo}` : ""}` : term}
        onChange={(e) => {
          setPicked(null);
          onPick("");
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-invalid={invalid}
        placeholder="Digite nome, código ou documento do cliente"
        autoComplete="off"
      />
      {open && term.trim().length >= 2 && !picked ? (
        <div className="mt-1 max-h-56 overflow-auto rounded border bg-background shadow-sm">
          {listQ.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground">Buscando…</div>
          ) : status === "permission_denied" ? (
            <div className="p-2 text-xs text-muted-foreground">Sem permissão para consultar clientes.</div>
          ) : status === "error" ? (
            <div className="p-2 text-xs text-destructive">Falha ao consultar clientes. Tente novamente.</div>
          ) : items.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <ul className="text-sm" role="listbox" aria-label="Resultados de clientes">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted"
                    onClick={() => {
                      setPicked({ id: c.id, nome: c.nome, doc: c.cpf_cnpj, codigo: c.codigo_cliente });
                      onPick(c.id);
                      setTerm(c.nome);
                      setOpen(false);
                    }}
                  >
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {c.codigo_cliente ? `${c.codigo_cliente} · ` : ""}{maskDocument(c.cpf_cnpj)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
