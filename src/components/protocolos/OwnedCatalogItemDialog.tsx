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
import { useOwnedCatalogRead } from "@/hooks/useOwnedCatalogRead";
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
  const currentScope = capability.scope ? `${capability.scope.organizationId}|${capability.scope.userId}` : "";
  const scopeRef = useRef(currentScope); scopeRef.current = currentScope;
  const lock = useRef(false);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const detail = useOwnedCatalogRead(entity, { id: item?.id, enabled: open && !!item });
  const loadedItem = item ? detail.data?.items[0] : null;
  const openedVersion = useRef<string | null>(null);
  const initialPayload = useRef("");
  const initialComposition = useRef("");
  const rootReceipt = useRef<{ fingerprint: string; id: string; updated_at: string } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
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
    generation.current += 1; lock.current = false; setBusy(false); setFormError(null);
    frozenScope.current = currentScope; openedVersion.current = null; rootReceipt.current = null; attempt.current = null;
    return () => { generation.current += 1; };
    // Freeze only on opening/item change, never adopt a new actor while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, entity]);
  useEffect(() => {
    if (open && frozenScope.current !== currentScope) onOpenChange(false);
  }, [currentScope, open, onOpenChange]);
  useEffect(() => {
    if (!open || (item && !loadedItem)) return;
    const row = loadedItem;
    openedVersion.current = row?.updated_at ?? null;
    setName(row?.nome ?? ""); setType(row?.tipo ?? (entity === "produto" ? "solo" : entity === "microrganismo" ? "bacteria" : ""));
    setDescription(row?.descricao ?? ""); setScientificName(row?.nome_cientifico ?? "");
    setFamily(row?.familia_catalogo ?? ""); setCatalogClass(row?.classe_catalogo ?? "");
    setModeOfAction(row?.modo_acao ?? ""); setFullFunction(row?.funcao_completa ?? ""); setApplicationMode(row?.modo_aplicacao ?? "");
    setReason(""); setCompositionStatus(row?.composition_status ?? "rascunho");
    const declarations = (row?.declarations ?? []).map((d) => ({
      ordem: Number(d.ordem), tipo_componente: d.tipo_componente as CompositionDeclaration["tipo_componente"],
      microrganismo_id: d.microrganismo_id as string | null, componente_nome: d.componente_nome as string | null,
      quantidade: d.quantidade == null ? "" : String(d.quantidade),
      unidade: (d.unidade ?? "g/L") as CompositionDeclaration["unidade"],
      base: (d.base ?? "por_volume_produto") as CompositionDeclaration["base"],
      natureza: d.natureza as CompositionDeclaration["natureza"],
    }));
    setDeclarations(declarations);
    initialComposition.current = JSON.stringify([row?.composition_status ?? "rascunho", declarations]);
    const payload: Record<string, unknown> = { nome: row?.nome ?? "", descricao: row?.descricao ?? null };
    if (entity === "microrganismo") payload.nome_cientifico = row?.nome_cientifico ?? null;
    if (entity === "produto") Object.assign(payload, { familia_catalogo: row?.familia_catalogo ?? null,
      classe_catalogo: row?.classe_catalogo ?? null, modo_acao: row?.modo_acao ?? null,
      funcao_completa: row?.funcao_completa ?? null, modo_aplicacao: row?.modo_aplicacao ?? null });
    initialPayload.current = JSON.stringify(payload);
    // Ignore refetch while editing: the opened version is the CAS version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, loadedItem?.id]);

  const classes = useMemo(() => FAMILY_CLASSES[family] ?? [], [family]);
  const submit = async () => {
    if (lock.current || (item && !loadedItem) || frozenScope.current !== scopeRef.current) return;
    const myGeneration = generation.current;
    lock.current = true; setBusy(true); setFormError(null);
    const operation: OwnedOperation = item ? "update" : "create";
    const payload: Record<string, unknown> = { nome: name.trim(), descricao: description.trim() || null };
    if (!item && entity !== "cultura") payload.tipo = type;
    if (entity === "microrganismo") payload.nome_cientifico = scientificName.trim() || null;
    if (entity === "produto") Object.assign(payload, {
      familia_catalogo: family || null, classe_catalogo: catalogClass || null,
      modo_acao: modeOfAction.trim() || null, funcao_completa: fullFunction.trim() || null,
      modo_aplicacao: applicationMode.trim() || null,
    });
    const fingerprint = JSON.stringify([payload, reason.trim()]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    const idempotencyKey = attempt.current.key;
    try {
      const rootChanged = !item || JSON.stringify(payload) !== initialPayload.current;
      const saved = rootReceipt.current?.fingerprint === fingerprint ? rootReceipt.current
        : rootChanged ? await mutation.mutateAsync({
        entity, operation, entityId: item?.id ?? null, expectedUpdatedAt: openedVersion.current,
        payload, reason, idempotencyKey, scopeKey: frozenScope.current,
      }) : { id: loadedItem?.id ?? "", updated_at: openedVersion.current ?? "" };
      rootReceipt.current = { fingerprint, id: saved.id, updated_at: saved.updated_at };
      if (myGeneration !== generation.current || frozenScope.current !== scopeRef.current) return;
      if (entity === "produto" && JSON.stringify([compositionStatus, declarations]) !== initialComposition.current) {
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
      if (myGeneration !== generation.current || frozenScope.current !== scopeRef.current) return;
      toast.success(item ? "Item próprio atualizado." : "Item próprio criado.");
      onOpenChange(false);
    } catch (raw) {
      if (myGeneration !== generation.current || frozenScope.current !== scopeRef.current) return;
      const error = raw instanceof OwnedCatalogError ? raw : ownedCatalogError(raw, entity);
      if (error.code === "duplicate_global_active" && error.globalId && onLocateGlobal) {
        toast.error(error.message, { action: { label: "Localizar", onClick: () => onLocateGlobal(error.globalId as string) } });
      } else toast.error(error.message);
      setFormError(error.message);
    } finally { if (myGeneration === generation.current) { lock.current = false; setBusy(false); } }

  };

  return <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
    <DialogContent aria-describedby={undefined} className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{item ? "Editar" : "Criar"} {entity === "produto" ? "produto próprio" : entity === "microrganismo" ? "microrganismo próprio" : "cultura própria"}</DialogTitle></DialogHeader>
      {item && detail.isLoading && <p role="status">Carregando item próprio...</p>}
      {item && detail.isError && <p role="alert" className="text-destructive">{(detail.error as Error).message}</p>}
      {formError && <p role="alert" className="text-destructive">{formError}</p>}
      <fieldset disabled={busy || (!!item && !loadedItem)}>
      <Tabs defaultValue="identificacao">
        <TabsList className={entity === "produto" ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>
          <TabsTrigger value="identificacao">Identificação</TabsTrigger>
          {entity === "produto" && <TabsTrigger value="composicao">Composição declarativa</TabsTrigger>}
        </TabsList>
        <TabsContent value="identificacao" className="space-y-4 pt-4">
          <div className="space-y-2"><Label htmlFor="owned-name">Nome</Label><Input id="owned-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={500} /></div>
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
          <div className="space-y-2"><Label htmlFor="owned-description">Descrição</Label><Textarea id="owned-description" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
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
      <div className="space-y-2"><Label htmlFor="owned-reason">Motivo</Label><Textarea id="owned-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={500} /></div>
      </fieldset>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={busy || (!!item && !loadedItem) || !capability.canManage || name.trim().length === 0 || reason.trim().length < 10}>{busy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}