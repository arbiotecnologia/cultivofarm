/**
 * Fase Fiscal 3.3 — Perfis Fiscais de Serviços.
 * Tela isolada, sem emissão, sem integração externa.
 * Não existe catálogo canônico de serviços — a fonte é a própria tabela
 * `service_fiscal_profiles`. `source_reference` é a referência transitória.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useServiceFiscalList,
  useServiceFiscalReadiness,
  useServiceFiscalProfile,
  useSaveServiceFiscalProfile,
  OptimisticConflictError,
  DuplicateServiceProfileError,
  type ServiceListItem,
} from "@/hooks/useServiceFiscalProfiles";
import {
  serviceFiscalFormSchema,
  rowToFormValues,
  buildIdentity,
  MissingServiceIdentifierError,
  type ServiceFiscalFormValues,
} from "@/lib/fiscal/serviceFiscalValidation";
import {
  REQUIREMENT_STATUS_OPTIONS, withLegacyOption, type FiscalOption,
  SERVICE_FISCAL_PROFILE_STATUS_OPTIONS, getFiscalStatusLabel,
} from "@/lib/fiscal/fiscalOptions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { IbsCbsItemCard } from "@/components/fiscal/IbsCbsItemCard";


const PAGE_TITLE = "Perfis Fiscais de Serviços";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";
const PAGE_SIZE = 20;
const STATUS_ALL = "__all__";

type StringField =
  | "service_name"
  | "fiscal_description_template"
  | "lc116_item"
  | "cnae"
  | "national_taxation_code"
  | "municipal_taxation_code"
  | "incidence_municipality_ibge_code"
  | "requirement_status"
  | "accounting_notes";

const STRING_FIELD_META: { key: StringField; label: string; numeric?: boolean; select?: FiscalOption[]; hint?: string; placeholder?: string }[] = [
  { key: "service_name", label: "Nome do serviço" },
  { key: "fiscal_description_template", label: "Descrição fiscal (template)" },
  { key: "lc116_item", label: "Item LC 116", hint: "Ex.: 1.05 — Licenciamento de programas.", placeholder: "0.00" },
  { key: "cnae", label: "CNAE", numeric: true, hint: "7 dígitos numéricos.", placeholder: "0000000" },
  { key: "national_taxation_code", label: "Código nacional de tributação" },
  { key: "municipal_taxation_code", label: "Código municipal de tributação" },
  { key: "incidence_municipality_ibge_code", label: "Município de incidência (IBGE)", numeric: true, hint: "7 dígitos — consulte em ibge.gov.br/localidades.", placeholder: "0000000" },
  { key: "requirement_status", label: "Status de requisitos", select: REQUIREMENT_STATUS_OPTIONS },
  { key: "accounting_notes", label: "Notas contábeis" },
];

export default function FiscalServicos() {
  const { role } = useAuth();
  const access = getAccessLevel(role, "/configuracoes/fiscal/servicos");
  const canEdit = access === "rw";
  const uiEnabled = FEATURE_FLAGS.fiscalServiceProfilesUi === true;
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ServiceListItem | "new" | null>(null);

  const listQuery = useServiceFiscalList(
    { search, status, page, pageSize: PAGE_SIZE },
    { enabled: uiEnabled && access !== "none" },
  );
  const profileIds = useMemo(
    () => (listQuery.data?.items ?? []).map((it) => it.id),
    [listQuery.data],
  );
  const readinessQuery = useServiceFiscalReadiness(profileIds, {
    enabled: uiEnabled && access !== "none",
  });

  const permissionDenied =
    listQuery.error?.message === "permission_denied" ||
    readinessQuery.error?.message === "permission_denied";

  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-servicos-forbidden">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você não tem acesso aos perfis fiscais de serviços.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!uiEnabled) {
    return (
      <div className="p-6 max-w-3xl" data-testid="fiscal-servicos-preparation">
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
                serviços forem habilitados. Nenhuma emissão está ativa.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="p-6" data-testid="fiscal-servicos-permission-denied">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão para ler perfis fiscais</AlertTitle>
          <AlertDescription>Solicite acesso ao administrador.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const readinessById = new Map(
    (readinessQuery.data ?? []).map((r) => [r.id ?? "", r] as const),
  );

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE),
  );

  const readinessSummary = {
    minimally: (readinessQuery.data ?? []).filter((r) => r.minimally_classified).length,
    accounting: (readinessQuery.data ?? []).filter((r) => r.accounting_validated).length,
    total: readinessQuery.data?.length ?? 0,
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4" data-testid="fiscal-servicos-page">
      <header className="space-y-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
          <p className="text-sm text-muted-foreground">
            Preparação fiscal de serviços. Nenhuma NFS-e é emitida por esta tela.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setEditing("new")} aria-label="Novo perfil fiscal de serviço">
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        ) : null}
      </header>

      <Alert data-testid="fiscal-emission-banner">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription>
          Trava técnica de emissão ativa: <strong>{String(emissionLock)}</strong>.
          Não há catálogo canônico de serviços; a referência é <code>source_reference</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de prontidão (página atual)</CardTitle>
          <CardDescription>
            Derivado de <code>v_service_fiscal_readiness</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Perfis na página</div>
            <div className="font-medium">{readinessSummary.total}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Minimamente classificados</div>
            <div className="font-medium">{readinessSummary.minimally}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Validados contabilmente</div>
            <div className="font-medium">{readinessSummary.accounting}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col sm:flex-row gap-2 md:flex-1">
            <Input
              placeholder="Buscar por referência, nome ou descrição fiscal"
              aria-label="Buscar por referência, nome ou descrição fiscal do serviço"
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
                {SERVICE_FISCAL_PROFILE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="fiscal-servicos-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
            </div>
          ) : listQuery.isError ? (
            <Alert variant="destructive" data-testid="fiscal-servicos-error">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Não foi possível carregar</AlertTitle>
              <AlertDescription>Tente novamente em instantes.</AlertDescription>
            </Alert>
          ) : (listQuery.data?.items.length ?? 0) === 0 ? (
            <Alert data-testid="fiscal-servicos-empty">
              <AlertTitle>Nenhum perfil de serviço encontrado</AlertTitle>
              <AlertDescription>Ajuste a busca ou crie um novo perfil.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table" aria-label="Perfis fiscais de serviços">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Identificador</th>
                      <th className="p-2">Descrição</th>
                      <th className="p-2">LC 116</th>
                      <th className="p-2">CNAE</th>
                      <th className="p-2">Cód. municipal</th>
                      <th className="p-2">Status</th>
                      <th className="p-2" title="Verificação inicial dos campos essenciais. A revisão contábil e os demais dados fiscais continuam necessários antes da emissão.">Prontidão mínima</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQuery.data!.items.map((it) => {
                      const r = readinessById.get(it.id);
                      const pending = !r?.minimally_classified;
                      const identifier = it.source_reference ?? it.service_id ?? "—";
                      const description = it.fiscal_description_template ?? it.service_name ?? "—";
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="p-2">
                            <div className="font-medium">{identifier}</div>
                            {it.service_name ? (
                              <div className="text-xs text-muted-foreground">{it.service_name}</div>
                            ) : null}
                          </td>
                          <td className="p-2 max-w-xs truncate">{description}</td>
                          <td className="p-2">{it.lc116_item ?? "—"}</td>
                          <td className="p-2">{it.cnae ?? "—"}</td>
                          <td className="p-2">{it.municipal_taxation_code ?? "—"}</td>
                          <td className="p-2">
                            <Badge variant="outline" title={it.profile_status ?? undefined}>
                              {getFiscalStatusLabel("service", it.profile_status)}
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
                              aria-label={`${canEdit ? "Editar" : "Ver"} perfil fiscal ${identifier}`}
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

      {editing !== null ? (
        <EditDrawer
          item={editing}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function EditDrawer({
  item, canEdit, onClose,
}: {
  item: ServiceListItem | "new";
  canEdit: boolean;
  onClose: () => void;
}) {
  const isNew = item === "new";
  const profileId = isNew ? null : item.id;
  const profileQuery = useServiceFiscalProfile(profileId);
  const save = useSaveServiceFiscalProfile();

  const [values, setValues] = useState<ServiceFiscalFormValues>(() =>
    rowToFormValues(null),
  );
  const [serviceIdInput, setServiceIdInput] = useState<string>("");
  const [sourceReferenceInput, setSourceReferenceInput] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isNew) {
      setValues(rowToFormValues(null));
      setServiceIdInput("");
      setSourceReferenceInput("");
      return;
    }
    if (profileQuery.data !== undefined) {
      setValues(rowToFormValues(profileQuery.data));
      setServiceIdInput(profileQuery.data?.service_id ?? "");
      setSourceReferenceInput(profileQuery.data?.source_reference ?? "");
    }
  }, [isNew, profileQuery.data]);

  function setField<K extends keyof ServiceFiscalFormValues>(
    k: K,
    v: ServiceFiscalFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErrors({});
    const parsed = serviceFiscalFormSchema.safeParse(values);
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

    const identity = buildIdentity({
      service_id: serviceIdInput,
      source_reference: sourceReferenceInput,
    });
    if (!identity.service_id && !identity.source_reference) {
      setErrors((e) => ({
        ...e,
        source_reference:
          "Informe um service_id válido ou uma referência (source_reference).",
      }));
      toast({
        title: "Identificador obrigatório",
        description: "Informe service_id (UUID válido) ou source_reference.",
        variant: "destructive",
      });
      return;
    }
    if (
      !identity.service_id &&
      serviceIdInput.trim() !== "" &&
      serviceIdInput.trim() !== (profileQuery.data?.service_id ?? "")
    ) {
      setErrors((e) => ({ ...e, service_id: "UUID inválido." }));
      toast({ title: "service_id inválido", variant: "destructive" });
      return;
    }

    try {
      await save.mutateAsync({
        current: isNew ? null : profileQuery.data ?? null,
        identity,
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
      if (err instanceof DuplicateServiceProfileError) {
        toast({
          title: "Perfil duplicado",
          description:
            err.kind === "service_id"
              ? "Já existe um perfil ativo para este service_id."
              : "Já existe um perfil ativo com esta referência (source_reference).",
          variant: "destructive",
        });
        return;
      }
      if (err instanceof MissingServiceIdentifierError) {
        toast({ title: "Identificador obrigatório", variant: "destructive" });
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
  const title =
    isNew
      ? "Novo perfil fiscal de serviço"
      : canEdit
      ? "Editar perfil fiscal"
      : "Detalhes do perfil fiscal";

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isNew
              ? "Preencha identificador e classificação fiscal."
              : (item.source_reference ?? item.service_id ?? "—")}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" aria-label="Formulário de perfil fiscal de serviço">
            <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="f-service_id">service_id (UUID, opcional)</Label>
                <Input
                  id="f-service_id"
                  value={serviceIdInput}
                  onChange={(e) => setServiceIdInput(e.target.value)}
                  aria-invalid={!!errors.service_id}
                  placeholder="Ex.: 00000000-0000-0000-0000-000000000000"
                />
                {errors.service_id ? (
                  <p className="text-xs text-destructive" role="alert">{errors.service_id}</p>
                ) : null}
              </div>

              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="f-source_reference">source_reference (referência transitória)</Label>
                <Input
                  id="f-source_reference"
                  value={sourceReferenceInput}
                  onChange={(e) => setSourceReferenceInput(e.target.value)}
                  aria-invalid={!!errors.source_reference}
                />
                {errors.source_reference ? (
                  <p className="text-xs text-destructive" role="alert">{errors.source_reference}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Comparação case-insensitive; espaços em branco laterais são removidos.
                  </p>
                )}
              </div>

              {STRING_FIELD_META.map(({ key, label, numeric, select, hint, placeholder }) => {
                const raw = values[key] ?? "";
                return (
                  <div key={key} className="grid min-w-0 content-start gap-1.5">
                    <Label htmlFor={`f-${key}`}>{label}</Label>
                    {select ? (
                      <select
                        id={`f-${key}`}
                        className="h-10 border rounded-md px-3 bg-background disabled:opacity-60"
                        value={raw}
                        onChange={(e) => setField(key, e.target.value)}
                        aria-invalid={!!errors[key]}
                      >
                        <option value="">— selecione —</option>
                        {withLegacyOption(select, raw).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`f-${key}`}
                        value={raw}
                        placeholder={placeholder}
                        onChange={(e) => setField(key, e.target.value)}
                        aria-invalid={!!errors[key]}
                        inputMode={numeric ? "numeric" : undefined}
                      />
                    )}
                    {errors[key] ? (
                      <p className="text-xs text-destructive" role="alert">{errors[key]}</p>
                    ) : hint ? (
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    ) : null}
                  </div>
                );
              })}

              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="f-iss_rate">Alíquota ISS (%)</Label>
                <Input
                  id="f-iss_rate"
                  value={values.iss_rate ?? ""}
                  onChange={(e) => setField("iss_rate", e.target.value)}
                  aria-invalid={!!errors.iss_rate}
                  inputMode="decimal"
                />
                {errors.iss_rate ? (
                  <p className="text-xs text-destructive" role="alert">{errors.iss_rate}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="f-iss_withheld_default"
                  checked={values.iss_withheld_default ?? false}
                  onCheckedChange={(v) => setField("iss_withheld_default", v === true)}
                />
                <Label htmlFor="f-iss_withheld_default" className="cursor-pointer">
                  ISS retido por padrão
                </Label>
              </div>
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
        {!isNew ? (
          <div className="mt-6" data-testid="fiscal-servicos-ibs-cbs">
            <IbsCbsItemCard kind="service_profile" itemId={item.id ?? null} canEdit={canEdit} />
          </div>
        ) : null}
      </SheetContent>

    </Sheet>
  );
}
