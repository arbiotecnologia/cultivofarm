/**
 * Fase Fiscal 3.2 — Perfis Fiscais de Produtos.
 * Tela isolada, sem emissão, sem integração externa.
 */
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useProductFiscalList,
  useProductFiscalReadiness,
  useProductFiscalProfile,
  useSaveProductFiscalProfile,
  OptimisticConflictError,
  type ProductListItem,
} from "@/hooks/useProductFiscalProfiles";
import {
  productFiscalFormSchema,
  rowToFormValues,
  type ProductFiscalFormValues,
} from "@/lib/fiscal/productFiscalValidation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ShieldOff, Loader2, Pencil, Plus } from "lucide-react";

const PAGE_TITLE = "Perfis Fiscais de Produtos";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";
const PAGE_SIZE = 20;
const STATUS_ALL = "__all__";

type FieldKey = keyof ProductFiscalFormValues;

const FIELD_LABELS: Record<FieldKey, string> = {
  ncm: "NCM",
  cest: "CEST",
  cfop_in_state: "CFOP interno",
  cfop_interstate: "CFOP interestadual",
  origin_code: "Origem",
  icms_cst: "ICMS CST",
  icms_csosn: "ICMS CSOSN",
  ipi_cst: "IPI CST",
  pis_cst: "PIS CST",
  cofins_cst: "COFINS CST",
  commercial_unit: "Unidade comercial",
  taxable_unit: "Unidade tributável",
  taxable_gtin: "GTIN tributável",
  gtin: "GTIN",
  fiscal_description: "Descrição fiscal",
  tax_benefit_code: "Código de benefício fiscal",
  accounting_notes: "Notas contábeis",
};

const FIELD_ORDER: FieldKey[] = [
  "ncm", "cest", "cfop_in_state", "cfop_interstate",
  "origin_code", "icms_cst", "icms_csosn", "ipi_cst",
  "pis_cst", "cofins_cst", "commercial_unit", "taxable_unit",
  "taxable_gtin", "gtin", "tax_benefit_code",
  "fiscal_description", "accounting_notes",
];

import {
  ORIGIN_CODE_OPTIONS, ICMS_CST_OPTIONS, ICMS_CSOSN_OPTIONS,
  IPI_CST_OPTIONS, PIS_COFINS_CST_OPTIONS, withLegacyOption,
  type FiscalOption,
} from "@/lib/fiscal/fiscalOptions";

const FIELD_SELECTS: Partial<Record<FieldKey, FiscalOption[]>> = {
  origin_code: ORIGIN_CODE_OPTIONS,
  icms_cst: ICMS_CST_OPTIONS,
  icms_csosn: ICMS_CSOSN_OPTIONS,
  ipi_cst: IPI_CST_OPTIONS,
  pis_cst: PIS_COFINS_CST_OPTIONS,
  cofins_cst: PIS_COFINS_CST_OPTIONS,
};

const FIELD_HINTS: Partial<Record<FieldKey, string>> = {
  ncm: "8 dígitos numéricos, ex.: 10059010.",
  cest: "7 dígitos numéricos, quando aplicável.",
  cfop_in_state: "Ex.: 5102 — Venda de mercadoria adquirida.",
  cfop_interstate: "Ex.: 6102 — Venda interestadual.",
  gtin: "GTIN-13/14 ou SEM GTIN.",
  taxable_gtin: "GTIN-13/14 ou SEM GTIN.",
  icms_cst: "Preencha CST se Regime Normal; CSOSN se Simples Nacional.",
  icms_csosn: "Preencha CSOSN se Simples Nacional; CST se Regime Normal.",
};

const FIELD_PLACEHOLDERS: Partial<Record<FieldKey, string>> = {
  ncm: "00000000",
  cest: "0000000",
  cfop_in_state: "5102",
  cfop_interstate: "6102",
};

export default function FiscalProdutos() {
  const { role } = useAuth();
  const access = getAccessLevel(role, "/configuracoes/fiscal/produtos");
  const canEdit = access === "rw";
  const uiEnabled = FEATURE_FLAGS.fiscalProductProfilesUi === true;
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ProductListItem | null>(null);

  const listQuery = useProductFiscalList(
    { search, status, page, pageSize: PAGE_SIZE },
    { enabled: uiEnabled && access !== "none" },
  );

  const productIds = useMemo(
    () => (listQuery.data?.items ?? []).map((it) => it.product_id),
    [listQuery.data],
  );
  const readinessQuery = useProductFiscalReadiness(productIds, {
    enabled: uiEnabled && access !== "none",
  });

  const permissionDenied =
    listQuery.error?.message === "permission_denied" ||
    readinessQuery.error?.message === "permission_denied";

  // Estados de acesso/flag
  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-produtos-forbidden">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você não tem acesso aos perfis fiscais de produtos.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!uiEnabled) {
    return (
      <div className="p-6 max-w-3xl" data-testid="fiscal-produtos-preparation">
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
                Esta tela ficará disponível quando os perfis fiscais forem
                habilitados. Nenhuma emissão está ativa.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="p-6" data-testid="fiscal-produtos-permission-denied">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão para ler perfis fiscais</AlertTitle>
          <AlertDescription>Solicite acesso ao administrador.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const readinessByProduct = new Map(
    (readinessQuery.data ?? []).map((r) => [r.product_id ?? "", r] as const),
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
    <div className="p-4 md:p-6 max-w-6xl space-y-4" data-testid="fiscal-produtos-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
        <p className="text-sm text-muted-foreground">
          Preparação fiscal do catálogo. Nenhuma nota é emitida por esta tela.
        </p>
      </header>

      <Alert data-testid="fiscal-emission-banner">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription>
          Trava técnica de emissão ativa: <strong>{String(emissionLock)}</strong>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de prontidão (página atual)</CardTitle>
          <CardDescription>
            Derivado de <code>v_product_fiscal_readiness</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Produtos na página</div>
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-2 md:flex-1">
              <Input
                placeholder="Buscar por nome ou código"
                aria-label="Buscar por nome ou código do produto"
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
                  {(listQuery.data?.statuses ?? []).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="fiscal-produtos-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
            </div>
          ) : listQuery.isError ? (
            <Alert variant="destructive" data-testid="fiscal-produtos-error">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Não foi possível carregar</AlertTitle>
              <AlertDescription>Tente novamente em instantes.</AlertDescription>
            </Alert>
          ) : (listQuery.data?.items.length ?? 0) === 0 ? (
            <Alert data-testid="fiscal-produtos-empty">
              <AlertTitle>Nenhum produto encontrado</AlertTitle>
              <AlertDescription>Ajuste a busca ou filtros.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table" aria-label="Perfis fiscais de produtos">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Produto</th>
                      <th className="p-2">NCM</th>
                      <th className="p-2">CEST</th>
                      <th className="p-2">CFOP int./inter.</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Prontidão</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQuery.data!.items.map((it) => {
                      const r = readinessByProduct.get(it.product_id);
                      const pending = !r?.minimally_classified;
                      return (
                        <tr key={it.product_id} className="border-t">
                          <td className="p-2">
                            <div className="font-medium">{it.product_nome}</div>
                            <div className="text-xs text-muted-foreground">{it.product_codigo ?? "—"}</div>
                          </td>
                          <td className="p-2">{it.ncm ?? "—"}</td>
                          <td className="p-2">{it.cest ?? "—"}</td>
                          <td className="p-2">
                            {(it.cfop_in_state ?? "—")}/{(it.cfop_interstate ?? "—")}
                          </td>
                          <td className="p-2">{it.profile_status ?? "—"}</td>
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
                              aria-label={`${canEdit ? "Editar" : "Ver"} perfil fiscal de ${it.product_nome}`}
                            >
                              {canEdit ? (it.profile_id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />) : "Ver"}
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
                  Página {page + 1} de {totalPages} — {listQuery.data?.total ?? 0} produtos
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

      {editing ? (
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
}: { item: ProductListItem; canEdit: boolean; onClose: () => void }) {
  const profileQuery = useProductFiscalProfile(item.product_id);
  const save = useSaveProductFiscalProfile();
  const [values, setValues] = useState<ProductFiscalFormValues>(() =>
    rowToFormValues(null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profileQuery.data !== undefined) {
      setValues(rowToFormValues(profileQuery.data));
    }
  }, [profileQuery.data]);

  function setField<K extends FieldKey>(k: K, v: ProductFiscalFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErrors({});
    const parsed = productFiscalFormSchema.safeParse(values);
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
    try {
      await save.mutateAsync({
        productId: item.product_id,
        current: profileQuery.data ?? null,
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
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") {
        toast({ title: "Sem permissão para salvar", variant: "destructive" });
      } else if (msg === "duplicate_profile") {
        toast({
          title: "Perfil já existe",
          description: "Este produto já possui um perfil fiscal.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Não foi possível salvar", variant: "destructive" });
      }
    }
  }

  const loading = profileQuery.isLoading;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{canEdit ? "Editar" : "Detalhes do"} perfil fiscal</SheetTitle>
          <SheetDescription>
            {item.product_nome}
            {item.product_codigo ? ` — ${item.product_codigo}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" aria-label="Formulário de perfil fiscal">
            <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
              {FIELD_ORDER.map((k) => (
                <div key={k} className="grid gap-1.5">
                  <Label htmlFor={`f-${k}`}>{FIELD_LABELS[k]}</Label>
                  <Input
                    id={`f-${k}`}
                    value={values[k] ?? ""}
                    onChange={(e) => setField(k, e.target.value)}
                    aria-invalid={!!errors[k]}
                    inputMode={
                      k === "ncm" || k === "cest" ||
                      k === "cfop_in_state" || k === "cfop_interstate"
                        ? "numeric"
                        : undefined
                    }
                  />
                  {errors[k] ? (
                    <p className="text-xs text-destructive" role="alert">{errors[k]}</p>
                  ) : null}
                </div>
              ))}
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
