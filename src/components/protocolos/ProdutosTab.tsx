import { TenantHiddenBadge, TenantVisibilityBar, TenantVisibilityToggle, useCanManageTenantVisibility, useManagedVisibility } from "@/components/protocolos/TenantVisibilityControls";
import { TENANT_CAN_EDIT_GLOBAL_CATALOG, GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useRef, useState } from "react";
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
import { ProductTechnicalProfileDialog } from "./ProductTechnicalProfileDialog";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";
import { CatalogOriginBadge } from "./OwnedCatalogItemControls";

import { useCatalogoVolumes } from "@/hooks/useCatalogoVolumes";
import { CatalogoVolumesDialog } from "./CatalogoVolumesDialog";
import { VolumesChips } from "./VolumesChips";
import { gerarProximoCodigoProduto, ehCodigoAutomatico, PREFIXOS_PRODUTO } from "@/lib/protocolos/autoCodigo";
import { normalizeVersaoCatalogoForSave, versaoCatalogoToInput } from "@/lib/protocolos/produtoFormFields";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";

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
  owner_organization_id?: string | null;
  archived_at?: string | null;
  formulacoes?: Formulacao[];
}


// ── CAT-06/CAT-07 ────────────────────────────────────────────────────────────
// Colunas restauráveis (apenas as que `handleSave` altera / precisa reinserir).
export const PRODUTO_SNAPSHOT_COLUMNS =
  "nome, codigo, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, valor_dose_brl, valor_litro_brl, funcao_completa, versao_catalogo, ativo, b2b_enabled, e_insumo, estoque_minimo";
export const FORMULACAO_SNAPSHOT_COLUMNS =
  "produto_id, microrganismo_id, component_insumo_id, volume_ml, proporcao, e_volume_fixo";

export type SaveProdutoOutcome =
  | { status: "ok"; produtoId: string }
  | { status: "error"; message: string }
  | { status: "critical"; message: string };

const MSG_CRITICO =
  "Falha crítica: a reversão automática não foi concluída. NÃO repita a operação e contate o suporte imediatamente.";

const MSG_NAO_CONFIRMADO = "Não foi possível confirmar o salvamento do produto. A composição não foi alterada.";
const MSG_COMPOSICAO = "Não foi possível confirmar a alteração da composição.";

type MutationRow = { id: string; produto_id?: string };
function confirmedRows(data: unknown, count: number, produtoId?: string): data is MutationRow[] {
  if (!Array.isArray(data) || data.length !== count) return false;
  const ids = new Set<string>();
  for (const row of data) {
    if (!row || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)
      || (produtoId !== undefined && row.produto_id !== produtoId)) return false;
    ids.add(row.id);
  }
  return true;
}
function confirmedProduct(data: unknown, expectedId?: string): data is MutationRow[] {
  return confirmedRows(data, 1) && (expectedId === undefined || data[0].id === expectedId);
}
function confirmedDeleted(data: unknown, expected: MutationRow[], produtoId: string): boolean {
  return confirmedRows(data, expected.length, produtoId)
    && data.every(row => expected.some(previous => previous.id === row.id));
}

/** Compensação best-effort entre chamadas: não é transação nem proteção contra concorrência. */
export async function saveProdutoComCompensacao(opts: {
  client: any;
  produtoId: string | null;
  payload: Record<string, any>;
  buildFormulacoes: (produtoId: string) => any[];
}): Promise<SaveProdutoOutcome> {
  const { client, produtoId, payload, buildFormulacoes } = opts;
  if (produtoId) {
    const snapProduto = await client.from("produtos").select(PRODUTO_SNAPSHOT_COLUMNS)
      .eq("id", produtoId).maybeSingle();
    if (snapProduto.error || !snapProduto.data) {
      return { status: "error", message: "Não foi possível ler o estado atual do produto." };
    }
    // IDs permitem conferir exclusão e restaurar a identidade da composição anterior.
    const snapFormulacoes = await client.from("formulacoes")
      .select(`id, ${FORMULACAO_SNAPSHOT_COLUMNS}`).eq("produto_id", produtoId);
    if (snapFormulacoes.error || !Array.isArray(snapFormulacoes.data)
      || !confirmedRows(snapFormulacoes.data, snapFormulacoes.data.length, produtoId)) {
      return { status: "error", message: MSG_COMPOSICAO };
    }
    const formulacoesAnteriores = snapFormulacoes.data;
    const compensar = async (motivo: string): Promise<SaveProdutoOutcome> => {
      try {
        const upd = await client.from("produtos").update(snapProduto.data).eq("id", produtoId).select("id");
        // Não tocar composição se a restauração do produto não foi confirmada.
        if (upd.error || !confirmedProduct(upd.data, produtoId)) return { status: "critical", message: MSG_CRITICO };
        const atuais = await client.from("formulacoes").select("id, produto_id").eq("produto_id", produtoId);
        if (atuais.error || !Array.isArray(atuais.data)
          || !confirmedRows(atuais.data, atuais.data.length, produtoId)) return { status: "critical", message: MSG_CRITICO };
        const del = await client.from("formulacoes").delete().eq("produto_id", produtoId).select("id, produto_id");
        if (del.error || !confirmedDeleted(del.data, atuais.data, produtoId)) return { status: "critical", message: MSG_CRITICO };
        if (formulacoesAnteriores.length > 0) {
          const ins = await client.from("formulacoes").insert(formulacoesAnteriores).select("id, produto_id");
          if (ins.error || !confirmedDeleted(ins.data, formulacoesAnteriores, produtoId)) return { status: "critical", message: MSG_CRITICO };
        }
        return { status: "error", message: motivo };
      } catch {
        return { status: "critical", message: MSG_CRITICO };
      }
    };
    const upd = await client.from("produtos").update(payload).eq("id", produtoId).select("id");
    if (upd.error || !confirmedProduct(upd.data, produtoId)) return { status: "error", message: MSG_NAO_CONFIRMADO };
    try {
      const formulacoesPayload = buildFormulacoes(produtoId);
      if (formulacoesPayload.some(row => row.produto_id !== produtoId)) return await compensar(MSG_COMPOSICAO);
      const del = await client.from("formulacoes").delete().eq("produto_id", produtoId).select("id, produto_id");
      if (del.error || !confirmedDeleted(del.data, formulacoesAnteriores, produtoId)) return await compensar(MSG_COMPOSICAO);
      if (formulacoesPayload.length > 0) {
        const ins = await client.from("formulacoes").insert(formulacoesPayload).select("id, produto_id");
        if (ins.error || !confirmedRows(ins.data, formulacoesPayload.length, produtoId)) return await compensar(MSG_COMPOSICAO);
      }
      return { status: "ok", produtoId };
    } catch {
      return await compensar(MSG_COMPOSICAO);
    }
  }
  const criado = await client.from("produtos").insert([payload]).select("id");
  if (criado.error) return { status: "error", message: "Não foi possível salvar o produto." };
  // Sem ID confiável não há alvo seguro para compensação; não tentar adivinhá-lo.
  if (!confirmedProduct(criado.data, typeof payload.id === "string" ? payload.id : undefined)) {
    return { status: "critical", message: MSG_CRITICO };
  }
  const novoId = criado.data[0].id;
  const removerNovo = async (): Promise<SaveProdutoOutcome> => {
    try {
      const del = await client.from("produtos").delete().eq("id", novoId).select("id");
      return del.error || !confirmedProduct(del.data, novoId)
        ? { status: "critical", message: MSG_CRITICO }
        : { status: "error", message: MSG_COMPOSICAO };
    } catch {
      return { status: "critical", message: MSG_CRITICO };
    }
  };
  try {
    const formulacoesPayload = buildFormulacoes(novoId);
    if (formulacoesPayload.some(row => row.produto_id !== novoId)) return await removerNovo();
    if (formulacoesPayload.length > 0) {
      const ins = await client.from("formulacoes").insert(formulacoesPayload).select("id, produto_id");
      if (ins.error || !confirmedRows(ins.data, formulacoesPayload.length, novoId)) return await removerNovo();
    }
    return { status: "ok", produtoId: novoId };
  } catch {
    return await removerNovo();
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

export function ProdutosTab() {
  const [items, setItems] = useState<Produto[]>([]);
  const [filteredItems, setFilteredItems] = useState<Produto[]>([]);
  const [microrganismos, setMicrorganismos] = useState<Microrganismo[]>([]);
  const [profileStatusMap, setProfileStatusMap] = useState<Record<string, string>>({});
  
  const { data: volumesCat } = useCatalogoVolumes();
  const [volumesEdit, setVolumesEdit] = useState<Produto | null>(null);
  const [fichaProduto, setFichaProduto] = useState<Produto | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const tenantVis = useManagedVisibility("produto", filteredItems);
  const canManageVis = useCanManageTenantVisibility();

  const [form, setForm] = useState({
    id: "",
    codigo: "",
    nome: "",
    tipo: "solo",
    dose_ml_ha: "",
    modo_aplicacao: "",
    valor_ha_brl: "",
    valor_dose_brl: "",
    valor_litro_brl: "",
    funcao_completa: "",
    versao_catalogo: "v1.2",
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
    }[]
  });



  const fetch = async () => {
    const result = await carregarCatalogoProdutos(supabase as any);
    if ("error" in result) {
      toast.error("Erro ao carregar produtos");
      return;
    }
    setProfileStatusMap(result.profileStatusMap);
    setMicrorganismos(result.microrganismos as Microrganismo[]);
    setItems(result.produtos as unknown as Produto[]);
    setFilteredItems(result.produtos as unknown as Produto[]);
  };

  useEffect(() => {
    fetch();
  }, []);

  useEffect(() => {
    let result = items;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i => 
        i.nome.toLowerCase().includes(s) || 
        (i.codigo && i.codigo.toLowerCase().includes(s)) ||
        (i.funcao_completa && i.funcao_completa.toLowerCase().includes(s))
      );
    }
    if (filterTipo !== "todos") {
      result = result.filter(i => i.tipo === filterTipo);
    }
    setFilteredItems(result);
  }, [search, filterTipo, items]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!TENANT_CAN_EDIT_GLOBAL_CATALOG) { toast.error(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE); return; }
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
      codigo: codigoFinal,
      tipo: form.tipo as any,
      dose_ml_ha: doseMlHa,
      modo_aplicacao: form.modo_aplicacao || null,
      valor_ha_brl: form.valor_ha_brl ? Number(form.valor_ha_brl) : null,
      valor_dose_brl: form.valor_dose_brl ? Number(form.valor_dose_brl) : null,
      valor_litro_brl: form.valor_litro_brl ? Number(form.valor_litro_brl) : null,
      funcao_completa: form.funcao_completa || null,
      versao_catalogo: normalizeVersaoCatalogoForSave(form.versao_catalogo),
      ativo: form.ativo,
      b2b_enabled: form.b2b_enabled,
      e_insumo: form.e_insumo,
      estoque_minimo: form.estoque_minimo ? Number(form.estoque_minimo) : 0,
    };
    // Nota: `fornecedor` e `safra_referencia` NÃO existem na tabela `produtos`
    // (só em `microrganismos`). Não enviar ao Supabase — evita schema-cache error.


    try {
      const outcome = await saveProdutoComCompensacao({
        client: supabase as any,
        produtoId: form.id || null,
        payload,
        // Monta payload sanitizado (filtra vazios + dedup) — ver src/lib/protocolos/composicaoSync.ts
        buildFormulacoes: (id: string) => buildFormulacoesPayload(id, form.composicao),
      });

      if (outcome.status === "critical") {
        toast.error(outcome.message);
        return;
      }
      if (outcome.status === "error") {
        toast.error(outcome.message || "Erro ao salvar produto");
        return;
      }

      toast.success(form.id ? "Produto atualizado!" : "Produto cadastrado!");
      setOpen(false);
      resetForm();
      fetch();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar produto");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      id: "",
      codigo: "",
      nome: "",
      tipo: "solo",
      dose_ml_ha: "",
      modo_aplicacao: "",
      valor_ha_brl: "",
      valor_dose_brl: "",
      valor_litro_brl: "",
      funcao_completa: "",
      versao_catalogo: "v1.2",
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
      codigo: p.codigo || "",
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
      })) || []
    });

    composicaoTouched.current = false;
    lastSuggestion.current = null;
    setOpen(true);
  };

  // Auto-preencher código ao abrir dialog de novo item ou trocar tipo (se vazio/automático)
  useEffect(() => {
    if (!open || form.id) return;
    if (form.codigo && !ehCodigoAutomatico(form.codigo, PREFIXOS_PRODUTO)) return;
    (async () => {
      const codigo = await gerarProximoCodigoProduto(form.tipo);
      setForm((f) => ({ ...f, codigo }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.tipo, form.id]);



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
    markComposicaoTouched();
    setForm(prev => ({
      ...prev,
      composicao: [...prev.composicao, { microrganismo_id: "", component_insumo_id: null, volume_ml: 100, proporcao: null, e_volume_fixo: false }]
    }));
  };

  const addInsumo = () => {
    markComposicaoTouched();
    setForm(prev => ({
      ...prev,
      composicao: [...prev.composicao, { microrganismo_id: null, component_insumo_id: "", volume_ml: 0, proporcao: 10, e_volume_fixo: false }]
    }));
  };

  const removeMicrorganismo = (index: number) => {
    markComposicaoTouched();
    setForm(prev => ({
      ...prev,
      composicao: prev.composicao.filter((_, i) => i !== index)
    }));
  };

  const updateComposicao = (index: number, field: string, value: any) => {
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
      await generateCatalogoProdutosPdf(filteredItems);
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
    <div className="space-y-4">
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
        
        <div className="flex gap-2 w-full md:w-auto">
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






          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if(!v) { resetForm(); composicaoTouched.current = false; lastSuggestion.current = null; } }}>
            {TENANT_CAN_EDIT_GLOBAL_CATALOG && (
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Novo Produto
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto flex flex-col">
              <DialogHeader>
                <DialogTitle>{form.id ? "Editar" : "Novo"} Produto Bioinsumo</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSave} className="space-y-6 pt-4">
                <Tabs defaultValue="geral">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="geral">Identificação</TabsTrigger>
                    <TabsTrigger value="aplicacao">Aplicação & Custo</TabsTrigger>
                    <TabsTrigger value="composicao">Composição</TabsTrigger>
                  </TabsList>

                  <TabsContent value="geral" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Código (Referência)</Label>
                        <Input value={form.codigo} onChange={(e) => setForm({...form, codigo: e.target.value})} placeholder="Ex: SOLO-1" />
                        <p className="text-[10px] text-muted-foreground">Gerado automaticamente conforme o tipo. Você pode editar se necessário.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Nome Comercial *</Label>
                        <Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} placeholder="Ex: Solo 1" required />
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
                        <Input value={form.versao_catalogo} onChange={(e) => setForm({...form, versao_catalogo: e.target.value})} />
                      </div>
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
                      <h3 className="text-sm font-semibold mb-3">Referência Comercial</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Fornecedor</Label>
                          <Input
                            value={form.fornecedor}
                            onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                            placeholder="Deixe em branco para remover"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Safra</Label>
                          <Input
                            value={form.safra_referencia}
                            onChange={(e) => setForm({ ...form, safra_referencia: e.target.value })}
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
                          <input type="checkbox" id="prod_ativo" checked={form.ativo} onChange={(e) => setForm({...form, ativo: e.target.checked})} className="h-4 w-4" />
                          <Label htmlFor="prod_ativo">Ativo</Label>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        O portal B2B exibe principalmente o <strong>Custo/ha</strong>, além de dose 100 mL e valor por litro. O desconto é definido no cadastro de cada parceiro.
                      </p>
                    </div>

                  </TabsContent>

                  <TabsContent value="composicao" className="space-y-4 min-h-[300px] sm:min-h-[400px]">
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
                </Tabs>

                <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-background border-t flex justify-end items-center gap-4 z-10">
                  <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar Produto"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <TenantVisibilityBar v={tenantVis} />

      <div className="rounded-md border">
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
              <TableRow key={p.id} className={`hover:bg-muted/50 ${!p.ativo ? "opacity-50" : ""}`} onClick={TENANT_CAN_EDIT_GLOBAL_CATALOG ? () => handleEdit(p) : undefined}>
                <TableCell>
                  {p.codigo && (
                    <div className="font-mono text-[10px] text-muted-foreground">{p.codigo}</div>
                  )}
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {p.nome}
                    {!p.ativo && <Badge variant="outline" className="text-[9px] h-4">Inativo</Badge>}
                    <CatalogOriginBadge item={p} />
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
                    volumes={volumesCat?.porProdutoId.get(p.id) ?? []}
                    onAdd={TENANT_CAN_EDIT_GLOBAL_CATALOG ? () => setVolumesEdit(p) : undefined}
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
                    {canManageVis && (
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
                          await generateFichaTecnicaProdutoPdf({ produtoId: p.id });
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
                    {TENANT_CAN_EDIT_GLOBAL_CATALOG && (
                    <DeleteProtocoloButton
                      table="produtos"
                      id={p.id}
                      label={p.nome}
                      itemLabel="produto"
                      onDeleted={fetch}
                    />
                    )}
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
        />
      )}

      <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-4">
        <span>As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica.</span>
      </div>
    </div>
  );
}
