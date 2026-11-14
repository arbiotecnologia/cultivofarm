import { TENANT_CAN_EDIT_GLOBAL_CATALOG, GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { usePackagingAdminRead } from "@/hooks/usePackagingAdmin";
import { SolidPresentations } from "./SolidPresentations";
import { useTenantProductVolumes, useSaveTenantProductVolume } from "@/hooks/useTenantProductVolumes";
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
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string;
  itemTipo: "produto" | "microrganismo";
  itemNome: string;
  /** Valor por litro cadastrado na ficha técnica (R$). Usado para auto-preencher o preço de cada volume. */
  valorLitroBase?: number | null;
  /** Item próprio: apresentações são gravadas pelo RPC transacional, nunca por DML direto. */
  owned?: boolean;
  parentUpdatedAt?: string | null;
}

const SUGESTOES = [100, 250, 500, 1000, 5000, 20000];

const calcPrecoFromLitro = (volumeMl: number, valorLitro: number) =>
  Number(((volumeMl / 1000) * valorLitro).toFixed(2));

export function CatalogoVolumesDialog({ open, onOpenChange, itemId, itemTipo, itemNome, valorLitroBase, owned = false }: Props) {
  const qc = useQueryClient();
  const baseLitro = valorLitroBase && valorLitroBase > 0 ? Number(valorLitroBase) : 0;
  const [novo, setNovo] = useState({ volume_ml: "", rotulo: "", preco_brl: "", ordem: "0" });
  const [precoTocado, setPrecoTocado] = useState(false);
  const editor = useTenantCatalogEditor();
  const packaging = usePackagingAdminRead(itemId, owned && open && itemTipo === "produto" && editor.canEdit);
  const solid = packaging.data?.unidade_conteudo === "kg" || packaging.data?.unidade_conteudo === "g";
  const unitKnown = packaging.isSuccess && packaging.data?.unidade_conteudo != null;
  // Existing tenant RLS reader stays independent of administrative unit metadata.
  const tenantVolumes = useTenantProductVolumes(itemId, owned && open && itemTipo === "produto");
  const instanceKey = JSON.stringify([itemId, itemTipo, editor.scope, open, editor.canEdit, solid]);
  const instance = useRef({ key: instanceKey, epoch: 0, locked: false });
  if (instance.current.key !== instanceKey) instance.current = { key: instanceKey, epoch: instance.current.epoch + 1, locked: false };
  const epoch = instance.current.epoch;
  const [, renderLock] = useState(0);
  const setPackLocked = useCallback((locked: boolean) => {
    if (instance.current.epoch !== epoch) return;
    instance.current.locked = locked; renderLock(value => value + 1);
  }, [epoch]);
  const tenantSave = useSaveTenantProductVolume();
  const ownedWritable = owned && itemTipo === "produto" && editor.canEdit && unitKnown && !solid;
  const frozenScope = useRef("");
  const scopeKey = editor.scope;

  const globalRead = useScopedPortalQuery({
    queryKey: ["catalogo-volumes-item", itemTipo, itemId],
    enabled: open && !!itemId && !owned,
    queryFn: async signal => {
      const col = itemTipo === "produto" ? "produto_id" : "microrganismo_id";
      const { data, error } = await supabase
        .from("catalogo_volumes" as any)
        .select("*")
        .eq(col, itemId)
        .order("ordem", { ascending: true })
        .order("volume_ml", { ascending: true }).abortSignal(signal);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        volume_ml: Number(r.volume_ml),
        preco_brl: Number(r.preco_brl),
        ordem: Number(r.ordem ?? 0),
      })) as CatalogoVolume[];
    },
  });

  const data = owned ? (solid ? [] : tenantVolumes.data) : globalRead.data;
  const isLoading = owned ? tenantVolumes.isLoading : globalRead.isLoading;
  const readError = owned ? tenantVolumes.error : globalRead.error;
  useEffect(() => {
    if (open) { frozenScope.current = scopeKey; }
    // Freeze scope only at opening; a new scope must close the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId]);
  useEffect(() => { if (open && owned && frozenScope.current !== scopeKey) onOpenChange(false); }, [scopeKey, open, owned, onOpenChange]);
  useEffect(() => {
    if (!open) {
      setNovo({ volume_ml: "", rotulo: "", preco_brl: "", ordem: "0" });
      setPrecoTocado(false);
    }
  }, [open]);

  const invalidate = () => {
    if (owned) return tenantVolumes.refetch();
    return Promise.all([qc.invalidateQueries({ queryKey: ["catalogo-volumes-item", itemTipo, itemId] }),
      qc.invalidateQueries({ queryKey: ["catalogo-volumes"] })]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const vol = Number(novo.volume_ml);
      const preco = Number(novo.preco_brl);
      if (!vol || vol <= 0) throw new Error("Volume inválido");
      if (!Number.isFinite(preco) || preco < 0) throw new Error("Preço inválido");
      const payload: any = {
        item_tipo: itemTipo,
        produto_id: itemTipo === "produto" ? itemId : null,
        microrganismo_id: itemTipo === "microrganismo" ? itemId : null,
        volume_ml: vol,
        rotulo: novo.rotulo.trim() || null,
        preco_brl: preco,
        ordem: Number(novo.ordem) || 0,
      };
      if (owned) {
        if (!ownedWritable) throw new Error("Apresentações próprias ainda não estão disponíveis.");
        return tenantSave.mutateAsync({ id: null, productId: itemId, expectedUpdatedAt: null,
          payload: { volume_ml: vol, rotulo: payload.rotulo, preco_brl: preco, ordem: payload.ordem } });
      }
      assertGlobalCatalogWriteBlocked();
      const { error } = await supabase.from("catalogo_volumes" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Volume adicionado");
      setNovo({ volume_ml: "", rotulo: "", preco_brl: "", ordem: "0" });
      setPrecoTocado(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (v: CatalogoVolume) => {
      if (owned) {
        if (!ownedWritable || !v.updated_at) throw new Error("Apresentação própria sem versão confirmada.");
        return tenantSave.mutateAsync({ id: v.id, productId: itemId, expectedUpdatedAt: v.updated_at ?? null,
          payload: { volume_ml: v.volume_ml, rotulo: v.rotulo, preco_brl: v.preco_brl, ordem: v.ordem, ativo: v.ativo } });
      }
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
    onSuccess: async () => { await invalidate(); toast.success("Atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (volume: CatalogoVolume) => {
      if (owned) {
        if (!ownedWritable || !volume.updated_at) throw new Error("Apresentação própria sem versão confirmada.");
        throw new Error("Exclusão não disponível. Desative o volume e salve para preservar o histórico.");
      }
      assertGlobalCatalogWriteBlocked();
      const { error } = await supabase.from("catalogo_volumes" as any).delete().eq("id", volume.id);
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
    <Dialog open={open} onOpenChange={value => { if (!value && instance.current.epoch === epoch && instance.current.locked) { toast.error("Retome a tentativa original antes de fechar."); return; } onOpenChange(value); }}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Apresentações do produto</DialogTitle>
          <DialogDescription>
            {owned
              ? <>{itemNome} · apresentações comerciais próprias, com preço e histórico auditável.</>
              : TENANT_CAN_EDIT_GLOBAL_CATALOG
              ? <>{itemNome} · cadastre os volumes comerciais com preço — usados para o cliente comparar R$/L. Não confunda com envase (formato de entrega).</>
              : <>{itemNome} · modo consulta: volumes comerciais do catálogo, usados para comparar R$/L. Não confunda com envase (formato de entrega).</>}
          </DialogDescription>
        </DialogHeader>

        {owned && !unitKnown && <p role="status">Unidade do produto não confirmada. Referências existentes em consulta; solicite ao administrador a configuração de kg, g, mL ou L. Peso e volume não são inferidos.</p>}
        {solid && packaging.data ? <SolidPresentations key={`${itemId}:${scopeKey}:${epoch}`} state={packaging.data} active={open && frozenScope.current === scopeKey} onLockChange={setPackLocked} /> : <div className="space-y-4 min-w-0">
          <div className="border rounded-md w-full">
            <Table className="min-w-[640px] text-xs [&_th]:px-1.5 [&_td]:px-1.5 [&_th]:h-8 [&_td]:py-1.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">{ownedWritable ? "Vol (mL)" : "Apresentação"}</TableHead>
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
                {readError ? <TableRow><TableCell colSpan={8} role="alert">Não foi possível carregar as apresentações.</TableCell></TableRow> : isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-16"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                ) : !data || data.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground h-16 italic">Nenhum volume cadastrado.</TableCell></TableRow>
                ) : data.map((v) => (
                  (TENANT_CAN_EDIT_GLOBAL_CATALOG || ownedWritable)
                    ? <EditableRow key={v.id} v={v} baseLitro={baseLitro} onSave={(nv) => update.mutate(nv)} onDelete={owned ? undefined : () => remove.mutate(v)} disabled={tenantSave.isPending} />
                    : <ReadOnlyVolumeRow key={v.id} v={v} compatibility={owned && !unitKnown} />
                ))}
              </TableBody>
            </Table>
          </div>

          {(TENANT_CAN_EDIT_GLOBAL_CATALOG || ownedWritable) && (
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
                <Button type="button" className="w-full" onClick={() => create.mutate()} disabled={create.isPending || tenantSave.isPending}>
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
        </div>}
      </DialogContent>
    </Dialog>
  );
}

function EditableRow({ v, baseLitro, onSave, onDelete, disabled }: { v: CatalogoVolume; baseLitro: number; onSave: (v: CatalogoVolume) => void; onDelete?: () => void; disabled?: boolean }) {
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
          {dirty && <Button size="sm" variant="outline" className="h-7 px-1.5 text-[10px]" onClick={() => onSave(edit)} disabled={disabled}>Salvar</Button>}
          {onDelete && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDelete} disabled={disabled}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReadOnlyVolumeRow({ v, compatibility = false }: { v: CatalogoVolume; compatibility?: boolean }) {
  const packaging = (v as unknown as { medida?: string }).medida === "embalagem";
  const literal = compatibility || packaging;
  return (
    <TableRow>
      <TableCell className="text-xs">{packaging ? "Embalagem" : v.volume_ml}</TableCell>
      <TableCell className="text-xs">{v.rotulo || (literal ? "Referência cadastrada" : fmtL(v.volume_ml))}</TableCell>
      <TableCell className="text-right text-xs">{packaging ? "—" : brl(Number(v.preco_brl))}</TableCell>
      <TableCell className="text-right text-[10px] text-muted-foreground leading-tight">
        <div className="whitespace-nowrap">{literal ? "—" : formatPrecoLitro(v)}</div>
        <div className="whitespace-nowrap">{literal ? "—" : formatDose100ml(v)}</div>
      </TableCell>
      <TableCell className="text-right text-[11px] text-muted-foreground">{literal ? "—" : Math.round(dosesPorVolume(v))}</TableCell>
      <TableCell className="text-xs">{v.ordem}</TableCell>
      <TableCell className="text-xs">{v.ativo ? "Ativo" : "Inativo"}</TableCell>
      <TableCell />
    </TableRow>
  );
}
