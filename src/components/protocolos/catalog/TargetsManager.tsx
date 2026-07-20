import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  ParentKind, TARGET_TYPES, TargetRow,
  useTargets, useUpsertTarget, useDeactivateTarget,
} from "@/hooks/useCatalogTargetsCrops";
import { BulkAlvosDialog } from "./BulkAlvosDialog";

interface Props {
  kind: ParentKind;
  parentId: string;
  canEdit: boolean;
}

const empty = { alvo_nome: "", alvo_tipo: "praga", descricao: "", prioridade: 5 };

export function TargetsManager({ kind, parentId, canEdit }: Props) {
  const { data, isLoading } = useTargets(kind, parentId);
  const upsert = useUpsertTarget(kind, parentId);
  const deactivate = useDeactivateTarget(kind, parentId);
  const [editing, setEditing] = useState<Partial<TargetRow> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const ativos = (data ?? []).filter((t) => t.ativo);
  const inativos = (data ?? []).filter((t) => !t.ativo);

  const save = async () => {
    if (!editing?.alvo_nome?.trim()) return toast.error("Informe o nome do alvo");
    try {
      await upsert.mutateAsync({
        id: editing.id,
        alvo_nome: editing.alvo_nome!.trim(),
        alvo_tipo: editing.alvo_tipo!,
        descricao: editing.descricao ?? null,
        prioridade: Number(editing.prioridade ?? 5),
        ativo: true,
      });
      toast.success("Alvo salvo");
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Alvos cadastrados</Label>
        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              <Layers className="h-3.5 w-3.5 mr-1" /> Em lote
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...empty })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar alvo
            </Button>
          </div>
        )}
      </div>

      {canEdit && (
        <BulkAlvosDialog open={bulkOpen} onOpenChange={setBulkOpen} kind={kind} parentId={parentId} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : ativos.length === 0 && !editing ? (
        <p className="text-xs text-muted-foreground">Nenhum alvo cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {ativos.map((t) => (
            <div key={t.id} className="border rounded p-2 text-xs flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{t.alvo_tipo}</Badge>
                  <span className="font-medium">{t.alvo_nome}</span>
                  <span className="text-muted-foreground">· prioridade {t.prioridade}</span>
                </div>
                {t.descricao && <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{t.descricao}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => deactivate.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="border rounded p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Nome do alvo</Label>
              <Input value={editing.alvo_nome ?? ""} onChange={(e) => setEditing({ ...editing, alvo_nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Tipo</Label>
              <Select value={editing.alvo_tipo ?? "praga"} onValueChange={(v) => setEditing({ ...editing, alvo_tipo: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Prioridade (1-10)</Label>
              <Input type="number" min={1} max={10} value={editing.prioridade ?? 5} onChange={(e) => setEditing({ ...editing, prioridade: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Descrição</Label>
            <Textarea rows={2} value={editing.descricao ?? ""} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={upsert.isPending}>Salvar</Button>
          </div>
        </div>
      )}

      {inativos.length > 0 && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Alvos removidos ({inativos.length})</summary>
          <div className="mt-1 space-y-0.5">
            {inativos.map((t) => <div key={t.id} className="line-through">{t.alvo_tipo} · {t.alvo_nome}</div>)}
          </div>
        </details>
      )}
    </div>
  );
}
