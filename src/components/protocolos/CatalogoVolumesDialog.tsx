import { TENANT_CAN_EDIT_GLOBAL_CATALOG, GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";
import { fmtL } from "@/lib/envaseFormat";
import { formatPrecoLitro, formatDose100ml, dosesPorVolume, type CatalogoVolume } from "@/hooks/useCatalogoVolumes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string;
  itemTipo: "produto" | "microrganismo";
  itemNome: string;
  /** Valor por litro cadastrado na ficha técnica (R$). Usado para auto-preencher o preço de cada volume. */
  valorLitroBase?: number | null;
}

const SUGESTOES = [100, 250, 500, 1000, 5000, 20000];

const calcPrecoFromLitro = (volumeMl: number, valorLitro: number) =>
  Number(((volumeMl / 1000) * valorLitro).toFixed(2));

export function CatalogoVolumesDialog({ open, onOpenChange, itemId, itemTipo, itemNome, valorLitroBase }: Props) {
  const qc = useQueryClient();
  const baseLitro = valorLitroBase && valorLitroBase > 0 ? Number(valorLitroBase) : 0;
  const [novo, setNovo] = useState({ volume_ml: "", rotulo: "", preco_brl: "", ordem: "0" });
  const [precoTocado, setPrecoTocado] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["catalogo-volumes-item", itemTipo, itemId],
    enabled: open && !!itemId,
    queryFn: async () => {
      const col = itemTipo === "produto" ? "produto_id" : "microrganismo_id";
      const { data, error } = await supabase
        .from("catalogo_volumes" as any)
        .select("*")
        .eq(col, itemId)
        .order("ordem", { ascending: true })
        .order("volume_ml", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        volume_ml: Number(r.volume_ml),
        preco_brl: Number(r.preco_brl),
        ordem: Number(r.ordem ?? 0),
      })) as CatalogoVolume[];
    },
  });

  useEffect(() => {
    if (!open) {
      setNovo({ volume_ml: "", rotulo: "", preco_brl: "", ordem: "0" });
      setPrecoTocado(false);
    }
  }, [open]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["catalogo-volumes-item", itemTipo, itemId] });
    qc.invalidateQueries({ queryKey: ["catalogo-volumes"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      assertGlobalCatalogWriteBlocked();
      const vol = Number(novo.volume_ml);
      const preco = Number(novo.preco_brl);
      if (!vol || vol <= 0) throw new Error("Volume inválido");
      if (preco < 0) throw new Error("Preço inválido");
      const payload: any = {
        item_tipo: itemTipo,
        produto_id: itemTipo === "produto" ? itemId : null,
        microrganismo_id: itemTipo === "microrganismo" ? itemId : null,
        volume_ml: vol,
        rotulo: novo.rotulo.trim() || null,
        preco_brl: preco,
        ordem: Number(novo.ordem) || 0,
      };
      const { error } = await supabase.from("catalogo_volumes" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Volume adicionado");
      setNovo({ volume_ml: "", rotulo: "", preco_brl: "", ordem: "0" });
      setPrecoTocado(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (v: CatalogoVolume) => {
      assertGlobalCatalogWriteBlocked();
      const { error } = await supabase
        .from("catalogo_volumes" as any)
        .update({
          volume_ml: v.volume_ml,
          rotulo: v.rotulo,
          preco_brl: v.preco_brl,
          ordem: v.ordem,
          ativo: v.ativo,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertGlobalCatalogWriteBlocked();
      const { error } = await supabase.from("catalogo_volumes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const aplicarSugestao = (ml: number) => {
    setNovo((n) => ({
      ...n,
      volume_ml: String(ml),
      rotulo: fmtL(ml),
      preco_brl: baseLitro > 0 && !precoTocado ? String(calcPrecoFromLitro(ml, baseLitro)) : n.preco_brl,
    }));
  };

  const onVolumeChange = (v: string) => {
    const ml = Number(v);
    setNovo((n) => ({
      ...n,
      volume_ml: v,
      preco_brl: baseLitro > 0 && !precoTocado && ml > 0 ? String(calcPrecoFromLitro(ml, baseLitro)) : n.preco_brl,
    }));
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Volumes do catálogo</DialogTitle>
          <DialogDescription>
            {TENANT_CAN_EDIT_GLOBAL_CATALOG
              ? <>{itemNome} · cadastre os volumes comerciais com preço — usados para o cliente comparar R$/L. Não confunda com envase (formato de entrega).</>
              : <>{itemNome} · modo consulta: volumes comerciais do catálogo global, usados para comparar R$/L. Não confunda com envase (formato de entrega).</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <div className="border rounded-md w-full">
            <Table className="text-xs [&_th]:px-1.5 [&_td]:px-1.5 [&_th]:h-8 [&_td]:py-1.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Vol (mL)</TableHead>
                  <TableHead className="text-[10px]">Rótulo</TableHead>
                  <TableHead className="text-[10px] text-right">Preço</TableHead>
                  <TableHead className="text-[10px] text-right">R$/L · /100mL</TableHead>
                  <TableHead className="text-[10px] text-right w-[50px]">Doses</TableHead>
                  <TableHead className="text-[10px] w-[50px]">Ord.</TableHead>
                  <TableHead className="text-[10px] w-[44px]">Ativo</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-16"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                ) : !data || data.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground h-16 italic">Nenhum volume cadastrado.</TableCell></TableRow>
                ) : data.map((v) => (
                  TENANT_CAN_EDIT_GLOBAL_CATALOG
                    ? <EditableRow key={v.id} v={v} baseLitro={baseLitro} onSave={(nv) => update.mutate(nv)} onDelete={() => remove.mutate(v.id)} />
                    : <ReadOnlyVolumeRow key={v.id} v={v} />
                ))}
              </TableBody>
            </Table>
          </div>

          {TENANT_CAN_EDIT_GLOBAL_CATALOG && (
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adicionar volume</div>
              {baseLitro > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  Base ficha: <strong className="text-foreground">{brl(baseLitro)}/L</strong>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground italic">
                  Cadastre o <strong>Valor por litro</strong> na ficha técnica para preencher os preços automaticamente.
                </div>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {SUGESTOES.map((ml) => (
                <Button key={ml} type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                  onClick={() => aplicarSugestao(ml)}>
                  {fmtL(ml)}
                  {baseLitro > 0 && (
                    <span className="ml-1 text-muted-foreground">· {brl(calcPrecoFromLitro(ml, baseLitro))}</span>
                  )}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[110px]">
                <Label className="text-xs">Volume (mL)</Label>
                <Input type="number" min={1} value={novo.volume_ml}
                  onChange={(e) => onVolumeChange(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Rótulo (opcional)</Label>
                <Input placeholder="ex: 1 L" value={novo.rotulo}
                  onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Preço</Label>
                <MoneyInput allowEmpty value={novo.preco_brl}
                  onValueChange={(v) => { setPrecoTocado(true); setNovo({ ...novo, preco_brl: v == null ? "" : String(v) }); }} />
              </div>
              <div className="w-[70px]">
                <Label className="text-xs">Ordem</Label>
                <Input type="number" value={novo.ordem}
                  onChange={(e) => setNovo({ ...novo, ordem: e.target.value })} />
              </div>
              <div className="min-w-[140px]">
                <Button type="button" className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
            </div>
            {novo.volume_ml && novo.preco_brl && Number(novo.volume_ml) > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Prévia: {fmtL(Number(novo.volume_ml))} — {brl(Number(novo.preco_brl))} · {formatPrecoLitro({ volume_ml: Number(novo.volume_ml), preco_brl: Number(novo.preco_brl) })} · {formatDose100ml({ volume_ml: Number(novo.volume_ml), preco_brl: Number(novo.preco_brl) })} · {dosesPorVolume({ volume_ml: Number(novo.volume_ml) })} doses
              </div>
            )}
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditableRow({ v, baseLitro, onSave, onDelete }: { v: CatalogoVolume; baseLitro: number; onSave: (v: CatalogoVolume) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState(v);
  useEffect(() => setEdit(v), [v.id, v.volume_ml, v.preco_brl, v.rotulo, v.ordem, v.ativo]);
  const dirty = edit.volume_ml !== v.volume_ml || edit.preco_brl !== v.preco_brl || (edit.rotulo ?? "") !== (v.rotulo ?? "") || edit.ordem !== v.ordem || edit.ativo !== v.ativo;
  return (
    <TableRow>
      <TableCell><Input type="number" className="h-7 w-16 text-xs px-1.5" value={edit.volume_ml} onChange={(e) => setEdit({ ...edit, volume_ml: Number(e.target.value) })} /></TableCell>
      <TableCell><Input className="h-7 w-20 text-xs px-1.5" value={edit.rotulo ?? ""} placeholder={fmtL(edit.volume_ml)} onChange={(e) => setEdit({ ...edit, rotulo: e.target.value })} /></TableCell>
      <TableCell className="text-right"><MoneyInput className="h-7 w-28 text-xs px-1.5" value={edit.preco_brl} onValueChange={(v) => setEdit({ ...edit, preco_brl: Number(v ?? 0) })} /></TableCell>
      <TableCell className="text-right text-[10px] text-muted-foreground leading-tight">
        <div className="whitespace-nowrap">{formatPrecoLitro(edit)}</div>
        <div className="whitespace-nowrap">{formatDose100ml(edit)}</div>
      </TableCell>
      <TableCell className="text-right text-[11px] text-muted-foreground">{Math.round(dosesPorVolume(edit))}</TableCell>
      <TableCell><Input type="number" className="h-7 w-12 text-xs px-1.5" value={edit.ordem} onChange={(e) => setEdit({ ...edit, ordem: Number(e.target.value) })} /></TableCell>
      <TableCell><Switch checked={edit.ativo} onCheckedChange={(c) => setEdit({ ...edit, ativo: c })} /></TableCell>
      <TableCell>
        <div className="flex gap-0.5 justify-end">
          {dirty && <Button size="sm" variant="outline" className="h-7 px-1.5 text-[10px]" onClick={() => onSave(edit)}>Salvar</Button>}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReadOnlyVolumeRow({ v }: { v: CatalogoVolume }) {
  return (
    <TableRow>
      <TableCell className="text-xs">{v.volume_ml}</TableCell>
      <TableCell className="text-xs">{v.rotulo || fmtL(v.volume_ml)}</TableCell>
      <TableCell className="text-right text-xs">{brl(Number(v.preco_brl))}</TableCell>
      <TableCell className="text-right text-[10px] text-muted-foreground leading-tight">
        <div className="whitespace-nowrap">{formatPrecoLitro(v)}</div>
        <div className="whitespace-nowrap">{formatDose100ml(v)}</div>
      </TableCell>
      <TableCell className="text-right text-[11px] text-muted-foreground">{Math.round(dosesPorVolume(v))}</TableCell>
      <TableCell className="text-xs">{v.ordem}</TableCell>
      <TableCell className="text-xs">{v.ativo ? "Ativo" : "Inativo"}</TableCell>
      <TableCell />
    </TableRow>
  );
}
