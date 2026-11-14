import { LabelTechnicalDataDialog } from '@/components/etiquetas/LabelTechnicalDataDialog';
import {ProductDossierAction} from '@/components/fiscal/ProductDossierManagement';
import { ProductFiscalGuide } from "@/components/fiscal/FiscalGuidePanel";
import { CompactCatalogSelect } from "@/components/catalogo/CompactCatalogSelect";
import { DraftExitConfirmation } from "@/components/catalogo/DraftExitConfirmation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveCatalogFamilies } from "@/hooks/useActiveCatalogFamilies";
import { TenantHiddenBadge, TenantVisibilityBar, TenantVisibilityToggle, useCanManageTenantVisibility, useManagedVisibility } from "@/components/protocolos/TenantVisibilityControls";
import { TENANT_CAN_EDIT_GLOBAL_CATALOG, GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { useAuth } from "@/hooks/useAuth";
import { canAccess } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { Link } from "react-router-dom";
import { useTenantProducts, useSaveTenantProduct, useArchiveTenantProduct } from "@/hooks/useTenantProducts";
import { useProductUnitCapability, useProductUnitAdmin } from "@/hooks/useProductUnitAdmin";
import { isProductUnit, type ProductUnit } from "@/lib/catalogo/productUnitContract";
import { useTenantProductDetails } from "@/hooks/useTenantProductDetails";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Filter, FlaskConical, Download, Layers, Trash2, FileDown, Check, ChevronsUpDown, FileText, Droplets, Info } from "lucide-react";


import { generateCatalogoProdutosPdf } from "@/lib/pdf/catalogoProdutosPdf";
import { generateFichaTecnicaProdutoPdf } from "@/lib/pdf/fichaTecnicaProdutoPdf";
import { toast } from "sonner";
import { DeleteProtocoloButton } from "./DeleteProtocoloButton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/financial/format";
import { calcularValorLitro, calcularValorDose, calcularCustoHa, calcularDoseAPartirCustoHa } from "@/lib/catalogo/pricing";
import { formatValorHaListagem } from "@/lib/catalogo/valorHaListagem";

import { recalcPricing, numOrNullStr, fmtNumStr, type PricingField } from "@/lib/protocolos/pricingRecalc";
import { buildFormulacoesPayload } from "@/lib/protocolos/composicaoSync";
import { TENANT_PRODUCT_FIELDS, buildTenantProductPayload, parseTenantProductAck, tenantProductErrorMessage, type TenantProductDraft } from "@/lib/catalogo/tenantProducts";
import { replaceTenantFormulacoes } from "@/lib/catalogo/tenantCatalogRoots";
import { ProductTechnicalProfileDialog } from "./ProductTechnicalProfileDialog";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";

import { useCatalogoVolumes } from "@/hooks/useCatalogoVolumes";
import { CatalogoVolumesDialog } from "./CatalogoVolumesDialog";
import { VolumesChips } from "./VolumesChips";
import { gerarProximoCodigoProduto, ehCodigoAutomatico, PREFIXOS_PRODUTO } from "@/lib/protocolos/autoCodigo";
import { normalizeVersaoCatalogoForSave, versaoCatalogoToInput } from "@/lib/protocolos/produtoFormFields";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";
import { useActiveTenantName } from "@/hooks/useActiveTenantName";
import { PRODUCT_FAMILY_TABS, productMatchesFamily, familyForNewProduct, type ProductFamilyTab } from "@/lib/catalogo/productFamilies";
import { DocumentaryAI } from "./catalog/DocumentaryAI";

interface Microrganismo {
  id: string;
  nome: string;
  nome_cientifico: string | null;
  concentracao_ufc_ml: number | null;
  valor_dose_brl: number | null;
  dose_ml_ha: number | null;
  codigo: string | null;
  tipo: string | null;
}

interface Formulacao {
  id: string;
  produto_id?: string | null;
  volume_ml: number;
  microrganismo_id: string | null;
  component_insumo_id: string | null;
  proporcao: number | null;
  e_volume_fixo: boolean;
  concentracao?: number | null;
  unidade?: string | null;
  microrganismos?: Microrganismo;
  insumos?: { nome: string };
}


interface Produto {
  id: string;
  codigo: string | null;
  nome: string;
  tipo: string;
  dose_ml_ha: number | null;
  modo_aplicacao: string | null;
  valor_ha_brl: number | null;
  valor_dose_brl: number | null;
  valor_litro_brl: number | null;
  funcao_completa: string | null;
  versao_catalogo: string | null;
  ativo: boolean;
  b2b_enabled: boolean;
  e_insumo: boolean;
  estoque_minimo: number | null;
  descricao?: string | null;
  modo_acao?: string | null;
  familia_catalogo?: string | null;
  classe_catalogo?: string | null;
  updated_at?: string | null;
  owner_organization_id?: string | null;
  archived_at?: string | null;
  formulacoes?: Formulacao[];
}


// ── Salvamento por empresa (substitui CAT-06 compensação no cliente) ──────────
export type SaveProdutoOutcome =
  | { status: "ok"; produtoId: string }
  | { status: "error"; message: string }
  | { status: "partial"; produtoId: string; message: string };

const MSG_PARCIAL =
  "Produto salvo, mas a composição não foi alterada (a anterior foi mantida). Recarregue e revise a composição.";
const MSG_RECARREGAR = "Versão do produto desconhecida. Recarregue antes de editar.";

const MSG_NAO_CONFIRMADO = "Não foi possível confirmar o salvamento do produto. A composição não foi alterada.";
/**
 * Catálogo exclusivo por empresa: produto pela RPC `tenant_product_save` (empresa do servidor, CAS, idempotência)
 * e composição pela substituição ATÔMICA `tenant_catalog_formulacoes_replace` com o token devolvido.
 * Sem escrita direta nem compensação no cliente: se a composição falhar depois do produto confirmado,
 * o resultado é "partial" (produto salvo, composição anterior intacta no servidor) — nunca ok.
 */
export async function saveProdutoTenant(opts: {
  client: any;
  produtoId: string | null;
  expectedUpdatedAt: string | null;
  payload: Record<string, any>;
  buildFormulacoes: (produtoId: string) => any[];
}): Promise<SaveProdutoOutcome> {
  const { client, produtoId, expectedUpdatedAt, payload, buildFormulacoes } = opts;
  if (produtoId && !expectedUpdatedAt) return { status: "error", message: MSG_RECARREGAR };
  const draft: TenantProductDraft = {};
  for (const k of TENANT_PRODUCT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
    if (k === "codigo" && (payload.codigo === null || payload.codigo === "")) continue; // servidor gera por empresa
    draft[k] = payload[k];
  }
  let body: Record<string, unknown>;
  try { body = buildTenantProductPayload(draft, produtoId === null); }
  catch (e: any) { return { status: "error", message: e?.message || MSG_NAO_CONFIRMADO }; }
  const saved = await client.rpc("tenant_product_save", {
    p_product_id: produtoId, p_payload: body, p_expected_updated_at: produtoId ? expectedUpdatedAt : null,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (saved.error) return { status: "error", message: tenantProductErrorMessage(saved.error.code, saved.error.message) };
  let ack;
  try { ack = parseTenantProductAck(saved.data, produtoId); }
  catch { return { status: "error", message: MSG_NAO_CONFIRMADO }; }
  try {
    const items = buildFormulacoes(ack.product_id);
    if (items.some((row) => row.produto_id !== undefined && row.produto_id !== ack.product_id)) {
      return { status: "partial", produtoId: ack.product_id, message: MSG_PARCIAL };
    }
    await replaceTenantFormulacoes(client, ack.product_id, items, ack.updated_at);
    return { status: "ok", produtoId: ack.product_id };
  } catch (e: any) {
    return { status: "partial", produtoId: ack.product_id, message: `${MSG_PARCIAL} ${e?.message ?? ""}`.trim() };
  }
}

/**
 * CAT-07 — carrega catálogo. Só devolve dados quando as 4 consultas passam.
 */
export async function carregarCatalogoProdutos(client: any): Promise<
  | { error: string }
  | { produtos: any[]; microrganismos: any[]; profileStatusMap: Record<string, string> }
> {
  const [produtosResult, formulacoesResult, microrganismosResult, profilesResult] = await Promise.all([
    client.from("produtos").select("*").order("nome"),
    client
      .from("formulacoes")
      .select("id, produto_id, microrganismo_id, component_insumo_id, volume_ml, proporcao, e_volume_fixo"),
    client
      .from("microrganismos")
      .select("id, nome, nome_cientifico, concentracao_ufc_ml, valor_dose_brl, dose_ml_ha, codigo, tipo")
      .order("codigo", { nullsFirst: false })
      .order("nome"),
    client.from("product_technical_profiles").select("produto_id,status_validacao"),
  ]);

  const error =
    produtosResult?.error || formulacoesResult?.error || microrganismosResult?.error || profilesResult?.error;
  if (error) return { error: error.message || "Erro ao carregar produtos" };

  const profileStatusMap: Record<string, string> = {};
  (profilesResult.data ?? []).forEach((x: any) => {
    profileStatusMap[x.produto_id] = x.status_validacao;
  });

  const microrganismosData = (microrganismosResult.data ?? []) as any[];
  const produtosData = (produtosResult.data ?? []) as any[];
  const microMap = new Map(microrganismosData.map((m: any) => [m.id, m]));
  const productNameMap = new Map(produtosData.map((p: any) => [p.id, p.nome]));
  const formulacoesByProduct = ((formulacoesResult.data ?? []) as any[]).reduce((acc: any, f: any) => {
    if (!f.produto_id) return acc;
    const formulacao = {
      ...f,
      microrganismos: f.microrganismo_id ? microMap.get(f.microrganismo_id) : undefined,
      insumos: f.component_insumo_id ? { nome: productNameMap.get(f.component_insumo_id) || "Insumo" } : undefined,
    };
    acc[f.produto_id] = [...(acc[f.produto_id] ?? []), formulacao];
    return acc;
  }, {});

  const produtos = produtosData.map((produto: any) => ({
    ...produto,
    formulacoes: formulacoesByProduct[produto.id] ?? [],
  }));

  return { produtos, microrganismos: microrganismosData, profileStatusMap };
}

export function ProdutosTab({ initialFamily = "todos", onCreated }: { initialFamily?: ProductFamilyTab; onCreated?: () => void } = {}) {
  const mobile = useIsMobile();
  const activeFamilies = useActiveCatalogFamilies();
  const [exitOpen, setExitOpen] = useState(false);
  const { name: tenantName } = useActiveTenantName();
  
  const [volumesEdit, setVolumesEdit] = useState<Produto | null>(null);
  const [fichaProduto, setFichaProduto] = useState<Produto | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [familyTab, setFamilyTab] = useState<ProductFamilyTab>(initialFamily);
  const [showArchived, setShowArchived] = useState(false);
  const productList = useTenantProducts(showArchived);
  const details = useTenantProductDetails();
  const editor = useTenantCatalogEditor();
  const { roles = [] } = useAuth();
  const canConsultFiscal = editor.ready && FEATURE_FLAGS.fiscalProductProfilesUi && roles.some(role => canAccess(role, "/configuracoes/fiscal/produtos"));
  const saveProduct = useSaveTenantProduct();
  const archiveProduct = useArchiveTenantProduct();
  const retainedSave = useRef<Parameters<typeof saveProduct.mutateAsync>[0] | null>(null);
  const [partialMessage, setPartialMessage] = useState<string | null>(null);
  const [partialAck, setPartialAck] = useState<{ product_id: string; updated_at: string } | null>(null);
  const [partialKind, setPartialKind] = useState<"definitive" | "uncertain" | null>(null);
  const [partialExport, setPartialExport] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const retainedForm = useRef<any>(null);

  const [form, setForm] = useState({
    id: "",
    updated_at: "" as string,
    codigo: "",
    descricao: "",
    familia_catalogo: "",
    classe_catalogo: "",
    modo_acao: "",
    nome: "",
    tipo: "solo",
    dose_ml_ha: "",
    modo_aplicacao: "",
    valor_ha_brl: "",
    valor_dose_brl: "",
    valor_litro_brl: "",
    funcao_completa: "",
    versao_catalogo: "",
    ativo: true,
    b2b_enabled: false,
    e_insumo: false,
    estoque_minimo: "",
    fornecedor: "",
    safra_referencia: "",
    composicao: [] as { 
      microrganismo_id: string | null; 
      component_insumo_id: string | null; 
      volume_ml: number;
      proporcao: number | null;
      e_volume_fixo: boolean;
      concentracao?: number | null;
      unidade?: string | null;
    }[]
  });



  const [unit, setUnit] = useState<ProductUnit | "">("");
  const unitTouched = useRef(false);
  // Geração de hidratação: cada abertura/edição/troca de escopo reaplica a unidade canônica já lida (mesmo em cache)
  // ao produto atual, sem sobrescrever escolha do usuário.
  const [unitHydration, setUnitHydration] = useState(0);
  const resetUnit = () => { setUnit(""); unitTouched.current = false; setUnitHydration(g => g + 1); };
  const unitCapability = useProductUnitCapability(open && editor.canEdit);
  const unitRead = useProductUnitAdmin(form.id, open && editor.canEdit && unitCapability.data === true);
  useEffect(() => {
    if (open && form.id && unitRead.isSuccess && !unitTouched.current) setUnit(unitRead.data ?? "");
  }, [unitRead.data, unitRead.isSuccess, unitHydration, form.id, open]);

  const fetch = async () => { await Promise.all([productList.refetch(), details.refetch()]); };
  const localGeneration = useRef(0);
  const activeScopeKey = editor.scope;
  const microrganismos = (details.data?.microorganisms ?? []) as unknown as Microrganismo[];
  const profileStatusMap = Object.fromEntries((details.data?.profiles ?? []).map(p => [p.produto_id, p.status_validacao]));
  useEffect(() => {
    localGeneration.current += 1;
    resetUnit();
    // Escopo mudou: descarta rascunho/exportação retidos (nunca reutilizados em outro ator/tenant).
    retainedSave.current = null; retainedForm.current = null;
    setPartialMessage(null);
    setPartialAck(null); setPartialKind(null); setPartialExport(null); setReconciling(false);
    setOpen(false); resetForm();
    setVolumesEdit(null); setFichaProduto(null); setSearch(""); setFilterTipo("todos"); setFamilyTab(initialFamily);
    return () => { localGeneration.current += 1; };
  }, [activeScopeKey]);
  const items = useMemo(() => {
    const micros = (details.data?.microorganisms ?? []) as unknown as Microrganismo[];
    const microMap = new Map(micros.map(m => [m.id, m]));
    const rows = (productList.data ?? []).map(p => ({ ...p,
      formulacoes: (details.data?.formulas ?? []).filter(f => f.produto_id === p.id).map(f => ({ ...f,
        microrganismos: f.microrganismo_id ? microMap.get(f.microrganismo_id) : undefined })) })) as unknown as Produto[];
    return rows;
  }, [productList.data, details.data]);
  const filteredItems = items.filter(p => (!search || `${p.nome} ${p.codigo ?? ""} ${p.funcao_completa ?? ""}`.toLowerCase().includes(search.toLowerCase())) &&
    (filterTipo === "todos" || p.tipo === filterTipo) && productMatchesFamily(p.familia_catalogo, familyTab));
  const tenantVis = { displayed: filteredItems, map: undefined as Map<string, any> | undefined, error: null };
  const canManageVis = false;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor.canEdit || !details.isSuccess || !productList.isSuccess) { toast.error("Catálogo indisponível para edição neste contexto."); return; }
    if (!retainedSave.current && (unitCapability.data !== true || (form.id && !unitRead.isSuccess) || !isProductUnit(unit))) {
      toast.error("Unidade do produto não confirmada. Escolha kg, g, mL ou L após carregar o cadastro."); return;
    }
    const current = editor.capture();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    
    // Código: enviar null quando o usuário não digitou nada OU manteve a
    // sugestão automática mostrada no input — o trigger no servidor
    // (`set_codigo_produto`) gera atomicamente. Códigos manuais sobem como vieram.
    const codigoDigitado = form.codigo?.trim() || "";
    const codigoFinal = codigoDigitado && !ehCodigoAutomatico(codigoDigitado, PREFIXOS_PRODUTO)
      ? codigoDigitado
      : (form.id ? (codigoDigitado || null) : null);

    const doseMlHa = form.dose_ml_ha ? Number(form.dose_ml_ha) : (totalVolume > 0 ? totalVolume : null);
    const payload: any = {
      nome: form.nome,
      unidade_conteudo: unit,
      descricao: form.descricao || null,
      familia_catalogo: form.familia_catalogo || null,
      classe_catalogo: form.classe_catalogo || null,
      modo_acao: form.modo_acao || null,
      codigo: codigoFinal,
      tipo: form.tipo as any,
      dose_ml_ha: doseMlHa,
      modo_aplicacao: form.modo_aplicacao || null,
      valor_ha_brl: form.valor_ha_brl ? Number(form.valor_ha_brl) : null,
      valor_dose_brl: form.valor_dose_brl ? Number(form.valor_dose_brl) : null,
      valor_litro_brl: form.valor_litro_brl ? Number(form.valor_litro_brl) : null,
      funcao_completa: form.funcao_completa || null,

      b2b_enabled: form.b2b_enabled,
      e_insumo: form.e_insumo,
      estoque_minimo: form.estoque_minimo ? Number(form.estoque_minimo) : 0,
    };
    // Nota: `fornecedor` e `safra_referencia` NÃO existem na tabela `produtos`
    // (só em `microrganismos`). Não enviar ao Supabase — evita schema-cache error.


    try {
      const existing = items.find(p => p.id === form.id) as any;
      if (composicaoTouched.current && (existing?.composition_status || existing?.declarations?.length)) {
        throw new Error("Composição declarativa preservada. Sua edição não é suportada por este contrato; nenhum dado foi salvo.");
      }
      if (composicaoTouched.current && form.composicao.some(row => (!row.microrganismo_id && !row.component_insumo_id) ||
        !Number.isFinite(Number(row.volume_ml)) || Number(row.volume_ml) < 0)) {
        throw new Error("Revise os componentes e os volumes da composição; nenhum dado foi salvo.");
      }
      const input = retainedSave.current ?? { id: form.id || null,
        expectedUpdatedAt: form.id ? (form.updated_at || null) : null,
        draft: payload, composition: composicaoTouched.current ? form.composicao.map(row => ({ ...row })) : undefined };
      const ack = await saveProduct.mutateAsync(input);
      if (!current()) return;
      const outcome = ack.compositionError ? { status: "partial", message: ack.compositionError } : { status: "ok" };

      if (outcome.status === "partial") {
        toast.error(outcome.message);
        retainedSave.current = input;
        const frozen = { ...form, id: ack.product_id, updated_at: ack.updated_at };
        retainedForm.current = frozen;
        setPartialAck({ product_id: ack.product_id, updated_at: ack.updated_at });
        setPartialKind(ack.compositionFailure === "definitive" ? "definitive" : "uncertain");
        setPartialExport(JSON.stringify({
          produto_id: ack.product_id, versao_confirmada_produto: ack.updated_at, nome: frozen.nome,
          resultado_composicao: ack.compositionFailure === "definitive" ? "recusada_pelo_servidor" : "nao_confirmada",
          composicao_rascunho: frozen.composicao.map(item => ({ ...item,
            nome: item.microrganismo_id ? microrganismos.find(m => m.id === item.microrganismo_id)?.nome ?? null : items.find(p => p.id === item.component_insumo_id)?.nome ?? null })),
        }, null, 2));
        setForm(frozen);
        setPartialMessage(outcome.message ?? "Produto salvo; composição não confirmada.");
        return;
      }
      clearPartial();
      toast.success(form.id ? "Produto atualizado!" : "Produto cadastrado!");
      setOpen(false); onCreated?.();
      resetForm();
      fetch();
    } catch (err: any) {
      if (current()) toast.error(err?.message || "Erro ao salvar produto");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const clearPartial = () => {
    retainedSave.current = null; retainedForm.current = null;
    setPartialMessage(null); setPartialAck(null); setPartialKind(null); setPartialExport(null);
  };

  const copyPartialDraft = async () => {
    if (!partialExport) return;
    try { await navigator.clipboard.writeText(partialExport); toast.success("Rascunho copiado."); }
    catch { toast.error("Não foi possível copiar; selecione o texto do rascunho exportável."); }
  };

  /** Saída explícita com tentativa INCERTA: fecha o diálogo mas mantém intenção/chaves retidas para replay posterior. */
  const leavePendingUncertain = () => {
    if (partialKind !== "uncertain" || savingRef.current) return;
    setOpen(false);
  };
  const resumePending = () => {
    if (!retainedForm.current || savingRef.current) return;
    setForm(retainedForm.current); setOpen(true);
  };

  /**
   * Recusa DEFINITIVA: lê o produto de novo pelas leituras canônicas do tenant e só então reconhece o resultado e
   * reabre a edição do MESMO produto com a versão fresca (CAS). Nunca desfaz o produto nem cria outro.
   */
  const returnToEditAfterDefinitive = async () => {
    if (partialKind !== "definitive" || !partialAck || savingRef.current || reconciling) return;
    const current = editor.capture();
    const productId = partialAck.product_id;
    setReconciling(true);
    try {
      const [list, det] = await Promise.all([productList.refetch(), details.refetch()]);
      if (!current()) return;
      const fresh = list.isSuccess && det.isSuccess ? (list.data ?? []).find(p => p.id === productId) : undefined;
      if (!fresh || typeof fresh.updated_at !== "string" || !fresh.updated_at) {
        toast.error("A leitura atual não confirmou o produto salvo. Nada foi alterado; tente novamente.");
        return;
      }
      if (!saveProduct.acknowledgeDefinitiveComposition(productId)) {
        toast.error("Não foi possível reconhecer o resultado neste contexto. Recarregue a página.");
        return;
      }
      const micros = (det.data?.microorganisms ?? []) as unknown as Microrganismo[];
      const microMap = new Map(micros.map(m => [m.id, m]));
      const freshProduct = { ...fresh, formulacoes: (det.data?.formulas ?? []).filter(f => f.produto_id === productId)
        .map(f => ({ ...f, microrganismos: f.microrganismo_id ? microMap.get(f.microrganismo_id) : undefined })) } as unknown as Produto;
      retainedSave.current = null; retainedForm.current = null;
      setPartialMessage(null); setPartialAck(null); setPartialKind(null);
      // O rascunho recusado continua exportável na edição reaberta até o diálogo fechar.
      handleEdit(freshProduct);
      composicaoTouched.current = false;
      if (fresh.updated_at !== partialAck.updated_at) toast.info("O produto mudou desde o salvamento; a versão atual foi carregada.");
    } finally {
      if (current()) setReconciling(false);
    }
  };

  const resetForm = () => {
    resetUnit();
    setForm({
      id: "",
      updated_at: "",
      codigo: "",
      descricao: "",
      familia_catalogo: "",
      classe_catalogo: "",
      modo_acao: "",
      nome: "",
      tipo: "solo",
      dose_ml_ha: "",
      modo_aplicacao: "",
      valor_ha_brl: "",
      valor_dose_brl: "",
      valor_litro_brl: "",
      funcao_completa: "",
      versao_catalogo: "",
      ativo: true,
      b2b_enabled: false,
      e_insumo: false,
      estoque_minimo: "",
      fornecedor: "",
      safra_referencia: "",
      composicao: []
    });
  };


  const handleEdit = (p: Produto) => {
    if (retainedSave.current || savingRef.current) return;
    resetUnit();
    let dose = p.valor_dose_brl;
    let litro = p.valor_litro_brl;
    const ha = p.valor_ha_brl;
    const doseHa = p.dose_ml_ha;
    if (dose == null && litro != null) dose = calcularValorDose(litro);
    if (litro == null && dose != null) litro = calcularValorLitro(dose);
    if (dose == null && ha != null && doseHa) {
      dose = calcularDoseAPartirCustoHa(doseHa, ha);
      if (dose != null && litro == null) litro = calcularValorLitro(dose);
    }
    setForm({
      id: p.id,
      updated_at: p.updated_at ?? "",
      codigo: p.codigo || "",
      descricao: p.descricao || "",
      familia_catalogo: (p as any).familia_catalogo || "",
      classe_catalogo: (p as any).classe_catalogo || "",
      modo_acao: (p as any).modo_acao || "",
      nome: p.nome,
      tipo: p.tipo,
      dose_ml_ha: p.dose_ml_ha?.toString() || "",
      modo_aplicacao: p.modo_aplicacao || "",
      valor_ha_brl: ha != null ? String(ha) : "",
      valor_dose_brl: dose != null ? String(Number(dose.toFixed(4))) : "",
      valor_litro_brl: litro != null ? String(Number(litro.toFixed(4))) : "",
      funcao_completa: p.funcao_completa || "",
      versao_catalogo: versaoCatalogoToInput(p.versao_catalogo),
      ativo: p.ativo,
      b2b_enabled: !!p.b2b_enabled,
      e_insumo: p.e_insumo,
      estoque_minimo: p.estoque_minimo?.toString() || "",
      fornecedor: ((p as any).fornecedor as string | null) || "",
      safra_referencia: ((p as any).safra_referencia as string | null) || "",
      composicao: p.formulacoes?.map(f => ({
        microrganismo_id: f.microrganismo_id,
        component_insumo_id: f.component_insumo_id,
        volume_ml: f.volume_ml,
        proporcao: f.proporcao,
        e_volume_fixo: f.e_volume_fixo
        , concentracao: f.concentracao, unidade: f.unidade
      })) || []
    });

    composicaoTouched.current = false;
    lastSuggestion.current = null;
    setOpen(true);
  };

  // Helpers for bidirectional pricing edits (shared util)
  const fmtNum = fmtNumStr;
  const numOrNull = numOrNullStr;
  const applyRecalc = (field: PricingField, raw: string) => {
    const current = {
      doseMlHa: numOrNull(form.dose_ml_ha),
      valorDose: numOrNull(form.valor_dose_brl),
      valorLitro: numOrNull(form.valor_litro_brl),
      valorHa: numOrNull(form.valor_ha_brl),
    };
    const next = recalcPricing(field, numOrNull(raw), current);
    setForm({
      ...form,
      dose_ml_ha: field === "doseMlHa" ? raw : fmtNum(next.doseMlHa),
      valor_dose_brl: field === "valorDose" ? raw : fmtNum(next.valorDose),
      valor_litro_brl: field === "valorLitro" ? raw : fmtNum(next.valorLitro),
      valor_ha_brl: field === "valorHa" ? raw : fmtNum(next.valorHa),
    });
  };
  const onChangeDoseMlHa = (v: string) => applyRecalc("doseMlHa", v);
  const onChangeValorDose = (v: string) => applyRecalc("valorDose", v);
  const onChangeValorLitro = (v: string) => applyRecalc("valorLitro", v);
  const onChangeValorHa = (v: string) => applyRecalc("valorHa", v);



  const composicaoTouched = useRef(false);
  const lastSuggestion = useRef<{ dose: string; valorDose: string; valorLitro: string; valorHa: string } | null>(null);
  const markComposicaoTouched = () => { composicaoTouched.current = true; };

  const addMicrorganismo = () => {
    if (retainedSave.current || savingRef.current) return;
    markComposicaoTouched();
    setForm(prev => ({
      ...prev,
      composicao: [...prev.composicao, { microrganismo_id: "", component_insumo_id: null, volume_ml: 0, proporcao: null, e_volume_fixo: false }]
    }));
  };

  const addInsumo = () => {
    if (retainedSave.current || savingRef.current) return;
    markComposicaoTouched();
    setForm(prev => ({
      ...prev,
      composicao: [...prev.composicao, { microrganismo_id: null, component_insumo_id: "", volume_ml: 0, proporcao: 10, e_volume_fixo: false }]
    }));
  };

  const removeMicrorganismo = (index: number) => {
    if (retainedSave.current || savingRef.current) return;
    markComposicaoTouched();
    setForm(prev => ({
      ...prev,
      composicao: prev.composicao.filter((_, i) => i !== index)
    }));
  };

  const updateComposicao = (index: number, field: string, value: any) => {
    if (retainedSave.current || savingRef.current) return;
    markComposicaoTouched();
    setForm(prev => {
      const newComp = [...prev.composicao];
      newComp[index] = { ...newComp[index], [field]: value };
      return { ...prev, composicao: newComp };
    });
  };

  const totalVolume = form.composicao.reduce((sum, c) => sum + (Number(c.volume_ml) || 0), 0);
  
  const estimatedCost = form.composicao.reduce((sum, c) => {
    if (c.microrganismo_id) {
      const mic = microrganismos.find(m => m.id === c.microrganismo_id);
      if (!mic || !mic.valor_dose_brl) return sum;
      return sum + (Number(c.volume_ml) * mic.valor_dose_brl / 100);
    }
    return sum;
  }, 0);

  // Sugestão de custo/dose a partir da composição
  const sugestaoCusto = estimatedCost > 0 ? estimatedCost : null;
  const sugestaoDose = totalVolume > 0 ? totalVolume : null;
  const doseRefParaCusto = sugestaoDose ?? (form.dose_ml_ha ? Number(form.dose_ml_ha) : null);
  const sugestaoValorDose = (sugestaoCusto != null && doseRefParaCusto && doseRefParaCusto > 0)
    ? sugestaoCusto / (doseRefParaCusto / 100)
    : null;
  const sugestaoValorLitro = sugestaoValorDose != null ? sugestaoValorDose * 10 : null;
  const sugestao = {
    dose: sugestaoDose != null ? String(sugestaoDose) : "",
    valorDose: fmtNum(sugestaoValorDose),
    valorLitro: fmtNum(sugestaoValorLitro),
    valorHa: fmtNum(sugestaoCusto),
  };

  const aplicarSugestaoComposicao = () => {
    setForm(f => ({
      ...f,
      dose_ml_ha: sugestao.dose || f.dose_ml_ha,
      valor_dose_brl: sugestao.valorDose,
      valor_litro_brl: sugestao.valorLitro,
      valor_ha_brl: sugestao.valorHa,
    }));
    lastSuggestion.current = { ...sugestao };
  };

  useEffect(() => {
    if (!composicaoTouched.current) return;
    if (sugestaoCusto == null) return;
    aplicarSugestaoComposicao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimatedCost, totalVolume]);

  const custoAtual = form.valor_ha_brl ? Number(form.valor_ha_brl) : null;
  const mostrarBotaoSugestao = sugestaoCusto != null && (custoAtual == null || Math.abs(custoAtual - sugestaoCusto) >= 0.01);
  const doseAtual = form.dose_ml_ha ? Number(form.dose_ml_ha) : null;
  const mostrarBotaoSugestaoDose = sugestaoDose != null && (doseAtual == null || Math.abs(doseAtual - sugestaoDose) >= 0.01);



  const handleExportPdf = async () => {
    try {
      await generateCatalogoProdutosPdf(filteredItems, tenantName);
      toast.success("Catálogo exportado!");
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    }
  };

  const tipoLabels: Record<string, string> = {
    inseticida: "Inseticida",
    fungicida: "Fungicida",
    solo: "Solo",
    inoculante: "Inoculante",
    solubilizador: "Solubilizador",
  };

  return (
    <div className="space-y-4 min-w-0 [&_button]:min-h-11 [&_input]:min-h-11 [&_button[role=combobox]]:min-h-11">
      {mobile ? <CompactCatalogSelect label="Família de produtos" value={familyTab} options={activeFamilies.options} onChange={v => setFamilyTab(v as ProductFamilyTab)} /> : <Tabs value={familyTab} onValueChange={v => setFamilyTab(v as ProductFamilyTab)}>
        <TabsList aria-label="Famílias de produtos" className="flex h-auto w-full justify-start overflow-x-auto">
          {activeFamilies.options.map(t => <TabsTrigger key={t.value} value={t.value} className="min-h-11 shrink-0">{t.value === "todos" ? "Todos" : t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por código, nome ou função..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto min-w-0">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Tipos</SelectItem>
              {Object.entries(tipoLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleExportPdf} className="hidden md:flex">
            <FileDown className="h-4 w-4 mr-1" />
            Exportar PDF
          </Button>

          {editor.canEdit && (
            <Button size="sm" disabled={!!partialMessage} onClick={() => { resetForm(); setForm(f => ({ ...f, familia_catalogo: familyForNewProduct(familyTab) })); setPartialExport(null); composicaoTouched.current = false; setOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />{familyTab === "todos" ? "Novo produto" : "Adicionar produto"}
            </Button>
          )}
          {canConsultFiscal && <Button asChild variant="outline" size="sm"><Link to="/configuracoes/fiscal/produtos"><FileText className="h-4 w-4 mr-1" />Perfis fiscais</Link></Button>}






          {!open && partialMessage && partialAck && <div role="status" className="w-full text-sm text-destructive flex flex-wrap items-center gap-2">
            <span>Composição pendente do produto {partialAck.product_id}. Novas edições ficam bloqueadas até reconciliar.</span>
            <Button type="button" size="sm" variant="outline" onClick={resumePending}>Retomar reconciliação</Button>
          </div>}
          <Dialog open={open} onOpenChange={(v) => { if (!v && retainedSave.current) return; if (!v && (form.nome.trim() || form.id)) { setExitOpen(true); return; } setOpen(v); if(!v) { resetForm(); setPartialExport(null); composicaoTouched.current = false; lastSuggestion.current = null; } }}>
            <DialogContent aria-describedby={undefined} className="max-w-3xl max-h-[95vh] overflow-y-auto flex flex-col">
              <DialogHeader>
                <DialogTitle>{form.id ? "Editar" : "Novo"} produto</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSave} className="space-y-6 pt-4">
                {partialMessage && <div role="alert" className="space-y-2 text-destructive">
                  <p>{partialMessage}</p>
                  {partialAck && <dl className="text-sm break-all"><dt>Produto salvo</dt><dd>{partialAck.product_id}</dd><dt>Versão confirmada do produto</dt><dd>{partialAck.updated_at}</dd></dl>}
                  {partialKind === "definitive"
                    ? <p>O servidor recusou esta composição de forma definitiva; repetir a mesma tentativa não muda o resultado. O produto continua salvo (não foi desfeito). Copie o rascunho se precisar e volte a editar o mesmo produto a partir da versão atual.</p>
                    : <p>Composição pendente de confirmação. O rascunho foi mantido; reconcilie a mesma tentativa antes de alterar. Você pode sair e retomar depois nesta tela.</p>}
                  <ul className="text-sm">{form.composicao.map((item, index) => <li key={index}>{item.microrganismo_id ? microrganismos.find(m => m.id === item.microrganismo_id)?.nome ?? item.microrganismo_id : items.find(p => p.id === item.component_insumo_id)?.nome ?? item.component_insumo_id} · {item.volume_ml} mL{item.concentracao != null ? ` · ${item.concentracao} ${item.unidade ?? ""}` : ""}</li>)}</ul>
                </div>}
                {partialExport && <details className="text-sm">
                  <summary>Rascunho exportável da composição</summary>
                  <textarea readOnly aria-label="Rascunho exportável" className="w-full h-32 font-mono text-xs border rounded p-2 bg-muted" value={partialExport} />
                  <Button type="button" variant="outline" size="sm" onClick={copyPartialDraft}>Copiar rascunho</Button>
                </details>}
                <fieldset disabled={saving || !!partialMessage} className="min-w-0">
                <Tabs defaultValue="geral">
                  <TabsList className="flex w-full h-auto flex-wrap mb-4 [&_button]:flex-1 [&_button]:whitespace-normal [&_button]:min-w-20">
                    <TabsTrigger value="geral">Identificação</TabsTrigger>
                    <TabsTrigger value="aplicacao">Aplicação & Custo</TabsTrigger>
                    <TabsTrigger value="composicao">Composição</TabsTrigger>
                    {canConsultFiscal && form.id && <TabsTrigger value="fiscal">Fiscal</TabsTrigger>}
                  </TabsList>

                  <TabsContent value="geral" className="space-y-4">
                    <DocumentaryAI identity={{ name: form.nome, manufacturer: "", registration: "", entity: "produto", id: form.id || undefined }} values={form} allowed={["descricao", "modo_acao", "funcao_completa", "modo_aplicacao"]} onApply={fields => setForm(f => ({ ...f, ...fields }))} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Código (Referência)</Label>
                        <Input value={form.codigo} onChange={(e) => setForm({...form, codigo: e.target.value})} placeholder="Ex: SOLO-1" />
                        <p className="text-[10px] text-muted-foreground">Gerado automaticamente conforme o tipo. Você pode editar se necessário.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="produto-unit">Unidade do produto *</Label>
                        <Select value={unit || undefined} disabled={saving || unitCapability.data !== true || (!!form.id && !unitRead.isSuccess)} onValueChange={value => { if (isProductUnit(value)) { unitTouched.current = true; setUnit(value); } }}>
                          <SelectTrigger id="produto-unit"><SelectValue placeholder="kg, g, mL ou L" /></SelectTrigger>
                          <SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="g">g</SelectItem><SelectItem value="ml">mL</SelectItem><SelectItem value="l">L</SelectItem></SelectContent>
                        </Select>
                        {(unitCapability.isError || unitRead.isError) && <p role="alert">Não foi possível confirmar a unidade do produto.</p>}
                        <Label htmlFor="produto-nome">Nome Comercial *</Label>
                        <Input id="produto-nome" value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} placeholder="Ex: Solo 1" required />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo *</Label>
                        <Select value={form.tipo} onValueChange={(v) => setForm({...form, tipo: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(tipoLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Versão Catálogo</Label>
                        <Input value={form.versao_catalogo} disabled /><p className="text-xs text-muted-foreground">Versão preservada; alteração não disponível.</p>
                      </div>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>Família</Label><Select value={form.familia_catalogo || "pendente"} onValueChange={v => setForm({ ...form, familia_catalogo: v === "pendente" ? "" : v })}><SelectTrigger aria-label="Família"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="biologico">Biológico</SelectItem><SelectItem value="quimico">Químico</SelectItem><SelectItem value="fertilizante_adubo">Fertilizante/Adubo</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label htmlFor="produto-classe">Classe</Label><Input id="produto-classe" value={form.classe_catalogo} onChange={e => setForm({ ...form, classe_catalogo: e.target.value })} /></div>
                      <div className="space-y-2"><Label htmlFor="produto-modo-acao">Modo de ação</Label><Input id="produto-modo-acao" value={form.modo_acao} onChange={e => setForm({ ...form, modo_acao: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-muted/20 rounded border border-dashed">
                      <div className="flex items-center space-x-2">
                        <input 
                          type="checkbox" 
                          id="e_insumo" 
                          checked={form.e_insumo} 
                          onChange={(e) => setForm({...form, e_insumo: e.target.checked})}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="e_insumo" className="cursor-pointer">É Matéria-Prima / Insumo</Label>
                      </div>
                      {form.e_insumo && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase">Estoque Mínimo Alerta (L ou Un)</Label>
                          <Input 
                            type="number" 
                            value={form.estoque_minimo} 
                            onChange={(e) => setForm({...form, estoque_minimo: e.target.value})} 
                            placeholder="Alerta de reposição"
                            className="h-8"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2"><Label htmlFor="produto-descricao">Descrição</Label><Textarea id="produto-descricao" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
                    <div className="space-y-2">
                      <Label>Função Agronômica Completa</Label>
                      <Textarea value={form.funcao_completa} onChange={(e) => setForm({...form, funcao_completa: e.target.value})} rows={2} placeholder="Descrição detalhada das funções do produto..." />
                    </div>
                  </TabsContent>


                  <TabsContent value="aplicacao" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Dose de aplicação (mL/ha)</Label>
                        <Input
                          type="number"
                          value={form.dose_ml_ha}
                          onChange={(e) => onChangeDoseMlHa(e.target.value)}
                          placeholder={totalVolume > 0 ? String(totalVolume) : "Ex: 500"}
                        />
                        {totalVolume > 0 && (
                          <p className="text-[10px] text-muted-foreground italic flex items-center gap-2 flex-wrap">
                            <span>Sugestão pela composição: {totalVolume} mL/ha</span>
                            {mostrarBotaoSugestaoDose && (
                              <button
                                type="button"
                                onClick={() => onChangeDoseMlHa(String(totalVolume))}
                                className="text-primary underline hover:no-underline not-italic font-medium"
                              >
                                usar {totalVolume} mL/ha
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Modo de Aplicação</Label>
                        <Input value={form.modo_aplicacao} onChange={(e) => setForm({...form, modo_aplicacao: e.target.value})} placeholder="Ex: sulco de plantio / via barra" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded-md border bg-muted/20">
                      <div className="space-y-1">
                        <Label className="text-xs">Valor da dose 100 mL</Label>
                        <MoneyInput
                          allowEmpty
                          value={form.valor_dose_brl}
                          onValueChange={(v) => onChangeValorDose(v == null ? "" : String(v))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Valor por litro</Label>
                        <MoneyInput
                          allowEmpty
                          value={form.valor_litro_brl}
                          onValueChange={(v) => onChangeValorLitro(v == null ? "" : String(v))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Custo estimado por hectare</Label>
                        <MoneyInput
                          allowEmpty
                          value={form.valor_ha_brl}
                          onValueChange={(v) => onChangeValorHa(v == null ? "" : String(v))}
                          className="text-primary font-bold"
                        />
                      </div>
                      <div className="md:col-span-3 flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] text-muted-foreground italic">
                          1 dose = 100 mL · 1 litro = 10 doses. Editar qualquer campo recalcula os demais.
                          {estimatedCost > 0 && (
                            <> Sugestão da composição: <strong className="text-foreground">{brl(estimatedCost)}/ha</strong>
                              {custoAtual != null && Math.abs(custoAtual - estimatedCost) >= 0.01 && (
                                <> (atual: {brl(custoAtual)}/ha)</>
                              )}.
                            </>
                          )}
                        </p>
                        {mostrarBotaoSugestao && (
                          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={aplicarSugestaoComposicao}>
                            Aplicar sugestão da composição
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-3">Referência Comercial</h3><p className="text-xs text-muted-foreground">Fornecedor e safra não estão disponíveis para alteração neste cadastro.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Fornecedor</Label>
                          <Input
                            value={form.fornecedor} disabled
                            placeholder="Deixe em branco para remover"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Safra</Label>
                          <Input
                            value={form.safra_referencia} disabled
                            placeholder="Deixe em branco para remover"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">

                      <h3 className="text-sm font-semibold mb-3">Disponibilidade</h3>
                      <div className="flex flex-wrap gap-6">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="prod_b2b" checked={form.b2b_enabled} onChange={(e) => setForm({...form, b2b_enabled: e.target.checked})} className="h-4 w-4" />
                          <Label htmlFor="prod_b2b">Disponível no portal B2B</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="prod_ativo" checked={form.ativo} disabled className="h-4 w-4" />
                          <Label htmlFor="prod_ativo">Ativo</Label>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        O portal B2B exibe principalmente o <strong>Custo/ha</strong>, além de dose 100 mL e valor por litro. O desconto é definido no cadastro de cada parceiro.
                      </p>
                    </div>

                  </TabsContent>

                  <TabsContent value="composicao" className="space-y-4 min-h-[300px] sm:min-h-[400px]">
                    {((items.find(p => p.id === form.id) as any)?.composition_status || (items.find(p => p.id === form.id) as any)?.declarations?.length) && <p role="alert">Composição declarativa preservada; edição indisponível neste contrato. Identificação e preços podem ser alterados sem substituí-la.</p>}
                    <div className="flex justify-between items-center mb-2">
                      <Label>Composição Técnica (Fórmula)</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={addMicrorganismo} className="h-7 text-[10px]">
                          <FlaskConical className="h-3 w-3 mr-1" /> + Microrganismo
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={addInsumo} className="h-7 text-[10px]">
                          <Layers className="h-3 w-3 mr-1" /> + Matéria-Prima
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {form.composicao.map((item, idx) => {
                        const isMicro = item.microrganismo_id !== null;
                        return (
                          <div key={idx} className="bg-muted/30 p-2 rounded-md border border-dashed space-y-2">
                            <div className="flex gap-2 items-end">
                              <div className="flex-1 space-y-1">
                                <Label className="text-[10px] uppercase">{isMicro ? "Microrganismo" : "Matéria-Prima"}</Label>
                                <Popover modal={true}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      className="w-full justify-between h-8 text-xs px-2"
                                    >
                                      {isMicro 
                                        ? (() => {
                                            const m = microrganismos.find((m) => m.id === item.microrganismo_id);
                                            if (!m) return "Selecionar...";
                                            return m.codigo ? `${m.codigo} — ${m.nome}` : m.nome;
                                          })()
                                        : (items.find((p) => p.id === item.component_insumo_id)?.nome || "Selecionar...")
                                      }
                                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[calc(100vw-80px)] sm:w-[380px] p-0" onOpenAutoFocus={(e) => e.preventDefault()} align="start">
                                    <Command>
                                      <CommandInput placeholder={`Buscar ${isMicro ? 'microrganismo (nome ou código)' : 'insumo'}...`} className="h-8 text-xs" onKeyDown={(e) => e.stopPropagation()} />
                                      <CommandList className="max-h-[260px] overflow-y-auto">
                                        <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                                        <CommandGroup>
                                          {isMicro ? (
                                            microrganismos.map((m) => (
                                              <CommandItem
                                                key={m.id}
                                                value={`${m.codigo || ""} ${m.nome} ${m.nome_cientifico || ""}`}
                                                onSelect={() => {
                                                  updateComposicao(idx, "microrganismo_id", m.id);
                                                  if (m.dose_ml_ha) updateComposicao(idx, "volume_ml", m.dose_ml_ha);
                                                }}
                                                className="text-xs"
                                              >
                                                <Check className={cn("mr-2 h-3 w-3 mt-1 shrink-0", item.microrganismo_id === m.id ? "opacity-100" : "opacity-0")} />
                                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                  <div className="flex items-center gap-1.5">
                                                    {m.codigo && (
                                                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{m.codigo}</span>
                                                    )}
                                                    <span className="truncate">{m.nome}</span>
                                                  </div>
                                                  {m.nome_cientifico && <span className="text-[10px] text-muted-foreground italic truncate">{m.nome_cientifico}</span>}
                                                  {m.concentracao_ufc_ml != null && (
                                                    <span className="text-[10px] text-primary">Concentração: {formatConcentracaoDisplay(m.concentracao_ufc_ml)} UFC/mL</span>
                                                  )}
                                                </div>
                                              </CommandItem>
                                            ))
                                          ) : (
                                            items.filter(p => p.e_insumo).map((p) => (
                                              <CommandItem
                                                key={p.id}
                                                value={p.nome}
                                                onSelect={() => updateComposicao(idx, "component_insumo_id", p.id)}
                                                className="text-xs"
                                              >
                                                <Check className={cn("mr-2 h-3 w-3", item.component_insumo_id === p.id ? "opacity-100" : "opacity-0")} />
                                                <span>{p.nome}</span>
                                              </CommandItem>
                                            ))
                                          )}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              
                              {isMicro ? (
                                <div className="w-24 space-y-1">
                                  <Label className="text-[10px] uppercase">Dose (mL/ha)</Label>
                                  <Input 
                                    type="number" 
                                    value={item.volume_ml} 
                                    onChange={(e) => updateComposicao(idx, "volume_ml", e.target.value)}
                                    className="h-8"
                                  />
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <div className="w-20 space-y-1">
                                    <Label className="text-[10px] uppercase">Concent. %</Label>
                                    <Input 
                                      type="number" 
                                      value={item.proporcao || ""} 
                                      onChange={(e) => updateComposicao(idx, "proporcao", e.target.value)}
                                      className="h-8"
                                      placeholder="0-100"
                                    />
                                  </div>
                                  <div className="w-24 space-y-1">
                                    <Label className="text-[10px] uppercase">Fixo (mL)</Label>
                                    <Input 
                                      type="number" 
                                      value={item.volume_ml} 
                                      onChange={(e) => updateComposicao(idx, "volume_ml", e.target.value)}
                                      className="h-8"
                                      placeholder="Ex: 50"
                                    />
                                  </div>
                                </div>
                              )}

                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                aria-label="Remover componente"
                                className="h-8 w-8 text-destructive"
                                onClick={() => removeMicrorganismo(idx)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}

                      {form.composicao.length === 0 && (
                        <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground text-sm">
                          Nenhum componente adicionado à formulação.
                        </div>
                      )}
                    </div>


                    <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-muted/50 rounded-lg border">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground block uppercase font-semibold">Volume Total</span>
                        <div className="text-lg font-mono-data text-emerald-600">
                          {totalVolume} mL/ha
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground block uppercase font-semibold">Custo Estimado</span>
                        <div className="text-lg font-mono-data text-primary">
                          {brl(estimatedCost)} / ha
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  {canConsultFiscal && form.id && <TabsContent value="fiscal" className="space-y-4"><ProductFiscalGuide productId={form.id} displayName={form.nome} displayCodigo={form.codigo || null} /></TabsContent>}
                </Tabs>
                </fieldset>

                <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-background border-t flex justify-end items-center gap-4 z-10">
                  {partialKind === "uncertain" && <Button type="button" variant="outline" disabled={saving} onClick={leavePendingUncertain}>Sair mantendo pendência</Button>}
                  {partialKind === "definitive"
                    ? <Button type="button" disabled={saving || reconciling} onClick={returnToEditAfterDefinitive}>{reconciling ? "Lendo versão atual..." : "Reconhecer e voltar à edição"}</Button>
                    : <Button type="submit" disabled={saving}>{saving ? "Salvando..." : partialMessage ? "Reconciliar composição" : "Salvar Produto"}</Button>}
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Mostrar arquivados</label>
      {(productList.isLoading || details.isLoading) && <p role="status">Carregando produtos…</p>}
      {(productList.isError || details.isError) && <p role="alert" className="text-destructive">Não foi possível carregar o catálogo. <Button variant="outline" onClick={fetch}>Recarregar</Button></p>}
      {mobile && <div className="space-y-3">{tenantVis.displayed.map(p => <article key={p.id} className="border rounded-md p-3 space-y-2">
        <Button variant="ghost" className="min-h-11 h-auto w-full justify-start whitespace-normal text-left" onClick={() => setFichaProduto(p)}>{p.nome}</Button>
        <p className="text-sm text-muted-foreground break-words">{p.descricao || p.funcao_completa}</p>
        <div className="flex flex-wrap gap-2"><LabelTechnicalDataDialog kind="toxicidade" targetId={p.id} targetName={p.nome} /><ProductDossierAction productId={p.id} name={p.nome} code={p.codigo}/><Button className="min-h-11" variant="outline" onClick={() => setFichaProduto(p)}>{profileStatusMap[p.id] ? "Editar ficha" : "Criar ficha"}</Button>{editor.canEdit && <Button className="min-h-11" variant="outline" onClick={() => handleEdit(p)}>Editar produto</Button>}</div>
      </article>)}{!tenantVis.displayed.length && <div className="space-y-2 py-6"><p>Nenhum produto encontrado</p><Button className="min-h-11" variant="outline" onClick={() => { setFamilyTab("todos"); setFilterTipo("todos"); }}>Buscar em todas as famílias</Button></div>}</div>}
      <DraftExitConfirmation open={exitOpen} onOpenChange={setExitOpen} onLeave={() => { setOpen(false); resetForm(); }} />
      <div className="rounded-md border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Composição</TableHead>
              <TableHead>Volumes</TableHead>
              <TableHead className="text-right">Dose (mL/ha)</TableHead>
              <TableHead className="text-right">Valor/ha</TableHead>
              <TableHead>Ref.</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {tenantVis.displayed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                  Nenhum produto encontrado
                </TableCell>
              </TableRow>
            ) : tenantVis.displayed.map((p) => {
              const pAny = p as any;
              const fornecedor: string | null = pAny.fornecedor ?? null;
              const safra: string | null = pAny.safra_referencia ?? null;
              const observacoes: string | null = pAny.observacoes ?? null;
              return (
              <TableRow key={p.id} className={`hover:bg-muted/50 ${!p.ativo ? "opacity-50" : ""}`} onClick={editor.canEdit && details.isSuccess ? () => handleEdit(p) : undefined}>
                <TableCell>
                  {p.codigo && (
                    <div className="font-mono text-[10px] text-muted-foreground">{p.codigo}</div>
                  )}
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {p.nome}
                    {!p.ativo && <Badge variant="outline" className="text-[9px] h-4">Inativo</Badge>}

                    <TenantHiddenBadge state={tenantVis.map?.get(p.id)} />
                    {(p.formulacoes?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary bg-primary/5">Exclusivo</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-[9px] uppercase h-4 px-1.5">
                      {tipoLabels[p.tipo] || p.tipo}
                    </Badge>
                    {p.modo_aplicacao && (
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 truncate max-w-[180px]" title={p.modo_aplicacao}>
                        <FlaskConical className="h-3 w-3 shrink-0" />
                        {p.modo_aplicacao}
                      </span>
                    )}
                    {p.funcao_completa && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={p.funcao_completa}>
                        {p.funcao_completa}
                      </span>
                    )}
                    {(p.formulacoes?.length || 0) > 0 && (
                      <span className="text-[10px] text-emerald-600 font-medium">Fórmula Composta</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {p.formulacoes?.slice(0, 3).map((f) => (
                        <TooltipProvider key={f.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="h-6 w-6 rounded-full border-2 border-background bg-emerald-50 flex items-center justify-center text-[8px] font-bold text-emerald-700 shadow-sm">
                                {f.microrganismos?.nome.substring(0, 2).toUpperCase()}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <span className="font-bold">{f.microrganismos?.nome}</span>
                                <br />
                                <span className="text-muted-foreground">{f.microrganismos?.nome_cientifico}</span>
                                <br />
                                <span className="text-primary">{f.volume_ml} mL/ha</span>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                      {(p.formulacoes?.length || 0) > 3 && (
                        <div className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-bold">
                          +{(p.formulacoes?.length || 0) - 3}
                        </div>
                      )}
                    </div>
                    {(!p.formulacoes || p.formulacoes.length === 0) ? (
                      <span className="text-[10px] text-muted-foreground italic">Sem composição</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {p.formulacoes?.length} microrganismos
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <VolumesChips
                    volumes={(details.data?.volumes ?? []).filter(v => v.produto_id === p.id) as any}
                    onAdd={editor.canEdit ? () => setVolumesEdit(p) : undefined}
                  />
                </TableCell>
                <TableCell className="text-right font-mono-data">
                  {p.dose_ml_ha || "—"}
                </TableCell>
                <TableCell className="text-right font-mono-data text-xs whitespace-nowrap">
                  <span className="text-primary font-semibold">
                    {formatValorHaListagem({
                      doseMlHa: p.dose_ml_ha,
                      valorHa: p.valor_ha_brl,
                      valorDose: p.valor_dose_brl,
                      valorLitro: p.valor_litro_brl,
                    })}
                  </span>
                  <span className="text-muted-foreground font-normal"> /ha</span>
                </TableCell>

                <TableCell>
                  <div className="text-xs">
                    <div>{fornecedor || "—"}</div>
                    {safra && <div className="text-muted-foreground">{safra}</div>}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end flex-wrap">
                    <TechnicalProfileStatusBadge status={profileStatusMap[p.id] ?? null} />
                    {canManageVis && !p.owner_organization_id && (
                      <TenantVisibilityToggle entity="produto" item={{ id: p.id, nome: p.nome, ativo: p.ativo }}
                        state={tenantVis.map?.get(p.id)} disabledReason={tenantVis.error ?? (tenantVis.map ? null : "Carregando preferências.")} />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => setVolumesEdit(p)}
                      title="Volumes do catálogo"
                    >
                      <Droplets className="h-3.5 w-3.5 mr-1" />Volumes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => setFichaProduto(p)}
                      title="Ficha técnica"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />Ficha
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={async () => {
                        try {
                          await generateFichaTecnicaProdutoPdf({ produtoId: p.id, empresaNome: tenantName });
                          toast.success("PDF exportado");
                        } catch (e: any) { toast.error(e.message); }
                      }}
                      title="Exportar PDF"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                    {observacoes && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{observacoes}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <LabelTechnicalDataDialog kind="toxicidade" targetId={p.id} targetName={p.nome} /><ProductDossierAction productId={p.id} name={p.nome} code={p.codigo}/>
                    {editor.canEdit && <>
                      <Button variant="outline" size="sm" disabled={!details.isSuccess || saveProduct.isPending || !!partialMessage} onClick={() => handleEdit(p)}>Editar</Button>
                      <Button variant="ghost" size="sm" disabled={archiveProduct.isPending || !p.updated_at} onClick={async () => {
                        if (!p.updated_at) return;
                        const current = editor.capture();
                        try { await archiveProduct.mutateAsync({ id: p.id, archived: p.ativo, expectedUpdatedAt: p.updated_at }); }
                        catch (e) { if (current()) toast.error((e as Error).message); }
                      }}>{p.ativo ? "Arquivar" : "Reativar"}</Button>
                    </>}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>


      <ProductTechnicalProfileDialog
        open={!!fichaProduto}
        onOpenChange={(v) => !v && setFichaProduto(null)}
        produto={fichaProduto as any}
      />

      {volumesEdit && (
        <CatalogoVolumesDialog
          open={!!volumesEdit}
          onOpenChange={(v) => !v && setVolumesEdit(null)}
          itemId={volumesEdit.id}
          itemTipo="produto"
          itemNome={volumesEdit.nome}
          valorLitroBase={volumesEdit.valor_litro_brl ?? (volumesEdit.valor_dose_brl != null ? volumesEdit.valor_dose_brl * 10 : null)}
          owned={!!volumesEdit.owner_organization_id}
          parentUpdatedAt={volumesEdit.updated_at ?? null}
        />
      )}

      <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-4">
        <span>As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica.</span>
      </div>
    </div>
  );
}
