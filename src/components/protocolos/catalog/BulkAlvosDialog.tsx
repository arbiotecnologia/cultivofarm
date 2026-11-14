import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, ClipboardList, BookMarked } from "lucide-react";
import { toast } from "sonner";
import { ParentKind, TARGET_TYPES, useTargets } from "@/hooks/useCatalogTargetsCrops";
import {
  AlvoInput, AlvoSugerido,
  parseAlvosTexto, useBulkInserirAlvos, useCatalogoAlvos, useSugerirAlvosIA,
} from "@/hooks/useCatalogoAlvos";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: ParentKind;
  parentId: string;
}

export function BulkAlvosDialog({ open, onOpenChange, kind, parentId }: Props) {
  const [tab, setTab] = useState("colar");
  const bulk = useBulkInserirAlvos(kind, parentId);
  const { data: existentes } = useTargets(kind, parentId);
  const { data: catalogo } = useCatalogoAlvos();
  const sugerir = useSugerirAlvosIA();

  // -------- Colar lista --------
  const [texto, setTexto] = useState("");
  const [tipoPadrao, setTipoPadrao] = useState("praga");
  const [prioPadrao, setPrioPadrao] = useState(5);

  const parsed = useMemo(
    () => parseAlvosTexto(texto, tipoPadrao, prioPadrao),
    [texto, tipoPadrao, prioPadrao],
  );

  const fichaNomes = useMemo(
    () => new Set((existentes ?? []).filter((t) => t.ativo).map((t) => `${t.alvo_tipo}::${t.alvo_nome.trim().toLowerCase()}`)),
    [existentes],
  );
  const catalogoNomes = useMemo(
    () => new Set((catalogo ?? []).map((c) => `${c.tipo}::${c.nome_normalizado}`)),
    [catalogo],
  );

  const status = (a: AlvoInput) => {
    const key = `${a.tipo}::${a.nome.trim().toLowerCase()}`;
    if (fichaNomes.has(key)) return "duplicado";
    if (catalogoNomes.has(key)) return "existente";
    return "novo";
  };

  // -------- Catálogo --------
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [selecionadosCat, setSelecionadosCat] = useState<Record<string, boolean>>({});

  const catalogoFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (catalogo ?? []).filter((c) => {
      if (filtroTipo !== "todos" && c.tipo !== filtroTipo) return false;
      if (q && !c.nome.toLowerCase().includes(q) && !(c.nome_cientifico ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogo, busca, filtroTipo]);

  // -------- IA --------
  const [iaSugestoes, setIaSugestoes] = useState<AlvoSugerido[]>([]);
  const [iaSel, setIaSel] = useState<Record<number, boolean>>({});

  const rodarIA = async () => {
    try {
      const entidade_tipo = kind === "produto" ? "produto" : "microrganismo";
      const alvos = await sugerir.mutateAsync({ entidade_tipo, entidade_id: parentId });
      setIaSugestoes(alvos);
      const sel: Record<number, boolean> = {};
      alvos.forEach((_, i) => (sel[i] = true));
      setIaSel(sel);
      if (!alvos.length) toast.info("IA não sugeriu alvos");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao consultar IA");
    }
  };

  const reset = () => {
    setTexto(""); setSelecionadosCat({}); setIaSugestoes([]); setIaSel({});
  };

  const submit = async (alvos: AlvoInput[], label: string) => {
    if (!alvos.length) return toast.error("Nenhum alvo selecionado");
    try {
      const r = await bulk.mutateAsync(alvos);
      toast.success(`${label}: ${r.vinculados} vinculado(s), ${r.criados_no_catalogo} criado(s) no catálogo, ${r.ignorados} ignorado(s)`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao inserir alvos");
    }
  };

  const enviarColar = () => submit(parsed.filter((a) => status(a) !== "duplicado"), "Lista importada");

  const enviarCatalogo = () => {
    const escolhidos = (catalogo ?? [])
      .filter((c) => selecionadosCat[c.id])
      .map<AlvoInput>((c) => ({ nome: c.nome, tipo: c.tipo, prioridade: prioPadrao, descricao: c.descricao }));
    submit(escolhidos, "Selecionados");
  };

  const enviarIA = () => {
    const escolhidos = iaSugestoes
      .filter((_, i) => iaSel[i])
      .map<AlvoInput>((s) => ({ nome: s.nome, tipo: s.tipo, prioridade: s.prioridade ?? 5, descricao: s.justificativa }));
    submit(escolhidos, "IA");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Adicionar alvos em lote</DialogTitle>
          <DialogDescription>
            Cole uma lista, escolha do catálogo global ou peça sugestões à IA.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-w-0 w-full">
          <TabsList className="flex h-auto w-full gap-1 [&>button]:min-h-10">
            <TabsTrigger value="colar"><ClipboardList className="h-3.5 w-3.5 mr-1" /> Colar lista</TabsTrigger>
            <TabsTrigger value="catalogo"><BookMarked className="h-3.5 w-3.5 mr-1" /> Catálogo</TabsTrigger>
            <TabsTrigger value="ia"><Sparkles className="h-3.5 w-3.5 mr-1" /> Sugerir com IA</TabsTrigger>
          </TabsList>

          {/* COLAR */}
          <TabsContent value="colar" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tipo padrão</Label>
                <Select value={tipoPadrao} onValueChange={setTipoPadrao}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TARGET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prioridade padrão</Label>
                <Input type="number" min={1} max={10} value={prioPadrao} onChange={(e) => setPrioPadrao(Number(e.target.value) || 5)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lista de alvos (um por linha)</Label>
              <Textarea
                rows={8}
                placeholder={`Spodoptera frugiperda\nFusarium oxysporum; doenca\nMeloidogyne incognita; nematoide; 2`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Formato: <code>nome</code> ou <code>nome; tipo</code> ou <code>nome; tipo; prioridade</code></p>
            </div>
            {parsed.length > 0 && (
              <div className="border rounded max-h-48 overflow-auto text-xs">
                {parsed.map((a, i) => {
                  const s = status(a);
                  return (
                    <div key={i} className="flex items-center justify-between px-2 py-1 border-b last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="text-[10px]">{a.tipo}</Badge>
                        <span className="truncate">{a.nome}</span>
                        <span className="text-muted-foreground">· P{a.prioridade}</span>
                      </div>
                      {s === "duplicado" && <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">já na ficha</Badge>}
                      {s === "existente" && <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px]">no catálogo</Badge>}
                      {s === "novo" && <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px]">novo</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={enviarColar} disabled={bulk.isPending || !parsed.length}>
                {bulk.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Importar {parsed.filter((a) => status(a) !== "duplicado").length} alvo(s)
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* CATÁLOGO */}
          <TabsContent value="catalogo" className="space-y-3 pt-3">
            <div className="grid grid-cols-[1fr,180px,120px] gap-2">
              <Input placeholder="Buscar no catálogo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {TARGET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min={1} max={10} value={prioPadrao} onChange={(e) => setPrioPadrao(Number(e.target.value) || 5)} title="Prioridade aplicada" />
            </div>
            <div className="border rounded max-h-72 overflow-auto text-xs">
              {catalogoFiltrado.length === 0 ? (
                <p className="p-3 text-muted-foreground">Nenhum alvo no catálogo com esses filtros.</p>
              ) : catalogoFiltrado.map((c) => {
                const key = `${c.tipo}::${c.nome_normalizado}`;
                const naFicha = fichaNomes.has(key);
                return (
                  <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 border-b last:border-0 cursor-pointer hover:bg-muted/40 ${naFicha ? "opacity-50" : ""}`}>
                    <Checkbox
                      checked={!!selecionadosCat[c.id]}
                      disabled={naFicha}
                      onCheckedChange={(v) => setSelecionadosCat((s) => ({ ...s, [c.id]: !!v }))}
                    />
                    <Badge variant="secondary" className="text-[10px]">{c.tipo}</Badge>
                    <span className="flex-1 truncate">{c.nome}{c.nome_cientifico ? <em className="text-muted-foreground"> · {c.nome_cientifico}</em> : null}</span>
                    {naFicha && <span className="text-[10px] text-amber-600">já vinculado</span>}
                  </label>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={enviarCatalogo} disabled={bulk.isPending || !Object.values(selecionadosCat).some(Boolean)}>
                {bulk.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Vincular {Object.values(selecionadosCat).filter(Boolean).length} alvo(s)
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* IA */}
          <TabsContent value="ia" className="space-y-3 pt-3">
            <div className="rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
              Sugestões geradas por IA com base na composição cadastrada. Revise antes de vincular. Não substitui prescrição agronômica.
            </div>
            {iaSugestoes.length === 0 ? (
              <div className="text-center py-6">
                <Button onClick={rodarIA} disabled={sugerir.isPending}>
                  {sugerir.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Gerar sugestões
                </Button>
              </div>
            ) : (
              <>
                <div className="border rounded max-h-72 overflow-auto text-xs">
                  {iaSugestoes.map((s, i) => {
                    const key = `${s.tipo}::${s.nome.trim().toLowerCase()}`;
                    const naFicha = fichaNomes.has(key);
                    return (
                      <label key={i} className={`flex items-start gap-2 px-2 py-1.5 border-b last:border-0 cursor-pointer hover:bg-muted/40 ${naFicha ? "opacity-50" : ""}`}>
                        <Checkbox
                          checked={!!iaSel[i] && !naFicha}
                          disabled={naFicha}
                          onCheckedChange={(v) => setIaSel((m) => ({ ...m, [i]: !!v }))}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">{s.tipo}</Badge>
                            <span className="font-medium">{s.nome}</span>
                            <span className="text-muted-foreground">· P{s.prioridade ?? 5}</span>
                            {naFicha && <span className="text-[10px] text-amber-600 ml-auto">já vinculado</span>}
                          </div>
                          {s.justificativa && <p className="text-muted-foreground mt-0.5">{s.justificativa}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" size="sm" onClick={rodarIA} disabled={sugerir.isPending}>
                    {sugerir.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Gerar novamente
                  </Button>
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={enviarIA} disabled={bulk.isPending || !Object.values(iaSel).some(Boolean)}>
                {bulk.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Vincular selecionados
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
