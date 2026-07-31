import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ParentKind, CropRow,
  useCrops, useUpsertCrop, useDeactivateCrop, useCulturasOptions,
} from "@/hooks/useCatalogTargetsCrops";

interface Props {
  kind: ParentKind;
  parentId: string;
  canEdit: boolean;
}

export function CropsManager({ kind, parentId, canEdit }: Props) {
  const { data, isLoading } = useCrops(kind, parentId);
  const { data: culturas } = useCulturasOptions();
  const upsert = useUpsertCrop(kind, parentId);
  const deactivate = useDeactivateCrop(kind, parentId);
  const [editing, setEditing] = useState<Partial<CropRow> | null>(null);

  const ativos = (data ?? []).filter((c) => c.ativo);
  const inativos = (data ?? []).filter((c) => !c.ativo);
  const culturaNome = (id: string | null | undefined) =>
    id ? culturas?.find((c) => c.id === id)?.nome ?? null : null;

  const save = async () => {
    if (!editing) return;
    if (!editing.cultura_id && !editing.cultura_nome?.trim()) {
      return toast.error("Informe a cultura (ID ou nome)");
    }
    try {
      const payload: Partial<CropRow> = {
        id: editing.id,
        cultura_id: editing.cultura_id || null,
        cultura_nome: editing.cultura_nome?.trim() || null,
        fase_recomendada: editing.fase_recomendada ?? null,
        objetivo_uso: editing.objetivo_uso ?? null,
        observacao: editing.observacao ?? null,
        ativo: true,
      };
      if (kind === "produto") (payload as any).dose_recomendada = editing.dose_recomendada ?? null;
      await upsert.mutateAsync(payload);
      toast.success("Cultura salva");
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Culturas recomendadas</Label>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing({})}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar cultura
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : ativos.length === 0 && !editing ? (
        <p className="text-xs text-muted-foreground">Nenhuma cultura cadastrada.</p>
      ) : (
        <div className="space-y-2">
          {ativos.map((c) => (
            <div key={c.id} className="border rounded p-2 text-xs flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{culturaNome(c.cultura_id) || c.cultura_nome || "—"}</div>
                {c.fase_recomendada && <div className="text-muted-foreground">Fase: {c.fase_recomendada}</div>}
                {c.objetivo_uso && <div>{c.objetivo_uso}</div>}
                {kind === "produto" && c.dose_recomendada && <div>Dose: {c.dose_recomendada}</div>}
                {c.observacao && <div className="text-muted-foreground italic">{c.observacao}</div>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => deactivate.mutate(c.id)}>
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
              <Label className="text-[10px]">Cultura cadastrada</Label>
              <Select value={editing.cultura_id ?? "_none"} onValueChange={(v) => setEditing({ ...editing, cultura_id: v === "_none" ? null : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— (texto livre)</SelectItem>
                  {culturas?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Cultura (texto livre)</Label>
              <Input value={editing.cultura_nome ?? ""} onChange={(e) => setEditing({ ...editing, cultura_nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Fase recomendada</Label>
              <Input value={editing.fase_recomendada ?? ""} onChange={(e) => setEditing({ ...editing, fase_recomendada: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]" htmlFor="objetivo-agronomico">Objetivo agronômico</Label>
              <Input
                id="objetivo-agronomico"
                aria-label="Objetivo agronômico da recomendação"
                placeholder="Ex.: controle preventivo, reequilíbrio biológico"
                value={editing.objetivo_uso ?? ""}
                onChange={(e) => setEditing({ ...editing, objetivo_uso: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">
                Objetivo da recomendação técnica. Não confundir com o objetivo da visita técnica.
              </p>
            </div>
            {kind === "produto" && (
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px]">Dose recomendada</Label>
                <Input value={editing.dose_recomendada ?? ""} onChange={(e) => setEditing({ ...editing, dose_recomendada: e.target.value })} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Observação</Label>
            <Textarea rows={2} value={editing.observacao ?? ""} onChange={(e) => setEditing({ ...editing, observacao: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={upsert.isPending}>Salvar</Button>
          </div>
        </div>
      )}

      {inativos.length > 0 && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Culturas removidas ({inativos.length})</summary>
          <div className="mt-1 space-y-0.5">
            {inativos.map((c) => <div key={c.id} className="line-through">{culturaNome(c.cultura_id) || c.cultura_nome}</div>)}
          </div>
        </details>
      )}
    </div>
  );
}
