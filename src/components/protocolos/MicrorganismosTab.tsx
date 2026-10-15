import { TenantHiddenBadge, TenantVisibilityBar, TenantVisibilityToggle, useCanManageTenantVisibility, useManagedVisibility } from "@/components/protocolos/TenantVisibilityControls";
import { TENANT_CAN_EDIT_GLOBAL_CATALOG, GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Filter, Info, FileDown, FileText, Droplets } from "lucide-react";
import { generateCatalogoMicrorganismosPdf } from "@/lib/pdf/catalogoMicrorganismosPdf";
import { generateFichaTecnicaMicrorganismoPdf } from "@/lib/pdf/fichaTecnicaMicrorganismoPdf";
import { generateDossieCompletoMicrorganismos } from "@/lib/pdf/dossieMicrorganismosPdf";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatConcentracaoDisplay, formatConcentracaoValue, parseConcentracao } from "@/lib/cqFormat";
import { MoneyInput } from "@/components/ui/money-input";
import { brl } from "@/lib/financial/format";
import { recalcPricing } from "@/lib/protocolos/pricingRecalc";
import { calcularCustoHa } from "@/lib/catalogo/pricing";
import { formatValorHaListagem } from "@/lib/catalogo/valorHaListagem";

import { DeleteProtocoloButton } from "./DeleteProtocoloButton";
import { MicroorganismTechnicalProfileDialog } from "./MicroorganismTechnicalProfileDialog";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";
import { supabase as sbClient } from "@/integrations/supabase/client";

import { useCatalogoVolumes } from "@/hooks/useCatalogoVolumes";
import { CatalogoVolumesDialog } from "./CatalogoVolumesDialog";
import { VolumesChips } from "./VolumesChips";
import { gerarProximoCodigoMicro, ehCodigoAutomatico, PREFIXOS_MICRO } from "@/lib/protocolos/autoCodigo";

/** CAT-08 · carga consistente: só aplica dados se ambas as consultas passarem. */
export async function carregarMicrorganismosCatalogo(client: any): Promise<
  | { ok: true; items: any[]; profileStatusMap: Record<string, string> }
  | { ok: false; error: any }
> {
  const [microResult, profilesResult] = await Promise.all([
    client.from("microrganismos").select("*").order("nome"),
    client.from("microorganism_technical_profiles").select("microrganismo_id,status_validacao"),
  ]);

  if (microResult?.error || profilesResult?.error) {
    return { ok: false, error: microResult?.error ?? profilesResult?.error };
  }

  const profileStatusMap: Record<string, string> = {};
  (profilesResult?.data ?? []).forEach((p: any) => {
    profileStatusMap[p.microrganismo_id] = p.status_validacao;
  });

  return { ok: true, items: (microResult?.data ?? []) as any[], profileStatusMap };
}

/** CAT-08 · executa `fn` apenas se nenhuma execução estiver em voo. */
export async function runExclusive<T>(
  ref: { current: boolean },
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (ref.current) return undefined;
  ref.current = true;
  try {
    return await fn();
  } finally {
    ref.current = false;
  }
}

interface Microrganismo {
  id: string;
  nome: string;
  nome_cientifico: string | null;
  tipo: string;
  concentracao_ufc_ml: number | null;
  concentracao_label: string | null;
  dose_ml_ha: number | null;
  valor_dose_brl: number | null;
  valor_litro_brl: number | null;
  fornecedor: string | null;
  safra_referencia: string | null;
  funcao_agronomica: string | null;
  meio_cultivo: string | null;
  producao_on_farm: boolean;
  observacoes: string | null;
  codigo: string | null;
  descricao: string | null;
  preco_tabela: number | null;
  b2b_enabled: boolean;
  ativo: boolean;
}

export function MicrorganismosTab() {
  const [items, setItems] = useState<Microrganismo[]>([]);
  const [filteredItems, setFilteredItems] = useState<Microrganismo[]>([]);
  const tenantVis = useManagedVisibility("microrganismo", filteredItems);
  const canManageVis = useCanManageTenantVisibility();
  
  const { data: volumesCat } = useCatalogoVolumes();
  const [volumesEdit, setVolumesEdit] = useState<Microrganismo | null>(null);
  const [profileStatusMap, setProfileStatusMap] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [fichaMicro, setFichaMicro] = useState<Microrganismo | null>(null);
  
  const [form, setForm] = useState({
    id: "",
    nome: "",
    nome_cientifico: "",
    tipo: "bacteria",
    concentracao_mantissa: "",
    concentracao_expoente: "",
    dose_ml_ha: "100",
    valor_dose_brl: 0 as number | null,
    valor_litro_brl: 0 as number | null,
    funcao_agronomica: "",
    fornecedor: "Cultivo Farm",
    safra_referencia: "2025",
    meio_cultivo: "líquido",
    producao_on_farm: true,
    observacoes: "",
    codigo: "",
    descricao: "",
    preco_tabela: null as number | null,
    b2b_enabled: false,
    ativo: true,
  });

  const fetch = async () => {
    const result = await carregarMicrorganismosCatalogo(supabase as any);
    if (!result.ok) {
      toast.error("Erro ao carregar microrganismos");
      return;
    }
    setItems(result.items as Microrganismo[]);
    setFilteredItems(result.items as Microrganismo[]);
    setProfileStatusMap(result.profileStatusMap);
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
        (i.nome_cientifico && i.nome_cientifico.toLowerCase().includes(s)) ||
        (i.funcao_agronomica && i.funcao_agronomica.toLowerCase().includes(s)) ||
        (i.codigo && i.codigo.toLowerCase().includes(s))
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

    await runExclusive(savingRef, async () => {
      setSaving(true);
      try {
        // Código: enviar null quando vazio ou ainda igual à sugestão automática —
        // o trigger no servidor (`set_codigo_microrganismo`) gera atomicamente.
        const codigoDigitado = form.codigo?.trim() || "";
        const codigoFinal = codigoDigitado && !ehCodigoAutomatico(codigoDigitado, PREFIXOS_MICRO)
          ? codigoDigitado
          : (form.id ? (codigoDigitado || null) : null);

        const payload = {
          nome: form.nome,
          nome_cientifico: form.nome_cientifico || null,
          tipo: form.tipo as any,
          concentracao_label: formatConcentracaoDisplay(formatConcentracaoValue(form.concentracao_mantissa, form.concentracao_expoente)),
          concentracao_ufc_ml: formatConcentracaoValue(form.concentracao_mantissa, form.concentracao_expoente),
          dose_ml_ha: form.dose_ml_ha ? Number(form.dose_ml_ha) : 100,
          valor_dose_brl: form.valor_dose_brl,
          valor_litro_brl: form.valor_litro_brl,
          funcao_agronomica: form.funcao_agronomica || null,
          fornecedor: form.fornecedor || null,
          safra_referencia: form.safra_referencia || null,
          meio_cultivo: form.meio_cultivo || null,
          producao_on_farm: form.producao_on_farm,
          observacoes: form.observacoes || null,
          codigo: codigoFinal,
          descricao: form.descricao?.trim() || null,
          preco_tabela: form.preco_tabela,
          b2b_enabled: form.b2b_enabled,
          ativo: form.ativo,
        };

        let error;
        if (form.id) {
          const { error: err } = await (supabase as any)
            .from("microrganismos")
            .update(payload)
            .eq("id", form.id);
          error = err;
        } else {
          const { error: err } = await (supabase as any)
            .from("microrganismos")
            .insert([payload]);
          error = err;
        }

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success(form.id ? "Microrganismo atualizado!" : "Microrganismo cadastrado!");
        setOpen(false);
        resetForm();
        await fetch();
      } catch (err: any) {
        toast.error(err?.message || "Erro inesperado ao salvar microrganismo");
      } finally {
        setSaving(false);
      }
    });
  };


  const resetForm = () => {
    setForm({
      id: "",
      nome: "",
      nome_cientifico: "",
      tipo: "bacteria",
      concentracao_mantissa: "",
      concentracao_expoente: "",
      dose_ml_ha: "100",
      valor_dose_brl: null,
      valor_litro_brl: null,
      funcao_agronomica: "",
      fornecedor: "Cultivo Farm",
      safra_referencia: "2025",
      meio_cultivo: "líquido",
      producao_on_farm: true,
      observacoes: "",
      codigo: "",
      descricao: "",
      preco_tabela: null,
      b2b_enabled: false,
      ativo: true,
    });
  };

  const handleEdit = (m: Microrganismo) => {
    setForm({
      id: m.id,
      nome: m.nome,
      nome_cientifico: m.nome_cientifico || "",
      tipo: m.tipo,
      concentracao_mantissa: parseConcentracao(m.concentracao_ufc_ml).mantissa,
      concentracao_expoente: parseConcentracao(m.concentracao_ufc_ml).expoente,
      dose_ml_ha: m.dose_ml_ha?.toString() || "100",
      valor_dose_brl: m.valor_dose_brl,
      valor_litro_brl: m.valor_litro_brl ?? (m.valor_dose_brl ? m.valor_dose_brl * 10 : null),
      funcao_agronomica: m.funcao_agronomica || "",
      fornecedor: m.fornecedor || "Cultivo Farm",
      safra_referencia: m.safra_referencia || "2025",
      meio_cultivo: m.meio_cultivo || "líquido",
      producao_on_farm: m.producao_on_farm,
      observacoes: m.observacoes || "",
      codigo: m.codigo || "",
      descricao: m.descricao || "",
      preco_tabela: m.preco_tabela,
      b2b_enabled: !!m.b2b_enabled,
      ativo: m.ativo ?? true,
    });
    setOpen(true);
  };

  // Auto-preencher código ao abrir dialog de novo item ou trocar tipo (se vazio/automático)
  useEffect(() => {
    if (!open || form.id) return;
    if (form.codigo && !ehCodigoAutomatico(form.codigo, PREFIXOS_MICRO)) return;
    (async () => {
      const codigo = await gerarProximoCodigoMicro(form.tipo);
      setForm((f) => ({ ...f, codigo }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.tipo, form.id]);

  const handleExportPdf = async () => {
    try {
      await generateCatalogoMicrorganismosPdf(filteredItems);
      toast.success("Catálogo exportado!");
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    }
  };

  const tipoLabels: Record<string, string> = {
    bacteria: "Bactéria",
    fungo: "Fungo",
    levedura: "Levedura",
    consorcio: "Consórcio",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome ou função..." 
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
            Exportar Lista
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={async () => {
              try {
                toast.loading("Gerando dossiê de microrganismos...");
                await generateDossieCompletoMicrorganismos();
                toast.dismiss();
                toast.success("Dossiê exportado!");
              } catch (err: any) {
                toast.dismiss();
                toast.error("Erro ao exportar dossiê: " + err.message);
              }
            }} 
            className="hidden lg:flex"
          >
            <FileText className="h-4 w-4 mr-1" />
            Dossiê Completo
          </Button>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if(!v) resetForm(); }}>
            {TENANT_CAN_EDIT_GLOBAL_CATALOG && (
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Novo Microrganismo
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{form.id ? "Editar" : "Novo"} Microrganismo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código (Referência)</Label>
                    <Input value={form.codigo} onChange={(e) => setForm({...form, codigo: e.target.value})} placeholder="Ex: BAC-1" />
                    <p className="text-[10px] text-muted-foreground">Gerado automaticamente conforme o tipo. Você pode editar se necessário.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Popular *</Label>
                    <Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} placeholder="Ex: Bacillus Subtilis" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Científico</Label>
                    <Input value={form.nome_cientifico} onChange={(e) => setForm({...form, nome_cientifico: e.target.value})} placeholder="Ex: Bacillus subtilis" />
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
                    <Label>Função Agronômica</Label>
                    <Input value={form.funcao_agronomica} onChange={(e) => setForm({...form, funcao_agronomica: e.target.value})} placeholder="Ex: Fungicida / Promotor" />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Especificação Técnica</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Concentração (UFC/mL)</Label>
                      <div className="flex items-end gap-1.5">
                        <div className="relative group flex-1">
                          <Input 
                            type="text" 
                            placeholder="1,3" 
                            className="h-10 font-mono"
                            value={form.concentracao_mantissa} 
                            onChange={(e) => setForm({...form, concentracao_mantissa: e.target.value.replace(".", ",")})} 
                          />
                        </div>
                        
                        <div className="flex items-center h-10 px-0.5">
                          <span className="text-muted-foreground font-medium italic select-none">× 10</span>
                        </div>

                        <div className="relative pb-3">
                          <div className="absolute -top-1.5 left-0">
                            <Input 
                              type="number" 
                              placeholder="9" 
                              className="w-11 h-8 px-1 text-center font-mono font-bold text-xs"
                              value={form.concentracao_expoente} 
                              onChange={(e) => setForm({...form, concentracao_expoente: e.target.value})} 
                            />
                          </div>
                          <div className="w-11 h-8"></div>
                        </div>

                        <div className="h-10 flex items-center pl-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">UFC</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">
                        Use vírgula para decimais na mantissa (ex: 1,3).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Meio de Cultivo</Label>
                      <Select value={form.meio_cultivo || ""} onValueChange={(v) => setForm({...form, meio_cultivo: v})}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="líquido">Líquido</SelectItem>
                          <SelectItem value="sólido">Sólido</SelectItem>
                          <SelectItem value="ambos">Ambos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <input 
                        type="checkbox" 
                        id="onfarm" 
                        checked={form.producao_on_farm} 
                        onChange={(e) => setForm({...form, producao_on_farm: e.target.checked})}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="onfarm">Produção</Label>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Referência Comercial</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dose padrão (mL/ha)</Label>
                      <Input type="number" value={form.dose_ml_ha} onChange={(e) => setForm({...form, dose_ml_ha: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Fornecedor</Label>
                      <Input
                        value={form.fornecedor || ""}
                        onChange={(e) => setForm({...form, fornecedor: e.target.value})}
                        placeholder="Deixe em branco para remover"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Safra</Label>
                      <Input
                        value={form.safra_referencia || ""}
                        onChange={(e) => setForm({...form, safra_referencia: e.target.value})}
                        placeholder="Deixe em branco para remover"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Valor da dose 100 mL</Label>
                      <MoneyInput
                        value={form.valor_dose_brl}
                        onValueChange={(v) => {
                          const next = recalcPricing("valorDose", v, {
                            doseMlHa: form.dose_ml_ha ? Number(form.dose_ml_ha) : null,
                            valorDose: form.valor_dose_brl,
                            valorLitro: form.valor_litro_brl,
                            valorHa: null,
                          });
                          setForm({ ...form, valor_dose_brl: next.valorDose, valor_litro_brl: next.valorLitro });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor por litro</Label>
                      <MoneyInput
                        value={form.valor_litro_brl}
                        onValueChange={(v) => {
                          const next = recalcPricing("valorLitro", v, {
                            doseMlHa: form.dose_ml_ha ? Number(form.dose_ml_ha) : null,
                            valorDose: form.valor_dose_brl,
                            valorLitro: form.valor_litro_brl,
                            valorHa: null,
                          });
                          setForm({ ...form, valor_dose_brl: next.valorDose, valor_litro_brl: next.valorLitro });
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 italic">
                    1 dose = 100 mL · 1 litro = 10 doses. Editar um valor recalcula o outro.
                  </p>
                </div>


                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Disponibilidade</h3>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="b2b" checked={form.b2b_enabled} onChange={(e) => setForm({...form, b2b_enabled: e.target.checked})} className="h-4 w-4" />
                      <Label htmlFor="b2b">Disponível no portal B2B</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="ativo" checked={form.ativo} onChange={(e) => setForm({...form, ativo: e.target.checked})} className="h-4 w-4" />
                      <Label htmlFor="ativo">Ativo</Label>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    O preço usado no portal B2B é o <strong>Valor/Dose</strong> acima. O desconto é definido no cadastro de cada parceiro.
                  </p>
                </div>


                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})} rows={2} />
                </div>


                <div className="flex justify-between items-center bg-muted/50 p-3 rounded-lg text-xs text-muted-foreground italic">
                  <span>* Valores e doses meramente referenciais. A aplicação exige prescrição agronômica vigente.</span>
                  <Button type="submit" size="sm" disabled={saving}>{saving ? "Salvando…" : "Salvar Alterações"}</Button>
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
              <TableHead>Microrganismo</TableHead>
              <TableHead className="text-right whitespace-nowrap">
                Concentração
                <span className="block text-[10px] font-normal text-muted-foreground normal-case">
                  (UFC/mL)
                </span>
              </TableHead>
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
                  Nenhum microrganismo encontrado
                </TableCell>
              </TableRow>
            ) : tenantVis.displayed.map((m) => (
              <TableRow key={m.id} className="hover:bg-muted/50" onClick={TENANT_CAN_EDIT_GLOBAL_CATALOG ? () => handleEdit(m) : undefined}>
                <TableCell>
                  {m.codigo && (
                    <div className="font-mono text-[10px] text-muted-foreground">{m.codigo}</div>
                  )}
                  <div className="font-medium">{m.nome}</div>
                  {m.nome_cientifico && (
                    <div className="text-xs text-muted-foreground italic">{m.nome_cientifico}</div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-[9px] uppercase h-4 px-1.5">
                      {tipoLabels[m.tipo] || m.tipo}
                    </Badge>
                    {m.funcao_agronomica && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[160px]" title={m.funcao_agronomica}>
                        {m.funcao_agronomica}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="font-mono-data text-xs leading-tight">
                    {formatConcentracaoDisplay(m.concentracao_ufc_ml)}
                  </div>
                </TableCell>
                <TableCell>
                  <VolumesChips
                    volumes={volumesCat?.porMicrorganismoId.get(m.id) ?? []}
                    onAdd={TENANT_CAN_EDIT_GLOBAL_CATALOG ? () => setVolumesEdit(m) : undefined}
                  />
                </TableCell>
                <TableCell className="text-right font-mono-data">
                  {m.dose_ml_ha || "—"}
                </TableCell>
                <TableCell className="text-right font-mono-data text-xs whitespace-nowrap">
                  <span className="text-primary font-semibold">
                    {formatValorHaListagem({
                      doseMlHa: m.dose_ml_ha,
                      valorDose: m.valor_dose_brl,
                      valorLitro: m.valor_litro_brl,
                    })}
                  </span>
                  <span className="text-muted-foreground font-normal"> /ha</span>
                </TableCell>

                <TableCell>
                  <div className="text-xs">
                    <div>{m.fornecedor || "—"}</div>
                    {m.safra_referencia && <div className="text-muted-foreground">{m.safra_referencia}</div>}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end flex-wrap">
                    <TechnicalProfileStatusBadge status={profileStatusMap[m.id] ?? null} />
                    <TenantHiddenBadge state={tenantVis.map?.get(m.id)} />
                    {canManageVis && (
                      <TenantVisibilityToggle entity="microrganismo" item={{ id: m.id, nome: m.nome, ativo: m.ativo }}
                        state={tenantVis.map?.get(m.id)} disabledReason={tenantVis.error ?? (tenantVis.map ? null : "Carregando preferências.")} />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => setVolumesEdit(m)}
                      title="Volumes do catálogo"
                    >
                      <Droplets className="h-3.5 w-3.5 mr-1" />Volumes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => setFichaMicro(m)}
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
                          await generateFichaTecnicaMicrorganismoPdf({ microId: m.id });
                          toast.success("PDF exportado");
                        } catch (e: any) { toast.error(e.message); }
                      }}
                      title="Exportar PDF"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                    {m.observacoes && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{m.observacoes}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {TENANT_CAN_EDIT_GLOBAL_CATALOG && (
                    <DeleteProtocoloButton
                      table="microrganismos"
                      id={m.id}
                      label={m.nome}
                      itemLabel="microrganismo"
                      onDeleted={fetch}
                    />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <MicroorganismTechnicalProfileDialog
        open={!!fichaMicro}
        onOpenChange={(v) => !v && setFichaMicro(null)}
        micro={fichaMicro}
      />

      {volumesEdit && (
        <CatalogoVolumesDialog
          open={!!volumesEdit}
          onOpenChange={(v) => !v && setVolumesEdit(null)}
          itemId={volumesEdit.id}
          itemTipo="microrganismo"
          itemNome={volumesEdit.nome}
          valorLitroBase={volumesEdit.valor_litro_brl ?? (volumesEdit.valor_dose_brl != null ? volumesEdit.valor_dose_brl * 10 : null)}
        />
      )}

      <div className="text-[10px] text-muted-foreground text-center">
        As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica conforme cultura, alvo, ambiente, histórico da área e manejo adotado.
      </div>
    </div>
  );
}
