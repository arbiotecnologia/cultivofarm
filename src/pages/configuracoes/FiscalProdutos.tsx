import { TENANT_CAN_EDIT_GLOBAL_CATALOG } from "@/lib/catalogo/globalCatalogWriteContainment";
/**
 * Fase Fiscal 3.21 — Perfis Fiscais unificados: produtos + microrganismos.
 *
 * Mudança de contrato desta fase:
 *  - Microrganismo pode ter PERFIL FISCAL PRÓPRIO
 *    (`microorganism_fiscal_profiles`) e ser faturado DIRETAMENTE, sem
 *    depender de vínculo a produto canônico.
 *  - O vínculo `microrganismos.product_id` permanece OPCIONAL e serve
 *    apenas como referência comercial/de composição. Nunca é requisito
 *    fiscal.
 *  - Colunas fiscais (NCM/CEST/CFOP/Status/Prontidão) do microrganismo
 *    vêm SEMPRE do próprio perfil fiscal do microrganismo. O perfil do
 *    produto vinculado NÃO é usado como fallback fiscal.
 *  - Nenhuma nota é emitida por esta tela.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { OWNED_PRODUCT_FISCAL_ENABLED } from "@/lib/fiscal/ownedProductFiscal";
import {
  useProductFiscalList,
  useProductFiscalReadiness,
  useProductFiscalProfile,
  useSaveProductFiscalProfile,
  OptimisticConflictError,
  type ProductListItem,
  useOwnedProductIds,
} from "@/hooks/useProductFiscalProfiles";
import {
  useMicroorganismList,
  useAssociateMicroorganism,
} from "@/hooks/useMicroorganismFiscalAssociation";
import {
  useMicroorganismFiscalProfile,
  useMicroorganismFiscalProfileList,
  useMicroorganismFiscalReadiness,
  useSaveMicroorganismFiscalProfile,
  OptimisticConflictError as MicroOptimisticConflictError,
  type MicroorganismFiscalListItem,
} from "@/hooks/useMicroorganismFiscalProfiles";
import {
  productFiscalFormSchema,
  productFiscalPreparation,
  rowToFormValues as productRowToFormValues,
  type ProductFiscalFormValues,
} from "@/lib/fiscal/productFiscalValidation";
import {
  microorganismFiscalFormSchema,
  rowToFormValues as microRowToFormValues,
  type MicroorganismFiscalFormValues,
} from "@/lib/fiscal/microorganismFiscalValidation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { RegulatorioMicrorganismosSecao } from "@/components/fiscal/RegulatorioMicrorganismosSecao";
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


const PAGE_TITLE = "Perfis Fiscais de Produtos e Microrganismos";
const PLATFORM_PAGE_TITLE = "Perfis fiscais de produtos globais";
const EMISSION_BANNER = "Emissão fiscal desativada — ambiente em preparação";
const PAGE_SIZE = 20;
const STATUS_ALL = "__all__";
const KIND_ALL = "all";
const KIND_PRODUCT = "produto";
const KIND_MICRO = "microrganismo";
type EntityKindFilter = typeof KIND_ALL | typeof KIND_PRODUCT | typeof KIND_MICRO;
/** Famílias comerciais canônicas (`produtos.familia_catalogo`) — nunca inferidas. */
const FAMILY_FILTERS = [
  { value: "biologico", label: "Produtos biológicos" },
  { value: "quimico", label: "Produtos químicos" },
  { value: "fertilizante_adubo", label: "Fertilizantes/Adubos" },
] as const;
const FAMILY_LABEL: Record<string, string> = {
  biologico: "Biológico", quimico: "Químico", fertilizante_adubo: "Fertilizante/Adubo",
};
const FAMILY_PREFIX = "fam:";

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
  ncm: "8 dígitos da classificação revisada para este item. A família comercial não determina o NCM.",
  cest: "7 dígitos numéricos, quando aplicável.",
  cfop_in_state: "Definido pela operação e pelo estabelecimento emitente; não é inferido do produto.",
  cfop_interstate: "Revisar conforme operação, destino e regime do emitente.",
  gtin: "GTIN-13/14 ou SEM GTIN.",
  taxable_gtin: "GTIN-13/14 ou SEM GTIN.",
  icms_cst: "Preencha CST se Regime Normal; CSOSN se Simples Nacional.",
  icms_csosn: "Preencha CSOSN se Simples Nacional; CST se Regime Normal.",
};

const FIELD_PLACEHOLDERS: Partial<Record<FieldKey, string>> = {
  ncm: "Classificação revisada",
  cest: "Quando aplicável",
  cfop_in_state: "Operação interna",
  cfop_interstate: "Operação interestadual",
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
      /** Vínculo comercial opcional — jamais requisito fiscal. */
      linkedProductId: string | null;
      /** Resumo do PRÓPRIO perfil fiscal do microrganismo. */
      ownProfile: MicroorganismFiscalListItem | null;
    };

type EditingTarget =
  | { entity: "produto"; productId: string; displayName: string; displayCodigo: string | null }
  | { entity: "microrganismo"; microorganismId: string; displayName: string; displayCodigo: string | null };

export default function FiscalProdutos({ platformGlobal = false }: { platformGlobal?: boolean } = {}) {
  const fiscalAccess = useProductFiscalAccess("product-fiscal-page");
  const { role } = useAuth();
  const routeAccess = getAccessLevel(role, "/configuracoes/fiscal/produtos");
  const access = platformGlobal ? fiscalAccess.ready && fiscalAccess.canWrite ? "rw" : "none" : routeAccess;
  // Produto PRÓPRIO da empresa (catálogo exclusivo): administrador/gestor do tenant, somente pelo writer canônico
  // e só quando liberado (OWNED_PRODUCT_FISCAL_ENABLED); sem escrita global de Superadmin. Microrganismo: permissão
  // canônica existente da rota tenant (admin/financeiro rw, gestor r), nunca na plataforma.
  const canEditProductRole = !platformGlobal && OWNED_PRODUCT_FISCAL_ENABLED && fiscalAccess.ready && fiscalAccess.canWriteOwnedProduct === true;
  const canEditMicro = !platformGlobal && routeAccess === "rw";
  // Plataforma: microrganismos globais exibidos SOMENTE em consulta; a escrita
  // continua na rota canônica da empresa até existir autoridade server-side própria.
  const uiEnabled = FEATURE_FLAGS.fiscalProductProfilesUi === true;
  const emissionLock = FEATURE_FLAGS.fiscalEmissionEnabled === false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<EntityKindFilter>(KIND_ALL);
  const [familia, setFamilia] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  // Atalho da Guia Fiscal (?produto=<id>): abre o MESMO editor; leitura apenas, nada é criado ao abrir.
  const [searchParams] = useSearchParams();
  const deepProductId = searchParams.get("produto");
  const deepHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!deepProductId || deepHandled.current === deepProductId || access === "none" || !uiEnabled) return;
    deepHandled.current = deepProductId;
    let alive = true;
    (supabase as any).from("produtos").select("id, nome, codigo").eq("id", deepProductId).maybeSingle()
      .then(({ data }: { data: { id: string; nome: string; codigo: string | null } | null }) => {
        if (alive && data) setEditing({ entity: "produto", productId: data.id, displayName: data.nome, displayCodigo: data.codigo ?? null });
      });
    return () => { alive = false; };
  }, [deepProductId, access, uiEnabled]);
  const [associating, setAssociating] = useState<
    { microorganismId: string; microorganismNome: string; currentProductId: string | null } | null
  >(null);

  const productsEnabled = uiEnabled && access !== "none" && kind !== KIND_MICRO;
  const listQuery = useProductFiscalList(
    { search, status, page, pageSize: PAGE_SIZE, familia },
    { enabled: productsEnabled },
  );

  const microorganismsEnabled = uiEnabled && access !== "none" && kind !== KIND_PRODUCT && !familia;
  const microorganismsQuery = useMicroorganismList(search, {
    enabled: microorganismsEnabled,
  });

  const productItemsPage = useMemo(
    () => listQuery.data?.items ?? [],
    [listQuery.data],
  );
  const productIds = useMemo(
    () => productItemsPage.map((it) => it.product_id),
    [productItemsPage],
  );
  const readinessQuery = useProductFiscalReadiness(productIds, {
    enabled: uiEnabled && access !== "none" && kind !== KIND_MICRO,
  });

  const microItems = useMemo(
    () => microorganismsQuery.data ?? [],
    [microorganismsQuery.data],
  );
  const microIds = useMemo(() => microItems.map((m) => m.id), [microItems]);
  const microProfilesQuery = useMicroorganismFiscalProfileList(microIds, {
    enabled: microorganismsEnabled,
  });
  const microReadinessQuery = useMicroorganismFiscalReadiness(microIds, {
    enabled: microorganismsEnabled,
  });

  const permissionDenied =
    listQuery.error?.message === "permission_denied" ||
    readinessQuery.error?.message === "permission_denied" ||
    microorganismsQuery.error?.message === "permission_denied" ||
    microProfilesQuery.error?.message === "permission_denied" ||
    microReadinessQuery.error?.message === "permission_denied";

  // Estados de acesso/flag ————————————————————————————————
  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-produtos-forbidden">
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Sem permissão</AlertTitle>
          <AlertDescription>Você não tem acesso aos perfis fiscais.</AlertDescription>
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

  // Indexes ————————————————————————————————
  const productItems = productItemsPage;
  const readinessByProduct = new Map(
    (readinessQuery.data ?? []).map((r) => [r.product_id ?? "", r] as const),
  );
  const microProfileByMicro = new Map(
    (microProfilesQuery.data ?? []).map((p) => [p.microorganism_id, p] as const),
  );
  const microReadinessByMicro = new Map(
    (microReadinessQuery.data ?? []).map((r) => [r.microorganism_id, r] as const),
  );

  const microProfilesUnknown =
    microIds.length > 0 &&
    (microProfilesQuery.isLoading || microProfilesQuery.isError);
  const microReadinessUnknown =
    microIds.length > 0 &&
    (microReadinessQuery.isLoading || microReadinessQuery.isError);
  const readinessUnknown =
    productIds.length > 0 &&
    (readinessQuery.isLoading || readinessQuery.isError);

  // Aplica filtro de status também em micros — usando o STATUS PRÓPRIO
  // do microrganismo (não mais o do produto vinculado).
  const microFilteredByStatus = status
    ? microItems.filter(
        (m) => (microProfileByMicro.get(m.id)?.profile_status ?? null) === status,
      )
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
    linkedProductId: m.product_id,
    ownProfile: microProfileByMicro.get(m.id) ?? null,
  }));

  // Escrita fiscal de produto próprio: papel (admin/gestor do tenant) + propriedade confirmada por item.
  const ownedProducts = useOwnedProductIds([
    ...productItems.map((p) => p.product_id),
    ...(editing?.entity === "produto" ? [editing.productId] : []),
  ]);
  const canEditProduct = (productId: string) =>
    canEditProductRole && ownedProducts.confirmed && ownedProducts.owned.has(productId);
  const rows: UnifiedRow[] =
    kind === KIND_PRODUCT ? rowsProduto
    : kind === KIND_MICRO ? rowsMicro
    : familia ? rowsProduto
    : [...rowsProduto, ...rowsMicro];

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE),
  );

  const microrganismosSemPerfilProprio = microItems.filter(
    (m) => !microProfileByMicro.get(m.id),
  ).length;

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4" data-testid="fiscal-produtos-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{platformGlobal ? PLATFORM_PAGE_TITLE : PAGE_TITLE}</h1>
        {platformGlobal ? (
          <p className="text-sm text-muted-foreground" data-testid="fiscal-platform-description">
            Cadastro fiscal de todo o catálogo global — produtos biológicos, químicos,
            fertilizantes/adubos e microrganismos —, compartilhado por todas as empresas.
            Revise NCM, CFOP e demais campos com a contabilidade antes de salvar. Um perfil só
            fica pronto para NF-e depois de completo e revisado; nenhuma nota é emitida por esta tela.
          </p>
        ) : (
        <p className="text-sm text-muted-foreground">
          Preparação fiscal do catálogo. Produtos e microrganismos comercializáveis
          aparecem aqui. Cada microrganismo pode ter perfil fiscal próprio e ser
          faturado diretamente. Nenhuma nota é emitida por esta tela.
        </p>
        )}
      </header>

      <Alert data-testid="fiscal-emission-banner">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>{EMISSION_BANNER}</AlertTitle>
        <AlertDescription>
          Trava técnica de emissão ativa: <strong>{emissionLock ? "sim" : "não"}</strong>.
        </AlertDescription>
      </Alert>

      {platformGlobal ? (
      <Card data-testid="fiscal-platform-summary">
        <CardHeader>
          <CardTitle className="text-base">Resumo da página atual</CardTitle>
          <CardDescription>
            Itens globais exibidos nesta página. Abra um item para ver o que falta para ficar pronto para NF-e.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Produtos na página</div>
            <div className="font-medium">{productItems.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Microrganismos listados</div>
            <div className="font-medium" data-testid="platform-micros-listados">{microItems.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Microrganismos sem perfil fiscal</div>
            <div className="font-medium" data-testid="platform-micros-sem-perfil">
              {microProfilesUnknown ? "—" : microrganismosSemPerfilProprio}
            </div>
          </div>
        </CardContent>
      </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo de prontidão (página atual)</CardTitle>
          <CardDescription>
            Produtos e microrganismos listados nesta página e situação dos perfis fiscais próprios.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Produtos na página</div>
            <div className="font-medium">{productItems.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Microrganismos listados</div>
            <div className="font-medium">{microItems.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Micro com perfil fiscal próprio</div>
            <div className="font-medium" data-testid="micros-com-perfil-proprio">
              {microProfilesQuery.data?.length ?? 0}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Micro sem perfil fiscal próprio</div>
            <div className="font-medium" data-testid="micros-sem-perfil-proprio">
              {microrganismosSemPerfilProprio}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {!platformGlobal && <RegulatorioMicrorganismosSecao />}


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
                value={familia ? FAMILY_PREFIX + familia : kind}
                onValueChange={(v) => {
                  if (v.startsWith(FAMILY_PREFIX)) { setKind(KIND_PRODUCT); setFamilia(v.slice(FAMILY_PREFIX.length)); }
                  else { setKind(v as EntityKindFilter); setFamilia(null); }
                  setPage(0);
                }}
              >
                <SelectTrigger className="max-w-[220px]" aria-label="Filtrar por tipo de item">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KIND_ALL}>Todos</SelectItem>
                  <SelectItem value={KIND_PRODUCT}>Produtos</SelectItem>
                  {FAMILY_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={FAMILY_PREFIX + f.value}>{f.label}</SelectItem>
                  ))}
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
          {(listQuery.isLoading && kind !== KIND_MICRO)
            || (microorganismsQuery.isLoading && kind !== KIND_PRODUCT)
            || (kind !== KIND_MICRO && productIds.length > 0 && readinessQuery.isLoading)
            || (kind !== KIND_PRODUCT && microIds.length > 0 && microProfilesQuery.isLoading)
            || (kind !== KIND_PRODUCT && microIds.length > 0 && microReadinessQuery.isLoading) ? (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="fiscal-produtos-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
            </div>
          ) : listQuery.isError
            || microorganismsQuery.isError
            || readinessQuery.isError
            || microProfilesQuery.isError
            || microReadinessQuery.isError ? (
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
                <table className="w-full text-sm" role="table" aria-label={platformGlobal ? "Perfis fiscais do catálogo global" : "Perfis fiscais de produtos e microrganismos"}>
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
                      microReadinessByMicro,
                      r.kind === "produto" && canEditProduct(r.productId),
                      canEditMicro,
                      readinessUnknown,
                      microProfilesUnknown,
                      microReadinessUnknown,
                      (item) => setEditing({
                        entity: "produto",
                        productId: item.product_id,
                        displayName: item.product_nome,
                        displayCodigo: item.product_codigo ?? null,
                      }),
                      (m) => setEditing({
                        entity: "microrganismo",
                        microorganismId: m.microorganismId,
                        displayName: m.microorganismNome,
                        displayCodigo: m.microorganismCodigo,
                      }),
                      (m) => setAssociating({
                        microorganismId: m.microorganismId,
                        microorganismNome: m.microorganismNome,
                        currentProductId: m.linkedProductId,
                      }),
                    ))}
                  </tbody>
                </table>
              </div>

              {kind !== KIND_MICRO && (
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    Página {page + 1} de {totalPages} — {listQuery.data?.total ?? 0} produtos
                    {kind === KIND_ALL && !familia && microItems.length > 0 && (
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

      {editing?.entity === "produto" ? (
        <ProductEditDrawer
          productId={editing.productId}
          displayName={editing.displayName}
          displayCodigo={editing.displayCodigo}
          canEdit={canEditProduct(editing.productId)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing?.entity === "microrganismo" ? (
        <MicroorganismEditDrawer
          microorganismId={editing.microorganismId}
          displayName={editing.displayName}
          displayCodigo={editing.displayCodigo}
          canEdit={canEditMicro}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {TENANT_CAN_EDIT_GLOBAL_CATALOG && associating ? (
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
  microReadinessByMicro: Map<string, { minimally_classified: boolean | null; profile_status: string | null }>,
  canEditProduct: boolean,
  canEditMicro: boolean,
  readinessUnknown: boolean,
  microProfilesUnknown: boolean,
  microReadinessUnknown: boolean,
  onEditProduct: (p: ProductListItem) => void,
  onEditMicro: (m: Extract<UnifiedRow, { kind: "microrganismo" }>) => void,
  onLinkOptional: (m: Extract<UnifiedRow, { kind: "microrganismo" }>) => void,
) {
  if (r.kind === "produto") {
    const p = r.product;
    const ready = readinessByProduct.get(p.product_id);
    const pending = readinessUnknown ? null : !ready?.minimally_classified;
    return (
      <tr key={r.rowKey} className="border-t" data-row-kind="produto" data-testid={`row-${r.rowKey}`}>
        <td className="p-2">
          <div className="font-medium">{p.product_nome}</div>
          <div className="text-xs text-muted-foreground">{p.product_codigo ?? "—"}</div>
        </td>
        <td className="p-2">
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{ENTITY_KIND.label("produto")}</Badge>
            <Badge variant="outline" data-testid="badge-familia">
              {p.familia ? FAMILY_LABEL[p.familia] ?? p.familia : "Família pendente"}
            </Badge>
          </div>
        </td>
        <td className="p-2">{p.ncm ?? "—"}</td>
        <td className="p-2">{p.cest ?? "—"}</td>
        <td className="p-2">{(p.cfop_in_state ?? "—")}/{(p.cfop_interstate ?? "—")}</td>
        <td className="p-2">
          <Badge variant="outline" title={p.profile_status ?? undefined}>
            {getFiscalStatusLabel("product", p.profile_status)}
          </Badge>
        </td>
        <td className="p-2">
          {pending === null
            ? <Badge variant="outline" data-testid="readiness-unknown-badge">—</Badge>
            : pending
              ? <Badge variant="destructive" data-testid="pending-badge">Pendente</Badge>
              : <Badge>OK</Badge>}
        </td>
        <td className="p-2 text-right">
          <Button
            variant="outline" size="sm"
            onClick={() => onEditProduct(p)}
            aria-label={`${canEditProduct ? "Editar" : "Ver"} perfil fiscal de ${p.product_nome}`}
          >
            {canEditProduct ? (p.profile_id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />) : "Ver"}
          </Button>
        </td>
      </tr>
    );
  }
  // microrganismo — perfil fiscal PRÓPRIO
  const own = r.ownProfile;
  const ownReadiness = microReadinessByMicro.get(r.microorganismId);
  const ownProfileUnknown = microProfilesUnknown;
  const pending = !own
    ? null
    : microReadinessUnknown
      ? null
      : !ownReadiness?.minimally_classified;
  return (
    <tr key={r.rowKey} className="border-t" data-row-kind="microrganismo" data-testid={`row-${r.rowKey}`}>
      <td className="p-2">
        <div className="font-medium">{r.microorganismNome}</div>
        <div className="text-xs text-muted-foreground">{r.microorganismCodigo ?? "—"}</div>
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{ENTITY_KIND.label("microrganismo")}</Badge>
          {r.linkedProductId && (
            <Badge variant="outline" data-testid="badge-vinculo-opcional" title="Vínculo comercial opcional a produto do catálogo — não interfere no perfil fiscal">
              Vínculo comercial opcional
            </Badge>
          )}
          {!own && !ownProfileUnknown && (
            <Badge
              variant="outline"
              className="border-amber-500/60 text-amber-700 dark:text-amber-300"
              data-testid="badge-perfil-fiscal-pendente"
            >
              Perfil fiscal pendente
            </Badge>
          )}
          {ownProfileUnknown && (
            <Badge variant="outline" data-testid="badge-perfil-desconhecido">
              Carregando perfil…
            </Badge>
          )}
        </div>
      </td>
      <td className="p-2">{own?.ncm ?? "—"}</td>
      <td className="p-2">{own?.cest ?? "—"}</td>
      <td className="p-2">
        {(own?.cfop_in_state ?? "—")}/{(own?.cfop_interstate ?? "—")}
      </td>
      <td className="p-2">
        {own ? (
          <Badge variant="outline" title={own.profile_status ?? undefined}>
            {getFiscalStatusLabel("product", own.profile_status)}
          </Badge>
        ) : (
          <Badge variant="outline">—</Badge>
        )}
      </td>
      <td className="p-2">
        {!own
          ? <Badge variant="outline">—</Badge>
          : pending === null
            ? <Badge variant="outline" data-testid="readiness-unknown-badge">—</Badge>
            : pending
              ? <Badge variant="destructive" data-testid="pending-badge">Pendente</Badge>
              : <Badge>OK</Badge>}
      </td>

      <td className="p-2 text-right space-x-2">
        {canEditMicro ? (
          <>
            <Button
              variant={own ? "outline" : "default"}
              size="sm"
              onClick={() => onEditMicro(r)}
              aria-label={`${own ? "Editar" : "Criar"} perfil fiscal de ${r.microorganismNome}`}
              data-testid="btn-editar-perfil-micro"
            >
              {own ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4 mr-1" /> Criar perfil fiscal</>}
            </Button>
            {/* Vínculo product_id é GLOBAL (migration 20261014192417 revogou a RPC): sem ação para empresa. */}
            {TENANT_CAN_EDIT_GLOBAL_CATALOG && <Button
              variant="ghost" size="sm"
              onClick={() => onLinkOptional(r)}
              aria-label={`Vínculo opcional a produto — ${r.microorganismNome}`}
              title="Vínculo comercial opcional a produto do catálogo (não afeta emissão fiscal)"
              data-testid="btn-vinculo-opcional"
            >
              {r.linkedProductId ? <Link2Off className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            </Button>}
          </>
        ) : (
          <Button
            variant="outline" size="sm"
            onClick={() => onEditMicro(r)}
            aria-label={`Ver perfil fiscal de ${r.microorganismNome}`}
          >
            Ver
          </Button>
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
        title: productId ? "Vínculo comercial atualizado" : "Vínculo comercial removido",
        description: productId
          ? "O microrganismo passa a apontar para o produto do catálogo como referência comercial. O perfil fiscal usado no faturamento continua sendo o do próprio microrganismo."
          : "O vínculo comercial foi removido. Microrganismo, produto e perfis fiscais permanecem intactos.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") {
        toast({ title: "Sem permissão para alterar o vínculo", variant: "destructive" });
      } else {
        toast({ title: "Não foi possível atualizar", description: msg, variant: "destructive" });
      }
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vínculo comercial opcional a produto</DialogTitle>
          <DialogDescription>
            Vincule <strong>{microorganismNome}</strong> a um produto do catálogo por
            motivos comerciais ou de composição. <strong>Este vínculo NÃO afeta o
            faturamento fiscal</strong> — o perfil fiscal do microrganismo continua
            sendo o próprio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid min-w-0 content-start gap-1.5">
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
              Remover vínculo
            </Button>
          )}
          <Button
            type="button"
            onClick={() => selected && handleAssociate(selected)}
            disabled={!selected || selected === currentProductId || associate.isPending}
            data-testid="btn-confirmar-associacao"
          >
            {associate.isPending ? "Salvando…" : "Confirmar vínculo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// —————————————————————————— Drawer: produto ——————————————————————————
export function ProductEditDrawer({
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
  const fence = useProductFiscalAccess(`fiscal-drawer:${productId}`);
  const submitLock = useRef(false);
  const readiness = useProductFiscalReadiness([productId]);
  const preparation = productFiscalPreparation(!fence.ready || readiness.isError || readiness.isFetching ? undefined : readiness.data?.find(r => r.product_id === productId), profileQuery.data?.is_active);
  const [values, setValues] = useState<ProductFiscalFormValues>(() =>
    productRowToFormValues(null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  // chave de idempotência por tentativa: mantida após resposta incerta (reconciliação), descartada após
  // confirmação/conflito ou quando o conteúdo enviado muda
  const attempt = useRef<{ key: string; sig: string } | null>(null);

  useEffect(() => {
    setValues(productRowToFormValues(null));
    setErrors({});
    setReason("");
    attempt.current = null;
  }, [fence.scope]);
  useEffect(() => {
    if (profileQuery.data !== undefined) {
      setValues(productRowToFormValues(profileQuery.data));
    }
  }, [profileQuery.data]);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitLock.current || !canEdit || !fence.ready || profileQuery.isFetching || profileQuery.isError || profileQuery.data === undefined) return;
    const valid = fence.capture();
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
    const motive = reason.trim();
    if (motive.length < 10 || motive.length > 500) {
      setErrors({ reason: "Informe o motivo da alteração (10 a 500 caracteres)." });
      return;
    }
    const sig = JSON.stringify([productId, profileQuery.data?.updated_at ?? null, parsed.data, motive]);
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { key: crypto.randomUUID(), sig };
    try {
      submitLock.current = true;
      await save.mutateAsync({
        productId,
        current: profileQuery.data ?? null,
        values: parsed.data,
        reason: motive,
        idempotencyKey: attempt.current.key,
      });
      attempt.current = null;
      if (!valid()) return;
      toast({ title: "Rascunho fiscal salvo.", description: "A classificação continua pendente de validação contábil." });
      onClose();
    } catch (err) {
      const msg0 = err instanceof Error ? err.message : "unknown";
      if (msg0 !== "fiscal_uncertain") attempt.current = null;
      if (!valid()) return;
      if (msg0 === "fiscal_uncertain") {
        toast({ title: "Gravação não confirmada", description: "Consulte o perfil antes de tentar de novo; a mesma tentativa será reaproveitada.", variant: "destructive" });
        await profileQuery.refetch();
        return;
      }
      if (err instanceof OptimisticConflictError) {
        toast({
          title: "Conflito de atualização",
          description: "Outro usuário alterou este perfil. A versão atual será consultada; revise antes de salvar novamente.",
          variant: "destructive",
        });
        await profileQuery.refetch();
        return;
      }
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") toast({ title: "Sem permissão para salvar", variant: "destructive" });
      else if (msg === "fiscal_writer_disabled") toast({ title: "Edição fiscal de produto ainda não liberada", variant: "destructive" });
      else if (msg === "fiscal_invalid") toast({ title: "Dados fiscais inválidos", variant: "destructive" });
      else toast({ title: "Não foi possível salvar", variant: "destructive" });
    } finally {
      submitLock.current = false;
    }
  }

  return (
    <FiscalProfileDrawer
      title={`${canEdit ? "Editar" : "Detalhes do"} perfil fiscal — produto`}
      subtitle={`${displayName}${displayCodigo ? ` — ${displayCodigo}` : ""}`}
      loading={!fence.ready || profileQuery.isLoading || profileQuery.isFetching || profileQuery.isError}
      saving={save.isPending}
      canEdit={canEdit && fence.ready && !profileQuery.isFetching && !profileQuery.isError && profileQuery.data !== undefined}
      values={values}
      errors={errors}
      onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
      onSubmit={onSubmit}
      onClose={onClose}
      testId="fiscal-drawer-produto"
      footer={
        <div className="mt-6" data-testid="fiscal-produtos-ibs-cbs">
          {canEdit && (
            <div className="mb-4 space-y-1">
              <Label htmlFor="fiscal-produto-motivo">Motivo da alteração</Label>
              <Textarea id="fiscal-produto-motivo" data-testid="fiscal-produto-motivo" value={reason} maxLength={500}
                onChange={(e) => setReason(e.target.value)} placeholder="Ex.: classificação informada pela contabilidade" />
              {errors.reason && <p className="text-sm text-destructive">{errors.reason}</p>}
            </div>
          )}
          <Alert className="mb-4">
            <AlertTitle>{preparation.stage === "incomplete_draft" ? "Rascunho incompleto" : preparation.stage === "inactive" ? "Perfil inativo" : preparation.stage === "accounting_pending" ? "Revisão contábil pendente" : preparation.stage === "unavailable" ? "Prontidão indisponível" : "Cadastro revisado; operação pendente"}</AlertTitle>
            <AlertDescription>Salvar um rascunho não torna o item pronto para NF-e. Regime, operação, regras do emitente e IBS/CBS precisam de validação própria; emissão permanece desativada.</AlertDescription>
          </Alert>
          {fence.ready && !profileQuery.isFetching && !profileQuery.isError && profileQuery.data !== undefined && (
            <IbsCbsItemCard kind="product" itemId={productId} canEdit={canEdit && fence.canWrite && profileQuery.data?.is_active === true} />
          )}
        </div>
      }
    />
  );
}

// ————————————————————— Drawer: microrganismo (perfil próprio) —————————————————————
export function MicroorganismEditDrawer({
  microorganismId, displayName, displayCodigo, canEdit, onClose,
}: {
  microorganismId: string;
  displayName: string;
  displayCodigo: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const profileQuery = useMicroorganismFiscalProfile(microorganismId);
  const save = useSaveMicroorganismFiscalProfile();
  const [values, setValues] = useState<MicroorganismFiscalFormValues>(() =>
    microRowToFormValues(null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profileQuery.data !== undefined) {
      setValues(microRowToFormValues(profileQuery.data));
    }
  }, [profileQuery.data]);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErrors({});
    const parsed = microorganismFiscalFormSchema.safeParse(values);
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
        microorganismId,
        current: profileQuery.data ?? null,
        values: parsed.data,
      });
      toast({ title: "Perfil fiscal do microrganismo salvo." });
      onClose();
    } catch (err) {
      if (err instanceof MicroOptimisticConflictError) {
        toast({
          title: "Conflito de atualização",
          description: "Outro usuário alterou este perfil. Recarregue e tente novamente.",
          variant: "destructive",
        });
        return;
      }
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "permission_denied") toast({ title: "Sem permissão para salvar", variant: "destructive" });
      else if (msg === "duplicate_profile") toast({ title: "Perfil já existe", description: "Este microrganismo já possui um perfil fiscal ativo.", variant: "destructive" });
      else toast({ title: "Não foi possível salvar", variant: "destructive" });
    }
  }

  return (
    <FiscalProfileDrawer
      title={`${canEdit ? "Editar" : "Detalhes do"} perfil fiscal — microrganismo`}
      subtitle={`${displayName}${displayCodigo ? ` — ${displayCodigo}` : ""}`}
      loading={profileQuery.isLoading}
      saving={save.isPending}
      canEdit={canEdit}
      values={values}
      errors={errors}
      onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
      onSubmit={onSubmit}
      onClose={onClose}
      testId="fiscal-drawer-microrganismo"
    />
  );
}

// ————————————————————— Drawer genérico compartilhado —————————————————————
function FiscalProfileDrawer({
  title, subtitle, loading, saving, canEdit, values, errors,
  onChange, onSubmit, onClose, testId, footer,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  saving: boolean;
  canEdit: boolean;
  values: ProductFiscalFormValues;
  errors: Record<string, string>;
  onChange: <K extends FieldKey>(k: K, v: ProductFiscalFormValues[K]) => void;
  onSubmit: (ev: React.FormEvent) => void;
  onClose: () => void;
  testId: string;
  footer?: React.ReactNode;
}) {
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid={testId}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" aria-label="Formulário de perfil fiscal">
            <fieldset disabled={!canEdit || saving} className="space-y-4">
              {FIELD_ORDER.map((k) => {
                const raw = values[k] ?? "";
                const select = FIELD_SELECTS[k];
                const hint = FIELD_HINTS[k];
                const placeholder = FIELD_PLACEHOLDERS[k];
                return (
                  <div key={k} className="grid min-w-0 content-start gap-1.5">
                    <Label htmlFor={`f-${k}`}>{FIELD_LABELS[k]}</Label>
                    {select ? (
                      <select
                        id={`f-${k}`}
                        className="h-10 border rounded-md px-3 bg-background disabled:opacity-60"
                        value={raw}
                        onChange={(e) => onChange(k, e.target.value)}
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
                        onChange={(e) => onChange(k, e.target.value)}
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
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              ) : null}
            </SheetFooter>
          </form>
        )}
        {footer}
      </SheetContent>
    </Sheet>
  );
}
