import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useOwnedCatalogCapability, useOwnedCatalogMutation } from "@/hooks/useOwnedCatalogMutations";
import { OwnedCatalogError, ownedCatalogError, type OwnedOperation } from "@/lib/catalogo/tenantCatalogOwnership";
import type { TenantCatalogEntity } from "@/lib/catalogo/tenantCatalogVisibility";

type EditableItem = {
  id: string;
  nome: string;
  tipo?: string | null;
  descricao?: string | null;
  nome_cientifico?: string | null;
  familia_catalogo?: string | null;
  classe_catalogo?: string | null;
  modo_acao?: string | null;
  funcao_completa?: string | null;
  modo_aplicacao?: string | null;
  updated_at?: string | null;
};

export type CompositionDeclaration = {
  ordem: number;
  tipo_componente: "microrganismo" | "ingrediente_ativo" | "nutriente" | "outro";
  microrganismo_id: string | null;
  componente_nome: string | null;
  quantidade: string;
  unidade: "mL/L" | "g/L" | "g/kg" | "%m/m" | "%m/v" | "%v/v" | "UFC/mL" | "UFC/g";
  base: "por_volume_produto" | "por_massa_produto";
  natureza: "teor_garantido" | "concentracao_declarada";
};

const PRODUCT_TYPES = ["inseticida", "fungicida", "solo", "inoculante", "solubilizador"];
const MICRO_TYPES = ["bacteria", "fungo", "levedura", "consorcio"];
const FAMILY_CLASSES: Record<string, string[]> = {
  biologico: ["biofungicida", "bioinseticida", "inoculante", "solubilizador"],
  quimico: ["fungicida", "inseticida", "herbicida"],
  fertilizante_adubo: [],
};

function blankDeclaration(order: number): CompositionDeclaration {
  return { ordem: order, tipo_componente: "ingrediente_ativo", microrganismo_id: null, componente_nome: "", quantidade: "", unidade: "g/L", base: "por_volume_produto", natureza: "concentracao_declarada" };
}

export function OwnedCatalogItemDialog({ open, onOpenChange, entity, item, microorganisms, onApplied, onLocateGlobal }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: TenantCatalogEntity;
  item?: EditableItem | null;
  microorganisms?: Array<{ id: string; nome: string; owner_organization_id?: string | null; ativo?: boolean }>;
  onApplied: () => Promise<void> | void;
  onLocateGlobal?: (id: string) => void;
}) {
  const capability = useOwnedCatalogCapability();
  const mutation = useOwnedCatalogMutation(entity, onApplied);
  const frozenScope = useRef("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [family, setFamily] = useState("");
  const [catalogClass, setCatalogClass] = useState("");
  const [modeOfAction, setModeOfAction] = useState("");
  const [fullFunction, setFullFunction] = useState("");
  const [applicationMode, setApplicationMode] = useState("");
  const [reason, setReason] = useState("");
  const [compositionStatus, setCompositionStatus] = useState<"rascunho" | "completo">("rascunho");
  const [declarations, setDeclarations] = useState<CompositionDeclaration[]>([]);

  useEffect(() => {
    if (!open) return;
    frozenScope.current = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : "";
    setName(item?.nome ?? ""); setType(item?.tipo ?? (entity === "produto" ? "solo" : entity === "microrganismo" ? "bacteria" : ""));
    setDescription(item?.descricao ?? ""); setScientificName(item?.nome_cientifico ?? "");
    setFamily(item?.familia_catalogo ?? ""); setCatalogClass(item?.classe_catalogo ?? "");
    setModeOfAction(item?.modo_acao ?? ""); setFullFunction(item?.funcao_completa ?? ""); setApplicationMode(item?.modo_aplicacao ?? "");
    setReason(""); setCompositionStatus("rascunho"); setDeclarations([]);
  }, [open, item, entity, capability.scope]);

  const classes = useMemo(() => FAMILY_CLASSES[family] ?? [], [family]);
  const submit = async () => {
    const operation: OwnedOperation = item ? "update" : "create";
    const payload: Record<string, unknown> = { nome: name.trim(), descricao: description.trim() || null };
    if (!item && entity !== "cultura") payload.tipo = type;
    if (entity === "microrganismo") payload.nome_cientifico = scientificName.trim() || null;
    if (entity === "produto") Object.assign(payload, {
      familia_catalogo: family || null, classe_catalogo: catalogClass || null,
      modo_acao: modeOfAction.trim() || null, funcao_completa: fullFunction.trim() || null,
      modo_aplicacao: applicationMode.trim() || null,
    });
    const idempotencyKey = crypto.randomUUID();
    try {
      const saved = await mutation.mutateAsync({
        entity, operation, entityId: item?.id ?? null, expectedUpdatedAt: item?.updated_at ?? null,
        payload, reason, idempotencyKey, scopeKey: frozenScope.current,
      });
      if (entity === "produto" && declarations.length > 0) {
        await mutation.mutateAsync({
          entity, operation: "composition", entityId: saved.id, expectedUpdatedAt: saved.updated_at,
          payload: { status: compositionStatus, itens: declarations.map((d, index) => ({
            ...d, ordem: index + 1, componente_nome: d.tipo_componente === "microrganismo" ? null : d.componente_nome?.trim(),
            microrganismo_id: d.tipo_componente === "microrganismo" ? d.microrganismo_id : null,
            quantidade: d.quantidade === "" ? null : Number(d.quantidade), unidade: d.quantidade === "" ? null : d.unidade,
            base: d.quantidade === "" ? null : d.base,
          })) },
          reason, idempotencyKey: crypto.randomUUID(), scopeKey: frozenScope.current,
        });
      }
      toast.success(item ? "Item próprio atualizado." : "Item próprio criado.");
      onOpenChange(false);
    } catch (raw) {
      const error = raw instanceof OwnedCatalogError ? raw : ownedCatalogError(raw, entity);
      if (error.code === "duplicate_global_active" && error.globalId && onLocateGlobal) {
        toast.error(error.message, { action: { label: "Localizar", onClick: () => onLocateGlobal(error.globalId as string) } });
      } else toast.error(error.message);
    }
  };

  return <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{item ? "Editar" : "Criar"} {entity === "produto" ? "produto próprio" : entity === "microrganismo" ? "microrganismo próprio" : "cultura própria"}</DialogTitle></DialogHeader>
      <Tabs defaultValue="identificacao">
        <TabsList className={entity === "produto" ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>
          <TabsTrigger value="identificacao">Identificação</TabsTrigger>
          {entity === "produto" && <TabsTrigger value="composicao">Composição declarativa</TabsTrigger>}
        </TabsList>
        <TabsContent value="identificacao" className="space-y-4 pt-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={500} /></div>
          {entity !== "cultura" && <div className="space-y-2"><Label>Tipo</Label><Select value={type} onValueChange={setType} disabled={!!item}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(entity === "produto" ? PRODUCT_TYPES : MICRO_TYPES).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>}
          {entity === "microrganismo" && <div className="space-y-2"><Label>Nome científico</Label><Input value={scientificName} onChange={(e) => setScientificName(e.target.value)} /></div>}
          {entity === "produto" && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Família</Label><Select value={family || "pendente"} onValueChange={(v) => { setFamily(v === "pendente" ? "" : v); setCatalogClass(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="biologico">Biológico</SelectItem><SelectItem value="quimico">Químico</SelectItem><SelectItem value="fertilizante_adubo">Fertilizante/Adubo</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Classe</Label><Select value={catalogClass || "pendente"} onValueChange={(v) => setCatalogClass(v === "pendente" ? "" : v)} disabled={!family || classes.length === 0}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem>{classes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Modo de ação</Label><Input value={modeOfAction} onChange={(e) => setModeOfAction(e.target.value)} /></div>
            <div className="space-y-2"><Label>Função agronômica</Label><Textarea value={fullFunction} onChange={(e) => setFullFunction(e.target.value)} /></div>
            <div className="space-y-2"><Label>Modo de aplicação</Label><Input value={applicationMode} onChange={(e) => setApplicationMode(e.target.value)} /></div>
          </>}
          <div className="space-y-2"><Label>Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </TabsContent>
        {entity === "produto" && <TabsContent value="composicao" className="space-y-4 pt-4">
          <div className="space-y-2"><Label>Situação</Label><Select value={compositionStatus} onValueChange={(v) => setCompositionStatus(v as "rascunho" | "completo")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rascunho">Rascunho</SelectItem><SelectItem value="completo">Completo</SelectItem></SelectContent></Select></div>
          {declarations.map((declaration, index) => <div key={index} className="grid gap-3 border p-3 sm:grid-cols-2">
            <div className="space-y-2"><Label>Componente</Label><Select value={declaration.tipo_componente} onValueChange={(value) => setDeclarations((rows) => rows.map((row, i) => i === index ? { ...row, tipo_componente: value as CompositionDeclaration["tipo_componente"] } : row))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="microrganismo">Microrganismo</SelectItem><SelectItem value="ingrediente_ativo">Ingrediente ativo</SelectItem><SelectItem value="nutriente">Nutriente</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select></div>
            {declaration.tipo_componente === "microrganismo" ? <div className="space-y-2"><Label>Microrganismo permitido</Label><Select value={declaration.microrganismo_id ?? ""} onValueChange={(value) => setDeclarations((rows) => rows.map((row, i) => i === index ? { ...row, microrganismo_id: value } : row))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(microorganisms ?? []).filter((m) => m.ativo !== false).map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label>Nome declarado</Label><Input value={declaration.componente_nome ?? ""} onChange={(e) => setDeclarations((rows) => rows.map((row, i) => i === index ? { ...row, componente_nome: e.target.value } : row))} /></div>}
            <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min="0" step="any" value={declaration.quantidade} onChange={(e) => setDeclarations((rows) => rows.map((row, i) => i === index ? { ...row, quantidade: e.target.value } : row))} /></div>
            <div className="space-y-2"><Label>Unidade</Label><Select value={declaration.unidade} onValueChange={(value) => setDeclarations((rows) => rows.map((row, i) => i === index ? { ...row, unidade: value as CompositionDeclaration["unidade"] } : row))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["mL/L","g/L","g/kg","%m/m","%m/v","%v/v","UFC/mL","UFC/g"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeclarations((rows) => rows.filter((_, i) => i !== index).map((row, i) => ({ ...row, ordem: i + 1 })))}><Trash2 className="mr-2 h-4 w-4" />Remover</Button>
          </div>)}
          <Button type="button" variant="outline" onClick={() => setDeclarations((rows) => [...rows, blankDeclaration(rows.length + 1)])}><Plus className="mr-2 h-4 w-4" />Adicionar declaração</Button>
          <p className="text-xs text-muted-foreground">Declarações não alteram a receita de produção existente.</p>
        </TabsContent>}
      </Tabs>
      <div className="space-y-2"><Label>Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={500} /></div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={mutation.isPending || name.trim().length === 0 || reason.trim().length < 10}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}