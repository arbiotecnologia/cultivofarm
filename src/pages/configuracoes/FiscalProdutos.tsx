/**
 * Fase Fiscal 3.20 — Perfis Fiscais unificados: produtos + microrganismos.
 *
 * Regras de domínio implementadas:
 *  - Microrganismos são exibidos e gerenciados nesta mesma página; não
 *    há tela fiscal paralela.
 *  - Um microrganismo com `product_id` compartilha o MESMO
 *    `product_fiscal_profiles` do produto canônico associado. Nenhum
 *    perfil paralelo é criado. A chave de linha é distinta
 *    (`micro:<id>`) para evitar colapsar as duas visões, mas o drawer
 *    aberto por qualquer uma delas edita o MESMO perfil.
 *  - Um microrganismo sem `product_id` mostra o badge "Produto fiscal
 *    não associado" e ação "Associar produto fiscal". Nenhum perfil é
 *    criado sem associação prévia.
 *  - Somente usuário com escrita pode associar/desassociar. Leitura
 *    somente visualiza o vínculo/pendência.
 *  - Nenhuma exclusão é feita: desassociar apenas seta `product_id =
 *    null`; produto/microrganismo/perfil permanecem intactos.
 */
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useProductFiscalList,
  useProductFiscalListByIds,
  useProductFiscalReadiness,
  useProductFiscalProfile,
  useSaveProductFiscalProfile,
  OptimisticConflictError,
  type ProductListItem,
} from "@/hooks/useProductFiscalProfiles";
import {
  useMicroorganismList,
  useAssociateMicroorganism,
} from "@/hooks/useMicroorganismFiscalAssociation";
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, ShieldOff, Loader2, Pencil, Plus, Link2, Link2Off } from "lucide-react";
import { IbsCbsItemCard } from "@/components/fiscal/IbsCbsItemCard";
import {
  PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS,
  getFiscalStatusLabel,
} from "@/lib/fiscal/fiscalOptions";
import { ENTITY_KIND } from "@/lib/fiscal/labels";
import {
  ORIGIN_CODE_OPTIONS, ICMS_CST_OPTIONS, ICMS_CSOSN_OPTIONS,
  IPI_CST_OPTIONS, PIS_COFINS_CST_OPTIONS, withLegacyOption,
  type FiscalOption,
} from "@/lib/fiscal/fiscalOptions";


const PAGE_TITLE = "Perfis Fiscais de Produtos";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";
const PAGE_SIZE = 20;
const STATUS_ALL = "__all__";
const KIND_ALL = "all";
const KIND_PRODUCT = "produto";
const KIND_MICRO = "microrganismo";
type EntityKindFilter = typeof KIND_ALL | typeof KIND_PRODUCT | typeof KIND_MICRO;

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

// —————————————————————————— Unified row type ——————————————————————————
type UnifiedRow =
  | {
      rowKey: string;
      kind: "produto";
      productId: string;
      product: ProductListItem;
    }
  | {
      rowKey: string;
      kind: "microrganismo";
      microorganismId: string;
      microorganismNome: string;
      microorganismCodigo: string | null;
      productId: string | null;
      productProfile: ProductListItem | null;
    };

export default function FiscalProdutos() {
  const { role } = useAuth();
  const access = getAccessLevel(role, "/configuracoes/fiscal/produtos");
  const canEdit = access === "rw";
  const uiEnabled = FEATURE_FLAGS.fiscalProductProfilesUi === true;
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<EntityKindFilter>(KIND_ALL);
  const [page, setPage] = useState(0);
  const [editingProductId, setEditingProductId] =
    useState<{ productId: string; displayName: string; displayCodigo: string | null } | null>(null);
  const [associating, setAssociating] = useState<
    { microorganismId: string; microorganismNome: string; currentProductId: string | null } | null
  >(null);

  const productsEnabled = uiEnabled && access !== "none" && kind !== KIND_MICRO;
  const listQuery = useProductFiscalList(
    { search, status, page, pageSize: PAGE_SIZE },
    { enabled: productsEnabled },
  );

  const microorganismsEnabled = uiEnabled && access !== "none" && kind !== KIND_PRODUCT;
  const microorganismsQuery = useMicroorganismList(search, {
    enabled: microorganismsEnabled,
  });

  const productItemsPage = listQuery.data?.items ?? [];
  const pageProductIds = useMemo(
    () => new Set(productItemsPage.map((it) => it.product_id)),
    [productItemsPage],
  );
  const microLinkedIds = useMemo(
    () =>
      Array.from(
        new Set(
          (microorganismsQuery.data ?? [])
            .map((m) => m.product_id)
            .filter((id): id is string => !!id),
        ),
      ),
    [microorganismsQuery.data],
  );
  // Fonte independente: resolve produtos vinculados por microrganismos que
  // não estejam na página/filtro atual, sem SELECT amplo.
  const missingLinkedProductIds = useMemo(
    () => microLinkedIds.filter((id) => !pageProductIds.has(id)),
    [microLinkedIds, pageProductIds],
  );
  const resolvedLinkedQuery = useProductFiscalListByIds(missingLinkedProductIds, {
    enabled: uiEnabled && access !== "none",
  });

  const productIds = useMemo(
    () => Array.from(new Set([...pageProductIds, ...microLinkedIds])),
    [pageProductIds, microLinkedIds],
  );

  const readinessQuery = useProductFiscalReadiness(productIds, {
    enabled: uiEnabled && access !== "none",
  });

  const permissionDenied =
    listQuery.error?.message === "permission_denied" ||
    readinessQuery.error?.message === "permission_denied" ||
    microorganismsQuery.error?.message === "permission_denied" ||
    resolvedLinkedQuery.error?.message === "permission_denied";

  // Estados de acesso/flag ————————————————————————————————
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
                Esta tela ficará disponível quando os perfis fiscais forem habilitados.
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

  const productItems = productItemsPage;
  const productByProductId = new Map<string, ProductListItem>();
  for (const p of productItems) productByProductId.set(p.product_id, p);
  // Reforço da fonte independente: produtos vinculados por microrganismos
  // que não estejam na página corrente. Não sobrescrevem itens da página
  // atual — apenas complementam para que o vínculo seja reconhecido.
  for (const p of resolvedLinkedQuery.data ?? []) {
    if (!productByProductId.has(p.product_id)) {
      productByProductId.set(p.product_id, p);
    }
  }
  const readinessByProduct = new Map(
    (readinessQuery.data ?? []).map((r) => [r.product_id ?? "", r] as const),
  );

  // Monta as linhas unificadas obedecendo o filtro por tipo. ————————
  const microItems = microorganismsQuery.data ?? [];
  // Filtro de status também se aplica a microrganismos com produto canônico.
  const microFilteredByStatus = status
    ? microItems.filter((m) => {
        const p = m.product_id ? productByProductId.get(m.product_id) : null;
        return (p?.profile_status ?? null) === status;
      })
    : microItems;

  const rowsProduto: UnifiedRow[] = productItems.map((p) => ({
    rowKey: `product:${p.product_id}`,
    kind: "produto",
    productId: p.product_id,
    product: p,
  }));
  const rowsMicro: UnifiedRow[] = microFilteredByStatus.map((m) => ({
    rowKey: `micro:${m.id}`,
    kind: "microrganismo",
    microorganismId: m.id,
    microorganismNome: m.nome,
    microorganismCodigo: m.codigo ?? null,
    productId: m.product_id,
    productProfile: m.product_id ? productByProductId.get(m.product_id) ?? null : null,
  }));

  const rows: UnifiedRow[] =
    kind === KIND_PRODUCT ? rowsProduto
    : kind === KIND_MICRO ? rowsMicro
    : [...rowsProduto, ...rowsMicro];

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE),
  );

  const readinessSummary = {
    minimally: (readinessQuery.data ?? []).filter((r) => r.minimally_classified).length,
    accounting: (readinessQuery.data ?? []).filter((r) => r.accounting_validated).length,
    total: readinessQuery.data?.length ?? 0,
  };

  const microrganismosNaoAssociados = microItems.filter((m) => !m.product_id).length;

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4" data-testid="fiscal-produtos-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
        <p className="text-sm text-muted-foreground">
          Preparação fiscal do catálogo. Produtos e microrganismos comercializáveis
          aparecem aqui. Nenhuma nota é emitida por esta tela.
        </p>
      </header>

      <Alert data-testid="fiscal-emission-banner">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription>
          Trava técnica de emissão ativa: <strong>{emissionLock ? "sim" : "não"}</strong>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de prontidão (página atual)</CardTitle>
          <CardDescription>
            Derivado de <code>v_product_fiscal_readiness</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
          <div>
            <div className="text-muted-foreground">Microrganismos sem produto associado</div>
            <div className="font-medium" data-testid="micros-nao-associados">{microrganismosNaoAssociados}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-2 md:flex-1 flex-wrap">
              <Input
                placeholder="Buscar por nome, código ou referência"
                aria-label="Buscar por nome, código ou referência"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="max-w-sm"
              />
              <Select
                value={kind}
                onValueChange={(v) => { setKind(v as EntityKindFilter); setPage(0); }}
              >
                <SelectTrigger className="max-w-[180px]" aria-label="Filtrar por tipo de item">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KIND_ALL}>Todos</SelectItem>
                  <SelectItem value={KIND_PRODUCT}>Produtos</SelectItem>
                  <SelectItem value={KIND_MICRO}>Microrganismos</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status ?? STATUS_ALL}
                onValueChange={(v) => { setStatus(v === STATUS_ALL ? null : v); setPage(0); }}
              >
                <SelectTrigger className="max-w-xs" aria-label="Filtrar por status">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STATUS_ALL}>Todos os status</SelectItem>
                  {PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(listQuery.isLoading && kind !== KIND_MICRO) || (microorganismsQuery.isLoading && kind !== KIND_PRODUCT) ? (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="fiscal-produtos-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
            </div>
          ) : listQuery.isError || microorganismsQuery.isError ? (
            <Alert variant="destructive" data-testid="fiscal-produtos-error">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Não foi possível carregar</AlertTitle>
              <AlertDescription>Tente novamente em instantes.</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <Alert data-testid="fiscal-produtos-empty">
              <AlertTitle>Nenhum item encontrado</AlertTitle>
              <AlertDescription>Ajuste a busca ou filtros.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table" aria-label="Perfis fiscais de produtos e microrganismos">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">NCM</th>
                      <th className="p-2">CEST</th>
                      <th className="p-2">CFOP int./inter.</th>
                      <th className="p-2">Status</th>
                      <th className="p-2" title="Verificação inicial dos campos essenciais. A revisão contábil e os demais dados fiscais continuam necessários antes da emissão.">Prontidão mínima</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => renderRow(
                      r,
                      readinessByProduct,
                      canEdit,
                      (item) => setEditingProductId({
                        productId: item.product_id,
                        displayName: item.product_nome,
                        displayCodigo: item.product_codigo ?? null,
                      }),
                      (m) => setEditingProductId({
                        productId: m.productProfile!.product_id,
                        displayName: m.microorganismNome,
                        displayCodigo: m.microorganismCodigo,
                      }),
                      (m) => setAssociating({
                        microorganismId: m.microorganismId,
                        microorganismNome: m.microorganismNome,
                        currentProductId: m.productId,
                      }),
                    ))}
                  </tbody>
                </table>
              </div>

              {kind !== KIND_MICRO && (
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    Página {page + 1} de {totalPages} — {listQuery.data?.total ?? 0} produtos
                    {kind === KIND_ALL && microItems.length > 0 && (
                      <> + {microItems.length} microrganismo(s) na visão unificada</>
                    )}
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
              )}
            </>
          )}
        </CardContent>
      </Card>

      {editingProductId ? (
        <EditDrawer
          productId={editingProductId.productId}
          displayName={editingProductId.displayName}
          displayCodigo={editingProductId.displayCodigo}
          canEdit={canEdit}
          onClose={() => setEditingProductId(null)}
        />
      ) : null}

      {associating ? (
        <AssociateDialog
          microorganismId={associating.microorganismId}
          microorganismNome={associating.microorganismNome}
          currentProductId={associating.currentProductId}
          onClose={() => setAssociating(null)}
        />
      ) : null}
    </div>
  );
}

// ————————————————————————— Row renderer —————————————————————————
function renderRow(
  r: UnifiedRow,
  readinessByProduct: Map<string, { minimally_classified: boolean | null }>,
  canEdit: boolean,
  onEditProduct: (p: ProductListItem) => void,
  onEditMicroLinked: (m: Extract<UnifiedRow, { kind: "microrganismo" }>) => void,
  onAssociate: (m: Extract<UnifiedRow, { kind: "microrganismo" }>) => void,
) {
  if (r.kind === "produto") {
    const p = r.product;
    const ready = readinessByProduct.get(p.product_id);
    const pending = !ready?.minimally_classified;
    return (
      <tr key={r.rowKey} className="border-t" data-row-kind="produto" data-testid={`row-${r.rowKey}`}>
        <td className="p-2">
          <div className="font-medium">{p.product_nome}</div>
          <div className="text-xs text-muted-foreground">{p.product_codigo ?? "—"}</div>
        </td>
        <td className="p-2"><Badge variant="secondary">{ENTITY_KIND.label("produto")}</Badge></td>
        <td className="p-2">{p.ncm ?? "—"}</td>
        <td className="p-2">{p.cest ?? "—"}</td>
        <td className="p-2">{(p.cfop_in_state ?? "—")}/{(p.cfop_interstate ?? "—")}</td>
        <td className="p-2">
          <Badge variant="outline" title={p.profile_status ?? undefined}>
            {getFiscalStatusLabel("product", p.profile_status)}
          </Badge>
        </td>
        <td className="p-2">
          {pending ? <Badge variant="destructive" data-testid="pending-badge">Pendente</Badge> : <Badge>OK</Badge>}
        </td>
        <td className="p-2 text-right">
          <Button
            variant="outline" size="sm"
            onClick={() => onEditProduct(p)}
            aria-label={`${canEdit ? "Editar" : "Ver"} perfil fiscal de ${p.product_nome}`}
          >
            {canEdit ? (p.profile_id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />) : "Ver"}
          </Button>
        </td>
      </tr>
    );
  }
  // microrganismo
  const linked = r.productProfile;
  const ready = linked ? readinessByProduct.get(linked.product_id) : null;
  const pending = linked ? !ready?.minimally_classified : true;
  return (
    <tr key={r.rowKey} className="border-t" data-row-kind="microrganismo" data-testid={`row-${r.rowKey}`}>
      <td className="p-2">
        <div className="font-medium">{r.microorganismNome}</div>
        <div className="text-xs text-muted-foreground">{r.microorganismCodigo ?? "—"}</div>
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{ENTITY_KIND.label("microrganismo")}</Badge>
          {!linked && (
            <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300" data-testid="badge-nao-associado">
              Produto fiscal não associado
            </Badge>
          )}
        </div>
      </td>
      <td className="p-2">{linked?.ncm ?? "—"}</td>
      <td className="p-2">{linked?.cest ?? "—"}</td>
      <td className="p-2">
        {(linked?.cfop_in_state ?? "—")}/{(linked?.cfop_interstate ?? "—")}
      </td>
      <td className="p-2">
        {linked ? (
          <Badge variant="outline" title={linked.profile_status ?? undefined}>
            {getFiscalStatusLabel("product", linked.profile_status)}
          </Badge>
        ) : (
          <Badge variant="outline">—</Badge>
        )}
      </td>
      <td className="p-2">
        {linked
          ? (pending ? <Badge variant="destructive" data-testid="pending-badge">Pendente</Badge> : <Badge>OK</Badge>)
          : <Badge variant="outline">—</Badge>}
      </td>
      <td className="p-2 text-right space-x-2">
        {linked ? (
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => onEditMicroLinked(r)}
              aria-label={`${canEdit ? "Editar" : "Ver"} perfil fiscal associado a ${r.microorganismNome}`}
            >
              {canEdit ? <Pencil className="h-4 w-4" /> : "Ver"}
            </Button>
            {canEdit && (
              <Button
                variant="ghost" size="sm"
                onClick={() => onAssociate(r)}
                aria-label={`Alterar associação de ${r.microorganismNome}`}
                title="Alterar/desassociar produto fiscal"
              >
                <Link2Off className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          canEdit ? (
            <Button
              variant="default" size="sm"
              onClick={() => onAssociate(r)}
              aria-label={`Associar produto fiscal a ${r.microorganismNome}`}
              data-testid="btn-associar-produto"
            >
              <Link2 className="h-4 w-4 mr-1" /> Associar produto fiscal
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Sem associação</span>
          )
        )}
      </td>
    </tr>
  );
}

// ———————————————————————— Association dialog ————————————————————————
function AssociateDialog({
  microorganismId, microorganismNome, currentProductId, onClose,
}: {
  microorganismId: string;
  microorganismNome: string;
  currentProductId: string | null;
  onClose: () => void;
}) {
  const [pickerSearch, setPickerSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(currentProductId);
  const productsQuery = useProductFiscalList(
    { search: pickerSearch, status: null, page: 0, pageSize: 50 },
    { enabled: true },
  );
  const associate = useAssociateMicroorganism();

  async function handleAssociate(productId: string | null) {
    try {
      await associate.mutateAsync({ microorganismId, productId });
      toast({
        title: productId ? "Associação atualizada" : "Associação removida",
        description: productId
          ? "O microrganismo passará a usar o perfil fiscal do produto selecionado."
          : "O vínculo foi removido. Produto, microrganismo e perfil fiscal permanecem intactos.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") {
        toast({ title: "Sem permissão para alterar a associação", variant: "destructive" });
      } else {
        toast({ title: "Não foi possível atualizar", description: msg, variant: "destructive" });
      }
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Associar produto fiscal</DialogTitle>
          <DialogDescription>
            Vincule <strong>{microorganismNome}</strong> ao produto canônico do catálogo.
            O microrganismo reutilizará o mesmo perfil fiscal do produto — nenhum
            perfil paralelo é criado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="picker-search">Buscar produto por nome ou código</Label>
            <Input
              id="picker-search"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Digite para filtrar"
            />
          </div>
          <div className="max-h-64 overflow-y-auto border rounded-md" role="listbox" aria-label="Produtos disponíveis">
            {productsQuery.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (productsQuery.data?.items.length ?? 0) === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado.</div>
            ) : (
              <ul className="divide-y">
                {productsQuery.data!.items.map((p) => {
                  const isSel = selected === p.product_id;
                  return (
                    <li key={p.product_id}>
                      <button
                        type="button"
                        onClick={() => setSelected(p.product_id)}
                        aria-selected={isSel}
                        role="option"
                        className={`w-full text-left px-3 py-2 hover:bg-accent ${isSel ? "bg-accent" : ""}`}
                      >
                        <div className="text-sm font-medium">{p.product_nome}</div>
                        <div className="text-xs text-muted-foreground">{p.product_codigo ?? "—"}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          {currentProductId && (
            <Button
              type="button" variant="ghost"
              onClick={() => handleAssociate(null)}
              disabled={associate.isPending}
              data-testid="btn-desassociar"
            >
              Desassociar
            </Button>
          )}
          <Button
            type="button"
            onClick={() => selected && handleAssociate(selected)}
            disabled={!selected || selected === currentProductId || associate.isPending}
            data-testid="btn-confirmar-associacao"
          >
            {associate.isPending ? "Salvando…" : "Confirmar associação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// —————————————————————————————— Drawer ——————————————————————————————
function EditDrawer({
  productId, displayName, displayCodigo, canEdit, onClose,
}: {
  productId: string;
  displayName: string;
  displayCodigo: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const profileQuery = useProductFiscalProfile(productId);
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
        productId,
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
            {displayName}
            {displayCodigo ? ` — ${displayCodigo}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" aria-label="Formulário de perfil fiscal">
            <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
              {FIELD_ORDER.map((k) => {
                const raw = values[k] ?? "";
                const select = FIELD_SELECTS[k];
                const hint = FIELD_HINTS[k];
                const placeholder = FIELD_PLACEHOLDERS[k];
                return (
                  <div key={k} className="grid gap-1.5">
                    <Label htmlFor={`f-${k}`}>{FIELD_LABELS[k]}</Label>
                    {select ? (
                      <select
                        id={`f-${k}`}
                        className="h-10 border rounded-md px-3 bg-background disabled:opacity-60"
                        value={raw}
                        onChange={(e) => setField(k, e.target.value)}
                        aria-invalid={!!errors[k]}
                      >
                        <option value="">— selecione —</option>
                        {withLegacyOption(select, raw).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`f-${k}`}
                        value={raw}
                        placeholder={placeholder}
                        onChange={(e) => setField(k, e.target.value)}
                        aria-invalid={!!errors[k]}
                        inputMode={
                          k === "ncm" || k === "cest" ||
                          k === "cfop_in_state" || k === "cfop_interstate"
                            ? "numeric"
                            : undefined
                        }
                      />
                    )}
                    {errors[k] ? (
                      <p className="text-xs text-destructive" role="alert">{errors[k]}</p>
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
        <div className="mt-6" data-testid="fiscal-produtos-ibs-cbs">
          <IbsCbsItemCard kind="product" itemId={productId} canEdit={canEdit} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
